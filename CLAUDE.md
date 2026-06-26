# investigation-ontology (Claude Code) — 插件开发指南

本文件是本仓库（investigation-ontology 跨平台插件项目）的 **Claude Code 开发者指南**，指导 AI 协助开发者维护和扩展本插件在 Claude Code 平台的实现。

**这不是用户指南。** 用户指南位于 `project-templates/default/CLAUDE.md`，分发到调查员的案件项目中使用。

---

## 一、项目总览

investigation-ontology 是一个跨平台插件，同时支持 Claude Code、CodeBuddy 和 Codex 三个平台。本文件特别针对 **Claude Code 版本** 的开发和维护。

### Claude Code 特定配置

- **入口**: `.claude-plugin/plugin.json`
- **Hooks**: `hooks/hooks.json` (使用 `${CLAUDE_PLUGIN_ROOT}` 环境变量)
- **MCP**: 不使用（通过 `mcpServers: {}` 声明）

### 分发机制

用户通过 `claude plugin install investigation-ontology` 安装时，安装器读取 `manifests/install-modules.json` 中每个模块的 `paths` 字段来定位分发文件。**根部 CLAUDE.md 不在任何模块的 paths 中，不会被分发。**

同一仓库中的内容被三个平台共享，但安装器只识别该平台对应的 targets 字段。

### 开发者 vs 用户 上下文隔离

| 文件 | 谁读 | 作用 |
|------|------|------|
| `CLAUDE.md`（本文件） | Claude Code 开发者 + AI | Claude Code 版本开发指南 |
| `CODEBUDDY.md` | CodeBuddy 开发者 + AI | CodeBuddy 版本开发指南 |
| `CODEX.md` | Codex 开发者 + AI | Codex 版本开发指南 |
| `DEVELOPMENT_GUIDE.md` | 人类开发者 | 架构说明、跨平台维护指南 |
| `README.md` | GitHub 访客 | 多平台安装说明 |
| `project-templates/default/CLAUDE.md` | 调查员 + AI | 调查案件操作指南（分发后） |

---

> 完整目录结构及架构分类说明见 [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md#三目录结构)

---

## 二、开发任务 SOP

### 3.1 添加新场景技能（fraud-xxx）

新增一个 `fraud-<domain>` 场景技能时，必须依次修改以下 6 个文件：

| # | 文件 | 操作 |
|---|------|------|
| 1 | `skills/fraud-xxx/SKILL.md` | 创建技能文件，按 ACFE 分类编写 |
| 2 | `manifests/install-modules.json` | 添加模块条目（id、paths、dependencies） |
| 3 | `manifests/install-profiles.json` | 加入 `investigator` 和 `full` 两套 profile |
| 4 | `skills/fraud-classification/SKILL.md` | 在"专题舞弊类型索引"表追加一行 |
| 5 | `agents/investigation-planner.md` | 在 Related 技能段追加引用 |
| 6 | `agents/fraud-type-classifier.md` | 在 Cross-Reference 段和 Related 段追加引用 |

此外，模板中的技能表也应同步更新。

**模块注册 (`install-modules.json`) 模板：**
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

注意：`targets` 应包含所有三个平台的变种，以支持跨平台分发。

### 3.2 更新技能内容

- 每个技能目录必须包含 `SKILL.md`
- 如需配套脚本，放在 `skills/<skill>/scripts/` 下
- 跨文件引用使用相对路径（相对于仓库根）

### 3.3 修改代理定义

代理文件在 `agents/` 目录下，每文件包含：
- frontmatter（name、description）
- Role 定义
- Process 流程
- Related 段（引用相关技能）

修改后需确认 Related 段中的路径引用正确。

### 3.4 修改命令

命令文件在 `commands/` 目录下。每个命令一个 `.md` 文件。

### 3.5 修改模板

`project-templates/default/CLAUDE.md` 是分发到调查项目的用户指南，其技能表、命令表需要同步更新。

---

> 完整编写规范（MCP 格式、阶段定义、命名、决策树等）见 [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md#五编写规范)

---

## 三、当前模块清单状态

所有注册模块见 `manifests/install-modules.json`，当前状态：

| 模块 | 成本 | 稳定性 | 开发者 |
|------|------|--------|--------|
| rules-core | light | stable | 核心 |
| agents-core | light | stable | 核心 |
| commands-core | medium | stable | 核心 |
| platform-configs | light | stable | 核心 |
| investigation-foundation | medium | stable | 核心 |
| fraud-classification | heavy | stable | 核心 |
| evidence-management | medium | stable | 核心 |
| writing-reporting | medium | stable | 核心 |
| interview-analysis | medium | stable | 核心 |
| data-analysis | medium | stable | 核心 |
| investigation-techniques | heavy | stable | 核心 |
| case-management | medium | beta | 核心 |
| mcp-integration | medium | stable | 核心 |
| cold-start-interview | light | stable | 核心 |
| fraud-channel | heavy | beta | 核心 |
| fraud-reimbursement | medium | alpha | 开发者 |
| fraud-procurement | medium | alpha | 开发者 |
| fraud-bid-rigging | medium | alpha | 开发者 |
| fraud-ip | medium | alpha | 开发者 |
| fraud-hr | medium | alpha | 开发者 |
| fraud-fake-chop | light | alpha | 开发者 |
| fraud-conflicts-of-interest | medium | alpha | 开发者 |
| order-execution-variance-analysis | medium | beta | 核心 |
| investigation-memory | light | beta | 核心 |
| case-retrospective | light | beta | 核心 |

---

## 四、相关资源

- `DEVELOPMENT_GUIDE.md` — 架构设计、插件扩展、构建发布的完整指南
- `manifests/install-modules.json` — 模块注册表（必读）
- `manifests/install-profiles.json` — 安装配置集
- `project-templates/default/CLAUDE.md` — 用户指南（分发物）

---

## 五、AI 编码行为准则（Karpathy Guidelines）

> 来源：[andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) — 基于 Andrej Karpathy 对 LLM 编码问题的观察。

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

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

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

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

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
