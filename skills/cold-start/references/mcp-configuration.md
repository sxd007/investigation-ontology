# MCP 环境配置详细流程

> 本文档是 cold-start Phase 2.5 和 `/efio:mcp-config` 命令的详细参考。
> MCP 注册通道的完整说明见 `docs/mcp注册指南.md`。

---

## 1. 检查已有配置

检测用户级和项目级的 MCP 配置，展示当前状态：

```
检测 MCP 配置:
  ├── 用户级: ~/.codebuddy/mcp.json (CodeBuddy) / ~/.claude.json (Claude Code)
  │   → 读取已注册的 MCP 服务器列表
  │
  └── 项目级: <项目根目录>/.mcp.json
      → 读取已注册的 MCP 服务器列表
```

**展示示例**：

```
当前 MCP 配置状态：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用户级（所有项目可用）:
  ✓ paddleOCR-mcp     — OCR 文档识别（PaddleOCR pp_structurev3）
  ✓ data-query-mcp    — 金融数据查询
  ✓ firecrawl         — 网页抓取与搜索

项目级（仅当前项目）:
  （无）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 2. 能力补充建议

读取 `mcp-configs/mcp-servers.json`，对比已注册的 MCP，展示"尚未配置但可按需添加"的 MCP：

**提问**："你的调查工作中需要以下哪些能力？（可多选，已配置的不会重复展示）"

```
[ ] brave-search
    → 能力: 深度网页/图片/新闻搜索
    → 调查场景: OSINT 公开信息检索、背景调查
    → 需要: 免费 API Key (https://brave.com/search/api/)
    → 不可用时: 使用内置 WebSearch

[ ] baidu-search
    → 能力: 中文互联网搜索
    → 调查场景: 中文环境下的 OSINT 调查
    → 需要: 无需 API Key
    → 不可用时: 浏览器手动搜索百度

[ ] baidu-map
    → 能力: 地理编码、地点搜索、路线规划
    → 调查场景: 地址核验、地理位置分析
    → 需要: 百度地图 API Key
    → 不可用时: 浏览器手动查询

[ ] investigation-fs
    → 能力: 证据文件系统访问（限定目录）
    → 调查场景: 大规模证据文件检索
    → 需要: 配置证据目录路径
    → 不可用时: 手动指定文件路径

[ ] 其他自定义 MCP
    → 手动输入 MCP 服务端点（HTTP 地址或本地进程命令）
```

用户可选中多个 MCP，也可选择"暂不配置，稍后用 /efio:mcp-config 添加"。

---

## 3. 选择注册通道

对用户选中的每个 MCP，按以下决策树引导选择注册通道：

```
这个 MCP 是所有案件都需要的通用能力吗？
    │
    ├── 是 → 用户级注册
    │   → 写入 ~/.codebuddy/mcp.json (CodeBuddy)
    │   → 或 ~/.claude.json (Claude Code)
    │   → 所有项目自动可用
    │
    └── 否，只有当前案件需要
        → 项目级注册
        → 写入 <项目根目录>/.mcp.json
        → 仅当前项目可用
```

**默认建议**：未明确说明时，通用能力（搜索、OCR、推理等）默认用户级；案件专用能力（数据库、特定数据源）默认项目级。

---

## 4. 写入配置

根据选择的通道，写入对应的配置文件：

**用户级**（`~/.codebuddy/mcp.json` 或 `~/.claude.json`）：

```json
{
  "mcpServers": {
    "paddleOCR-mcp": {
      "url": "http://<ocr-server-host>:8090/mcp",
      "headers": {
        "Accept": "application/json, text/event-stream"
      }
    },
    "baidu-search": {
      "command": "npx",
      "args": ["-y", "@alex.ss/mcp-server-baidu-search"]
    }
  }
}
```

**项目级**（项目 `.mcp.json`）：

```json
{
  "mcpServers": {
    "investigation-fs": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/evidence"]
    }
  }
}
```

---

## 5. 验证

写入后逐一验证 MCP 可用性：

- **HTTP/SSE 类型**：检查服务端点可达性（`curl <url>` 或 MCP 工具调用测试）
- **stdio 类型**：检查命令可执行性（`npx -y <package> --version`）

---

## 6. 状态记录

将验证结果记录到 team-profile.md 的"集成状态"表：

```markdown
## MCP 集成状态

| MCP 服务器 | 注册通道 | 状态 | 备注 |
|----------|---------|------|------|
| paddleOCR-mcp | 用户级 | ✓ 可用 | OCR 文档识别 |
| data-query-mcp | 用户级 | ✓ 可用 | 金融数据查询 |
| firecrawl | 用户级 | ✓ 可用 | 网页抓取 |
| investigation-fs | 项目级 | ✓ 可用 | 证据文件系统 |
| 自定义 HTTP 搜索 | 项目级 | ✗ 不可用 | 服务端点无响应 |
```
