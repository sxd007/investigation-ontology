---
name: evidence-registry-spec
description: evidence_registry.json 完整字段规范 — 顶层结构、entities/evidence_items/findings/hypotheses/event_timeline 各数组字段表、对抗行为记录、confidence 规则、缺口归因、与 meta.json 的关系。在创建或更新证据注册表时加载。
---

# evidence_registry.json 字段规范

证据注册表是案件证据的结构化核心登记文件。精确的字段约束见 `schemas/evidence-registry.schema.json`。

**用途**：作为全案件节点的可发现性入口（chain_nodes 索引）和结构化摘要（entities、evidence_items、findings、hypotheses、event_timeline）。**不包含关系图**——节点之间的推导关系由 `nodes/` 目录中各节点文件的 frontmatter 声明，二者通过 ID 空间（EV-/LS-/ARG-/FND- 等前缀）关联。

**创建时机**：INIT 阶段与 meta.json、checklist.yaml 同时创建基础结构。INIT 阶段填写 metadata、chain_nodes（初始节点索引）、提取 entities、登记举报线索为首条证据条目、生成初始 hypotheses。PRE_INVESTIGATION 起追加实质性证据。FIELDWORK 阶段大量追加。REVIEWING 阶段冻结。

## 顶层结构

```json
{
  "metadata":       { "case_id", "generated_at", "last_updated" },
  "chain_nodes":    [ ... ],    // 节点索引（INIT 阶段创建，持续追加）
  "entities":       [ ... ],    // 涉案实体（人员/公司/项目/设备等）
  "evidence_items": [ ... ],    // 证据条目（核心数组，持续追加）
  "findings":       [ ... ],    // 事实认定（REVIEWING 阶段定型）
  "hypotheses":     [ ... ],    // 竞争假设（INIT 阶段生成，持续更新）
  "event_timeline": [ ... ]     // 事件时间线（AI 自动提取，贯穿全案）
}
```

## entities — 涉案实体

| 字段 | 必填 | 说明 |
|------|------|------|
| `entity_id` | ✓ | 格式 `ENT-NNN`，全局递增 |
| `entity_type` | ✓ | 枚举：subject（人员）、organization（组织）、project（项目）、account（账户）、device（设备）、other |
| `name` | ✓ | 实体名称 |
| `role` | — | 在案件中的角色（如 sales_rep、agent_owner、manager 等，由领域场景自定义） |
| `attributes` | — | 扩展属性对象，不同 entity_type 有不同属性集合 |

证据保管链中的实物证据持有人、电子证据提取对象，应登记为 entities 后通过 `related_entities` 关联。

## evidence_items — 证据条目

每条证据独立登记。证据的详细分析、提炼和关系声明由 `nodes/EV-NNN.md` 承载。此数组仅保留注册层信息（不含关系字段——关系见 nodes/ 中各文件的 relations 字段）。

| 字段 | 必填 | 说明 |
|------|------|------|
| `evidence_id` | ✓ | 格式 `EV-NNN`，全案全局递增 |
| `type` | ✓ | 枚举：system_data（系统数据）、documentary（书证）、digital_forensics（数字取证）、testimonial（证言）、physical（物证）、expert_opinion（专家意见）、state_transition_decision（状态转换决策） |
| `subtype` | — | 类型子分类，由领域场景自定义。如 documentary → contract、invoice |
| `summary` | ✓ | 证据摘要 |
| `source` | — | 证据来源说明 |
| `collected_by` | — | 收集人 |
| `collected_at` | ✓ | 收集时间 |
| `location` | — | 存储位置，推荐格式 `raw/EV-NNN.<ext>` |
| `hash` | — | 电子证据哈希值（SHA-256 推荐） |
| `confidence` | — | 证据置信度：confirmed / probable / suspected（默认 probable） |
| `probative_value` | — | 证明力：high / medium / low |
| `scoring_category` | — | 意图评分分类。用于 REVIEWING 阶段计算涉案人员意图评分。枚举值详见 `schemas/evidence-registry.schema.json`，评分框架见 `case-management/references/intent-scoring.md`。FIELDWORK→REVIEWING 前由 evidence-analyzer 填写。 |
| `related_entities` | — | 关联的实体 ID 列表 |

**对抗行为记录**：对 testimonial 类型的证据，在 `interview_metadata` 中记录对抗行为：

| 字段 | 说明 |
|------|------|
| `adversarial_flags` | 标记类型：虚假配合 / 选择性配合 / 编造性拒绝 / 经验性回避 |
| `statement_quality` | 清晰度：high / medium / low |
| `coherence` | 连贯性：high / medium / low |
| `major_defenses` | 主要辩解内容摘要 |

## findings — 事实认定

每条 finding 代表一个已确认或待确认的事实命题。完整推理记录和关系声明由 `nodes/FND-NNN.md` 承载。此数组仅保留结构化摘要。

| 字段 | 必填 | 说明 |
|------|------|------|
| `finding_id` | ✓ | 格式 `FND-NNN`，全案全局递增 |
| `statement` | ✓ | 事实陈述 |
| `fraud_type` | — | 关联的舞弊类型 |
| `main_dispute_points` | — | 关键争议点 |
| `alternative_explanations` | — | 已识别的替代解释及其处理状态（open/rejected/retained） |
| `defense_response_summary` | — | 对主要辩解的回应总结 |
| `confidence` | ✓ | 置信度：confirmed / probable / suspected |

**confidence 设计规则：**

