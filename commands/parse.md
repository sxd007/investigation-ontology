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

### Step 1: 确定文档类型

```
调用方指定了 --type → 直接使用
文件名含类型关键词 → 按关键词匹配（发票→INVOICE, 合同→CONTRACT, ...）
无匹配 → AI 视觉判断 → 无法识别 → GENERIC
```

支持的类型：INVOICE / CONTRACT / BANK_RECEIPT / DELIVERY_NOTE / PURCHASE_ORDER / GENERIC

### Step 2: 选择解析策略（格式感知路由）

| 文件格式 | 解析路径 |
|---------|---------|
| 图片 (.jpg/.jpeg/.png/.tiff/.bmp) | OCR MCP (paddleOCR-mcp) |
| 扫描 PDF (无可选文本) | OCR MCP (paddleOCR-mcp) |
| 数字 PDF (有可选文本) | AI 直接读取 |
| Word/Excel/CSV/纯文本 | AI 直接读取 |

> **关键**：OCR MCP 是本步骤的"后端工具"之一，不是独立入口。只有图片和扫描 PDF 才走 OCR 路径。

### Step 3: 执行解析

按文档类型 schema 结构化提取字段，每个字段记录 value + confidence + raw_text。

### Step 4: 质量评估

- 所有字段 confidence ≥ 0.90 → `parsed_status: "full"`
- 关键字段 confidence < 0.80 → 触发补充或标记 `human_review_required`
- 整体 confidence < 0.50 → `quality_too_low`

### Step 5: 版本管理与写入

写入 `raw/parsed/{DOCUMENT_TYPE}-{raw_file_id}_v{version}.json`，维护 supersedes/superseded_by 版本链。

## Files Read

- `schemas/document-types/*.yaml` — 文档类型字段定义
- `raw/` 目录 — 原始文件
- `raw/parsed/` 目录 — 历史 parsed 文件（版本检查）

## Files Written

- `raw/parsed/{TYPE}-{raw_id}_v{n}.json` — 解析结果

## Related

- **Skill:** [文档结构化解析](../skills/document-parsing/SKILL.md) — 本命令调用的技能
- **MCP:** paddleOCR-mcp / pp_structurev3 — 图片和扫描 PDF 的 OCR 后端（由技能内部调用，不直接使用）
- **Commands:** `/evidence add` — 添加证据时如来源是原始文档，应先执行 `/efio:parse`
- **Docs:** [文档解析完整设计](../docs/document-parsing-design.md)
