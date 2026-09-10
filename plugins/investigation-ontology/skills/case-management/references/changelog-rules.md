---
name: changelog-rules
description: 案件变更记录规则参考 — CHANGELOG.json 的 action 分类、触发条件、必填字段和常见误触。由 case-manager / evidence-analyzer / investigation-planner 在执行写入时引用，不是独立 skill。
---

# 案件变更记录规则（CHANGELOG）

不是操作日志，是**文件变更的自动 commit message**——每当核心文件发生有意义的变化，追加一条记录，回答"什么时候、什么变了、为什么变、谁做的"。

参考 Schema：[schemas/changelog.schema.json](../../../schemas/changelog.schema.json)

---

## 核心原则

一条 changelog **该不该写**——只需问三个问题：

1. **这条记录在未来 6 个月后有人会回头查吗？** → 会就记
2. **这个变化能从其他地方自动推导出来吗？**（如从 evidence_registry 文件状态可推断）→ 能推导就不记
3. **没有这条记录会丢失重要信息吗？** → 会就记

---

## Action 速查表

| action | 触发条件 | target | 必填额外字段 | 示例 summary |
|--------|---------|--------|-------------|-------------|
| `case_created` | 案件首次创建 | meta.json | — | "案件创建，status = INIT" |
| `status_set` | meta.json.status 初始设置 | meta.json | — | "status = INIT" |
| `scope_defined` | 调查范围划定（时间/实体/排除） | meta.json | `related_ids` (ENT-NNN) | "scope：时间2024.01-06，涉及 ENT-001/ENT-002" |
| `phase_transition` | 阶段推进（门禁全过） | meta.json | `confirmed_by` | "INIT → PRE_INVESTIGATION：6/6 门禁通过" |
| `phase_backtrack` | 阶段回退（如 REVIEWING→FIELDWORK） | meta.json | `confirmed_by`, `related_ids` | "REVIEWING → FIELDWORK：FND-002 suspected，需补充" |
| `gate_all_passed` | 当前阶段门禁全部通过 | checklist.yaml | `related_ids` (通过的 CHK 列表) | "INIT 门禁 6/6 全过" |
| `gate_item_completed` | 单项门禁完成（用于回退场景） | checklist.yaml | `related_ids` | "CHK-init-case_opened 完成" |
| `evidence_registry_initialized` | evidence_registry.json 首次创建 | evidence_registry.json | — | "evidence_registry.json 创建" |
| `evidence_registered` | 新证据条目登记（首次） | evidence_registry.json | `related_ids` (EV-NNN) | "system_data 类型证据 EV-003 已登记——张某银行流水" |
| `evidence_confidence_updated` | 证据置信度跨阈值变化 | evidence_registry.json | `confirmed_by`, `related_ids` | "EV-002 confidence probable → confirmed（原文件核验）" |
| `finding_confidence_updated` | finding 置信度跨阈值变化 | evidence_registry.json | `confirmed_by`, `related_ids` | "FND-001 confidence probable → confirmed（EV-003 补充支撑）" |
| `hypothesis_generated` | 竞争假设写入 | evidence_registry.json | `related_ids` (HYP-NNN) | "3 个竞争假设已生成：真实回扣 / 误报 / 内部陷害" |
| `hypothesis_status_changed` | 假设状态 active→rejected/confirmed | evidence_registry.json | `confirmed_by`, `related_ids` | "HYP-002 '举报不真实' 已排除——系统数据核对确认" |
| `hypothesis_confidence_updated` | 其他显著置信度变化（不跨状态） | evidence_registry.json | `related_ids` | "HYP-001 confidence 0.45→0.72（EV-004 补充支撑）" |
| `report_drafted` | 中期备忘录或报告初稿完成 | 产出文档 | — | "中期备忘录完成（v1）" |
| `report_completed` | 正式报告终稿完成 | 产出文档 | — | "最终报告已定稿" |
| `document_generated` | 其他重要产出文档生成 | 产出文档 | — | "pre_investigation_brief.md 完成" |
| `case_suspended` | 案件挂起 | meta.json | `confirmed_by` | "案件挂起——等待法务回复境外付款合法性" |
| `case_resumed` | 案件恢复 | meta.json | — | "案件恢复——法务回复已确认合规" |
| `case_abandoned` | 案件放弃 | meta.json | `confirmed_by` | "案件放弃——线索经核实不成立" |
| `case_closed` | 案件结案 | meta.json | `confirmed_by` | "案件结案，evidence_registry 冻结" |
| `supplement_evidence_triggered` | 触发补充取证流程 | evidence_registry.json | `related_ids` | "FND-002 suspected → 已制定补充取证计划" |
| `other` | 上述未覆盖但遵循原则的有意义变更 | 按实际情况 | — | "" |

---

## 不记录清单（常见误触）

以下情况**不写** changelog：

| 不记录 | 原因 |
|--------|------|
| AI 操作过程（"evidence-analyzer 被调用"、"data-analyzer 执行完毕"） | 操作不是变更，证据已更新时由其他 action 覆盖 |
| 证据登记本身 | 由 `evidence_registered` 覆盖 |
| checklist 单项通过（除非是回退场景） | 阶段推进时由 `phase_transition` 或 `gate_all_passed` 一次性覆盖 |
| AI 可自动推导的时间信息 | 如"检查了 3 个文件"——可以从证据条目计数推导 |
| 调查员个人备注（"今天感觉进度不错"） | 这是 case_memory 的职责范围 |
| 微小的置信度漂移（如 0.45→0.52） | 仅跨阈值变化（suspected→probable→confirmed 或反之）才记录 |
| 同一批次内多个相同 action 的分条记录 | 合并为一条，如"5 件证据在一次交付中登记"→ 1 条 |

---

## 写入规范

1. **id 格式**：`CHG-NNN`，全案全局递增。读取现有 CHANGELOG.json 取最大编号 +1
2. **时间排序**：entries 按 `timestamp` 升序排列，尾部追加，不修改已有条目
3. **不删除**：CHANGELOG 条目一旦写入不得删除或修改。写错时追加一条 `other` 说明修正
4. **合并规则**：同一批次、同一个 agent、同一个 action 类型的多个变化合并为一条

---

## 各 Agent 触发点速查

| Agent | 触发时机 | action |
|-------|---------|--------|
| investigation-planner | 首次立案 | `case_created` |
| investigation-planner | 生成假设 | `hypothesis_generated` |
| investigation-planner | 划定 scope | `scope_defined` |
| evidence-analyzer | 登记新证据 | `evidence_registered` |
| evidence-analyzer | 置信度跨阈值变化 | `finding_confidence_updated` / `evidence_confidence_updated` |
| evidence-analyzer | 假设状态变化 | `hypothesis_status_changed` |
| case-manager | 门禁全部通过 | `gate_all_passed` |
| case-manager | 阶段推进 | `phase_transition` |
| case-manager | 阶段回退 | `phase_backtrack` + `supplement_evidence_triggered` |
| case-manager | 挂起/恢复/放弃/结案 | `case_suspended` / `case_resumed` / `case_abandoned` / `case_closed` |
| report-writer | 报告完成 | `report_drafted` / `report_completed` |
| 各 agent（未覆盖） | 按原则判定 | `other` |
