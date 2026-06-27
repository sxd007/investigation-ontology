#!/usr/bin/env python3
"""
scan-chain.py — 证据链编译与完整性检查工具 (v2)

职责:
  1. 从 nodes/ 目录读取所有节点，编译带类型标注的关系图
  2. 追溯证据链（从 finding 到原始证据，按关系类型分组）
  3. 推理链逻辑完整性检查（EV→LS→ARG→FND）
  4. 同步 chain_nodes 索引回 evidence_registry.json

关系模型 (v2):
  所有关系通过节点 frontmatter 的 relations 字段声明:
  - derived_from:   推导自/来源于（推理链上游）
  - supports:       支撑/支持（逻辑下游）
  - contradicts:    反驳/矛盾
  - involves:       涉及实体
  - corroborated_by:被印证（仅 EV）
  - addresses:      应对竞争假设（仅 HYP）

使用:
  scan-chain.py cases/CASE-2026-001/ --list
  scan-chain.py cases/CASE-2026-001/ --trace FND-001
  scan-chain.py cases/CASE-2026-001/ --integrity
  scan-chain.py cases/CASE-2026-001/ --check-chains
  scan-chain.py cases/CASE-2026-001/ --sync
  scan-chain.py cases/CASE-2026-001/ --graph          # Mermaid 图（对话内快速预览）
  scan-chain.py cases/CASE-2026-001/ --html output.html  # 交互式 HTML（需要 Node.js）
"""

from pathlib import Path
import json
import re
import sys
import argparse
from datetime import datetime, timezone
from typing import Optional


# ── 节点类型定义 ──

NODE_TYPES = {
    "EV": "evidence",
    "LS": "clue",
    "ARG": "argument",
    "FND": "finding",
    "ENT": "entity",
    "HYP": "hypothesis",
    "EVT": "event",
}

VALID_STATUSES = {"draft", "ready", "superseded"}

RELATION_TYPES = {
    "derived_from", "supports", "contradicts",
    "involves", "corroborated_by", "addresses",
}

# 推理链规则
CHAIN_RULES = {
    "clue":    {"allowed_prefixes": {"EV"},           "min_sources": 1},
    "argument":{"allowed_prefixes": {"LS", "ARG"},    "min_sources": 1},
    "finding": {"allowed_prefixes": {"ARG"},          "min_sources": 1},
}


# ── 工具函数 ──

def strip_quotes(val: str) -> str:
    val = val.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
        return val[1:-1]
    return val


def exerpt_to_html(text: str) -> str:
    """简单的 excerpt 清理，用于 Mermaid 标签等场景。"""
    return text.replace('"', "'")[:40]


# ── YAML Frontmatter 解析器 ──

def parse_frontmatter(filepath: Path) -> Optional[dict]:
    """解析 markdown 文件 YAML frontmatter。

    支持:
    - key: scalar
    - key: [list]
    - key: []  (空列表)
    - 缩进列表 (- id: xxx 格式)
    - 嵌套字典（relations: type: [...]）
    """
    try:
        content = filepath.read_text(encoding="utf-8")
    except Exception as e:
        print(f"  [WARN] 无法读取 {filepath}: {e}", file=sys.stderr)
        return None

    if not content.startswith("---"):
        return None
    end = content.find("---", 3)
    if end == -1:
        return None

    raw = content[3:end].strip()
    lines = raw.split("\n")

    result = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        indent = len(line) - len(line.lstrip())
        stripped = line.strip()
        i += 1

        if not stripped or stripped.startswith("#"):
            continue

        top_match = re.match(r"^(\w[\w_]*):\s*(.*)", stripped)
        if not top_match:
            continue

        key = top_match.group(1)
        val = top_match.group(2).strip()

        # 内联 JSON 数组: key: [val1, val2]
        if val.startswith("[") and val.endswith("]"):
            result[key] = _parse_inline_list(val)
            continue

        # 空列表标记: key: []
        if val == "[]":
            result[key] = []
            continue

        # 空值 → 后续缩进行是子内容
        if val == "" or val == "|":
            sub_lines = _collect_indented(lines, i, indent)
            i += len(sub_lines)

            if sub_lines and not sub_lines[0].strip().startswith("- "):
                # 嵌套字典（如 relations: derived_from: ...）
                result[key] = _parse_nested_dict(sub_lines)
            else:
                # 值列表（如 sources: - id: xxx）
                result[key] = _parse_list_items(sub_lines)
            continue

        # 普通标量值
        result[key] = strip_quotes(val)

    return result


