# Action: ADMIT_CANDIDATE

> 将挖掘候选升级为本体实体或关系。
> **本文件为参考文档**，操作时由 `hooks/hooks.json` 中的 `PreToolUse Hook` + `scripts/validate-ontology-action.sh` 自动校验前置条件。

---

## □ 前置条件检查清单

### □ 1. 候选状态检查
- 读取 `derived/mining_results/` 下对应的 Candidate 文件
- `candidate.status` 的值：_____
- 是否为 `pending_review`？是 / 否
- ❌ 如果不满足：终止操作，告知用户该 Candidate 状态不是 pending_review

### □ 2. 操作者权限
- 确认当前操作者是调查员或主调查员
- ❌ 如果不满足：终止操作，告知用户权限不足

### □ 3. 身份归一检查（仅 Person/Organization 类型）
- 如果 candidate.type 是 Person 或 Organization：
  - 搜索 `global_ontology/entities/person/` 和 `global_ontology/entities/organization/` 目录下所有已有实体
  - 检查 tax_id / id_card_hash / name 是否与已有实体冲突
- ❌ 如果冲突：终止操作，提示发现冲突实体，建议先执行 `MERGE_ENTITIES` 或人工复核

### □ 4. 引用有效性检查（中间态校验）
- `source_evidence_ref` 指向的本体 Evidence 是否存在？
- 该 Evidence 是否被 `superseded`？（被替代的证据仍可用于创建实体，但应提醒）
- 如果要创建关系，from_entity 和 to_entity 是否已通过 ADMIT_CANDIDATE 或 RESOLVE_ENTITY 创建？
- ❌ 如果核心引用不存在：终止操作

## 执行步骤

### 步骤 1：创建本体对象
- **如果是实体类型**：
  - 在 `global_ontology/entities/{type}/` 目录下创建新 YAML 文件
  - `lifecycle_status` 设为 `UNRESOLVED`
  - `source_evidence_ref` 设为 candidate 的 source_evidence_ref
- **如果是关系类型**：
  - 在 `global_ontology/relations/` 目录下创建新 YAML 文件
  - `evidence_tier` 设为 `HARD`
  - `source_evidence_refs` 设为 candidate 的 source_evidence_ref

### 步骤 2：更新 Candidate 状态
- 修改：`status: "admitted"`, `admitted_by`, `admitted_at`

### 步骤 3：更新认知层节点
- 在 `nodes/` 中对应的 ENT/EV 节点添加 `ontology_ref` 字段
- 指向步骤 1 创建的本体对象

### 步骤 4：记录审计
- 在 `CHANGELOG.json` 追加 `candidate_admitted` 记录