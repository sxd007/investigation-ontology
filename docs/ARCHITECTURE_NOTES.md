# investigation-ontology 跨平台架构设计说明

## 1. 文件分布与平台隔离

### 1.1 `.mcp.json` / `mcp.json` 文件位置

**存在位置：**
- `/.codex-plugin/mcp.json` —— Codex 插件配置（系统级，仅 Codex 安装时获得）
- `/project-templates/default/.mcp.json` —— 用户项目模板（分发用，用户独立维护）

**为什么这样分布？**

| 文件位置 | 平台 | 用途 | 触发时机 | 生命周期 |
|---------|------|------|---------|--------|
| `/.codex-plugin/mcp.json` | Codex | Codex 运行时发现 MCP 服务器 | 插件安装后立即生效 | 插件生命周期 |
| `/project-templates/default/.mcp.json` | 所有平台 | 分发到调查员项目的模板副本 | 用户运行 `/investigate new` 创建项目时 | 项目生命周期（用户独立维护） |

**为什么 `mcp.json` 在 `.codex-plugin/` 下？**
- Claude Code 和 CodeBuddy 不需要 MPC 服务器（`mcpServers: {}` 为空）
- MPC 配置只在 Codex 的 `plugin.json` 中声明：`"mcpServers": "./mcp.json"`
- 将文件放在 `.codex-plugin/` 下确保其他平台的安装器完全看不到它，避免不必要的分发

**一致性维护：**
- 两个文件应保持 `mcpServers` 内容一致
- 当添加新的 MCP 服务器时，务必同步更新两处
- 变更检查清单：
  ```
  ✓ 更新 /.codex-plugin/mcp.json
  ✓ 更新 /project-templates/default/.mcp.json
  ✓ 验证两文件 mcpServers 字段完全相同
  ```

---

## 2. Hooks 环境变量与脚本语言

### 2.1 三平台 Hooks 配置差异

| 方面 | Claude Code | CodeBuddy | Codex |
|------|-----------|-----------|-------|
| **配置文件位置** | `.claude-plugin/hooks.json` | `.codebuddy-plugin/hooks.json` | `.codex-plugin/hooks.json` |
| **环境变量** | `${CLAUDE_PLUGIN_ROOT}` | `${CODEBUDDY_PLUGIN_ROOT}` | `${INVESTIGATION_ONTOLOGY_ROOT:-$(pwd)}` |
| **脚本语言** | Node.js (.mjs) | Node.js (.mjs) | Shell Script (.sh) |
| **脚本路径** | `scripts/run-hook.mjs` | `scripts/run-hook.mjs` | `scripts/validate-ontology-action.sh` / `check-ontology-ref.sh` |

### 2.2 为什么设计不同？

**Claude Code & CodeBuddy：**
- 都使用 Node.js 脚本（`run-hook.mjs`）以实现跨平台一致性
- 环境变量由各平台独立注入（`${CLAUDE_PLUGIN_ROOT}` vs `${CODEBUDDY_PLUGIN_ROOT}`）
- 配置文件放在各自的 `.claude-plugin/` 和 `.codebuddy-plugin/` 目录下，实现隔离
- 脚本内部逻辑完全相同，通过环境变量适配不同平台

**Codex：**
- 使用原生 Shell 脚本，充分利用 Codex 的 shell 执行能力
- 环境变量 `${INVESTIGATION_ONTOLOGY_ROOT}` 由插件注入，或回退到 `$(pwd)`
- 配置文件在 `.codex-plugin/` 目录下
- 脚本可以直接使用 bash/sh 特性，无需 Node.js 运行时

**隔离机制：** 所有 hooks 配置都在各自的 `.xxx-plugin/` 目录中，安装器只会分发该平台对应的 hooks.json

### 2.3 维护指南

**三个 Hooks 文件的功能等价性：**

所有三个文件应实现相同的业务逻辑流程，只是脚本/环境变量实现不同：

```
SessionStart hook:
├── 读取团队配置文件
├── 统计活跃案件数
├── 返回状态提示（配置完成/首次使用/案件数量）

PreToolUse hook (Write|Edit matcher):
├── 提醒文件命名规范
├── 验证本体 Action 前置条件

PostToolUse hook (Write|Edit matcher):
├── 检查 ontology_ref 引用完整性
```

**变更时的同步检查清单：**

添加新的 hook 规则时：
```
✓ 在 hooks/hooks.json 中用 Node.js 实现
✓ 在 hooks/codebuddy-hooks.json 中用 Node.js 实现（`${CODEBUDDY_PLUGIN_ROOT}` 替换）
✓ 在 hooks.json 中用 Shell 脚本实现
✓ 测试三个平台的行为一致性
✓ 更新本文档的"功能等价性"段落
```