def _parse_inline_list(val: str) -> list:
    items = []
    for item in val[1:-1].split(","):
        item = item.strip().strip('"').strip("'")
        if item:
            items.append(item)
    return items


def _collect_indented(lines: list, start: int, base_indent: int) -> list:
    collected = []
    for line in lines[start:]:
        if not line.strip() or line.strip().startswith("#"):
            collected.append(line)
            continue
        if len(line) - len(line.lstrip()) <= base_indent:
            break
        collected.append(line)
    return collected


def _parse_list_items(lines: list) -> list:
    items = []
    current_obj = None

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        lst = re.match(r"^- (.+)", stripped)
        if lst:
            if current_obj is not None:
                items.append(current_obj)
            content = lst.group(1)
            kv = re.match(r"^(\w[\w_]*):\s*(.*)", content)
            if kv:
                current_obj = {kv.group(1): strip_quotes(kv.group(2).strip())}
            else:
                items.append(strip_quotes(content))
                current_obj = None
            continue

        sub = re.match(r"^(\w+):\s*(.*)", stripped)
        if sub and current_obj is not None:
            current_obj[sub.group(1)] = strip_quotes(sub.group(2).strip())
            continue

    if current_obj is not None:
        items.append(current_obj)
    return items


def _parse_nested_dict(lines: list) -> dict:
    """解析嵌套字典，支持子键含列表（如 relations: derived_from: - id: ...）。

    输入是从 collect_indented 收集的缩进行。
    """
    result = {}
    current_key = None
    current_list = None
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        i += 1

        if not stripped or stripped.startswith("#"):
            continue

        # 子键: key: value
        sm = re.match(r"^(\w[\w_]*):\s*(.*)", stripped)
        if sm:
            if current_key is not None and current_list is not None:
                result[current_key] = current_list
            current_key = sm.group(1)
            val = sm.group(2).strip()

            if val == "[]":
                current_list = []
            elif val.startswith("[") and val.endswith("]"):
                current_list = _parse_inline_list(val)
            elif val == "" or val == "|":
                # 子键的列表在后续缩进行中
                current_list = []
            else:
                current_list = [strip_quotes(val)]
            continue

        # 列表元素: - id: xxx 或 - "value"
        lst = re.match(r"^- (.+)", stripped)
        if lst and current_key is not None and current_list is not None:
            content = lst.group(1)
            kv = re.match(r"^(\w[\w_]*):\s*(.*)", content)
            if kv:
                obj = {kv.group(1): strip_quotes(kv.group(2).strip())}
                current_list.append(obj)
                # 收集子字段（excerpt, form 等）——仅在更深缩进层
                item_indent = len(line) - len(line.lstrip())
                while i < len(lines):
                    nxt_stripped = lines[i].strip()
                    if not nxt_stripped or nxt_stripped.startswith("#"):
                        i += 1
                        continue
                    nxt_indent = len(lines[i]) - len(lines[i].lstrip())
                    # 缩进 ≤ 列表项缩进 → 结束子字段收集
                    if nxt_indent <= item_indent:
                        break
                    sub = re.match(r"^(\w+):\s*(.*)", nxt_stripped)
                    if sub and isinstance(current_list[-1], dict):
                        current_list[-1][sub.group(1)] = strip_quotes(sub.group(2).strip())
                        i += 1
                    else:
                        break
            else:
                current_list.append(strip_quotes(content))

    if current_key is not None and current_list is not None:
        result[current_key] = current_list
    return result


def read_json_node(filepath: Path) -> Optional[dict]:
    try:
        return json.loads(filepath.read_text(encoding="utf-8"))
    except Exception:
        return None


# ── 关系归一化 ──

