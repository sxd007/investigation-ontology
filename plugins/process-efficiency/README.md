# process-efficiency

流程评价与效率分析插件 — **ontology_framework 的应用化插件**。与 [investigation-ontology](../investigation-ontology/README.md)（调查应用化插件）并列，两者共同遵从 ontology_framework 的本体架构设计（proc 流程域 / risk 风控域 / org 组织域），在本体层系统统一。

## 定位

| 插件 | 范式 | 核心问题 |
|------|------|---------|
| investigation-ontology | 事后归因（调查） | 发生了什么、谁的责任 |
| **process-efficiency** | 规范性评价 | 流程设计得好不好、跑得好不好（目标 / 风险 / 控制点 / 效率） |

评价物单独维护在 `process-assessments/` 根目录，不与调查案件的 `cases/` 结构混用。

## 技能

| 技能 | 层 | 说明 |
|------|----|------|
| `process-assess-workflow` | 工作流 | 评价组合管理 — 多流程评价并行推进、生命周期门禁（SCOPE→BASELINE→ASSESS→REPORT+TRACK）、基线组装与版本化 |
| `policy-digest` | 能力·基座 | 企业制度流程解构 — 将制度、办法、流程、授权文件及附件转化为带原文锚点的规则、L1–L5 流程、RACI、风险控制、问题清单与本体 candidates 入库包 |
| `goal-alignment` | 能力 | 流程目标清晰度（SMART 评级）与 KPI 达成度评价 |
| `rcm-analysis` | 能力 | 风险-控制矩阵、覆盖度（无控/未识别风险）与控制设计有效性 |
| `control-testing` | 能力 | 穿行测试与抽样偏差分析（未执行/绕过/偏离），可疑信号移交调查 |
| `efficiency-diagnosis` | 能力 | 路径结构诊断（串行冗余/返工环）与周期时间分解、瓶颈识别 |

四技能产出的评价发现遵循统一 [finding-contract](./skills/process-assess-workflow/references/finding-contract.md)（GA/RC/CT/ED 前缀、锚点纪律、severity 判级），REPORT 阶段由此收敛。

### 工具与脚手架

流程评价能力的落地工具（零依赖 Node 脚本 + 规范模板），位于 `skills/process-assess-workflow/scripts/`：

| 工具 | 用途 |
|------|------|
| `validate-findings.mjs` | findings 校验 — 检查 `findings.yaml` 是否符合 finding-contract（前缀 / 锚点 / severity），输出校验报告 |
| `aggregate-findings.mjs` | findings 聚合 — 跨维度收集并收敛 findings，供 REPORT 阶段汇总 |
| `yaml-lite.mjs` | 极简 YAML 解析（零依赖）— 被上述工具复用，规避外部 YAML 库 |
| `scaffold-dimension.mjs` | 维度脚手架 — 为新增评价维度生成规范模板 + `findings.yaml` 骨架（root-agnostic） |

四能力技能（`goal-alignment` / `rcm-analysis` / `control-testing` / `efficiency-diagnosis`）各内置 `templates/` 规范模板（评价表 / 清单类，结构与各自 SKILL.md 对齐，统一待填占位符），由脚手架生成、被评价流程消费。

findings 闭环：评价产出 → `findings.yaml`（脚手架生成骨架）→ `validate-findings` 校验 → `aggregate-findings` 收敛 → REPORT 阶段汇总。

架构与边界设计见 [docs/design.md](./docs/design.md)（双模式架构：能力层 root-agnostic 可独立嵌入；工作流层服务专职评价场景）。

## 与 ontology_framework 的关系

本插件通过 **vendored schema + `coreVersions` 声明**对齐 ontology_framework，运行时零依赖：

- `skills/policy-digest/references/schemas/candidates-0.3.0.schema.json` — vendored from ontology_framework
- `skills/policy-digest/references/schemas/parsed-document-0.1.0.schema.json` — vendored from ontology_framework

后续流程评价技能将基于 proc 域五层链（L1 ProcessCategory → L5 Task）与 Metric/ControlPoint 跨切类构建评价投影。

## 设计文档

| 文档 | 内容 |
|------|------|
| [docs/design.md](./docs/design.md) | 插件设计基准（双模式架构、范式差异、生命周期） |
| [docs/finding-projection-design.md](./docs/finding-projection-design.md) | 评价发现本体投影提案（Draft，待 ontology_framework 对齐） |

## 与 investigation-ontology 的协作

两插件可共存安装，无强依赖：

- 调查案件中需要对相关制度流程做深入分析时，调查员可直接调用 `policy-digest`（属于案件分支上的深化产物，不影响调查主干）；此时输出仍写入 `cases/{case_id}/policy-digests/`；
- 原始文件解析能力由调查插件的 `document-parsing` 技能优先承担（若已安装）；未安装时按 `policy-digest` SKILL.md 的兜底路径由模型直读并建立等价锚点。

## Backlog

