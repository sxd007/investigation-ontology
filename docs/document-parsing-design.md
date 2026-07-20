# Document Parsing — 设计与实现要点

> 版本: v1.1 — 2026-07-17（已完成 OCR 输出持久化、复核闭环、schema 扩展）

目标：构建可审计、可回溯的文档解析流水线，输出供 `evidence-management` 与 `ontology` 消费的 high-quality parsed JSON，同时保持解析层与本体层职责清晰分离。

概览
- 三层证据模型：
  - `raw/`：原始文件（PDF/图片/Office）
  - `raw/ocr_output/`：OCR 或后端解析中间产物（Append-only，按版本保存）
  - `raw/parsed/`：按文档类型 schema 的结构化解析结果（按版本保存，含 `supersedes`/`superseded_by`）

职责边界
- `document-parsing`：产出结构化字段与角色（role），并持久化 OCR 原始输出；**不负责预设本体类型（Person/Organization/Account）**。
- `ontology`：消费 parsed，独立判断实体/类型并通过 `ADMIT_CANDIDATE` 写入（UNRESOLVED），由人工或下游流程 `RESOLVE_ENTITY`。

关键原则（已落实）
- Append-only 可审计：OCR output 与 parsed 均以版本追加写入，旧版本不覆盖。
- 最小耦合：解析层仅产出结构与角色，本体层单独负责类型决策。
- MCP 自适应：若后端返回布局/坐标（bbox），解析层应持久化并提示升级 UI；当前 MCP 返回 HTML（无 bbox），前端使用 iframe 渲染并以文本/表格并排对比为主。
- 人工复核闭环：低置信度字段触发 `review-server.py` 启动复核界面；人工修改保存为 parsed v{n+1}（记录 `human_review.corrections[]`）。

持久化规范（摘要）
- OCR output 示例如下（路径：`raw/ocr_output/{raw_id}_ocr_v{n}.json`）：

  {
    "ocr_id": "OCR-{raw_id}-v{n}",
    "source_raw": "raw/ev-010.jpg",
    "engine": "pp_structurev3",
    "engine_endpoint": "http://...",
    "ocr_at": "2026-07-17T...Z",
    "output_mode": "detailed",
    "content": "<html>...表格 HTML...</html>\n\nPages: 1",
    "page_count": 1,
    "supersedes": null,
    "superseded_by": null
  }

+- parsed JSON: 顶层新增 `source_ocr` 字段指向对应 OCR output 文件；保留 `parsed_id` / `parsed_by` / `parsed_at` / `fields` / `tables` / `human_review` 等。
- 版本规则：OCR output 与 parsed 版本号保持对齐；人工复核或重解析生成 v{n+1} 并在旧版本写入 `superseded_by`。

运行与快速使用（概要）
- 解析（示例）: `efio parse <case-dir> --type INVOICE` 或通过 `commands/parse.md` 的命令行入口。
- 自动复核：当 `parsed_status` = `human_review_required` 或 `quality_too_low`，解析器可启动 `scripts/review-server.py` 并打开浏览器到：
  `http://localhost:8899/parsed-review.html?raw=raw/ev-010.jpg&ocr=raw/ocr_output/ev-010_ocr_v1.json&parsed=raw/parsed/INVOICE-ev-010_v1.json`
- review-server：轻量 HTTP 静态服 + POST `/save`（写回 parsed v2）+ POST `/save-ocr`（写回 ocr_output v2）+ `/shutdown`。

已知限制
- 当前 MCP（pp_structurev3）仅返回 HTML/文本，不透传 bbox/layout_blocks，因此无法在原始文件像素级做区域高亮对比；前端以 iframe 渲染 HTML 并做文本/表格并排对比作为降级方案。

开发者注意点
- 支持新文档类型：在 `schemas/document-types/` 新增 `{type}.yaml`，确保关键字段含 `confidence_tracking`。
- 若 MCP 将来返回 bbox：解析层写入 `ocr_output.layout`，并启用更丰富的前端高亮模板。

变更记录（重要）
- 2026-07-16：实现 OCR 原始输出持久化与 parsed 引用 `source_ocr`。
- 2026-07-16：添加 `review-server.py` 与 `/save` `/save-ocr` 复核闭环。
- 2026-07-17：扩展 schema（新增 reimbursement/payroll/approval/bank_statement），并合并技能内重复 docs 到仓库根 docs。 

参考
- `cc-investigation-ontology/skills/document-parsing/`（实现代码与资产）
- `cc-investigation-ontology/schemas/document-types/`（schema 列表）


| # | 约束 | 来源 |
|---|------|------|
| 1 | **Append-Only**：数据不可物理删除，只通过版本替代 | 设计哲学原则 #5 |
| 2 | **Epistemic Layering**：严格区分"机器看到了什么"和"调查员认为是什么" | 设计哲学原则 #2 |
| 3 | **Evidence-Centric**：所有事实必须可追溯至原始证据 | 设计哲学原则 #1 |
| 4 | **Graceful Degradation**：无外部 OCR 服务时系统仍可工作 | 工程要求 |

