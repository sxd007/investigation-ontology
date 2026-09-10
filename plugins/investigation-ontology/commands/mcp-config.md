---
description: MCP 配置管理器 — 查看、添加、移除、验证调查环境中可用的 MCP 服务器。与 cold-start Phase 2.5 配套，支持运行期动态调整
---

# /efio:mcp-config

调查环境 MCP 的后续管理工具。首次配置在 `/efio:cold-start` Phase 2.5 进行；此命令用于中途增删改查。

## Usage

```
/efio:mcp-config                 # 交互式菜单（默认）
/efio:mcp-config --list         # 列出当前已配置的 MCP
/efio:mcp-config --add          # 交互式添加新 MCP
/efio:mcp-config --remove       # 交互式移除 MCP
/efio:mcp-config --verify       # 验证所有已配置 MCP 的可用性
```

## 使用场景

| 场景 | 命令 |
|------|------|
| 我想看现在用了哪些 MCP | `--list` |
| 我需要启用新能力 | `--add` |
| 某个 MCP 故障了，想暂时禁用 | `--remove` |
| 检查所有 MCP 是否正常 | `--verify` |

## Process

### --list

读取用户级 (`~/.codebuddy/mcp.json`) 和项目级 (`.mcp.json`) 配置，按注册通道分组展示 MCP 及状态。

```
用户级 (~/.codebuddy/mcp.json):
✓ paddleOCR-mcp — OCR 文档识别
项目级 (.mcp.json):
□ investigation-fs — 证据文件系统（未验证）
用户级: 1/1 可用    项目级: 0/1 可用
```

### --add

1. 检测当前已注册的 MCP（用户级 + 项目级）
2. 从 `mcp-configs/mcp-servers.json` 展示尚未配置的可选项
3. 用户选择 MCP → **选择注册通道**（用户级 / 项目级）
4. 验证可用性 → 写入对应配置文件 → 记录到 team-profile.md

```
选择注册通道 — baidu-search:
  [1] 用户级（所有项目可用）← 推荐
  [2] 项目级（仅当前项目）
> 1
✓ 已写入 ~/.codebuddy/mcp.json
```

> 注册通道选择策略见 `docs/mcp注册指南.md` 第 4 节。

### --remove

读取用户级和项目级配置 → 用户选择 → 从对应配置文件删除 → 更新 team-profile.md。

```
[1] paddleOCR-mcp (用户级)
[2] investigation-fs (项目级)
> 2
✓ 已从 .mcp.json 移除
```

### --verify

逐一测试：HTTP/SSE 类型检查端点可达性，stdio 类型检查命令可执行性。结果按用户级 / 项目级分组展示，故障项给出修复建议。

```
✓ paddleOCR-mcp — pp_structurev3 可用
✗ investigation-fs — ECONNREFUSED，建议检查服务端点
验证结果: 1/2 可用
```

## 完成后

MCP 配置变更后立即生效，无需重启。

## 注意

- 与 `/efio:profile` 对称：profile 管理技能配置，mcp-config 管理 MCP 能力
- MCP 配置存储在三个位置：用户级 (`~/.codebuddy/mcp.json`)、项目级 (`.mcp.json`)、team-profile.md 集成状态表

## 相关

- **首次配置:** [cold-start](./cold-start.md) Phase 2.5
- **详细流程:** [skills/cold-start/references/mcp-configuration.md](../skills/cold-start/references/mcp-configuration.md)
- **注册指南:** [docs/mcp注册指南.md](../docs/mcp注册指南.md)
- **配置源:** [mcp-configs/mcp-servers.json](../mcp-configs/mcp-servers.json)
