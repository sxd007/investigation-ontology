# MCP 注册指南

> 本指南面向调查团队的技术管理员和调查员，说明如何在 investigation-ontology 生态中注册 MCP 服务器。

---

## 1. 注册通道一览

MCP 服务器可通过 **4 个通道**注册，按作用域从大到小：

| # | 通道 | 作用域 | 配置文件位置 | 适用平台 |
|---|------|--------|------------|---------|
| 1 | **用户级** | 当前用户的**所有项目** | `~/.codebuddy/mcp.json`（CodeBuddy）<br>`~/.claude.json`（Claude Code） | CodeBuddy / Claude Code |
| 2 | **项目级** | **单个项目** | 项目根目录 `.mcp.json` | 所有平台 |
| 3 | **插件级** | 插件安装的**所有项目** | `.codex-plugin/mcp.json`（由 `plugin.json` 引用） | 仅 Codex |
| 4 | **CLI 命令** | 取决于 `-s` 参数 | `claude mcp add ...` | Claude Code |

---

## 2. 各通道详解

### 2.1 用户级（推荐用于通用能力）

**配置文件**：
- CodeBuddy：`~/.codebuddy/mcp.json`
- Claude Code：`~/.claude.json`

**特点**：
- 注册一次，当前用户的所有项目自动可用
- 不需要每个项目单独配置
- 适合全局通用的基础能力（OCR、搜索、推理等）

**示例**（`~/.codebuddy/mcp.json`）：