### 1.3 本设计的核心思路

在 `raw/` 与 `global_ontology/` / `nodes/` 之间插入一个**结构化解析中间层**：

```
raw/ (原始文件) 
    → [结构化解析] 
        → raw/parsed/ (结构化解析结果) ← ★ 新增
            → 人工复核修正
                → global_ontology/ (本体层)
                → nodes/ (认知层)
```

中间层只回答 **"文档上写了什么"**，不回答 **"这意味着什么"**。后者是认知层的职责。

---

## 2. 核心概念：三层证据模型

```
┌──────────────────────────────────────────────────────────────────┐
│  认知层 (Epistemic Layer)          nodes/EV-001.json            │
│  "调查员认为是什么"                  ontology_ref → Evidence     │
│  推理/分析/判断                     derived_from → parsed       │
│                                    raw_source → （无，由 UI 从  │
│                                                  ontology_ref  │
│                                                  解析得到路径）   │
├──────────────────────────────────────────────────────────────────┤
│  本体层 (Ontology Layer)           global_ontology/entities/    │
│  "法庭认定的事实"                    evidence/ev-010.yaml       │
│  经治理规则的实体/关系              integrity.raw_file_path     │
├──────────────────────────────────────────────────────────────────┤
│  解析层 (Parsed Layer) ★新增        raw/parsed/                 │
│  "机器从文档上读到了什么"            INVOICE-ev-010_v1.json     │
│  结构化字段 + 置信度                 source_raw → raw/*.pdf     │
├──────────────────────────────────────────────────────────────────┤
│  原始层 (Raw Layer)                 raw/                        │
│  "原始文件"                         ev-010_invoice.pdf          │
│  不可变的扫描件/PDF                 由本体层 evidence 保管链管理   │
└──────────────────────────────────────────────────────────────────┘
```

**关键设计决策**：

| 决策 | 理由 |
|------|------|
| Parsed 层不属于任何既有层 | 它是"机器看到的"，既不是原始文件（raw），也不是认定的事实（本体），更不是推理结论（认知） |
| Parsed 层归 raw/ 子目录管理 | 因为 parsed 与 raw 是一一对应的，放在 raw/parsed/ 自然保持关联 |
| Parsed 不参与治理校验 | Layer 3（PreToolUse Hook）不校验 parsed 文件——它只校验进入本体层的 Action |

---

## 3. 架构总览

### 3.1 组件关系

```
                        raw/ev-010_invoice.pdf
                              │
                              ▼
              ┌──────────────────────────────────┐
              │  document-parsing skill（统筹者）  │ ← ★ 新 Skill
              │                                  │
              │  1. 确定文档类型                    │
              │  2. 选择解析策略                    │
              │  3. 执行解析                        │
              │  4. 质量评估                        │
              │  5. 写入 parsed                    │
              └──────────┬───────────────────────┘
                         │
                         ▼
              raw/parsed/INVOICE-ev-010_v1.json
              ├── source_raw → raw/ev-010.pdf
              ├── fields → {amount, date, ...}
              ├── confidence → 字段级
              └── version → v1 (supersedes: null)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    evidence-management  ontology    其他 skill
    (创建 EV 节点)      (ADMIT_      (差异分析等)
     derived_from→parsed CANDIDATE)
```

### 3.2 目录结构

```
cases/CASE-NNNN/
├── raw/                          ← 原始文件（扫描件/PDF）
│   ├── ev-010_invoice.pdf
│   ├── ev-011_contract.pdf
│   └── ev-012_receipt.jpg
│
├── raw/parsed/                   ← ★ 新增：结构化解析结果
│   ├── INVOICE-ev-010_v1.json    ← 首次解析
│   ├── INVOICE-ev-010_v2.json    ← 重解析（模型升级）
│   ├── CONTRACT-ev-011_v1.json
│   └── GENERIC-ev-012_v1.json    ← 无预定义格式的兜底
│
├── nodes/                        ← 认知层（不变）
│   ├── EV-001.json               ← derived_from → parsed
│   ├── ENT-001.json
│   └── ...
│
├── evidence_registry.json        ← 索引（不变）
└── meta.json                     ← 案件元数据（不变）

global_ontology/                  ← 本体层（不变）
├── entities/evidence/ev-010.yaml  ← integrity.raw_file_path → raw/
├── entities/person/P-0001.yaml
└── relations/R-001.yaml
```

### 3.3 导航路径（人类读者从 EV 看原件）

```
nodes/EV-001.json
    └── ontology_ref.object_id = "ev-010"
            └── UI 层自动解析:
                读 global_ontology/entities/evidence/ev-010.yaml
                    └── integrity.raw_file_path = "raw/ev-010_invoice.pdf"
                            └── 渲染"查看原件"按钮
```

