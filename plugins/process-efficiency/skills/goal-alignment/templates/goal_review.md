# 流程目标评价报告（goal-alignment）

> 评价 ID：{assessment_id} ｜ 维度：goal ｜ 生成：{date}
> 输出根：{output_root}/01_assessments/goal/

## 一、设计层（目标质量，仅消费 digest）

- 目标清单与 SMART 逐项评级见 `objective_inventory.md`
- 总体评级：`clear`（全满足）/ `partial`（缺 1-2 项）/ `vague`（缺 3+ 项）
- 完全无目标 → `objective_missing`；可度量性缺口 → `objective_unmeasurable`

## 二、实例层（KPI 映射与达成，+ baseline 快照）

- 计分卡见 `kpi_scorecard.md`
- 未达成目标：列出 `kpi_not_achieved` 及其差距与判级依据
- 计算受阻（数据缺口）→ 记 baseline 归因，列入报告限制，不强行出 finding

## 三、发现汇总

- 见 `findings.yaml`（GA-NNN 前缀，契约见 process-assess-workflow/references/finding-contract.md）
- 锚点纪律：设计层 finding 带 `anchor.digest`；实例层带 `anchor.baseline`
- `objective_missing` 类在 DDR 闭环前保持 `provisional`
