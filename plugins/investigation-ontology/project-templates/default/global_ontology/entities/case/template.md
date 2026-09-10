# 本体实体模板：Case（案件）

## 文件路径
`global_ontology/entities/case/{id}.yaml`

```yaml
meta:
  id: "case-{NNNN}"
  type: Case
  lifecycle_status: ACTIVE       # ACTIVE | CLOSED | REOPENED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "auditor_li"
  source_evidence_ref: "ev-001"  # 触发案件的初始证据

properties:
  case_id: "CASE-2026-001"
  title: "XX科技系列付款异常"
  trigger_type: "REPORT"         # REPORT | DATA_DRIVEN | CASE_EXPANSION
  parent_case_id: null
  lead_investigator: "auditor_li"
  time_window:
    start: "2023-01-01"
    end: "2024-02-29"

links:
  involved_entities:
    - "P-0001"
    - "O-0042"
    - "acc-0012"
  contained_evidence:
    - "ev-010"
    - "ev-011"

findings_refs:
  - "FND-001"                    # 指向认知层 nodes/FND-001.md
```