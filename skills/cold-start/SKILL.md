---
name: cold-start
description: 首次设置向导 — 引导调查员完成团队配置、证据策略、集成检查和偏好设置。写入持久化配置路径，所有技能依赖此配置运行。支持中断恢复、升级合并和增量更新。
origin: efio
user-invocable: true
---

# Cold-Start 配置向导

首次安装 investigation-ontology 后的设置向导。在一次对话中完成所有配置，让插件从"通用模板"变成"你的调查工具"。

> **注意：** 本技能是**配置类**技能，不属于调查业务流程。「cold-start」指插件初始化启动，与访谈（interview）无关。

---

## 触发条件

| 场景 | 行为 |
|------|------|
| 插件安装后首次触发（SessionStart hook） | 自动提示运行 |
| **调用任意插件功能时配置未就绪** | **自动进入本向导，无需用户手动触发** |
| 用户主动运行 `/efio:cold-start` | 进入状态检测 |
| 用户运行 `--check-integrations` | 仅检查集成状态，不重新设置 |
| 用户运行 `--redo` | 重新完整设置，覆盖现有配置（先展示 diff） |

---

## 状态检测（入口）

每次运行时，先解析 `{PLUGIN_CONFIG_DIR}`（见 `config-templates/config-loader.md § 平台路径`），再检查四种状态：

| 平台 | {PLUGIN_CONFIG_DIR} |
|------|---------------------|
| Claude Code | `{配置路径}` |
| CodeBuddy   | `~/.codebuddy/plugins/config/efio` |
| Codex       | `~/.codex/plugins/config/efio` |

```
{PLUGIN_CONFIG_DIR}/team-profile.md 的状态:

DOES_NOT_EXIST      → 进入 Phase 1（全新设置）
├── evidence-policy.md 也不存在 → 标记为"可选，稍后设置"

PAUSED              → 提示用户"上次中断于[章节]，是否继续？"
├── 用户选择继续 → 跳转至中断点
├── 用户选择重来 → 进入 Phase 1

HAS_PLACEHOLDER     → 提示"配置不完整，继续补全或重来？"
├── 用户选择补全 → 逐个定位 [PLACEHOLDER] 位置并引导填写
├── 用户选择重来 → 进入 Phase 1

READY               → "配置已就绪，是否需要：
                         ├── --redo    重新完整设置
                         ├── --check-integrations  仅检查集成
                         └── 取消"
```

团队配置已就绪（READY）且用户选了 `--redo` 时，在覆盖前展示 diff：

```
── 准备覆盖现有配置 ─────────────────────────
原值: 普通案件周期上限: 30天
新值: 普通案件周期上限: 45天
                                              ← 后续字段变化逐行展示
── 确认覆盖？(yes/no) ───────────────────────
```

---

## Phase 1: 全新设置

用户首次使用或选择重来时进入此阶段。目标：完整填写 team-profile.md。

### 1.1 组织信息

**影响技能：** case-management、report-writer

采集：组织名称、行业、主要法域、监管机构。

提问策略：先问是否有现成的介绍（公司官网/About页面/企业信息卡片），有则读取提取，无则逐项填空。**2 个问题以内完成本节。**

### 1.2 调查团队

**影响技能：** case-management、investigation-planner

团队名称、规模、负责人、汇报线。

### 1.3 调查通信纪律

**影响技能：** interview-analysis、investigation-planner

关键参数：

| 参数 | 建议提问方式 |
|------|------------|
| 同一事项连续通话上限 | "同一个举报线索，最多可以连续联系举报人几次必须停下来复盘？" |
| 通话前背景核查 | "联系举报人之前是否需要先做背景核查？" |
| 通话后强制 call_memo | "每次通话后是否强制输出通话备忘录？" |
| 案件周期上限 | "普通案件从立案到结案，通常希望控制在多少天内？" |

### 1.4 审批流程

**影响技能：** case-management、report-writer

逐项确认：立案/数据提取/访谈/报告发布是否需要审批、谁来批。

### 1.5 报告偏好

语言、报告格式、编号规则等。

