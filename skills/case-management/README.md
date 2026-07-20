# 案件管理 — 个人工作手册

面向：正在使用 case-management 技能管理调查案件的调查员。
目的：自己看的操作指南。理解案件管理的设计哲学、掌握与各 agent 的协作方式、学会利用阶段门禁体系推进案件。

***

## 一、设计哲学：案件管理不是"管流程"，是"管质量"

案件管理（case-management）是本插件中最容易被误解的技能——它不是 OA 审批流，不是项目管理甘特图。它的核心设计围绕三个理念：

**理念 1：阶段是不可逆的，除非设计好的回退路径。**

四个阶段（INIT → PRE_INVESTIGATION → FIELDWORK → REVIEWING）单向推进。你不能"先接触人再回去做外围调查"——一旦 `contacted_subjects` 设为 `true`，回退路径永久关闭。这是故意的：**接触人就意味着静默期结束，你不能假装没发生过。**

**理念 2：门禁不是审批，是质量保障。**

每个阶段的门禁条件是"你准备好了吗？"的自检清单，不是"领导同意了吗？"的审批流。`checklist.yaml` 中每条门禁对应一个可验证的条件——证据完整性、数据缺口评估、推理链完整性等。**门禁不通过时不要硬推，去补缺，不要绕路。**

**理念 3：Agent 只做自己分内的事，不做越界的事。**

- `case-manager` **不做调查** — 它只验证门禁、记录变更、拒绝不合规的推进请求
- `investigation-planner` **负责方案** — 但不负责执行数据分析或写报告
- `evidence-analyzer` **负责证据** — 但不负责阶段推进
- `report-writer` **负责报告** — 但只消费已定论的证据

这种"铁路警察各管一段"的设计不是限制你，而是确保每个环节有人（或 AI）负责，不留模糊地带。

***

## 二、理解四个阶段，才能指挥 agent

本插件的所有 agent 都知道自己该在哪个阶段出现。你也需要知道，才能正确调遣它们。

```
INIT ──────────────────────────────────────────────
│  线索接收 → 评估 → 立案决策 → 生成假设
│  关键产出：meta.json、checklist.yaml、evidence_registry.json（骨架）
│  关键 agent：investigation-planner（主力）
│  不适用：data-analyzer、interview-analyzer
│  门禁全过 → 推进至 PRE_INVESTIGATION
│
PRE_INVESTIGATION ─────────────────────────────────
│  静默情报收集 — 不接触任何人
│  关键产出：pre_investigation_brief.md、intelligence_summary.md
│  关键 agent：data-analyzer（查系统）、evidence-analyzer（评估）
│  不适用：interview-analyzer（还没到接触的时候）
│  门禁全过 → 推进至 FIELDWORK
│
FIELDWORK ─────────────────────────────────────────
│  接触当事人、调取外部证据
│  关键产出：访谈笔录、调证记录、ARG 论据节点
│  关键 agent：interview-analyzer、evidence-analyzer（大量追加）
│  注意：contacted_subjects = true 后不能回退到 PRE
│  门禁全过 → 推进至 REVIEWING
│
REVIEWING ─────────────────────────────────────────
│  收敛定性、撰写报告
│  关键产出：FND 事实认定、final_report.md、意图评分
│  关键 agent：report-writer（主力）、case-manager（最终门禁）
│  不适用：investigation-planner（方案已定）
│  门禁全过 → CLOSED 结案
│
CLOSED ────────────────────────────────────────────
│  证据冻结、档案归档
```

### 你最容易犯的三个阶段错误

1. **INIT 阶段就想调 data-analyzer** — 还没立案，没有 case_id，数据查了记在哪里？先走完立案流程。
2. **PRE_INVESTIGATION 阶段要求访谈** — 静默期还没结束，接触人等于放弃静默优势。先穷尽系统数据。
3. **FIELDWORK 阶段发现门禁不过，要求 case-manager 绕过** — 门禁是设计来保护你的，绕过之后出问题（证据链断裂、推理跳跃）最终是你的报告被挑战。

***

## 三、用好 case-manager 代理

### 3.1 case-manager 能做什么

