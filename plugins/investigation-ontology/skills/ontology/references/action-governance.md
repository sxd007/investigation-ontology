# Action 治理规则

> 每个 Action Type 定义一个操作契约：前置条件（preconditions）+ 效果（effects）。前置条件由本体层强制校验，认知层无法绕过。

## Action 分类

### 第一组：认知流水线（Epistemic Pipeline）

信息从原始数据晋升为本体对象的过程。

| Action | 语义 | 关键前置条件 | 效果 | 人工阀门 |
|--------|------|-------------|------|---------|
| `ACQUIRE_EVIDENCE` | 登记新证据 | raw_file 已存储，sha256 已计算 | 创建 Evidence（sealed=false） | 需人 |
| `RUN_MINING` | 执行挖掘 | 脚本为只读型 | 输出 Candidate（不写入本体） | 自动 |
| `ADMIT_CANDIDATE` | 采纳候选 | candidate.status=pending_review，admitted_by≠null | 创建 Entity（UNRESOLVED）或 Relation | **需人** |
| `RESOLVE_ENTITY` | 核实实体 | lifecycle_status=UNRESOLVED，有核实证据 | → VERIFIED | **需人** |
| `ASSERT_RELATION` | 声明关系 | source_evidence_refs 非空，valid_time 已填写 | 创建 Relation（evidence_tier=HARD） | **需人** |

### 第二组：治理行为（Governance Actions）

不改变认知内容，改变认知状态。

| Action | 语义 | 关键前置条件 | 效果 | 人工阀门 |
|--------|------|-------------|------|---------|
| `SEAL_EVIDENCE` | 冻结证据 | sealed=false | sealed=true，integrity 不可改 | **需人** |
| `SUPERSEDE_RELATION` | 替代关系 | old.superseded_by=null，new 有 HARD 证据 | old.superseded_by=new.id | 需人 |
| `MERGE_ENTITIES` | 合并实体 | 两实体均 VERIFIED | 一实体 superseded_by 另一实体，关系重定向 | **需人** |
| `DISPUTE_ENTITY` | 标记争议 | lifecycle_status=VERIFIED | → DISPUTED，触发复核 | 需人 |
| `SEAL_ENTITY` | 冻结实体 | lifecycle_status=VERIFIED | → SEALED，不可再修改 | **需人** |

### 第三组：案件生命周期（Case Lifecycle）

| Action | 语义 | 关键前置条件 | 效果 | 人工阀门 |
|--------|------|-------------|------|---------|
| `OPEN_CASE` | 立案 | 有初始线索/举报 | 创建 Case（ACTIVE） | 需人 |
| `CLOSE_CASE` | 结案 | case=ACTIVE，所有 involved_entities 非 UNRESOLVED，evidence 已 sealed，审计无 ERROR | → CLOSED | **需人** |
| `EXPORT_SNAPSHOT` | 导出快照 | case=CLOSED | 生成 YAML/Parquet 到 Cold Storage | 自动 |
| `REOPEN_CASE` | 重启案件 | case=CLOSED | → REOPENED | **需人** |

## Action 与核心原则映射

每个 Action 是某条核心原则的"可执行化身"：

| 核心原则 | 对应 Action | 如何体现 |
|---------|------------|---------|
| Evidence-Centric | `ACQUIRE_EVIDENCE`, `ASSERT_RELATION` | 创建实体/关系必须绑定证据 |
| Epistemic Layering | `ADMIT_CANDIDATE`, `DISPUTE_ENTITY` | 候选→实体是人工阀门，争议可回退 |
| Identity Resolution | `RESOLVE_ENTITY`, `MERGE_ENTITIES` | 身份归一受控执行 |
| Temporal Integrity | `ASSERT_RELATION` | 前置条件要求 valid_time |
| Append-Only Evolution | `SUPERSEDE_RELATION`, `SEAL_EVIDENCE` | 不删除，只替代/冻结 |

## PreToolUse Hook 覆盖的 Action

`scripts/validate-ontology-action.sh` 按写入路径自动匹配 Action 并现场校验：

| 写入路径 | 触发条件 | Action |
|---------|---------|--------|
| `global_ontology/entities/case/*.yaml` | lifecycle_status: CLOSED | CLOSE_CASE |
| `global_ontology/relations/*.yaml` | 新文件 | ASSERT_RELATION |
| `global_ontology/entities/(person\|organization\|account)/*.yaml` | UNRESOLVED→VERIFIED | RESOLVE_ENTITY |
| `global_ontology/entities/evidence/*.yaml` | sealed false→true | SEAL_EVIDENCE |
| `global_ontology/entities/(person\|org\|account\|evidence)/*.yaml` | 新文件 | ADMIT_CANDIDATE |

## 详细前置条件清单

各 Action 的逐条校验步骤见 `actions/` 目录（与本文件同目录）：

- [OPEN_CASE](actions/OPEN_CASE.md)
- [ACQUIRE_EVIDENCE](actions/ACQUIRE_EVIDENCE.md)
- [ADMIT_CANDIDATE](actions/ADMIT_CANDIDATE.md)
- [RESOLVE_ENTITY](actions/RESOLVE_ENTITY.md)
- [ASSERT_RELATION](actions/ASSERT_RELATION.md)
- [SEAL_EVIDENCE](actions/SEAL_EVIDENCE.md)
- [SUPERSEDE_RELATION](actions/SUPERSEDE_RELATION.md)
- [MERGE_ENTITIES](actions/MERGE_ENTITIES.md)
- [DISPUTE_ENTITY](actions/DISPUTE_ENTITY.md)
- [SEAL_ENTITY](actions/SEAL_ENTITY.md)
- [CLOSE_CASE](actions/CLOSE_CASE.md)

## 中间态校验要点

偏移更可能在中途发生，以下 Action 有额外的现场查询要求：

- **ASSERT_RELATION**：from_entity/to_entity 的当前 lifecycle_status、是否有 superseded_by
- **ADMIT_CANDIDATE**：source_evidence_ref 是否存在、from_entity/to_entity 是否已创建
- **RESOLVE_ENTITY**：引用证据是否已 sealed、引用 Relation 是否被 superseded
- **SEAL_EVIDENCE**：关联 Relation 是否被 superseded（提示，非阻断）