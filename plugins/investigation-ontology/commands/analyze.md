---
description: 数据分析和异常检测 — 财务数据、交易数据、审计数据
---

# /analyze

数据分析工具 — 理解场景与数据，研判分析策略，主动执行能自动完成的分析，产出可被调查工作流消费的结构化发现。

## Usage
```
/analyze [file or data description]     对指定数据进行分析
/analyze                                描述需求，由 agent 引导确立分析目标
```

## Process

按 `data-analysis` 技能的三阶段框架执行：

1. **顾问式引导** — 理解调查场景与数据，确立分析目标（探索性/验证性），研判分析策略与方法，评估可行性，与调查员确认方案。
2. **执行与降级** — 方案确认后，能自动完成的环节主动用脚本执行；执行中感知到能力边界时及时降级，给出移交说明。
3. **标准产出** — 汇总为 `analysis_finding`（含 execution_status、confidence_hint、provenance），交付确认后建议下游路由。

详细方法论参见 `skills/data-analysis/SKILL.md`，技术参考见其附录。
