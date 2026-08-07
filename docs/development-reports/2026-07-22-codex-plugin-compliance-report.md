# Codex 插件合规性检查报告

**检查对象**：`cc-investigation-ontology/`（investigation-ontology 跨平台反舞弊调查插件）
**检查基准**：Codex 官方插件构建规范（见附录 A）
**检查日期**：2026-07-22
**报告性质**：只读分析，未修改插件任何源码

> **修订记录（v1.1，2026-07-22）**：依据一轮独立评审（已用官方文档复核）修正两处：① **P0-1 因果链**——`hooks` 清单字段与默认 `hooks/hooks.json` 为**互斥关系**（官方原文 "Codex uses that manifest entry **instead of** the default `hooks/hooks.json`"），删除原报告中"误加载 CodeBuddy 版"这一不会发生的分支；② **3.2 节 marketplace 兼容性**——降级为**待实测假设**并附验证命令。另补充 npm 分发选项、修订附录链接为规范路径。

---

## 摘要（TL;DR）

`cc-investigation-ontology` 是一个**单仓库、多平台清单、自研 manifests 安装路由**的跨平台插件（Claude Code / CodeBuddy / Codex）。以 Codex 官方规范衡量：

> **总体结论：当前 Codex 插件设计「部分符合」，存在 3 项 P0 级阻断问题，导致 Codex 端无法按官方策略正常安装与加载。**

- **P0-1 / P0-2**：`.codex-plugin/plugin.json` 的 `hooks`、`mcpServers` 指针**指向插件根不存在的文件**（实际文件被刻意藏进 `.codex-plugin/`）。由于清单已声明 `hooks` 字段，Codex **只按该指针解析、不再回退默认路径**（互斥规则），指针落空即导致 hooks 完全不可用；mcpServers 同理。
- **P0-3**：仓库**没有 Codex 格式的 `.agents/plugins/marketplace.json`**，无法满足官方安装/分发策略；现有 `.claude-plugin/marketplace.json` 能否被 Codex 兼容读取为**待实测假设**（见 3.2）。
- **结构性冲突**：项目刻意把 Codex 专用 `hooks.json`/`mcp.json` 放进 `.codex-plugin/`（为了让其他平台安装器"看不见"），这与 Codex"`.codex-plugin/` 只放 `plugin.json`"的规则直接冲突。
- **组件可用性**：**skills 是唯一天然可用的组件**；agents / commands / rules 因 Codex 无插件级分发机制而**固有降级**；hooks / mcpServers 因"刻意放错位置 + 清单指针指向不存在文件"而**实际失效**（互斥规则下指针落空即失效）。

---

## 一、检查基准：Codex 官方插件规范

以下规范摘自 Codex 官方文档（两个来源 `learn.chatgpt.com` 与 `codex-docs.com` 内容一致）。

### 1.1 插件结构与清单

| 项 | 官方要求 |
|---|---|
| 清单文件 | 必须有 `.codex-plugin/plugin.json` |
| `.codex-plugin/` 目录 | **只应放 `plugin.json`**；`skills/`、`hooks/`、`assets/`、`.mcp.json`、`.app.json` 都应放在**插件根** |
| 组件指针字段 | 仅 4 个：`skills`、`mcpServers`、`apps`、`hooks`（**无 `commands` / `agents` / `rules` 字段**） |
| 路径规则 | 一律 `./` 前缀、相对插件根解析、且**解析后必须留在插件根内** |

标准结构：

```
my-plugin/
├── .codex-plugin/
│   └── plugin.json        # 必需：插件清单（仅此一个文件）
├── skills/<skill>/SKILL.md
├── hooks/hooks.json       # 可选：生命周期 hooks（默认位置）
├── .mcp.json              # 可选：MCP server 配置
├── .app.json              # 可选：app/连接器映射
└── assets/                # 可选：图标/徽标/截图
```