def normalize_relations(meta: dict) -> dict:
    raw = meta.get("relations", {})
    if not isinstance(raw, dict):
        return {}
    out = {}
    for rt, vals in raw.items():
        if not isinstance(vals, list):
            continue
        cleaned = []
        for v in vals:
            if isinstance(v, str):
                cleaned.append(v)
            elif isinstance(v, dict) and v.get("id"):
                cleaned.append(v)
        out[rt] = cleaned
    return out


def flat_ids(relations: dict, rel_type: str = None) -> list:
    ids = []
    types = [rel_type] if rel_type else relations.keys()
    for t in types:
        for item in relations.get(t, []):
            if isinstance(item, str):
                ids.append(item)
            elif isinstance(item, dict):
                ids.append(item.get("id", ""))
    return [i for i in ids if i]


# ── 节点加载 ──

def load_all_nodes(case_dir: Path) -> list[dict]:
    nodes_dir = case_dir / "nodes"
    if not nodes_dir.is_dir():
        print(f"  [WARN] nodes/ 目录不存在: {nodes_dir}", file=sys.stderr)
        return []

    nodes = []
    for fpath in sorted(nodes_dir.iterdir()):
        if fpath.is_dir():
            continue
        meta = parse_frontmatter(fpath) or read_json_node(fpath)
        if not meta:
            continue

        node_id = meta.get("id", "")
        node_type = meta.get("type", "")
        status = meta.get("status", "draft")
        if not node_id or not node_type:
            continue

        nodes.append({
            "id": node_id,
            "type": node_type,
            "status": status,
            "relations": normalize_relations(meta),
            "has_old_sources": "sources" in meta,
            "file": str(fpath.relative_to(case_dir)),
        })
    return nodes


# ── 图构建 ──

def build_graph(nodes: list[dict]) -> dict:
    all_nodes = {n["id"]: n for n in nodes}
    upstream = {}
    downstream = {}

    for n in nodes:
        nid = n["id"]
        upstream[nid] = []
        downstream.setdefault(nid, [])

        for rt, items in n["relations"].items():
            for item in items:
                tid = item["id"] if isinstance(item, dict) else item
                if not tid:
                    continue
                upstream[nid].append({
                    "id": tid,
                    "relation_type": rt,
                    "excerpt": item.get("excerpt", "") if isinstance(item, dict) else "",
                })
                if rt in ("derived_from", "supports"):
                    downstream.setdefault(tid, []).append({
                        "id": nid,
                        "relation_type": rt,
                    })

    return {"all": all_nodes, "upstream": upstream, "downstream": downstream}


# ── 索引同步 ──

def sync_chain_index(case_dir: Path, nodes: list[dict]) -> dict:
    registry_path = case_dir / "evidence_registry.json"
    if not registry_path.exists():
        print("  [ERROR] evidence_registry.json 不存在", file=sys.stderr)
        return {"added": [], "removed": [], "updated": []}

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    existing = {n["id"]: n for n in registry.get("chain_nodes", [])}

    file_index = {}
    for node in nodes:
        nid = node["id"]
        old = existing.get(nid, {})
        file_index[nid] = {"id": nid, "type": node["type"],
                           "status": old.get("status", node["status"])}

    current_ids = set(existing.keys())
    file_ids = set(file_index.keys())

    added = list(file_ids - current_ids)
    removed = list(current_ids - file_ids)
    updated = []
    for nid in file_ids & current_ids:
        if existing[nid] != file_index[nid]:
            updated.append(nid)

    new_index = [file_index[nid] for nid in sorted(file_index.keys())]
    registry["chain_nodes"] = new_index
    registry["metadata"]["last_updated"] = datetime.now(timezone.utc).isoformat() + "Z"
    registry_path.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"added": added, "removed": removed, "updated": updated}


# ── 图遍历 ──

def trace_chain(nodes: list[dict], target_id: str) -> Optional[dict]:
    graph = build_graph(nodes)
    if target_id not in graph["all"]:
        return None

    visited = set()
    chain = []

    def dfs(nid: str, depth: int = 0):
        if nid in visited or depth > 20:
            return
        visited.add(nid)
        node = graph["all"].get(nid, {})
        chain.append({"id": nid, "type": node.get("type", "unknown"),
                      "status": node.get("status", "draft"), "file": node.get("file", "")})
        for ref in graph["upstream"].get(nid, []):
            if ref["relation_type"] == "derived_from":
                dfs(ref["id"], depth + 1)

    dfs(target_id)
    tree = _build_tree(target_id, graph, set(), 0)
    return {"root": target_id, "nodes": chain, "tree": tree}