**不设 `raw_source_ref` 快捷字段**——导航路径由 UI 层在渲染时从 `ontology_ref → Evidence → raw_file_path` 自动解析，数据层不存 UI 快捷方式，避免同步漂移。

---

## 4. 文档类型 Schema（插件全局）

### 4.1 全局定义骨架

每种常用文档类型在插件级定义**最小公共字段集**，所有 Skill 共用。

```
cc-investigation-ontology/
└── schemas/document-types/          ← ★ 新增
    ├── invoice.yaml                  ← 发票
    ├── contract.yaml                 ← 合同
    ├── bank_receipt.yaml             ← 银行回单
    ├── delivery_note.yaml            ← 签收单/送货单
    ├── purchase_order.yaml           ← 采购订单
    └── generic.yaml                  ← 兜底（无预定义格式）
```

### 4.2 示例：发票 Schema

```yaml
# schemas/document-types/invoice.yaml
document_type: INVOICE
description: "中国增值税发票（专票/普票）"
version: "1.0"

fields:
  - name: invoice_no
    label: 发票号码
    type: string
    required: true
    confidence_tracking: true

  - name: invoice_date
    label: 开票日期
    type: date
    format: "YYYY-MM-DD"
    required: true
    confidence_tracking: true

  - name: total_amount
    label: 价税合计
    type: decimal
    required: true
    confidence_tracking: true

  - name: payer_name
    label: 购买方名称
    type: string
    required: true
    confidence_tracking: true

  - name: payer_tax_id
    label: 购买方税号
    type: string
    required: false
    confidence_tracking: true

  - name: payee_name
    label: 销售方名称
    type: string
    required: true
    confidence_tracking: true

  - name: payee_tax_id
    label: 销售方税号
    type: string
    required: false
    confidence_tracking: true

  - name: line_items
    label: 商品明细
    type: array
    required: false
    items:
      type: object
      properties:
        - name: description
          label: 货物或应税劳务名称
          type: string
        - name: quantity
          label: 数量
          type: decimal
        - name: unit_price
          label: 单价
          type: decimal
        - name: amount
          label: 金额
          type: decimal
```

### 4.3 Skill 级扩展

特定 Skill 可在自己的目录下定义扩展字段，通过 `extends` 继承全局骨架：

```yaml
# skills/order-execution-variance-analysis/document-extensions/invoice-ext.yaml
extends: INVOICE
additional_fields:
  - name: order_ref_no
    label: 关联订单号
    type: string
    description: "渠道核查场景需要关联的 ERP 订单号"
  - name: contract_ref_no
    label: 关联合同号
    type: string
```

**设计原则**：全局定义"大家都要的"，Skill 扩展"自己才要的"，避免全局 schema 膨胀。

---

## 5. Parsed 文件格式规范

### 5.1 顶层结构

```json
{
  "parsed_id": "PARSE-INVOICE-ev-010-v1",
  "document_type": "INVOICE",
  "source_raw": "raw/ev-010_invoice.pdf",
  "parser_version": "ocr-engine-v2.3",
  "parsed_at": "2026-06-30T09:15:00Z",
  "parsed_by": "ocr_mcp",                    // ocr_mcp | ai_direct | ai_vision | human_review

  "supersedes": null,
  "superseded_by": null,

  "fields": { ... },

  "human_review": null,

  "meta": {
    "page_count": 1,
    "file_size_bytes": 245000,
    "detected_language": "zh-CN"
  }
}
```

### 5.2 字段级数据

每个字段包含：值、置信度、OCR 原始文本、备选值。

```json
{
  "fields": {
    "invoice_no": {
      "value": "12345678",
      "confidence": 0.99,
      "raw_text": "1 2 3 4 5 6 7 8",
      "alternatives": [],
      "human_corrected": false
    },
    "total_amount": {
      "value": 380000.00,
      "confidence": 0.92,
      "raw_text": "3 8 0, 0 0 0",
      "alternatives": ["330000.00"],
      "human_corrected": false
    },
    "payer_name": {
      "value": "XX科技有限公司",
      "confidence": 0.97,
      "raw_text": "XX科技有限公口",
      "alternatives": [],
      "human_corrected": false
    },
    "invoice_date": {
      "value": "2023-11-05",
      "confidence": 0.99,
      "raw_text": "2023年11月05日",
      "alternatives": [],
      "human_corrected": false
    },
    "line_items": {
      "value": [
        { "description": "服务器设备", "quantity": 2, "unit_price": 190000, "amount": 380000 }
      ],
      "confidence": 0.85,
      "raw_text": "服务器设备*2*190000*380000",
      "alternatives": [],
      "human_corrected": false
    }
  }
}
```

### 5.3 置信度规则

运行时阈值以 `skills/document-parsing/SKILL.md` 的“质量规则”为准；本节只记录当前设计口径，避免与 skill 分叉。