### 1.2 安装与分发策略

| 渠道 | 位置 / 方式 |
|---|---|
| 仓库级 marketplace | `$REPO_ROOT/.agents/plugins/marketplace.json` |
| 个人级 marketplace | `~/.agents/plugins/marketplace.json` |
| 兼容旧版 marketplace | `$REPO_ROOT/.claude-plugin/marketplace.json`（可被桌面 App 读取） |
| CLI 添加 | `codex plugin marketplace add owner/repo` |
| 公开发布 | 官方提交门户（submission portal） |

marketplace 每个插件条目**必填**：`source`（含 `path`）、`policy.installation`、`policy.authentication`、`category`。`source.path` 需 `./` 前缀且相对 marketplace 根。Git 条目解析失败时**跳过该条目**而非整体失败。

### 1.3 五类组件的 Codex 支持矩阵

| 组件 | Codex 官方支持方式 | 插件级分发 |
|---|---|---|
| **skills** | `skills/<name>/SKILL.md`，frontmatter `name`/`description` | ✅ 支持 |
| **hooks** | 插件根 `hooks/hooks.json`（默认）或清单 `hooks` 字段；需用户 trust 后执行 | ✅ 支持 |
| **mcpServers** | 清单指向 `.mcp.json` | ✅ 支持 |
| **agents**（子代理） | **TOML** 文件，放 `~/.codex/agents/` 或 `.codex/agents/`，必填 `name`/`description`/`developer_instructions` | ❌ 无插件级分发机制 |
| **commands**（斜杠命令） | 无插件注册机制；skills 以 `$skill-name` 触发，自定义 prompt 以 `/prompts:<name>` 出现 | ❌ 无插件级分发机制 |
| **rules** | `.rules` exec-policy 文件（Starlark），放 `~/.codex/rules/` 或 `<repo>/.codex/rules/`（需 trust） | ❌ 无插件级分发机制 |

---

## 二、项目跨平台分发机制剖析

理解本报告判定的前提：`cc-investigation-ontology` **不是**一个孤立的标准 Codex 插件。

### 2.1 单仓库多清单架构

一套**共享业务内容**放在仓库根，三套**平台清单**各自描述如何加载它：

```
cc-investigation-ontology/
├── skills/ commands/ agents/ rules/ docs/ schemas/ config-templates/   ← 三平台共享
├── .claude-plugin/    plugin.json + hooks.json + marketplace.json
├── .codebuddy-plugin/ plugin.json
├── .codex-plugin/     plugin.json + hooks.json + mcp.json
├── hooks/hooks.json   ← CodeBuddy 版（用 ${CODEBUDDY_PLUGIN_ROOT}）
└── manifests/         ← 自研安装路由体系
```

### 2.2 自研安装路由体系（manifests）

| 文件 | 作用 |
|---|---|
| `install-modules.json` | 每个模块声明 `targets`，含 `claude` / `codebuddy` / `codex` / `claude-project` / `codebuddy-project` / `codex-project` / `cursor` / `repo-agent` 共 **8 种安装目标** |
| `install-profiles.json` | 6 种配置集：`minimal` / `investigator` / `auditor` / `analyst` / `interviewer` / `full` |
| `install-components.json` | 组件族（baseline / capability / setup）归组 |

安装器依据 `targets` 矩阵，把共享内容按平台路由、只分发该平台需要的文件。

### 2.3 平台隔离设计的动机（有据可查）

`docs/ARCHITECTURE_NOTES.md` 第 1 节明确记载：

> "将 `mcp.json` 放在 `.codex-plugin/` 下确保**其他平台的安装器完全看不到它**，避免不必要的分发。"
> "所有 hooks 配置都在各自的 `.xxx-plugin/` 目录中，安装器只会分发该平台对应的 hooks.json。"

