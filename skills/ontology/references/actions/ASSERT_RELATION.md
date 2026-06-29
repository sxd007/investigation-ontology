# Action: ASSERT_RELATION

> 声明实体间的关系（仅限 HARD 级别）。
> **本文件为参考文档**，操作时由 `hooks/hooks.json` 中的 `PreToolUse Hook` + `scripts/validate-ontology-action.sh` 自动校验前置条件。
> 你不需要手动读取本文件——但如果 Hook 阻断你的写入，请参考下文理解阻断原因。

---

## □ 前置条件检查清单

### □ 1. 证据绑定
- `source_evidence_refs` 是否非空？是 / 否
- ❌ 如果否：终止操作，Hard Link 必须绑定至少一份证据

### □ 2. 证据有效性
- 检查所有引用的 Evidence 本体对象是否存在
- 是否所有 Evidence 的 `sealed = false`？（已冻结的证据不可用于新建关系）
- ❌ 如果不满足：终止操作

### □ 3. 实体有效性（中间态校验）
- `from_entity` 和 `to_entity` 指向的本体 Entity 是否存在？
- **现场查询** from_entity 和 to_entity 的当前 `lifecycle_status`（从 `global_ontology/entities/{type}/{id}.yaml` 读取，不依赖认知层缓存）
- 是否所有 Entity 的 `lifecycle_status` 非 UNRESOLVED？
- from_entity 或 to_entity 是否有 `superseded_by` 字段？（已被合并的实体不可引用）
- ❌ 如果不满足：终止操作，指出具体哪个实体的状态不满足

### □ 4. 时态完整性
- 是否涉及资金、任职、控制类关系？是 / 否
- ❌ 如果是但 `valid_time` 未填写：终止操作，要求填写 valid_time

### □ 5. 唯一性检查
- 是否已存在相同的 `from_entity → relation_type → to_entity` 且未被 superseded？
- ❌ 如果是：终止操作，提示已有活跃关系

## 执行步骤

### 步骤 1：创建 Relation
- 在 `global_ontology/relations/` 下创建新 YAML 文件
- `evidence_tier: HARD`

### 步骤 2：更新认知层
- 在 `nodes/` 中创建或更新对应的节点引用

### 步骤 3：记录审计