| 操作 | 怎么触发 | case-manager 的反应 |
|------|---------|-------------------|
| 查看案件状态 | `/investigate continue <case_id>` | 读取全部档案，输出状态摘要 + 门禁进度 + 下一步建议 |
| 推进阶段 | 你说"门禁都过了，推进到下一阶段" | 逐条检查 checklist → 通过则写入 meta.json + CHANGELOG → 输出阶段导航 |
| 挂起案件 | "这个案件先挂起来，等法务回复" | 要求填写 `suspend_info` → 记录 → 状态变为 SUSPENDED |
| 恢复案件 | "法务回复了，恢复调查" | 更新状态 + 追加 CHANGELOG `case_resumed` |
| 放弃案件 | "这个线索不成立，放弃" | 要求填写 `abandon_info` → 记录 → 不再参与该案 |
| 检查回退可行性 | "我想回退到 FIELDWORK 补个证据" | 检查 `contacted_subjects` 或 suspected 状态 → 告诉你是否可行 |

### 3.2 case-manager 不能做什么

**它不做调查。** 如果你说"帮我查一下这笔交易的对手方"，它不会做——那不是它的职责。正确的做法是：

```
你："帮我查一下这笔交易的对手方"
case-manager："我不做数据分析。建议调用 data-analyzer 执行查询。需要我帮你转接吗？"
```

这不是 agent 不配合，是**职责边界**。正确的调用路径是：

```
你：查对手方 → data-analyzer
你：评估证据 → evidence-analyzer
你：检查能否推进 → case-manager
你：调整方案 → investigation-planner
你：写报告 → report-writer
```

### 3.3 交付确认模式（Show → Discuss → Confirm → Write）

任何 agent 在变更案件档案前，都会先展示拟变更内容，等你确认后才写入。这不是啰嗦，是**你始终掌握最终决定权**。

```
case-manager 展示：
  ━━ 门禁检查结果 ━━
  ✓ case_opened
  ✓ objectives_defined
  ✗ key_entities_verified（实体尚未通过快查验证）
  ✗ information_gaps_documented（信息缺口未分类标注）

  2/6 未通过，推进请求被拒绝。
  建议：调用 investigation-planner 补全实体验证和信息缺口分类。

你：好的，我来做实体验证。先推进这个门禁。
case-manager：确认后更新 checklist → CHANGELOG 记录
```

***

## 四、门禁体系详解

门禁是本插件**最强大的质量保障机制**，但需要你理解它的工作方式才能用好。

### 4.1 门禁不是单次检查，是持续状态

每个门禁项在 `checklist.yaml` 中维护。AI 在每次操作后会自动更新对应门禁状态，但关键门禁（如 `case_opened`）需要你明确确认。

### 4.2 哪些门禁最容易卡住

| 阶段 | 最容易卡住的门禁 | 为什么 | 怎么办 |
|------|----------------|--------|--------|
| INIT | `information_gaps_documented` | 信息缺口必须分类标注（待调取/举报人无/原因未说明），不能留空 | 逐条标注每个缺口的类型 |
| PRE | `evidence_gap_assessed` | 每条 unavailable 的情报必须归因（调查方缺口/被调查方缺口）并做 confidence 降级 | 老实承认哪些数据拿不到 |
| FIELDWORK | `evidence_chain_integrity` | 必须运行 `scan-chain.js --integrity` 无 ERROR | 修复断裂的引用链 |
| REVIEWING | `suspected_findings_resolved` | 所有 suspected 的 finding 必须处置 | 要么补证据提升置信度，要么明确说明为何保留 suspected |

### 4.3 门禁不过时怎么办

不要强推。门禁是**自检清单**，不是审批流。不过说明有缺口：

```
门禁不过 → 看哪条没过 → 调用对应 agent 补齐 → 再次提交检查
```

***

## 五、回退机制：什么时候可以回头

两个设计的回退路径：

### 路径 A：FIELDWORK → PRE_INVESTIGATION（有限回退）

**条件：** `contacted_subjects` 必须为 `false`（未接触任何人）
**含义：** 进入 FIELDWORK 后发现情报不足，想再补充一轮外围调查再做接触
**一旦接触过人就永久关闭此路径**——所以 FIELDWORK 初期不要急着设 `contacted_subjects = true`

### 路径 B：REVIEWING → FIELDWORK（补充取证回退）

**条件：** `suspected_findings_resolved` 为 `false`
**含义：** REVIEWING 阶段发现有 finding 置信度不够，需要补充特定证据
**范围：** 只开放与该 finding 相关的具体取证任务，不是全案回退

### 不能回退的情况

- CLOSED → 任何阶段：结案后发现新证据，不是回退，是重新开案
- PRE_INVESTIGATION → INIT：已做 Go 决策、已立案，不能回到"还没想好要不要查"的状态
- SUSPENDED → 任意调查阶段：只能恢复（resume）到挂起前的阶段，不能直接跳到更早的阶段