| 置信度范围 | 语义 | 后续处理 |
|-----------|------|---------|
| `>= 0.90` | 高置信度，自动通过 | 写入 parsed，标记 `parsed_status: "full"` |
| `0.70 ~ 0.89` | 中等置信度，待复核 | 写入 parsed，标记 `parsed_status: "human_review_required"` |
| `< 0.70` | 低置信度或质量不足 | 先重解析或换解析策略；仍不足则标记 `parsed_status: "quality_too_low"` |

金额、日期、主体名称、账号、合同主体等关键字段低于 `0.80` 时，应作为高优先级人工复核项；该阈值不另立 parsed 状态。

### 5.4 人工复核记录

```json
{
  "human_review": {
    "reviewed_by": "auditor_zhang",
    "reviewed_at": "2026-06-30T10:00:00Z",
    "overall_status": "partially_corrected",
    "corrections": [
      {
        "field": "total_amount",
        "original_value": "380000",
        "corrected_value": "330000",
        "reason": "OCR 将 3 误识别为 8，对照原始图片确认",
        "corrected_by": "auditor_zhang",
        "corrected_at": "2026-06-30T10:05:00Z"
      }
    ]
  }
}
```

`overall_status` 枚举：`pending` / `partially_corrected` / `confirmed`。

---

## 6. 版本管理

### 6.1 命名规则

```
raw/parsed/{DOCUMENT_TYPE}-{raw_id}_v{version}.json
```

示例：

| 文件 | 含义 |
|------|------|
| `INVOICE-ev-010_v1.json` | 发票 ev-010 首次解析 |
| `INVOICE-ev-010_v2.json` | 同一发票重新解析（模型升级） |
| `GENERIC-ev-012_v1.json` | 签收单 ev-012 无预定义格式，通用兜底 |

### 6.2 版本链

```json
// INVOICE-ev-010_v1.json — 首次解析
{
  "parsed_id": "PARSE-INVOICE-ev-010-v1",
  "supersedes": null,        // 没有被它替代的版本
  "superseded_by": "PARSE-INVOICE-ev-010-v2"  // 被 v2 替代
}

// INVOICE-ev-010_v2.json — 重解析
{
  "parsed_id": "PARSE-INVOICE-ev-010-v2",
  "supersedes": "PARSE-INVOICE-ev-010-v1",   // 替代了 v1
  "superseded_by": null,
  "change_summary": "升级 OCR 引擎 v3.0，金额字段置信度从 0.92 提升至 0.99"
}
```

### 6.3 EV 节点引用哪个版本？

**EV 节点永远引用最新且可用的 parsed 版本。**

```json
// nodes/EV-001.json
{
  "id": "EV-001",
  "type": "evidence",
  "relations": {
    "derived_from": [
      {
        "id": "PARSE-INVOICE-ev-010-v2",
        "excerpt": "发票金额33万，开票日期2023-11-05",
        "form": "parsed_data"
      }
    ]
  }
}
```

### 6.4 版本切换策略

| 场景 | 处理方式 |
|------|---------|
| 自动重解析（OCR 模型升级） | 创建 v2，**不自动更新 EV 引用**，需要人工确认后才切换 |
| 人工复核修正 | 创建 v2，EV 引用切换到 v2 |
| 发现新版解析引入新错误 | EV 引用切回旧版本（指针切换，不覆盖数据） |
| 旧版本还保留吗？ | **保留。** 遵从 Append-Only 原则，删除数据不删除 |

---

## 7. GENERIC 兜底机制

### 7.1 设计目的

当文档类型无法匹配任何预定义 schema 时（如手写便条、微信截图、非标准格式表格），解析器不报错退出，而是使用 GENERIC schema 输出纯文本结果。

### 7.2 Generic Schema

```yaml
# schemas/document-types/generic.yaml
document_type: GENERIC
description: "无预定义格式的通用文档 — 仅做 OCR 文本提取"
fields:
  - name: raw_text
    label: OCR 原始文本
    type: text
    required: true

  - name: raw_text_blocks
    label: OCR 文本分块
    type: array
    items:
      type: object
      properties:
        - name: block_text
        - name: position
          type: object
          properties:
            - name: x1; y1; x2; y2
        - name: block_type
          enum: [paragraph, table, header, footer]

  - name: detected_language
    label: 检测语言
    type: string
```

### 7.3 GENERIC 的后续价值

| 使用者 | 用途 |
|--------|------|
| 人类调查员 | 直接阅读 OCR 全文，比在 PDF 翻页快 |
| AI Agent（Skill 层） | 基于 raw_text 做后续分析和信息提取 |
| 后续版本 | 当某字段后来被识别为标准字段，可追加 `enriched_fields` |