**这是刻意的架构决策，不是疏忽。** 但它与 Codex 官方"` .codex-plugin/` 只放 `plugin.json`、组件必须在插件根"的规则**正面冲突**——这正是本报告的核心矛盾。

---

## 三、逐项检查表（8 维度）

判定图例：✅ 合规可用　⚠️ 部分/权衡　❌ 不合规/失效

| # | 维度 | 状态 | 项目现状 | 官方要求 | 是否刻意设计 | Codex 下真实可用性 |
|---|---|---|---|---|---|---|
| 1 | **结构与清单** | ⚠️ | `.codex-plugin/` 含 `plugin.json`+`hooks.json`+`mcp.json` | `.codex-plugin/` 只放 `plugin.json` | ✅ 刻意（平台隔离） | 清单本身可读，但混入组件违反规范 |
| 2 | **安装与分发** | ❌ | 仅 `.claude-plugin/marketplace.json`（Claude 方言） | 需 `.agents/plugins/marketplace.json` 含 source/policy/category | — | **无法按官方策略分发**（详见 3.2） |
| 3 | **skills** | ✅ | 23 个，`SKILL.md` frontmatter `name`/`description`/`origin` | `skills/<name>/SKILL.md`，`name`/`description` | — | **正常加载，唯一无问题组件** |
| 4 | **hooks** | ❌ | Codex 版在 `.codex-plugin/hooks.json`，根 `hooks/hooks.json` 是 CodeBuddy 版；清单指针 `./hooks.json` | 根 `hooks/hooks.json` 或清单指针指向插件根内文件 | ✅ 刻意（位置）但指针错误 | **实际失效**（详见 3.4） |
| 5 | **mcpServers** | ❌ | 配置在 `.codex-plugin/mcp.json`，清单指针 `./mcp.json` | 清单指向插件根 `.mcp.json` | ✅ 刻意（位置）但指针错误 | **实际失效**（指针指向不存在文件） |
| 6 | **agents** | ⚠️ | 7 个 Claude 格式 md（`name`/`tools`/`description`） | TOML，无插件级分发 | 共享目录，无法单为 Codex 改格式 | **固有降级**（Codex 无插件机制） |
| 7 | **commands** | ⚠️ | 12 个 md，`/investigate` 等 | Codex 无插件 commands 机制，`$skill` 触发 | 共享目录 | **固有降级**（`/efio:xxx` 不可用） |
| 8 | **rules** | ⚠️ | 3 个纯叙述 md（伦理/证据/底稿标准） | `.rules` exec-policy，无插件级分发 | 共享目录 | **固有降级**（但内容本就属指令层） |

### 3.1 结构与清单（维度 1）

`.codex-plugin/` 目录混入 `hooks.json` 和 `mcp.json`，违反官方"该目录只应放 `plugin.json`"的规定。

**定性：B 类（规范不符合但属刻意设计）**。动机是正当的（避免其他平台分发 Codex 专用文件），但实现方式与 Codex 路径规则冲突。属于**跨平台隔离诉求 vs 单平台规范**的权衡，需呈现权衡而非简单判违规。

### 3.2 安装与分发（维度 2）— P0

**确定结论**：仓库**没有** `$REPO_ROOT/.agents/plugins/marketplace.json`，因此**不存在任何符合 Codex 规范的 marketplace 入口**——这是本维度的 P0 事实，无争议。

**待实测假设**（评审降级）：现有的 `.claude-plugin/marketplace.json` 虽被官方列为桌面 App 可读的"兼容旧版（legacy-compatible）"来源之一，但其格式是 **Claude 方言**（`owner`/`metadata`/`plugins[].source:"./"`，无 `policy`/`authentication` 字段，仅有一个 `category:"workflow"`）。它能否被 Codex 实际解析、还是按官方"无法解析的条目会被跳过"规则被跳过——**取决于 Codex 对 Claude marketplace schema 的兼容实现，而这一点 Codex 官方文档未给出权威描述**。本报告此前据此直接推断"大概率被跳过"，属未经验证的推论，现降级为待验证。

