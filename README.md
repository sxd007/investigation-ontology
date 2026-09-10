# investigation-ontology 🔍

**跨平台反舞弊调查全流程插件** — 调查方法论、证据链管理、访谈分析、可视化报告、审计技术、流程分析等专业技能，支持 Claude Code、CodeBuddy、Codex 和 WorkBuddy 四大平台。

## 概述

investigation-ontology 是专为反舞弊调查人员和内部审计师设计的跨平台插件，提供从报案受理到结案归档的全流程专业支持。一次开发，四平台分发（WorkBuddy 与 CodeBuddy 同源，共用同一插件包与适配机制）。

## 安装

### CodeBuddy

```bash
# 添加市场源
codebuddy plugin marketplace add https://github.com/sxd007/investigation-ontology

# 安装（全量）
codebuddy plugin install investigation-ontology

# 安装（按配置）
codebuddy plugin install investigation-ontology --profile investigator
```


> 注意： CodeBuddy 与 WorkBuddy 均已实测通过（插件加载、hooks 运行时、手册注入全链路验证）。
>
> 在`claude code` 或 `codex`中安装本插件，可能会存在一些问题，如发现问题，请直接要求claude 或 codex 读取整个项目，并按照各自的配置要求进行调整，确保 `agents`, `hooks`, `rules`, `skills` 安装到适当的位置。

### WorkBuddy

```bash
# 添加市场源（GUI 插件页 → + 添加市场，输入 GitHub 仓库 URL；开发期也可用本地路径）
# https://github.com/sxd007/investigation-ontology
# 或本地路径：d:\path\to\investigation-ontology

# 安装：插件页选择 investigation-ontology 安装
```

WorkBuddy 与 CodeBuddy 为同一产品体系（腾讯云），共用 `.workbuddy-plugin/` / `.codebuddy-plugin/` / `.claude-plugin/` 三个候选清单目录，无需单独适配包。

**工作区激活（重要）：** 本插件采用 opt-in 工作区隔离——安装后在**调查工作区**运行 `/efio:cold-start` 完成首次配置，即自动创建 `.efio-workspace` 标记激活工具箱；未标记的工作区（面试、日常业务等）插件完全静默，不会注入调查手册或提示。

### Claude Code

```bash
# 添加市场源
claude plugin marketplace add https://github.com/sxd007/investigation-ontology

# 安装（全量）
claude plugin install investigation-ontology
```



### Codex

```bash
# 添加市场源
codex plugin marketplace add https://github.com/sxd007/investigation-ontology

# 安装
codex plugin install investigation-ontology

# 或从本地 workspace 使用
# 在 .agents/plugins/marketplace.json 中配置本地路径
```

## 安装配置

`investigation-memory` 是跨阶段的低噪音过程档案能力，在所有 profile（包括 `minimal`）中默认安装；它不参与证据认定或阶段门禁。安装不等于无条件写盘，cold-start 可将写入策略设为 `silent`、`notify`（安全默认）或 `disabled`。

| 配置 | 适用人群 | 包含模块 |
|------|---------|---------|
| `minimal` | 所有用户 | 核心命令 + 规则 + 代理 |
| `investigator` | 一线调查员 | 全流程技能（默认） |
| `auditor` | 内部审计师 | 侧重审计 + 数据分析 + 制度流程解构 |
| `analyst` | 数据分析师 | 侧重数据挖掘 + 可视化 |
| `interviewer` | 访谈专家 | 侧重访谈 + 陈述分析 |
| `full` | 全都要 | 所有技能模块 |

## 技能体系

本插件共 **24 个技能模块**，分属三大类别：**调查方法论**、**能力工具集**、**行业舞弊类别**。

### 成熟度标识

> 与 `manifests/install-modules.json` 的 `stability` 字段对齐。

| 标识 | 含义 |
|------|------|
| ✅ Stable | 功能稳定，配套完整（references / scripts / templates），可用于实际工作 |
| 🧪 Beta | 功能可用，核心逻辑经过验证，仍在迭代优化中 |
| 🚧 Alpha | 框架与核心方法已就绪，处于试用和标定阶段；配套程度可能不同，尚未达到稳定发布标准 |

### 技能全景表

