---
name: document-parsing
description: >
  当用户提供原始文档（PDF/扫描件/图片/Word/Excel）需要提取信息或结构化处理时，必须使用本技能。
  本技能是 OCR MCP 的上层编排者——不要直接调用 paddleOCR-mcp，应由本技能的工作流决定何时调用 OCR。
  工作流：文档类型识别(INVOICE/CONTRACT/BANK_RECEIPT/...) → 格式感知路由(图片走OCR/数字文档AI直接读取) →
  schema结构化提取 → 字段级质量评估 → 版本管理 → 写入 raw/parsed/。
  输出供 evidence-management（创建 EV 节点）和 ontology（创建实体/关系）消费。
  也可通过 /efio:parse 命令触发。
origin: efio
---

# 文档结构化解析

将原始文档（扫描件/PDF/图片）转化为按文档类型 schema 结构化的 parsed JSON。本 skill 是原始层与认知层/本体层之间的**桥梁**——它不创建任何认知节点或本体对象，只负责"把文档上的文字变成可消费的结构化数据"。

## 配置前置检查

在执行本技能的业务操作前，按以下流程检查用户配置：

```
检查 {配置路径}/team-profile.md
├── 不存在 / 含 [PLACEHOLDER] / 含 PAUSED 标记
│   └── 自动进入 /efio:cold-start 配置向导，完成后继续当前操作
└── 配置就绪 → 继续
```

详细规则参见 `config-templates/config-loader.md`。

此技能读取的配置项：
- team-profile「文档解析服务」节：HTTP API / 本地引擎配置（**可选**）
- `{PLUGIN_CONFIG_DIR}/ocr-backend.md`：OCR MCP 的文档投递机制配置（**可选**——不存在时回退到端口+1约定推导，详见 `config-templates/ocr-backend.md`）

## When to Activate

- 调查员提供了新的原始文档（PDF/扫描件/图片），需要提取结构化信息
- 现有 parsed 结果被标记为低置信度，需要重新解析
- 人工复核后需要生成修正版本（v2/v3）
- 收到了新版本的 OCR 模型，需要对已有文档升级解析
- 其他 skill（evidence-management / ontology）请求解析某份 raw 文件

## 核心工作流

本 skill 的核心产出是将一份 raw 文件转化为对应文档类型的 parsed JSON。整个流程由五个步骤组成：

```
收到 raw 文件
    │
    ▼
Step 1 ── 确定文档类型
    │       根据指定/文件名/AI判断 → INVOICE / CONTRACT / BANK_RECEIPT / ...
    │
    ▼
Step 2 ── 选择解析策略
    │       格式感知路由：OCR MCP / AI 直接读取 / AI 视觉
    │
    ▼
Step 3 ── 执行解析
    │       OCR MCP 调用 / AI 直接读取 / AI 视觉 fallback
    │
    ▼
Step 4 ── 质量评估
    │       字段级置信度检查 → 通过/待复核/重试
    │
    ▼
Step 5 ── 版本管理与写入
            检查历史版本 → 生成 v1/v2/v3 → 写入 raw/parsed/
```

### Step 1: 确定文档类型

#### 决策树

```
需要解析一份 raw 文件
    │
    ├── 调用方指定了文档类型（--type INVOICE）
    │   └── → 直接使用指定类型
    │
    ├── 文件名包含类型关键词
    │   ├── *发票* → INVOICE
    │   ├── *合同* → CONTRACT
    │   ├── *回单* / *流水* / *付款凭证* → BANK_RECEIPT
    │   ├── *签收* / *送货* / *发货* / *收货* → DELIVERY_NOTE
    │   ├── *订单* / *采购* / *PO* → PURCHASE_ORDER
    │   └── 无匹配 → 进入 AI 视觉判断
    │
    ├── AI 视觉判断
    │   ├── 能识别文档类型 → 按对应 schema
    │   └── 无法识别 → GENERIC
    │
    └── 完全无信息（纯数字文件名等）
        └── → GENERIC
```

#### 支持的文档类型

预定义文档类型见 `../../schemas/document-types/` 目录。当前支持：

| 文档类型 | Schema 文件 | 典型场景 |
|---------|------------|---------|
| INVOICE | `invoice.yaml` | 增值税专用/普通发票、数电票、机动车/二手车发票 |
| CONTRACT | `contract.yaml` | 采购/销售/服务/租赁/工程/代理合同 |
| BANK_RECEIPT | `bank_receipt.yaml` | 银行转账回单、电子回单、代发回单 |
| DELIVERY_NOTE | `delivery_note.yaml` | 送货单、签收单、发货单、运单 |
| PURCHASE_ORDER | `purchase_order.yaml` | ERP 采购订单、手工采购单、请购单 |
| GENERIC | `generic.yaml` | 无预定义格式的兜底——仅做 OCR 文本提取 |

