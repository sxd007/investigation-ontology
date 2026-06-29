# Case（案件）

> Object Type: `Case` · 存储路径: `global_ontology/entities/case/{id}.yaml` · ID 前缀: `CASE-YYYY-NNN`

## Schema

```yaml
meta:
  id: "CASE-2026-001"            # 案件编号（格式: CASE-YYYY-NNN）
  type: Case
  lifecycle_status: ACTIVE        # ACTIVE | CLOSED | REOPENED
  created_at: "2026-06-22T00:00:00Z"
  created_by: "auditor_li"
  source_evidence_ref: "ev-001"  # 触发案件的初始线索/举报

properties:
  case_id: "CASE-2026-001"
  title: "XX科技系列付款异常"
  trigger_type: REPORT            # REPORT | DATA_DRIVEN | CASE_EXPANSION
  parent_case_id: null           # CASE_EXPANSION 时指向父案件
  lead_investigator: "auditor_li"
  time_window:
    start: "2023-01-01"
    end: "2024-02-29"

links:
  involved_entities:              # Case → INVOLVES → Entity
    - "P-0001"
    - "O-0042"
    - "acc-0012"
  contained_evidence:             # Case → CONTAINS → Evidence
    - "ev-010"
    - "ev-011"

findings_refs:                    # 指向认知层的事实认定节点（仅引用 ID）
  - "FND-001"

audit:
  - action: "case_opened"
    at: "2026-06-22T00:00:00Z"
    by: "auditor_li"
```

## 生命周期状态机

```
OPEN_CASE
    │
    ▼
  ACTIVE ──────────┐
    │              │
 CLOSE_CASE   REOPEN_CASE
    │         (从 CLOSED 回到 ACTIVE)
    ▼              │
  CLOSED ──────────┘
```

> ⚠️ **注意**：`lifecycle_status`（ACTIVE/CLOSED/REOPENED）是本体层状态，与认知层的**调查阶段**（INIT/PRE_INVESTIGATION/FIELDWORK/REVIEWING）是**两个独立维度**。向用户汇报时必须分开标注。

## trigger_type 枚举

| 值 | 含义 |
|---|------|
| `REPORT` | 举报触发 |
| `DATA_DRIVEN` | 数据分析触发 |
| `CASE_EXPANSION` | 案件扩展（从其他案件衍生） |

## 字段约束

| 字段 | 必填 | 说明 |
|------|------|------|
| `case_id` | ✅ | 格式 `CASE-YYYY-NNN` |
| `trigger_type` | ✅ | 见枚举 |
| `lead_investigator` | ✅ | 主调查员 |
| `time_window` | ✅ | 调查时间窗口 |

## 关联类型

| 关联 | 方向 | 目标类型 | 语义 |
|------|------|---------|------|
| `involved_entities` | Case → Entity | Person/Org/Account | 涉案实体 |
| `contained_evidence` | Case → Evidence | Evidence | 已收集的证据 |
| `findings_refs` | Case → FND (认知层) | FND 节点 | 指向认知层事实认定（仅 ID 引用） |

## 建模指南

- **findings_refs 的边界**：仅存储 FND 节点的 ID。FND 的推理路径（inference_path）、剩余怀疑（remaining_doubt）等逻辑内容由认知层 `nodes/FND-NNN.md` 承载
- **结案前置条件**（由 PreToolUse Hook 强制校验）：
  - 所有 `involved_entities` 的 `lifecycle_status` 非 UNRESOLVED
  - 所有 `contained_evidence` 的 `sealed = true`
  - 所有 FND 引用的 Relation 的 `evidence_tier = HARD`
  - `scripts/audit-binding.sh` 无 ERROR
- **REOPENED 后**：`lifecycle_status` 回到 ACTIVE，之前的状态变更记录保留在 `audit[]` 中