def _build_tree(nid: str, graph: dict, visited: set, depth: int) -> dict:
    if nid in visited or depth > 20:
        return {"id": nid, "pruned": True}
    visited.add(nid)
    node = graph["all"].get(nid, {})
    children = []
    for ref in graph["upstream"].get(nid, []):
        if ref["relation_type"] == "derived_from":
            children.append(_build_tree(ref["id"], graph, visited.copy(), depth + 1))
    return {"id": nid, "type": node.get("type", "unknown"),
            "status": node.get("status", "draft"), "children": children}


# ── 完整性检查 ──

def check_integrity(nodes: list[dict]) -> list[dict]:
    issues = []
    all_ids = {n["id"] for n in nodes}
    status_map = {n["id"]: n["status"] for n in nodes}
    graph = build_graph(nodes)

    # 废弃 sources
    for n in nodes:
        if n.get("has_old_sources"):
            issues.append({"severity": "WARN", "type": "deprecated_sources",
                           "message": f"{n['id']} 使用了已废弃的 'sources' 字段，应改用 'relations'",
                           "node": n["id"]})

    # ready 依赖 draft
    for n in nodes:
        if n["type"] not in ("finding", "argument") or n["status"] != "ready":
            continue
        for ref_id in flat_ids(n["relations"]):
            if ref_id in status_map and status_map[ref_id] != "ready":
                issues.append({"severity": "WARN", "type": "draft_dependency",
                               "message": f"{n['id']} (ready) 依赖 {ref_id} (status: {status_map[ref_id]})",
                               "node": n["id"], "depends_on": ref_id})

    # 缺失引用
    for n in nodes:
        for ref_id in flat_ids(n["relations"]):
            if ref_id not in all_ids:
                sev = "ERROR" if n["type"] in ("finding", "argument") else "WARN"
                issues.append({"severity": sev, "type": "missing_source",
                               "message": f"{n['id']} 引用不存在的节点 {ref_id}",
                               "node": n["id"], "depends_on": ref_id})

    # FND 直引 EV
    for n in nodes:
        if n["type"] != "finding":
            continue
        for ref_id in flat_ids(n["relations"], "derived_from"):
            if ref_id.startswith("EV-"):
                issues.append({"severity": "INFO", "type": "direct_evidence_ref",
                               "message": f"{n['id']} 直接引用 EV-，建议通过 ARG 节点",
                               "node": n["id"], "depends_on": ref_id})

    # 孤立
    for n in nodes:
        if n["type"] in ("evidence", "entity", "hypothesis", "event"):
            continue
        has_up = len(graph["upstream"].get(n["id"], [])) > 0
        has_down = len(graph["downstream"].get(n["id"], [])) > 0
        if not has_up and not has_down:
            issues.append({"severity": "INFO", "type": "orphan_node",
                           "message": f"{n['id']} 无上下游关联", "node": n["id"]})

    return issues


# ── 推理链检查 ──

