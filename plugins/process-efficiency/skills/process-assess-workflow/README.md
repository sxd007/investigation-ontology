# process-assess-workflow

流程评价工作流管理技能 — process-efficiency 插件的**工作流层**。

服务两种场景中的**场景一**：专职推动流程效率优化的人，需要有序管理单个或多个流程评价，逐步或并行推进。为能力层技能（policy-digest / goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）提供 `process-assessments/{assessment_id}/` 输出根与生命周期上下文。

场景二（其他工作语境嵌入调用，如调查案件分支深化）**不使用本技能**——直接调用能力技能并由调用方提供输出根。

## 核心内容

- **生命周期**：SCOPE → BASELINE → ASSESS → REPORT（+可选 TRACK）→ CLOSED，各阶段有明确门禁
- **基线版本化**：digest 引用 + 指标定义 + 数据快照（含哈希）固化为 Append-Only 基线版本，结论可追溯到基线快照（审计级可复现）
- **组合管理**：`PORTFOLIO.md` 看板支持多评价并行与波次推进
- **范式定位**：协作性评价工作流（对照 case-management 的对抗性调查工作流）

## 快速开始

```text
node skills/process-assess-workflow/scripts/scaffold-assessment.mjs process-assessments/PA-2026-001 --assessment-id PA-2026-001 --title "采购流程效率评价" --processes "供应商准入,采购执行" --dimensions risk,control,efficiency
```

## 文档

- 执行规范：[SKILL.md](./SKILL.md)
- 设计基准：[docs/design.md](../../docs/design.md)

## 状态

🚧 Alpha — SKILL 与脚手架就位；四维评价技能（goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）规划中，ASSESS 阶段可先行以手工评价过渡。
