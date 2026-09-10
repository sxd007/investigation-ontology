# 本体实体模板：Evidence（证据）

## 文件路径
`global_ontology/entities/evidence/{id}.yaml`

```yaml
meta:
  id: "ev-{NNN}"
  type: Evidence
  lifecycle_status: ACTIVE       # ACTIVE | SEALED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "auditor_zhang"
  case_ref: "CASE-2026-001"     # 所属案件

integrity:
  raw_file_path: "cases/CASE-2026-001/raw/ev-010_bank_statement.csv"
  sha256: "a3f2c8d..."
  acquired_by: "auditor_zhang"
  acquired_at: "2026-06-19T11:00:00Z"
  sealed: false                  # false = 可修改, true = 已冻结

properties:
  evidence_type: "BANK_STATEMENT"
  source: "XX银行"
  extracted_data_summary:
    row_count: 10000
    total_amount: 50000000.00
    currency: CNY

links:
  belongs_to_case: "CASE-2026-001"
  supports_relations:
    - "R-001"
    - "R-002"
```