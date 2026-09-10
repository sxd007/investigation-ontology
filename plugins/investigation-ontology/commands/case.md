---
description: 案件状态和跟踪 — 查看所有案件状态、进度、时间线
---

# /case

多案件跟踪管理。

## Usage
```
/case list                  列出所有案件状态
/case status [case#]        查看单个案件详情
/case timeline [case#]      案件时间线
/case dashboard             案件总览仪表盘
```

## Process
提供案件全景视图，帮助管理多个并行调查案件。遵循 case-management 技能的案件生命周期管理框架。

### `/case timeline [case#]`

1. 确认案件目录路径（如 `cases/{case_id}/`）
2. 读取 `evidence_registry.json` 和 `CHANGELOG.json` 确认数据就绪
3. 执行 `python skills/case-management/scripts/generate_timeline_h_html.py <case_dir>`
   - 如无 Python，由 AI 按 `skills/case-management/references/case-timeline-visualization.md` 规范手动生成
4. 用浏览器打开生成的 `case_timeline_h.html`
5. AI 在脚本基线上补充语义判断（合并摘要、investigation_action 分类）

> 📖 完整指南：`skills/case-management/references/case-timeline-visualization.md`
