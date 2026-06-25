# Action: MERGE_ENTITIES

> 合并两个 VERIFIED 实体，将其中一个标记为被替代。**本文件被 CLAUDE.md 引用。**

---

## □ 前置条件检查清单
- 两个实体的 `lifecycle_status` 是否都为 VERIFIED？是 / 否
- ❌ 如果否：终止操作，只有 VERIFIED 实体可合并
- 是否有人工复核确认？是 / 否
- ❌ 如果否：终止操作，合并必须经人工复核

## 执行步骤
1. 确定"保留实体"和"被合并实体"
2. 被合并实体的 `superseded_by` 指向保留实体
3. 将所有从被合并实体的关系重定向到保留实体
4. 更新认知层 ENT 节点的 `ontology_ref`
5. 记录审计