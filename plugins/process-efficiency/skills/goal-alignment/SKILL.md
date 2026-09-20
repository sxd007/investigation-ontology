---
name: goal-alignment
description: 流程目标对齐评价 — 评价流程目标的清晰度（SMART）、可度量性、目标与流程的挂接一致性（设计层），以及 KPI 映射与达成度（实例层）。当需要回答"流程目标定得好不好、达成了没有"时使用。
origin: process-efficiency
---

# 流程目标对齐评价

评价单元锚定 L3 Process（具备独立目标、入口与输出的层级）。本技能回答两类问题：**制度把目标定好了吗**（设计层，仅消费 digest）；**实际达成了吗**（实例层，加基线指标与数据快照）。

## 激活条件

- 评价流程目标的清晰度、可度量性或层级一致性
- 检查目标与流程活动（L3/L4）的挂接是否对齐
- 需要为目标建立 KPI 映射或评价 KPI 达成度
- process-assess-workflow 的 ASSESS 阶段调度本技能（dimensions 含 goal）

**不适用**：解构制度文档提取目标（policy-digest 的职责）；评价控制设计（rcm-analysis）；判断数据异常原因（data-analysis）。

## 输入

| 输入 | 来源 | 层 |
|------|------|----|
| `process_objectives[]`（statement / parent_objective_ref / element_refs / assertion_basis） | digest.json | 设计 |
| `process_elements[]`（L3/L4 层级与 entry/exit_conditions） | digest.json | 设计 |
| 指标定义（指标名 / 计算口径 / 数据字段映射 / 基准值） | baseline-v{N}.json | 实例 |
| 指标实际值数据 | baseline 快照 | 实例 |

## 方法论

### 设计层 — 目标质量评价（仅 digest）

**G1 目标清单化**：从 `process_objectives[]` 提取全部目标，标注 assertion_basis（explicit_text 优先于 analysis，analysis 推断的目标须在 finding 中注明推断性质）。

**G2 SMART 逐项评级**：

| 要素 | 检查问题 | 不达标信号 |
|------|---------|-----------|
| Specific | 目标是否指向明确对象与结果 | "加强管理""做好XX"类无结果态动词 |
| Measurable | 是否有数量/时限/质量标准 | 无任何数字或标准词 |
| Achievable | 与流程范围/资源是否相称 | 目标超出 scope 边界 |
| Relevant | 是否支撑上级目标或组织目标 | parent_objective_ref 断链或无关 |
| Time-bound | 是否有时限 | 无完成时点或周期定义 |

评级输出：`clear`（全部满足）/ `partial`（缺 1-2 项）/ `vague`（缺 3+ 项）。partial/vague 产生 finding（`objective_vague`），完全无目标产生 `objective_missing`。

**G3 目标-流程对齐**：

- 每个 L3 应有 ≥1 个目标挂接（element_refs 指向它）；无目标的 L3 → `objective_missing`；
- 挂接的目标与 L3 的 entry/exit_conditions 是否呼应（目标说"5日内完成"，exit_conditions 却无时限）→ `goal_process_misaligned`；
- 父子目标链检查：子目标（如 L3 目标）不支撑父目标（L2/L1 方向）→ `objective_conflict`。

**G4 可度量性缺口**：`objective_unmeasurable`——目标有方向但无法度量（如"提高质量"无质量指标定义），实例层 KPI 映射会验证此点。

### 实例层 — KPI 映射与达成（+ baseline）

**G5 KPI 覆盖映射**：对每个目标查找基线指标定义中的对应指标：

- 无指标 → `kpi_absent`（与 G4 呼应：G4 判目标不可度量，G5 判指标缺失，二者择一输出避免重复计数）；
- 指标口径含糊（计算口径无法从快照数据复算）→ `kpi_definition_unclear`；
- 多目标共指一个指标但口径混淆 → `kpi_definition_unclear` 并注明。

**G6 达成度计算**：按指标口径从快照数据计算实际值，对照基准（APQC PCF 参照值 / 内部历史值 / 目标值，注明基准来源）：

- 未达成且差距超出合理区间 → `kpi_not_achieved`，severity 按差距与目标重要性判；
- 计算受阻（数据缺口）→ 按 baseline 归因记录（评价方缺口/数据方缺口），不强行输出 finding，列入报告限制。

### 评价产出结构

```text
01_assessments/goal/
├── goal_review.md              # 目标评价报告（设计层+实例层）
├── objective_inventory.md      # G1 清单：目标×SMART评级×挂接L3
├── kpi_scorecard.md            # G5/G6 计分卡：指标×口径×实际值×基准×达成状态
└── findings.yaml               # 按 finding-contract 聚合
```

## 质量纪律

1. **消费纪律**：只消费 digest-schema 兼容的流程知识包（默认生产者 policy-digest）与 baseline 声明的指标/快照；目标原文经 digest 的 source 锚点回溯，不读制度原文；
2. **锚点纪律**：设计层 finding 带 `anchor.digest`（objective 的 ID + source），实例层带 `anchor.baseline`（版本+快照+记录）；
3. analysis 推断的目标（assertion_basis=analysis）在 finding 中注明"推断目标，非制度明文"；
4. finding 结构遵循 [finding-contract](../process-assess-workflow/references/finding-contract.md)，finding_type 用本技能枚举（GA-NNN 前缀）；
5. 评级是初判，severity 与最终评级在 REPORT 阶段经 Owner 反馈可调整（记录理由）。

## 上游缺陷识别（DDR）

本技能是目标语义的专家，有能力识别上游解构的缺陷。观察到以下信号时按 [DDR 机制](../process-assess-workflow/references/digest-defect-report.md)报告嫌疑（只报告+证据，不回读原文、不修改 digest、不替上游定性）：

| 观察 | 嫌疑 | DDR 类型 |
|------|------|---------|
| L3 无目标（`objective_missing`），但其 entry/exit_conditions 已表达结果态 | 目标在原文存在但未提取 | omission |
| 父子目标冲突，且子目标挂接元素 hierarchy_confidence 低 / inferred_structure | 层级归错导致假冲突 | misclassification |
| 目标 statement 与 source excerpt 语义不符 | 锚点错挂 | anchor_error |

**纪律**：`objective_missing` 类 finding 在 DDR 闭环前保持 provisional；DDR 被 dismissed（原文核验确无目标）后 finding 升级为确认发现——排除解构遗漏本身就是证据加强。

## Related

- **上游**：[policy-digest](../policy-digest/SKILL.md)（process_objectives 的生产者）；[process-assess-workflow](../process-assess-workflow/SKILL.md)（BASELINE 组装指标定义与快照）
- **同级**：[rcm-analysis](../rcm-analysis/SKILL.md)（风险维度）、[control-testing](../control-testing/SKILL.md)（控制维度）、[efficiency-diagnosis](../efficiency-diagnosis/SKILL.md)（效率维度）
- **契约**：[finding-contract](../process-assess-workflow/references/finding-contract.md)
- **参照系**：APQC PCF 流程指标基准（proc 域 Metric 的 Reference 层）
