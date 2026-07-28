# 案件文件写后校验方案

## 目标

防止 `evidence_registry.json` 和 `nodes/*` 中的结构错误被静默忽略，并确保可视化、推理链检查与正式输出消费同一套规范。

## 边界

### 纳入

- `evidence_registry.json` 对 `schemas/evidence-registry.schema.json` 的零依赖运行时校验。
- `nodes/*.md|json` 的必填字段、允许字段名、关系类型和关系项字段校验。
- `Write|Edit|MultiEdit` 后即时反馈。
- `--html` / `--json-dump` 前 Registry Schema 门禁。
- 非法 registry 元素的显式错误，禁止静默丢弃。

### 不纳入

- Hook 自动修改 registry 或节点。
- 写节点后自动执行 `--sync`；同步属于显式写操作，不应由校验器产生副作用。
- 通用 JSON Schema 引擎；当前实现覆盖项目 Schema 实际使用的 Draft-07 关键字。
- 终端、Git 或外部程序写入的实时拦截。

## 分层设计

1. **单文件写后反馈**：PostToolUse 识别 registry 或节点路径，运行全案 `--validate`，通过 `additionalContext` 要求当前 agent 修复。
2. **显式全案校验**：`scan-chain.js --validate` 同时执行 Registry Schema 和节点结构校验。
3. **输出门禁**：`--html` / `--json-dump` 遇到 Registry Schema ERROR 时终止，避免生成缺失节点的误导性结果。
4. **阶段门禁**：FIELDWORK/REVIEWING/CLOSED 仍应显式运行 `--validate`、`--integrity`、`--check-chains`。

## 严重度

- **ERROR**：JSON/Schema 类型、必填字段、枚举、ID 格式、未知关系、关系项缺少 ID。CLI 非零退出；输出门禁停止。
- **WARN**：未知 frontmatter 字段、废弃 `sources`、建议修正的关系项扩展字段。Hook 提醒修复，但不把文件回滚。
- **INFO**：保留给业务完整性提示，不用于结构门禁。

## 兼容性原则

- 零 npm/Python 运行时依赖，使用 Node.js 内置模块。
- CodeBuddy、Claude、Codex 三套 Hook 配置保持一致。
- Hook 兼容 `file_path`、`filePath`、`path`。
- registry 摘要条目不伪装成节点文件；两者分别校验。
- 不自动为字符串 finding 推断 ID，避免制造不稳定身份或覆盖现有 FND。

## 验收矩阵

| 场景 | 预期 |
|---|---|
| 合法 registry + 合法 FND | `--validate` 成功 |
| `findings[]` 为字符串 | `/findings/0` 类型 ERROR，非零退出 |
| `statment` 拼写错误 | 报未知字段并建议 `statement`，同时报告必填字段缺失 |
| `derive_from` 拼写错误 | 报未知关系并建议 `derived_from` |
| 非法 registry 生成 HTML | 阻止输出文件生成 |
| PostToolUse 写非法 registry | 返回包含校验详情的 `additionalContext` |
| PostToolUse 写合法 registry | 静默通过 |
| PostToolUse 写无关文件 | 快速静默退出 |

回归入口：`node scripts/test-case-validation.mjs`。

## 后续增强

- 增加 registry、`chain_nodes` 与节点文件的一致性检查。
- 将 Schema 校验覆盖扩展到 `meta.json`、`checklist.yaml` 和 `CHANGELOG.json`。
- 在发布构建具备依赖打包能力后，评估用 Ajv 替换专用 Schema 遍历器。
- 对 shell、外部程序和人工编辑增加 CI 或阶段门禁校验，而不是依赖 PostToolUse。
