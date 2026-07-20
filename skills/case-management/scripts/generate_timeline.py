#!/usr/bin/env python3
"""
generate_timeline.py — 从 evidence_registry.json + CHANGELOG.json 自动生成案件时间线 Mermaid Markdown

Usage:
    python generate_timeline.py <case_dir>

Output:
    <case_dir>/case_timeline_mermaid.md

数据来源:
    - evidence_registry.json (event_timeline, hypotheses, evidence_items, entities)
    - CHANGELOG.json (变更记录：阶段转换、门禁推进、假设置信度变化、实体激活)
    - nodes/*.md (frontmatter 中的 confidence, status 等字段)
"""

import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

# Windows 控制台 Unicode 支持
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ═══════════════════════════════════════════════════════════════
# 样式常量（与 timeline-template.md 保持一致）
# ═══════════════════════════════════════════════════════════════

SECTION_ICONS = {
    "external": "🕐 案件外部事件",
    "INIT": "🔍 INIT 调查活动",
    "PRE_INVESTIGATION": "🔶 PRE_INVESTIGATION 调查活动",
    "FIELDWORK": "⚡ FIELDWORK 调查活动",
    "REVIEWING": "📋 REVIEWING 调查活动",
    "CLOSED": "✅ CLOSED 结案活动",
}

TAG_TO_SECTION = {
    "INIT": "INIT",
    "PRE_INVESTIGATION": "PRE_INVESTIGATION",
    "FIELDWORK": "FIELDWORK",
    "REVIEWING": "REVIEWING",
    "case_opened": "INIT",
    "complaint": "external",
    "whistleblowing": "external",
    "contact": "external",
}

EVIDENCE_TYPE_SECTIONS = {
    "documentary": "书证",
    "analytical": "分析法证",
    "testimonial": "言词证据",
    "physical": "物证",
    "digital": "电子证据",
}

PHASE_ORDER = ["INIT", "PRE_INVESTIGATION", "FIELDWORK", "REVIEWING", "CLOSED"]

# CHANGELOG action → 事件标记
CHANGELOG_ACTION_MARKERS = {
    "stage_transition": "✅ ",
    "gate_progress": "",  # 动态判断
    "entity_resolved": "",
    "entity_created": "",
    "evidence_registered": "",
    "evidence_verified": "",
    "hypothesis_refactored": "",
    "ontology_alignment": "",
    "plan_formalized": "",
    "investigation_action": "",
}


# ═══════════════════════════════════════════════════════════════
# 数据加载
# ═══════════════════════════════════════════════════════════════

def load_registry(case_dir: Path) -> dict:
    """加载 evidence_registry.json"""
    reg_path = case_dir / "evidence_registry.json"
    if not reg_path.exists():
        print(f"❌ 未找到 {reg_path}", file=sys.stderr)
        sys.exit(1)
    with open(reg_path, encoding="utf-8") as f:
        return json.load(f)