### Step 2: 选择解析策略（格式感知路由）

根据**文件格式**选择最佳解析方式。核心原则：OCR 只用于需要它的文件（图片/扫描件），其他格式走更高效的路径。

#### 格式路由表

| 文件格式 | 扩展名 | 解析路径 | 说明 |
|---------|--------|---------|------|
| 图片 | .jpg .jpeg .png .tiff .bmp | OCR MCP | 上传 → 调用 OCR 工具 |
| 扫描 PDF | .pdf（无可选文本） | OCR MCP | 上传 → 调用 OCR 工具 |
| 数字 PDF | .pdf（有可选文本） | AI 直接读取 | Claude 可直接提取文本 |
| Word 文档 | .doc .docx | AI 直接读取 | Claude 可直接读取 .docx |
| Excel/CSV | .xlsx .xls .csv | AI 直接读取 | Claude 可直接解析表格结构 |
| 纯文本 | .txt .md .json .xml | AI 直接读取 | 直接读取文件内容 |
| 其他/未知 | — | AI 视觉尝试 | 失败则 GENERIC |

#### 路由决策流

```
收到 raw 文件
    │
    ├── 图片格式 → OCR MCP 路径
    │   上传文件到 OCR 服务器 → 获取 localpath → 调用 OCR 工具
    │   → parsed_by: "ocr_mcp"
    │
    ├── PDF 格式 → 检测是否为扫描件
    │   ├── 无文本（扫描件）→ OCR MCP 路径
    │   └── 有文本（数字 PDF）→ AI 直接读取 → parsed_by: "ai_direct"
    │
    ├── Office / 表格 / 文本 → AI 直接读取
    │   → parsed_by: "ai_direct"
    │
    └── OCR MCP 不可用 或 未知格式 → AI 视觉 fallback
        → parsed_by: "ai_vision"
```

#### OCR MCP 调用流程（图片 / 扫描 PDF 路径）

> ⚠️ **禁止自行创建 HTTP 服务器、编写上传脚本或搭建 Web 服务。** OCR MCP 已作为独立服务部署，文档投递机制由 `{PLUGIN_CONFIG_DIR}/ocr-backend.md` 配置。

> 📖 **执行 OCR 路径前，必须先读取 `references/ocr-mcp-integration.md`** 获取完整参数说明和错误处理策略。以下为关键步骤速查。

**Step 2a — 读取 OCR 后端配置**

读取 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`（路径按 `config-loader.md § 平台路径` 解析），获取文档投递配置：

| 配置值 | 行为 |
|--------|------|
| `Upload Method: auto` | 从 MCP URL 推导上传地址（同主机、端口+1、/upload） |
| `Upload Method: http` + `Upload Endpoint` | 使用配置中显式指定的上传地址 |
| `Upload Method: shared_fs` + `Shared Path Prefix` | 文件已在共享路径，无需上传，直接映射路径 |
| `Upload Method: custom` + `Custom Upload Instructions` | 按自定义指令投递文件 |
| 配置中有 `Auth Headers` | 上传请求携带相同认证头 |

> ocr-backend.md 不存在时的回退：端口+1 约定推导（从 MCP URL 推导上传地址）→ 推导失败则降级 AI 视觉解析，提示运行 `/efio:cold-start`。

**Step 2b — 投递文件到 OCR 服务器**

根据 Step 2a 的配置投递文件，获取服务器侧路径（localpath）：

- **http / auto 路径**：`curl -X POST <upload-url> [-H "<auth-headers>"] -F "file=@<文件绝对路径>" 2>nul`，从响应 JSON 的 `Localpath Field` 字段提取 localpath
- **shared_fs 路径**：客户端文件须已在共享文件系统中可访问（如通过 NFS/SMB 挂载）。localpath = `<Shared Path Prefix>` + 文件基本名（basename，不含目录路径）。例如客户端文件 `D:\cases\raw\ev-010.jpg`，`Shared Path Prefix` 为 `/mnt/shared/ocr_uploads/`，则 localpath = `/mnt/shared/ocr_uploads/ev-010.jpg`
- **custom 路径**：按 `Custom Upload Instructions` 执行

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

#### 质量提升策略

```
解析完成后检查置信度
    │
    ├── 所有字段 confidence ≥ 0.90 → 直接通过
    │
    ├── 关键字段 confidence < 0.80
    │   ├── OCR MCP 路径 → AI 视觉补充关键字段
    │   ├── AI 直接读取路径 → AI 重新审视对应段落
    │   └── 仍不达标 → 标记 human_review_required
    │
    └── 整体 confidence < 0.60 → 触发 AI 重解析，生成新版本
