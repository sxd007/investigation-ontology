---
name: control-testing
description: 控制运行有效性测试 — 通过穿行测试与抽样，将实例执行记录对照 digest 的模板通路，识别未执行/绕过/偏离的控制。当需要回答"制度设计的控制实际被执行了吗"时使用。
origin: process-efficiency
---

# 控制运行有效性测试

对**实例层**的评价：制度说要有控制（digest 的 controls），实际跑了没有、跑对了没有。与 [rcm-analysis](../rcm-analysis/SKILL.md) 的边界：它评"设计得好不好"（模板层），本技能评"执行得到不到位"（实例层）。二者合起来才是完整的内控评价（COSO 的设计有效性 + 运行有效性）。

## 激活条件

- 测试流程控制是否按制度规定被执行（执行率/偏差）
- 通过穿行测试核对实际路径与模板通路（flow_edges）的一致性
- 识别控制绕过、例外未记录、留痕缺失等运行问题
- process-assess-workflow 的 ASSESS 阶段调度本技能（dimensions 含 control）

**不适用**：评价控制设计（rcm-analysis）；舞弊行为的取证与定性（investigation-ontology 的调查技能——本技能发现的可疑绕过应移交，不自行定性）；数据异常检测（data-analysis）。

## 输入

| 输入 | 来源 | 层 |
|------|------|----|
| `controls[]`（待测控制清单 / frequency / evidence 要求） | digest.json | 模板 |
| `flow_edges[]` + `process_elements[]`（模板通路） | digest.json | 模板 |
| 实例执行记录（含时间戳/操作人/对象/动作/路径，足以重建每笔实例的完整路径） | baseline 快照 | 实例 |
| 授权/阈值规则（判定"偏离"的基准） | digest rules | 模板 |

**数据快照的前置要求**（BASELINE 阶段应满足，不满足时先反馈）：执行记录必须能按单笔业务实例聚合出完整路径（申请→审批→执行→归档各环节的人/时间/动作）；无法聚合的记录只能支撑部分测试项，降级并列入报告限制。

**T0 数据可行性预检（强制前置）**：T1 之前按 [data-feasibility](../process-assess-workflow/references/data-feasibility.md) 完成 F1-F6 检查并签署 `data_feasibility.md` 的测试项可行性矩阵（full/degraded/excluded）——**先声明后分析**，矩阵签署前不得产出实例层 finding。

## 方法论

### T1 抽样策略

按控制频率定样本量（无统计学强制，供起评参考；全量数据可用时直接全量）：

| 控制频率 | 建议样本 | 说明 |
|---------|---------|------|
| 每笔触发 | 全量扫描高频项 + 随机抽样复核 | 系统数据可全量 |
| 日频 | 抽 20-30 个工作日 | 覆盖月初/月末 |
| 月频 | 抽 3-6 个月 | 覆盖季度末 |
| 触发式（条件控制） | 全量触发实例 | 通常量少 |

抽样须记录方法与样本范围（写入选样说明），保证可复现。**偏差发现后**：涉及该控制维度扩展样本或全量核验。

### T2 穿行测试（Walkthrough）

选 3-5 笔典型实例（正常路径 1-2 笔 + 各条件路径各 1 笔），人工走完整路径并对照模板：

- 实际路径与 `flow_edges` 模板是否一致（少了哪个环节、多了哪个环节）；
- 每个控制点是否被经过（审批人是否是制度规定的角色——对照 RACI）；
- 输出 Artifact 是否产生（对照 digest artifacts）。

穿行结果记录为路径对照表 + **逐控制穿行结论**（walkthrough.md 结论表）：每控制填「是否得到执行」（本技能结论，运行有效性）与「设计有效性」（**不重复评判**——引用 rcm-analysis R3 的 RC-finding，未覆盖标 n/a）。测试程序用词表：**重新执行**（独立重跑控制逻辑，证明力最强）/ **检查** / **观察** / **询问**（不可单独作为结论依据）。

### T3 执行偏差分析（全量/样本）

| 偏差类型 | 判定 | finding_type |
|---------|------|------------|
| 应执行未执行 | 按规则应触发控制但记录中无该控制动作 | `control_not_executed` |
| 绕过控制 | 走了模板外的路径（跳过控制点直达后端） | `control_bypassed` |
| 执行但偏离 | 控制动作存在但参数/时限/角色不符（超时限审批、非授权角色审批） | `control_deviation` |
| 例外未记录 | 触发了例外路径（reject/return/emergency 边）但无例外说明或审批 | `exception_unlogged` |
| 留痕缺失 | 控制执行但证据缺失（对照 controls.evidence 要求） | `control_evidence_missing` |
| 职责冲突 | 同一实例中不相容角色由同一人执行（申请+审批、执行+复核） | `segregation_conflict` |

**偏差率统计**：每控制点计算偏差率（偏差实例数 / 应控实例数），形成控制点执行率看板。执行率低于阈值（建议 95%，依据与校准见 [threshold-baseline](../process-assess-workflow/references/threshold-baseline.md)）的控制列为重点 finding。

### T4 可疑信号移交纪律