| 置信度 | 含义 | 推进影响 |
|--------|------|---------|
| confirmed | 强有力且直接的证据支撑，可直接定性 | 正常推进 |
| probable | 基于现有证据的合理推论 | 正常推进 |
| suspected | 存疑，需要补充证据后才能定性 | 触发 REVIEWING→FIELDWORK 回退 |

**归因缺口的特殊处理**：当关键证据无法获取时，需在证据条目的 `source` 和 `confidence` 中反映缺口归因：

- **调查方缺口**（调查员技术/权限原因无法获取）→ 降低 finding 的 confidence
- **被调查方缺口**（被调查方无法/拒绝提供）→ 不降低 confidence，作为独立风险信号记录

缺口归因的判断方法参见 [`skills/investigation-foundation/SKILL.md`](../../investigation-foundation/SKILL.md)。

有关 finding 的详细推理（inference_path、warrant、alternative_ruled_out、remaining_doubt 等），见 `nodes/FND-NNN.md` 模板中的对应章节。

## hypotheses — 竞争假设

假设驱动调查的核心数据结构。由 `investigation-planner` 在 INIT 阶段从线索提炼生成，随证据积累持续更新。

| 字段 | 必填 | 说明 |
|------|------|------|
| `hypothesis_id` | ✓ | 格式 `HYP-NNN`，全案全局递增 |
| `statement` | ✓ | 假设陈述 |
| `confidence` | — | 置信度 0-1，AI 在新证据登记后自动重估 |
| `status` | ✓ | active / rejected / confirmed |
| `alternative_hypotheses_addressed` | — | 本假设已回应的竞争假设 ID 列表 |
| `last_updated_at` | — | 最后更新时间 |
| `last_updated_by` | — | 最后更新者（agent 名称或调查员） |

**交互机制**：

| 触发点 | 执行者 | 动作 | 人工介入 |
|--------|--------|------|---------|
| INIT 立案 | investigation-planner | 从线索提炼 2-3 个竞争假设，写入 hypotheses | AI 生成后可手动修改 |
| 新证据登记 | evidence-analyzer | 更新 HYP-NNN.json 的 relations（supported_by/contradicted_by） | ◉ 自动，无需介入 |
| 假设置信度重估 | investigation-planner | 基于证据变化重新计算 confidence | △ 仅当跨越阈值(>0.8/<0.2)时确认 |
| 假设状态变更 | investigation-planner | active → rejected / confirmed | ✦ 必须手动确认 |

**关键规则**：
- 至少包含 1 个反向假设（如"举报不真实"）
- 所有假设在 INIT 阶段**同等优先级**验证，不得偏袒任一方向
- `status` 变更为 `confirmed` 或 `rejected` 仅限 REVIEWING 阶段，需调查员手动确认

## event_timeline — 事件时间线

被调查对象的行为时间序列（非调查活动日志）。由 AI 在登记每条新证据时自动从证据内容中提取时间信息并追加。关系（事件关联的证据）仅由 nodes/EVT-NNN.json 的 relations 字段声明。

| 字段 | 必填 | 说明 |
|------|------|------|
| `event_id` | ✓ | 格式 `EVT-NNN`，全案全局递增 |
| `title` | ✓ | 事件标题（一句话，如"供应商中标华东项目"） |
| `moment` | ✓ | 时间锚点。精确日期用 YYYY-MM-DD，模糊时间用最佳估计 |
| `time_type` | ✓ | 时间确定度：exact / range / approximate / inferred |
| `time_range` | — | 当 time_type=range 时的起止时间 [start, end] |
| `description` | — | 事件描述 |
| `inferred` | — | 是否为根据已知事件推测的补充事件（默认 false） |
| `inference_basis` | — | 推测依据（仅 inferred=true 时填写） |
| `tags` | — | 事件标签（如 contract、payment、interview），用于按主题筛选 |

**重建流程**（三步，全自动 + 可选人工）:

```
Step 1 — 提取（自动）
  登记新证据 → AI 扫描其中的时间信息 → 生成 EVT-NNN 事件条目
  └── 零人工成本，AI 在登记证据时同步完成

Step 2 — 排序与融合（自动）
  所有事件按 moment 排序 → 同一天事件自动分组
  → 检测到时间矛盾时并排显示并标记 ⚠
  └── AI 自动完成，仅矛盾时推送通知

Step 3 — 补缺推断（半自动）
  检测到事件链缺口 → AI 提示推测事件 → 调查员点击"同意"/"忽略"/"手动补充"
  └── 用户仅需做选择题，推理由 AI 完成
```

**事件时间线 vs 过程记忆**：`event_timeline` 记录被调查对象的行为轨迹（“他做了什么、何时做的”）；当前规范下，`case_memory/` 不记录普通调查活动，而记录尚未正式化但值得复查的讨论分支、疑虑、直觉、非正式观察和关键决策理由。调查者正式活动时间线以 `CHANGELOG.json` 为准。旧案件中按早期规范写入 `case_memory/` 的活动日志按 `legacy_activity` 只读兼容，可作为 `CHANGELOG.json` 的补充，但不得被解释为疑虑、直觉或案件事实，也不得因不符合新规范而跳过。memory 在 REVIEWING 阶段仅支撑范围完整性检查，不作为报告结论来源。

## 与 meta.json 的关系

evidence_registry.json 与 meta.json 通过 `case_id` 关联。meta.json 负责案件级元数据（状态、创建时间、SLA），evidence_registry.json 负责证据级数据（证据条目、实体、事实认定）。

参见 [`docs/case-data-model.md`](../../../docs/case-data-model.md) 了解两个文件的创建顺序。