- [x] **policy-digest schema 0.3.0 泛化**（已完成）— 语境标识 `case_id`→`engagement_id`，输出根按语境约定（调查语境 `cases/{case_id}/policy-digests/`，评价语境 `process-assessments/{assessment_id}/policy-digests/`）；0.2→0.3 机械迁移器就位，validator/projector/explanation 双版本兼容（0.2.0 读有效），scaffold `--engagement-id`。0.2.0 进入维护模式。
- [x] **流程评价能力落地工具就位**（已完成）— 四能力技能 `templates/` 规范模板 + `scaffold-dimension.mjs` 维度脚手架 + findings 闭环工具（`validate-findings` / `aggregate-findings` / `yaml-lite`）；产出的 findings 遵循 finding-contract 收敛。
- [x] **评价基线组装工具化**（2026-09-30 完成）— `assessment-baseline-0.1.0.schema.json` + [baseline-contract](./skills/process-assess-workflow/references/baseline-contract.md) + `scaffold-baseline.mjs`（扫描 digest/快照组装草稿、版本自动递增、`--refresh` 重算哈希仅 draft）+ `validate-baseline.mjs`（结构/文件存在性/sha256 实测/冻结纪律/版本链）；finding 实例层锚点（`anchor.baseline`）与基线结构对齐。附带修复 `scaffold-assessment.mjs --force` 对既有目录报 EEXIST 的问题。
- [x] **维度产物初稿生成器**（2026-09-30 完成）— `generate-dimension-drafts.mjs`：从基线引用的 digest 机械预填四维度 12 类产物（目标清单+G3 对齐检查、KPI 计分卡、RCM 矩阵+orphan 控制、无控风险清单、控制设计表+冗余候选、选样计划、穿行模板路径、执行率看板、结构诊断 E1-E3、周期分解/瓶颈环节行、返工设计层对照）；判断列留白 `{…}`，既有文件默认跳过；支持 `--digest` 直喂（场景二）。
- [x] **evaluation-assertions 本地校验器 + 锚点跨文件校验**（2026-09-30 完成）— `validate-evaluation-assertions.mjs`（结构/XOR/supersedes 链：指向存在·无环·不分叉/未对齐率，替代跨仓 Python 工具）；`validate-findings.mjs --baseline` 跨文件校验（anchor.baseline 的 version/snapshot_ref 必须命中基线声明）。附带修复：`aggregate-findings.mjs` 投影 status 的 provisional→proposed 映射（schema 枚举仅 proposed/confirmed）与断言块缩进（yaml-lite 兼容）。
- [x] **工作流工具链回归测试**（2026-09-30 完成）— `test-workflow-toolchain.mjs`：9 脚本 × 8 组链路 × 40+ 断言固化（脚手架/基线冻结与哈希篡改/版本链/四维度初稿/锚点跨文件校验/投影与 provisional 映射/断言校验正负面六类），数据源复用 policy-digest ten-rule-policy fixture。
- [x] **域风险参照库**（2026-09-30 完成）— rcm-analysis `references/risk-lib/`：《企业内部控制应用指引》18 域全覆盖（194 风险条目 / 508 典型控制，含指引条款出处与六类标签；9 个纯控制型域已按财政部官方指引全文逐字补录风险文本，18/18 complete）；转换器 gitignored 维护侧持有；使用/校准纪律见[库契约](./skills/rcm-analysis/references/risk-lib/risk-lib-contract.md)。采购域已人工校准（R01/R05）。
- [x] **初稿生成器集成域风险库**（2026-09-30 完成）— `generate-dimension-drafts.mjs --risk-library <域,...>`：RCM 矩阵 [参照] 行与「未识别风险」候选表机械预填（参照等级/典型控制条数），bigram 机械相似度提示疑似已覆盖（≥0.4，须语义复核，DDR 纪律不变）；回归测试已覆盖。
- [x] **数据可行性预检**（2026-09-30 完成）— [data-feasibility](./skills/process-assess-workflow/references/data-feasibility.md)：实例层分析（control-testing/efficiency-diagnosis）的强制前置——F1-F6 检查（时间戳粒度/实例可聚合/环节映射/字段完整性/覆盖核验/触发可判定）+ 测试项可行性矩阵（full/degraded/excluded 先声明后分析），防 garbage-in-gospel-out；生成器预填骨架，阈值登记 threshold-baseline。
- [x] **fraud-\* 类型学反哺风险库**（2026-09-30 完成）— 5 域注入 42 条 `fraud_patterns`（procurement 15 / hr 12 / sales 7 / treasury 4 / contract 4），提炼自调查插件 8 个 fraud-\* 技能：手法名/操作场景/红旗信号/易发环节/关联风险条目/来源技能；用途=R2 场景对照 + control-testing 移交联动（pattern_id 为两插件共通语言）；纪律=场景对照非发现本身。
- [x] **业务接地小批次**（2026-09-30 完成）— ①control-testing 模板吸收审计工作底稿惯例：逐控制穿行结论表（是否得到执行=本技能/设计有效性=引用 RC-finding 不重复评判）、测试程序词表（重新执行/检查/观察/询问）、全部测试结论强制工作底稿索引；②[threshold-baseline](./skills/process-assess-workflow/references/threshold-baseline.md) 阈值出处表（95%/50%/2环节/40%/10%/P90:P50>3 等全部登记出处与校准指引，经验值不得包装为行业标准）；③finding-contract §8 负面清单（8 类反模式：空话建议/复述而非发现/越权定性/重复计数/占位残留/证据不定位/严重度通胀/阈值当判据）+ validate-findings 空话建议机械检测。回归测试已覆盖。
- [ ] 流程评价技能集深化（多流程并行 / 与 ontology_framework Metric·ControlPoint 投影对齐）— 进行中。

## 版本

见 [VERSION](./VERSION)。当前 0.3.0（评价基线组装工具化 + 维度产物初稿生成器 + 断言本地校验器 + 工具链回归测试，2026-09-30；0.2.0 为 policy-digest 从 investigation-ontology v1.1.0 剥离迁入）。