```json
// GENERIC-ev-015_v2.json — 后续 LLM 补充提取
{
  "parsed_id": "PARSE-GENERIC-ev-015-v2",
  "document_type": "GENERIC",
  "supersedes": "PARSE-GENERIC-ev-015-v1",
  "fields": {
    "raw_text": { "value": "关于XX项目付款申请\n\n王总：\n请审批..." },
    "enriched_fields": {
      "value": {
        "applicant": "张三",
        "date": "2023-11-05",
        "document_type_hint": "付款审批单"
      }
    }
  }
}
```

### 7.4 解析决策树（文档类型判断）

```
文档进入解析
    │
    ├── 用户指定了类型（--type INVOICE）→ 按 INVOICE 解析
    │
    ├── 文件名包含类型关键词
    │   ├── *发票* → INVOICE
    │   ├── *合同* → CONTRACT
    │   ├── *回单*/流水 → BANK_RECEIPT
    │   ├── *签收*/送货 → DELIVERY_NOTE
    │   └── *订单* → PURCHASE_ORDER
    │
    ├── AI 视觉判断文档类型
    │   ├── 能识别 → 按对应 schema
    │   └── 无法识别 → GENERIC
    │
    └── 完全无信息 → GENERIC
```

---

## 8. OCR 服务配置体系

### 8.1 支持的服务类型

| 类型 | 示例 | 配置位置 | 优先级 |
|------|------|---------|--------|
| **MCP 服务（用户级）** | `paddleOCR-mcp`（PaddleOCR pp_structurev3） | MCP 端点→平台 MCP 配置；投递机制→`{PLUGIN_CONFIG_DIR}/ocr-backend.md` | 最高（默认） |
| **HTTP API** | Azure Document Intelligence、百度 OCR、阿里云 OCR | `team-profile.md` | 中（可选扩展） |
| **本地引擎** | Tesseract、Docling | `team-profile.md` | 低（可选扩展） |
| **AI 视觉** | Claude 内置视觉能力（无需配置） | 无（fallback） | 兜底 |

### 8.2 默认 OCR MCP（paddleOCR-mcp）

paddleOCR-mcp 的配置分为两层：

- **MCP 端点注册**：在各平台的 MCP 配置文件中注册 URL（CodeBuddy→`~/.codebuddy/mcp.json` | Claude Code→`~/.claude.json` | Codex→`.mcp.json` 或 `~/.codex/mcp.json`）
- **文档投递配置**：在 `{PLUGIN_CONFIG_DIR}/ocr-backend.md` 中配置上传地址、认证、投递方式（由 /efio:cold-start 生成，升级不覆盖）

- **工具**：`pp_structurev3`
- **能力**：版面分析、文字识别、表格还原、印章识别、公式识别
- **适用格式**：jpg / png / tiff / bmp / pdf（扫描件）
- **详细调用流程**：见 `skills/document-parsing/references/ocr-mcp-integration.md`

**调用流程概要**：

```
1. 读取 {PLUGIN_CONFIG_DIR}/ocr-backend.md 获取投递配置
   └── 不存在时回退：端口+1 约定推导（从 MCP URL 推导）
2. 按配置投递文件（HTTP 上传 / 共享路径 / 自定义）
3. 取得 localpath
4. 调用 MCP: mcp_call_tool("paddleOCR-mcp", "pp_structurev3", { input_data: localpath, ... })
5. 将 OCR 结果按 schema 结构化
```

标准部署（端口+1约定）用户在 cold-start 时选择 `auto` 即可零配置。非标部署在 `ocr-backend.md` 中选择 `http`/`shared_fs`/`custom` 方式。示例见 `mcp-configs/examples/paddleocr-example.json`。

### 8.3 格式感知路由

文档解析不等于 OCR——只有图片和扫描 PDF 需要 OCR，其他格式有更高效的解析方式：

| 文件格式 | 解析路径 | 说明 |
|---------|---------|------|
| 图片 (jpg/png/tiff/bmp) | OCR MCP | 上传 → pp_structurev3 |
| 扫描 PDF（无可选文本） | OCR MCP | 上传 → pp_structurev3 |
| 数字 PDF（有可选文本） | AI 直接读取 | Claude 提取文本，按 schema 结构化 |
| Word (doc/docx) | AI 直接读取 | Claude 读取文档内容 |
| Excel/CSV (xlsx/xls/csv) | AI 直接读取 | Claude 解析表格行列 |
| 纯文本 (txt/md/json/xml) | AI 直接读取 | 直接读取 |
| 邮件 (eml/msg) | AI 直接读取 | 提取邮件头和正文 |
| 其他/未知 | AI 视觉尝试 | 失败则 GENERIC |

### 8.4 HTTP API / 本地引擎（可选扩展）

如需配置 Azure Document Intelligence、百度 OCR 等专业云 OCR 服务，在 `team-profile.md` 中配置：

