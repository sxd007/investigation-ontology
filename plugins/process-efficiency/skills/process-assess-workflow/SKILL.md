---
name: process-assess-workflow
description: 流程评价工作流管理 — 当专职推动流程效率优化工作、需要有序管理单个或多个流程评价（SCOPE→BASELINE→ASSESS→REPORT→TRACK 生命周期）、组装评价基线并管理其版本时使用。管理评价组合与生命周期门禁，调度能力层技能（policy-digest / goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）。
origin: process-efficiency
---

# 流程评价工作流管理

专职流程优化工作的工作流层：多评价组合管理、生命周期门禁、基线组装与版本化。能力层技能 root-agnostic，本技能是它们的"场景一宿主"——为它们提供 `process-assessments/{assessment_id}/` 输出根与生命周期上下文。

与 case-management（investigation-ontology 插件）的范式差异：**协作性**（流程 Owner 是伙伴而非调查对象）、**组合管理**（多评价并行、分波次推进）、**审计级可追溯**（数据快照 + 哈希，非法律级证据链）、**结论形态为评级 + 缺口清单 + 改进建议**（由流程 Owner 认领，非事实认定）。

## When to Activate

- 启动新的流程评价（单流程或流程集）
- 管理多个并行流程评价的进度、波次与优先级
- 组装评价基线（digest 引用 + 指标定义 + 系统数据快照）并管理其版本
- 推进评价阶段门禁（SCOPE → BASELINE → ASSESS → REPORT）
- 跟踪改进建议的整改落实（TRACK）
- 查看评价组合全景（哪些流程在评、卡在哪、下一步是什么）

**不适用**：一次性解构某份制度文档（直接用 `policy-digest`）；调查案件内的分支深化（调用方提供 `cases/{case_id}/` 根，不建本工作流）。

## 目录结构

```
process-assessments/
├── PORTFOLIO.md                     # 组合看板：全部评价的状态/波次/优先级一览
├── PA-YYYY-NNN/                     # 单个流程评价（assessment_id 格式）
│   ├── README.md                    # 评价索引（目标、范围、当前阶段、产物清单）
│   ├── meta.json                    # 评价元数据（生命周期状态机）
│   ├── checklist.yaml               # 阶段门禁清单
│   ├── baselines/                   # 评价基线（版本化，Append-Only）
│   │   ├── baseline-v1.json         # digest 引用 + 指标定义 + 数据快照清单（含哈希）
│   │   └── baseline-v2.json         # 制度修订/数据窗口变化时新版本，不覆盖
│   ├── scope_charter.md             # SCOPE 产物：评价范围章程
│   ├── 01_assessments/              # ASSESS 产物：各能力技能的输出（RCM 矩阵、诊断报告等）
│   │   ├── ddr.yaml                 # DDR 汇总：下游技能报告的上游解构缺陷嫌疑（跨维度）
│   │   └── evaluation-assertions.yaml  # REPORT 可选投影产物：findings → 本体断言（ACP-002）
│   ├── assessment_report.md         # REPORT 产物：评价报告（评级 + 缺口 + 建议）
│   └── CHANGELOG.json               # 评价变更记录
└── ...
```

**基线版本化纪律**（对齐 policy-digest 的 supersedes/superseded_by 模式）：baseline 文件 Append-Only，新版本记录 `supersedes`/`superseded_by`；已发布的评价结论必须注明其依据的 baseline 版本——结论可追溯到基线快照，是审计级可复现的抓手。

## 生命周期

```
SCOPE（圈定流程范围与指标）
   │  门禁通过
   ▼
BASELINE（组装基线并冻结）
   │  门禁通过
   ▼
ASSESS（调度四个评价技能，可迭代）
   │  门禁通过
   ▼
REPORT（收敛评级与改进建议）
   │  可选
   ▼
TRACK（跟踪整改落实）→ CLOSED
```

### SCOPE 阶段 — 圈定范围

**目标**：明确评价对象（哪些流程、哪个组织单元、哪个数据窗口）、评价维度（目标/风险/控制/效率中的哪些）、成功标准。

**输出**：`scope_charter.md`、`meta.json`（创建）、`checklist.yaml`（创建）、`README.md`（创建）。

**门禁**（全部满足后推进至 BASELINE）：

