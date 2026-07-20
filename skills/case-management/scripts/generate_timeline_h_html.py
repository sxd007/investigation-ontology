#!/usr/bin/env python3
"""
generate_timeline_h.py — 生成横向时间轴 HTML（信息块上下交替）

Usage:
    python generate_timeline_h.py <case_dir>

Output:
    <case_dir>/case_timeline_h.html
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
from generate_timeline import (
    load_registry, load_changelog, load_node_frontmatter,
    get_case_title, get_date_only, parse_date,
    extract_money_from_text, shorten_evidence_summary,
    extract_hyp_confidence_changes,
    SECTION_ICONS, TAG_TO_SECTION, EVIDENCE_TYPE_SECTIONS, PHASE_ORDER,
)


def collect_data(registry, case_dir, changelog):
    """收集并分组时间线数据（复用 generate_timeline_html.py 逻辑）"""
    events = registry.get("metadata", {}).get("event_timeline") or registry.get("event_timeline", [])
    entities = registry.get("entities", [])
    hypotheses = registry.get("hypotheses", [])
    evidence = registry.get("evidence_items", [])

    # 背景事件
    background = []
    for ent in entities:
        body_path = case_dir / "nodes" / f"{ent.get('entity_id', '')}.md"
        if body_path.exists():
            body = body_path.read_text(encoding="utf-8")
            m = re.search(r'成立[于日期]*[:：\s]*(\d{4}[-年]\d{1,2}[-月]\d{1,2})', body)
            if m:
                bg_date = m.group(1).replace("年", "-").replace("月", "-").replace("日", "")
                background.append({"date": bg_date, "title": f"{ent.get('name', '')}注册成立", "marker": ""})

    # 合并 registry + changelog
    all_events = []
    for evt in events:
        all_events.append({
            "moment": evt.get("moment", ""), "date": get_date_only(evt.get("moment", "")),
            "title": evt.get("title", ""), "desc": evt.get("description", ""),
            "tags": evt.get("tags", []), "source": "registry", "action": "", "marker": "",
        })

    for chg in changelog:
        action = chg.get("action", "")
        summary = chg.get("summary", "")
        if action == "evidence_registered":
            chg_date = get_date_only(chg.get("timestamp", ""))
            if any(get_date_only(e.get("moment", "")) == chg_date and
                   any(ev_id in e.get("title", "") for ev_id in chg.get("related_ids", []) if ev_id.startswith("EV-"))
                   for e in all_events):
                continue

        marker = "✅" if action == "stage_transition" else ("⚠️" if "阻塞" in summary else "")
        all_events.append({
            "moment": chg.get("timestamp", ""), "date": get_date_only(chg.get("timestamp", "")),
            "title": summary, "desc": chg.get("detail", ""),
            "tags": [], "source": "changelog", "action": action, "marker": marker,
        })

    all_events.sort(key=lambda x: x.get("moment", ""))

    # 按阶段分组
    external = list(background)
    phase_events = {p: [] for p in PHASE_ORDER}
    current_phase = "INIT"

    for evt in all_events:
        action = evt.get("action", "")
        if action == "stage_transition":
            phase_events[current_phase].append(evt)
            for phase in PHASE_ORDER:
                if phase in evt.get("desc", "") and phase != current_phase:
                    current_phase = phase
                    break
            continue
        if evt["source"] == "registry":
            assigned = False
            for tag in evt.get("tags", []):
                if tag in TAG_TO_SECTION:
                    sec = TAG_TO_SECTION[tag]
                    if sec == "external": external.append(evt)
                    else: phase_events[sec].append(evt)
                    assigned = True
                    break
            if not assigned:
                if any(t in evt.get("tags", []) for t in ["evidence", "investigation", "background_check", "expense_analysis", "quotation", "contract", "official_letter"]):
                    phase_events[current_phase].append(evt)
                else:
                    external.append(evt)
        else:
            phase_events[current_phase].append(evt)

    # 去重
    def dedupe(evts):
        kept = []
        for evt in evts:
            t = evt["title"]
            if "阻塞" in t or "✅" in t:
                kept.append(evt); continue
            is_dup = False
            for k in kept:
                kt = k["title"]
                if "阻塞" in kt or "✅" in kt: continue
                def kw(s):
                    c = re.findall(r'[\u4e00-\u9fff]', s)
                    return set(''.join(c[i:i+2]) for i in range(len(c)-1))
                if len(kw(t) & kw(kt)) >= 4:
                    if len(t) > len(kt): kept[kept.index(k)] = evt
                    is_dup = True; break
            if not is_dup: kept.append(evt)
        return kept

    external = dedupe(external)
    for p in PHASE_ORDER:
        phase_events[p] = dedupe(phase_events[p])

    # 假设变化
    conf_changes = {}
    for chg in changelog:
        changes = extract_hyp_confidence_changes(chg.get("detail", ""))
        if changes:
            d = get_date_only(chg.get("timestamp", ""))
            conf_changes.setdefault(d, []).extend(changes)

    # 案件名
    case_name = ""
    for ent in entities:
        if "投诉对象" in ent.get("role", "") or "subject" in ent.get("role", ""):
            for e2 in entities:
                if "客户" in e2.get("role", "") or "甲方" in e2.get("role", ""):
                    case_name = f"{ent['name']}/{e2['name']}"
                    break
            break

    return {
        "external": sorted(external, key=lambda x: x.get("date", "")),
        "phases": phase_events, "hypotheses": hypotheses,
        "conf_changes": conf_changes,
        "evidence": sorted(evidence, key=lambda x: x.get("collected_at", "")),
        "case_id": get_case_title(registry), "case_name": case_name,
    }


def group_by_date(events):
    """将事件按日期分组，同日事件合并"""
    groups = {}
    for evt in events:
        d = evt["date"]
        if d not in groups:
            groups[d] = []
        groups[d].append(evt)
    return [(d, evts) for d, evts in sorted(groups.items())]


def generate_html(data):
    case_id = data["case_id"]
    case_name = data["case_name"]
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>横向时间线 — {case_id}</title>
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --bg-deep:#0f1923;--bg-panel:#162030;--bg-card:#1d2d3f;--bg-hover:#243548;
  --border:#2a3f56;--border-lit:#3a5570;
  --text-primary:#d8e6f0;--text-secondary:#7a9bb5;--text-dim:#4a6880;--text-id:#4ecdc4;
  --amber:#e8a020;--teal:#4ecdc4;--green:#52c97a;--red:#e85c5c;--purple:#9b7ae8;
  --c-external:#5a8aaa;--c-init:#4ecdc4;--c-pre:#e8a020;--c-field:#9b7ae8;--c-review:#7aaa5a;
  --radius:6px;--radius-lg:10px;
  --font-mono:'SF Mono','Fira Code','Cascadia Code',monospace;
  --font-body:'Inter',system-ui,-apple-system,sans-serif
}}
body{{background:var(--bg-deep);color:var(--text-primary);font-family:var(--font-body);font-size:14px;line-height:1.6}}
.container{{max-width:1400px;margin:0 auto;padding:24px 20px}}

.header{{display:flex;align-items:center;gap:12px;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid var(--border)}}
.header-badge{{background:rgba(232,160,32,.15);border:1px solid var(--amber);color:var(--amber);font-family:var(--font-mono);font-size:12px;padding:3px 10px;border-radius:3px;font-weight:600}}
.header-title{{font-size:18px;font-weight:600}}
.header-subtitle{{font-size:12px;color:var(--text-secondary)}}
.header-meta{{margin-left:auto;font-size:11px;color:var(--text-dim);text-align:right}}

h2{{font-size:15px;margin:28px 0 16px;color:var(--text-primary)}}

/* ═══ 横向时间轴 ═══ */
.h-section{{margin-bottom:36px}}
.h-section-header{{
  display:flex;align-items:center;gap:8px;margin-bottom:16px;
  padding:6px 14px;background:var(--bg-panel);border:1px solid var(--border);border-radius:var(--radius);
  border-left:3px solid var(--accent,var(--teal));
}}
.h-section-icon{{font-size:15px}}
.h-section-label{{font-size:13px;font-weight:600}}
.h-section-range{{font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-left:auto}}

/* 时间轴轨道 */
.h-track{{
  position:relative;
  display:flex;
  padding:90px 20px 90px 20px;
  overflow-x:auto;
  min-width:100%;
}}
.h-track::before{{
  content:'';position:absolute;
  top:50%;left:20px;right:20px;
  height:2px;
  background:linear-gradient(90deg,transparent,var(--accent,var(--border-lit)) 5%,var(--accent,var(--border-lit)) 95%,transparent);
  transform:translateY(-50%);
}}

/* 事件槽 */
.h-slot{{
  flex:1;min-width:140px;
  display:flex;flex-direction:column;align-items:center;
  position:relative;
}}

/* 时间轴上的点 */
.h-dot{{
  width:12px;height:12px;border-radius:50%;
  background:var(--accent,var(--teal));
  border:2px solid var(--bg-deep);
  box-shadow:0 0 8px var(--accent,var(--teal));
  z-index:2;position:relative;
}}
.h-dot.done{{background:var(--green);box-shadow:0 0 8px var(--green)}}
.h-dot.warn{{background:var(--amber);box-shadow:0 0 8px var(--amber)}}

/* 日期标签 */
.h-date{{
  font-family:var(--font-mono);font-size:10px;
  color:var(--text-id);
  margin-top:6px;
  white-space:nowrap;
}}

/* 连接线 */
.h-connector{{
  width:1px;flex:0 0 30px;
  background:var(--border-lit);
}}

/* 信息卡 */
.h-card{{
  background:var(--bg-card);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:8px 12px;
  max-width:200px;
  min-width:120px;
  word-wrap:break-word;overflow-wrap:break-word;
  transition:all .15s;
  cursor:default;
}}
.h-card:hover{{background:var(--bg-hover);border-color:var(--border-lit)}}
.h-card-title{{font-size:12px;color:var(--text-primary);line-height:1.4;margin-bottom:2px}}
.h-card-marker{{font-size:11px;margin-right:3px}}
.h-card-marker.done{{color:var(--green)}}
.h-card-marker.warn{{color:var(--amber)}}

/* 上下交替 */
.h-slot.above{{flex-direction:column-reverse}}
.h-slot.above .h-connector{{margin-bottom:0}}
.h-slot.below{{flex-direction:column}}
.h-slot.below .h-connector{{margin-top:0}}

/* 同日多事件 */
.h-card-multi .h-card-item{{padding:3px 0;border-bottom:1px solid var(--border)}}
.h-card-multi .h-card-item:last-child{{border-bottom:none}}

/* ═══ 假设 ═══ */
.hyp-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}}
.hyp-card{{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}}
.hyp-card-header{{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-panel)}}
.hyp-id{{font-family:var(--font-mono);font-size:11px;color:var(--text-id);flex-shrink:0}}
.hyp-stmt{{font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.hyp-badge{{font-family:var(--font-mono);font-size:11px;padding:2px 8px;border-radius:3px;flex-shrink:0}}
.hyp-badge.high{{background:rgba(82,201,122,.15);color:var(--green);border:1px solid var(--green)}}
.hyp-badge.mid{{background:rgba(232,160,32,.15);color:var(--amber);border:1px solid var(--amber)}}
.hyp-badge.low{{background:rgba(232,92,92,.15);color:var(--red);border:1px solid var(--red)}}
.hyp-body{{padding:8px 14px}}
.hyp-chg{{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11px}}
.hyp-chg-date{{font-family:var(--font-mono);font-size:10px;color:var(--text-dim);flex:0 0 80px}}
.hyp-chg-arrow{{font-family:var(--font-mono);font-size:12px;flex:0 0 auto}}
.hyp-chg-arrow.up{{color:var(--green)}}
.hyp-chg-arrow.down{{color:var(--red)}}
.hyp-chg-note{{color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}

/* ═══ 证据 ═══ */
.ev-table{{width:100%;border-collapse:collapse}}
.ev-table th{{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim);text-align:left;padding:6px 10px;border-bottom:1px solid var(--border)}}
.ev-table td{{font-size:12px;padding:6px 10px;border-bottom:1px solid var(--border)}}
.ev-table tr:hover td{{background:var(--bg-hover)}}
.ev-id{{font-family:var(--font-mono);color:var(--text-id)}}
.ev-date{{font-family:var(--font-mono);font-size:10px;color:var(--text-dim)}}
.ev-money{{font-family:var(--font-mono);color:var(--amber)}}
.ev-type-row td{{background:var(--bg-panel);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-dim)}}

/* 滚动条 */
.h-track::-webkit-scrollbar{{height:6px}}
.h-track::-webkit-scrollbar-track{{background:transparent}}
.h-track::-webkit-scrollbar-thumb{{background:var(--border-lit);border-radius:3px}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <span class="header-badge">{case_id}</span>
    <div>
      <div class="header-title">{case_name} 横向时间轴</div>
      <div class="header-subtitle">evidence_registry.json + CHANGELOG.json</div>
    </div>
    <div class="header-meta">生成时间<br>{now}</div>
  </div>
"""

    # ── Part 1: Horizontal Timeline ──
    html += '  <h2>📋 案件全事件时间轴</h2>\n'

    # Phase colors
    phase_colors = {
        "external": "var(--c-external)",
        "INIT": "var(--c-init)",
        "PRE_INVESTIGATION": "var(--c-pre)",
        "FIELDWORK": "var(--c-field)",
        "REVIEWING": "var(--c-review)",
        "CLOSED": "var(--green)",
    }
    phase_labels = {
        "external": ("🕐", "案件外部事件"),
        "INIT": ("🔍", "INIT 调查活动"),
        "PRE_INVESTIGATION": ("🔶", "PRE_INVESTIGATION 调查活动"),
        "FIELDWORK": ("⚡", "FIELDWORK 调查活动"),
        "REVIEWING": ("📋", "REVIEWING 调查活动"),
        "CLOSED": ("✅", "CLOSED 结案活动"),
    }

    def render_track(events, phase_key, date_range):
        """渲染一段横向时间轴"""
        color = phase_colors.get(phase_key, "var(--teal)")
        icon, label = phase_labels.get(phase_key, ("📋", phase_key))

        html_parts = []
        html_parts.append(f'  <div class="h-section" style="--accent:{color}">\n')
        html_parts.append(f'    <div class="h-section-header">\n')
        html_parts.append(f'      <span class="h-section-icon">{icon}</span>\n')
        html_parts.append(f'      <span class="h-section-label">{label}</span>\n')
        html_parts.append(f'      <span class="h-section-range">{date_range}</span>\n')
        html_parts.append(f'    </div>\n')
        html_parts.append(f'    <div class="h-track">\n')

        date_groups = group_by_date(events)
        for i, (date, evts) in enumerate(date_groups):
            above = (i % 2 == 0)
            slot_cls = "above" if above else "below"

            # Dot class
            dot_cls = ""
            has_done = any(e.get("marker") == "✅" for e in evts)
            has_warn = any(e.get("marker") == "⚠️" for e in evts)
            if has_done:
                dot_cls = "done"
            elif has_warn:
                dot_cls = "warn"

            html_parts.append(f'      <div class="h-slot {slot_cls}">\n')

            if above:
                # Card → Connector → Dot → Date
                html_parts.append(f'        <div class="h-card{" h-card-multi" if len(evts)>1 else ""}">\n')
                for e in evts:
                    marker = e.get("marker", "")
                    m_cls = "done" if marker == "✅" else "warn" if marker == "⚠️" else ""
                    m_html = f'<span class="h-card-marker {m_cls}">{marker}</span>' if marker else ""
                    html_parts.append(f'          <div class="h-card-item"><span class="h-card-title">{m_html}{e["title"]}</span></div>\n')
                html_parts.append(f'        </div>\n')
                html_parts.append(f'        <div class="h-connector"></div>\n')
                html_parts.append(f'        <div class="h-dot {dot_cls}"></div>\n')
                html_parts.append(f'        <div class="h-date">{date}</div>\n')
            else:
                # Date → Dot → Connector → Card
                html_parts.append(f'        <div class="h-date">{date}</div>\n')
                html_parts.append(f'        <div class="h-dot {dot_cls}"></div>\n')
                html_parts.append(f'        <div class="h-connector"></div>\n')
                html_parts.append(f'        <div class="h-card{" h-card-multi" if len(evts)>1 else ""}">\n')
                for e in evts:
                    marker = e.get("marker", "")
                    m_cls = "done" if marker == "✅" else "warn" if marker == "⚠️" else ""
                    m_html = f'<span class="h-card-marker {m_cls}">{marker}</span>' if marker else ""
                    html_parts.append(f'          <div class="h-card-item"><span class="h-card-title">{m_html}{e["title"]}</span></div>\n')
                html_parts.append(f'        </div>\n')

            html_parts.append(f'      </div>\n')

        html_parts.append(f'    </div>\n  </div>\n')
        return ''.join(html_parts)

    # External events
    if data["external"]:
        ext_dates = [e["date"] for e in data["external"] if e.get("date")]
        date_range = f"{min(ext_dates)} ~ {max(ext_dates)}" if len(ext_dates) > 1 else (ext_dates[0] if ext_dates else "")
        html += render_track(data["external"], "external", date_range)

    # Phase events
    for phase in PHASE_ORDER:
        evts = data["phases"].get(phase, [])
        if not evts:
            continue
        dates = [e["date"] for e in evts if e.get("date")]
        date_range = f"{min(dates)} ~ {max(dates)}" if len(dates) > 1 and min(dates) != max(dates) else (min(dates) if dates else "")
        html += render_track(evts, phase, date_range)

    # ── Part 2: Hypothesis Evolution ──
    if data["conf_changes"]:
        html += '  <h2>💡 假设矩阵演进</h2>\n'
        html += '  <div class="hyp-grid">\n'
        for hyp in data["hypotheses"]:
            hid = hyp["hypothesis_id"]
            conf = hyp.get("confidence", 0)
            stmt = hyp["statement"]
            conf_cls = "high" if conf > 0.6 else "mid" if conf > 0.3 else "low"

            html += f'    <div class="hyp-card">\n'
            html += f'      <div class="hyp-card-header">\n'
            html += f'        <span class="hyp-id">{hid}</span>\n'
            html += f'        <span class="hyp-stmt">{stmt}</span>\n'
            html += f'        <span class="hyp-badge {conf_cls}">{conf}</span>\n'
            html += f'      </div>\n'
            html += f'      <div class="hyp-body">\n'

            for date in sorted(data["conf_changes"].keys()):
                for chg_hid, old_c, new_c, note in data["conf_changes"][date]:
                    if chg_hid != hid:
                        continue
                    if old_c is None:
                        arrow, a_cls = "🆕", ""
                    elif new_c > old_c:
                        arrow, a_cls = f"↑ {old_c}→{new_c}", "up"
                    elif new_c < old_c:
                        arrow, a_cls = f"↓ {old_c}→{new_c}", "down"
                    else:
                        arrow, a_cls = f"→ {new_c} 维持", ""
                    html += f'        <div class="hyp-chg"><span class="hyp-chg-date">{date}</span><span class="hyp-chg-arrow {a_cls}">{arrow}</span><span class="hyp-chg-note">{note}</span></div>\n'

            html += '      </div>\n    </div>\n'
        html += '  </div>\n'

    # ── Part 3: Evidence Table ──
    if data["evidence"]:
        html += '  <h2>📄 证据节点</h2>\n'
        html += '  <table class="ev-table">\n'
        html += '    <thead><tr><th>ID</th><th>日期</th><th>摘要</th><th>金额</th></tr></thead>\n    <tbody>\n'

        type_groups = {}
        for ev in data["evidence"]:
            t = ev.get("type", "documentary")
            s = EVIDENCE_TYPE_SECTIONS.get(t, "其他")
            type_groups.setdefault(s, []).append(ev)

        for section, evs in type_groups.items():
            html += f'      <tr class="ev-type-row"><td colspan="4">{section}</td></tr>\n'
            for ev in evs:
                eid = ev.get("evidence_id", "")
                date = get_date_only(ev.get("collected_at", ""))
                summary = ev.get("summary", "")
                for sep in ["—", "—", "。", "，"]:
                    if sep in summary:
                        summary = summary.split(sep)[0]; break
                summary = summary.strip()
                money = extract_money_from_text(ev.get("summary", ""))
                html += f'      <tr><td class="ev-id">{eid}</td><td class="ev-date">{date}</td><td>{summary}</td><td class="ev-money">{money}</td></tr>\n'

        html += '    </tbody>\n  </table>\n'

    html += '</div>\n</body>\n</html>'
    return html


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_timeline_h.py <case_dir>", file=sys.stderr)
        sys.exit(1)

    case_dir = Path(sys.argv[1]).resolve()
    registry = load_registry(case_dir)
    changelog = load_changelog(case_dir)
    case_id = get_case_title(registry)

    print(f"📋 生成横向时间轴: {case_id}")
    data = collect_data(registry, case_dir, changelog)
    html = generate_html(data)

    output_path = case_dir / "case_timeline_h.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"✅ 已生成: {output_path}")
    print(f"   大小: {output_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
