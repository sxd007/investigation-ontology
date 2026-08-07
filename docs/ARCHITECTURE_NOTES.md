# investigation-ontology 跨平台架构设计说明

> **⚠️ 本文档为补充参考资料。所有开发方法论以 [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md) 为准。**
> 最后更新：2026-08-07（修正 hooks 位置与实际文件对齐；Claude Code / Codex 指针已修复）

---

## 1. 文件分布与平台隔离

### 1.1 `.mcp.json` / `mcp.json` 文件位置

**存在位置：**
- `.codex-plugin/mcp.json` — Codex 插件配置（由 `plugin.json` `mcpServers` 字段引用）
- `project-templates/default/.mcp.json` — 用户项目模板（分发用，用户独立维护）

**为什么这样分布？**

| 文件位置 | 平台 | 用途 | 触发时机 | 生命周期 |
|---------|------|------|---------|--------|
| `.codex-plugin/mcp.json` | Codex | Codex 运行时发现 MCP 服务器 | 插件安装后立即生效 | 插件生命周期 |
| `project-templates/default/.mcp.json` | 所有平台 | 分发到调查员项目的模板副本 | 用户创建项目时 | 项目生命周期 |

**一致性维护：**
- 两个文件应保持 `mcpServers` 内容一致
- 添加新 MCP 服务器时务必同步更新两处

---

## 2. Hooks 环境变量与脚本语言

### 2.1 三平台 Hooks 配置差异（实际文件位置）

| 方面 | Claude Code | CodeBuddy | Codex |
|------|-----------|-----------|-------|
| **配置文件位置** | `.claude-plugin/hooks.json` | `hooks/hooks.json` | `.codex-plugin/hooks.json` |
| **plugin.json hooks 指针** | `"./.claude-plugin/hooks.json"` ✅ | `"./hooks/hooks.json"` ✅ | `"./.codex-plugin/hooks.json"` ✅ |
| **环境变量** | `${CLAUDE_PLUGIN_ROOT}` | `${CODEBUDDY_PLUGIN_ROOT}` | `${INVESTIGATION_ONTOLOGY_ROOT:-$(pwd)}` |
| **脚本语言** | Node.js (.mjs) | Node.js (.mjs) | Shell Script (.sh) |

> 2026-08-07 已修复：三个平台的 `plugin.json` hooks 指针均已指向实际存在的 hooks 文件。历史问题记录见 `docs/development-reports/2026-07-22-codex-plugin-compliance-report.md`。

### 2.2 为什么设计不同？

**Claude Code & CodeBuddy：**
- 都使用 Node.js 脚本（`scripts/run-hook.mjs`）以实现跨平台一致性
- 环境变量由各平台独立注入
- 脚本内部逻辑完全相同，通过环境变量适配不同平台

**Codex：**
- 使用原生 Shell 脚本
- 环境变量 `${INVESTIGATION_ONTOLOGY_ROOT}` 由插件注入，或回退到 `$(pwd)`

**隔离机制**：三个平台各使用独立的 hooks 文件，安装器只分发该平台对应的部分。

### 2.3 维护指南

**修改 hooks 逻辑时的同步清单：**
```
✓ 修改 scripts/run-hook.mjs 的对应命令处理（Claude + CodeBuddy）
✓ 修改 scripts/validate-ontology-action.sh 的对应逻辑（Codex）
✓ 修改 scripts/check-ontology-ref.sh 的对应逻辑（Codex）
✓ 在三个 hooks 文件中同步 timeout / statusMessage 等参数
✓ 验证输出格式一致
```

**修改 hooks 位置/指针时务必同步：**
```
✓ 更新对应平台的 plugin.json 中的 hooks 字段
✓ 确认指针指向的文件实际存在（相对插件根解析）
✓ 更新本文件 §2.1 和 §3.1 的表格
✓ 更新 DEVELOPMENT_GUIDE.md §4.0 平台文件清单
```

---

## 3. 插件入口与配置引用关系

### 3.1 实际配置链路