| # | 技能 | 类别 | 成熟度 | 说明 | 配套 |
|---|------|------|--------|------|------|
| | | **一、调查方法论** | | | |
| 1 | `investigation-foundation` | 方法论 · 基础 | ✅ | 调查思维框架、假设检验、推理方法、认知偏差防控 | — |
| 2 | `ontology` | 方法论 · 本体论 | 🧪 | Object/Link/Action 模型、Binding Protocol、Action 治理规则 | 4 refs + 21 models |
| | | **二、能力工具集** | | | |
| 3 | `case-management` | 工具 · 案件管理 | 🧪 | 案件生命周期、质量管控、团队协作、时间线可视化 | 3 refs + 4 scripts |
| 4 | `case-retrospective` | 工具 · 案件管理 | 🧪 | 完结案件多维度复盘框架，聚焦调查员能力提升 | 1 ref |
| 5 | `fraud-classification` | 工具 · 舞弊分类与路由 | ✅ | 基于 ACFE 框架匹配线索信号、路由到对应领域技能 | 2 templates |
| 6 | `evidence-management` | 工具 · 证据管理 | ✅ | 证据收集、保全、链式保管、可采性评估、证据链可视化 v3 | 6 refs + 2 scripts + viz |
| 7 | `document-parsing` | 工具 · 证据管理 | 🧪 | 文档结构化解析 — OCR MCP 集成、格式感知路由、版本管理 | 1 ref + 1 script + 1 template |
| 8 | `interview-analysis` | 工具 · 访谈分析 | ✅ | 访谈策划、SCAN 陈述分析、行为分析、笔录评估 | 3 templates |
| 9 | `data-analysis` | 工具 · 数据分析 | 🚧 | 异常检测、趋势分析、审计轨迹、数据可视化 | — |
| 10 | `order-execution-variance-analysis` | 工具 · 数据分析 | 🧪 | 合同流/货物流/资金流多维度对比，输出差异报告 | 2 templates |
| 11 | `policy-digest` | 工具 · 制度流程分析 | 🚧 | 制度原文解构为规则、L1–L5 流程、RACI、风险控制和本体 candidates，附原文对照导览 | 6 refs + 4 schemas + 8 scripts |
| 12 | `investigation-techniques` | 工具 · 调查技术 | 🚧 | 访谈技巧、数字取证、文档审查、外勤调查、监控技术 | — |
| 13 | `investigation-memory` | 工具 · 记忆系统 | 🧪 | 非结构化信息记录、支撑复盘与定向检索 | — |
| 14 | `writing-reporting` | 工具 · 写作报告 | 🚧 | 底稿撰写、备忘录、调查报告、可视化呈现 | 1 template |
| 15 | `cold-start` | 工具 · 平台配置 | ✅ | 首次设置向导 — 团队配置、证据策略、Quick Presets | 1 ref |
| 16 | `mcp-integration` | 工具 · 平台配置 | ✅ | MCP 工具集成层 — 技能与 MCP 服务器的连接桥梁 | — |
| | | **三、行业舞弊类别** | | | |
| 17 | `fraud-channel` | 舞弊 · 渠道销售 | 🧪 | 窜货、虚报终端客户、成本造假、拼单绑单等六种模式 | 2 refs |
| 18 | `fraud-bid-rigging` | 舞弊 · 招投标 | 🚧 | 围标/串标 — 压标、陪标、轮标、市场划分等八种形态 | 无 |
| 19 | `fraud-procurement` | 舞弊 · 采购 | 🚧 | 采购全生命周期六种模式 — 虚假供应商、化整为零、参数定制等 | 无 |
| 20 | `fraud-hr` | 舞弊 · 人力资源 | 🚧 | 虚假员工、薪资操纵、招聘舞弊、履历造假等七种子场景 | 无 |
| 21 | `fraud-ip` | 舞弊 · 知识产权 | 🚧 | 商业秘密窃取、竞业违规、专利侵权三种调查类型 | 无 |
| 22 | `fraud-conflicts-of-interest` | 舞弊 · 利益冲突 | 🚧 | 采购冲突、销售冲突、裙带关系、双重角色等五种模式 | 无 |
| 23 | `fraud-reimbursement` | 舞弊 · 费用报销 | 🚧 | 虚构、篡改、重复申报、不当归类等四种模式 | 无 |
| 24 | `fraud-fake-chop` | 舞弊 · 伪造印章 | 🚧 | 实物印章调查 + 印文比对两条路径 | 2 scripts (seal_verify) |

## 命令

| 命令 | 说明 | 状态 |
|------|------|------|
| `/investigate` | 调查案件管理（立案→计划→跟踪→结案） | ✅ |
| `/evidence` | 证据管理（添加→保管链→评估→可视化） | ✅ |
| `/interview` | 访谈策划与分析（策划→问话→分析→笔录） | ✅ |
| `/report` | 文书撰写（底稿→备忘录→报告→可视化） | ✅ |
| `/analyze` | 数据分析（异常检测→趋势→关联） | ✅ |
| `/fraud-type` | 舞弊类型识别与方案推荐 | ✅ |
| `/working-paper` | 底稿管理（创建→索引→复核） | ✅ |
| `/case` | 案件总览仪表盘 | ✅ |
| `/cold-start` | 首次设置向导（团队配置→证据策略→集成检查） | ✅ |
| `/parse` | 文档结构化解析（OCR→格式路由→parsed JSON） | 🧪 |
| `/profile` | 安装配置管理（查看/切换 profile） | ✅ |
| `/mcp-config` | MCP 服务器配置向导 | ✅ |