```

### Step 3: 执行解析

按选择的策略和文档类型 schema 执行结构化解析。结果包含：

```
对于 INVOICE / BANK_RECEIPT / PURCHASE_ORDER：
  → 按结构化字段逐项提取（金额、日期、名称等）
  → 每个字段记录 value + confidence + raw_text

对于 CONTRACT：
  → 封面字段结构化提取
  → 签约主体 parties[] 提取（首页 + 签署页融合）
  → 正文按标准节切分 sections[]（匹配预设标准节骨架）
  → 嵌入的表格 tables[] 保留行列结构
  → 检测缺失的标准节，生成 missing_sections_warnings[]

对于 GENERIC：
  → 提取全文 raw_text + 版面分块 raw_text_blocks[]
```

#### 标准节骨架（仅 CONTRACT）

合同正文解析时按以下标准节匹配。不匹配任何标准节的标题归为 `other_clause`：

| section_id | 匹配关键词 | 调查关注 |
|-----------|-----------|---------|
| subject | 合同标的 / 项目内容 / 服务范围 / 采购内容 | 交付物描述模糊或缺失 → 可能虚构交易 |
| price_payment | 合同价款 / 付款方式 / 费用与支付 | 付款条件异常宽松 → 资金挪用信号 |
| delivery_acceptance | 交付 / 验收 / 交货 / 安装调试 | 验收标准缺失 → 虚假交付难以发现 |
| penalty | 违约 / 违约责任 / 赔偿 | 无违约条款或违约金极低 → 可能是虚假合同 |
| dispute | 争议 / 管辖 / 仲裁 | 管辖地与合同履行地无关 → 异常信号 |
| confidentiality | 保密 / 商业秘密 / 机密 | — |
| term | 期限 / 有效期 / 生效 / 终止 | — |
| termination | 解除 / 终止 / 提前终止 | — |
| signature | 签署 / 签章 / 签字 / 盖章 | 盖章主体与合同乙方不一致 → 挂靠/转包信号 |
| force_majeure | 不可抗力 | — |
| other_clause | （未匹配） | 原文保留 |

### Step 4: 质量评估

解析完成后按以下标准评估质量：

```
检查所有必填字段
    │
    ├── 所有字段 confidence ≥ 0.90
    │   └── 标记 parsed_status: "full"
    │       写入 parsed 文件
    │
    ├── 关键字段（金额/日期/主体名称）confidence < 0.80
    │   ├── 有 OCR 配置 → 触发重解析或用 AI 补充
    │   ├── 无 OCR 配置 → AI 视觉重新读取特写区域
    │   └── 仍不达标 → 标记 "human_review_required"
    │       写入 parsed 文件，等待人工复核
    │
    ├── CONTRACT 的标准节缺失
    │   └── 在 missing_sections_warnings[] 中记录警告
    │       正常写入 parsed 文件，不阻止流程（缺失是风险信号，不是错误）
    │
    └── 整体置信度 < 0.50（文档质量极差）
        └── 标记 "quality_too_low"
            提示调查员：该文档清晰度过低，建议提供更好的扫描件
```

### Step 5: 版本管理与写入

#### 版本规则

```
检查 raw/parsed/ 下是否有该 raw 的历史 parsed 文件
    │
    ├── 无历史版本
    │   └── 写入 {TYPE}-{raw_id}_v1.json
    │       supersedes: null
    │
    ├── 有历史版本
    │   ├── 本版本显著优于旧版（置信度提升或修正人工错误）
    │   │   └── 写入 {TYPE}-{raw_id}_v{latest+1}.json
    │   │       supersedes: 旧版本 ID
    │   │
    │   └── 本版本与旧版差异不大
    │       └── 不创建新版本，保留现有 parsed
    │
    └── 人工复核修正
        └── 写入 {TYPE}-{raw_id}_v{latest+1}.json
            supersedes: 旧版本 ID
            human_review: { reviewed_by, corrections[] }
