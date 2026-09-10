# 本体关系模板：Relation（实体间关系）

## 文件路径
`global_ontology/relations/{id}.yaml`

```yaml
meta:
  relation_id: "R-{NNNN}"
  relation_type: "TRANSFERRED"   # TRANSFERRED | HAS_ACCOUNT | WORKS_AT | ...
  evidence_tier: "HARD"          # HARD | SOFT | LEAD
  source_evidence_refs:
    - "ev-010"
  confidence: 1.0                # 0.0-1.0 (仅 SOFT/LEAD 有效)
  valid_time:
    start: "2023-11-05T10:00:00Z"
    end: null
  observed_time: "2026-06-21T09:00:00Z"
  superseded_by: null            # 被替代时指向新 Relation ID

core:
  from_entity: "acc-0012"        # 起点实体 ID
  to_entity: "acc-0099"          # 终点实体 ID
  properties:
    amount: 380000.00
    currency: "CNY"
    description: "资金转移"
```