**建议的低成本实测**（应作为后续动作的第一步，而非停留在文档比对）：

```bash
codex plugin marketplace add <本仓库路径>
codex plugin marketplace list
```

观察 `.claude-plugin/marketplace.json` 中的条目是**被列出（部分可用）**、**被跳过**、还是**报错**，以实测结果取代纯推理。

**定性：A 类 / P0（规范不符合）**。无论实测结果如何，补齐标准 `.agents/plugins/marketplace.json` 都是正解；实测仅用于明确"兼容退路"的真实可用程度。

### 3.3 skills（维度 3）— ✅

23 个技能全部位于 `skills/<name>/SKILL.md`，frontmatter 含 `name`/`description`，完全符合规范。`skills` 指针 `./skills/` 正确指向插件根。**这是五类组件中唯一在 Codex 下天然可用的。**

### 3.4 hooks（维度 4）— P0

**失效路径是单一的"指针解析失败"**（评审修正：原报告的"误加载 CodeBuddy 版"分支不成立）：

1. **互斥规则**：官方明确——清单 `hooks` 字段与默认 `hooks/hooks.json` **二选一，非叠加**。
   > "If you define `hooks` in `.codex-plugin/plugin.json`, Codex uses that manifest entry **instead of** the default `hooks/hooks.json`."
   > "If your plugin stores hooks at `./hooks/hooks.json`, you don't need a `hooks` entry... Codex checks that default file automatically."
2. **当前失效链**：清单已声明 `"hooks": "./hooks.json"` → Codex **只按此指针解析，不再触碰默认文件** → 指针相对插件根解析到 `<根>/hooks.json`（**非** `.codex-plugin/` 内）→ 插件根**不存在**该文件 → **指针无法解析，hooks 完全不可用**。根目录那份 CodeBuddy 版 `hooks/hooks.json` 在此过程中**永远不会被读取**。
3. Codex 专用版（`.codex-plugin/hooks.json`，bash + `${INVESTIGATION_ONTOLOGY_ROOT}`）写得**本身正确**，引用的 `scripts/validate-ontology-action.sh`、`check-ontology-ref.sh` 也都存在——但它**放错了位置**，Codex 不会去 `.codex-plugin/` 里找。

> ⚠️ **修复含义**：正因此互斥规则，仅"把 Codex 版 `hooks.json` 搬到插件根 `hooks/hooks.json`"**不够**——只要清单保留 `hooks` 字段，Codex 仍只按指针、绕过默认文件。必须**二选一**：① 搬文件 + **删除**清单 `hooks` 字段（让 Codex 自动识别默认位置）；② 搬文件 + 把 `hooks` 字段值改为**指向插件根内的有效路径**。

**定性：A 类 / P0**。位置是刻意的（B），但指针解析失败导致**功能真实失效**（A）。

### 3.5 mcpServers（维度 5）— P0

- 清单 `"mcpServers": "./mcp.json"` 指向插件根不存在的文件（实际在 `.codex-plugin/mcp.json`）。
- 配置内容本身正常（`investigation-pdf` → `npx @modelcontextprotocol/server-pdf`），但因指针失效**无法被加载**。
- 同时违反路径规则：组件文件必须解析在插件根内，不能藏进 `.codex-plugin/`。

**定性：A 类 / P0**。

### 3.6 agents（维度 6）— P1

- Codex 子代理需 **TOML 格式**，且官方**未提供插件级 agents 分发机制**（只能放 `~/.codex/agents/` 或 `.codex/agents/`）。
- 项目的 7 个 agents 是 **Claude 格式 md**（frontmatter `name`/`tools`/`description`），且位于**三平台共享的 `agents/` 目录**——不可能只为 Codex 改成 TOML。
- 结果：在 Codex 下这些 agents **无法作为子代理被识别和使用**。