```

#### 写入位置

```
raw/parsed/{DOCUMENT_TYPE}-{raw_file_id}_v{version}.json
```

示例：
- `raw/parsed/INVOICE-ev-010_v1.json` — 发票首次解析
- `raw/parsed/INVOICE-ev-010_v2.json` — 重解析或人工修正
- `raw/parsed/CONTRACT-ev-011_v1.json` — 合同解析
- `raw/parsed/GENERIC-ev-012_v1.json` — 通用兜底

## parsed 文件格式总览

所有文档类型的 parsed 文件共享以下顶层结构。具体字段因文档类型而异，见对应 schema 文件。

```json
{
  "parsed_id": "PARSE-INVOICE-ev-010-v1",
  "document_type": "INVOICE",
  "source_raw": "raw/ev-010_invoice.pdf",
  "parsed_by": "ocr_mcp",            // ocr_mcp | ai_direct | ai_vision | human_review
  "parsed_status": "full",           // full | human_review_required | quality_too_low
  "parsed_at": "2026-06-30T09:15:00Z",

  "supersedes": null,
  "superseded_by": null,

  "fields": { ... },                 // 按文档类型 schema 定义的字段

  "human_review": null               // 人工复核记录（如有）
}
```

完整格式说明见 `../../docs/document-parsing-design.md`。

## 与其他技能的交互

> **职责边界：** 本 skill 只产出 `raw/parsed/*.json`。创建 EV 证据节点是 evidence-management 的职责，创建本体实体/关系是 ontology 的职责。**不要在解析过程中自动执行这些操作。** 解析完成后提示用户使用 `/evidence add` 和 ontology 技能完成后续注册。

### 与 evidence-management 的交互

本 skill 的 parsed 输出是 evidence-management skill 创建 EV 节点的数据来源：

```
本 skill 输出:                  evidence-management 消费:
─────────────────              ──────────────────────
parsed.fields                  EV 节点 derived_from → parsed
parsed.parties[]               ENT 节点（组织/人员）
parsed.fields.payer/payee      ENT 节点 + Relation 线索
```

### 与 ontology 的交互

本 skill 不直接创建任何本体对象。parsed 中的实体信息由 ontology skill 通过 ADMIT_CANDIDATE Action 写入本体层：

```
parsed 中的信息              ontology skill 的操作
─────────────────           ──────────────────────
payer_name / payee_name     ADMIT_CANDIDATE → Organization (UNRESOLVED)
signatory                   ADMIT_CANDIDATE → Person (UNRESOLVED)
bank_account                ADMIT_CANDIDATE → Account (UNRESOLVED)
```

### 与 order-execution-variance-analysis 的交互

差异分析 skill 直接消费 parsed 的结构化字段进行申报值与实际值的对比：

```
parsed 数据                  差异分析场景
─────────                   ────────────
INVOICE.total_amount        发票金额 vs 申报金额
CONTRACT.parties[]          合同签署方 vs 申报渠道层级
DELIVERY_NOTE.receipt_date  实际签收日期 vs 系统记录
PURCHASE_ORDER.line_items   订购数量 vs 实际交付数量
BANK_RECEIPT.amount         实际付款金额 vs 合同约定金额
```

## 工具速查

| 命令/操作 | 用途 |
|----------|------|
| `解析 raw/ev-010.pdf` | 调用本 skill，自动识别类型并解析 |
| `--type INVOICE` | 指定文档类型，跳过类型识别步骤 |
| `--reparse` | 对已有 parsed 文件的 raw 重新解析 |
| `--review` | 查看待人工复核的 parsed 文件列表 |
| **`templates/parsed-review.html`** | 打开复核工具——左侧 raw 图像预览，右侧 parsed 字段对比

## 解析后端

本 skill 按文件格式自动路由到合适的解析后端：

- **OCR 文档识别类 MCP**（默认，图片/扫描 PDF）：已在用户级注册，开箱即用。调用流程为：读 `ocr-backend.md` 配置 → 投递文件获取 localpath → 调用 `pp_structurev3`。详见 `references/ocr-mcp-integration.md`。不可用时降级为 AI 视觉直接解析。**不要自行创建 HTTP 服务器或上传脚本。**
- **AI 直接读取**（默认，数字文档）：Claude 可直接读取数字 PDF、Word、Excel、CSV、纯文本等格式，按 schema 结构化提取字段。
- **HTTP API / 本地引擎**（可选扩展）：如需配置专业云 OCR 服务或本地引擎，见 `config-templates/team-profile.md`「文档解析服务」节。

## Related

- **Docs:** `../../docs/document-parsing-design.md` — 完整设计文档（含 schema 格式、版本管理、OCR 配置体系）
- **Schemas:** `../../schemas/document-types/` — 6 种文档类型的字段定义
- **Skills:** [证据链与底稿管理](../evidence-management/SKILL.md) — 消费 parsed 创建 EV 节点；[调查本体论](../ontology/SKILL.md) — 消费 parsed 创建本体实体/关系；[项目执行差异分析](../order-execution-variance-analysis/SKILL.md) — 消费 parsed 进行对比分析
- **Commands:** `/cold-start` — 首次设置引导 OCR 服务配置

## References

- `references/ocr-mcp-integration.md` — **OCR MCP 完整调用流程（上传→调用→参数→错误处理）。执行 OCR 路径前必须读取此文件。**
- `../../config-templates/ocr-backend.md` — OCR 后端配置模板（用户配置在 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`）
- `../../schemas/document-types/` — 6 种文档类型的完整字段定义
- `../../docs/document-parsing-design.md` — 完整设计文档