| 门禁 | 含义 |
|------|------|
| `processes_identified` | 目标流程已识别（L1–L5 层级 + 组织归属），多流程时波次划分已定 |
| `dimensions_confirmed` | 评价维度已确认（四维度中至少一项），每项有明确的评价问题 |
| `stakeholders_mapped` | 流程 Owner、归口部门、数据系统接口人已识别 |
| `data_sources_listed` | 所需制度文档清单与系统数据源清单已列出（此时不要求获取） |
| `success_criteria_defined` | 成功标准已定义（如"形成可认领的控制缺口清单"） |

### BASELINE 阶段 — 组装基线

**目标**：把模板层知识（制度怎么说）与实例层数据（实际怎么跑）固化为版本化基线。

**核心动作**：

1. **制度解构**：对制度文档清单逐份调用 `policy-digest`（输出根 `process-assessments/{assessment_id}/policy-digests/`，engagement_id 取本评价 `assessment_id`）；
2. **指标定义**：确定评价指标集（可参照 proc 域 Metric / APQC PCF 基准），含计算口径与数据字段映射；
3. **数据快照**：对实例数据（OA/ERP 事件日志、审批记录）做快照落盘（含 SHA-256 与获取时间），快照即基线的一部分——之后数据更新不影响本次评价的可复现性。

**输出**：`baselines/baseline-v{N}.json`、`policy-digests/`（多份成果包）。

**门禁**（全部满足后推进至 ASSESS）：

| 门禁 | 含义 |
|------|------|
| `digests_completed` | 制度文档清单内全部文档已解构并通过 validator 校验（无 ERROR、blocking 清零或显式豁免并记录） |
| `metrics_defined` | 指标集已定义，每项含计算口径与数据字段映射 |
| `data_snapshots_sealed` | 实例数据快照已落盘并计算哈希；无法获取的数据源已归因（评价方缺口/数据方缺口）并评估降级影响 |
| `baseline_frozen` | baseline-v{N}.json 已写入且冻结（后续变更走新版本） |

### ASSESS 阶段 — 调度评价

**目标**：按 SCOPE 确认的维度，调度对应能力技能对基线执行评价。

**调度矩阵**：

| 维度 | 调度技能 | 输入 | 输出位置 |
|------|---------|------|---------|
| 目标 | `goal-alignment` | digest 的 process_objectives + 指标定义 | `01_assessments/goal-alignment/` |
| 风险 | `rcm-analysis` | digest 的 risks/controls + 风险参照集 | `01_assessments/rcm-analysis/` |
| 控制点 | `control-testing` | digest 的 controls + 数据快照（实例执行记录） | `01_assessments/control-testing/` |
| 效率 | `efficiency-diagnosis` | digest 的 flow_edges/process_elements + 数据快照 | `01_assessments/efficiency-diagnosis/` |

**消费纪律**：评价技能只消费 digest-schema 兼容的流程知识包（默认生产者 policy-digest；本体层投影为第二生产者，未来实现）与 baseline 声明的数据快照，**不回头读制度原文**（锚点追溯经 digest 间接实现），不引入基线外的未快照数据（保证结论可复现）。

**上游纠错（DDR）**：评价技能在专业领域内识别流程知识包的缺陷嫌疑（遗漏/错归类/锚点错/幻觉），按 [DDR 机制](./references/digest-defect-report.md)报告至 `01_assessments/ddr.yaml`；验证与修复归 policy-digest（走 digest 版本链），下游不自行修改不回读原文。defect-susceptible 类 finding 在 DDR 闭环前保持 provisional。

**输出**：各维度评价产物（按各技能 SKILL.md 定义的产出结构写入 `01_assessments/{dimension}/`，findings 按 [finding-contract](./references/finding-contract.md) 聚合到该维度 `findings.yaml`）。

**门禁**（全部满足后推进至 REPORT）：

| 门禁 | 含义 |
|------|------|
| `dimensions_covered` | SCOPE 确认的每个维度都有对应评价产物 |
| `findings_anchored` | 每条评价发现可追溯（digest 锚点 或 数据快照引用），无"悬空结论" |
| `data_sufficiency_assessed` | 数据充分性已评估，不足之处已降级标注并列入报告限制 |
| `stakeholder_review_done` | 评价发现已与流程 Owner 过审（协作姿态：发现先沟通再定性） |

### REPORT 阶段 — 收敛定性

**目标**：将各维度发现收敛为评级结论与改进建议，形成流程 Owner 可认领的行动清单。

