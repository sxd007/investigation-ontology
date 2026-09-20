# Policy Digest 0.2.0 输出契约

## 1. 分层与单一真相源

成果包采用四个数据/视图层，并附一个独立解释界面：

1. `normalized.parsed.json`：结构与锚点层，兼容 parsed schema 0.1.0。
2. `digest.json`：完整分析的单一真相源，遵循 Policy Digest schema 0.2.0。
3. `candidates.json`：面向本体审核和摄取的窄化交换层；Rule Obligation、参数和流程生成区域从 digest 机械投影，共享 Clause、alignment、Core 选择等本体决策从已有候选保留，兼容 candidates schema 0.3.0。
4. `digest.md`：从 digest 生成的人读视图，不承载独有事实。
5. `explanation.html`：从 digest、parsed 和 candidates 层生成的原文对照式审阅界面，可离线独立打开，不承载独有事实。

流程建模使用三个彼此独立的真相源：

- `process_elements[]`：L1–L5 父子层级；
- `flow_edges[]`：单个 L3 内的业务顺序；
- `artifacts[]`：流程输入输出及跨 L3 衔接。

不得用文档章节层级替代流程层级，不得用 `flow_edges[]` 表达父子关系，也不得用跨 L3 顺序边替代 Artifact 交接。

机器契约位于 `./schemas/`。0.2.0 是当前默认；0.1.0 仅用于读取和显式迁移。

## 2. 通用来源与审核记录

每条规则、流程元素、目标、Artifact、边、RACI、风险和控制必须包含可定位来源：

```json
{
  "source": {
    "doc_id": "ACME-POL-001",
    "block_id": "b-001",
    "block_path": "ch3/art15/para2",
    "clause_ref": "第十五条",
    "page_hint": 12,
    "excerpt": "不超过 200 字的原文摘录"
  },
  "review": {
    "status": "proposed",
    "pool": "full",
    "reviewer": null,
    "timestamp": null
  }
}
```

重定位优先使用 `block_path + excerpt`。只有页码而无结构路径或摘录，不足以支持入库。AI 初始记录统一为 `proposed`；推断层级必须进入 `full` 审核池。

## 3. digest.json 顶层

```json
{
  "digest_schema_version": "0.2.0",
  "digest_id": "PD-ACME-POL-001-v2",
  "case_id": "CASE-2026-001",
  "status": "review_required",
  "generated_at": "ISO 8601",
  "source_index_ref": "source-index.json",
  "document_identity": {},
  "scope": {},
  "rules": [],
  "process_elements": [],
  "process_objectives": [],
  "artifacts": [],
  "flow_edges": [],
  "role_assignments": [],
  "risks": [],
  "controls": [],
  "issues": [],
  "graph": {},
  "pending_confirmations": [],
  "ontology_projection": {}
}
```

状态含义：

- `draft`：解析、Core 版本或必要上下文未完成；
- `review_required`：存在 proposed、unresolved 或 blocking 项；
- `ready_for_ingestion`：blocking 清零、候选经人工确认且通过确定性校验；
- `superseded`：已有替代版本。

## 4. 规则与分层流程

### 4.1 核心规则

`rules[]` 保存原文、分诊类型、适用主体、触发、要求、参数、证据、例外、置信度和 candidates 引用。`operationalized_by[]` 可引用任一流程层级元素。程序条款仍须保留 Clause 和义务转写，流程结构不能替代规范语义。

### 4.2 流程元素

每个 `process_elements[]` 必须包含：

- `element_id`、`level`、`rdf_type`、`name`；
- `parent_ref`、`owning_process_ref`；
- `objective_refs[]`、`owner_role_refs[]`；
- `input_artifact_refs[]`、`output_artifact_refs[]`；
- `entry_conditions[]`、`exit_conditions[]`；
- `decomposition_basis`、`hierarchy_status`、`hierarchy_confidence`、`alternative_levels[]`；
- `source`、`review`、`candidate_refs[]`。

级别与类型固定映射：

