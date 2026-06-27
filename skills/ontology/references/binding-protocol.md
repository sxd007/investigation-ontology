# Binding Protocol（绑定协议）

> 认知层（investigation-ontology skills）与本体层（ontology）的接口契约。认知层通过此协议引用本体对象，继承其状态约束，但不在本体中复制推理逻辑。

## 架构定位

```
认知层（Epistemic Layer）               本体层（Ontology Layer）
─────────────────────────              ───────────────────────
nodes/ENT-001.json  ──ontology_ref──▶  entities/person/P-0001.yaml
nodes/EV-001.json   ──ontology_ref──▶  entities/evidence/ev-001.yaml
nodes/FND-001.md    ──引用 RELATION ──▶ relations/R-001.yaml (仅 HARD)
nodes/LS-001.md     ──不映射─────────▶  (无)
nodes/ARG-001.md    ──不映射─────────▶  (无)
nodes/HYP-001.md    ──不映射─────────▶  (无)
meta.json           ──不映射─────────▶  entities/case/case-001.yaml
                        (但 case_id 对应)
```

## ontology_ref 结构

```json
{
  "ontology_ref": {
    "object_id": "P-0001",
    "object_type": "Person",
    "lifecycle_status": "UNRESOLVED",
    "bound_at": "2026-06-22T10:00:00Z"
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `object_id` | ✅ | 指向本体文件的 ID |
| `object_type` | ✅ | Person / Organization / Account / Evidence / Case |
| `lifecycle_status` | ✅ | 继承自本体对象当前状态 |
| `bound_at` | ✅ | 绑定时间戳 |

## 映射规则

| 认知层对象 | → 本体层对象 | 继承字段 | 不映射内容 |
|-----------|------------|---------|-----------|
| ENT 节点 | → Entity Object | lifecycle_status (UNRESOLVED/VERIFIED/DISPUTED/SEALED) | entity_type 的 role 属性 |
| EV 节点 | → Evidence Object | sealed (true/false) | evidence 的分析内容 |
| FND 节点 | → 引用 Relation (仅 HARD) | evidence_tier | 推理路径、剩余怀疑、辩解回应 |
| LS/ARG/HYP 节点 | → 不映射 | — | 纯推理层内部对象 |
| meta.json (case 阶段) | → 不映射到 Case lifecycle_status | — | 调查阶段 ≠ 本体生命周期 |

## 关键约束

1. 认知层 ENT 节点必须映射到一个本体 Entity，且继承其 `lifecycle_status`
2. 认知层 EV 节点必须映射到一个本体 Evidence，且继承其 `sealed` 状态
3. 认知层 FND 节点只能引用 `evidence_tier=HARD` 的本体 Relation
4. LS/ARG/HYP 节点不映射本体对象，仅在推理层内部引用
5. Case 的调查阶段（INIT/PRE/FIELDWORK/REVIEWING/CLOSED）与本体 `lifecycle_status`（ACTIVE/CLOSED/REOPENED）是**两个独立维度**

## 两层状态独立性

一个 Entity 可以是 `VERIFIED`（本体层已确认），同时引用它的 FND 节点可以是 `draft`（推理层未写完）。两者独立运行，互不干扰。

向用户输出时必须分开标注：
> 当前调查阶段：REVIEWING ｜ 本体状态：3 个实体 VERIFIED，1 个 DISPUTED

## ID 命名空间

| 层 | 前缀 | 示例 | 说明 |
|----|------|------|------|
| 本体层 Person | `P-` | `P-0001` | 自然人 |
| 本体层 Organization | `O-` | `O-0042` | 组织/机构 |
| 本体层 Account | `acc-` | `acc-0012` | 金融账户 |
| 本体层 Evidence | `ev-` | `ev-010` | 证据 |
| 本体层 Case | `CASE-YYYY-NNN` | `CASE-2026-001` | 案件 |
| 本体层 Relation | `R-` | `R-001` | 关系 |
| 认知层 Evidence | `EV-` | `EV-001` | 证据节点 |
| 认知层 Entity | `ENT-` | `ENT-001` | 实体节点 |
| 认知层 Finding | `FND-` | `FND-001` | 事实认定 |

> 统一使用连字符分隔符（`acc-0012` 而非 `acc_0012`）。

## 偏移防御

不追求实时同步，而是在关键 Action 执行时现场校验。四层防御：

| Layer | 机制 | 生效时刻 |
|-------|------|---------|
| 1 | CLAUDE.md + Skill 中的约束描述 | 创建节点时（效率层） |
| 2 | JSON Schema + pre-commit hook | 提交时 |
| 3 | PreToolUse Hook + validate-ontology-action.sh | 写入本体文件时（核心防线） |
| 4 | scripts/audit-binding.sh 定期巡检 | 巡检时（最终兜底） |

PostToolUse Hook（`check-ontology-ref.sh`）在写入 `nodes/ENT-*.json` 或 `nodes/EV-*.json` 后立即检查 `ontology_ref` 是否存在且有效。