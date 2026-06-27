# Agents

investigation-ontology 提供以下专业代理，可通过 Claude Code 的子代理功能调用：

| Agent | 用途 | 调用场景 |
|-------|------|---------|
| `investigation-planner` | 调查方案设计 | 启动新案件时制定完整调查计划 |
| `evidence-analyzer` | 证据评估 | 评估证据可采性、可靠性和充分性 |
| `interview-analyzer` | 访谈分析 | 分析访谈陈述的真实性和完整性 |
| `report-writer` | 报告撰写 | 将调查发现撰写为结构化报告 |
| `fraud-type-classifier` | 舞弊类型分类 | 根据线索特征识别舞弊类型 |
| `data-analyzer` | 数据分析 | 执行数据异常检测和分析 |

代理以 Markdown 格式定义在 `agents/` 目录下，由 Claude Code 自动发现。
