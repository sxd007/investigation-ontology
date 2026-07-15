# OCR MCP 集成参考

> 本文档记录 OCR 文档识别类 MCP 的完整调用流程、参数说明和错误处理。
> MCP 名称和工具名的注册信息见 `../../mcp-configs/mcp-servers.json`。

---

## 1. 服务信息

| 项目 | 值 |
|------|-----|
| MCP 服务名 | `paddleOCR-mcp` |
| MCP 工具名 | `pp_structurev3` |
| 注册位置 | 用户级 MCP 配置（路径因平台而异，见下表） |
| 文档投递配置 | `{PLUGIN_CONFIG_DIR}/ocr-backend.md`（用户配置，升级不覆盖） |
| 部署规范 | 见 `mcp-configs/examples/paddleocr-example.json` |
| **调用约束** | **此 MCP 只能由 document-parsing 技能在 Step 2-3 内部调用。AI 不应直接调用。PreToolUse hook (mcp-ocr-guard) 会检测直接调用并提醒。** |
| **⚠️ 禁止行为** | **不要自行创建 HTTP 服务器、编写上传脚本或搭建 Web 服务。OCR MCP 已作为独立服务部署，文档投递机制由 ocr-backend.md 配置。** |

### MCP 配置文件位置（按平台）

MCP 端点 URL 注册在各平台的 MCP 配置文件中。文档投递机制（上传地址、认证、方式）单独配置在 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`。

| 平台 | 检测方式 | MCP 配置文件（注册 URL） | 用户配置目录 |
|------|---------|------------------------|------------|
| CodeBuddy | `$CODEBUDDY_PLUGIN_ROOT` 有值 | `~/.codebuddy/mcp.json` | `~/.codebuddy/plugins/config/efio` |
| Claude Code | `$CLAUDE_PLUGIN_ROOT` 有值 | `~/.claude.json` | `~/.claude/plugins/config/efio` |
| Codex | `$INVESTIGATION_ONTOLOGY_ROOT` 有值 | `.mcp.json` 或 `~/.codex/mcp.json` | `~/.codex/plugins/config/efio` |
| 无法判断 | — | 按上述顺序依次尝试 | `~/.investigation-ontology/config` |

> MCP 配置文件只负责注册 MCP 端点 URL。如何将文件投递到 OCR 服务器（上传地址、认证头、上传方式）由 `ocr-backend.md` 配置，该文件在用户配置目录中，插件更新不会覆盖。

### 部署约定（端口+1）

PaddleOCR MCP 标准部署遵循以下端口约定（ocr-backend.md 中 `Upload Method: auto` 时自动推导）：

| 服务 | URL 模式 | 说明 |
|------|---------|------|
| MCP 端点 | `http://<host>:<port>/mcp` | 用户在 MCP 配置文件中注册 |
| 上传接口 | `http://<host>:<port+1>/upload` | 从 MCP URL 自动推导 |

**非标部署**：在 `ocr-backend.md` 中设置 `Upload Method: http` 并显式指定 `Upload Endpoint`，或使用 `shared_fs` / `custom` 方式。

---

## 2. 调用流程

OCR MCP 不能直接接收客户端文件路径——文件必须先投递到 OCR 服务器本地，获取服务器侧的 localpath 后再调用 MCP 工具。投递机制由 `{PLUGIN_CONFIG_DIR}/ocr-backend.md` 配置。

### 流程图