def load_changelog(case_dir: Path) -> list:
    """加载 CHANGELOG.json，返回 entries 列表"""
    cl_path = case_dir / "CHANGELOG.json"
    if not cl_path.exists():
        return []
    with open(cl_path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("entries", [])


def load_node_frontmatter(case_dir: Path, node_id: str) -> dict:
    """从 nodes/*.md 读取 frontmatter"""
    node_path = case_dir / "nodes" / f"{node_id}.md"
    if not node_path.exists():
        return {}
    content = node_path.read_text(encoding="utf-8")
    fm = {}
    if content.startswith("---"):
        end = content.find("---", 3)
        if end > 0:
            fm_text = content[3:end].strip()
            for line in fm_text.split("\n"):
                if ":" in line:
                    key, _, val = line.partition(":")
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    fm[key] = val
    return fm


# ═══════════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════════

def format_money(amount: float) -> str:
    return f"¥{amount:,.0f}"


def extract_money_from_text(text: str) -> str:
    """从文本中提取金额，优先取合计/总额"""
    for pattern in [
        r'(?:合计|总额|总金额|合同金额|金额)[为是：:\s]*[¥￥]?\s*([\d,]+\.?\d*)',
        r'[¥￥]\s*([\d,]+\.?\d*)\s*(?:合计|总额|总)',
    ]:
        m = re.search(pattern, text)
        if m:
            try:
                val = float(m.group(1).replace(",", ""))
                if val > 10000:
                    return format_money(val)
            except ValueError:
                pass
    all_amounts = re.findall(r'[¥￥]([\d,]+\.?\d*)', text)
    if all_amounts:
        try:
            amounts = [float(a.replace(",", "")) for a in all_amounts]
            max_amount = max(amounts)
            if max_amount > 10000:
                return format_money(max_amount)
        except ValueError:
            pass
    return ""


def shorten_title(title: str, max_len: int = 25) -> str:
    """截短事件标题，去除冗余后缀"""
    # 去掉 (CHG-XXX) (EVT-XXX) 后缀
    title = re.sub(r'（(CHG|EVT)-\d+）', '', title)
    title = title.strip()
    if len(title) > max_len:
        title = title[:max_len] + "…"
    return title


def shorten_hyp_statement(stmt: str, max_len: int = 20) -> str:
    """截短假设陈述"""
    if len(stmt) > max_len:
        stmt = stmt[:max_len] + "…"
    return stmt


def is_duplicate_event(title_a: str, title_b: str) -> bool:
    """判断两个事件标题是否是同一事件的重复描述（2字滑窗关键词重叠）"""
    # ⚠️ 标记的事件（阻塞/门禁）不参与去重
    if "阻塞" in title_a or "阻塞" in title_b:
        return False
    if "✅" in title_a or "✅" in title_b:
        return False
    
    def extract_keywords(s):
        chars = re.findall(r'[\u4e00-\u9fff]', s)
        return set(''.join(chars[i:i+2]) for i in range(len(chars)-1))
    
    kw_a = extract_keywords(title_a)
    kw_b = extract_keywords(title_b)
    if not kw_a or not kw_b:
        return False
    overlap = kw_a & kw_b
    # 重叠关键词 ≥4 个认为是重复
    return len(overlap) >= 4


def shorten_evidence_summary(summary: str, max_len: int = 28) -> str:
    money = extract_money_from_text(summary)
    for sep in ["—", "—", "。", "，", "；"]:
        if sep in summary:
            summary = summary.split(sep)[0]
            break
    summary = summary.strip()
    # 如果有金额，预留金额长度
    if money:
        budget = len(money) + 1  # 空格+金额
        text_max = max_len - budget
        if text_max < 10:
            text_max = 10
        if len(summary) > text_max:
            summary = summary[:text_max] + "…"
        summary = f"{summary} {money}"
    else:
        if len(summary) > max_len:
            summary = summary[:max_len] + "…"
    return summary


def get_case_title(registry: dict) -> str:
    return registry.get("metadata", {}).get("case_id", "UNKNOWN")


def parse_date(date_str: str) -> str:
    if not date_str:
        return ""
    date_str = date_str.replace("T", " ").split("+")[0].split(".")[0]
    parts = date_str.strip().split(" ")
    date_part = parts[0]
    time_part = parts[1] if len(parts) > 1 else ""
    if time_part:
        time_part = time_part[:5]
        return f"{date_part} {time_part}"
    return date_part


def get_date_only(date_str: str) -> str:
    return parse_date(date_str).split(" ")[0]


def extract_hyp_confidence_changes(detail: str) -> list:
    """
    从 CHANGELOG detail 文本中提取假设置信度变化。
    返回 [(hyp_id, old_conf, new_conf, note), ...]
    
    示例匹配：
      "HYP-001继承者解释（0.5→0.55）"  → ("HYP-001", 0.5, 0.55, "继承者解释")
      "下调 HYP-002 置信度（0.3→0.2）" → ("HYP-002", 0.3, 0.2, "下调")
      "新增 HYP-003（置信度0.4）"       → ("HYP-003", None, 0.4, "新增")
      "HYP-002维持0.2"                  → ("HYP-002", 0.2, 0.2, "维持")
    """
    results = []
    
    # 模式1: HYP-XXX...（old→new）
    for m in re.finditer(r'(HYP-\d+)[^（]*（([\d.]+)→([\d.]+)）', detail):
        hyp_id = m.group(1)
        old_conf = float(m.group(2))
        new_conf = float(m.group(3))
        results.append((hyp_id, old_conf, new_conf, ""))
    
    # 模式2: 新增 HYP-XXX（置信度X.X）
    for m in re.finditer(r'新增\s*(HYP-\d+)[^（]*（置信度([\d.]+)）', detail):
        hyp_id = m.group(1)
        new_conf = float(m.group(2))
        results.append((hyp_id, None, new_conf, "新增"))
    
    # 模式3: HYP-XXX维持X.X
    for m in re.finditer(r'(HYP-\d+)[^（]*维持\s*([\d.]+)', detail):
        hyp_id = m.group(1)
        conf = float(m.group(2))
        results.append((hyp_id, conf, conf, "维持"))
    
    return results


# ═══════════════════════════════════════════════════════════════
# 生成器：第1部分 — 案件全事件时间线（registry + CHANGELOG 合并）
# ═══════════════════════════════════════════════════════════════

def generate_case_timeline(registry: dict, case_dir: Path, changelog: list) -> str:
    """生成案件全事件时间线，合并 evidence_registry 事件和 CHANGELOG 变更"""
    case_id = get_case_title(registry)
    events = registry.get("metadata", {}).get("event_timeline") or registry.get("event_timeline", [])
    entities = registry.get("entities", [])

    # 获取案件名称
    case_name = ""
    for ent in entities:
        role = ent.get("role", "")
        if "投诉对象" in role or "subject" in role:
            ent_name = ent.get("name", "")
            for e2 in entities:
                if "客户" in e2.get("role", "") or "甲方" in e2.get("role", ""):
                    case_name = f"{ent_name}/{e2['name']}"
                    break
            if case_name:
                break

    lines = []
    lines.append("```mermaid")
    lines.append("timeline")
    lines.append(f"    title {case_id} {case_name} 事件时间线")

    # ── 收集所有事件，统一格式 ──
    # 格式: {"moment": str, "title": str, "source": "registry"|"changelog", "action": str, "marker": str}
    all_events = []

    # 1. 从 registry event_timeline 收集
    for evt in events:
        tags = evt.get("tags", [])
        all_events.append({
            "moment": evt.get("moment", ""),
            "title": evt.get("title", ""),
            "description": evt.get("description", ""),
            "event_id": evt.get("event_id", ""),
            "tags": tags,
            "source": "registry",
            "action": "",
        })

    # 2. 从 CHANGELOG 收集（排除已在 registry 中的重复事件）
    registry_dates_titles = {(get_date_only(e.get("moment", "")), e.get("title", "")) for e in all_events}
    
    for chg in changelog:
        chg_date = get_date_only(chg.get("timestamp", ""))
        chg_summary = chg.get("summary", "")
        chg_action = chg.get("action", "")
        chg_detail = chg.get("detail", "")
        
        # 跳过已在 registry 中的证据入库事件（避免重复）
        if chg_action == "evidence_registered":
            # 检查 registry 是否已有同日同主题事件
            skip = False
            for reg_e in all_events:
                if get_date_only(reg_e.get("moment", "")) == chg_date:
                    reg_title = reg_e.get("title", "")
                    # 如果 registry 已有该证据的入库记录
                    for ev_id in chg.get("related_ids", []):
                        if ev_id.startswith("EV-") and ev_id in reg_title:
                            skip = True
                            break
                    if skip:
                        break
            if skip:
                continue

        # 确定标记
        marker = ""
        if chg_action == "stage_transition":
            marker = "✅ "
        elif "阻塞" in chg_summary:
            marker = "⚠️ "
        elif chg_action == "gate_progress":
            if "就绪" in chg_summary or "完成" in chg_summary:
                marker = "✅ "

        all_events.append({
            "moment": chg.get("timestamp", ""),
            "title": chg_summary,
            "description": chg_detail,
            "event_id": chg.get("id", ""),
            "tags": [],
            "source": "changelog",
            "action": chg_action,
            "marker": marker,
        })

    # 3. 从实体信息中提取背景事件（公司注册时间）
    background_events = []
    for ent in entities:
        body_path = case_dir / "nodes" / f"{ent.get('entity_id', '')}.md"
        if body_path.exists():
            body = body_path.read_text(encoding="utf-8")
            m = re.search(r'成立[于日期]*[:：\s]*(\d{4}[-年]\d{1,2}[-月]\d{1,2})', body)
            if m:
                ent_name = ent.get("name", "")
                bg_date = m.group(1).replace("年", "-").replace("月", "-").replace("日", "")
                background_events.append({
                    "moment": bg_date,
                    "title": f"{ent_name}注册成立",
                    "description": "",
                    "event_id": "",
                    "tags": [],
                    "source": "background",
                    "action": "",
                    "marker": "",
                })

    # ── 按阶段分组（所有事件按时间排序后统一处理）──
    external_events = list(background_events)
    phase_events = {phase: [] for phase in PHASE_ORDER}

    # 先按时间排序所有非背景事件
    all_events.sort(key=lambda x: x.get("moment", ""))

    # 当前阶段追踪
    current_phase = "INIT"

    for evt in all_events:
        source = evt.get("source", "")
        action = evt.get("action", "")
        tags = evt.get("tags", [])
        
        # 1. stage_transition: 更新当前阶段，归入转换前的阶段
        if action == "stage_transition":
            detail = evt.get("description", "")
            # stage_transition 归入转换前的阶段
            phase_events[current_phase].append(evt)
            # 更新当前阶段
            for phase in PHASE_ORDER:
                if phase in detail and phase != current_phase:
                    current_phase = phase
                    break
            continue
        
        # 2. registry 事件：按 tags 归类
        if source == "registry":
            assigned = False
            for tag in tags:
                if tag in TAG_TO_SECTION:
                    section = TAG_TO_SECTION[tag]
                    if section == "external":
                        external_events.append(evt)
                    else:
                        phase_events[section].append(evt)
                    assigned = True
                    break
            if not assigned:
                if any(t in tags for t in ["evidence", "investigation", "background_check",
                                            "expense_analysis", "quotation", "contract",
                                            "official_letter"]):
                    phase_events[current_phase].append(evt)
                else:
                    external_events.append(evt)
            continue
        
        # 3. CHANGELOG 事件（非 stage_transition）：归入当前阶段
        phase_events[current_phase].append(evt)

    # ── 输出外部事件 section ──
    external_events.sort(key=lambda x: x.get("moment", ""))
    if external_events:
        lines.append(f"    section {SECTION_ICONS['external']}")
        prev_date = None
        for evt in external_events:
            date = get_date_only(evt.get("moment", ""))
            title = shorten_title(evt.get("title", ""))
            if date == prev_date:
                lines.append(f"                    : {title}")
            else:
                lines.append(f"        {date} : {title}")
                prev_date = date

    # ── 输出各调查阶段 section ──
    for phase in PHASE_ORDER:
        evts = phase_events.get(phase, [])
        if not evts:
            continue

        # 按日期分组并去重
        date_groups = {}
        for evt in sorted(evts, key=lambda x: x.get("moment", "")):
            date = get_date_only(evt.get("moment", ""))
            if date not in date_groups:
                date_groups[date] = []
            date_groups[date].append(evt)

        # 去重：同日内 EVT 和 CHG 如果描述同一事件，只保留信息更丰富的
        deduped_groups = {}
        for date, group in date_groups.items():
            kept = []
            for evt in group:
                title = evt.get("title", "")
                is_dup = False
                for k in kept:
                    if is_duplicate_event(title, k.get("title", "")):
                        # 保留更长的标题（通常信息更丰富）
                        if len(title) > len(k.get("title", "")):
                            kept[kept.index(k)] = evt
                        is_dup = True
                        break
                if not is_dup:
                    kept.append(evt)
            deduped_groups[date] = kept

        dates = list(deduped_groups.keys())
        if dates:
            d_min, d_max = min(dates), max(dates)
            date_range = f"{d_min} ~ {d_max}" if d_min != d_max else d_min
        else:
            date_range = ""

        section_name = SECTION_ICONS.get(phase, phase)
        lines.append(f"    section {section_name}（{date_range}）")

        prev_date = None
        for date in dates:
            group = deduped_groups[date]
            for i, evt in enumerate(group):
                title = shorten_title(evt.get("title", ""))
                marker = evt.get("marker", "")

                if i == 0:
                    lines.append(f"        {date} : {marker}{title}")
                else:
                    lines.append(f"                        : {marker}{title}")
            prev_date = date

    lines.append("```")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# 生成器：第2部分 — 假设矩阵演进（CHANGELOG 驱动）
# ═══════════════════════════════════════════════════════════════

def generate_hypothesis_timeline(registry: dict, case_dir: Path, changelog: list) -> str:
    """生成假设置信度演进时间线，从 CHANGELOG 中提取置信度变化历史"""
    hypotheses = registry.get("hypotheses", [])
    if not hypotheses:
        return ""

    # 当前假设状态
    current_hyps = {}
    for hyp in hypotheses:
        hid = hyp.get("hypothesis_id", "")
        current_hyps[hid] = {
            "confidence": hyp.get("confidence", 0),
            "statement": hyp.get("statement", ""),
        }

    # 从 CHANGELOG 提取置信度变化历史
    # 按 timestamp 分组: {date: [(hyp_id, old_conf, new_conf, note), ...]}
    conf_changes_by_date = {}
    
    for chg in changelog:
        detail = chg.get("detail", "")
        changes = extract_hyp_confidence_changes(detail)
        if changes:
            date = get_date_only(chg.get("timestamp", ""))
            if date not in conf_changes_by_date:
                conf_changes_by_date[date] = []
            for change in changes:
                conf_changes_by_date[date].append(change)

    # 如果 CHANGELOG 没有变化记录，回退到 registry 当前状态
    if not conf_changes_by_date:
        # 回退：用 registry 当前状态
        first_date = "当前"
        for hyp in hypotheses:
            updated_at = get_date_only(hyp.get("last_updated_at", ""))
            if updated_at:
                first_date = updated_at
                break
        conf_changes_by_date[first_date] = []
        for hyp in hypotheses:
            hid = hyp.get("hypothesis_id", "")
            conf = hyp.get("confidence", 0)
            conf_changes_by_date[first_date].append((hid, None, conf, "当前"))

    hyp_ids = [h.get("hypothesis_id", "") for h in hypotheses]
    hyp_id_str = " / ".join(hyp_ids)

    lines = []
    lines.append("```mermaid")
    lines.append("timeline")
    lines.append(f"    title {hyp_id_str} 置信度演进")

    for date in sorted(conf_changes_by_date.keys()):
        changes = conf_changes_by_date[date]
        # 确定 section 名
        # 从 CHANGELOG 找该日期的 action
        section_label = "假设更新"
        for chg in changelog:
            if get_date_only(chg.get("timestamp", "")) == date:
                action = chg.get("action", "")
                if action == "hypothesis_refactored":
                    section_label = "假设重构"
                elif action == "evidence_registered":
                    section_label = "情报强化"
                elif action == "gate_progress":
                    section_label = "门禁推进"
                break

        lines.append(f"    section {section_label}（{date}）")
        for hyp_id, old_conf, new_conf, note in changes:
            stmt = current_hyps.get(hyp_id, {}).get("statement", "")
            stmt = shorten_hyp_statement(stmt)
            
            # 格式化置信度变化
            if old_conf is None:
                conf_str = f"{new_conf}"
                note_str = note or "新增"
            elif old_conf != new_conf:
                arrow = "↑" if new_conf > old_conf else "↓"
                conf_str = f"{new_conf}"
                note_str = f"（{old_conf}→{new_conf} {arrow}）"
            else:
                conf_str = f"{new_conf}"
                note_str = "维持"
            
            lines.append(f"        {hyp_id} {conf_str} : {stmt} {note_str}")

    lines.append("```")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# 生成器：第3部分 — 证据节点时间线
# ═══════════════════════════════════════════════════════════════

def generate_evidence_timeline(registry: dict) -> str:
    """生成证据节点注册时间线"""
    evidence = registry.get("evidence_items", [])
    if not evidence:
        return ""

    type_groups = {}
    for ev in evidence:
        ev_type = ev.get("type", "documentary")
        section_name = EVIDENCE_TYPE_SECTIONS.get(ev_type, "其他证据")
        if section_name not in type_groups:
            type_groups[section_name] = []
        type_groups[section_name].append(ev)

    for section, evs in type_groups.items():
        evs.sort(key=lambda x: x.get("collected_at", ""))

    total = len(evidence)
    lines = []
    lines.append("```mermaid")
    lines.append("timeline")
    lines.append(f"    title {total}个证据节点注册时间线")

    for section_name, evs in type_groups.items():
        lines.append(f"    section {section_name}")
        prev_date = None
        for ev in evs:
            date = get_date_only(ev.get("collected_at", ""))
            eid = ev.get("evidence_id", "")
            summary = ev.get("summary", "")
            short = shorten_evidence_summary(summary)
            if date == prev_date:
                lines.append(f"                    : {eid} {short}")
            else:
                lines.append(f"        {date} : {eid} {short}")
                prev_date = date

    lines.append("```")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# 主函数
# ═══════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_timeline.py <case_dir>", file=sys.stderr)
        sys.exit(1)

    case_dir = Path(sys.argv[1]).resolve()
    if not case_dir.exists():
        print(f"❌ 案件目录不存在: {case_dir}", file=sys.stderr)
        sys.exit(1)

    registry = load_registry(case_dir)
    changelog = load_changelog(case_dir)
    case_id = get_case_title(registry)

    print(f"📋 生成时间线: {case_id}")
    print(f"   案件目录: {case_dir}")
    print(f"   数据源: evidence_registry.json ({len(registry.get('evidence_items', []))} 证据, {len(registry.get('entities', []))} 实体)")
    print(f"   数据源: CHANGELOG.json ({len(changelog)} 条变更)")

    # 生成各部分
    case_timeline = generate_case_timeline(registry, case_dir, changelog)
    hyp_timeline = generate_hypothesis_timeline(registry, case_dir, changelog)
    ev_timeline = generate_evidence_timeline(registry)

    # 组装完整 Markdown
    sources = ["evidence_registry.json"]
    if changelog:
        sources.append("CHANGELOG.json")

    md_parts = [
        f"# {case_id} Mermaid 时间线",
        "",
        f"> 自动生成 — 由 `scripts/generate_timeline.py` 从 {' + '.join(sources)} 生成",
        f"> 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "---",
        "",
        "## 案件全事件时间线",
        "",
        case_timeline,
        "",
        "---",
        "",
    ]

    if hyp_timeline:
        md_parts.extend([
            "## 假设矩阵演进",
            "",
            hyp_timeline,
            "",
            "---",
            "",
        ])

    if ev_timeline:
        md_parts.extend([
            "## 证据节点时间线",
            "",
            ev_timeline,
            "",
        ])

    output = "\n".join(md_parts)
    output_path = case_dir / "case_timeline_mermaid.md"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"✅ 已生成: {output_path}")
    print(f"   大小: {output_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