发现系统性绕过、篡改痕迹、串通迹象等**舞弊可疑信号**时：

- 本技能只记录现象（`control_bypassed`，severity=high，evidence 详列实例与数据定位）；
- **不进行舞弊定性**，在 goal_review 之外单独生成"移交建议"条目，建议调用方启动调查（investigation-ontology 的场景）；
- 移交条目注明数据快照定位，便于调查方从同一起点取证。

### 评价产出结构

```text
01_assessments/control/
├── sampling_plan.md            # T1 选样说明（方法/范围/理由）
├── walkthrough.md              # T2 穿行测试路径对照表
├── control_execution_scorecard.md  # T3 执行率看板（控制点×偏差率×重点标记）
├── deviation_details.md         # T3 偏差明细（逐条可追溯）
└── findings.yaml               # 按 finding-contract 聚合（含移交建议区）
```

## 起步脚手架

直接复制本技能 `templates/` 下的产出骨架到目标维度目录（或由工作流 `scaffold-dimension.mjs` 统一生成）：

```text
node skills/process-assess-workflow/scripts/scaffold-dimension.mjs {output_root}/01_assessments/<dim> --skill <dim> [--assessment-id PA-2026-001] [--date 2026-09-29]
```

骨架含本技能文档化的全部 .md 产出与 `findings.yaml` 占位；占位符 `{assessment_id}`/`{date}` 自动替换。findings 结构遵循 finding-contract，聚合到 `findings.yaml`。

填充真实数据后运行 `node skills/process-assess-workflow/scripts/validate-findings.mjs 01_assessments/control/findings.yaml` 做契约校验，0 错误方可进入 REPORT（可加 `--strict` 把警告也计为错误）。

## 质量纪律

1. **消费纪律**：只消费 digest-schema 兼容的流程知识包（模板：controls/flow_edges，默认生产者 policy-digest）与 baseline 快照（实例）；不读制度原文；不引入快照外的"顺手指令"数据；
2. **锚点纪律**：finding 必带 `anchor.baseline`（版本+快照+记录定位）与 `anchor.digest`（相关 control/flow_edge ID）；纯实例发现（如绕过）至少可从快照重建证据链；
3. **协作姿态**：偏差先核实数据质量（字段缺失≠未执行），确认后再定性——与流程 Owner 的沟通在 ASSESS 门禁 `stakeholder_review_done` 中完成；
4. finding 结构遵循 [finding-contract](../process-assess-workflow/references/finding-contract.md)（CT-NNN 前缀）；
5. 样本与方法写死在 sampling_plan.md，他人可据此复现；
6. **底稿索引纪律**：每条测试结论（执行/偏差/放行）必须带工作底稿索引——指向 walkthrough/deviation_details 具体行或快照记录定位；无索引的结论视为未完成（对齐审计工作底稿惯例）；
7. **设计/执行结论分离**：本技能只判"是否得到执行"（运行有效性）；"设计是否有效"引用 rcm-analysis R3 结论，不重复评判（COSO 两有效性边界）。

## 上游缺陷识别（DDR）

本技能持有**实例数据这一独立证据源**——执行日志是关于流程结构的独立先知，与 digest 模板交叉验证可发现解构遗漏。观察到以下信号时按 [DDR 机制](../process-assess-workflow/references/digest-defect-report.md)报告：

| 观察 | 嫌疑 | DDR 类型 |
|------|------|---------|
| 实例路径出现 digest 中不存在的控制点/环节 | 模板遗漏（制度记载或实际存在的环节未提取） | omission |
| `control_not_executed` 比例异常高（>50%）且快照覆盖核验通过 | digest 幻觉了不存在的控制（或控制在未覆盖系统执行——须同时注数据缺口可能） | hallucination |
| 穿行测试实际路径与 flow_edges 大面积不符（>2 个环节差异） | flow_edges 提取不完整，而非实际偏离 | omission |

**"未执行"的三种解释分诊**：模板有控制+实例无记录 → ①未执行（finding）②控制在快照外系统执行（数据缺口归因）③模板幻觉（DDR）。快照覆盖核验排除②，DDR 处理③，剩余才定性①。

**Template-free 降级**：无流程知识包时可降级为纯实例自洽性检查（职责冲突/留痕缺失/路径自洽），跳过绕过/偏离类发现，报告标注"无模板基准"，见 [finding-contract §7](../process-assess-workflow/references/finding-contract.md)。

## Related

- **上游**：[policy-digest](../policy-digest/SKILL.md)（controls/flow_edges 模板的生产者）；[rcm-analysis](../rcm-analysis/SKILL.md)（设计层评价——其 `control_evidence_missing` 类设计缺口是本技能受阻的预警）
- **下游移交**：可疑舞弊信号 → investigation-ontology 插件（调查定性）
- **同级**：[goal-alignment](../goal-alignment/SKILL.md)、[efficiency-diagnosis](../efficiency-diagnosis/SKILL.md)
- **契约**：[finding-contract](../process-assess-workflow/references/finding-contract.md)
- **参照系**：COSO 运行有效性测试 / 内审穿行测试方法