```
客户端文件 (d:/cases/raw/ev-010.jpg)
    │
    │  Step 0: 读取 OCR 后端配置
    │  读取 {PLUGIN_CONFIG_DIR}/ocr-backend.md
    │  ├── Upload Method: auto → 从 MCP URL 推导（端口+1）
    │  ├── Upload Method: http → 使用显式 Upload Endpoint
    │  ├── Upload Method: shared_fs → 无需上传，路径映射
    │  ├── Upload Method: custom → 按自定义指令
    │  └── ocr-backend.md 不存在 → 回退：端口+1 推导 → 推导失败则降级 AI 视觉
    │
    │  Step 1: 投递文件（按配置方式）
    │  http/auto: curl -X POST <upload-url> [-H "<auth>"] -F "file=@<file>" 2>nul
    │  shared_fs: localpath = <prefix> + basename(file)
    │  custom: 按自定义指令
    │
    ▼
OCR 服务器返回 localpath
    (如: /tmp/uploads/abc123_ev-010.jpg)
    │
    │  Step 2: 调用 MCP
    │  mcp_call_tool("paddleOCR-mcp", "pp_structurev3", {
    │      input_data: "<localpath>",
    │      output_mode: "detailed",
    │      file_type: "image"  // 或 "pdf"
    │  })
    │
    ▼
MCP 返回结构化 OCR 结果
    (版面分析 + 文字识别 + 表格 + 印章)
    │
    │  Step 3: 按 schema 结构化
    │  将 OCR 结果映射到文档类型 schema 字段
    │  记录字段级 confidence
    │
    ▼
写入 raw/parsed/{TYPE}-{raw_id}_v1.json
    parsed_by: "ocr_mcp"
```

### Step 0: 读取 OCR 后端配置

读取 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`（路径按 `config-loader.md § 平台路径` 解析），获取文档投递配置。

配置示例（标准部署）：

```yaml
Upload Method: auto              # 从 MCP URL 推导上传地址
Auth Headers: none               # 无需认证
Localpath Field: path            # 上传响应中 localpath 的 JSON 字段名
```

配置示例（云服务 + API Key）：

```yaml
Upload Method: http
Upload Endpoint: https://ocr.company.com/api/upload
Auth Headers: Authorization: Bearer sk-xxxxxxxx
Localpath Field: data.filepath
```

> ocr-backend.md 不存在时的回退：
> 1. 从 MCP URL 推导：同主机、端口+1、路径改为 `/upload`
> 2. 推导失败 → 降级 AI 视觉解析，提示运行 `/efio:cold-start`

### Step 1: 投递文件

根据 ocr-backend.md 的 `Upload Method` 投递文件：

**http / auto 路径**（HTTP 上传）：

```bash
# 无认证
curl -X POST <upload-url> -F "file=@<file-path>" 2>nul

