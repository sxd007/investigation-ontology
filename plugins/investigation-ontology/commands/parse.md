---
description: 文档解析入口 — 委派 document-parsing 技能将 raw 文档结构化为 parsed JSON
---

# /efio:parse

原始文档结构化解析的命令入口。此命令只负责收集参数、加载 `document-parsing` 技能并按技能规则执行；不要在命令文件中重复维护 OCR 投递、schema 提取、质量评估或复核工具的实现细节。

## Usage

```text
/efio:parse <file-path>                    解析指定文件，自动识别类型
/efio:parse <file-path> --type INVOICE     指定文档类型，跳过类型识别
/efio:parse <file-path> --reparse          对已有 parsed 的 raw 重新解析
/efio:parse <file-path> --review           解析后强制打开复核工具
/efio:parse --review                       查看或打开待人工复核的 parsed 文件
/efio:parse --status <raw-id>              查看某份 raw 文件的解析版本链
```

## Runtime Contract

执行本命令时必须：

1. 加载 `../skills/document-parsing/SKILL.md`。
2. 按 skill 的前置检查、文档类型识别、格式路由、提取、质量评估、版本写入和复核规则执行。
3. 如果路由到 OCR MCP，先读取 `../skills/document-parsing/references/ocr-mcp-integration.md`，再按其中规则投递文件和调用 OCR；不要直接绕过 skill 调用 paddleOCR-mcp。
4. 将解析结果写入 `raw/parsed/{TYPE}-{raw_id}_v{n}.json`。
5. 仅 OCR MCP 路径写入 `raw/ocr_output/{raw_id}_ocr_v{n}.json`，并在 parsed 中记录 `source_ocr`。
6. 根据 parsed 状态决定是否打开复核工具；优先使用 skill 定义的 `open_review` 运行时动作。

### 自然语言说明（轻量契约）

- 可选：调用方可在 API/CLI 中提供 `instructions`（string），用自然语言说明归档意图，例如：
	- 中文："把它归档到案件 C12345"、"只看一下，不归档"。
	- 英文："archive to case C12345"、"just preview, do not archive"。
- 优先级：显式 CLI/API 参数（如 `--case-root` / `case_root` / `--no-archive` / `archive=false`）优先；否则使用 `instructions` 解析意图；再无意图时使用环境检测（检测到案件根则归档）。
- 返回：命令应在结果中包含 `archived`（bool）、`case_root`（string|null）、`output_paths`（数组）与 `inferred_from`（"flag"|"instructions"|"env"）。

## Scope Boundary

`/efio:parse` 到写入 parsed JSON 为止。它不创建、修改或注册以下对象：

- EV 证据节点。
- ENT 或其他认知层节点。
- 本体实体、关系或候选节点。
- `evidence_registry.json`。

解析完成后，只提示用户下一步可使用 evidence-management 注册 EV，或由 ontology 层处理实体和关系。

## Output Summary

解析完成后向用户报告：

- raw 文件路径。
- parsed 文件路径。
- OCR output 路径（如有）。
- 文档类型。
- 解析路径：`ocr_mcp` / `ai_direct` / `ai_vision` / `human_review`。
- parsed 状态：`full` / `human_review_required` / `quality_too_low`。
- 关键低置信度字段、合同缺失节或其他复核警告。
- 复核 URL（如已打开或可手动打开）。

## Files Read

- `../skills/document-parsing/SKILL.md` — 本命令委派的技能规范。
- `../skills/document-parsing/references/ocr-mcp-integration.md` — OCR 路径的投递和调用规则。
- `../schemas/document-types/*.yaml` — 文档类型字段定义。
- `{PLUGIN_CONFIG_DIR}/ocr-backend.md` — OCR 后端投递配置，可选。
- `raw/` — 原始文件。
- `raw/parsed/` — 历史 parsed 文件，用于版本检查。

## Files Written

- `raw/parsed/{TYPE}-{raw_id}_v{n}.json` — 解析结果。
- `raw/ocr_output/{raw_id}_ocr_v{n}.json` — OCR 原始输出，仅 OCR MCP 路径。

## Related

- **Skill:** [文档结构化解析](../skills/document-parsing/SKILL.md)
- **OCR Reference:** [OCR MCP 集成](../skills/document-parsing/references/ocr-mcp-integration.md)
- **Docs:** [文档解析完整设计](../docs/document-parsing-design.md)
- **Next:** `/evidence add` — parse 完成后显式创建 EV 证据节点。
- **Next:** [调查本体论](../skills/ontology/SKILL.md) — 由 ontology 层判断实体类型并创建本体对象。
