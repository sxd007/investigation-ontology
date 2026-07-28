---
# ── IDENTITY ──
id: EV-001
type: evidence
status: ready                    # draft | ready | superseded

# ── REGISTRATION ──
evidence_type: documentary       # system_data | documentary | digital_forensics | testimonial | physical | expert_opinion | state_transition_decision
subtype: contract
summary: "[证据完整陈述，供 treemap 弹窗等场景展开]"
source: "[证据来源说明]"
collected_by: "[收集人]"
collected_at: "2026-06-14T10:00:00+08:00"
location: "raw/EV-001.pdf"
hash: "sha256:..."

# ── ONTOLOGY BINDING ──
ontology_ref:
  object_id: "ev-0001"
  object_type: Evidence
  lifecycle_status: UNRESOLVED
  sealed: false

# ── CONFIDENCE ──
confidence: probable             # suspected | probable | confirmed
probative_value: medium          # low | medium | high

# ── RELATIONS ──
relations:
  derived_from: []
  corroborated_by: []            # 被哪些证据印证（EV-ID）
  contradicts:
    - HYP-002
  involves:
    - ENT-001

# ── AUDIT ──
generated_by: ai                 # ai | human | ai+human
reviewed_by: ""
reviewed_at: ""
supersedes: ""
---

# EV-NNN: [断言——谁+动作+事实，如"王赞供述: 扩容虚构"]

## 证据概述

[证据的详细描述、背景、提取过程]

## 关键内容摘要

[从证据中提取的关键事实片段]

## 使用说明

[该证据在调查中的使用限制、注意事项、关联线索]

---
## 关联文件
- evidence_registry.json 中对应条目 evidence_id: "EV-001"
- 原始文件位于 `raw/EV-001.pdf`
