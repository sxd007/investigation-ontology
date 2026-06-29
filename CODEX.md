# investigation-ontology (Codex) — 使用和开发指南

本文档指导 Codex 开发者和用户如何使用和扩展 investigation-ontology 插件。

---

## 一、Codex 集成概述

investigation-ontology 是一个跨平台插件，在 Codex 中通过 `.codex-plugin/plugin.json` 进行集成。

该插件为反舞弊调查提供：
- 完整的调查方法论和技能体系
- 案件生命周期管理和质量控制
- 证据链管理和底稿标准
- 访谈分析和数据分析工具
- 20+ 个场景舞弊调查指南

## 二、Codex 特定配置

### 入口文件

```
.codex-plugin/
├── plugin.json           # Codex 插件清单
└── PLUGIN_SCHEMA_NOTES.md  # Schema 踩坑记录
```

### Hooks 配置

Codex 使用 `.codex-plugin/hooks.json` 文件（与 Claude Code / CodeBuddy 隔离）：

```
.codex-plugin/hooks.json  # Codex 专用目录
```

环境变量：`${INVESTIGATION_ONTOLOGY_ROOT}` 用于脚本路径引用。

### MCP 服务器

Codex 版本在 `.codex-plugin/` 目录下包含 `mcp.json` 配置，自动加载以下 MCP 服务器：

```json
{
  "mcpServers": {
    "investigation-pdf": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-pdf"],
      "description": "PDF 文档分析"
    }
  }
}
```

配置文件路径：`/.codex-plugin/mcp.json`（由 `plugin.json` 的 `mcpServers: "./mcp.json"` 字段引用）。

这在 Codex 中提供 PDF 提取和分析能力，用于证据文件处理。

---

## 三、技能调用

使用显式技能引用来触发特定领域的知识：

```text
$investigation-foundation    # 假设检验、证据推理、认知偏差控制
$case-management             # 案件生命周期、质量控制、团队协作
$evidence-management         # 采保管业、可采性评估、底稿标准
$interview-analysis          # 访谈策划、陈述分析（SCAN）、笔录评估
$data-analysis               # 审计分析、异常检测、趋势分析
$writing-reporting           # 底稿写作、报告撰写、可视化呈现
$fraud-classification        # 舞弊类型路由和信号识别
$fraud-*                     # 场景特定技能（fraud-channel、fraud-procurement 等）
$ontology                    # 案件数据模型、Object/Link/Action 定义
```

## 四、命令调用

使用插件命令进行确定性工作流：

```text
/efio:investigate new      # 启动新案件
/efio:investigate continue # 继续现有案件
/efio:evidence add         # 添加证据
/efio:interview plan       # 策划访谈
/efio:report draft         # 起草报告
/efio:case status          # 查看案件状态
/efio:analyze              # 数据分析
/efio:fraud-type           # 舞弊类型识别
/efio:working-paper        # 底稿管理
```

命令文件存储在 `commands/` 目录中，描述预期输入、需要读取或写入的文件、相关技能和验证检查。

---

## 五、项目设置

为新的调查工作空间设置该插件：

1. **复制项目模板**：将 `project-templates/default/AGENTS.md` 复制到工作空间根目录

2. **创建目录结构**：
   ```
   cases/                    # 案件目录
   templates/                # 模板库
   evidence/                 # 证据库
   docs/                     # 补充文档
   ```

3. **初始化案件**：
   ```
   /efio:investigate new
   ```
   或使用冷启动向导：
   ```
   /efio:cold-start
   ```

4. **配置团队概览**：在首次运行时按提示配置团队背景、证据策略和集成选项。

---

## 六、跨平台开发

### 共享内容

以下内容在三个平台（Claude Code、CodeBuddy、Codex）间完全相同：

- `skills/` — 所有技能定义
- `agents/` — 所有代理定义
- `commands/` — 所有命令定义（除个别平台差异）
- `rules/` — 所有规范和标准
- `schemas/` — 数据模型 schema
- `docs/` — 文档和参考资料

### Codex 特定差异

| 方面 | 处理方式 |
|------|---------|
| **Hooks 位置** | `.codex-plugin/hooks.json`（Codex 专用目录隔离） |
| **Hook 脚本语言** | 支持 shell 脚本（而非 Node.js） |
| **MCP 配置** | `.codex-plugin/mcp.json`（Codex 专用目录隔离） |
| **Plugin.json 结构** | 包含 `interface` 字段用于 UI 定制 |

### 添加新技能

添加新的 `fraud-<domain>` 技能时，需要在跨平台维护中：

1. 在 `skills/fraud-xxx/` 创建技能文件
2. 在 `manifests/install-modules.json` 中注册，确保 `targets` 包含：
   ```json
   "targets": ["claude", "codebuddy", "codex", "claude-project", "codebuddy-project", "codex-project"]
   ```
3. 在 `manifests/install-profiles.json` 中将技能加入相关 profile
4. 更新 `skills/fraud-classification/SKILL.md` 中的技能索引表
5. 更新 `agents/fraud-type-classifier.md` 中的相关引用

---

## 七、验证和测试

### 运行验证脚本

在修改插件结构后，运行验证脚本：

```bash
# PowerShell (Windows)
scripts/validate-pack.ps1

# Bash (macOS / Linux)
scripts/validate-pack.sh
```

### 检查本体引用

修改 `global_ontology/entities/` 或 `global_ontology/relations/` 后，运行：

```bash
# PowerShell
scripts/validate-ontology-action.ps1

# Bash
scripts/check-ontology-ref.sh
```

这些脚本验证：
- 文件命名规范
- 本体引用完整性
- Schema 合规性
- 跨引用一致性

---

## 八、常见问题

### 如何在 Codex 中使用 PDF 提取？

插件自带 `@modelcontextprotocol/server-pdf` MCP 服务器，自动加载。使用 MCP 工具或让 Codex 直接处理 PDF 文件即可。

### 如何自定义 MCP 服务器？

编辑 `.codex-plugin/mcp.json` 文件添加或修改 MCP 服务器配置。Codex 会自动检测并加载。

### Hooks 在 Codex 中如何工作？

Hooks 通过根目录的 `hooks.json` 定义，包括：
- **SessionStart**: 插件加载时运行（显示案件状态）
- **PreToolUse**: 写入文件前运行（验证命名规范）
- **PostToolUse**: 写入文件后运行（检查本体引用）

Hook 脚本支持 shell 命令和路径引用。

---

## 九、相关资源

- `DEVELOPMENT_GUIDE.md` — 架构设计、跨平台维护、构建发布的完整指南
- `CLAUDE.md` — Claude Code 版本开发指南
- `CODEBUDDY.md` — CodeBuddy 版本开发指南
- `manifests/install-modules.json` — 模块注册表
- `manifests/install-profiles.json` — 安装配置集
- `.codex-plugin/plugin.json` — Codex 插件清单
- `.codex-plugin/hooks.json` — Codex hooks 配置（Codex 专用）
- `.codex-plugin/mcp.json` — Codex MCP 服务器配置（Codex 专用）
- `project-templates/default/` — 项目模板