def check_chains(nodes: list[dict]) -> list[dict]:
    issues = []
    all_ids = {n["id"] for n in nodes}
    node_map = {n["id"]: n for n in nodes}

    # 1. 类型检查
    for n in nodes:
        rules = CHAIN_RULES.get(n["type"])
        if not rules:
            continue
        derived = flat_ids(n["relations"], "derived_from")
        allowed = rules["allowed_prefixes"]
        min_src = rules["min_sources"]

        if len(derived) < min_src:
            issues.append({"severity": "ERROR" if min_src > 0 else "INFO",
                           "type": "chain_insufficient_sources",
                           "message": f"{n['id']} ({n['type']}) derived_from \
应 ≥{min_src} 个，实际 {len(derived)} 个",
                           "node": n["id"]})

        for ref_id in derived:
            if ref_id not in all_ids:
                continue
            prefix = ref_id.split("-")[0]
            if prefix not in allowed:
                issues.append({"severity": "WARN", "type": "chain_type_mismatch",
                               "message": f"{n['id']} ({n['type']}) derived_from \
{ref_id} 应为 {allowed} 类型，实际为 {prefix}",
                               "node": n["id"], "depends_on": ref_id})

    # 2. 循环引用
    graph = {}
    for n in nodes:
        graph[n["id"]] = [d for d in flat_ids(n["relations"], "derived_from") if d in all_ids]

    visited = set()
    path_stack = set()

    def detect_cycle(nid: str) -> Optional[list]:
        if nid in path_stack:
            return [nid]
        if nid in visited:
            return None
        visited.add(nid)
        path_stack.add(nid)
        for nb in graph.get(nid, []):
            res = detect_cycle(nb)
            if res is not None:
                path_stack.discard(nid)
                return [nid] + res if res[0] != nb else [nb, nid]
        path_stack.discard(nid)
        return None

    for nid in list(graph.keys()):
        cycle = detect_cycle(nid)
        if cycle:
            deduped = list(dict.fromkeys(cycle))
            issues.append({"severity": "ERROR", "type": "chain_cycle",
                           "message": f"derived_from 循环: {' → '.join(deduped)}",
                           "node": deduped[0]})

    # 3. 冲突：supports ∧ contradicts 同一目标
    sup = set()
    cnt = set()
    for n in nodes:
        for ref in flat_ids(n["relations"], "supports"):
            sup.add((n["id"], ref))
        for ref in flat_ids(n["relations"], "contradicts"):
            cnt.add((n["id"], ref))
    for pair in sup & cnt:
        issues.append({"severity": "WARN", "type": "chain_conflict",
                       "message": f"{pair[0]} 同时对 {pair[1]} 标记 supports 和 contradicts",
                       "node": pair[0], "depends_on": pair[1]})

    return issues


# ── 节点验证 ──

REQUIRED_FIELDS = {
    "evidence": ["id", "type", "status"],
    "clue": ["id", "type", "status"],
    "argument": ["id", "type", "status", "proposition"],
    "finding": ["id", "type", "status", "statement", "confidence"],
    "entity": ["id", "type", "entity_type", "name"],
    "hypothesis": ["id", "type", "statement", "status"],
    "event": ["id", "type", "title", "moment", "time_type"],
}

VALID_TYPES = {"evidence", "clue", "argument", "finding", "entity", "hypothesis", "event"}
ID_PATTERN = re.compile(r"^(EV|LS|ARG|FND|ENT|HYP|EVT)-\d{3,}$")

VALID_STATUS_HYP = {"active", "rejected", "confirmed", ""}
VALID_STATUS_GEN = {"draft", "ready", "superseded", ""}

ID_PREFIX_MAP = {
    "evidence": "EV", "clue": "LS", "argument": "ARG",
    "finding": "FND", "entity": "ENT", "hypothesis": "HYP", "event": "EVT",
}


def validate_node_file(case_dir: Path, rel_path: str) -> list[dict]:
    errors = []
    fpath = case_dir / rel_path
    if not fpath.exists():
        return [{"severity": "ERROR", "type": "file_not_found", "message": f"{rel_path}: 不存在"}]

    meta = read_json_node(fpath) if fpath.suffix == ".json" else parse_frontmatter(fpath)
    if not meta:
        return [{"severity": "ERROR", "type": "unparseable", "message": f"{rel_path}: 无法解析"}]

    nid = meta.get("id", "")
    ntype = meta.get("type", "")

    if not ID_PATTERN.match(nid):
        errors.append({"severity": "ERROR", "type": "invalid_id",
                       "message": f"{rel_path}: ID '{nid}' 格式不符"})
    if ntype not in VALID_TYPES:
        errors.append({"severity": "ERROR", "type": "invalid_type",
                       "message": f"{rel_path}: 无效类型 '{ntype}'"})
        return errors

    for field in REQUIRED_FIELDS.get(ntype, []):
        val = meta.get(field)
        if val is None or val == "" or val == []:
            errors.append({"severity": "ERROR", "type": "missing_field",
                           "message": f"{rel_path}: 缺少必填字段 '{field}'"})

    prefix = nid.split("-")[0]
    if prefix != ID_PREFIX_MAP.get(ntype, ""):
        errors.append({"severity": "WARN", "type": "prefix_mismatch",
                       "message": f"{rel_path}: 前缀 '{prefix}' 与类型 '{ntype}' 不匹配"})

    status = meta.get("status", "")
    valid = VALID_STATUS_HYP if ntype == "hypothesis" else VALID_STATUS_GEN
    if status and status not in valid:
        errors.append({"severity": "WARN", "type": "invalid_status",
                       "message": f"{rel_path}: 无效状态 '{status}'（应为 {valid - {''}}）"})

    if "sources" in meta:
        errors.append({"severity": "WARN", "type": "deprecated_field",
                       "message": f"{rel_path}: 'sources' 已废弃，请改用 'relations'"})

    return errors