修改现有 hook 逻辑时：
```
✓ 修改 scripts/run-hook.mjs 的对应命令处理
✓ 修改 scripts/validate-ontology-action.sh 的对应逻辑
✓ 修改 scripts/check-ontology-ref.sh 的对应逻辑
✓ 在三个 hooks 文件中同步 timeout / statusMessage 等参数
✓ 验证输出格式一致（日志前缀、错误消息等）
```

---

## 3. 插件入口与配置引用关系

### 3.1 配置链路

```
Claude Code 用户安装
    ↓
.claude-plugin/plugin.json
    ├─ skills: "./skills/"
    ├─ commands: "./commands/"
    ├─ hooks: "./hooks/hooks.json"
    │         ↓
    │    scripts/run-hook.mjs 
    │    (环境变量: ${CLAUDE_PLUGIN_ROOT})
    └─ agents: "./agents/"  [不支持，字段忽略]

CodeBuddy 用户安装
    ↓
.codebuddy-plugin/plugin.json
    ├─ skills: "./skills/"
    ├─ commands: "./commands/"
    ├─ hooks: "./hooks/codebuddy-hooks.json"
    │         ↓
    │    scripts/run-hook.mjs
    │    (环境变量: ${CODEBUDDY_PLUGIN_ROOT})
    ├─ agents: "./agents/"
    └─ mcpServers: {} [空，表示不使用]

Codex 用户安装
    ↓
.codex-plugin/plugin.json
    ├─ skills: "./skills/"
    ├─ commands: "./commands/"
    ├─ hooks: "./hooks.json"
    │         ↓
    │    scripts/validate-ontology-action.sh
    │    scripts/check-ontology-ref.sh
    │    (环境变量: ${INVESTIGATION_ONTOLOGY_ROOT}/${HOME})
    ├─ mcpServers: "./.mcp.json"
    │              ↓
    │         investigation-pdf
    └─ interface: {...}
```

### 3.2 共享内容原则

以下目录/文件所有三平台共享，安装器负责根据 `manifests/install-modules.json` 中的 `targets` 字段决定分发：

- `/skills/` — 技能定义
- `/commands/` — 斜杠命令
- `/agents/` — 子代理定义
- `/rules/` — 调查规则
- `/docs/` — 文档
- `/schemas/` — 数据架构
- `/config-templates/` — 配置模板

---

## 4. 新增或修改内容的检查清单

### 4.1 添加新技能/命令/代理时

```
[ ] 创建对应文件到 skills/ / commands/ / agents/
[ ] 添加到 manifests/install-modules.json（包含正确的 targets）
[ ] 如果涉及新的 MCP 调用，更新 /.mcp.json
[ ] 如果新增 Codex MCP，同时更新 /project-templates/default/.mcp.json
[ ] 更新 DEVELOPMENT_GUIDE.md
```

### 4.2 修改 Hook 逻辑时

```
[ ] 明确定义新增/修改的业务逻辑
[ ] 在 scripts/run-hook.mjs 中实现 Node.js 版本
[ ] 在 scripts/validate-ontology-action.sh 中实现 Shell 版本
[ ] 在 scripts/check-ontology-ref.sh 中实现 Shell 版本（如适用）
[ ] 更新三个 hooks 配置文件（参数/timeout/statusMessage）
[ ] 手工测试三个平台的行为一致性
[ ] 本文档添加变更日志
```

### 4.3 更新环境变量时

```
[ ] 确认新变量由各平台正确注入
[ ] 更新所有 hooks 配置文件中的变量引用
[ ] 更新脚本中的变量使用
[ ] 验证后备方案（如 ${VAR:-default}）在所有平台生效
```

---

## 5. 维护历史与已知问题

### 5.1 版本 1.0 已解决的问题

| 问题 | 状态 | 解决方案 |
|------|------|---------|
| CodeBuddy hooks 环境变量混淆 | ✅ 已解决 | 创建独立的 `hooks/codebuddy-hooks.json`，使用 `${CODEBUDDY_PLUGIN_ROOT}` |
| 缺少 repo-agent targets | ✅ 已解决 | 为 4 个核心模块添加 `"repo-agent"` target |
| Codex 命令规范说明缺失 | ✅ 已解决 | 创建 `commands/_conventions.md` |

### 5.2 当前已知限制

- **MCP 服务器更新延迟**：修改 `.mcp.json` 后，Codex 可能需要重启才能生效
- **Shell 脚本跨平台兼容性**：Codex 的 shell hooks 在 Windows 上需要 Git Bash 或 WSL 支持
- **Node.js 运行时依赖**：Claude Code / CodeBuddy 的 hooks 依赖 Node.js 可用性

### 5.3 未来改进项

- [ ] 统一 hooks 输出格式标准（所有平台的日志前缀、错误消息）
- [ ] 创建 hooks 集成测试套件（验证三平台功能等价性）
- [ ] 文档化 MCP 服务器扩展指南
