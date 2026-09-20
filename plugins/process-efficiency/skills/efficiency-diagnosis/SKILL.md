---
name: efficiency-diagnosis
description: 流程效率诊断 — 评价流程路径结构的冗余与返工（设计层：串行审批/并行机会/返工环/交接链），以及周期时间分解与瓶颈识别（实例层：耗时分布/等待时间/返工率）。当需要回答"流程跑得快不快、卡在哪里、为什么慢"时使用。
origin: process-efficiency
---

# 流程效率诊断

设计层看**结构**（制度把路径设计得绕不绕），实例层看**运行**（实际时间花在哪）。核心产出是瓶颈清单与结构优化建议。

## 激活条件

- 评价流程路径结构（串行审批链、可并行环节、返工环、交接链）
- 分析周期时间分解（处理时间 vs 等待时间）与瓶颈环节
- 诊断返工率与返工原因分布
- process-assess-workflow 的 ASSESS 阶段调度本技能（dimensions 含 efficiency）

**不适用**：数据异常检测（data-analysis——本技能关注全流程时序结构，不针对个案异常）；控制设计/执行评价（rcm-analysis / control-testing——效率诊断发现的"等待审批过长"若源于控制设置，须交叉引用控制维度发现而非替代）。

## 输入

| 输入 | 来源 | 层 |
|------|------|----|
| `flow_edges[]`（edge_kind 含 main/conditional/reject/return/escalation/emergency） | digest.json | 设计 |
| `process_elements[]`（L3-L5 层级）+ `role_assignments[]`（RACI） | digest.json | 设计 |
| `rules[]`（时限规则/阈值——判定"过长"的制度基准） | digest.json | 设计 |
| 实例执行记录（时间戳序列，可重建每笔实例各环节的进入/离开时间） | baseline 快照 | 实例 |

## 方法论

### 设计层 — 路径结构分析（仅 digest）

**E1 串行审批链分析**：

- 提取纯串行审批链（连续 A 角色节点、无分支），统计链长；
- 阈值匹配检查：审批层级与 rules 中的金额/风险阈值是否匹配（小额也走长链）→ `approval_overload`；
- **并行机会识别**：串行链中前后环节无数据依赖（后环节不消费前环节产出——对照 input_artifact_refs）的，标记为"可并行候选"，多处串行无依赖 → `serial_redundancy`。

**E2 返工环检测**：

- 由 reject/return 边构成的"回退到前序环节"路径即为返工环；制度内显式定义的返工环记录其起点/终点/触发条件；
- 返工环无终止条件（可无限循环）或无责任角色（RACI 未定义谁处理返工件）→ `rework_loop`（severity 按影响判）。

**E3 交接链分析**：

- 按 RACI 统计一笔典型实例的跨部门/跨角色交接次数（每次交接=一次等待+一次丢失风险）；
- 交接链上存在"传递即丢失"的弱交接（前一角色的输出 Artifact 不在后一角色环节的 input_artifact_refs 中）→ `handoff_excess`（结合实例层等待时间判 severity）。

### 实例层 — 周期时间分析（+ baseline 快照）

**E4 周期时间分解**：对每笔实例计算端到端周期，分解到环节：

```text
环节耗时 = 离开时间戳 - 进入时间戳
等待时间 = 环节内无操作动作的时间（进入后首个动作之前）
处理时间 = 环节内动作的总时长
```

统计各环节的 P50 / P90 / 最大值。周期分布呈双峰（大量快实例 + 少量极慢实例）提示条件分支未区分对待 → 结合 flow_edges 条件分析。

**E5 瓶颈识别**：

- 等待时间占比最高的环节（P90 等待 > 全流程等待的 40%）→ `bottleneck_wait`（severity：high=瘫痪级积压 / medium=常态性延迟 / low=偶发）；
- 制度时限对照：环节 P50 超出 rules 时限 → 独立标注"制度违约率"（与 control-testing 的 `control_deviation` 交叉引用，避免重复计数——时限超期同时是控制偏离时，由 control-testing 主责，本技能交叉引用其 finding_id）；
- 单点负载：某角色同时是多个串行环节的 R → 个人负载分析（该角色的队列深度）。

