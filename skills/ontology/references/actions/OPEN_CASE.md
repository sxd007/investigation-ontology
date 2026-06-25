# Action: OPEN_CASE

> 立案，创建案件的本体对象。**本文件被 CLAUDE.md 引用。**

---

## □ 前置条件检查清单
- 是否有初始线索/举报？是 / 否
- ❌ 如果否：终止操作，立案必须基于线索
- case_id 是否已存在于 `entities/case/` 或 `cases/`？是 / 否
- ❌ 如果是：终止操作，案件 ID 冲突

## 执行步骤
1. 在 `entities/case/` 下创建 Case 本体文件（`lifecycle_status: ACTIVE`）
2. 在 `cases/` 下创建案件工作目录（含 meta.json、checklist.yaml、evidence_registry.json、nodes/）
3. 在 CHANGELOG.json 记录首条变更 `case_created`
4. 确保认知层 `meta.json` 中的 case_id 与本体层一致