def validate_nodes(case_dir: Path, nodes: list[dict]) -> list[dict]:
    errors = []
    seen = {}
    for n in nodes:
        errors.extend(validate_node_file(case_dir, n.get("file", "")))
        nid = n["id"]
        if nid in seen:
            errors.append({"severity": "ERROR", "type": "duplicate_id",
                           "message": f"ID '{nid}' 重复: {seen[nid]} 和 {n['file']}"})
        seen[nid] = n["file"]
    return errors


# ── 输出格式 ──

def format_tree(tree: dict, indent: int = 0) -> str:
    prefix = "  " * indent
    mark = "✓" if tree.get("status") == "ready" else "!"
    if tree.get("pruned"):
        return f"{prefix}  └─ {tree['id']} [...] (截断)\n"
    line = f"{prefix}  └─ {tree['id']} ({tree.get('type','?')}) [{mark}]\n"
    for c in tree.get("children", []):
        line += format_tree(c, indent + 1)
    return line


LABEL_MAP = {
    "derived_from": "derive", "supports": "support",
    "contradicts": "contradict", "involves": "involve",
    "corroborated_by": "corroborate", "addresses": "address",
    "supported_by": "sup_by", "contradicted_by": "cntd_by",
}


def format_mermaid(nodes: list[dict]) -> str:
    lines = ["graph TD"]
    for n in nodes:
        nid = n["id"]
        for rt, items in n["relations"].items():
            for item in items:
                tid = item["id"] if isinstance(item, dict) else item
                if not tid:
                    continue
                label = LABEL_MAP.get(rt, rt)
                lines.append(f"  {tid} -->|{label}| {nid}")
    return "\n".join(lines)


# ── HTML 可视化（调用 evidence_chain_injector.js）──

