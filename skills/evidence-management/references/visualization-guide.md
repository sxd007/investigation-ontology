---
name: visualization-guide
description: 证据链可视化指南 — v3 多视图架构（Reasoning/Hypotheses/Governance/Issues）、7个数据块、边语义分色、治理徽章、两种可视化模式、scan-chain.js 完整选项参考。在生成可视化或使用 scan-chain.js 时加载。
---

# 证据链可视化

## ⚠️ 节点格式规范（重要）

> **不要**为了让工具运行而创建非标准格式的节点文件。`scan-chain.js` 已兼容本体论定义的标准 `relations` 格式。如果工具无法识别你的节点，**修工具，不改节点**。

所有节点文件**只使用** `relations:` 字段声明关系（见 `references/node-graph-spec.md`）。旧版 `sources:` 字段已废弃（`scan-chain.js --integrity` 会发出 WARN）。

## v3 可视化架构

证据链可视化从单一 XMind 推理树图演进为**多视图调查工具**，支持四个互补视图：

| 视图 | Tab | 展示内容 | 适用阶段 |
|------|-----|---------|---------|
| **推理链视图** | Reasoning | FND ← ARG ← LS ← EV 推理链 + 边语义区分 + 治理徽章 | 全阶段（默认） |
| **假设验证视图** | Hypotheses | HYP 的 supported_by / contradicted_by 扇形验证结构 | FIELDWORK, REVIEWING |
| **治理状态视图** | Governance | 本体对象 lifecycle_status 分组 + 状态分布条形图 | REVIEWING |
| **问题清单视图** | Issues | 推理链问题 + 本体绑定问题 + 治理门禁问题 | REVIEWING |

### 数据结构 (v3)

injector 输出的 7 个数据块：

```javascript
const CASE_DATA = {...};         // 案件信息 + 治理统计 + 调查阶段
const NODES_DATA = {...};        // 认知层节点 + ontology_ref + governance
const EDGES_DATA = [...];        // 认知层关系边，带 relation_type + layer
const CHAINS_DATA = [...];       // FND 推理链树
const HYPOTHESIS_DATA = [...];   // HYP 支持/反驳结构 + coverage
const ONTOLOGY_DATA = {...};     // 本体对象摘要
const GOVERNANCE_ISSUES = [...]; // 门禁与治理风险
```

### 边语义区分

推理链视图中的连线按 `relation_type` 分色分线型：

| 关系类型 | 线色 | 线型 |
|---------|------|------|
| `derived_from` | 灰蓝 | 实线 |
| `supported_by` / `supports` | 绿色 | 实线 |
| `contradicted_by` / `contradicts` | 红色 | 虚线 |
| `involves` | 灰蓝 | 细虚线 |

### 本体治理 Overlay

EV/ENT 节点卡片右上角显示治理状态徽章：

| 徽章颜色 | 含义 |
|---------|------|
| 绿色 | VERIFIED（已验证） |
| 金色 | SEALED（已封存） |
| 黄色 | UNRESOLVED（未解决） |
| 红色 | DISPUTED（有争议） |
| 灰色 | 未绑定本体对象 |

详情面板展示 `ontology_ref` 的完整信息（object_id, object_type, lifecycle_status, sealed）。

## 两种可视化模式

| 模式 | 命令 | 适用场景 | 输出 |
|------|------|---------|------|
| **对话内 Mermaid** | `scan-chain.js <case_dir> --graph` | 快速预览、在对话界面直接查看结构 | Mermaid 代码块（平台渲染） |
| **交互式 HTML** | `scan-chain.js <case_dir> --html output.html` | 完整交互图、汇报展示、复杂案件 | 独立 HTML 文件（浏览器打开） |

**Mermaid 快速预览：**

```bash
node scan-chain.js cases/CASE-2026-001/ --graph
```

输出在对话框内渲染（支持 Mermaid 的平台）；不支持时以文本形式展示。

**交互式 HTML（推荐用于正式汇报）：**

```bash
# 需要 Node.js 环境
node scan-chain.js cases/CASE-2026-001/ --html evidence_chain.html
# 然后用浏览器打开 evidence_chain.html
```

HTML 模板来源：`templates/evidence-chain-viz/evidence_chain_viewer.html`。`scan-chain.js` 负责将案件数据注入模板，生成零外部依赖的独立 HTML 文件。

**AI fallback（无 Node.js 时）：**

```bash
# 先在有 Node.js 的环境中获取 JSON 格式参考
node scan-chain.js cases/CASE-2026-001/ --json-dump data.json
# AI 读取节点文件 → 按 JSON 格式构造 7 个数据块 → 直接替换模板中的注入标记
```

**手动调试：**

```bash
node scan-chain.js cases/CASE-2026-001/ --list
node scan-chain.js cases/CASE-2026-001/ --trace FND-001
```

## scan-chain.js 完整选项参考

| 选项 | 说明 |
|------|------|
| `--list` | 列出所有节点、关系类型、状态 |
| `--trace FND-001` | 追溯 FND-001 的完整证据链（DFS） |
| `--integrity` | 完整性检查（缺失引用、孤立节点、废弃 sources 字段 + **v3: 治理 readiness — FND 链中 UNRESOLVED/DISPUTED 对象、ready 链中 draft 依赖**） |
| `--check-chains` | 推理链逻辑检查（类型匹配、循环引用、冲突关系 + **v3: HYP coverage — active 假设无证据、confirmed 假设仍有反驳**） |
| `--validate` | 节点文件结构验证（ID 格式、必填字段 + **v3: ontology_ref 检查 — EV/ENT 应绑定本体对象、object_type/lifecycle_status 合法性**） |
| `--sync` | 同步 chain_nodes 索引回 evidence_registry.json（以节点文件 frontmatter 的 `status` 为准；直接修改 registry 的 chain_nodes 状态会在下次 `--sync` 时被文件覆盖） |
| `--graph` | 输出 Mermaid 图（对话内预览） |
| `--html [file]` | 生成交互式 HTML（默认 `evidence_chain_output.html`） |
| `--json-dump [file]` | 输出 JSON 数据（7 个数据块，供 AI fallback 注入模板使用） |