```markdown
## 文档解析服务

**影响技能：** document-parsing

至少配置一项即可工作。未配置时由 OCR MCP（paddleOCR-mcp）或 AI 视觉解析。

### HTTP API 服务（手动配置）

| 参数 | 填什么 | 示例 |
|------|--------|------|
| ocr_http_endpoint | API 请求地址 | https://xxx.cognitiveservices.azure.com/ |
| ocr_http_key | API 密钥 | 1a2b3c4d... |
| ocr_http_engine | 引擎类型 | azure-document-intelligence / baidu-ocr / aliyun-ocr |
| ocr_http_model | 模型 ID（可选） | prebuilt-invoice / prebuilt-layout |

**参数值：** [PLACEHOLDER]

### 本地引擎（可选）

| 参数 | 填什么 | 示例 |
|------|--------|------|
| ocr_local_engine | 本地引擎类型 | tesseract / docling |
| ocr_local_path | 可执行文件路径 | C:\Program Files\Tesseract-OCR\tesseract.exe |

**参数值：** [PLACEHOLDER]
```

### 8.5 读取配置的优先级逻辑

```python
def select_ocr_backend(config):
    """按优先级选择可用的 OCR 后端"""
    # 1. MCP 工具（用户级注册，自动发现）
    if has_mcp_tool("paddleOCR-mcp"):
        return MCPBackend("paddleOCR-mcp", "pp_structurev3")

    # 2. HTTP API（用户手动配置）
    if config.ocr_http_endpoint:
        return HTTPBackend(
            endpoint=config.ocr_http_endpoint,
            key=config.ocr_http_key,
            engine=config.ocr_http_engine
        )

    # 3. 本地引擎
    if config.ocr_local_engine:
        return LocalBackend(
            engine=config.ocr_local_engine,
            path=config.ocr_local_path
        )

    # 4. 无配置 → 返回 None，由 Skill 层触发 AI fallback
    return None
```

---

## 9. Pipeline: parse-document.py（已废弃）

> **⚠️ 已废弃**：`parse-document.py` 及其依赖的 `ocr_client.py` 模块已废弃。文档解析现在由 document-parsing skill 直接调用 OCR MCP（paddleOCR-mcp / pp_structurev3）或 AI 直接读取完成，不再需要 Pipeline 脚本作为中间层。相关脚本保留在 `scripts/` 目录但不再维护。参见第 8 节「OCR 服务配置体系」和 `skills/document-parsing/references/ocr-mcp-integration.md` 了解当前方案。

---

## 10. Skill: document-parsing

### 10.1 定位

**统筹者**——以 AI 智能决定解析策略、判断质量、管理版本、协调 fallback。

### 10.2 SKILL.md 核心工作流

```markdown
# 文档结构化解析 Skill

## 职责

将原始文档（PDF/扫描件/图片）转化为结构化的 parsed JSON，
供下游 skill（evidence-management、ontology 等）使用。

## 何时激活

- 调查员提供了新的原始文档需要解析
- 现有 parsed 结果被标记为低置信度，需要重解析
- 人工复核后需要生成修正版本

## 核心工作流

### Step 1: 确定文档类型

- 用户指定了类型 → 直接使用
- 文件名包含关键词 → 匹配对应类型
- 无法确定 → AI 视觉判断
- 仍无法判断 → 使用 GENERIC 解析

### Step 2: 选择解析策略

- 图片 / 扫描 PDF → OCR MCP 路径（上传 → 调用 pp_structurev3）
- 数字 PDF / Word / Excel / CSV / 文本 → AI 直接读取
- OCR MCP 不可用 或 未知格式 → AI 视觉直接解析
- 文档含手写/盖章遮挡 → OCR MCP 优先，AI 视觉补充关键字段

### Step 3: 质量评估

- 整体置信度和所有必填/关键字段均 `>= 0.90` → `parsed_status: "full"`
- 整体置信度 `0.70 ~ 0.89`，或任一必填/关键字段低于 `0.90` 但文档仍可读 → `parsed_status: "human_review_required"`
- 整体置信度 `< 0.70`，或文档不可读、有效文本过少、重试/换路径后仍无法稳定提取 → `parsed_status: "quality_too_low"`
- 关键字段低于 `0.80` 或多个字段相互矛盾 → 高优先级人工复核

### Step 4: 版本管理

- 检查 raw/parsed/ 下是否有该 raw 的历史版本
- 无历史版本 → 创建 _v1
- 有历史版本 → 创建 _v{latest+1}，设置 supersedes

### Step 5: 写入 parsed 文件

- 按照对应文档类型 schema 输出
- 记录解析引擎、时间、版本信息
```

### 10.3 Skill 与解析后端的分工