**定性：C 类 / P1（Codex 平台机制缺失导致的固有降级）**。非项目错误，属架构内在局限。

### 3.7 commands（维度 7）— P1

- Codex **无插件 commands 注册机制**（清单无 `commands` 字段）。`/investigate`、`/efio:xxx` 这类斜杠命令在 Codex 不会被识别。
- Codex 的等价触发方式是 `$skill-name` 显式调用技能，或 `/prompts:<name>`。

**定性：C 类 / P1（固有降级）**。建议 Codex 下以 `$skill` 触发为主，命令文档作为方法论参考。

### 3.8 rules（维度 8）— P1

- Codex rules 是 `.rules` exec-policy 文件（Starlark 强制管控），无插件级分发。
- 项目的 3 个 rules（`evidence-rules`/`investigation-ethics`/`working-paper-standards`）是**纯叙述性 Markdown**，内容性质（调查伦理、证据规则、底稿标准）本就属于**给模型的指令/提示层**，而非命令执行策略。
- 这类内容在 Codex 的正确载体是 **AGENTS.md / 项目模板注入**，而非 `.rules` exec-policy。

**定性：C 类 / P1（固有降级，但有合理替代路径）**。

---

## 四、核心冲突剖析

| 项目跨平台意图 | Codex 官方规范 | 冲突结果 |
|---|---|---|
| 一套共享内容（skills/commands/agents/rules）三平台复用 | 清单只有 `skills` 指针，无 commands/agents/rules 字段 | **agents/commands/rules 在 Codex 固有降级**，只有 skills 天然可用 |
| 平台专用文件物理隔离：藏进各自 `.xxx-plugin/` 让其他平台"看不见" | `.codex-plugin/` 只放 `plugin.json`，组件必须在插件根 | **hooks/mcp 放错位置 + 指针失效** |
| 平台路由靠 `manifests/targets` 矩阵在**安装层**实现 | Codex 无此概念，只认插件根物理布局 | **路由体系与 Codex 分发模型不兼容** |

**根本矛盾**：项目用"物理藏文件 + 自研 targets 矩阵"实现跨平台路由；Codex 用"单一插件根布局 + marketplace 目录"实现分发。两套模型在 `.codex-plugin/` 目录用途上**直接对立**。

**破局思路**：把"平台隔离"从"物理藏进 `.codex-plugin/`"改为"由 manifests targets 矩阵在安装层控制"，让 Codex 专用文件回到插件根的官方位置——既满足 Codex 规范，又不影响其他平台（其他平台安装器本就不读 Codex 的根 `hooks/hooks.json`/`.mcp.json`）。

---

## 五、分级问题清单

### P0 — 阻断安装/加载（必须修复）

| 编号 | 问题 | 位置 | 影响 |
|---|---|---|---|
| P0-1 | `hooks` 清单字段 `./hooks.json` 指向插件根不存在的文件；因清单与默认路径互斥，Codex 只按指针解析，指针落空即失效 | `.codex-plugin/plugin.json` `hooks` 字段 | Codex hooks 完全失效 |
| P0-2 | `mcpServers` 指针 `./mcp.json` 指向插件根不存在文件 | `.codex-plugin/plugin.json` `mcpServers` 字段 | MCP 服务器无法加载 |
| P0-3 | 缺 Codex 格式 `.agents/plugins/marketplace.json`；现有 Claude 版能否被兼容读取为待实测假设（见 3.2） | 仓库根 `.agents/plugins/`（缺失） | 无法按官方策略安装分发 |

### P1 — 组件功能失效/降级（机制性，需替代路径）

