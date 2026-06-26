# investigation-ontology (CodeBuddy) — 插件开发指南

本文件是本仓库（investigation-ontology CodeBuddy 版本）的**开发者指南**，指导 AI 协助开发者维护和扩展本插件。

**这不是用户指南。** 用户指南位于 `project-templates/default/CODEBUDDY.md`，分发到调查员的案件项目中使用。

---

## 一、项目总览

investigation-ontology 是一个跨平台插件，支持 Claude Code、CodeBuddy 和 Codex 三个平台，为反舞弊调查提供技能体系、命令入口和专项代理。

本文档特别针对 **CodeBuddy 版本** 的开发和维护。

### 平台入口

- **Claude Code**: `.claude-plugin/plugin.json`
- **CodeBuddy**: `.codebuddy-plugin/plugin.json`  
- **Codex**: `.codex-plugin/plugin.json`

### 分发机制

用户通过各平台的安装器安装时，读取 `manifests/install-modules.json` 中每个模块的 `paths` 字段来定位分发文件。**根部 CODEBUDDY.md 不在任何模块的 paths 中，不会被分发。**

### 开发者 vs 用户 上下文隔离

| 文件 | 谁读 | 作用 |
|------|------|------|
| `CLAUDE.md` | Claude Code 开发者 + AI | Claude 版插件开发指南 |
| `CODEBUDDY.md`（本文件） | CodeBuddy 开发者 + AI | CodeBuddy 版插件开发指南 |
| `CODEX.md` | Codex 开发者 + AI | Codex 版插件开发指南 |
| `DEVELOPMENT_GUIDE.md` | 人类开发者 | 架构说明、构建方式（跨平台） |
| `README.md` | GitHub 访客 | 项目简介、多平台安装说明 |
| `project-templates/default/CODEBUDDY.md` | 调查员 + AI | 调查案件操作指南（分发后） |

---

> 完整目录结构及架构分类说明见 [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md#三目录结构)

---

## 二、CodeBuddy 特定配置

### 入口文件

```
.codebuddy-plugin/
├── plugin.json           # CodeBuddy 插件清单
└── PLUGIN_SCHEMA_NOTES.md  # Schema 踩坑记录
```

### hooks 配置

CodeBuddy 使用 `hooks/codebuddy-hooks.json`（独立于 Claude Code 的 `hooks/hooks.json`）：

```json
{
  "hooks": {
    "SessionStart": [...],
    "PreToolUse": [...],
    "PostToolUse": [...]
  }
}
```

**重要：** 环境变量是 `${CODEBUDDY_PLUGIN_ROOT}` 而非 `${CLAUDE_PLUGIN_ROOT}`。两者是平台各自注入的运行时变量，不能混用。

### MCP 配置

CodeBuddy 不使用额外的 MCP 配置（与 Claude Code 相同）。

---

## 三、开发任务 SOP

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

注意：`targets` 应包含所有三个平台的变种。

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

`project-templates/default/CODEBUDDY.md` 是分发到调查项目的用户指南，其技能表、命令表需要同步更新。

---

## 四、跨平台维护

### 共享内容

以下目录在三个平台间完全相同：

- `skills/` — 所有技能定义
- `agents/` — 所有代理定义
- `commands/` — 所有命令定义
- `rules/` — 所有规范文件
- `schemas/` — 数据模型 schema
- `docs/` — 文档和参考资料

### 平台差异

| 方面 | Claude Code | CodeBuddy | Codex |
|------|-----------|-----------|-------|
| **入口** | `.claude-plugin/plugin.json` | `.codebuddy-plugin/plugin.json` | `.codex-plugin/plugin.json` |
| **Hooks 位置** | `hooks/hooks.json` | `hooks/hooks.json` | `hooks.json` (根目录) |
| **Hook 环境变量** | `${CLAUDE_PLUGIN_ROOT}` | `${CODEBUDDY_PLUGIN_ROOT}` | 壳命令 (无固定变量) |
| **MCP 配置** | 不使用 | 不使用 | `.mcp.json` |
| **Plugin.json 差异** | 基础格式 | 包含 agents 字段 | 包含 interface 字段 |

### 更新流程

修改共享内容（如技能文件）时：

1. 在主分支修改文件
2. 确保 `install-modules.json` 中的 `targets` 包含所有三个平台
3. 每个平台的用户会通过各自的 marketplace 自动获得更新
4. 版本通过 Git tag 统一管理（一个 tag 供三个平台使用）

---

## 五、验证检查清单

修改后请确认：

- [ ] 共享文件（skills/ 等）不包含平台特定代码
- [ ] `manifests/install-modules.json` 的 targets 包含所有三个平台的变种
- [ ] 如果添加新命令，检查 `.codebuddy-plugin/plugin.json` 是否有对应的 `commands` 引用
- [ ] Hooks 中的环境变量已根据平台调整（本文档中已处理）
- [ ] 如有 MCP 需求，仅在 `.codex-plugin/plugin.json` 中配置
- [ ] `project-templates/default/` 中的用户文档已同步

---

## 六、相关资源

- `DEVELOPMENT_GUIDE.md` — 架构设计、插件扩展、构建发布的完整指南
- `CLAUDE.md` — Claude Code 版本开发指南
- `CODEX.md` — Codex 版本开发指南
- `manifests/install-modules.json` — 模块注册表（必读）
- `manifests/install-profiles.json` — 安装配置集
- `project-templates/default/CODEBUDDY.md` — 用户指南（分发物）