```
Claude Code
    ↓
.claude-plugin/plugin.json
    ├─ skills: "./skills/"
    ├─ commands: "./commands/"
    ├─ hooks: "./.claude-plugin/hooks.json"   ✅
    │         ↓
    │    .claude-plugin/hooks.json
    │    scripts/run-hook.mjs
    │    (环境变量: ${CLAUDE_PLUGIN_ROOT})
    └─ mcpServers: {}

CodeBuddy
    ↓
.codebuddy-plugin/plugin.json
    ├─ hooks: "./hooks/hooks.json"   ✅
    │         ↓
    │    hooks/hooks.json
    │    scripts/run-hook.mjs
    │    (环境变量: ${CODEBUDDY_PLUGIN_ROOT})
    ├─ agents: "./agents/"
    └─ mcpServers: {}

Codex
    ↓
.codex-plugin/plugin.json
    ├─ skills: "./skills/"
    ├─ hooks: "./.codex-plugin/hooks.json"   ✅
    │         ↓
    │    .codex-plugin/hooks.json
    │    scripts/validate-ontology-action.sh
    │    scripts/check-ontology-ref.sh
    │    (环境变量: ${INVESTIGATION_ONTOLOGY_ROOT})
    ├─ mcpServers: "./.codex-plugin/mcp.json"   ✅
    │         ↓
    │    .codex-plugin/mcp.json
    └─ interface: {...}
```

### 3.2 共享内容原则

以下目录/文件所有三平台共享，安装器根据 `manifests/install-modules.json` 中的 `targets` 字段决定分发：
- `skills/` · `commands/` · `agents/` · `rules/` · `docs/` · `schemas/` · `config-templates/`

---

## 4. 新增或修改内容的检查清单

### 4.1 添加新技能/命令/代理

```
[ ] 创建对应文件到 skills/ / commands/ / agents/
[ ] 添加到 manifests/install-modules.json（包含正确的 targets）
[ ] 如果涉及新的 MCP 调用，更新 .codex-plugin/mcp.json
[ ] 同步更新 project-templates/default/.mcp.json
[ ] 更新 DEVELOPMENT_GUIDE.md
```

### 4.2 修改 Hook 逻辑

```
[ ] 明确定义新增/修改的业务逻辑
[ ] 在 scripts/run-hook.mjs 中实现（Claude + CodeBuddy）
[ ] 在 scripts/*.sh 中实现（Codex）
[ ] 在三个 hooks 文件中同步参数
[ ] 测试三个平台的行为一致性
```

### 4.3 更新环境变量

```
[ ] 确认新变量由各平台正确注入
[ ] 更新所有 hooks 配置文件中的变量引用
[ ] 更新脚本中的变量使用
[ ] 验证后备方案在所有平台生效
```

---

## 5. 维护历史与已知问题

### 5.1 当前已知限制

- **Shell 脚本跨平台兼容性**：Codex 的 shell hooks 在 Windows 上需要 Git Bash 或 WSL 支持
- **Node.js 运行时依赖**：Claude Code / CodeBuddy 的 hooks 依赖 Node.js 可用性
- **Codex 组件位于 `.codex-plugin/` 内**：与 Codex 官方"`.codex-plugin/` 只放 plugin.json"的规范存在结构性冲突（hooks/mcp.json 实际在 `.codex-plugin/` 内）。当前通过显式指针指向实际文件解决加载问题，但未完全消除规范冲突。详见 `docs/development-reports/2026-07-22-codex-plugin-compliance-report.md`。

### 5.2 修复历史

- **2026-08-07**：修复 Claude Code / Codex hooks 指针（`./hooks.json` → `./.claude-plugin/hooks.json` / `./.codex-plugin/hooks.json`）
- **2026-08-07**：修复 Codex MCP 指针（`./mcp.json` → `./.codex-plugin/mcp.json`）

### 5.3 未来改进项

- [ ] 评估将 Codex hooks/mcp.json 迁出 `.codex-plugin/` 以完全消除规范冲突
- [ ] 统一 hooks 输出格式标准
- [ ] 创建 hooks 集成测试套件
