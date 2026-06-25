# Action: CLOSE_CASE

> 结案。**本文件被 CLAUDE.md 引用**。在进行结案操作前，必须读取并逐条校验以下条件。

---

## □ 前置条件检查清单

请逐一检查，每项完成后在 `[x]` 标记：

### □ 1. 案件状态
- 读取 `entities/case/` 下对应的 Case 本体文件
- `lifecycle_status` 的值：_____
- 是否为 `ACTIVE`？是 / 否
- ❌ 如果否：终止操作，告知用户只有 ACTIVE 状态的案件可以结案

### □ 2. 认知层阶段
- 读取 `meta.json` 中 `status` 的值：_____
- 是否为 `REVIEWING`？是 / 否
- ❌ 如果否：终止操作，告知用户只有 REVIEWING 阶段才能结案

### □ 3. 涉及实体状态
- 遍历 Case 本体文件中 `links.involved_entities` 列表
- 检查每个 Entity 的 `lifecycle_status`
- 是否存在 UNRESOLVED 的实体？是 / 否
- ❌ 如果是：终止操作，列出未解析的实体 ID，要求先执行 `RESOLVE_ENTITY`

### □ 4. FND 状态（认知层引用）
- 遍历 `case.yaml` 中 `findings_refs` 列表
- 读取认知层 `nodes/` 目录中对应的 FND-NNN 文件
- 所有 FND 的 `status` 是否都为 `FINALIZED`？是 / 否
- ❌ 如果否：终止操作，列出未定稿的 FND ID

### □ 5. 证据冻结状态
- 遍历 Case 本体文件中 `links.contained_evidence` 列表
- 检查每个 Evidence 的 `sealed` 字段
- 所有证据是否都已 `sealed = true`？是 / 否
- ❌ 如果否：终止操作，列出未冻结的证据 ID，要求先执行 `SEAL_EVIDENCE`

### □ 6. Binding Protocol 完整性
- 运行 `scripts/audit-binding.sh <case_id>` 检查引用完整性
- 输出中是否有 ERROR？是 / 否
- ❌ 如果是：终止操作，按脚本提示修复 ontology_ref 偏移

---

**确认：以上所有条件均通过后，才可执行以下步骤。**

## 执行步骤

### 步骤 1：更新本体 Case 状态
```yaml
# entities/case/<case_id>.yaml 中修改：
lifecycle_status: CLOSED
closed_at: <当前时间 ISO 8601>
closed_by: <操作者>
```

### 步骤 2：更新认知层 meta.json
```json
{
  "status": "CLOSED",
  "last_activity": "<当前时间>"
}
```

### 步骤 3：导出快照
- 运行：`scripts/export-snapshot.sh <case_id>`
- 快照输出至：`cases/<case_id>/archive/snapshot-<timestamp>.yaml`

### 步骤 4：记录审计
- 在 `CHANGELOG.json` 追加：
```json
{
  "id": "CHG-NNN",
  "timestamp": "<当前时间>",
  "action": "case_closed",
  "summary": "案件 <case_id> 已结案",
  "triggered_by": "<操作者>",
  "related_ids": ["entities/case/<case_id>.yaml"],
  "preconditions_verified": ["case_status", "entity_status", "fnd_status", "evidence_sealed", "binding_protocol"]
}
```