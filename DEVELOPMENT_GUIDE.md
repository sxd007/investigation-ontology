# investigation-ontology 开发指南

本文档面向希望理解、修改或扩展 investigation-ontology 跨平台插件的开发者。内容涵盖架构哲学、系统机制、目录规范和开发流程。

**跨平台说明：** 本指南适用于所有三个平台（Claude Code、CodeBuddy、Codex）。关于平台特定的差异（hooks 配置、MCP 设置、环境变量等），详见 [`docs/ARCHITECTURE_NOTES.md`](docs/ARCHITECTURE_NOTES.md)。

> **⚠️ 开发前必读：** 修改平台配置（hooks、plugin.json、MCP）前，**务必查阅对应平台的官方文档**，不要凭推测修改。各平台规范有差异，错误配置会导致 hooks 静默失效。
>
> | 平台 | 官方文档 | 关键参考 |
> |------|---------|---------|
> | **CodeBuddy** | [插件开发指南](https://www.codebuddy.cn/docs/zh/cli/plugins) · [插件参考文档](https://www.codebuddy.cn/docs/cli/plugins-reference) · [Hook 参考指南](https://www.codebuddy.cn/docs/zh/cli/hooks) · [工具参考](https://www.codebuddy.cn/docs/cli/tools-reference) | hooks 必须在 `hooks/hooks.json`（插件根目录）；只有 `plugin.json` 在 `.codebuddy-plugin/` 内；matcher 用规范工具名 `Write\|Edit\|MultiEdit`；Windows 强制 Git Bash 执行 |
> | **Claude Code** | [Claude Code 文档](https://docs.anthropic.com/en/docs/claude-code) | `.claude-plugin/` 为元数据目录 |
> | **Codex** | [Codex 文档](https://github.com/openai/codex) | `.codex-plugin/` 为元数据目录 |

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

插件通过 `plugin.json` 中的 `"skills": ["./skills/"]` 声明技能目录。Claude Code 对 `skills/*/SKILL.md` 进行**单层 glob 扫描**——只匹配深度为 1 的 SKILL.md，不支持嵌套层级。

这对项目的影响：

- ❌ `skills/fraud-classification/channel-fraud/SKILL.md` **不会被加载**（深度 > 1）
- ✅ `skills/fraud-channel/SKILL.md` **会被加载**（深度 = 1）
- 所有 skill 在 system prompt 中平级加载，无父子层级概念
- 通过命名前缀（如 `fraud-*`）和 SKILL.md 中的 Related 引用建立逻辑分组

### 2.2 Auto-Discovery 机制

| 目录          | 发现方式                        | 声明位置                                      |
| ----------- | --------------------------- | ----------------------------------------- |
| `skills/`   | glob 扫描 `skills/*/SKILL.md` | `plugin.json` → `"skills": ["./skills/"]` |
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
├── CLAUDE.md                       ← 插件级用户指南（对安装了插件的用户）
├── DEVELOPMENT_GUIDE.md            ← 本文件（插件开发指南）
├── README.md                       ← 面向用户的介绍和安装说明
├── .claude-plugin/
│   ├── plugin.json                 ← 插件清单（skills/commands 声明入口）
│   ├── marketplace.json            ← 市场元信息
│   └── PLUGIN_SCHEMA_NOTES.md      ← Schema 踩坑记录
│
├── skills/                         ← 领域技能（glob 扫描 skills/*/SKILL.md）
│   │
│   │  # 工作流类
│   ├── investigation-foundation/   ← 工作流类
│   ├── case-management/            ← 工作流类
│   ├── evidence-management/        ← 工作流类
│   ├── case-retrospective/         ← 工作流类
│   │
│   │  # 工具赋能类
│   ├── data-analysis/              ← 工具赋能类
│   ├── mcp-integration/            ← 工具赋能类
│   ├── investigation-techniques/   ← 工具赋能类
│   ├── writing-reporting/          ← 工具赋能类
│   ├── investigation-memory/       ← 工具赋能类
│   ├── order-execution-variance-analysis/ ← 工具赋能类
│   ├── interview-analysis/         ← 工具赋能类
│   ├── fraud-classification/       ← 工具赋能类
│   │
│   │  # 场景经验类
│   ├── fraud-channel/              ← 场景经验类
│   ├── fraud-reimbursement/        ← 场景经验类
│   ├── fraud-procurement/          ← 场景经验类
│   ├── fraud-bid-rigging/          ← 场景经验类
│   ├── fraud-ip/                   ← 场景经验类
│   ├── fraud-hr/                   ← 场景经验类
│   ├── fraud-fake-chop/            ← 场景经验类
│   ├── fraud-conflicts-of-interest/ ← 场景经验类
│   │
│   │  # 底层机制（配置初始化，不属于三类）
│   ├── cold-start/       ← 底层机制
│
├── agents/                         ← 子代理定义（自动发现）
├── commands/                       ← 斜杠命令（自动发现）
├── rules/                          ← 调查准则与规范
├── hooks/                          ← CodeBuddy hooks（hooks/hooks.json，官方规范位置）
├── .codebuddy-plugin/              ← CodeBuddy 元数据（只有 plugin.json）
├── .claude-plugin/                 ← Claude Code 元数据 + hooks
├── .codex-plugin/                  ← Codex 元数据 + hooks
├── schemas/                        ← 案件数据模型 JSON Schema
├── docs/                           ← 跨技能索引文档
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
5. **验证**：运行 `claude plugin validate .claude-plugin/plugin.json`
6. **本地测试**：`claude plugin marketplace add . && claude plugin install investigation-ontology@investigation-ontology --profile <profile>`
7. **推送**：Push to git for distribution

### 4.2 新增一个 Skill 的步骤

1. 在 `skills/` 下创建 `fraud-<topic>/` 目录（单层，深度为 1）
2. 创建 `SKILL.md`，包含 `name`、`description`、`origin` frontmatter
3. 根据内容类别（工作流/工具赋能/场景经验）遵循对应编写规范
4. MCP 相关章节使用类型化 + 条件式 + fallback 格式
5. 阶段定义使用输入/输出/门禁三元组格式
6. 在三个平台的开发指南中添加新条目：`CLAUDE.md` / `CODEBUDDY.md` / `CODEX.md`（如适用）
7. （如适用）在 `manifests/install-modules.json` 中添加为新模块，并确保 `targets` 包含所有支持的平台
8. 验证并本地测试

### 4.3 新增一个 Command 的步骤

1. 在 `commands/` 下创建 `*.md` 文件
2. 包含 `description` frontmatter
3. 命令文件应写清楚：Usage、Process、References
4. Command 自动发现，无需在 plugin.json 中额外声明

### 4.4 新增一个 Agent 的步骤

1. 在 `agents/` 下创建 `*.md` 文件
2. 包含 `name`、`description` frontmatter
3. 使用 `Role` / `Tools` / `Process` 三段式结构
4. Agent 自动发现，无需额外声明

### 4.5 修改数据模型

1. 修改 `schemas/<model>.schema.json`（字段约束、类型、必填）
2. 同步更新 `docs/case-data-model.md`（创建顺序、文件关系）
3. 同步更新相关 skill 中的字段说明章节
4. 如在售前版本已有用户使用数据，考虑向后兼容

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

### 5.5 决策树编写（可选策略）

对于涉及多层判断的 skill，可选择引入决策树（ASCII 树形分支图）来结构化推理路径。决策树不是强制规范——它适用于那些"看似凭经验、实际有规律"的判断场景。

**何时考虑使用：**

- skill 中存在"如果 A 那么 B，如果 C 那么 D"的判断链
- AI 在不同案件中对同一问题给出不一致的处理（提示需要结构化）
- 新用户需要引导才能理解调查中的常见分支场景

**推荐结构（2-3 层，留兜底）：**

```
收到线索后，线索来源是？
├── 匿名举报
│   ├── 有具体事实（时间/地点/人物/金额） → 按流程立案评估
│   └── 笼统指控（无具体事实）
│       ├── 有可查证的客观信号 → 从信号切入立案
│       └── 完全无法查证 → 存档待观察，不予立案
├── 内部系统预警
│   ├── 有明确违规指标 → 直接进入立案
│   └── 指标阈值附近（灰区） → 人工复核后决定
├── 上级交办 / 审计发现
│   └── 有明确调查范围 → 直接立案
└── 其他来源 → 按具体情形判断，必要时咨询 case-manager
```

**编写原则：**

- 每棵树留一个兜底分支（"其他情况"、"无法判断"）
- 分支深度推荐 2-3 层，过深则考虑拆成多棵树
- 树的根节点应该是 Skill 中最常见的判断起点
- 不追求覆盖 100% 的真实情况——覆盖 80% 的常见路径 + 留兜底即可
- 同一 skill 中已有明确的流程步骤（step-by-step）的，不需要再加决策树

**已知示例：**

- `skills/investigation-techniques/SKILL.md` 中的"工具选型决策树"（轻量级，1层）
- 更深层的应用场景：舞弊分类（ACFE 树形匹配）、证据可采性判断、访谈策略选择

**不适用场景：**

- 纯粹的执行步骤（第 1 步→第 2 步→第 3 步）——用 Process 章节即可
- 事实列举（列出 5 种可能性，没有分支判断）——用列表即可
- 需要调查员主观判断远多于规则判断的场景——留白给调查员

决策树是 skill 内容的补充写法，不是架构要求。新增 skill 时可以不加，阅读已有 skill 时发现判断逻辑复杂可以考虑加。

***

## 六、配置消费开发规范

investigation-ontology 的用户配置系统位于 `{配置路径}/`，由 `config-templates/` 下的模板定义结构、`cold-start` 负责写入、各 skill 负责消费。

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

每个需要读取配置的 skill 必须在其 SKILL.md 中包含以下逻辑：

```
1. 参照 config-loader.md 的标准加载流程
2. 检测 team-profile.md 状态（不存在/PAUSED/PLACEHOLDER/READY）
3. 在 READY 状态下读取对应的配置字段
4. 根据字段值调整 skill 行为
```

**新增 skill 时**：判断它是否需要读取配置。需要则加入 Step 2 的加载逻辑。不需要则跳过——配置系统不强加读取要求。

### 6.3 新增一个配置项的步骤

1. 在 `config-templates/team-profile.md` 对应 H2 节下新增字段
2. 标注 **影响技能：** 指明哪些 skill 消费此字段
3. 在目标 skill 的 SKILL.md 中添加读取和应用该字段的逻辑
4. 此 `DEVELOPMENT_GUIDE.md` 无需修改——规范已涵盖

### 6.4 新增配置项示例

假设新增"默认证据存储路径"：

```
在 config-templates/team-profile.md 的 "调查通信纪律" 节下：

### 默认证据存储路径

**影响技能：** evidence-management（登记时自动填入路径）

**Default Evidence Path:** [PLACEHOLDER e.g. /mnt/evidence/]

在 evidence-management/SKILL.md 中：
[读取 team-profile.md 的 Default Evidence Path 字段，
新登记证据时预填此路径]
```

### 6.5 升级场景保护

插件更新时 `config-templates/*.md` 会被覆盖。用户配置 `{配置路径}/*` 不受影响。

升级后可能出现的场景：

- **模板新增了字段** → cold-start 的模板合并机制（Phase 4.2）检测到差异，引导用户补充
- **现有字段值有效** → 不动，保留用户配置值
- **删除了字段** → 用户配置中保留，不主动删除（静默遗留）

### 6.6 配置状态一览

| 状态               | 判断条件                      | 对 skill 的影响                    |
| ---------------- | ------------------------- | ------------------------------ |
| DOES\_NOT\_EXIST | 文件不存在                     | 停止操作，提示运行 cold-start |
| PAUSED           | 含 `<!-- SETUP PAUSED AT:` | 停止操作，提示 resume                 |
| HAS\_PLACEHOLDER | 含 `[PLACEHOLDER]`         | 停止操作，提示 complete               |
| READY            | 以上皆否                      | 正常读取配置，按值调整行为                  |

***

## 七、本地安装与测试

```bash
# 从本地路径添加市场源
claude plugin marketplace add /path/to/investigation-ontology

# 安装（全量）
claude plugin install investigation-ontology@investigation-ontology

# 指定配置安装
claude plugin install investigation-ontology@investigation-ontology --profile <profile>

# 验证插件配置
claude plugin validate .claude-plugin/plugin.json
```

***

## 八、后续规划

本章记录设计已分析完毕、但尚未实施的候选功能。供后续开发者直接参考，避免重复分析。

### 8.1 定时代理（Scheduled Agents）

**背景：** 利用 Claude Code 的 CronCreate 工具实现定时触发的自动检查任务。不同于事件驱动的"录入实体→立即查询"场景，定时代理适用于时间维度上的周期性检查。

**机制：**

```
用户运行 /schedule <agent-name>          ← 注册命令
  → AI 调用 CronCreate({ cron, prompt })  ← 写入 scheduled_tasks.json
  → 到点 AI 被唤醒，执行对应 agent 逻辑    ← 自动触发
  → 7 天后自动过期，需续期
```

**拟增加的代理：**

| 代理                   | 职责                | 建议频率 | 依赖关系                       |
| -------------------- | ----------------- | ---- | -------------------------- |
| deadline-watcher     | 检查各案件在阶段停留时间是否超期  | 每日   | 读取配置、meta.json             |
| evidence-gap-monitor | 扫描证据注册表有无停滞未推进的条目 | 每周   | 读取 evidence\_registry.json |

**影响范围：**

- 新增 `agents/deadline-watcher.md` — 代理定义
- 新增 `agents/evidence-gap-monitor.md` — 代理定义
- 新增 `commands/schedule.md` — 注册/注销/查看定时任务的入口
- 微调 `schemas/meta.schema.json` — 需新增 `phase_started_at` 字段（当前阶段开始时间），配合已有的 `sla.deadlines`
- 微调 `skills/case-management/SKILL.md` — 补充各阶段的建议时长标准
- 微调 `config-templates/team-profile.md` — 新增"调查时限标准"节，影响技能：case-management, deadline-watcher
- 微调 `hooks/hooks.json` — SessionStart 中报告定时任务状态

**前置条件：** 有真实的、在运行中的案件数据。空项目跑定时任务无意义。

**设计约束：**

- CronCreate 不能预埋在 plugin.json/hooks.json 中声明式注册，必须由 AI 在运行时调用
- 非持久任务随 session 消亡，持久任务 7 天自动过期
- 需要配合配置系统——团队自定义时长而非硬编码
- 与事件驱动的"实体识别→自动查询"场景不同，定时代理不适合需要即时响应的任务

**实现时机建议：** 调查系统在真实场景中使用 1-2 个完整案件周期后。

### 8.2 事件驱动自动化（Event-Driven Triggers）

**背景：** 调查过程中录入实体、推进阶段等事件发生时，自动触发后续操作（如调用 MCP 查询企业信息）。区别于定时代理的时间驱动，此场景是状态变化驱动。

**影响范围（设计阶段，未定型）：**

- 可能需要 Claude Code 未来支持的 PostToolUse 富交互 hook 机制
- 当前可以做的是：开发一个 `osint-collector` agent，手动触发，逻辑固定

**状态：** 设计待定，需要更明确的使用场景触发后再定型。\`\`\`