| 编号 | 问题 | 影响 | 缓解方向 |
|---|---|---|---|
| P1-1 | agents 为 Claude md 格式，Codex 需 TOML 且无插件分发 | 7 个子代理在 Codex 不可用 | 可选转 TOML 放 `.codex/agents/`；或经 AGENTS.md 引导 |
| P1-2 | Codex 无插件 commands 机制 | 12 个斜杠命令不可用 | 以 `$skill-name` 触发为主 |
| P1-3 | rules 为纯叙述 md，Codex 需 exec-policy 且无插件分发 | 调查伦理/证据规则不生效 | 经 project-templates 的 AGENTS.md 注入 |

### P2 — 体验与上架完善

| 编号 | 问题 | 影响 |
|---|---|---|
| P2-1 | `interface` 缺 `composerIcon`/`logo`，`screenshots` 为空数组 | 上架展示效果差，不影响功能 |

---

## 六、修复建议（兼顾三平台）

> 每条标注对 Claude Code / CodeBuddy 的影响，确保不破坏跨平台架构。

### 建议 1：修复 hooks（对应 P0-1）

**方案（推荐）**：在**插件根**新建一份 Codex 合规的 `hooks/hooks.json`（内容取现有 `.codex-plugin/hooks.json` 的 bash 版），并**删除** `.codex-plugin/plugin.json` 中的 `hooks` 字段（让 Codex 自动识别默认位置）。

- ⚠️ **冲突点**：插件根现有 `hooks/hooks.json` 是 CodeBuddy 版。需将 CodeBuddy 版改由 `.codebuddy-plugin/plugin.json` 显式指针指向（如 `./hooks/codebuddy-hooks.json`），腾出根 `hooks/hooks.json` 给 Codex。
- **对 Claude 影响**：无（Claude 用 `.claude-plugin/hooks.json`）。
- **对 CodeBuddy 影响**：需调整其清单 `hooks` 指针，由默认位置改为显式路径。

**备选**：保留物理隔离，但把清单指针改为指向 `.codex-plugin/` 内文件——**违反 Codex 路径规则（组件必须留在插件根内），不推荐**。

### 建议 2：修复 mcpServers（对应 P0-2）

在**插件根**新建 `.mcp.json`（内容取现有 `.codex-plugin/mcp.json`），清单指针改为 `"mcpServers": "./.mcp.json"`，并从 `.codex-plugin/` 删除 `mcp.json`。

- **对 Claude 影响**：无（Claude `mcpServers: {}` 为空）。
- **对 CodeBuddy 影响**：无（CodeBuddy 不使用 MCP）。
- **隔离诉求**：其他平台安装器本就不读 Codex 的根 `.mcp.json`，由 manifests targets 矩阵在安装层控制即可，无需物理藏文件。

### 建议 3：补齐 Codex marketplace（对应 P0-3）

新建 `$REPO_ROOT/.agents/plugins/marketplace.json`：

