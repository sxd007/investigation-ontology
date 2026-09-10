---
description: 证据管理 — 链式保管、证据清单、证据评估、证据链可视化
---

# /evidence

调查证据全生命周期管理。

## Usage
```
/evidence list [case#]        查看证据清单
/evidence add                 添加证据记录
/evidence chain [evidence#]   查看/更新保管链
/evidence assess [evidence#]  证据可采性评估
/evidence integrity [case#]   运行证据链完整性检查
/evidence visualize [case#]   生成证据链可视化HTML（推理链图、假设验证、治理状态）
/evidence graph [case#]       对话内Mermaid推理链预览
```

## Process

所有操作遵循 evidence-management 技能的 ALCOA 原则和 SPIRIT 评估框架。

### /evidence add

添加新证据时，需同时：

1. 在 `evidence_registry.json` 的 `evidence_items[]` 中注册核心信息
2. 创建 `nodes/EV-NNN.md` 文件（详细分析和描述）
3. 在 `evidence_registry.json` 的 `chain_nodes[]` 中追加索引
4. 追加 `CHANGELOG.json` 变更记录

### /evidence integrity

运行 `skills/evidence-management/scripts/scan-chain.js --integrity` 检查：

- 所有 finding 的 sources 链是否完整
- 是否有 draft 节点阻塞 ready finding
- 是否有孤立节点或缺失引用

### /evidence visualize

生成交互式证据链可视化 HTML 文件（四视图：Reasoning / Hypotheses / Governance / Issues）。

操作步骤：

1. 确认案件目录路径（通常为 `cases/CASE-YYYY-NNN/`）
2. 读取 `evidence_registry.json` 和 `nodes/` 目录确认数据就绪
3. 执行 `node skills/evidence-management/scripts/scan-chain.js <case_dir> --html <output_path>.html`
   - 如环境中无 Node.js，由 AI 读取节点数据后按 `--json-dump` 格式直接注入 HTML 模板
4. 用浏览器打开生成的 HTML 文件

### /evidence graph

在对话内生成 Mermaid 推理链预览图。

执行 `node skills/evidence-management/scripts/scan-chain.js <case_dir> --graph`，输出 Mermaid 代码块在对话中渲染。
