# Policy Digest 0.2 校验契约速查

本页集中列出“单文件 Schema 合法”之外的成果包级机械约束。Schema 只验证单个 JSON 的形状、必填字段和枚举；校验器还会检查 parsed、digest、candidates 与 Markdown 之间的引用和投影一致性。因此：

> Schema-valid 只是第一关；package-valid 才表示成果包的确定性契约全部通过。两者都不代表业务语义已经人工确认。

## 1. 来源锚点

`normalized.parsed.json` 使用 camelCase；digest 的 `source` 使用 snake_case，两者不能混写。常见 parsed 对照如下：

| 旧字段/误用字段 | Parsed 0.1.0 字段 |
|---|---|
| `schema_version` | `parsedSchemaVersion` |
| `doc_id` | `docId` |
| `raw_ref` | `rawRef` |
| `block_id` | `blockId` |
| `block_type` | `blockType` |
| `block_path` | `blockPath` |
| `char_start` / `char_end` | `charStart` / `charEnd` |
| `clause_ref` | `clauseRef` |
| `parse_confidence` | `parseConfidence` |
| `needs_verification` | `needsVerification` |

检测到这类字段时，校验器会先给出 `parsed_field_naming_mismatch` 定向诊断。最稳妥的做法是保留 scaffold 生成的 parsed 结构并增量替换内容，而不是复制旧包结构。

- 每个 `source.excerpt` 必须是对应 parsed block 的 `text` 或 `anchor.excerpt` 经空白归一化后的连续子串。
- `document_identity.doc_id`、所有 digest `source.doc_id` 和 candidate `sourceBlock.docId` 必须等于 parsed `document.docId`。跨文档 alignment 的 `targetRef.docId` 不受此限制。
- `block_id/blockId` 必须存在；`block_path/blockPath` 必须与 parsed 完全一致。
- 摘录最长 200 字；不要改写、概括或拼接不连续原文。

常见错误：`source_doc_id_mismatch`、`anchor_block_missing`、`anchor_path_mismatch`、`anchor_excerpt_mismatch`。

## 2. candidate_refs

以下 digest 记录必须填写 `candidate_refs` 字段，且在进入 package validation 前明确为恰好一个 candidate ID：

- `rules[]`
- `process_elements[]`
- `process_objectives[]`
- `artifacts[]`
- `flow_edges[]`

投影器要求上述每条记录恰好一个 candidate_ref。数组中的 ID 必须指向 `candidates.json` 中真实存在的 `candidateId`。流程元素、目标和 Artifact 还必须存在对应的 `produces[].localId` proposal；每条非空 `rule.requirement` 必须在其引用的 candidate 中存在 `{rule_id}-OBLIGATION`。具体拆分规则见正向投影契约 §4.1。

常见错误：`schema_required`、`candidate_ref_cardinality`、`candidate_ref_missing`、`candidate_rule_obligation_missing`、`candidate_rule_statement_mismatch`、`digest_element_candidate_missing`、`candidate_objective_missing`、`candidate_artifact_missing`、`candidate_projection_drift`。

## 3. 层级与置信度

- `L1→L2→L3→L4→L5` 的父子只能相邻；L1 的 `parent_ref` 必须为 null。
- L3 的 `owning_process_ref` 指向自己；L4/L5 指向最近的 L3 祖先；L1/L2 为 null。
- `hierarchy_confidence.overall` 必须严格等于：

$$
\min(\text{evidence},\text{boundary},\text{parent},\text{granularity})
$$

- `decomposition_basis: inferred_structure` 必须使用 `review.pool: full`。
- resolved L3 必须有目标、入口条件、至少一个直接 L4 和至少一个输出 Artifact。

常见错误：`hierarchy_non_adjacent_parent`、`owning_process_invalid`、`hierarchy_confidence_not_conservative`、`inferred_hierarchy_not_full_review`、`process_*_missing`。

## 4. candidates 层级投影

每个流程 proposal 必须与 digest 同 ID、同 rdfType，并在 `properties` 中包含：

- `efio:hierarchyLevel`
- 非 L1：`efio:parentElement`
- L3–L5：`efio:owningProcess`
- 所有层级：`efio:mappingStatus: PENDING_CORE_ALIGNMENT`
- 目标：`hasObjective`
- 输入：`hasInput`
- 输出：`hasOutput`

这些 `efio:*` 键是临时交换映射，不是 Process Core 0.4.0 正式属性。

Package validator 会调用同一正向投影逻辑，对完整 candidates 结果做字节级确定性比较。proposal 状态、属性单双值、parameter/transition 顺序或 transition ID 等任一确定性字段被手工改动，都会报告 `candidate_projection_drift`。先运行 projector `--check`，确认差异后再用 `--in-place` 重建。