**E6 返工率分析**：

- 实际走了 reject/return 路径的实例占比 = 返工率；
- 返工原因分布（哪个环节的返工件最多、流向哪里）；
- 返工率高（>10% 建议）且集中于单点 → 该单点是质量或规则问题，交叉引用对应维度（规则阈值不合理 → goal/risk 维度；提交质量差 → handoff 分析）；
- `rework_loop`（设计层）与实际返工率（实例层）对照：设计无环但实际高频回退 → 路径外循环，记 `control_bypassed` 交叉引用（control-testing 主责）。

**E7 离群诊断**：`cycle_time_outlier`——P90 与 P50 比值异常大的环节（等待/处理比失控），单独列为待深挖项（可能指向瓶颈的下游成因）。

### 评价产出结构

```text
01_assessments/efficiency/
├── structure_review.md         # E1-E3 设计层结构诊断
├── cycle_time_decomposition.md # E4 周期分解（环节×P50/P90/等待占比）
├── bottleneck_analysis.md      # E5+E7 瓶颈清单
├── rework_analysis.md          # E6 返工率与原因分布
└── findings.yaml               # 按 finding-contract 聚合
```

## 质量纪律

1. **消费纪律**：只消费 digest-schema 兼容的流程知识包（默认生产者 policy-digest）与 baseline 快照；不读原文；不引入快照外数据；
2. **锚点纪律**：设计层 finding 带 anchor.digest（flow_edge/process_element/rule ID + source），实例层带 anchor.baseline（版本+快照+记录）；
3. **交叉引用纪律**：与其他维度重叠的发现（时限超期=控制偏离；高频返工=规则问题）只交叉引用主责技能的 finding_id，不重复输出；
4. **改进建议可行性**：`serial_redundancy` 类结构建议须注明数据依赖依据（"无依赖"的判定来自 input_artifact_refs 对照），避免拍脑袋建议；
5. finding 结构遵循 [finding-contract](../process-assess-workflow/references/finding-contract.md)（ED-NNN 前缀）。

## 上游缺陷识别（DDR）

实例数据是流程结构的独立先知，时序分析天然暴露模板（flow_edges/artifact 依赖）的完整性。观察到以下信号时按 [DDR 机制](../process-assess-workflow/references/digest-defect-report.md)报告：

| 观察 | 嫌疑 | DDR 类型 |
|------|------|---------|
| 实例高频返工环在 flow_edges 无对应 reject/return 边 | 流转边遗漏 | omission |
| `serial_redundancy` 判定所依赖的 input_artifact_refs 疑似错挂（后环节实际等待前环节产出） | 依赖关系归类错误——**不排除则并行化建议是伪优化** | misclassification |
| 环节超期但 rules 无时限条款，且条款锚点 excerpt 含时限数字 | 时限参数未提取 | omission |

**纪律**：`serial_redundancy` 的并行化建议在依赖关系 DDR 闭环前不得进入 REPORT 的正式建议清单（伪优化比不优化更有害）。

**Template-free 降级**：无流程知识包时 E4–E7（周期分解/瓶颈/返工/离群）完整可用，E1–E3 结构诊断跳过；报告标注"无模板基准——结论限于实证发现"，见 [finding-contract §7](../process-assess-workflow/references/finding-contract.md)。

## Related

- **上游**：[policy-digest](../policy-digest/SKILL.md)（flow_edges/elements/RACI 的生产者）
- **同级**：[goal-alignment](../goal-alignment/SKILL.md)（时限类目标）、[rcm-analysis](../rcm-analysis/SKILL.md)（控制频率与审批层级）、[control-testing](../control-testing/SKILL.md)（时限偏离的主责）
- **契约**：[finding-contract](../process-assess-workflow/references/finding-contract.md)
- **参照系**：流程挖掘（Process Mining）周期分析 / 精益（Lean）价值流图方法；proc 域 Metric
