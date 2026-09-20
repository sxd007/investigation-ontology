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
- [ ] 流程评价技能集草案（评价基线组装 / 目标对齐 / 风险控制矩阵 / 穿行测试 / 效率诊断）— 设计讨论中。

## 版本

见 [VERSION](./VERSION)。当前 0.1.0（policy-digest 从 investigation-ontology v1.1.0 剥离迁入）。
