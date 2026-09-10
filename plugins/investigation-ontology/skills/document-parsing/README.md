# Document Parsing (技能说明)

简要说明与快速上手。

核心目的
- 将原始文档转换为可审计的结构化 `parsed` JSON，并持久化 OCR 原始输出供复核。
- 不在解析层做本体类型决策；本体决策由 `ontology` skill 完成。

快速上手
- 解析案例目录：
  - `efio parse <case-dir>` 或使用 `commands/parse.md` 中的命令。
- 强制复核：`efio parse <case-dir> --review` 或手动运行：
  ```powershell
  python skills\document-parsing\scripts\review-server.py --port 8899 --root <case-dir>
  ```
  然后打开：
  `http://localhost:8899/parsed-review.html?raw=raw/ev-010.jpg&ocr=raw/ocr_output/ev-010_ocr_v1.json&parsed=raw/parsed/INVOICE-ev-010_v1.json`

文件位置与约定
- 原始文件：`<case-dir>/raw/`。
- OCR 输出（已适配并持久化）：`<case-dir>/raw/ocr_output/{raw_id}_ocr_v{n}.json`。
- Parsed 结果：`<case-dir>/raw/parsed/{TYPE}-{raw_id}_v{n}.json`。
- 版本规则：append-only；新版本在旧版本写入 `superseded_by`。

已知限制
- 当前 MCP 返回 HTML/文本（无 bbox），复核界面以文本/表格并排对比为主；若 MCP 将来返回 bbox，可切换到增强模板。

更多细节与开发文档
- 权威设计文档（已合并并位于仓库根 docs）：
  - `docs/document-parsing-design.md`
- 实施与评估报告（已归档并移除重复副本）：如需查看历史评审，请参考 git 历史或联系维护者。

联系与维护
- 维护者: document-parsing skill owner
- 讨论/PR: 提交到本仓库 `cc-investigation-ontology`，在 PR 描述中注明影响的 schema 或模板。
