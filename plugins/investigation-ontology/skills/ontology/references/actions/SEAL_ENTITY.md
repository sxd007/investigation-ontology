# Action: SEAL_ENTITY

> 冻结实体，禁止再修改。**本文件被 CLAUDE.md 引用。**

---

## □ 前置条件检查清单
- `lifecycle_status` 是否为 VERIFIED？是 / 否
- ❌ 如果否：终止操作
- 操作者是否为调查员或主调查员？是 / 否
- ❌ 如果否：终止操作

## 执行步骤
1. 更新 `lifecycle_status: SEALED`
2. 更新认知层 ENT 节点的 `ontology_ref.lifecycle_status`
3. 记录审计