**输出**：`assessment_report.md`；**可选**投影产物 `01_assessments/evaluation-assertions.yaml`——把双锚点且谓词族覆盖的 findings 按 framework evaluation-assertions schema（ACP-002）投影为本体断言，供跨评价沉淀与本体摄取。投影范围/映射/校验流程见 [断言投影契约](./references/assertion-projection.md)；投影失败不阻塞本阶段门禁。

**门禁**（全部满足后推进至 CLOSED；TRACK 为可选延长态）：

| 门禁 | 含义 |
|------|------|
| `rating_drafted` | 评级结论已起草（各维度评级 + 总评） |
| `gaps_itemized` | 缺口清单已逐条列出（类型/严重度/责任建议方/建议措施） |
| `recommendations_actionable` | 每条建议具体可执行（有明确责任方与验证方式），避免"加强管理"类空话 |
| `baseline_referenced` | 报告注明全部结论依据的 baseline 版本 |
| `upstream_defects_resolved` | 全部 open DDR 已闭环（verified 已修复并重新锚定 / dismissed 已记录理由 / deferred 已评估影响并经 Owner 确认） |

### TRACK 阶段（可选） — 跟踪整改

**目标**：跟踪改进建议的落实，验证整改效果。**进入条件**：流程 Owner 已认领建议清单。

**纪律**：整改验证若涉及新数据窗口，须组装新 baseline 版本（不可用旧基线验证新状态）；TRACK 不设终局门禁，整改完成或评价方职责结束时推进 CLOSED。

## 数据结构

### meta.json — 评价元数据

| 字段 | 必填 | 说明 |
|------|------|------|
| `assessment_id` | 是 | 格式 `PA-YYYY-NNN`，全局唯一 |
| `status` | 是 | 枚举：`scoped / baselining / assessing / reporting / tracking / closed / suspended / abandoned`，单向推进（suspended/abandoned 例外） |
| `processes` | 是 | 目标流程列表（L3 层级标识 + 组织归属） |
| `dimensions` | 是 | 评价维度（goal/risk/control/efficiency 的子集） |
| `current_baseline` | 否 | 当前生效基线版本（如 `baseline-v1`） |
| `created_by` / `created_at` / `last_activity` | 是 | 常规元数据 |
| `suspend_info` / `abandon_info` | 否 | 挂起/放弃原因 |

### checklist.yaml — 阶段门禁清单

结构与 case-management 的 checklist 一致：按阶段分组、每门禁一个布尔字段、`completed` 为汇总值不独立设置。

## 组合管理（PORTFOLIO）

多评价并行时的看板视角，`PORTFOLIO.md` 维护：

| 评价 | 流程 | 维度 | 阶段 | 波次 | Owner 确认状态 | 最近活动 |
|------|------|------|------|------|--------------|---------|

波次（wave）用于分批推进：优先级高的流程先入评价，同波次共享数据获取窗口；跨波次评价若涉及同一数据源，快照必须按波次分别落盘（避免基线混淆）。

## 脚手架

创建新评价时先运行脚手架，得到结构合法的起步包（含占位内容与 blocking 提醒），再增量替换：

```text
node skills/process-assess-workflow/scripts/scaffold-assessment.mjs process-assessments/{assessment_id} --assessment-id {assessment_id} --title {评价名称} [--processes "流程A,流程B"] [--dimensions goal,risk,control,efficiency] [--force]
```

## Related

- **能力层技能：** [policy-digest](../policy-digest/SKILL.md)（基座：文档→流程知识包）、[goal-alignment](../goal-alignment/SKILL.md)、[rcm-analysis](../rcm-analysis/SKILL.md)、[control-testing](../control-testing/SKILL.md)、[efficiency-diagnosis](../efficiency-diagnosis/SKILL.md)（四维评价）
- **共享契约：** [finding-contract](./references/finding-contract.md) — 四技能评价发现的统一结构（GA/RC/CT/ED 前缀、锚点纪律、severity 判级），REPORT 阶段聚合的依据
- **本体投影：** [assertion-projection](./references/assertion-projection.md) — findings → evaluation-assertions 投影契约（ACP-002，可选增强路径）
- **设计基准：** [docs/design.md](../../docs/design.md)（双模式架构、根心契约、范式差异）
- **对照范式：** investigation-ontology 插件的 case-management（对抗性调查工作流，与本技能的协作性评价工作流互为镜像）
