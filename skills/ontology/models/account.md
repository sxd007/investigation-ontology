# Account（金融账户）

> Object Type: `Account` · 存储路径: `entities/account/{id}.yaml` · ID 前缀: `acc-`

## Schema

```yaml
meta:
  id: "acc-{NNNN}"             # 全局唯一，acc-0001 起
  type: Account
  lifecycle_status: UNRESOLVED  # UNRESOLVED | VERIFIED | DISPUTED | SEALED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "system"
  source_evidence_ref: "ev-010"

properties:
  account_no_hash: "sha256:abc..."  # 银行账号 SHA256（脱敏），必填
  account_label: "李XX 尾号8891"     # 人类可读标签
  account_type: "personal"           # personal | corporate | virtual
  bank_name: "XX银行"                # 开户行
  observed_transaction_volume: 1280000  # 观察期内交易总额
  fast_turnover: true                # 是否有快进快出特征

links:
  owner_id: "P-0001"              # 指向 entities/person/ 或 entities/organization/
  related_transactions:           # 指向 relations/（资金流关系）
    - "R-001"

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
| `account_no_hash` | ✅ | 全域唯一 | RESOLVE_ENTITY |
| `owner_id` | ✅（VERIFIED 后） | — | RESOLVE_ENTITY |

## account_type 枚举

| 值 | 含义 |
|---|------|
| `personal` | 个人账户 |
| `corporate` | 对公账户 |
| `virtual` | 虚拟账户（支付宝/微信支付等） |

## 关联类型

| 关联 | 方向 | 目标类型 | 语义 |
|------|------|---------|------|
| `owner_id` | Account → Person/Org | Person 或 Organization | 账户持有人 |
| `related_transactions` | Account → Relation | Relation (TRANSFERRED) | 涉及此账户的资金流 |

## 建模指南

- **UNRESOLVED 时期**：`account_no_hash` 和 `account_label` 即可创建，`owner_id` 可暂为空
- **owner_id 归属**：必须是 VERIFIED 的 Person 或 Organization，由 `RESOLVE_ENTITY` 校验
- **虚拟账户**：支付宝/微信支付等，`account_label` 填写平台名+脱敏 ID
- **快进快出检测**：`fast_turnover: true` 是挖掘信号的标记，不作为本体约束