| level | rdf_type |
|---|---|
| L1 | `proc:ProcessCategory` |
| L2 | `proc:ProcessGroup` |
| L3 | `proc:Process` |
| L4 | `proc:ProcessActivity` |
| L5 | `proc:Task` |

约束：

- `parent_ref` 只能连接相邻级别；L1 无父级；禁止环。
- L3 的 `owning_process_ref` 指向自身；L4/L5 指向最近所属 L3；L1/L2 为 null。
- `hierarchy_confidence.overall` 必须严格等于 evidence、boundary、parent、granularity 的最低值。
- 推断元素必须 `review.pool: full`。
- 已解析 L3 至少拥有目标、入口条件、一个 L4 和输出 Artifact；证据不足时标记 unresolved 并阻断入库。

### 4.3 流程目标

`process_objectives[]` 包含 `objective_id`、`statement`、可选父目标、`element_refs[]`、`assertion_basis`、来源、审核及 candidates 引用。目标必须有 `proc:ProcessObjective` proposal，关联元素通过 `hasObjective` 投影。

### 4.4 Artifacts

`artifacts[]` 包含 `artifact_id`、名称、类型、`produced_by[]`、`consumed_by[]`、字段要求、保存要求、来源、审核及 candidates 引用。

- Artifact 必须有 `proc:Artifact` proposal。
- `produced_by` 必须与生产元素的 `output_artifact_refs` 双向一致。
- `consumed_by` 必须与消费元素的 `input_artifact_refs` 双向一致。
- candidates 中分别使用 Process Core 原生 `hasOutput`、`hasInput` 关系。

### 4.5 流转边

`flow_edges[]` 包含 `edge_id`、`process_ref`、`from_ref`、`to_ref`、`edge_kind`、条件及参数、来源、审核和必填的 `candidate_refs[]`。

- 两端必须属于 `process_ref` 指定的同一 L3。
- `main` 边投影为目标活动的 `precededByActivity`。
- `conditional`、`escalation`、`reject`、`return`、`termination`、`emergency` 边投影为 candidates `transitions[]`，其 `transitionKind` 分别为大写 `CONDITIONAL`、`ESCALATION`、`REJECT`、`RETURN`、`TERMINATION`、`EMERGENCY`。
- 同一活动对禁止同时作为 main 和 transition；循环边必须有条件。

transition 固定使用 `localId`、`fromActivity`、`toActivity`、`transitionKind`，可选 `condition` 和 `conditionParams[]`。完整的包级机械约束见 [校验契约速查](validation-cheat-sheet.md)。

## 5. 权责、风险与控制

- `role_assignments[]` 使用 `element_ref`，可绑定任一层级；每个 L3/L4 至少一个 R，L3 原则上只有一个 A。
- `risks[]` 使用 `rule_refs[]` 和 `element_refs[]`；分析推断与制度明文分别标记 `assertion_basis: analysis | explicit_text`。
- `controls[]` 使用 `element_ref` 和 `risk_refs[]`，保存措施、判断标准、频率、证据及整改要求。
- 问题及建议保存在 `issues[]`，不投影到 candidates。
- `graph` 仅是派生视图索引，不重复保存层级或业务语义。

## 6. candidates 0.3.0 投影

每份文档单独生成 candidates 文件。候选必填 `candidateId`、`sourceBlock`、`disposition`、`confidence`、`coreVersion`、`produces`、`reviewPool` 和 `review`。

层级映射暂不修改 Process Core。每个流程元素 proposal 在 `properties` 中使用：

- `efio:hierarchyLevel`；
- 非 L1 元素的 `efio:parentElement`；
- L3–L5 元素的 `efio:owningProcess`；
- `efio:mappingStatus: PENDING_CORE_ALIGNMENT`。

`ontology_projection.hierarchy_mapping` 固定声明：

```json
{
  "mode": "candidates_extension",
  "extension_prefix": "efio",
  "serialization_policy": "PENDING_CORE_ALIGNMENT"
}
```

