# Person（自然人）

> Object Type: `Person` · 存储路径: `entities/person/{id}.yaml` · ID 前缀: `P-`

## Schema

```yaml
meta:
  id: "P-{NNNN}"               # 全局唯一，P-0001 起
  type: Person
  lifecycle_status: UNRESOLVED  # UNRESOLVED | VERIFIED | DISPUTED | SEALED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "system"
  source_evidence_ref: "ev-010" # 指向 entities/evidence/ 中的证据 ID

properties:
  name_primary: "法定姓名"       # 必填
  aliases:                       # 别名/曾用名
    - "张XX"
  id_card_hash: "sha256:..."    # 身份证 SHA256（脱敏）
  hr_code: "EMP-00123"          # 工号（如适用）
  tax_id: ""                     # 税号（如适用）

links:
  employed_by: "O-0042"         # 指向 entities/organization/
  has_accounts:                  # 指向 entities/account/
    - "acc-0012"

audit:
  - action: "entity_created"
    at: "2026-06-22T00:00:00Z"
    by: "system"
```

## 生命周期状态机

```
        ADMIT_CANDIDATE
              │
              ▼
         UNRESOLVED ──────────┐
              │               │
       RESOLVE_ENTITY   MERGE_ENTITIES
              │         (被合并到另一 Person)
              ▼               │
          VERIFIED            ▼
         │        │       SUPERSEDED
    DISPUTE_ENTITY  │    (superseded_by 指向目标)
         │      SEAL_ENTITY
         ▼           │
      DISPUTED       ▼
         │        SEALED
    RESOLVE_ENTITY
    (重新核实后可回 VERIFIED)
```

## 字段约束

| 字段 | 必填 | 唯一性 | 校验时机 |
|------|------|--------|---------|
| `name_primary` | ✅ | — | ADMIT_CANDIDATE |
| `id_card_hash` | — | 全域唯一 | RESOLVE_ENTITY |
| `hr_code` | — | 全域唯一 | RESOLVE_ENTITY |
| `tax_id` | — | 全域唯一 | RESOLVE_ENTITY |

## 关联类型

| 关联 | 方向 | 目标类型 | 语义 |
|------|------|---------|------|
| `employed_by` | Person → Org | Organization | 雇佣关系 |
| `has_accounts` | Person → Account | Account | 持有账户 |

## 建模指南

- **何时创建 Person vs Organization**：自然人用 Person，企业/机构/部门用 Organization
- **UNRESOLVED 时期**：可从举报线索初步创建（name_primary 即可），待核实后升级为 VERIFIED
- **别名处理**：多个别名指向同一人时，用 `aliases` 数组，不要创建多个 Person
- **身份冲突**：`RESOLVE_ENTITY` 执行时检测 `id_card_hash`/`hr_code` 冲突，冲突时拒绝并建议 `MERGE_ENTITIES`