### 1.6 角色画像选择（Skill Profile）

**影响技能：** 全部（决定办案时默认聚焦/优先提示的技能集）

读取 `manifests/install-profiles.json`，向用户展示可选角色画像及其技能集，引导选择其一。画像是 install-profiles.json 在运行期的消费方——决定本团队默认聚焦哪些技能。

| 画像 | 适用 | 技能集（摘要） |
|------|------|--------------|
| investigator | 一线反舞弊调查员（默认推荐），覆盖报案到结案全流程 | 全部核心 + 本体 + 全部 fraud-* 场景 + 访谈/证据/报告 |
| auditor | 内审/合规，侧重数据分析与流程审计 | 调查基础、本体、数据分析、证据管理、写作报告 |
| analyst | 数据分析师，侧重数据挖掘与异常检测 | 调查基础、本体、数据分析、证据管理、写作报告 |
| interviewer | 访谈/问话专家，侧重陈述分析与证言评估 | 调查基础、本体、访谈分析、证据管理、写作报告 |
| full | 需要全部能力（含记忆、复盘、订单差异分析） | install-profiles.json 中的所有模块 |

提问策略：先问"你的团队主要做哪类调查工作？"，据答案推荐画像。**1 个问题完成本节。**

选定后，将画像名与其 `modules` 列表写入 team-profile.md 的"角色画像"节（`Selected Profile` 与 `Active Skills`）。该画像决定办案时优先加载/提示的技能，但不阻止按需临时加载任何其他场景技能（`full` 之外的画像仍可临时加载）。

---

## Phase 2.5: MCP 环境配置

用户选定角色画像后，进入 MCP 配置选择阶段。目标：根据用户需求，动态生成 `.mcp.json` 文件。

### 2.5.1 MCP 能力概览

读取 `mcp-configs/mcp-servers.json`，展示"已确认可用的 MCP"列表给用户：

**提问**："你的调查工作中需要以下哪些能力？（可多选）"

```
[ ] investigation-pdf (v1.7.4)
    → 能力: PDF 文档分析（合同、发票、报告等）
    → 调查场景: 证据文档审查、合同条款提取
    → 不可用时: 手动打开 PDF 文件

[ ] sequential-thinking
    → 能力: 分步推理（复杂逻辑推演）
    → 调查场景: 假设推演、证据链因果验证、时间线推断
    → 不可用时: 模型直接完成推理

[ ] web-search (已内置)
    → 能力: 互联网搜索
    → 调查场景: OSINT 公开信息检索、背景调查
    → 不可用时: 浏览器手动搜索

[ ] file-system (已内置)
    → 能力: 文件系统操作
    → 调查场景: 证据底稿存取、案件文件检索
    → 不可用时: 手动指定文件路径
```

用户可选中多个 MCP，也可选择"暂不配置，稍后手动编辑 .mcp.json"。

### 2.5.2 生成配置文件

根据用户选择，按照 `mcp-servers.json` 的定义，拼装用户的 `.mcp.json`：

```json
{
  "mcpServers": {
    "investigation-pdf": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-pdf"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

保存到项目根目录（从 `project-templates/default/.mcp.json` 复制后修改）。

---

## Phase 3: 验证集成

检查已配置的 MCP 服务器的可用性。运行 `--check-integrations` 时仅执行此阶段。

对用户选定的各 MCP 逐一验证：

```bash
npx -y @modelcontextprotocol/server-<name> --version
```

输出示例：
```
已配置的 MCP 服务器：

✓ investigation-pdf (v1.7.4)    — 文件系统操作类 MCP
✓ sequential-thinking (ready)   — 推理辅助类 MCP
✗ 自定义 HTTP MCP (连接失败)    — 网络搜索类 MCP
  → 建议: 检查服务端点配置是否正确

