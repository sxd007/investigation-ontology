---
# ── IDENTITY ──
id: ENT-001
type: entity
entity_type: subject             # subject | organization | project | account | device | other

# ── PROFILE ──
name: "[角色: 名称，如 经办人: 邓富星]"
alias: []
role: "[在案件中的角色]"

# ── ONTOLOGY BINDING ──
ontology_ref:
  object_id: "P-0001"
  object_type: Person
  lifecycle_status: UNRESOLVED

# ── ATTRIBUTES ──
attributes:
  department: "[部门]"
  title: "[职位]"
  registration_no: "[工商注册号]"
  registration_date: "YYYY-MM-DD"
  status: active

# ── RELATIONS ──
relations:
  involves: []                   # 关联的其他 ENT-ID

# ── AUDIT ──
supersedes: ""

# ── NOTES ──
# 实体节点不声明推导关系（derived_from 不适用）。
# 其他节点通过 relations.involves 指向此实体。
---

# ENT-001: [角色: 名称]

## 背景

[实体背景描述]

## 涉案关联

[与其他案件要素的关系]

---
## 关联文件
- evidence_registry.json 中对应 entity_id: "ENT-001"
