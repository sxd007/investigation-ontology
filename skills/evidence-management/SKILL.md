---
name: evidence-management
description: 证据链管理 — 证据识别与收集、链式保管(Custody Chain)、证据可采性评估、证据链可视化(推理链图/假设验证/治理状态)、电子证据保全。兼覆底稿编制规范与复核标准。
origin: efio
---

# 证据链与调查底稿管理

调查工作的"产品线" — 从原始证据到可呈堂的调查底稿。

## 配置前置检查

在执行本技能的业务操作前，按以下流程检查用户配置：

```
检查 {配置路径}/team-profile.md
├── 不存在 / 含 [PLACEHOLDER] / 含 PAUSED 标记
│   └── 自动进入 /efio:cold-start 配置向导，完成后继续当前操作
└── 配置就绪 → 继续

检查 {配置路径}/evidence-policy.md
├── 不存在或含标记 → 使用内置默认值（不阻塞）
└── 就绪 → 读取密级体系、保管链要求等配置
```

详细规则参见 `config-templates/config-loader.md`。

此技能读取的配置项：
- team-profile：调查团队、证据存储路径（待后续实现）
- evidence-policy：密级体系、保管链要求、底稿质量标准

## When to Activate

- 收集和保全任何类型的证据
- 建立或维护证据链式保管记录
- 评估证据的可采性和证明力
- 编制调查工作底稿
- 复核他人的调查底稿
- 准备证据移交或归档
- 查看/生成证据链可视化（推理链图、假设验证图、治理状态图、问题清单图）
- 运行证据链完整性检查或推理链逻辑检查
- **证据来源是原始文档（PDF/扫描件/图片）时** → 先调用 [document-parsing](../document-parsing/SKILL.md) 技能解析为结构化 parsed JSON，再用 parsed 结果创建 EV 节点（`/efio:parse <file>` 或 `use_skill "document-parsing"`）

## 证据管理全生命周期

```
识别 → 收集 → 保全 → 记录 → 分析 → 保管 → 呈现 → 归档/移交
```

## 核心工作流

本技能包含六个核心模块。每个模块的详细规范在对应 reference 文件中，按需加载。

### 1. 证据收集与链式保管

证据按形式（书证/电子证据/物证/证言/视听/专家）和证明力（直接/间接/佐证）分类。链式保管（Chain of Custody）是证据管理最关键环节——每件证据需有完整的提取人、时间、方式、哈希值和移交记录。

**保管五原则**：最少经手人、每次交接必签名、封存完好、电子证据加哈希、环境可控。

> 📖 详细规范：[`references/evidence-collection-and-custody.md`](references/evidence-collection-and-custody.md)

### 2. 证据可采性评估

通过四级过滤（相关性 → 合法性 → 可靠性 → 最优性）判断证据可采性。充分性判断使用 SPIRIT 框架（Sufficient / Pertinent / Independent / Reliable / Integrity / Timeliness）。

> 📖 详细规范：[`references/admissibility-assessment.md`](references/admissibility-assessment.md)

### 3. 调查底稿管理

底稿分五类（管理类/证据类/分析类/程序类/结论类），编制遵循 ALCOA 原则（Attributable / Legible / Contemporaneous / Original / Accurate），复核使用标准清单。

> 📖 详细规范：[`references/working-paper-standards.md`](references/working-paper-standards.md)

### 4. 证据注册表 (evidence_registry.json)

案件证据的结构化核心登记文件，包含 `metadata`、`chain_nodes`（节点索引）、`entities`、`evidence_items`、`findings`、`hypotheses`、`event_timeline` 七个顶层结构。**不包含关系图**——关系由 `nodes/` 中各节点文件的 frontmatter 声明。

创建时机：INIT 阶段创建基础结构 → FIELDWORK 大量追加 → REVIEWING 冻结。

> 📖 完整字段规范：[`references/evidence-registry-spec.md`](references/evidence-registry-spec.md)

### 5. 推理节点 (nodes/ 目录)

`nodes/` 目录承载推理分析层，7 种节点类型（EV/LS/ARG/FND/ENT/HYP/EVT）扁平存放，通过 frontmatter 的 `relations` 字段声明 8 种关系（derived_from / supports / contradicts / involves / corroborated_by / addresses / supported_by / contradicted_by）。

**关键规则**：类型在 frontmatter（不分子目录）、关系在节点内（不造边文件）、JSON 只做索引、ID 不可变。节点状态机：draft → ready（仅人工）→ superseded。

title 是断言（`谁+动作+事实`），body 是支持该断言的完整材料，excerpt 是流向下一级的事实。

