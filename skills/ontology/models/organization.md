# Organization（组织/机构）

> Object Type: `Organization` · 存储路径: `entities/organization/{id}.yaml` · ID 前缀: `O-`

## Schema

```yaml
meta:
  id: "O-{NNNN}"               # 全局唯一，O-0001 起
  type: Organization
  lifecycle_status: UNRESOLVED  # UNRESOLVED | VERIFIED | DISPUTED | SEALED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "system"
  source_evidence_ref: "ev-010"

properties:
  name_official: "XX科技有限公司"  # 工商登记全称，必填
  aliases:                       # 别名/曾用名
    - "XX科技"
  org_type: "vendor"             # vendor | shell | employer | government | intermediary
  tax_id: "91110108MA..."       # 统一社会信用代码
  registration_no: ""            # 工商注册号

links:
  employees:                     # 指向 entities/person/
    - "P-0001"
  has_accounts:                  # 指向 entities/account/
    - "acc-0012"
  parent_org: null               # 指向 entities/organization/（母子公司）

audit:
  - action: "entity_created"
    at: "2026-06-22T00:00:00Z"
    by: "system"
```

## 生命周期状态机

同 Person，参见 `models/person.md`。

## 字段约束

| 字段 | 必填 | 唯一性 | 校验时机 |
|------|------|--------|---------|
| `name_official` | ✅ | — | ADMIT_CANDIDATE |
| `tax_id` | — | 全域唯一 | RESOLVE_ENTITY |
| `org_type` | ✅ | — | ADMIT_CANDIDATE |

## org_type 枚举

| 值 | 含义 |
|---|------|
| `vendor` | 供应商/乙方 |
| `shell` | 疑似壳公司 |
| `employer` | 雇主/甲方 |
| `government` | 政府机构 |
| `intermediary` | 中间人/代理商 |

## 关联类型

| 关联 | 方向 | 目标类型 | 语义 |
|------|------|---------|------|
| `employees` | Org ← Person | Person | 雇佣关系 |
| `has_accounts` | Org → Account | Account | 持有账户 |
| `parent_org` | Org → Org | Organization | 母子公司 |

## 建模指南

- **org_type 判断**：初步调查阶段可能不确定是 `vendor` 还是 `shell`，可以先填 `vendor`，后续通过 `RESOLVE_ENTITY` 修正
- **集团关系**：母子公司用 `parent_org` 字段，不要用 Relation 的 `HAS_ACCOUNT` 表达股权
- **与 Person 的边界**：个体工商户按 Organization 建模（有工商登记），自然人按 Person