```
                        raw/ev-010.pdf
                              │
                              ▼
              ┌──────────────────────────────┐
              │  document-parsing skill       │ ← 有 AI 决策
              │                              │
              │  [判断]: 文件是什么格式？      │
              │      ├── 图片/扫描 PDF        │
              │      │   → OCR MCP 路径        │
              │      │     (上传→调用→结构化)  │
              │      │                        │
              │      ├── 数字 PDF/Word/Excel  │
              │      │   → AI 直接读取         │
              │      │                        │
              │      └── 未知/OCR 不可用       │
              │          → AI 视觉 fallback    │
              │                              │
              │  [判断]: 置信度达标吗？        │
              │      ├── 是 → 写入            │
              │      └── 否 → 重试/换策略/标   │
              │             记人工复核          │
              └──────────────┬───────────────┘
                              │
                              ▼
                    raw/parsed/...v1.json
                    （格式完全一致，不区分来源）
                              │
                              ▼
                    下游 skill 继续处理
```

### 10.4 Parsed 的状态

Parsed 文件使用以下状态：

| `parsed_status` | 含义 | 谁生成的 |
|-----------------|------|---------|
| `full` | 高置信度完成 schema 字段提取，整体和必填/关键字段均达到运行时阈值 | document-parsing skill |
| `human_review_required` | 中等置信度、关键字段不足、字段矛盾或需要人工确认 | OCR MCP 或 AI |
| `quality_too_low` | 文档质量或整体置信度过低，重试/换路径后仍无法稳定提取 | OCR MCP 或 AI |

不同状态的 parsed 文件写到同一目录、同一格式；下游按 `parsed_status` 判断是否应等待复核。

### 10.5 Skill 的文件结构

```
skills/document-parsing/
├── SKILL.md                      ← 主工作流定义
├── references/
│   ├── document-types.md          ← 支持的文档类型清单和识别指南
│   ├── parsing-workflow.md        ← 详细解析工作流
│   └── quality-control.md         ← 质量控制和置信度标准
└── document-extensions/           ← 占位（供其他 skill 扩展用）
```

---

## 11. 与现有架构的交互

### 11.1 与设计哲学的关系

| 设计哲学原则 | 本设计的体现 |
|-------------|------------|
| **Evidence-Centric**（证据中心） | Parsed 文件始终 `source_raw` 指向原始证据，字段级可追溯 |
| **Epistemic Layering**（认知分层） | Parsed 只记录"机器看到了什么"，不记录"调查员认为是什么"。后者进入认知层 |
| **Identity Resolution**（身份归一） | 文档中提取的实体名在 parsed 层不做归一（那是 ADMIT_CANDIDATE 的事） |
| **Temporal Integrity**（时态完整） | Parsed 文件记录 `parsed_at`（解析时间），版本链记录变更时间 |
| **Append-Only Evolution**（追加式演进） | Parsed 版本通过 `supersedes`/`superseded_by` 链管理，不覆盖删除旧版本 |

### 11.2 与本体层的交互

```
本体层 Action                 本设计的影响
─────────────────             ─────────────────
ACQUIRE_EVIDENCE              Evidence.integrity.raw_file_path → raw/
                              不变。parsed 是 raw 的结构化延伸，不影响本体层。

ADMIT_CANDIDATE               Skill 层从 parsed 中提取实体信息后，
                              仍通过 ADMIT_CANDIDATE 创建 UNRESOLVED Entity。
                              parsed 的字段级数据帮助人工裁决。

ASSERT_RELATION               parsed 中提取的金额/日期等信息，
                              经核实后写入 Relation 的 properties。
```

### 11.3 与认知层的交互

```
认知层节点                   本设计的影响
───────────                  ─────────────────
EV 节点 (evidence)           derived_from → parsed（不再是 raw）
                             字段数据从 parsed 读取，而非直接从 OCR 输出

ENT 节点 (entity)            实体信息从 parsed 的结构化字段中提取
                             而非从 unstructured OCR 文本中猜测

LS/ARG/FND                   不变——它们仍然引用 EV 节点，
                             不直接引用 parsed
```

### 11.4 与 Binding Protocol 的关系

**Parsed 层不参与 Binding Protocol**。Binding Protocol 定义的是认知层与本体层的映射，parsed 是原始层的结构化延伸，不映射到任何本体对象。

```
Binding Protocol 范围:
  认知层 (nodes/)  ←→  本体层 (global_ontology/)
  不受 parsed 层影响

Parsed 层的作用域:
  raw/parsed/  ←→  raw/    (原始文件)
  只在 document-parsing skill 内部使用
```

### 11.5 与 cold-start 的关系

在 cold-start 的 `--check-integrations` 阶段新增 OCR 检测和引导配置（见第 8.3 节）。

### 11.6 与 order-execution-variance-analysis 的关系

差异分析 skill 是 parsed 层的消费者之一——它从 parsed 的结构化字段中获取合同/发票/签收单的关键数据，对比申报值与实际值。

```
差异分析             parsed 提供的数据
───────             ──────────────────
合同流对比           parsed(CONTRACT).fields.party_A / party_B / amount
发票差异             parsed(INVOICE).fields.total_amount / invoice_no
签收核对             parsed(DELIVERY_NOTE).fields.receiver / date / items
```

