#!/usr/bin/env python3
"""
generate_timeline_html.py — 生成 HTML 版案件时间线（解决 Mermaid 不换行问题）

Usage:
    python generate_timeline_html.py <case_dir>

Output:
    <case_dir>/case_timeline.html
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# 复用 generate_timeline.py 的数据加载和工具函数
sys.path.insert(0, str(Path(__file__).parent))
from generate_timeline import (
    load_registry, load_changelog, load_node_frontmatter,
    get_case_title, get_date_only, parse_date,
    extract_money_from_text, shorten_evidence_summary,
    extract_hyp_confidence_changes,
    SECTION_ICONS, TAG_TO_SECTION, EVIDENCE_TYPE_SECTIONS, PHASE_ORDER,
)


def collect_timeline_data(registry, case_dir, changelog):
    """收集所有时间线数据，返回结构化数据"""
    events = registry.get("metadata", {}).get("event_timeline") or registry.get("event_timeline", [])
    entities = registry.get("entities", [])
    hypotheses = registry.get("hypotheses", [])
    evidence = registry.get("evidence_items", [])

    # ── 背景事件（实体注册时间）──
    background = []
    for ent in entities:
        body_path = case_dir / "nodes" / f"{ent.get('entity_id', '')}.md"
        if body_path.exists():
            body = body_path.read_text(encoding="utf-8")
            m = re.search(r'成立[于日期]*[:：\s]*(\d{4}[-年]\d{1,2}[-月]\d{1,2})', body)
            if m:
                bg_date = m.group(1).replace("年", "-").replace("月", "-").replace("日", "")
                background.append({
                    "date": bg_date,
                    "title": f"{ent.get('name', '')}注册成立",
                    "marker": "",
                    "source": "background",
                })

    # ── 合并 registry + changelog 事件 ──
    all_events = []

    for evt in events:
        all_events.append({
            "moment": evt.get("moment", ""),
            "date": get_date_only(evt.get("moment", "")),
            "title": evt.get("title", ""),
            "desc": evt.get("description", ""),
            "tags": evt.get("tags", []),
            "source": "registry",
            "action": "",
            "marker": "",
        })

    for chg in changelog:
        action = chg.get("action", "")
        summary = chg.get("summary", "")
        detail = chg.get("detail", "")

        # 跳过证据入库重复
        if action == "evidence_registered":
            skip = False
            chg_date = get_date_only(chg.get("timestamp", ""))
            for reg_e in all_events:
                if get_date_only(reg_e.get("moment", "")) == chg_date:
                    for ev_id in chg.get("related_ids", []):
                        if ev_id.startswith("EV-") and ev_id in reg_e.get("title", ""):
                            skip = True
                            break
                    if skip:
                        break
            if skip:
                continue

        marker = ""
        if action == "stage_transition":
            marker = "✅"
        elif "阻塞" in summary:
            marker = "⚠️"

        all_events.append({
            "moment": chg.get("timestamp", ""),
            "date": get_date_only(chg.get("timestamp", "")),
            "title": summary,
            "desc": detail,
            "tags": [],
            "source": "changelog",
            "action": action,
            "marker": marker,
        })

    # ── 按阶段分组 ──
    all_events.sort(key=lambda x: x.get("moment", ""))
    
    external_events = list(background)
    phase_events = {p: [] for p in PHASE_ORDER}
    current_phase = "INIT"

    for evt in all_events:
        action = evt.get("action", "")
        source = evt.get("source", "")
        tags = evt.get("tags", "")

        if action == "stage_transition":
            phase_events[current_phase].append(evt)
            detail = evt.get("desc", "")
            for phase in PHASE_ORDER:
                if phase in detail and phase != current_phase:
                    current_phase = phase
                    break
            continue

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
        else:
            phase_events[current_phase].append(evt)

    # ── 去重 ──
    def dedupe(events):
        kept = []
        for evt in events:
            title = evt["title"]
            is_dup = False
            for k in kept:
                kt = k["title"]
                if "阻塞" in title or "阻塞" in kt or "✅" in title or "✅" in kt:
                    continue
                def extract_kw(s):
                    chars = re.findall(r'[\u4e00-\u9fff]', s)
                    return set(''.join(chars[i:i+2]) for i in range(len(chars)-1))
                overlap = extract_kw(title) & extract_kw(kt)
                if len(overlap) >= 4:
                    if len(title) > len(kt):
                        kept[kept.index(k)] = evt
                    is_dup = True
                    break
            if not is_dup:
                kept.append(evt)
        return kept

    external_events = dedupe(external_events)
    for p in PHASE_ORDER:
        phase_events[p] = dedupe(phase_events[p])

    # ── 假设演进 ──
    current_hyps = {h["hypothesis_id"]: h for h in hypotheses}
    conf_changes = {}
    for chg in changelog:
        changes = extract_hyp_confidence_changes(chg.get("detail", ""))
        if changes:
            date = get_date_only(chg.get("timestamp", ""))
            if date not in conf_changes:
                conf_changes[date] = []
            for c in changes:
                conf_changes[date].append(c)

    return {
        "external": sorted(external_events, key=lambda x: x.get("date", "")),
        "phases": phase_events,
        "hypotheses": hypotheses,
        "conf_changes": conf_changes,
        "evidence": sorted(evidence, key=lambda x: x.get("collected_at", "")),
        "case_id": get_case_title(registry),
        "case_name": _get_case_name(entities),
    }


def _get_case_name(entities):
    for ent in entities:
        if "投诉对象" in ent.get("role", "") or "subject" in ent.get("role", ""):
            name = ent.get("name", "")
            for e2 in entities:
                if "客户" in e2.get("role", "") or "甲方" in e2.get("role", ""):
                    return f"{name}/{e2['name']}"
    return ""


def generate_html(data):
    """生成完整 HTML"""
    case_id = data["case_id"]
    case_name = data["case_name"]
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>案件时间线 — {case_id}</title>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --bg-deep:#0f1923;--bg-panel:#162030;--bg-card:#1d2d3f;--bg-hover:#243548;
  --border:#2a3f56;--border-lit:#3a5570;
  --text-primary:#d8e6f0;--text-secondary:#7a9bb5;--text-dim:#4a6880;--text-id:#4ecdc4;
  --amber:#e8a020;--teal:#4ecdc4;--green:#52c97a;--red:#e85c5c;--purple:#9b7ae8;
  --radius:6px;--radius-lg:10px;
  --font-mono:'SF Mono','Fira Code','Cascadia Code',monospace;
  --font-body:'Inter',system-ui,-apple-system,sans-serif
}}
body{{background:var(--bg-deep);color:var(--text-primary);font-family:var(--font-body);font-size:14px;line-height:1.6}}
.container{{max-width:1100px;margin:0 auto;padding:24px 20px}}

/* ── Header ── */
.header{{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}}
.header-badge{{background:rgba(232,160,32,.15);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);font-size:12px;padding:3px 10px;border-radius:3px;font-weight:600}}
.header-title{{font-size:18px;font-weight:600}}
.header-subtitle{{font-size:12px;color:var(--text-secondary)}}
.header-meta{{margin-left:auto;font-size:11px;color:var(--text-dim);text-align:right}}

/* ── Section ── */
.tl-section{{margin-bottom:32px}}
.tl-section-title{{font-size:14px;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;padding:6px 12px;background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius)}}
.tl-section-icon{{font-size:16px}}
.tl-section-range{{font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-left:auto}}

/* ── Timeline ── */
.tl-list{{position:relative;padding-left:28px}}
.tl-list::before{{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--border)}}

.tl-item{{position:relative;margin-bottom:8px;display:flex;gap:12px;align-items:flex-start}}
.tl-item::before{{content:'';position:absolute;left:-24px;top:6px;width:10px;height:10px;border-radius:50%;border:2px solid var(--border-lit);background:var(--bg-deep);z-index:1}}
.tl-item.tl-marker-done::before{{border-color:var(--green);background:var(--green);box-shadow:0 0 6px rgba(82,201,122,.4)}}
.tl-item.tl-marker-warn::before{{border-color:var(--amber);background:var(--amber);box-shadow:0 0 6px rgba(232,160,32,.4)}}

.tl-date{{flex:0 0 110px;font-family:var(--font-mono);font-size:11px;color:var(--text-id);padding-top:3px}}
.tl-content{{flex:1;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:6px 12px;transition:all .12s;word-wrap:break-word;overflow-wrap:break-word}}
.tl-content:hover{{background:var(--bg-hover);border-color:var(--border-lit)}}
.tl-content-text{{font-size:13px;color:var(--text-primary);line-height:1.5}}
.tl-content-marker{{font-size:12px;margin-right:4px}}
.tl-content-marker.done{{color:var(--green)}}
.tl-content-marker.warn{{color:var(--amber)}}

/* ── Same-day continuation ── */
.tl-item.tl-continuation{{margin-top:-2px}}
.tl-item.tl-continuation::before{{width:6px;height:6px;left:-22px;top:8px;border-width:1px;border-color:var(--text-dim)}}
.tl-item.tl-continuation .tl-date{{visibility:hidden}}

/* ── Hypothesis ── */
.hyp-card{{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:12px;overflow:hidden}}
.hyp-card-header{{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-panel)}}
.hyp-card-id{{font-family:var(--font-mono);font-size:11px;color:var(--text-id);flex-shrink:0}}
.hyp-card-stmt{{font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.hyp-conf-badge{{font-family:var(--font-mono);font-size:11px;padding:2px 8px;border-radius:3px;flex-shrink:0}}
.hyp-conf-high{{background:rgba(82,201,122,.15);color:var(--green);border:1px solid var(--green)}}
.hyp-conf-mid{{background:rgba(232,160,32,.15);color:var(--amber);border:1px solid var(--amber)}}
.hyp-conf-low{{background:rgba(232,92,92,.15);color:var(--red);border:1px solid var(--red)}}
.hyp-card-body{{padding:8px 14px}}
.hyp-change{{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px}}
.hyp-change-date{{font-family:var(--font-mono);font-size:10px;color:var(--text-dim);flex:0 0 90px}}
.hyp-change-arrow{{font-family:var(--font-mono);font-size:12px}}
.hyp-change-arrow.up{{color:var(--green)}}
.hyp-change-arrow.down{{color:var(--red)}}
.hyp-change-note{{color:var(--text-secondary)}}

/* ── Evidence ── */
.ev-row{{display:flex;align-items:flex-start;gap:10px;padding:6px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:4px;transition:all .12s}}
.ev-row:hover{{background:var(--bg-hover)}}
.ev-id{{font-family:var(--font-mono);font-size:11px;color:var(--text-id);flex:0 0 70px}}
.ev-date{{font-family:var(--font-mono);font-size:10px;color:var(--text-dim);flex:0 0 100px}}
.ev-summary{{font-size:12px;color:var(--text-secondary);flex:1;word-wrap:break-word;overflow-wrap:break-word}}
.ev-money{{font-family:var(--font-mono);font-size:11px;color:var(--amber);flex:0 0 auto}}

.ev-type-header{{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);margin:12px 0 6px;padding-left:4px}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="header-badge">{case_id}</span>
    <div>
      <div class="header-title">{case_name} 案件时间线</div>
      <div class="header-subtitle">从 evidence_registry.json + CHANGELOG.json 自动生成</div>
    </div>
    <div class="header-meta">生成时间<br>{now}</div>
  </div>
"""

    # ── Part 1: Case Timeline ──
    html += '  <h2 style="font-size:15px;margin-bottom:16px;color:var(--text-primary)">📋 案件全事件时间线</h2>\n'

    # External events
    if data["external"]:
        html += f'  <div class="tl-section">\n'
        html += f'    <div class="tl-section-title"><span class="tl-section-icon">🕐</span> 案件外部事件</div>\n'
        html += '    <div class="tl-list">\n'
        prev_date = None
        for evt in data["external"]:
            date = evt["date"]
            is_cont = (date == prev_date)
            cls = "tl-continuation" if is_cont else ""
            html += f'      <div class="tl-item {cls}">\n'
            html += f'        <span class="tl-date">{"" if is_cont else date}</span>\n'
            html += f'        <div class="tl-content"><span class="tl-content-text">{evt["title"]}</span></div>\n'
            html += '      </div>\n'
            prev_date = date
        html += '    </div>\n  </div>\n'

    # Phase events
    phase_labels = {
        "INIT": ("🔍", "INIT 调查活动"),
        "PRE_INVESTIGATION": ("🔶", "PRE_INVESTIGATION 调查活动"),
        "FIELDWORK": ("⚡", "FIELDWORK 调查活动"),
        "REVIEWING": ("📋", "REVIEWING 调查活动"),
        "CLOSED": ("✅", "CLOSED 结案活动"),
    }
    for phase in PHASE_ORDER:
        evts = data["phases"].get(phase, [])
        if not evts:
            continue
        icon, label = phase_labels.get(phase, ("📋", phase))
        dates = [e["date"] for e in evts if e.get("date")]
        date_range = f"{min(dates)} ~ {max(dates)}" if dates and min(dates) != max(dates) else (min(dates) if dates else "")

        html += f'  <div class="tl-section">\n'
        html += f'    <div class="tl-section-title"><span class="tl-section-icon">{icon}</span> {label}<span class="tl-section-range">{date_range}</span></div>\n'
        html += '    <div class="tl-list">\n'
        prev_date = None
        for evt in sorted(evts, key=lambda x: x.get("moment", "")):
            date = evt["date"]
            marker = evt.get("marker", "")
            is_cont = (date == prev_date)
            
            item_cls = ""
            if marker == "✅":
                item_cls = "tl-marker-done"
            elif marker == "⚠️":
                item_cls = "tl-marker-warn"
            if is_cont:
                item_cls += " tl-continuation"
            
            marker_cls = ""
            marker_html = ""
            if marker == "✅":
                marker_cls = "done"
                marker_html = f'<span class="tl-content-marker {marker_cls}">{marker}</span>'
            elif marker == "⚠️":
                marker_cls = "warn"
                marker_html = f'<span class="tl-content-marker {marker_cls}">{marker}</span>'

            html += f'      <div class="tl-item {item_cls}">\n'
            html += f'        <span class="tl-date">{"" if is_cont else date}</span>\n'
            html += f'        <div class="tl-content"><span class="tl-content-text">{marker_html}{evt["title"]}</span></div>\n'
            html += '      </div>\n'
            prev_date = date
        html += '    </div>\n  </div>\n'

    # ── Part 2: Hypothesis Evolution ──
    if data["conf_changes"]:
        html += '  <h2 style="font-size:15px;margin:24px 0 16px;color:var(--text-primary)">💡 假设矩阵演进</h2>\n'
        for hyp in data["hypotheses"]:
            hid = hyp["hypothesis_id"]
            conf = hyp.get("confidence", 0)
            stmt = hyp["statement"]
            conf_cls = "hyp-conf-high" if conf > 0.6 else "hyp-conf-mid" if conf > 0.3 else "hyp-conf-low"

            html += f'  <div class="hyp-card">\n'
            html += f'    <div class="hyp-card-header">\n'
            html += f'      <span class="hyp-card-id">{hid}</span>\n'
            html += f'      <span class="hyp-card-stmt">{stmt}</span>\n'
            html += f'      <span class="hyp-conf-badge {conf_cls}">{conf}</span>\n'
            html += f'    </div>\n'
            html += f'    <div class="hyp-card-body">\n'

            # Find changes for this hypothesis
            for date in sorted(data["conf_changes"].keys()):
                for chg_hid, old_c, new_c, note in data["conf_changes"][date]:
                    if chg_hid != hid:
                        continue
                    if old_c is None:
                        arrow = "🆕 新增"
                        arrow_cls = ""
                    elif new_c > old_c:
                        arrow = f"↑ {old_c} → {new_c}"
                        arrow_cls = "up"
                    elif new_c < old_c:
                        arrow = f"↓ {old_c} → {new_c}"
                        arrow_cls = "down"
                    else:
                        arrow = f"→ {new_c} 维持"
                        arrow_cls = ""
                    html += f'      <div class="hyp-change"><span class="hyp-change-date">{date}</span><span class="hyp-change-arrow {arrow_cls}">{arrow}</span><span class="hyp-change-note">{note}</span></div>\n'

            html += '    </div>\n  </div>\n'

    # ── Part 3: Evidence Timeline ──
    if data["evidence"]:
        html += '  <h2 style="font-size:15px;margin:24px 0 16px;color:var(--text-primary)">📄 证据节点时间线</h2>\n'
        
        type_groups = {}
        for ev in data["evidence"]:
            ev_type = ev.get("type", "documentary")
            section = EVIDENCE_TYPE_SECTIONS.get(ev_type, "其他证据")
            if section not in type_groups:
                type_groups[section] = []
            type_groups[section].append(ev)

        for section_name, evs in type_groups.items():
            html += f'  <div class="ev-type-header">{section_name}</div>\n'
            for ev in evs:
                eid = ev.get("evidence_id", "")
                date = get_date_only(ev.get("collected_at", ""))
                summary = ev.get("summary", "")
                # 截短摘要
                for sep in ["—", "—", "。", "，"]:
                    if sep in summary:
                        summary = summary.split(sep)[0]
                        break
                summary = summary.strip()
                money = extract_money_from_text(ev.get("summary", ""))
                
                html += f'  <div class="ev-row">\n'
                html += f'    <span class="ev-id">{eid}</span>\n'
                html += f'    <span class="ev-date">{date}</span>\n'
                html += f'    <span class="ev-summary">{summary}</span>\n'
                if money:
                    html += f'    <span class="ev-money">{money}</span>\n'
                html += '  </div>\n'

    html += '</div>\n</body>\n</html>'
    return html


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_timeline_html.py <case_dir>", file=sys.stderr)
        sys.exit(1)

    case_dir = Path(sys.argv[1]).resolve()
    registry = load_registry(case_dir)
    changelog = load_changelog(case_dir)
    case_id = get_case_title(registry)

    print(f"📋 生成 HTML 时间线: {case_id}")
    print(f"   CHANGELOG: {len(changelog)} 条变更")

    data = collect_timeline_data(registry, case_dir, changelog)
    html = generate_html(data)

    output_path = case_dir / "case_timeline.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"✅ 已生成: {output_path}")
    print(f"   大小: {output_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
