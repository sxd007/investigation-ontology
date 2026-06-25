---
description: MCP 配置管理器 — 查看、添加、移除、验证调查环境中可用的 MCP 服务器。与 cold-start-interview Phase 2.5 配套，支持运行期动态调整
---

# /cc-investigation:mcp-config

调查环境 MCP（Model Context Protocol）的后续管理工具。首次配置在 `/cc-investigation:cold-start-interview` 的 Phase 2.5 进行；此命令用于中途增删改查 MCP。

## Usage

```
/cc-investigation:mcp-config                 # 交互式菜单（默认）
/cc-investigation:mcp-config --list         # 列出当前已配置的 MCP
/cc-investigation:mcp-config --add          # 交互式添加新 MCP
/cc-investigation:mcp-config --remove       # 交互式移除 MCP
/cc-investigation:mcp-config --verify       # 验证所有已配置 MCP 的可用性
```

## 使用场景

| 场景 | 命令 |
|------|------|
| 我想看现在用了哪些 MCP | `--list` |
| 我需要启用数据库查询能力（server-sqlite） | `--add` |
| 某个 MCP 故障了，我想暂时禁用它 | `--remove` |
| 我想检查所有 MCP 是否都正常工作 | `--verify` |

## Process

### --list：查看当前配置

读取 `.mcp.json`，展示已配置的 MCP 及其状态：

```
当前已配置的 MCP 服务器：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ investigation-pdf (v1.7.4)
  能力: PDF 文档分析（合同、发票、报告等）
  
✓ sequential-thinking (ready)
  能力: 分步推理（假设推演、逻辑验证）
  
□ server-sqlite (配置中，未验证)
  能力: 数据库查询（SQLite）

✗ 自定义 HTTP 搜索 (连接失败)
  能力: 网络搜索
  故障信息: 服务端点无响应
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
已启用: 3/4  可用: 2/4  故障: 1/4
```

### --add：添加新 MCP

交互式流程：

```
1. 从 mcp-configs/mcp-servers.json 读取可选 MCP 列表
2. 展示"已确认可用的 MCP"（用户还未启用的部分）
3. 用户选择想添加的 MCP（多选）
4. 逐一验证选中 MCP 的可用性：
   npx -y @modelcontextprotocol/server-<name> --version
5. 若验证成功：
   - 添加到 .mcp.json
   - 记录到 team-profile.md 的"MCP 集成状态"表
6. 若验证失败：
   - 询问用户："包不可用，是否保存配置以供后续重试？"
   - 若用户同意，配置保存但标记为"待验证"
```

**交互示例**：

```
> /cc-investigation:mcp-config --add

可添加的新 MCP 能力（从 mcp-configs/mcp-servers.json）：

[1] server-sqlite (已确认包可用)
    → 能力: 数据库查询（SQLite）
    → 调查场景: 交易数据探查、证据库查询
    → 当前状态: 未配置

[2] server-filesystem (已确认包可用)
    → 能力: 文件系统操作（限定目录，需配置根路径）
    → 调查场景: 大规模证据文件检索
    → 当前状态: 未配置

[3] 其他自定义 MCP (需手动输入)
    → 输入自定义 MCP 服务端点（如 HTTP 地址或本地进程）

选择想添加的 MCP (输入序号，逗号分隔，如 "1,2")：
> 1

验证中 ... npx -y @modelcontextprotocol/server-sqlite --version
✓ server-sqlite (v1.0.0) 已可用

准备添加:
  ✓ server-sqlite (v1.0.0)

确认添加？ (yes/no)
> yes

✓ 配置已保存

当前已启用的 MCP:
  ✓ investigation-pdf (v1.7.4)
  ✓ sequential-thinking (ok)
  ✓ server-sqlite (v1.0.0)  ← 新增

已同步到 .mcp.json 和 team-profile.md
```

### --remove：移除 MCP

交互式流程：

```
1. 读取 .mcp.json，展示已配置的 MCP
2. 用户选择想移除的 MCP（多选或单选）
3. 确认用户的选择（防止误删）
4. 从 .mcp.json 中删除
5. 同时更新 team-profile.md
```

**交互示例**：

```
> /cc-investigation:mcp-config --remove

当前已配置的 MCP：

[1] investigation-pdf (v1.7.4)
[2] sequential-thinking (ok)
[3] server-sqlite (v1.0.0)
[4] 自定义 HTTP 搜索 (连接失败)

选择想移除的 MCP (序号，逗号分隔)：
> 4

准备移除:
  ✗ 自定义 HTTP 搜索

移除后剩余的 MCP:
  ✓ investigation-pdf (v1.7.4)
  ✓ sequential-thinking (ok)
  ✓ server-sqlite (v1.0.0)

确认移除？ (yes/no)
> yes

✓ 已移除

当前已启用的 MCP:
  ✓ investigation-pdf (v1.7.4)
  ✓ sequential-thinking (ok)
  ✓ server-sqlite (v1.0.0)
```

### --verify：验证所有 MCP

逐一测试已配置的 MCP 是否可用：

```
验证中...

✓ investigation-pdf (v1.7.4)
  → npx -y @modelcontextprotocol/server-pdf --version
  → 响应: PDF Server v1.7.4

✓ sequential-thinking
  → 已内置，无需 npx

✗ server-sqlite (v1.0.0)
  → 命令: npx -y @modelcontextprotocol/server-sqlite --version
  → 错误: ENOTFOUND - 包不可用（本地 npm 仓库中不存在）
  → 建议: 检查网络连接，或 npm install -g @modelcontextprotocol/server-sqlite

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
验证结果: 2/3 可用，1/3 故障

修复建议:
  [ ] 重新安装 server-sqlite: npm install -g @modelcontextprotocol/server-sqlite
  [ ] 移除故障的 MCP: /cc-investigation:mcp-config --remove
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

是否自动更新 team-profile.md 的故障记录？(yes/no)
> yes

✓ team-profile.md 已更新
```

## 完成后

MCP 配置变更后，立即生效，无需重启。后续调查工作会自动使用更新后的 MCP 列表。

## 注意

- 与 `/cc-investigation:profile` 命令形成对称：profile 管理**技能配置**，mcp-config 管理 **MCP 能力**
- MCP 配置存储在两处（保持一致）：
  - `.mcp.json` - 具体的 MCP 启动命令和参数
  - `team-profile.md` 的"MCP 集成状态"表 - 人类可读的状态记录

## 相关

- **首次配置:** [cold-start-interview](./cold-start-interview.md) Phase 2.5
- **技能配置:** [profile](./profile.md) (计划中)
- **参考文档:** [skills/mcp-integration/SKILL.md](../skills/mcp-integration/SKILL.md)
- **配置源:** [mcp-configs/mcp-servers.json](../mcp-configs/mcp-servers.json)
