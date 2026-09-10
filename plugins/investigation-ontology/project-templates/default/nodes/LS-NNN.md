---
# ── IDENTITY ──
id: LS-001
type: clue
status: draft                    # draft | ready | superseded

# ── PURPOSE ──
title: "[断言事实，如 项目名称纯属虚构]"
intent: "[目的声明——这条线索要支撑什么结论？]"

# ── RELATIONS ──
relations:
  derived_from:
    - id: EV-001
      excerpt: "[具体引用位置]"
      form: text                   # text | screenshot | data | document | interview
    - id: EV-003
      excerpt: "[具体引用位置]"
      form: data
  supports:
    - ARG-001
  contradicts: []
  involves:
    - ENT-001

# ── CLASSIFICATION ──
theme: "[主题标签，如 address-anomaly]"

# ── AUDIT ──
generated_by: ai                 # ai | human | ai+human
reviewed_by: ""
reviewed_at: ""
supersedes: ""
---

# LS-001: [断言事实]

## 提炼内容

[从原始证据中提取的核心事实——每条结论标注来源 EV-ID]

## 关键发现

[列表或表格——每条发现必须标注上游 EV-ID]

## 下一步

[还需补充的证据或分析——指向调查缺口]

---
## 关联文件
- 上游来源: EV-001, EV-003
