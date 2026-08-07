# investigation-ontology 开发指南

本文档是 `cc-investigation-ontology` 插件的**唯一开发方法论权威来源**。所有开发规范、架构原则、编写标准、操作流程均在此定义。

**跨平台说明：** 本指南适用于所有三个平台（Claude Code、CodeBuddy、Codex）。各平台的特定配置差异（hooks 位置、环境变量、入口文件等）见对应的平台文件：`CLAUDE.md` / `CODEBUDDY.md` / `CODEX.md`。跨平台架构细节见 [`docs/ARCHITECTURE_NOTES.md`](docs/ARCHITECTURE_NOTES.md)。

> **⚠️ 开发前必读：** 修改平台配置（hooks、plugin.json、MCP）前，**务必查阅对应平台的官方文档**，不要凭推测修改。各平台规范有差异，错误配置会导致 hooks 静默失效。
>
> | 平台 | 官方文档 | 关键参考 |
> |------|---------|---------|
> | **CodeBuddy** | [插件开发指南](https://www.codebuddy.cn/docs/zh/cli/plugins) · [插件参考文档](https://www.codebuddy.cn/docs/cli/plugins-reference) · [Hook 参考指南](https://www.codebuddy.cn/docs/zh/cli/hooks) · [工具参考](https://www.codebuddy.cn/docs/cli/tools-reference) | hooks 必须在 `hooks/hooks.json`（插件根目录）；只有 `plugin.json` 在 `.codebuddy-plugin/` 内；matcher 用规范工具名 `Write\|Edit\|MultiEdit`；Windows 强制 Git Bash 执行 |
> | **Claude Code** | [Claude Code 文档](https://docs.anthropic.com/en/docs/claude-code) | `.claude-plugin/` 为元数据目录 |
> | **Codex** | [Codex 文档](https://github.com/openai/codex) | `.codex-plugin/` 为元数据目录 |

> **CodeBuddy matcher 兼容要求：** 官方 Hook 标识符是 `Write`、`Edit`、`MultiEdit`，必须保留。为兼容部分 IDE/代理集成暴露的下划线工具名，`PreToolUse` / `PostToolUse` 同时覆盖 `write_to_file`、`replace_in_file`、`multi_replace_string_in_file`；写后 matcher 另兼容 `delete_file`。matcher 按实际 `tool_name` 匹配。

***

## 一、项目架构三分法

investigation-ontology 的所有内容分为三大类。**每新增一个文件、每修改一个模块，先判定它属于哪一类**，然后遵循该类别的设计原则。

| 类别                          | 范围                       | 核心原则                     | 代表文件                                                                                                                  |
| --------------------------- | ------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **工作流 (Workflow)**          | 阶段框架、数据模型、通用方法论          | 通用、稳定、可验证、不绑定领域          | `case-management`, `evidence-management`, `investigation-foundation`                                                  |
| **工具赋能 (Tooling)**          | 数据分析、MCP 集成、SQL 脚本、可视化工具 | 弹性、可扩展、有 fallback、无强依赖   | `data-analysis`, `mcp-integration`, `interview-analysis`, `order-execution-variance-analysis`, `fraud-classification` |
| **场景经验 (Domain Knowledge)** | 具体舞弊场景的调查知识              | 有方法论高度且能落地、信号 + 切入点具体可操作 | `fraud-channel`,`fraud-conflicts-of-interest`,`fraud-hr`                                                                                                       |

### 分类决策原则

**工作流类：**
- 不在工作流中写任何领域特定内容（不出现"窜货""终端客户"等词）
- 数据结构必须用 JSON Schema 精确定义，字段约束计算机可验证
- 工作流框架要能适应任意调查场景（渠道/采购/医疗/金融等）

**工具赋能类：**
- 每项工具/方法必须说明"可用时"和"不可用时"两种路径
- 不写具体工具名称，写能力类型（"数据库查询类 MCP"而非"investigation-db"）
- 为用户提供二次开发入口——自定义脚本的接入方式

**场景经验类：**
- 不是简单的"行业知识堆砌"——要有分类框架（高度），也要有具体信号和切入点（落地）
- 不侵入工作流——场景内容不修改 `meta.json` 的 schema、不修改阶段定义
- 场景特有的 SQL 脚本、模板作为 scripts、 references 保留，不写入 skill 主流程

### 一个文件只归属一个类别

混合类别是架构腐化的信号。如果一个文件同时包含工作流定义和场景知识，说明抽象层级不对——拆开。

***

## 二、插件系统底层机制

### 2.1 Flat Skill Scanning

Claude Code 通过 `plugin.json` 中的 `"skills": ["./skills/"]` 声明技能根目录，并对 `skills/*/SKILL.md` 进行**单层 glob 扫描**——只匹配深度为 1 的 SKILL.md，不支持嵌套层级。CodeBuddy 的语义不同：缺省 `skills` 字段时自动发现 `skills/<name>/SKILL.md`；声明该字段会替换默认发现，且每一项被视为一个技能路径。因此当前 `.codebuddy-plugin/plugin.json` 不声明 `skills`。

这对项目的影响：
- ❌ `skills/fraud-classification/channel-fraud/SKILL.md` **不会被加载**（深度 > 1）
- ✅ `skills/fraud-channel/SKILL.md` **会被加载**（深度 = 1）
- 所有 skill 在 system prompt 中平级加载，无父子层级概念
- 通过命名前缀（如 `fraud-*`）和 SKILL.md 中的 Related 引用建立逻辑分组

### 2.2 Auto-Discovery 机制

| 目录          | 发现方式                        | 声明位置                                      |
| ----------- | --------------------------- | ----------------------------------------- |
| `skills/`   | Claude：单层 glob；CodeBuddy：字段缺省时默认发现 | Claude 在 `plugin.json` 声明根目录；CodeBuddy 不声明 `skills` |
| `agents/`   | 自动发现，无需声明                   | —                                         |
| `commands/` | 自动发现 `commands/*.md`        | —                                         |
| `hooks/`    | 自动发现 `hooks/hooks.json`     | —                                         |
| MCP         | `.mcp.json` 自动加载            | 根目录 `.mcp.json` 或 `~/.claude.json`        |

### 2.3 Loose Coupling: Skills ↔ MCPs

MCP 和 skill 遵循松耦合模型——

```
技能（SKILL.md）: 描述分析需求
    （如"检测笔录中是否存在模糊限制语模式"）
        │
        │  模型同时看到
        │  ├── 技能指令（要做什么分析）
        │  └── 可用 MCP 工具列表（环境能力）
        │
        ▼
模型：自行判断是否调用 MCP 来辅助完成分析
    （检测到有语言分析工具可用 → 调用；不可用 → 直接分析）
```

四条原则：
1. **MCP 是环境能力，不是技能依赖** — 技能不得假设任何一个 MCP 存在
2. **技能写"需要什么分析"，不写"调用哪个工具"** — 由模型根据可用工具自行匹配
3. **任何 MCP 辅助步骤必须有 fallback** — 不可用时不影响工作流执行
4. **MCP 具体名称和工具名不写入 skill 文本** — 仅写类型描述

#### 2.3.1 MCP 返回数据的持久化

MCP 查询返回的数据与文档类证据一样，属于电子证据。持久化要求：

- **原始快照**：MCP 返回的 JSON 数据应存为 `raw/EV-NNN_<source>_raw.json`，含 `snapshot_id`、`source`（mcp_server/tool/query_params）、`fetched_at`、SHA-256 哈希
- **不可跳过**：不允许仅将 MCP 数据留在 AI 上下文窗口中分析后丢弃——必须落盘，支撑审计和复现
- **data-analysis 技能**：在"数据驱动"模式下应在分析前执行持久化步骤
- **与文档证据的对等性**：MCP 数据走 raw → analysis → EV 三层，与文档类证据的文件管线对齐

详细设计见 `docs/development-reports/2026-07-23-mcp-data-persistence-gap.md`。

### 2.4 Skill = Domain Knowledge, Not Executable Application

Skill 不是应用程序。一个 SKILL.md 描述该领域的分析思路、判断标准、方法论和分类框架，而不是：
- ❌ 定义状态机转换和门禁 DSL
- ❌ 编写分步执行的工作流脚本
- ❌ 指定调用哪个工具、哪个 API
- ❌ 嵌入 agent 行为约束（这些归 `agents/` 目录管理）

### 2.5 Data Schema 定义模式

数据结构采用 **JSON Schema + 文档目录页** 的双文件模式：

```
schemas/meta.schema.json              ← JSON Schema：精确定义字段约束
schemas/checklist.schema.json
schemas/evidence-registry.schema.json
docs/case-data-model.md               ← Markdown：回答"要创建哪些文件、顺序如何"
skills/case-management/SKILL.md       ← 各 skill 维护自己的字段说明章节
skills/evidence-management/SKILL.md
```

**修改数据模型时必须同步**：schema JSON → case-data-model.md → 相关 skill 的字段说明章节。

***

## 三、目录结构

```
investigation-ontology/
├── DEVELOPMENT_GUIDE.md            ← 本文件（唯一开发方法论）
├── CONTRIBUTING.md                 ← 外部贡献者工作流
├── README.md                       ← 面向用户的介绍和安装说明
├── .claude-plugin/
│   ├── plugin.json                 ← 插件清单（skills/commands 声明入口）
│   ├── marketplace.json            ← 市场元信息
│   └── PLUGIN_SCHEMA_NOTES.md      ← Schema 踩坑记录
│
├── skills/                         ← 领域技能（glob 扫描 skills/*/SKILL.md）
│   │  # 工作流类
│   ├── investigation-foundation/
│   ├── case-management/
│   ├── evidence-management/
│   ├── case-retrospective/
│   │  # 工具赋能类
│   ├── data-analysis/
│   ├── mcp-integration/
│   ├── investigation-techniques/
│   ├── writing-reporting/
│   ├── investigation-memory/
│   ├── order-execution-variance-analysis/
│   ├── interview-analysis/
│   ├── fraud-classification/
│   │  # 场景经验类
│   ├── fraud-channel/
│   ├── fraud-reimbursement/
│   ├── fraud-procurement/
│   ├── fraud-bid-rigging/
│   ├── fraud-ip/
│   ├── fraud-hr/
│   ├── fraud-fake-chop/
│   ├── fraud-conflicts-of-interest/
│   │  # 底层机制
│   ├── cold-start/
│
├── agents/                         ← 子代理定义（自动发现）
├── commands/                       ← 斜杠命令（自动发现）
├── rules/                          ← 调查准则与规范
├── hooks/                          ← CodeBuddy hooks（hooks/hooks.json，官方规范位置）
├── .codebuddy-plugin/              ← CodeBuddy 元数据（只有 plugin.json）
├── .claude-plugin/                 ← Claude Code 元数据 + hooks
├── .codex-plugin/                  ← Codex 元数据 + hooks
├── schemas/                        ← 案件数据模型 JSON Schema
├── docs/                           ← 跨技能索引文档 + 开发报告
├── manifests/                      ← 安装模块化体系
├── mcp-configs/                    ← MCP 推荐配置
├── config-templates/               ← 配置模板
└── project-templates/              ← 项目脚手架模板
```

***

## 四、开发操作指南

### 4.0 跨平台维护检查清单

本插件支持三个平台（Claude Code、CodeBuddy、Codex）。开发时需注意平台差异：

**平台特定文件（不共享）：**
- `.claude-plugin/plugin.json` — Claude Code 入口
- `.codebuddy-plugin/plugin.json` — CodeBuddy 入口  
- `.codex-plugin/plugin.json` — Codex 入口
- `hooks/hooks.json` — CodeBuddy hooks（环境变量：`${CODEBUDDY_PLUGIN_ROOT}`，[官方规范](https://www.codebuddy.cn/docs/zh/cli/plugins)：hooks 必须在插件根目录 `hooks/` 下）
- `.claude-plugin/hooks.json` — Claude Code hooks（环境变量：`${CLAUDE_PLUGIN_ROOT}`）
- `.codex-plugin/hooks.json` — Codex hooks（环境变量：`${INVESTIGATION_ONTOLOGY_ROOT}`）
- `.mcp.json` — Codex MCP 配置（根目录）
- `project-templates/default/.mcp.json` — 用户项目模板副本（分发用）

> **⚠️ CodeBuddy hooks 位置**：官方文档明确要求 hooks 文件放在插件根目录的 `hooks/hooks.json`，**不能**放在 `.codebuddy-plugin/` 目录内。`.codebuddy-plugin/` 只能放 `plugin.json`。详见 [插件开发指南](https://www.codebuddy.cn/docs/zh/cli/plugins)。
>
> **⚠️ Claude Code / Codex hooks 指针（2026-08-07 已修复）**：两个平台的 `plugin.json` 曾声明 `"hooks": "./hooks.json"`，指向插件根不存在的文件（实际 hooks 分别在 `.claude-plugin/hooks.json` 和 `.codex-plugin/hooks.json`）。已改为 `"./.claude-plugin/hooks.json"` 和 `"./.codex-plugin/hooks.json"`。历史分析见 `docs/development-reports/2026-07-22-codex-plugin-compliance-report.md`。

**修改这些文件时的同步检查：**
- 修改 hooks 业务逻辑 → 同步更新 Node.js 版本（`scripts/run-hook.mjs`）和 Shell 版本（`scripts/*.sh`）
- 添加 MCP 服务器 → 同步更新根目录 `.mcp.json` **和** `project-templates/default/.mcp.json`
- 新增 plugin.json 字段 → 确认各平台 plugin.json 的字段兼容性（详见 [`docs/ARCHITECTURE_NOTES.md`](docs/ARCHITECTURE_NOTES.md)）

**共享内容（所有平台）：**
- `skills/` `commands/` `agents/` `rules/` `docs/` 等业务逻辑内容
- `manifests/install-modules.json` 中各模块的 `targets` 字段应包含三平台变种

详细的跨平台架构设计和维护指南，见 [`docs/ARCHITECTURE_NOTES.md`](docs/ARCHITECTURE_NOTES.md)。

### 4.1 常规开发流程

1. **分类先行**：新内容先判定属于三类中的哪一类，决定放在哪个目录、用什么格式
2. **编辑**：skills/commands/agents 在各自目录中编辑
3. **数据模型变更**：同步更新 `schemas/*.json` + 对应 skill 的章节 + `docs/case-data-model.md`
4. **更新 manifests**：新增/移除模块时更新 `manifests/install-modules.json`
5. **验证**：各平台验证方式见对应平台文件
6. **本地测试**：安装测试见对应平台文件
7. **推送**：Push to git for distribution

### 4.2 新增一个 Skill（含场景技能 6 文件同步）

新增一个 `fraud-<domain>` 场景技能时，必须依次修改以下文件：

| # | 文件 | 操作 |
|---|------|------|
| 1 | `skills/fraud-xxx/SKILL.md` | 创建技能文件，按 ACFE 分类编写 |
| 2 | `manifests/install-modules.json` | 添加模块条目（id、paths、dependencies），`targets` 包含所有平台变种 |
| 3 | `manifests/install-profiles.json` | 加入 `investigator` 和 `full` 两套 profile |
| 4 | `skills/fraud-classification/SKILL.md` | 在"专题舞弊类型索引"表追加一行 |
| 5 | `agents/investigation-planner.md` | 在 Related 技能段追加引用 |
| 6 | `agents/fraud-type-classifier.md` | 在 Cross-Reference 段和 Related 段追加引用 |
| 7 | `project-templates/default/INVESTIGATION-HANDBOOK.md` | 技能表同步更新 |

**模块注册模板（install-modules.json）：**
```json
{
  "id": "fraud-xxx",
  "kind": "skills",
  "description": "一句话描述",
  "paths": ["skills/fraud-xxx"],
  "targets": ["claude", "codebuddy", "codex", "claude-project", "codebuddy-project", "codex-project"],
  "dependencies": ["investigation-foundation", "fraud-classification"],
  "defaultInstall": false,
  "cost": "medium",
  "stability": "alpha"
}
```

**字段说明：**
- `id`：全局唯一，与目录名一致
- `targets`：必须包含所有三平台的变种
- `dependencies`：运行时依赖的其他模块
- `defaultInstall`：初始 alpha 阶段设为 `false`，稳定后改为 `true`
- `cost`：对 AI 上下文的消耗，可选 `light`/`medium`/`heavy`
- `stability`：`alpha`（试用）→ `beta`（可用）→ `stable`（稳定）

**场景技能目录结构：**
```
skills/fraud-<domain>/
├── SKILL.md               # 技能定义（必需）
├── references/            # 通用参考资源
│   ├── policy_index.md    # 制度索引模板
│   ├── red_flags.md       # 预警信号清单
│   └── interview_questions.md  # 访谈问题库
├── scripts/               # 普遍适用性脚本
│   ├── detect_xxx.sql
│   └── analyze_xxx.py
├── templates/             # 可视化交付物模板
│   ├── flow_diagram.md
│   ├── report_diagram.md
│   └── dashboard.md
└── assets/                # 静态资源
```

`references/`、`scripts/`、`templates/` 必须是**不绑定单一企业的通用内容**。

**成熟度分级：**
| 成熟度 | 标准 |
|--------|------|
| **α (alpha)** | SKILL.md 框架 + 核心信号清单完整 |
| **β (beta)** | 含 reference 文件 + 至少 1 个可用脚本 |
| **GA (stable)** | references/ + scripts/ + templates/ 三件套完整，已在真实案件验证 |

### 4.3 新增一个 Command

1. 在 `commands/` 下创建 `*.md` 文件
2. frontmatter 包含 `description`
3. 命令文件写清楚：Usage、Process、References
4. Command 自动发现，无需在 plugin.json 中额外声明

### 4.4 新增一个 Agent

1. 在 `agents/` 下创建 `*.md` 文件
2. frontmatter 包含 `name`、`description`
3. 使用 `Role` / `Tools` / `Process` 三段式结构
4. Agent 自动发现，无需额外声明

### 4.5 修改数据模型

1. 修改 `schemas/<model>.schema.json`（字段约束、类型、必填）
2. 同步更新 `docs/case-data-model.md`（创建顺序、文件关系）
3. 同步更新相关 skill 中的字段说明章节
4. 如在售前版本已有用户使用数据，考虑向后兼容

### 4.6 Commit 规范

- 推荐格式：`<type>(<scope>): <description>`
  - `feat(fraud-healthcare): 新增医疗行业舞弊调查技能`
  - `fix(evidence-management): 修复证据分类枚举缺失项`
  - `docs(README): 更新安装说明`
  - `schema(meta): 新增 phase_started_at 字段`
  - `refactor(hooks): 提取通用 hook 逻辑`
- 一个 commit 聚焦一个变更

***

## 五、编写规范

### 5.1 MCP References in Skills

所有 MCP 相关章节必须遵循 **类型化 + 条件式 + fallback** 格式：

```markdown
### [能力类型]类 MCP（如配置）

- **能力：** [一句话描述能力]
- **辅助场景：** [具体分析场景]
- **不可用时：** [替代方法，由模型直接完成]
```

### 5.2 Phase/Stage Descriptions in Workflow Skills

阶段定义使用 **输入/输出/门禁** 三元组格式：

```markdown
### [阶段名称]阶段

**目标**：[一句话]
**输入**：[消费哪些产物]
**输出**：[生成哪些产物]
**质量门禁**：[门禁条件列表]
```

### 5.3 文件命名规范

- 全小写 + 连字符（如 `evidence-management/SKILL.md`）
- 专题舞弊 skill 命名：`fraud-<topic>`（如 `fraud-channel`）
- 舞弊分类 skill 命名：`fraud-<capability>`（如 `fraud-classification`）
- 命令文件：功能明确的动词式命名（如 `investigate.md`、`evidence.md`）
- 代理文件：角色式命名（如 `evidence-analyzer.md`）

### 5.4 Skill/Command/Agent 格式要求

| 文件类型    | 必需 frontmatter                  | 正文建议结构                       |
| ------- | ------------------------------- | ---------------------------- |
| Skill   | `name`, `description`, `origin` | 领域内容按分类原则组织                  |
| Command | `description`                   | Usage / Process / References |
| Agent   | `name`, `description`           | Role / Tools / Process       |

**Description 编写质量要求：**

- **必须包含触发条件**：不只说"是什么"，还要说"什么时候用"。避免"全景""目录""系统"等纯参考型表述
- **行动导向开头**：优先用动词或场景描述开头（如"当需要对交易数据做异常检测时"），而非"XX方法论与分类框架"
- **目标 50-80 字**：过短缺乏触发信号，过长增加加载成本。必须覆盖"做什么 + 何时用"两个要素
- **避免元描述**：不写"所有调查技能的认知基础"这类描述自身定位的句子——写入正文引导模型何时加载，而非描述自身
- **消除重叠竞争**：两个 skill 的 description 不应产生触发歧义（如"数据分析"不可同时作为 investigation-techniques 和 data-analysis 的核心触发词）

详见 `docs/development-reports/2026-07-23-skill-description-audit.md`。

### 5.5 决策树编写（可选策略）

对于涉及多层判断的 skill，可选择引入决策树（ASCII 树形分支图）。不强制，适用于那些"看似凭经验、实际有规律"的判断场景。

**规范：** 2-3 层深度，留一个兜底分支（"其他情况"、"无法判断"）。

### 5.6 中英文与语言风格

- 技能正文使用中文（面向国内调查员）
- 关键术语首次出现时附英文对照
- 代码注释、schema 字段名、commit message 使用英文
- 避免模糊表述，优先使用具体的数据和条件

### 5.7 跨文件引用

- 使用相对路径（相对于仓库根目录）
- 不要使用绝对路径或外部 URL 引用仓库内的文件
- 修改文件后需确认引用目标仍然存在、路径正确

***

## 六、配置消费开发规范

### 6.1 配置生命周期

```
模板 (config-templates/team-profile.md)          ← 发版维护
  │ cold-start 读取
  ▼
用户配置 ({配置路径}/)  ← 持久化，升级不覆盖
  │ 各 skill 前置检查
  ▼
行为调整（约束/参数化）
```

### 6.2 Skill 消费配置的签约规则

每个需要读取配置的 skill 必须：
1. 参照 config-loader.md 的标准加载流程
2. 检测 team-profile.md 状态（不存在/PAUSED/PLACEHOLDER/READY）
3. 在 READY 状态下读取对应的配置字段
4. 根据字段值调整 skill 行为

### 6.3 配置状态一览

| 状态               | 判断条件                      | 对 skill 的影响                    |
| ---------------- | ------------------------- | ------------------------------ |
| DOES_NOT_EXIST | 文件不存在                     | 停止操作，提示运行 cold-start |
| PAUSED           | 含 `<!-- SETUP PAUSED AT:` | 停止操作，提示 resume                 |
| HAS_PLACEHOLDER | 含 `[PLACEHOLDER]`         | 停止操作，提示 complete               |
| READY            | 以上皆否                      | 正常读取配置，按值调整行为                  |

### 6.4 升级场景保护

- 模板新增字段 → cold-start 模板合并机制检测差异，引导用户补充
- 现有字段值有效 → 不动，保留用户配置值
- 删除了字段 → 用户配置中保留，不主动删除（静默遗留）

***

## 七、验证与测试

详见各平台文件的验证章节。通用原则：
- 修改代码后运行对应平台的验证脚本
- 修改本体引用后运行 `check-ontology-ref.sh` 或 `validate-ontology-action.ps1`
- 修改插件结构后运行 `validate-pack.ps1` 或 `validate-pack.sh`

***

## 八、后续规划

已分析但尚未实施的候选功能，供后续开发者参考。

### 8.1 定时代理（Scheduled Agents）

利用 Claude Code 的 CronCreate 工具实现定时触发的自动检查任务。

**拟增加的代理：**
| 代理                   | 职责                | 建议频率 |
| -------------------- | ----------------- | ---- |
| deadline-watcher     | 检查各案件在阶段停留时间是否超期  | 每日 |
| evidence-gap-monitor | 扫描证据注册表有无停滞未推进的条目 | 每周 |

**实现时机建议：** 调查系统在真实场景中使用 1-2 个完整案件周期后。

### 8.2 事件驱动自动化（Event-Driven Triggers）

调查过程中录入实体、推进阶段等事件发生时自动触发后续操作。状态：设计待定。

***

## 九、当前模块清单

所有注册模块见 `manifests/install-modules.json`（权威数据源）。以下为概览：

| 模块 | 成本 | 稳定性 |
|------|------|--------|
| rules-core, agents-core, commands-core, platform-configs | light | stable |
| investigation-foundation, fraud-classification, evidence-management, writing-reporting, interview-analysis, data-analysis, investigation-techniques | medium~heavy | stable |
| case-management, mcp-integration, cold-start | light~medium | stable |
| fraud-channel | heavy | beta |
| fraud-reimbursement, fraud-procurement, fraud-bid-rigging, fraud-ip, fraud-hr, fraud-fake-chop, fraud-conflicts-of-interest | medium | alpha |
| order-execution-variance-analysis, investigation-memory, case-retrospective | light~medium | beta |

***

## 十、AI 编码行为准则（Karpathy Guidelines）

> 来源：[andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) — 基于 Andrej Karpathy 对 LLM 编码问题的观察。

在所有 AI 辅助开发中遵循以下准则：

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans: remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

***

## 关键文件索引

| 文件 | 用途 |
|------|------|
| `DEVELOPMENT_GUIDE.md`（本文件） | 唯一开发方法论权威来源 |
| `CONTRIBUTING.md` | 外部贡献者工作流（分支策略、PR 模板、伦理许可） |
| `docs/ARCHITECTURE_NOTES.md` | 跨平台架构细节 |
| `manifests/install-modules.json` | 模块注册表（权威数据源） |
| `manifests/install-profiles.json` | 安装配置集 |
| `project-templates/default/INVESTIGATION-HANDBOOK.md` | 用户指南（分发物） |

> 各平台的开发注意事项（CLAUDE.md / CODEBUDDY.md / CODEX.md）位于工作区根目录，不在本仓库内。