这些扩展是 candidates 层的临时兼容映射；未经 Core 对齐不得宣称已稳定序列化到 Enterprise TTL。目标、输入和输出继续使用 `hasObjective`、`hasInput`、`hasOutput` 等 Process Core 原生关系。

当前 0.2.0 正向投影器覆盖生成 candidate 来源/分类、每条非空 requirement 的 Obligation、parameter target、流程层级、目标、Artifact 和流程边，并从 seed candidates 保留候选 ID、共享 Clause、alignment、candidate Core 选择和审核数据。生成与保留边界见 [Digest → Candidates 正向投影契约](candidates-projection-contract.md)；不得让投影脚本猜测尚未固化的本体语义。

其余投影纪律：

- 每个 parameter 的 `target` 必须存在，并指向本成果包 `produces[]` 中 rdfType 以 `Obligation` 结尾的 localId。Candidates 0.3.0 vendored Schema 未将它声明为必填，此跨 proposal 约束由 Policy Digest 校验器执行；
- transition 两端指向本文件流程活动；
- alignment 目标含 docId、blockPath 和 excerpt；
- `valueNumber` 保存规范化数值，`value` 保留权威字面量；
- 问题清单、质量评分和展示配置不得写入 candidates。

## 7. 0.1.0 迁移

运行 `node ../scripts/migrate-policy-digest-0.1-to-0.2.mjs <package-directory>` 生成并列的 `digest.v0.2.json` 与 `candidates.v0.2.json`；仅在明确需要覆盖且已接受自动备份时添加 `--in-place`。

迁移器将旧 `activities[]` 转成待判定的 L4 元素，不猜测 L1–L3 父级，并创建 blocking 层级复核项。迁移结果不是可入库成果，必须人工补齐父级、目标、入口、输出 Artifact、归属 L3、置信度和 candidates 投影后重新校验。

## 8. 多文档集合

`document-set.json` 至少保存成员、路径、文档关系、效力排序证据和未决项。比较键增加流程层级、目标和 Artifact。跨文档冲突必须引用双方锚点；无明确效力依据时只报冲突候选，不裁定有效性。

## 9. 独立解释界面

`explanation.html` 由 `../scripts/generate-policy-digest-explanation.mjs` 确定性生成。它必须允许非技术审阅者：

1. 从原文块查看条款编号、结构路径、页码、解析置信度和待核状态；
2. 点击流程元素查看其层级、父级、归属 L3、分层依据及置信度；
3. 按 L3 查看流程内流转和 Artifact 生产/消费；
4. 查看每项 RACI、规则、目标、风险和控制的独立来源；
5. 区分 `explicit_text`、`inferred_structure`、`analysis` 和 unresolved；
6. 搜索、打印并在无网络环境打开。

界面的说明文字只解释记录类型和映射方法，不得对具体制度增加结论。嵌入数据必须进行脚本上下文转义；页面不得加载 CDN、字体、统计脚本或其他外部资源。

## 10. 交付前校验

运行 `../scripts/validate-policy-digest.mjs <package-directory>`。校验至少覆盖：

1. 三层 JSON Schema、ID 唯一性和锚点可定位性；
2. 原文块反向覆盖：每个非标题 parsed 块已被引用或在 `skipped_blocks` 显式声明跳过（`ready_for_ingestion` 时无处置块阻止交付）；
3. 相邻父层、层级无环、L3 归属、置信度保守性、推断层级全审；
4. 已解析 L3 的活动、目标、入口和输出完整性；
5. 目标与 Artifact proposal、原生关系投影及 Artifact 双向引用；
6. 同一 L3 内流转、main/transition 单源纪律及 candidates 投影；
7. RACI、风险、控制、规则和 candidate 引用完整性；
8. `ready_for_ingestion` 不含 blocking、unresolved 或 proposed；
9. `digest.md` 包含六表一图章节并呈现全部结构化记录 ID。
10. 导览生成器可从已校验包生成单文件 HTML，所有可审阅记录保留来源键。

ERROR 阻止交付；WARN 必须在人审说明中处置。