已内置的能力：
✓ web-search                    — 互联网搜索
✓ file-system                   — 文件读写
✓ chrome-devtools               — 浏览器控制
```

---

## Phase 4: 写入配置 + 模板合并

### 4.1 全新写入

首次设置时，按模板结构写入 `{PLUGIN_CONFIG_DIR}/team-profile.md`（路径按平台表解析，见 § 状态检测入口）。模板中所有 `[PLACEHOLDER]` 替换为用户填写值。

### 4.2 模板合并（升级场景）

插件升级后，`config-templates/team-profile.md` 可能新增了配置项。检测流程：

```
1. READ 新模板 (config-templates/team-profile.md)
2. READ 现有用户配置 ({PLUGIN_CONFIG_DIR}/team-profile.md)
3. 按 H2 节逐节对比:
   - 模板中存在但配置中不存在的节 → 标记为"新配置项"
   - 模板和配置中都存在但配置中有 [PLACEHOLDER] → 标记为"待补全"
   - 配置中已填写的字段 → 保留不动
4. 如存在"新配置项"或"待补全"项:
   → "插件升级后新增了以下配置项，需要补充："
   → 逐项引导填写
5. 无新增项 → "无需变更，配置已是最新"
```

### 4.3 MCP 状态记录

在 team-profile.md 的"MCP 集成状态"节记录验证结果：

```markdown
## MCP 集成状态

| MCP 服务器 | 状态 | 版本 | 备注 |
|----------|------|------|------|
| investigation-pdf | ✓ 可用 | v1.7.4 | - |
| sequential-thinking | ✓ 可用 | latest | - |
| 自定义 HTTP 搜索 | ✗ 不可用 | - | 服务端点无响应 |
```

### 4.4 项目上下文文件

在用户的**案件工作目录**（用户运行 `/investigate new` 指向的目录）中，按平台写入对应名称的上下文文件：

| 平台 | 写入文件名 | 内容来源 |
|------|-----------|---------|
| Claude Code | `CLAUDE.md` | `project-templates/default/CLAUDE.md` |
| CodeBuddy   | `CODEBUDDY.md` | `project-templates/default/CODEBUDDY.md` |
| Codex       | `CODEX.md` | `project-templates/default/CODEX.md` |

> **重要：** 在 CodeBuddy 平台**不要**创建 `CLAUDE.md`，应创建 `CODEBUDDY.md`；在 Codex 平台创建 `CODEX.md`。

### 4.5 输出摘要

```
╔══════════════════════════════════════════════════════════════════╗
║              investigation-ontology 配置完成                           ║
╠══════════════════════════════════════════════════════════════════╣
║  组织: XX 集团公司  |  行业: 制造  |  法域: 中国大陆              ║
║  团队: 调查部 (5人)  |  汇报: 审计委员会                          ║
║  通信纪律: 已配置    |  审批流程: 已配置                           ║
║  角色画像: investigator  |  启用技能: 22 个                        ║
║  MCP 集成: 2/3 可用  |  缺失: 自定义搜索服务                       ║
╚══════════════════════════════════════════════════════════════════╝
┌─ 推荐的下一步 ──────────────────────────────────────────────────┐
│  /investigate new    启动第一个案件                              │
│  /help investigation-foundation  了解调查基础方法论               │
└─────────────────────────────────────────────────────────────────┘
```
│  /efio:cold-start  重新配置               │
│  --check-integrations                    检查集成状态            │
└────────────────────────────────────────────────────────────────┘
```

---

## 升级说明（发版注意）

每次发版更新 `config-templates/team-profile.md` 时：

1. **保留模板结构**：所有字段保持 `[PLACEHOLDER]` 标记
2. **新增字段必须标注"影响技能"**：确保 cold-start 能识别并归入正确的合并流程
3. **不修改 config-loader.md**：该契约已覆盖所有场景
4. **用户配置不受影响**：`{PLUGIN_CONFIG_DIR}/*` 不会被插件更新覆盖

---

## Related

- **Skills:** [调查流程与案件管理](../case-management/SKILL.md)、[MCP 能力目录](../mcp-integration/SKILL.md)
- **Config System:** [config-loader.md](../../config-templates/config-loader.md)、[team-profile.md 模板](../../config-templates/team-profile.md)
- **Commands:** `/efio:cold-start`, `--check-integrations`, `--redo`