# 有认证（ocr-backend.md 中配置了 Auth Headers 时）
curl -X POST <upload-url> -H "Authorization: Bearer xxx" -F "file=@<file-path>" 2>nul
```

从响应 JSON 中按 `Localpath Field`（默认 `path`）提取 localpath。

**shared_fs 路径**（共享文件系统）：

客户端文件须已在共享文件系统中可访问（如通过 NFS/SMB 挂载，客户端和 OCR 服务器挂载了同一共享目录）。无需上传。localpath = `<Shared Path Prefix>` + 文件基本名（basename，不含目录路径）。

例：客户端文件 `D:\cases\raw\ev-010.jpg`，`Shared Path Prefix` 为 `/mnt/shared/ocr_uploads/` → localpath = `/mnt/shared/ocr_uploads/ev-010.jpg`

**custom 路径**：

按 `Custom Upload Instructions` 中的描述执行。

### Step 2: 调用 pp_structurev3

```
mcp_call_tool(
    serverName: "paddleOCR-mcp",
    toolName: "pp_structurev3",
    arguments: {
        "input_data": "<localpath>",     // Step 1 获取的服务器侧路径
        "output_mode": "detailed",       // 返回 JSON 结构
        "file_type": "image",            // "image" 或 "pdf"
        "return_images": false           // 调查场景通常不需要返回图片
    }
)
```

### Step 3: 结果结构化

OCR 返回的 `detailed` 结果包含：
- 版面分析（段落、表格、标题、页眉页脚分块）
- 文字识别（每块文本 + 置信度）
- 表格还原（行列结构，支持有线/无线表格）
- 印章识别（检测印章区域并提取文字）

将这些结果按文档类型 schema 映射为结构化字段。

---

## 3. 参数说明

### 必填参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `input_data` | string | OCR 服务器侧的文件路径（上传后获取） |

### 可选参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `output_mode` | `"simple"` | `simple` 返回纯文本，`detailed` 返回 JSON。**调查场景建议用 `detailed`** |
| `file_type` | `null` | `image` 或 `pdf`，HTTP API 模式下需要指定 |
| `return_images` | `true` | 是否在输出中包含图片。调查场景通常设为 `false` |
| `runtime_params` | `null` | 高级运行参数（见下方） |

### runtime_params（高级调优）

通常使用默认值即可。调查场景可能调优的：

| 参数 | 用途 | 调优建议 |
|------|------|---------|
| `text_det_box_thresh` | 文本检测框阈值（默认 0.3） | 模糊扫描件可降至 0.2 提高检出率 |
| `text_rec_score_thresh` | 文字识别置信度阈值（默认 0.5） | — |
| `use_seal_recognition` | 印章识别 | 合同/发票保持开启 |
| `use_table_recognition` | 表格识别 | 保持开启 |

---

## 4. 文件格式路由

| 格式 | 扩展名 | 是否走 OCR MCP | 备注 |
|------|--------|---------------|------|
| 图片 | .jpg .jpeg .png .tiff .bmp | ✅ 是 | OCR MCP 的主要场景 |
| 扫描 PDF | .pdf（无可选文本） | ✅ 是 | `file_type: "pdf"` |
| 数字 PDF | .pdf（有可选文本） | ❌ 否 | AI 直接读取文本 |
| Word | .doc .docx | ❌ 否 | AI 直接读取 |
| Excel/CSV | .xlsx .xls .csv | ❌ 否 | AI 直接读取 |
| 纯文本 | .txt .md .json .xml | ❌ 否 | AI 直接读取 |
| 邮件 | .eml .msg | ❌ 否 | AI 直接读取 |

### PDF 扫描件检测方法

判断 PDF 是否为扫描件：尝试用 AI 读取 PDF 文本内容，如果提取的文本为空或极少（如只有页码），则判定为扫描件，走 OCR MCP 路径。

---

## 5. 错误处理与降级

```
OCR MCP 失败
    │
    ├── 重试一次（排除瞬时网络问题）
    │
    └── 仍失败 → 降级 AI 视觉直接解析
        ├── AI 可读取文件（图片/PDF）→ 直接视觉解析，标记 parsed_by: "ai_vision"
        └── AI 无法读取 → 标记 quality_too_low，提示调查员
```

| 症状 | 原因 | 处理 |
|------|------|------|
| 上传超时 / 无响应 | OCR 服务器不可达 | 降级 AI 视觉 |
| localpath 为空 | 上传成功但响应解析失败 | 降级 AI 视觉 |
| MCP 工具未找到 | 未注册在 MCP 配置文件中 | 降级 AI 视觉，提示用户检查配置 |
| 上传地址不可推导 | ocr-backend.md 不存在且无法从 MCP URL 推导上传地址 | 降级 AI 视觉，提示运行 /efio:cold-start 配置 OCR 后端 |
| 上传被拒绝 (401/403) | 认证头缺失或无效 | 检查 ocr-backend.md 的 Auth Headers 配置 |
| MCP 调用超时 | 文件过大或服务器负载高 | 重试一次 → 降级 AI 视觉 |
| 返回结果为空 | 文件无法识别 | 降级 AI 视觉 |

---

## 6. parsed_by 标记规则

| parsed_by 值 | 含义 | 触发条件 |
|-------------|------|---------|
| `ocr_mcp` | OCR MCP 解析 | 图片/扫描 PDF 通过 OCR MCP 成功解析 |
| `ai_direct` | AI 直接读取 | 数字 PDF / Word / Excel / CSV / 文本由 AI 直接读取 |
| `ai_vision` | AI 视觉解析 | OCR MCP 不可用或失败，AI 使用视觉能力解析 |
| `human_review` | 人工修正 | 人工复核后生成的修正版本 |

---

## 7. 安全注意事项

- OCR 服务器 (`<ocr-server-host>`) 应在**内网环境**运行，不应暴露到公网
- 上传的调查文件（发票、合同等）包含敏感商业信息，OCR 服务器应定期清理上传的临时文件
- MCP 配置文件中的 MCP 配置可能含认证信息，不应泄露到外部
- parsed 文件中的 OCR 结果与 raw 文件同级权限管理
