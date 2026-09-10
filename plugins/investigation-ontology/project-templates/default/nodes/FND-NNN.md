---
# ── IDENTITY ──
id: FND-001
type: finding
status: draft                    # draft | ready | superseded

# ── CONCLUSION ──
statement: "[事实认定陈述——与 title 一致]"
confidence: probable             # suspected | probable | confirmed
fraud_type: "[关联舞弊类型]"

# ── RELATIONS ──
relations:
  derived_from:
    - id: ARG-001
      excerpt: "[引用位置]"
      form: text
  contradicts: []
  involves: []

# ── DISPUTES ──
main_dispute_points:
  - "[争议点 1]"
alternative_explanations:
  - explanation: "[替代解释]"
    status: rejected             # open | rejected | retained_for_followup
    response: "[排除理由]"

# ── AUDIT ──
generated_by: ai
reviewed_by: ""
reviewed_at: ""
supersedes: ""
---

# FND-001: [行为+违规类型]

## 事实认定

[详细结论陈述]

## 推理路径

[推理链图示：EV-ID+EV-ID → LS-ID → ARG-ID → FND-ID]

## 推理依据

[从支撑论据到结论的逻辑推导]

## 剩余怀疑

[仍然存在的不确定性]

---
## 关联文件
- evidence_registry.json 中对应 finding_id: "FND-001"
- 依赖论据: ARG-001
