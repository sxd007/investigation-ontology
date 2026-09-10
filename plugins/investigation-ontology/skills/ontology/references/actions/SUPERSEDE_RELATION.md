# Action: SUPERSEDE_RELATION

> 作废旧关系，建立新关系。**本文件被 CLAUDE.md 引用。**

---

## □ 前置条件检查清单
- 旧关系 `superseded_by` 是否为 null？是 / 否
- ❌ 如果否：终止操作（关系已被替代）
- 新关系是否有 HARD 证据？是 / 否
- ❌ 如果否：终止操作

## 执行步骤
1. 创建新 Relation 文件
2. 更新旧 Relation 的 `superseded_by: <new_relation_id>`
3. 更新认知层节点引用
4. 记录审计