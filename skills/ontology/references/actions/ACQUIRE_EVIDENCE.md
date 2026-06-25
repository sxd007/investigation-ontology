# Action: ACQUIRE_EVIDENCE

> 登记新证据，创建本体 Evidence 对象。**本文件被 CLAUDE.md 引用。**

---

## □ 前置条件检查清单
- raw_file 是否已存储？是 / 否
- ❌ 如果否：终止操作，先存储原始文件
- sha256 是否已计算？是 / 否
- ❌ 如果否：终止操作，必须计算哈希值
- 是否有重复（hash 碰撞）？是 / 否
- ❌ 如果是：终止操作，证据已存在

## 执行步骤
1. 在 `entities/evidence/` 下创建 Evidence 本体文件（`sealed: false`）
2. 在 `cases/<case_id>/nodes/` 下创建 EV-NNN 认知层节点，添加 `ontology_ref`
3. 在 `evidence_registry.json` 中注册证据条目
4. 记录审计