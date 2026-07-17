---
description: 文档解析 — 将原始文档（PDF/扫描件/图片）结构化解析为 parsed JSON，自动识别文档类型、选择解析策略、评估质量、管理版本
---

# /efio:parse

原始文档结构化解析的确定性入口。当用户提供文档需要提取结构化信息时，通过本命令确保走 document-parsing 技能的完整工作流，而非直接调用 OCR MCP。

## Usage
```
/efio:parse <file-path>                    解析指定文件（自动识别类型）
/efio:parse <file-path> --type INVOICE     指定文档类型（跳过类型识别）
/efio:parse <file-path> --reparse          对已有 parsed 的 raw 重新解析
/efio:parse --review                       查看待人工复核的 parsed 文件列表
/efio:parse --status <raw-id>              查看某份 raw 文件的解析版本链
```

## Process

本命令加载 document-parsing 技能，执行五步工作流：

### Step 0: 配置检查

按 `config-templates/config-loader.md` 标准流程检查 `team-profile.md` 状态。
配置未就绪 → 提示运行 `/efio:cold-start`。

> OCR 后端配置（`ocr-backend.md`）为可选项，不存在时使用回退链（见 Step 2a）。

### Step 1: 确定文档类型

```
调用方指定了 --type → 直接使用
文件名含类型关键词 → 按关键词匹配（发票→INVOICE, 合同→CONTRACT, ...）
无匹配 → AI 视觉判断 → 无法识别 → GENERIC
```

支持的类型：INVOICE / CONTRACT / BANK_RECEIPT / BANK_STATEMENT / DELIVERY_NOTE / PURCHASE_ORDER / REIMBURSEMENT / PAYROLL / APPROVAL / GENERIC

### Step 2: 选择解析策略（格式感知路由）

| 文件格式 | 解析路径 |
|---------|---------|
| 图片 (.jpg/.jpeg/.png/.tiff/.bmp) | OCR MCP (paddleOCR-mcp) |
| 扫描 PDF (无可选文本) | OCR MCP (paddleOCR-mcp) |
| 数字 PDF (有可选文本) | AI 直接读取 |
| Word/Excel/CSV/纯文本 | AI 直接读取 |

> **关键**：OCR MCP 是本步骤的"后端工具"之一，不是独立入口。只有图片和扫描 PDF 才走 OCR 路径。

#### OCR MCP 调用流程（图片 / 扫描 PDF 路径）

> ⚠️ **禁止自行创建 HTTP 服务器、编写上传脚本或搭建 Web 服务。** OCR MCP 已作为独立服务部署，文档投递机制由 `{PLUGIN_CONFIG_DIR}/ocr-backend.md` 配置。

> 📖 投递配置与错误处理的**唯一权威来源**是 `references/ocr-mcp-integration.md`。以下仅为三步速查（勿在本命令与 SKILL.md 中重复维护上传细节）：

| 步骤 | 动作速查 | 权威细节 |
|------|---------|---------|
| **2a 读配置** | 读 `{PLUGIN_CONFIG_DIR}/ocr-backend.md` 决定投递方式（auto/http/shared_fs/custom）。不存在时端口+1 回退，再失败降级 AI 视觉 | `ocr-mcp-integration.md § 2 · Step 0` |
| **2b 投递文件** | 按配置投递，取服务器侧 localpath（http/auto 用 curl 上传；shared_fs 做路径映射） | `ocr-mcp-integration.md § 2 · Step 1` |
| **2c 调用工具** | `mcp_call_tool` 调用 `pp_structurev3`，见下 | `ocr-mcp-integration.md § 2 · Step 2` |

**Step 2c — 调用 MCP 工具**

使用 `mcp_call_tool` 调用 OCR（此调用在 document-parsing 技能工作流内，mcp-ocr-guard hook 的提醒可忽略）：

```
mcp_call_tool(
    serverName: "paddleOCR-mcp",
    toolName: "pp_structurev3",
    arguments: {
        "input_data": "<Step 2b 获取的 localpath>",
        "output_mode": "detailed",
        "file_type": "image"        // 或 "pdf"
    }
)
```

> 📖 完整参数说明、runtime_params 调优、错误处理与降级策略见 `references/ocr-mcp-integration.md`。

### Step 3: 执行解析