> 📖 完整规范（含 title 断言公式、body 写作规范、excerpt 规则）：[`references/node-graph-spec.md`](references/node-graph-spec.md)

### 6. 证据链可视化

v3 多视图调查工具，四个互补 tab：**Reasoning**（推理链 + 边语义分色 + 治理徽章）、**Hypotheses**（HYP 支持/反驳验证）、**Governance**（本体对象生命周期状态）、**Issues**（推理链 + 治理问题清单）。

**两种可视化模式：**

| 模式 | 命令 | 适用场景 | 输出 |
|------|------|---------|------|
| 对话内 Mermaid 预览 | `scan-chain.js <case_dir> --graph` | 快速预览推理链结构 | Mermaid 代码块 |
| 交互式 HTML | `scan-chain.js <case_dir> --html [output.html]` | 完整交互图、汇报展示 | 独立 HTML 文件 |

**生成可视化 HTML 的操作步骤（当用户要求查看证据链可视化时执行）：**

1. 确认案件目录路径（通常为 `cases/CASE-YYYY-NNN/`）
2. 读取 `evidence_registry.json` 和 `nodes/` 目录确认数据就绪
3. 执行 `node skills/evidence-management/scripts/scan-chain.js <case_dir> --html <output_path>.html`
   - 如环境中无 Node.js，由 AI 读取节点数据后按 `--json-dump` 格式直接注入 HTML 模板
4. 用浏览器打开生成的 HTML 文件

> 📖 可视化架构 + scan-chain.js 完整选项参考：[`references/visualization-guide.md`](references/visualization-guide.md)

## 工具速查

| 命令 | 用途 |
|------|------|
| `scan-chain.js <case_dir> --list` | 列出所有节点和关系 |
| `scan-chain.js <case_dir> --trace FND-001` | 追溯 FND-001 完整证据链 |
| `scan-chain.js <case_dir> --integrity` | 完整性检查（含 v3 治理 readiness） |
| `scan-chain.js <case_dir> --check-chains` | 推理链逻辑检查（含 v3 HYP coverage） |
| `scan-chain.js <case_dir> --validate` | 节点结构验证（含 v3 ontology_ref 检查） |
| `scan-chain.js <case_dir> --sync` | 同步 chain_nodes 索引回 registry |
| `scan-chain.js <case_dir> --graph` | Mermaid 图预览 |
| `scan-chain.js <case_dir> --html output.html` | 交互式 HTML |
| `scan-chain.js <case_dir> --json-dump data.json` | JSON 数据输出（AI fallback 用） |

> 完整选项说明见 `references/visualization-guide.md`

## 分析辅助工具

以下工具类型可辅助加速证据管理操作。**这些工具不是必须的**——未配置时，由模型按证据管理标准直接完成。

如环境中配置了以下类型的 MCP 服务器，可辅助加速。不可用时由以下替代方式完成：
- **文件系统操作类 MCP**：用于读取/搜索证据文件、整理目录结构。不可用时手动指定文件路径
- **文档分析类 MCP**：用于提取 PDF 文本、搜索文档关键词、对比文件版本。不可用时直接阅读文件
- **数据库查询类 MCP**：用于查询证据登记表、检索底稿索引。不可用时查阅登记表或 CSV

**工作流示意（流程固定，工具可选）：**
1. 收集案件证据文件列表（由文件系统类 MCP 辅助或手动指定路径）
2. 提取关键文档摘要（由文档分析类 MCP 辅助或直接阅读文件）
3. 查验证据登记信息（由数据库类 MCP 辅助或查阅登记表）
4. 整合数据 → 生成证据清单底稿

## Related

- **Skills:** [调查哲学与方法论](../investigation-foundation/SKILL.md), [写作与报告技巧](../writing-reporting/SKILL.md), [访谈与问话分析](../interview-analysis/SKILL.md), [调查本体论](../ontology/SKILL.md) — 登记证据/实体的本体层操作规范, [文档结构化解析](../document-parsing/SKILL.md) — 原始文档先经解析再创建 EV 节点（`/efio:parse`）
- **Rules:** [证据规则](../../rules/evidence-rules.md), [底稿标准](../../rules/working-paper-standards.md)
- **Agents:** `evidence-analyzer` for 证据评估, `case-manager` for 底稿复核
- **Commands:** `/evidence` 证据管理, `/chain-of-custody` 保管链, `/working-paper` 底稿操作

## References

- ACFE "Fraud Examiners Manual" — Evidence Chapter
- SWGDE "Best Practices for Digital Evidence"
- ISO 27037:2012 — Guidelines for identification, collection, acquisition and preservation of digital evidence
