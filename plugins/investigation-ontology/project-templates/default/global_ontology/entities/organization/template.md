# 本体实体模板：Organization（组织/机构）

## 文件路径
`global_ontology/entities/organization/{id}.yaml`

```yaml
meta:
  id: "O-{NNNN}"
  type: Organization
  lifecycle_status: UNRESOLVED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "system"
  source_evidence_ref: "ev-010"

properties:
  name_official: "XX科技有限公司"
  aliases:
    - "XX科技"
  tax_id: "91110108MA..."       # 统一社会信用代码
  org_type: "vendor"            # vendor | shell | partner | subsidiary

links:
  has_accounts:
    - "acc-0012"
  controlled_by:                # 控制人
    - "P-0001"

audit:
  - action: "entity_created"
    at: "2026-06-22T00:00:00Z"
    by: "system"
```