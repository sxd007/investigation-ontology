# Evidence（证据）

> Object Type: `Evidence` · 存储路径: `entities/evidence/{id}.yaml` · ID 前缀: `ev-`

## Schema

```yaml
meta:
  id: "ev-{NNN}"                 # ev-001 起
  type: Evidence
  lifecycle_status: ACTIVE        # ACTIVE | SEALED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "auditor_zhang"
  case_ref: "CASE-2026-001"      # 所属案件

integrity:
  raw_file_path: "cases/CASE-2026-001/raw/ev-010_bank_statement.csv"
  sha256: "a3f2c8d..."           # 原始文件哈希（SEALED 后不可改）
  acquired_by: "auditor_zhang"
  acquired_at: "2026-06-19T11:00:00Z"
  sealed: false                   # false = 可修改, true = 已冻结

properties:
  evidence_type: "BANK_STATEMENT"  # 证据类型枚举
  source: "XX银行"                 # 证据来源
  extracted_data_summary:          # 提取的数据摘要
    row_count: 10000
    total_amount: 50000000.00
    currency: CNY

links:
  belongs_to_case: "CASE-2026-001"
  supports_relations:              # 指向 relations/（此证据支撑的关系）
    - "R-001"
    - "R-002"
```

## 生命周期状态机

```
ACQUIRE_EVIDENCE
      │
      ▼
    ACTIVE ─────────┐
      │             │
  SEAL_EVIDENCE     │
      │             │
      ▼             │
    SEALED          │
  (integrity 不可改) │
                    │
              SUPERSEDE_RELATION
              (引用此证据的关系被替代时不影响证据本身) 
```

## evidence_type 枚举

| 值 | 含义 |
|---|------|
| `BANK_STATEMENT` | 银行流水 |
| `INVOICE` | 发票 |
| `CONTRACT` | 合同 |
| `EMAIL` | 邮件 |
| `CHAT_RECORD` | 聊天记录 |
| `HR_RECORD` | 人事档案 |
| `OSINT` | 公开信息 |
| `INTERVIEW_TRANSCRIPT` | 访谈笔录 |
| `WHISTLEBLOWER_REPORT` | 举报材料 |
| `OTHER` | 其他 |

## 字段约束

| 字段 | 必填 | 冻结后可变 | 说明 |
|------|------|-----------|------|
| `integrity.sha256` | ✅ | ❌ | SEALED 后不可修改 |
| `integrity.raw_file_path` | ✅ | ❌ | SEALED 后不可修改 |
| `integrity.sealed` | ✅ | — | 只能 false→true，不可逆 |
| `properties.evidence_type` | ✅ | ❌ | 冻结后不可修改 |
| `properties.extracted_data_summary` | — | ✅（仅追加） | 可追加字段，不可删除已有 |

## 关联类型

| 关联 | 方向 | 目标类型 | 语义 |
|------|------|---------|------|
| `belongs_to_case` | Evidence → Case | Case | 所属案件 |
| `supports_relations` | Evidence → Relation | Relation | 此证据为哪些关系提供支撑 |

## 建模指南

- **冻结前 vs 冻结后**：`sealed=true` 后 integrity 块不可修改。纠错需通过 `SUPERSEDE_RELATION` 指向新证据
- **evidence_type 选择**：选最能描述原始载体的类型（BANK_STATEMENT > OTHER）
- **认知层 EV 节点**：每条 Evidence 在认知层对应一个 `nodes/EV-NNN.json`，通过 `ontology_ref` 绑定
- **保管链**：`acquired_by` + `acquired_at` 是保管链的起点，完整的链式记录在认知层 `evidence_registry.json` 中