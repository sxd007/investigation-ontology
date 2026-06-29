# 本体实体模板：Person（自然人）

## 文件路径
`global_ontology/entities/person/{id}.yaml`

## 字段定义
```yaml
meta:
  id: "P-{NNNN}"               # 全局唯一，P-0001 起
  type: Person
  lifecycle_status: UNRESOLVED  # UNRESOLVED | VERIFIED | DISPUTED | SEALED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "system"
  source_evidence_ref: "ev-010" # 指向 global_ontology/entities/evidence/ 中的证据 ID

properties:
  name_primary: "张三"           # 法定姓名
  aliases:                       # 别名/曾用名
    - "张XX"
  id_card_hash: "sha256:..."    # 身份证 SHA256（脱敏）
  hr_code: "EMP-00123"          # 工号（如适用）
  tax_id: ""                     # 税号（如适用）

links:
  employed_by: "O-0042"         # 指向 global_ontology/entities/organization/
  has_accounts:                  # 指向 global_ontology/entities/account/
    - "acc-0012"

audit:
  - action: "entity_created"
    at: "2026-06-22T00:00:00Z"
    by: "system"
```

## 创建约束
- `id_card_hash` 和 `hr_code` 在全域内唯一（由 `RESOLVE_ENTITY` 前置条件校验）
- `lifecycle_status` 初始为 `UNRESOLVED`，后续通过 `RESOLVE_ENTITY` 升级