***

## 六、CHANGELOG：你的审计轨迹

`CHANGELOG.json` 不是操作日志，是**文件变更的 commit message**。

### 什么该记

问自己：**"6 个月后有人会回头看这条记录吗？"** 会就记。

- 阶段推进 ✅
- 新假设生成 ✅
- 关键证据置信度变化（跨阈值） ✅
- 案件挂起/恢复/结案 ✅

### 什么不该记

- "AI 执行了 xxx 操作" — 没人关心操作过程，只关心结果
- 微小的置信度漂移（0.45→0.52） — 没跨 suspected/probable/confirmed 阈值就不记
- 自己的备注 — 那是 `case_memory/` 的职责
- checklit 单项通过（非回退场景） — 阶段推进时一次性覆盖

**实际影响你的是：** CHANGELOG 是 CLOSED 后唯一能快速回溯案件决策的记录。回退时 reviewers 会问"为什么当时做了这个决定"——答案在 CHANGELOG 里。

***

## 七、意图评分：REVIEWING 阶段的核心操作

这不是可选功能。`subject_intent_scored` 是 REVIEWING → CLOSED 的门禁条件之一。

### 评分逻辑一句话

每条证据有 `scoring_category`，每个 category 有固定权重。累加某个人的所有关联证据权重 → 总分 → 映射到定性。

### 四个结果

| 评分 | 定性 | 你应该做什么 |
|------|------|------------|
| > 80 | mastermind（主谋） | 建议最重处理措施 |
| 50–80 | complicit（合谋） | 区分主次责任 |
| 30–50 | inconclusive（存疑） | **触发回退** — 补充证据后再评 |
| < 30 | deceived（被欺骗） | 从轻或免责方向 |

### 确保意图评分顺利通过

1. **FIELDWORK 阶段就要让 evidence-analyzer 填好 `scoring_category`** — 不要在 REVIEWING 才补
2. 每条关联证据的 `confidence` 必须是 `confirmed` 或 `probable` — `suspected` 的证据不参与评分
3. 如果某人评分落在 inconclusive 区间，不要试图调权重——那是设计好的"诚实区间"

---

## 八、你与 agent 的最佳协作模式

### 开新案的标准流程

```
1. 你：描述线索
   → investigation-planner 立案 + 生成假设
   → 你确认方案 → 写入档案

2. 你：门禁该过了，推进
   → case-manager 检查 INIT 门禁 → 通过 → 推进至 PRE
   → 输出 PRE 阶段导航

3. 你：查系统数据
   → data-analyzer 执行查询
   → evidence-analyzer 登记发现
   → 更新 checklist

4. 你：推进到 FIELDWORK
   → case-manager 检查 PRE 门禁 → 通过 → 推进

5. 你：安排访谈
   → interview-analyzer + evidence-analyzer
   → 大量追加 EV、ARG 节点

6. 你：推进到 REVIEWING
   → case-manager 检查 FIELDWORK 门禁 → 通过 → 推进

7. 你：准备结案
   → report-writer 起草报告
   → case-manager 检查 REVIEWING 门禁 → 全部通过 → CLOSED
```

### 卡住时的万能公式

**门禁不过 → 问 case-manager "缺什么" → 调对应 agent 补 → 再检查**

不要跟 case-manager 争论"这个门禁没必要"——它是按规则执行，修改规则请修改 checklist schema。

***

## 九、参考资源

| 资源 | 位置 | 用途 |
|------|------|------|
| 技能完整定义 | `SKILL.md` | 案件生命周期、阶段框架、数据结构完整说明 |
| 门禁清单 schema | `schemas/checklist.schema.json` | checklist.yaml 字段约束和枚举值 |
| 案件元数据 schema | `schemas/meta.schema.json` | meta.json 字段约束 |
| CHANGELOG 规则 | `references/changelog-rules.md` | 变更记录的 action 分类和写入规范 |
| 时间线可视化指南 | `references/case-timeline-visualization.md` | 事件筛选标准、分类模型、去重逻辑、布局规范、生成流程 |
| 意图评分框架 | `references/intent-scoring.md` | 评分公式、权重表、阈值区间详细说明 |
| 案件管理代理 | `agents/case-manager.md` | case-manager 的完整职责和流程定义 |
| 调查方案代理 | `agents/investigation-planner.md` | INIT/PRE 阶段的方案生成逻辑 |
| 案件数据模型 | `docs/case-data-model.md` | 各文件的创建顺序和关联关系 |
