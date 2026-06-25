# Action: RESOLVE_ENTITY

> 将 UNRESOLVED 实体核实为 VERIFIED。
> **本文件为参考文档**，操作时由 `hooks/hooks.json` 中的 `PreToolUse Hook` + `scripts/validate-ontology-action.sh` 自动校验前置条件。

---

## □ 前置条件检查清单

### □ 1. 实体状态
- 读取 `entities/{type}/{id}.yaml`
- `lifecycle_status` 的值：_____
- 是否为 `UNRESOLVED`？是 / 否
- ❌ 如果否：终止操作，只有 UNRESOLVED 的实体可被核实

### □ 2. 核实证据（中间态校验）
- 是否有至少一份 HARD 级别的 Relation 或 Evidence 作为核实依据？
- **现场查询**引用的 Evidence 的 `sealed` 字段：已冻结的证据仍可用作核实依据（不同于新建关系）
- 引用的 Relation 是否存在 `superseded_by`？（被替代的关系不可作为核实依据）
- ❌ 如果依椐不满足：终止操作

### □ 3. 身份冲突
- 再次检查身份唯一性（tax_id / id_card_hash / hr_code）
- 是否有冲突？是 / 否
- ❌ 如果是：终止操作，先执行 `MERGE_ENTITIES`

## 执行步骤
1. 更新 `lifecycle_status: VERIFIED`
2. 更新 `verified_at` / `verified_by`
3. 更新认知层 ENT 节点的 `ontology_ref.lifecycle_status`
4. 记录审计