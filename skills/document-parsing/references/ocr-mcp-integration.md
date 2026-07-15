# OCR MCP 集成参考

> 本文档记录 OCR 文档识别类 MCP 的完整调用流程、参数说明和错误处理。
> MCP 名称和工具名的注册信息见 `../../mcp-configs/mcp-servers.json`。

---

## 1. 服务信息

| 项目 | 值 |
|------|-----|
| MCP 服务名 | `paddleOCR-mcp` |
| MCP 工具名 | `pp_structurev3` |
| 注册位置 | `~/.codebuddy/mcp.json`（用户级，所有项目可用） |
| 部署方式 | 用户级部署，无需 API Key |
| 部署规范 | 见 `mcp-configs/examples/paddleocr-example.json` |
| **调用约束** | **此 MCP 只能由 document-parsing 技能在 Step 2-3 内部调用。AI 不应直接调用。PreToolUse hook (mcp-ocr-guard) 会检测直接调用并提醒。** |

### 部署约定

PaddleOCR MCP 部署遵循以下端口约定：

| 服务 | URL 模式 | 说明 |
|------|---------|------|
| MCP 端点 | `http://<host>:<port>/mcp` | 用户在 `~/.codebuddy/mcp.json` 中注册 |
| 上传接口 | `http://<host>:<port+1>/upload` | AI 从 MCP URL 自动推导，无需额外配置 |

按此规范部署后，用户只需在 `~/.codebuddy/mcp.json` 注册 MCP URL，AI 运行时自动推导上传地址。

**非标部署**（如反向代理合并端口）：在 MCP 配置中添加 `uploadEndpoint` 字段显式指定上传地址，AI 优先读取此字段。

---

## 2. 调用流程

OCR MCP 不能直接接收客户端文件路径——文件必须先上传到 OCR 服务器本地，获取服务器侧的 localpath 后再调用 MCP 工具。

### 流程图

```
客户端文件 (d:/cases/raw/ev-010.jpg)
    │
    │  Step 0: 获取上传地址
    │  读取 ~/.codebuddy/mcp.json 中 paddleOCR-mcp 的配置
    │  ├── 有 uploadEndpoint 字段 → 直接使用
    │  └── 无此字段 → 从 MCP URL 推导（同主机、端口+1、/upload 路径）
    │
    │  Step 1: 上传文件
    │  curl -X POST <upload-url> -F "file=@<file-path>" 2>nul
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

### Step 0: 获取上传地址

读取 `~/.codebuddy/mcp.json`（或 `~/.claude.json`），找到 `paddleOCR-mcp` 的配置：

```json
{
  "paddleOCR-mcp": {
    "url": "http://10.0.0.1:8090/mcp",     // MCP 端点
    "uploadEndpoint": "http://10.0.0.1:8091/upload"  // 可选，非标部署时显式指定
  }
}
```

推导逻辑：
1. 有 `uploadEndpoint` 字段 → 直接使用
2. 无此字段 → 从 `url` 推导：同主机、端口+1、路径改为 `/upload`
   - 例：`http://10.0.0.1:8090/mcp` → `http://10.0.0.1:8091/upload`
   - 例：`http://localhost:8090/mcp` → `http://localhost:8091/upload`
   - 例：`https://ocr.company.com:8090/mcp` → `https://ocr.company.com:8091/upload`

### Step 1: 上传文件

```bash
curl -X POST <upload-url> -F "file=@<file-path>" 2>nul
```

- `<file-path>` 替换为客户端文件的绝对路径
- `2>nul` 抑制 stderr（Windows PowerShell 环境）
- 返回值中包含服务器侧的 localpath，需要提取

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
| MCP 工具未找到 | 未注册在 ~/.codebuddy/mcp.json | 降级 AI 视觉，提示用户检查配置 |
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
- `~/.codebuddy/mcp.json` 中的 MCP 配置不含 API Key，但 OCR 服务器地址不应泄露到外部
- parsed 文件中的 OCR 结果与 raw 文件同级权限管理
