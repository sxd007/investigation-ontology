# Action: SEAL_EVIDENCE

> 冻结证据，禁止修改 integrity 块。
> **本文件为参考文档**，操作时由 `hooks/hooks.json` 中的 `PreToolUse Hook` + `scripts/validate-ontology-action.sh` 自动校验前置条件。

---

## □ 前置条件检查清单
- `sealed` 是否为 false？是 / 否
- ❌ 如果否：终止操作（重复冻结）
- 操作者是否为调查员或主调查员？是 / 否
- ❌ 如果否：终止操作

### 中间态校验：关联关系状态
- **现场查询**引用此证据的所有 Relation 文件（grep `source_evidence_refs`）
- 是否有 Relation 已被 `superseded`？（被替代的关系无需冻结对应证据，但应提醒调查员）
- 如果存在被替代的关系引用此证据：输出提示信息（非阻断），请调查员确认是否仍要冻结

## 执行步骤
1. 更新证据本体的 `sealed: true`
2. 更新认知层 EV 节点的 `ontology_ref.sealed: true`
3. 记录审计