## 5. Artifact 双向一致

- `artifact.produced_by` 中的元素必须在自己的 `output_artifact_refs` 回指该 Artifact。
- `artifact.consumed_by` 中的元素必须在自己的 `input_artifact_refs` 回指该 Artifact。
- candidates 中相应元素还必须投影 `hasOutput` 或 `hasInput`。

常见错误：`artifact_output_not_reciprocal`、`artifact_input_not_reciprocal`、`candidate_*_projection_missing`。

## 6. flow_edges 与 transition

允许的 `edge_kind`：

| digest `edge_kind` | candidates 表达 | `transitionKind` |
|---|---|---|
| `main` | 目标活动的 `properties.precededByActivity` | 不生成 transition |
| `conditional` | `transitions[]` | `CONDITIONAL` |
| `escalation` | `transitions[]` | `ESCALATION` |
| `reject` | `transitions[]` | `REJECT` |
| `return` | `transitions[]` | `RETURN` |
| `termination` | `transitions[]` | `TERMINATION` |
| `emergency` | `transitions[]` | `EMERGENCY` |

transition 的固定字段为：

- `localId`
- `fromActivity`
- `toActivity`
- `transitionKind`
- 可选 `condition`
- 可选 `conditionParams[]`

其他规则：

- 两端必须是本文件已声明的 `proc:ProcessActivity` 或 `proc:Task`。
- 两端必须属于 `process_ref` 指定的同一 L3。
- 同一 `from→to` 不能同时出现在 main 和 transition。
- `transitionKind` 必须是对应 `edge_kind.toUpperCase()` 的大写值。

常见错误：`flow_edge_cross_process`、`candidate_transition_projection_missing`、`candidate_transition_kind_mismatch`、`transition_main_edge_duplicate`。

## 7. parameter.target

投影前，digest 的 rule `parameters[]` 和 flow edge `condition_parameters[]` 每项必须至少包含：

- `parameterType`：非空 string；投影器暂兼容旧名 `parameter_type`；
- `value`：保留权威字面量的 string；数值规范化另写 `valueNumber`；
- 可选 `valueNumber`、`comparator`、`unit`、`note` 和 `target` 必须符合 Candidates 0.3 对应类型。

当前 Policy Digest 0.2.0 Schema 仍保留开放 object 以避免静默破坏既有包；package validator 通过 `parameter_shape_invalid` 执行可投影性门禁。下一次 Digest Schema 版本升级时再把该形状固化为 `$defs`。

Candidates 0.3.0 的单文件 Schema 没有把 `target` 标成必填，但 Policy Digest 包级契约要求：

- 每个 candidate `parameters[]` 项必须有 `target`。
- `target` 必须指向本成果包 `produces[]` 中已声明、且 `rdfType` 以 `Obligation` 结尾的 `localId`。
- `value` 保存权威字面量；`valueNumber` 仅在可确定规范化数值时填写。

`transition.conditionParams[]` 用于描述边条件，当前包级校验不要求它指向 Obligation；正向投影器也不会为它猜测 target。

这是跨 proposal 引用约束，当前由校验器而不是 vendored Candidates Schema 执行。

常见错误：`parameter_shape_invalid`、`parameter_target_missing`。

## 8. ready_for_ingestion

当 `digest.status` 为 `ready_for_ingestion` 时：

- 不得存在 unresolved 层级；
- 不得存在 blocking issue 或 pending confirmation；
- digest 中不得残留 `review.status: proposed`。

结构校验通过不等于可以入库；人工审核状态必须真实。

## 9. digest.md

必须包含文件身份、核心规则、流程节点、RACI、风险控制、问题建议和流程图章节，并呈现所有规则、流程元素、目标、Artifact、边、RACI、风险、控制和问题 ID。

不要手写维护。使用 `generate-policy-digest-md.mjs` 从最终 digest 生成；默认写出并列的 `digest.generated.md`，复核后用 `--in-place` 覆盖并自动备份，CI 可用 `--check` 检测漂移。

## 10. 大量错误的处理顺序

先处理错误摘要中数量最多的 code，再重新运行校验：

1. `schema_*`：先修形状和必填字段；
2. `anchor_*`：修复 parsed 与 excerpt，通常一次消除大量错误；
3. `duplicate_*`：稳定 ID；
4. `hierarchy_*`、`owning_process_*`：修层级；
5. `artifact_*`、`flow_edge_*`：修流程关系；
6. `candidate_*`、`parameter_*`、`transition_*`：最后重建投影；
7. `markdown_*`：从最终 digest 重新生成视图。

默认命令按 code 汇总，并且每类只展开前 5 条。使用 `--all` 查看全部，`--summary-only` 仅看汇总，或用 `--max-per-code <n>` 调整展开数量。