## 代理

| 代理 | 用途 |
|------|------|
| `investigation-planner` | 调查方案设计 |
| `evidence-analyzer` | 证据评估 |
| `interview-analyzer` | 访谈陈述分析 |
| `report-writer` | 报告撰写 |
| `fraud-type-classifier` | 舞弊类型分类 |
| `data-analyzer` | 数据分析 |
| `case-manager` | 案件状态跟踪、阶段门禁检查、决策日志 |

## 项目结构

采用**市场/套件两层对称制**：仓库根只保留市场级清单与仓库级资产，全部套件内容位于 `plugins/investigation-ontology/`，与未来新增套件真正并列。

```
investigation-ontology/                  # 仓库根 = 市场根
├── .workbuddy-plugin/
│   └── marketplace.json                 # WorkBuddy 市场清单
├── .claude-plugin/
│   ├── marketplace.json                 # Claude Code 市场清单
│   └── PLUGIN_SCHEMA_NOTES.md           # Schema 踩坑记录
├── manifests/                           # 自有安装器（模块化按需安装，仓库侧）
│   ├── install-modules.json             # 模块定义（含 stability 标记）
│   └── install-components.json          # 组件定义
├── docs/                                # 开发文档
├── DEVELOPMENT_GUIDE.md  CONTRIBUTING.md  README.md  ...
└── plugins/                             # 套件层（并列，可扩展）
    └── investigation-ontology/          # 主套件
        ├── .claude-plugin/plugin.json  # Claude 插件清单
        ├── .codebuddy-plugin/plugin.json
        ├── .workbuddy-plugin/{plugin.json, hooks.json}
        ├── .codex-plugin/{plugin.json, hooks.json, mcp.json}
        ├── skills/                      # 技能定义 (24 个)
        ├── commands/                    # 斜杠命令 (12 个 + 1 约定文件)
        ├── agents/                      # 子代理定义 (7 个)
        ├── hooks/hooks.json             # 共享 hooks 表
        ├── rules/  schemas/  scripts/
        ├── config-templates/  mcp-configs/  project-templates/
        ├── manifests/install-profiles.json   # 角色画像（运行时消费，随插件分发）
        ├── AGENTS.md  VERSION
        └── docs/                        # 套件内引用文档 (2 份)
```

> 新增套件 = 在 `plugins/` 下新建子目录 + 市场清单加一条目，零结构变动（mixed-source 布局已实测验证）。

### 跨平台架构说明

| 方面 | Claude Code | CodeBuddy | Codex | WorkBuddy |
|------|-----------|-----------|-------|-----------|
| **市场清单** | `.claude-plugin/marketplace.json` | 引擎三目录通吃¹ | — | `.workbuddy-plugin/marketplace.json` |
| **插件入口** | `plugins/…/.claude-plugin/plugin.json` | `plugins/…/.codebuddy-plugin/plugin.json` | `plugins/…/.codex-plugin/plugin.json` | `plugins/…/.workbuddy-plugin/plugin.json` |
| **Hooks 文件** | `.claude-plugin/hooks.json` | `hooks/hooks.json`（官方规范位置） | `.codex-plugin/hooks.json` | `.workbuddy-plugin/hooks.json` |
| **Hooks 环境变量** | `${CLAUDE_PLUGIN_ROOT}` | `${CODEBUDDY_PLUGIN_ROOT}` | `${INVESTIGATION_ONTOLOGY_ROOT}` | `${CODEBUDDY_PLUGIN_ROOT}`（引擎统一注入²） |
| **Hook 脚本语言** | Node.js (.mjs) | Node.js (.mjs) | Shell (.sh) | Node.js (.mjs) |
| **MCP 配置** | 不使用 | 不使用 | `.codex-plugin/mcp.json` | 用户级 `~/.h3caiwork/.mcp.json` |
| **项目上下文文件** | CLAUDE.md | CODEBUDDY.md | CODEX.md | CODEBUDDY.md（原生兼容） |

> ¹ CodeBuddy 引擎按 `.codebuddy-plugin` → `.workbuddy-plugin` → `.claude-plugin` 顺序扫描市场清单，任一存在即可。
> ² WorkBuddy 引擎在 hook 子进程派生时统一注入 `CODEBUDDY_PLUGIN_ROOT` 与 `CLAUDE_PLUGIN_ROOT`（二进制实证），`run-hook.mjs` 另有 `WORKBUDDY_PLUGIN_ROOT` 防御探测与脚本路径自推兜底。

