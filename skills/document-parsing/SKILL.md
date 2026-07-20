---
name: document-parsing
description: >
  当用户提供原始文档（PDF/扫描件/图片/Word/Excel）需要提取信息或结构化处理时，必须使用本技能。
  本技能是 OCR MCP 的上层编排者：不要直接调用 paddleOCR-mcp，应先按本技能完成类型识别、格式路由、schema 提取、质量评估、版本写入。
  本技能只产出 raw/parsed/*.json，必要时产出 raw/ocr_output/*.json；不创建 EV 节点、本体实体或关系。
origin: efio
---

# 文档结构化解析

把 raw 文档转换成按文档类型 schema 组织的 parsed JSON，供 evidence-management、ontology 和差异分析类 skill 消费。

## 激活条件

- 用户提供 PDF、扫描件、图片、Word、Excel、CSV、文本等原始文档并要求提取信息。
- 需要重解析低置信度 parsed 结果，或根据人工复核生成新版本。
- 其他 skill 请求解析某份 raw 文件。
- 用户通过 `/efio:parse` 或等价自然语言触发文档解析。

## 职责边界

- 只读取 raw 文件并写入 `raw/parsed/*.json`。
- 仅 OCR MCP 路径额外写入 `raw/ocr_output/*.json`，并在 parsed 中记录 `source_ocr`。
- 不自动创建 EV 证据节点。
- 不自动创建本体实体、关系或候选节点。
- 不在 parsed 中预设实体本体类型；只记录字段、主体名称、账号、角色等结构化事实。

## 前置检查

执行解析前检查配置：

1. 读取 `{配置路径}/team-profile.md`。
2. 如果文件不存在、含 `[PLACEHOLDER]` 或含 `PAUSED` 标记，先进入 `/efio:cold-start` 配置向导，完成后继续。
3. OCR 路径需要读取 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`；不存在时按 `config-templates/ocr-backend.md` 的回退规则处理。

详细规则见 `../../config-templates/config-loader.md` 和 `../../config-templates/ocr-backend.md`。

## 运行流程

1. 确定文档类型：优先使用调用方指定的 `--type`；否则按文件名关键词识别；仍无法识别时用 AI 判断；最后兜底为 `GENERIC`。
2. 选择解析路径：按文件格式路由到 OCR MCP、AI 直接读取或 AI 视觉 fallback。
3. 按 `../../schemas/document-types/` 中的 schema 提取结构化字段。
4. 如果使用 OCR MCP，持久化原始 OCR 输出到 `raw/ocr_output/`。
5. 做字段级质量评估，决定 parsed 状态。
6. 按版本规则写入 `raw/parsed/`。
7. 如果结果需要人工复核，打开复核工具；否则只输出可手动打开的复核 URL。

## 文档类型

支持的类型以 `../../schemas/document-types/` 为准：

| 类型 | 典型文档 |
| --- | --- |
| `INVOICE` | 发票、数电票、机动车/二手车发票 |
| `CONTRACT` | 采购、销售、服务、租赁、工程、代理合同 |
| `BANK_RECEIPT` | 银行转账回单、电子回单、代发回单 |
| `BANK_STATEMENT` | 银行流水、对账单、交易明细 |
| `DELIVERY_NOTE` | 送货单、签收单、发货单、运单 |
| `PURCHASE_ORDER` | ERP 采购订单、手工采购单、请购单 |
| `REIMBURSEMENT` | 差旅、招待、办公、交通等报销单 |
| `PAYROLL` | 工资表、薪酬发放表、花名册、代发明细 |
| `APPROVAL` | 付款、采购、费用、用款等审批单 |
| `GENERIC` | 无预定义格式的兜底文本提取 |

常用文件名关键词：发票、合同、回单、付款凭证、流水、对账单、明细、签收、送货、发货、收货、订单、采购、PO、报销、费用、工资、薪酬、花名册、审批、申请单、用款。

## 路由规则

| 文件格式 | 解析路径 | parsed_by |
| --- | --- | --- |
| 图片：`.jpg` `.jpeg` `.png` `.tiff` `.bmp` | OCR MCP | `ocr_mcp` |
| 扫描 PDF | OCR MCP | `ocr_mcp` |
| 数字 PDF | AI 直接读取 | `ai_direct` |
| Word / Excel / CSV / 文本 / JSON / XML | AI 直接读取 | `ai_direct` |
| 未知格式或 OCR 不可用 | AI 视觉 fallback | `ai_vision` |

执行 OCR 路径前必须读取 `references/ocr-mcp-integration.md`。该文件是 OCR 投递、工具参数和错误处理的唯一权威来源。不要在本 skill 内自行发明 HTTP 上传脚本、临时服务器或替代调用方式。

## 提取要求

- 普通结构化文档：按 schema 提取字段，每个字段至少保留 `value`、`confidence`、`raw_text`。
- `CONTRACT`：提取封面字段、`parties[]`、正文 `sections[]`、表格 `tables[]`；缺失的标准节写入 `missing_sections_warnings[]`，不阻断解析。
- `GENERIC`：提取 `raw_text` 和必要的 `raw_text_blocks[]`。
- 不确定字段保留低置信度，不要编造。

### CONTRACT 标准节匹配

合同正文按条款标题匹配 `section_id`；未匹配标题归为 `other_clause`，原文仍保留。

| section_id | 标题关键词 |
| --- | --- |
| `subject` | 合同标的、项目内容、服务范围、采购内容 |
| `price_payment` | 价格及支付、付款方式、费用与支付、合同价款 |
| `delivery_acceptance` | 交付、验收、交货、安装调试、运输 |
| `quality` | 质量标准、质保、售后、质量保证 |
| `penalty` | 违约、违约责任、赔偿 |
| `dispute` | 争议、管辖、仲裁、诉讼 |
| `confidentiality` | 保密、商业秘密、机密 |
| `term` | 期限、有效期、生效、合同期限 |
| `termination` | 解除、终止、提前终止 |
| `force_majeure` | 不可抗力 |
| `intellectual_property` | 知识产权、版权 |
| `non_compete` | 竞业限制、排他 |
| `signature` | 签署、签章、签字、盖章 |
| `notices` | 通知、送达 |

缺失检测至少覆盖 `subject`、`price_payment`、`delivery_acceptance`、`penalty`、`dispute`、`signature`。

## OCR 输出持久化

仅 `parsed_by: "ocr_mcp"` 时执行：

- 从 MCP content blocks 提取完整文本；从末尾 `Pages: N` 解析页数。
- 写入 `raw/ocr_output/{raw_id}_ocr_v{version}_{timestamp}.json`。
- OCR output 版本号与 parsed 版本号保持一致。
- 在 parsed JSON 中写入 `source_ocr`。
- 如果 OCR 返回 bbox、layout blocks、elements 或其他结构化坐标信息，必须完整保留到 OCR output；不要因为当前复核模板暂不消费而丢弃。

OCR output 最小结构：

```json
{
  "ocr_id": "OCR-{raw_id}-v{version}",
  "source_raw": "raw/...",
  "engine": "pp_structurev3",
  "engine_endpoint": "<MCP URL>",
  "ocr_at": "<ISO 8601>",
  "output_mode": "detailed",
  "content": "<完整 OCR 文本或 HTML>",
  "page_count": 1,
  "supersedes": null,
  "superseded_by": null
}
```

## 质量规则

- 运行时阈值以本节为准；`docs/document-parsing-design.md` 仅作设计参考。
- `full`：整体置信度 `>= 0.90`，且所有必填字段、关键字段置信度均 `>= 0.90`。
- `human_review_required`：整体置信度在 `0.70 ~ 0.89`，或任一必填字段、关键字段置信度低于 `0.90` 但文档仍可读。
- `quality_too_low`：整体置信度 `< 0.70`，或文档不可读、有效文本过少、重试/换路径后仍无法稳定提取。
- 金额、日期、主体名称、账号、合同主体等关键字段低于 `0.80` 时，标为高优先级人工复核；不要降级为自动通过。
- 合同标准节缺失是风险信号，不是解析失败；记录 warning 后继续写入。

## 版本规则

- 首次解析写入 `raw/parsed/{DOCUMENT_TYPE}-{raw_id}_v1.json`，`supersedes: null`。
- 重解析、置信度显著提升或人工修正时写入 `v{latest+1}`，并设置 `supersedes`。
- 被替代版本应更新 `superseded_by`。
- 如果新结果与旧版本无实质差异，不创建新版本。
- 人工复核版本使用 `parsed_by: "human_review"`，并记录 `human_review.corrections[]`。

parsed 顶层最小结构：

```json
{
  "parsed_id": "PARSE-INVOICE-ev-010-v1",
  "document_type": "INVOICE",
  "source_raw": "raw/ev-010_invoice.pdf",
  "source_ocr": "raw/ocr_output/ev-010_ocr_v1.json",
  "parsed_by": "ocr_mcp",
  "parsed_status": "full",
  "parsed_at": "<ISO 8601>",
  "supersedes": null,
  "superseded_by": null,
  "fields": {},
  "human_review": null
}
```

完整格式的设计说明见 `../../docs/document-parsing-design.md`；执行时以本 skill 和 schema 文件为准。

## 复核规则

- `human_review_required` 或 `quality_too_low`：自动打开复核工具。
- `full`：不自动打开，只在输出摘要中提供复核 URL；用户显式传 `--review` 时打开。
- 优先通过 canonical action `open_review` 打开；没有运行时工具时，操作员可手动运行 `scripts/review-server.py`。
- 复核工具默认模板在 `templates/parsed-review.html`，服务端实现见 `scripts/review-server.py`。

`open_review` 的运行时入口由工具或 `scripts/review-server.py` 提供；`../../docs/document-parsing-design.md` 仅作设计参考，不是执行前置条件。

## 输出给用户

解析完成后简要说明：

- raw 文件路径。
- parsed 文件路径。
- OCR output 路径（如有）。
- 文档类型、解析路径和 parsed 状态。
- 关键低置信度字段或缺失警告。
- 下一步：需要时提示使用 evidence-management 注册 EV，或由 ontology 层处理实体/关系。

## 相关资料

- `references/ocr-mcp-integration.md`：OCR MCP 上传、调用参数和错误处理；执行 OCR 路径前必须读取。
- `../../schemas/document-types/`：文档类型 schema。
- `../../docs/document-parsing-design.md`：完整 parsed 格式、版本管理和复核设计。
- `../../config-templates/config-loader.md`：配置加载规则。
- `../../config-templates/ocr-backend.md`：OCR 后端配置模板。
- `../evidence-management/SKILL.md`：消费 parsed 创建 EV 节点。
- `../ontology/SKILL.md`：消费 parsed 判断实体类型并创建本体对象。