```json
{
  "mcpServers": {
    "paddleOCR-mcp": {
      "url": "http://<ocr-server-host>:8090/mcp",
      "headers": {
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

**当前已注册的 MCP**（示例，实际地址以用户配置为准）：
- `paddleOCR-mcp` — OCR 文档识别（PaddleOCR pp_structurev3）
- `data-query-mcp` — 金融数据查询
- `firecrawl` — 网页抓取与搜索

### 2.2 项目级（推荐用于案件专用能力）

**配置文件**：项目根目录 `.mcp.json`

**特点**：
- 只对该项目（案件）生效
- 通过 `project-templates/default/.mcp.json` 模板在 `/investigate new` 时分发
- 适合案件专用的 MCP（如某个案件的数据库查询、特定数据源）
- 用户独立维护，插件升级不覆盖

**示例**（项目 `.mcp.json`）：

```json
{
  "mcpServers": {
    "case-database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./evidence.db"]
    }
  }
}
```

### 2.3 插件级（仅 Codex）

**配置文件**：
- `.codex-plugin/plugin.json` → `"mcpServers": "./mcp.json"`
- `.codex-plugin/mcp.json`

**特点**：
- 插件安装后自动生效，用户无需操作
- **仅 Codex 平台支持**——Claude Code 和 CodeBuddy 的 `plugin.json` 中 `mcpServers` 为空
- 适合插件自带的基础 MCP（如 PDF 文本提取）

**示例**（`.codex-plugin/mcp.json`）：

```json
{
  "mcpServers": {
    "paddleOCR-mcp": {
      "url": "http://<ocr-server-host>:8090/mcp",
      "headers": {
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

> **注意**：如果 Codex 也需要使用 paddleOCR-mcp，需要在此文件中同步注册。Claude Code 和 CodeBuddy 通过用户级配置（通道 1）已覆盖。

### 2.4 CLI 命令（Claude Code 专属）

**命令格式**：

```bash
# 添加 stdio 类型 MCP（本地进程）
claude mcp add <name> -s user -- npx -y @some/mcp-server

# 添加 HTTP 类型 MCP（远程服务）
claude mcp add <name> -s user --transport http http://<ocr-server-host>:8090/mcp

# 查看已注册的 MCP
claude mcp list

# 移除 MCP
claude mcp remove <name> -s user
```

**`-s` 参数（scope）**：
- `-s user` → 写入 `~/.claude.json`（等同于通道 1）
- `-s project` → 写入项目 `.mcp.json`（等同于通道 2）

**特点**：
- 本质上是对通道 1 和通道 2 的 CLI 封装
- 不需要手动编辑 JSON 文件
- 仅 Claude Code 支持

---

## 3. 两种传输类型

无论通过哪个通道注册，MCP 都支持两种传输方式：

| 类型 | 配置字段 | 说明 | 示例 |
|------|---------|------|------|
| **stdio** | `command` + `args` + `env` | 启动本地子进程，通过标准输入输出通信 | `npx -y @modelcontextprotocol/server-pdf` |
| **HTTP/SSE** | `url` + `headers` | 连接远程 HTTP 服务 | `http://<ocr-server-host>:8090/mcp` |

**选择建议**：
- 有现成 npm 包或本地可执行文件 → 用 stdio
- 部署在服务器上的服务（如 OCR、数据库） → 用 HTTP/SSE

---

## 4. 选择哪个通道？

```
需要注册一个 MCP 服务器
    │
    ├── 这个 MCP 是所有案件都需要的通用能力吗？
    │   ├── 是 → 通道 1：用户级 (~/.codebuddy/mcp.json)
    │   │        例：paddleOCR-mcp、搜索、推理
    │   │
    │   └── 否，只有某个案件需要
    │       └── 通道 2：项目级 (项目 .mcp.json)
    │            例：案件专用数据库、案件专用数据源
    │
    └── 我是 Codex 用户，想让插件自动带上 MCP？
        └── 通道 3：插件级 (.codex-plugin/mcp.json)
```

---

## 5. 当前项目的 MCP 注册状态

### 已注册

| MCP 名称 | 通道 | 传输类型 | 用途 | 推荐使用技能 |
|---------|------|---------|------|------------|
| `paddleOCR-mcp` | 用户级 | HTTP/SSE | OCR 文档识别 | document-parsing |
| `data-query-mcp` | 用户级 | HTTP/SSE | 金融数据查询 | data-analysis |
| `firecrawl` | 用户级 | stdio | 网页抓取与搜索 | investigation-techniques |

### 可选注册（按需）

| MCP 名称 | 推荐通道 | 传输类型 | 用途 | 配置方式 |
|---------|---------|---------|------|---------|
| `investigation-fs` | 项目级 | stdio | 证据文件系统访问 | 需配置目录路径 |
| `brave-search` | 用户级 | stdio | 深度网页搜索 | 需免费 API Key |
| `baidu-map` | 用户级 | stdio | 地理位置分析 | 需百度地图 API Key |
| `baidu-search` | 用户级 | stdio | 中文互联网搜索 | 无需 API Key |

详见 `mcp-configs/mcp-servers.json`。

---

## 6. 注册后的验证

注册完成后，运行以下命令验证 MCP 是否可用：

```
/efio:cold-start --check-integrations
```

或手动验证：
- **HTTP/SSE 类型**：检查服务端点是否可达（`curl <url>`）
- **stdio 类型**：检查命令是否可执行（`npx -y <package> --version`）

---

## 7. 注意事项

- **用户级 vs 项目级优先级**：如果同一 MCP 名称在两个通道都注册了，项目级优先
- **升级不影响**：用户级和项目级配置独立于插件，插件升级不会覆盖
- **安全提醒**：
  - MCP 配置中的 API Key 不应提交到版本控制
  - 涉及敏感数据的 MCP（如案件数据库）应限定访问范围
  - 调查结束后及时撤销案件专用的 MCP 授权
- **跨平台一致性**：如果同一用户在 CodeBuddy 和 Claude Code 之间切换，需要在 `~/.codebuddy/mcp.json` 和 `~/.claude.json` 中分别注册（两份配置不共享）

---

## 相关文档

- [CONNECTORS.md](../CONNECTORS.md) — 连接器生态总览
- [mcp-configs/mcp-servers.json](../mcp-configs/mcp-servers.json) — MCP 能力目录
- [skills/mcp-integration/SKILL.md](../skills/mcp-integration/SKILL.md) — MCP 能力目录（技能视角）
- [docs/ARCHITECTURE_NOTES.md](ARCHITECTURE_NOTES.md) — 跨平台架构设计说明