**架构原则：** 市场级清单在仓库根（每平台一份）；套件级清单在套件目录内（每平台一份）。共享的业务逻辑内容（skills/, commands/, agents/ 等）与平台适配解耦，由市场 `source` 字段统一指向。

## 持续扩展

本插件采用**核心 + 横向扩展**策略：

### 当前进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| **Phase 1** | 核心框架 + 通用技能（调查方法论、证据链、访谈分析、案件管理、报告撰写等） | ✅ 完成 |
| **Phase 2** | 各舞弊类型深度技能（按手法细分） | 🚧 进行中 |
| **Phase 3** | 特定行业调查方案（金融/医药/科技/制造） | 📋 规划中 |
| **Phase 4** | 调查辅助工具集成（MCP 服务器、外部工具对接） | 📋 规划中 |

### Phase 2 进展详情

Phase 2 的 7 个舞弊类型技能已完成 SKILL.md 方法论编写（框架就绪），但配套的参考文件、脚本和模板仍在补充中：

| 舞弊类型 | SKILL.md | 配套文件 | 状态 |
|---------|----------|---------|------|
| `fraud-channel` 渠道舞弊 | ✅ | ✅ 2 refs | 🧪 Beta |
| `fraud-bid-rigging` 投标操纵 | ✅ | ❌ | 🚧 Alpha |
| `fraud-fake-chop` 伪造印章 | ✅ | ✅ 2 scripts | 🚧 Alpha |
| `fraud-procurement` 采购舞弊 | ✅ | ❌ | 🚧 Alpha |
| `fraud-hr` 人力资源舞弊 | ✅ | ❌ | 🚧 Alpha |
| `fraud-ip` 知识产权舞弊 | ✅ | ❌ | 🚧 Alpha |
| `fraud-conflicts-of-interest` 利益冲突 | ✅ | ❌ | 🚧 Alpha |
| `fraud-reimbursement` 费用报销 | ✅ | ❌ | 🚧 Alpha |

### 近期重点优化

- **证据链可视化 v3** — 推理链图、假设验证、治理状态多视图 (`scan-chain.js` 1438 行)
- **案件时间线可视化** — 结构化基线 + AI 增量补充，生成 HTML 时间线 (`generate_timeline*.py`)
- **文档结构化解析** — OCR MCP 集成、格式感知路由、版本管理 (`/parse` 命令)
- **企业制度流程解构** — 原文锚定、L1–L5 流程、RACI、风险控制、本体 candidates 与离线审阅导览 (`policy-digest`)
- **调查本体论** — Object/Link/Action 模型、Binding Protocol、Action 治理规则
- **首次设置向导** — Quick Presets 快速预设、配置持久化、断点续传
- **OCR 后端解耦** — 独立配置系统，支持 4 种投递方式（auto/http/shared_fs/custom）
- **品牌重塑** — 统一 `efio` 命令名，CodeBuddy/Codex 双平台支持
- **WorkBuddy 适配** — `.workbuddy-plugin/` 适配器（市场+插件双级清单）、对称制套件布局（`plugins/`）、工作区 opt-in 隔离（`.efio-workspace` 标记）、cold-start Phase 0 自动标记

## 作者

**Alpha Shen** — 反舞弊调查从业者

- GitHub: [sxd007](https://github.com/sxd007)
- 项目主页: [github.com/sxd007/investigation-ontology](https://github.com/sxd007/investigation-ontology)

本项目由作者独立开发维护。如有问题、建议或合作意向，欢迎通过 GitHub Issues 联系。

## ⚠️ 重要免责声明

**本插件为反舞弊调查方法论知识工具集，不构成法律意见或专业调查建议。**

- **本插件是辅助性工具，不是替代性决策系统**。AI 帮助探索、分析和批判，但所有输出均受调查员的风格、经验和提问方向的影响。调查员应始终保持独立审慎的态度，仔细评估 AI 输出，做出独立决策
- AI 生成的内容可能存在幻觉、偏见或过时信息，使用者有义务独立验证任何结论
- 连接器（MCP）仅作为能力目录列出，用户自行配置并对其使用行为**承担全部法律责任**
- 严禁将本插件用于非法监控、未经授权的数据采集、歧视性筛选或任何违反适用法律的活动
- 使用前请务必阅读完整的 [DISCLAIMER.md](DISCLAIMER.md)（免责声明与使用条款）和 [rules/investigation-ethics.md](rules/investigation-ethics.md)（AI 辅助调查道德准则）

**任何不经过独立思考和专业判断、完全依赖 AI 生成结果而导致的误判、漏判或错误决策，本插件及其作者概不负责。下载或使用本项目的任何部分，即表示您已阅读、理解并同意受免责声明约束。**

---

## License

Copyright 2026 Alpha Shen

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See the [LICENSE](LICENSE) file for details.