按文档类型 schema 结构化提取字段，每个字段记录 value + confidence + raw_text。

### Step 4: 质量评估

- 所有字段 confidence ≥ 0.90 → `parsed_status: "full"`
- 关键字段 confidence < 0.80 → 触发补充或标记 `human_review_required`
- 整体 confidence < 0.50 → `quality_too_low`

### Step 5: 版本管理与写入

写入 `raw/parsed/{DOCUMENT_TYPE}-{raw_file_id}_v{version}.json`，维护 supersedes/superseded_by 版本链。

### Step 6: 复核工具（自动）

根据 Step 4 的质量评估结果决定行为：

```
parsed_status?
    │
    ├── "human_review_required" 或 "quality_too_low"
    │   └── 自动打开复核工具
    │       1. 启动 review-server.py:
    │          python scripts/review-server.py --port 8899 \
    │            --root <case-dir> \
    │            --template <plugin>/skills/document-parsing/templates
    │       2. 生成 URL 并通过 preview_url 打开:
    │          http://localhost:8899/parsed-review.html?raw=raw/ev-010.jpg&ocr=raw/ocr_output/ev-010_ocr_v1.json&parsed=raw/parsed/INVOICE-ev-010_v1.json
    │       3. 提示用户：复核工具已打开，左侧查看原始文档，右侧可编辑字段和表格
    │
    └── "full"
        └── 不自动打开
            在输出摘要中提供 URL 供用户手动打开
            （用户可用 --review 参数强制打开）
```

### Step 7: 解析后提示（Post-Parse）

> ⚠️ **本命令到此结束。** `/efio:parse` 只产出 `raw/parsed/*.json`，不创建认知层节点（EV/ENT）或本体层对象（entities/relations）。

解析完成后，向用户报告解析结果摘要，并提示后续步骤：

```
✅ 解析完成
  文档类型: INVOICE
  解析方式: ocr_mcp
  置信度: 0.92 (full)
  输出: raw/parsed/INVOICE-ev-010_v1.json

📋 后续步骤（由其他技能负责）:
  1. /evidence add     — 创建 EV 证据节点（nodes/EV-NNN.md + evidence_registry.json）
  2. ontology 绑定     — 将 parsed 中的实体写入本体层（entities/*.yaml + relations/*.yaml）
     ↑ 这两步是独立技能的职责，不应在 parse 命令中自动执行。
```

**技能职责边界：**

| 技能 | 职责 | 产出 |
|------|------|------|
| document-parsing（本命令） | 文档→结构化数据 | `raw/parsed/*.json` ← **只做这个** |
| evidence-management | 结构化数据→认知节点 | `nodes/EV-*.md`, `evidence_registry.json` |
| ontology | 认知节点→本体索引 | `global_ontology/entities/*.yaml`, `relations/*.yaml` |

> **不要在 parse 命令中自动执行 evidence registration 或 ontology binding。** 这些是独立技能的职责，由用户通过 `/evidence add` 命令或 ontology 技能显式触发。parse 命令的职责在写入 parsed JSON 后结束。

## Files Read

- `schemas/document-types/*.yaml` — 文档类型字段定义
- `{PLUGIN_CONFIG_DIR}/ocr-backend.md` — OCR 后端投递配置（可选）
- `raw/` 目录 — 原始文件
- `raw/parsed/` 目录 — 历史 parsed 文件（版本检查）

## Files Written

- `raw/parsed/{TYPE}-{raw_id}_v{n}.json` — 解析结果
- `raw/ocr_output/{raw_id}_ocr_v{n}.json` — OCR 原始输出（仅 OCR MCP 路径）

## Related

- **Skill:** [文档结构化解析](../skills/document-parsing/SKILL.md) — 本命令调用的技能
- **MCP:** paddleOCR-mcp / pp_structurev3 — 图片和扫描 PDF 的 OCR 后端（由技能内部调用，不直接使用）
- **Next:** `/evidence add` — parse 完成后，用此命令创建 EV 证据节点（parse 不自动执行）
- **Next:** [调查本体论](../skills/ontology/SKILL.md) — evidence 创建后，用 ontology 技能绑定实体和关系（parse 不自动执行）
- **Docs:** [文档解析完整设计](../docs/document-parsing-design.md)