---

## 12. 边界与约束

### 12.1 什么进 Parsed 层，什么不进

| ✅ **进 Parsed（raw/parsed/）** | ❌ **不进 Parsed** |
|-------------------------------|------------------|
| 文档上**直接写明的字段**（金额、日期、发票号） | **跨文档对比结论**（"发票金额和合同不一致"） |
| OCR 的**原始输出和字段级置信度** | **分析推理**（"这可能是虚构交易"） |
| **人工修正的原文→改文记录** | **实体归一化**（"这两个公司名指向同一实体"） |
| 多版本解析结果（版本链） | **关系断言**（"A 向 B 付款"——那是 Relation） |

**判断标准**：Parsed 只回答"文档上写了什么"，不回答"这意味着什么"。

### 12.2 Parsed 层不参与的

| 不参与的事项 | 理由 |
|------------|------|
| Layer 3 PreToolUse Hook 校验 | Parsed 不是本体对象，不进入治理校验范围 |
| Binding Protocol | Parsed 不映射本体对象 |
| evidence_registry.json | Parsed 是中间层，不进入案件核心索引 |
| chain_nodes 索引 | 不纳入认知层节点图 |

### 12.3 安全约束

| 约束 | 说明 |
|------|------|
| HTTP API Key 加密存储 | OCR 服务的 API Key 不应明文存储在 team-profile.md 中。建议使用环境变量或加密存储 |
| Parsed 文件敏感信息 | parsed JSON 中包含文档的具体金额、公司名等敏感信息，应与 raw 文件同级权限管理 |
| Pipeline 运行环境 | parse-document.py 已废弃（见第 9 节）。OCR MCP 服务器应在调查员本地或受控内网环境中运行，不应暴露到公网 |

---

## 13. 实现路线图

### Phase 1: Schema 定义（独立，不影响现有功能）

```
[ ] schemas/document-types/invoice.yaml
[ ] schemas/document-types/contract.yaml
[ ] schemas/document-types/bank_receipt.yaml
[ ] schemas/document-types/delivery_note.yaml
[ ] schemas/document-types/generic.yaml
```

### Phase 2: ~~Pipeline 脚本~~（已废弃）

~~scripts/parse-document.py~~ — 已被 OCR MCP（paddleOCR-mcp）替代，不再需要独立 Pipeline 脚本。

### Phase 3: document-parsing Skill

```
[ ] skills/document-parsing/SKILL.md
[ ] skills/document-parsing/references/*.md
```

### Phase 4: team-profile.md 配置扩展

```
[ ] team-profile.md 新增"文档解析服务"节
[ ] cold-start 集成检测扩展 → --check-integrations 新增 OCR 检测
```

### Phase 5: 下游适配

```
[ ] evidence-management skill: EV 节点创建时关联 parsed
[ ] ontology skill: ADMIT_CANDIDATE 时从 parsed 字段提取信息
[ ] order-execution-variance-analysis: 适配 parsed 结构化数据
[ ] UI 模板: 渲染 EV 节点时自动解析 ontology_ref → raw_file_path
```

---

## 附录 A：术语表

| 术语 | 含义 |
|------|------|
| **raw** | 原始文件（扫描件/PDF/图片），不可变 |
| **parsed** | 结构化解析结果，包含字段值、置信度、版本链 |
| **parsed_id** | Parsed 文件的全局唯一 ID，格式 `PARSE-{TYPE}-{raw_id}-v{version}` |
| **GENERIC** | 无预定义格式的兜底文档类型，仅做 OCR 文本提取 |
| **document-parsing skill** | 统筹 raw → parsed 全流程的新 Skill |
| **parse-document.py** | ~~可选的 Pipeline 加速脚本~~（已废弃，被 OCR MCP 替代） |
| **版本链** | Parsed 文件通过 `supersedes`/`superseded_by` 形成的版本历史 |
| **字段级置信度** | 每个结构化字段单独记录的 OCR/解析置信度 (0.0-1.0) |

## 附录 B：与其他设计文档的关联

| 文档 | 关联说明 |
|------|---------|
| `design-phylosophy.md` | 本设计是其三层架构（原始层→本体层→认知层）的中间层补充 |
| `skills/evidence-management/SKILL.md` | 消费者——EV 节点 `derived_from` 指向 parsed |
| `skills/ontology/SKILL.md` | 消费者——ADMIT_CANDIDATE 从 parsed 字段提取信息 |
| `skills/order-execution-variance-analysis/SKILL.md` | 消费者——差异分析使用 parsed 的结构化数据 |
| `config-templates/team-profile.md` | 被扩展——新增"文档解析服务"配置节 |
| `config-templates/config-loader.md` | 不修改——parsed 层不通过 config-loader 管理 |
| `mcp-configs/mcp-servers.json` | 扩展——新增 OCR 类 MCP 的目录条目 |