def _run_html_injector(case_dir: Path, output: str) -> None:
    """调用 evidence_chain_injector.js 生成交互式 HTML。"""
    import subprocess
    injector = Path(__file__).parent.parent / "templates" / "evidence-chain-viz" / "evidence_chain_injector.js"
    if not injector.exists():
        print(f"  [ERROR] 未找到 {injector}", file=sys.stderr)
        print("  HTML 可视化需要 templates/evidence-chain-viz/evidence_chain_injector.js", file=sys.stderr)
        return
    try:
        result = subprocess.run(
            ["node", str(injector), str(case_dir), output],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(result.stdout.strip())
            print(f"\n🌐 已生成 HTML: {Path(output).resolve()}")
            print("   用浏览器打开查看交互式证据链图")
        else:
            print(f"  [ERROR] injector 执行失败:\n{result.stderr}", file=sys.stderr)
    except FileNotFoundError:
        print("  [ERROR] 未找到 node 命令。请确保已安装 Node.js。", file=sys.stderr)


# ── 主入口 ──

def main():
    parser = argparse.ArgumentParser(
        description="scan-chain.py — 证据链编译与完整性检查 (v2 语义关系)",
        epilog="""使用示例:
  scan-chain.py cases/CASE-2026-001/ --list
  scan-chain.py cases/CASE-2026-001/ --trace FND-001
  scan-chain.py cases/CASE-2026-001/ --integrity
  scan-chain.py cases/CASE-2026-001/ --check-chains
  scan-chain.py cases/CASE-2026-001/ --sync
  scan-chain.py cases/CASE-2026-001/ --graph
  scan-chain.py cases/CASE-2026-001/ --html output.html   # 生成 HTML 交互图""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("case_dir", type=Path, help="案件目录路径")
    parser.add_argument("--list", action="store_true", help="列出所有节点及关系类型")
    parser.add_argument("--trace", type=str, metavar="NODE_ID", help="追溯证据链 (derived_from)")
    parser.add_argument("--integrity", action="store_true", help="完整性检查")
    parser.add_argument("--check-chains", action="store_true", help="推理链逻辑完整性检查")
    parser.add_argument("--sync", action="store_true", help="同步 chain_nodes 索引")
    parser.add_argument("--graph", action="store_true", help="Mermaid 流程图 (带边类型)，用于对话内快速预览")
    parser.add_argument("--html", type=str, metavar="OUTPUT", nargs="?", const="evidence_chain_output.html",
                        help="生成交互式 HTML 可视化图（使用 evidence_chain_injector.js 模板）")
    parser.add_argument("--validate", action="store_true", help="节点文件结构验证")

    args = parser.parse_args()
    case_dir = args.case_dir.resolve()

    if not case_dir.is_dir():
        print(f"[ERROR] 目录不存在: {case_dir}", file=sys.stderr)
        sys.exit(1)

    nodes = load_all_nodes(case_dir)
    print(f"✓ 加载 {len(nodes)} 个节点", file=sys.stderr)

    if args.list:
        print(f"\n{'ID':<12} {'类型':<12} {'状态':<12} 关系                          文件")
        print("-" * 80)
        for n in sorted(nodes, key=lambda x: x["id"]):
            rt = ",".join(n["relations"].keys()) if n["relations"] else "(无)"
            print(f"{n['id']:<12} {n['type']:<12} {n['status']:<12} {rt:<30} {n['file']}")

    if args.trace:
        res = trace_chain(nodes, args.trace)
        if not res:
            print(f"[ERROR] 节点 {args.trace} 不存在", file=sys.stderr)
            sys.exit(1)
        print(f"\n📎 证据链追溯: {args.trace}")
        print("-" * 40)
        print(format_tree(res["tree"]))

    if args.integrity:
        issues = check_integrity(nodes)
        if not issues:
            print("\n✅ 完整性检查通过")
        else:
            _report_issues(issues)

    if args.check_chains:
        issues = check_chains(nodes)
        if not issues:
            print("\n✅ 推理链检查通过")
        else:
            _report_issues(issues)

    if args.validate:
        issues = validate_nodes(case_dir, nodes)
        if not issues:
            print("\n✅ 节点结构验证通过")
        else:
            _report_issues(issues)

    if args.sync:
        res = sync_chain_index(case_dir, nodes)
        print(f"\n📝 索引同步: +{len(res['added'])} -{len(res['removed'])} ~{len(res['updated'])}")
        if res["added"]:
            print(f"  新增: {', '.join(res['added'])}")
        if res["removed"]:
            print(f"  移除: {', '.join(res['removed'])}")
        if res["updated"]:
            print(f"  更新: {', '.join(res['updated'])}")

    if args.graph:
        print(f"\n```mermaid\n{format_mermaid(nodes)}\n```")

    if args.html:
        _run_html_injector(case_dir, args.html)

    if not any([args.list, args.trace, args.integrity,
                args.check_chains, args.sync, args.graph, args.html, args.validate]):
        parser.print_help()


def _report_issues(issues: list[dict]):
    levels = {"ERROR": "🔴", "WARN": "🟡", "INFO": "🔵"}
    errors = [i for i in issues if i["severity"] == "ERROR"]
    warns = [i for i in issues if i["severity"] == "WARN"]
    infos = [i for i in issues if i["severity"] == "INFO"]
    print(f"\n📋 {len(errors)} ERROR, {len(warns)} WARN, {len(infos)} INFO")
    for i in issues:
        print(f"  {levels[i['severity']]} [{i['type']}] {i['message']}")
    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
