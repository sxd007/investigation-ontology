# Relation（实体间关系）

> Link Type: `Relation` · 存储路径: `relations/{id}.yaml` · ID 前缀: `R-`

## Schema

```yaml
meta:
  relation_id: "R-{NNNN}"        # 全局唯一，R-001 起
  relation_type: "TRANSFERRED"    # 见关系类型枚举
  evidence_tier: "HARD"           # HARD | SOFT | LEAD
  source_evidence_refs:            # 支撑此关系的证据列表
    - "ev-010"
  confidence: 1.0                 # 0.0-1.0 (仅 SOFT 有效)
  valid_time:                     # 事实发生时间窗
    start: "2023-11-05T10:00:00Z"
    end: null
  observed_time: "2026-06-21T09:00:00Z"  # 系统/人记录此关系的时间
  superseded_by: null             # 被替代时指向新 Relation ID（Append-Only）

core:
  from_entity: "acc-0012"        # 起点实体 ID
  to_entity: "acc-0099"          # 终点实体 ID
  properties:                     # 关系特有的属性（按 relation_type 不同）
    amount: 380000.00
    currency: "CNY"
    description: "资金转移"
```

## 证据等级（Evidence Tier）

| Tier | 语义 | 可否独立支撑 FND | 采样场景 |
|------|------|-----------------|---------|
| **HARD** | 有原始证据直接证明 | ✅ 可用于事实认定 | 银行流水中的转账记录、审批流中的审批节点 |
| **SOFT** | 多源间接关联，有置信度评分 | ❌ 仅作辅助线索 | 同电话号码、同地址、同 IP |
| **LEAD** | 单点弱信号/外部情报 | ❌ 仅作侦查方向 | 举报线索、名单命中 |

## 关系类型枚举

### STRUCTURAL（结构性关系，默认 HARD）

| 类型 | 语义 | from → to | 关键属性 |
|------|------|-----------|---------|
| `HAS_ACCOUNT` | 拥有账户 | Person/Org → Account | — |
| `WORKS_AT` | 任职 | Person → Organization | role, start_date |
| `ROLE_AT` | 控制/董监高 | Person → Organization | role_type (director/supervisor/legal_rep) |

### BEHAVIORAL（行为性关系，默认 HARD）

| 类型 | 语义 | from → to | 关键属性 |
|------|------|-----------|---------|
| `TRANSFERRED` | 资金转移 | Account → Account | amount, currency |
| `APPROVED` | 审批 | Person → (document/order) | approval_result, amount |
| `SUBMITTED` | 提交 | Person → (document/order) | document_type, amount |

### INTELLIGENCE（情报性关系，默认 SOFT/LEAD）

| 类型 | 语义 | from → to | 关键属性 |
|------|------|-----------|---------|
| `SHARED_ATTR` | 共享属性 | Person/Org → Person/Org | shared_attr (phone/ip/address) |
| `CIRCLE_LINK` | 圈子关联 | Person → Person | circle_type, frequency |
| `LEAD_MATCH` | 线索匹配 | Entity → Entity | source (举报/名单/外部情报) |

## 字段约束

| 字段 | 必填 | 说明 |
|------|------|------|
| `evidence_tier` | ✅ | HARD/SOFT/LEAD |
| `source_evidence_refs` | ✅（HARD） | HARD 必须绑定至少一条证据 |
| `valid_time` | ✅（资金/任职/控制类） | 涉及时间属性的关系必须填写 |
| `confidence` | —（仅 SOFT 有效） | 0.0-1.0 |
| `superseded_by` | — | Append-Only，被替代时非空 |

## PreToolUse Hook 校验项

写入 `relations/*.yaml` 时，`validate-ontology-action.sh` 自动校验：

1. `source_evidence_refs` 非空（HARD 层级）
2. `from_entity` / `to_entity` 指向的实体存在
3. 引用实体的 `lifecycle_status` 非 UNRESOLVED
4. 引用实体未被 `superseded`（无 `superseded_by` 字段）
5. 新关系未被已存在关系 `superseded_by` 引用

## 建模指南

- **Tier 选择**：有原始证据（银行流水截图/审批记录）→ HARD；多源关联但无直接证据 → SOFT；举报线索 → LEAD
- **方向约定**：TRANSFERRED 的 from→to 表示资金流向（from 转出 to 转入）
- **替代不删除**：需要修正关系时，创建新 Relation 并在旧 Relation 上设置 `superseded_by`，不要直接修改或删除
- **SOFT 的 confidence**：建议 ≤ 0.7（避免一条 SOFT 关系被当作"HARD-like"使用）