```json
{
  "name": "investigation-ontology",
  "interface": { "displayName": "Investigation Ontology" },
  "plugins": [
    {
      "name": "efio",
      "source": { "source": "local", "path": "./cc-investigation-ontology" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

> 注：`source.path` 需按实际 marketplace 根与插件目录的相对关系调整；若走 Git 分发则用 `"source": "git-subdir"` + `url`/`path`/`ref`。

**分发方式补充（评审建议）**：marketplace 条目的 `source` 除 `local`、`git-subdir`/`url` 外，官方还支持 `"source": "npm"` 直接从 npm registry 安装。本项目已是 monorepo 风格，若未来希望 Codex 用户更便捷地 `codex plugin marketplace add`，可将插件打包为 npm 包分发——这对三平台复用也友好（npm 包可作为统一分发载体，各平台清单从中取用）。

- **对 Claude / CodeBuddy 影响**：无（各自用自己的 marketplace / 安装器）。

### 建议 4：agents 的 Codex 降级路径（对应 P1-1）

- **可选**：将 7 个 agents 转换为 TOML（`name`/`description`/`developer_instructions`），放 `.codex/agents/`（项目级）或在文档引导用户放 `~/.codex/agents/`。
- **或**：在 project-templates 的 `AGENTS.md` 中以文字方式引导 Codex 模型扮演这些角色（降级为提示层）。
- **对 Claude / CodeBuddy 影响**：无（它们继续用共享 `agents/` md）。

### 建议 5：commands 的 Codex 触发方式（对应 P1-2）

- 在 `CODEX.md` / `AGENTS.md` 中明确：Codex 下以 `$case-management`、`$evidence-management` 等 `$skill-name` 方式触发，斜杠命令文档仅作方法论参考。
- **对 Claude / CodeBuddy 影响**：无。

### 建议 6：rules 的 Codex 注入方式（对应 P1-3)

- 将调查伦理/证据规则经 `project-templates/default/AGENTS.md` 注入 Codex 项目层（指令层），而非尝试转成 `.rules` exec-policy（内容性质不匹配）。
- **对 Claude / CodeBuddy 影响**：无。

### 建议 7：完善上架展示（对应 P2-1）

在 `.codex-plugin/plugin.json` 的 `interface` 补充 `composerIcon`/`logo`（资源放插件根 `assets/`），并补 `screenshots`。

---

## 七、总体结论

1. **安装/分发策略**：当前**不满足**。缺 Codex 格式 marketplace（P0-3），且 hooks/mcpServers 指针失效（P0-1/P0-2），即便手动安装也无法正常加载关键组件。
2. **组件可用性**：**skills 完全正常**；hooks、mcpServers 因"刻意放错位置 + 指针错误"**实际失效**（P0）；agents、commands、rules 因 Codex 无插件级分发机制**固有降级**（P1，非项目错误）。
3. **核心矛盾**：跨平台"物理隔离 + targets 路由"与 Codex"单插件根布局 + marketplace"两套分发模型对立。修复关键是把平台隔离从"物理藏文件"改为"安装层路由"，让 Codex 组件回归插件根官方位置。

**优先级建议**：先修 P0（建议 1–3）让 Codex 能装、能加载；再按需要补 P1 降级路径（建议 4–6）；P2 随时可做。

---

## 附录 A：官方参考链接

> 路径前缀说明：官方导航以 `/codex/...` 为规范路径（`build-plugins`、`agent-configuration/subagents`、`agent-configuration/rules`、`reference/slash-commands`）；`/docs/...` 为兼容的历史 canonical 别名，二者均可访问。下表统一采用 `/codex/` 规范路径。

| 主题 | 链接 |
|---|---|
| Build plugins（主规范） | https://learn.chatgpt.com/codex/build-plugins |
| Build plugins（镜像，内容一致） | https://www.codex-docs.com/docs/build-plugins |
| Subagents（TOML 子代理） | https://learn.chatgpt.com/codex/agent-configuration/subagents |
| Rules（exec-policy） | https://learn.chatgpt.com/codex/agent-configuration/rules |
| Slash commands | https://learn.chatgpt.com/codex/reference/slash-commands |
| Submit plugins（公开发布） | https://learn.chatgpt.com/codex/submit-plugins |

## 附录 B：检查涉及的项目关键文件

| 文件 | 用途 |
|---|---|
| `.codex-plugin/plugin.json` | Codex 清单（含失效指针） |
| `.codex-plugin/hooks.json` | Codex 专用 hooks（位置错误） |
| `.codex-plugin/mcp.json` | Codex MCP 配置（位置错误） |
| `hooks/hooks.json` | CodeBuddy 版 hooks（占据 Codex 默认位置） |
| `.claude-plugin/marketplace.json` | Claude 格式 marketplace（无 Codex 版） |
| `manifests/install-modules.json` / `install-profiles.json` | 自研跨平台路由体系 |
| `docs/ARCHITECTURE_NOTES.md` | 平台隔离设计动机佐证 |

---

*本报告为只读分析，未修改插件任何源码。所有判定均可溯源至上述文件与官方条款。*
