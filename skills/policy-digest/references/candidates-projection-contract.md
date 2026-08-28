# Digest → Candidates 正向投影契约

## 1. 为什么保留两个文件

`digest.json` 与 `candidates.json` 不是重复用途的两个真相源：

- `digest.json` 是完整制度解构层，保存规则、流程、RACI、风险、控制、问题、推断和待确认项，服务业务审阅、Agent 和人读视图。
- `candidates.json` 是窄化的本体摄取交换层，只保存准备按 Core 类型和关系进入候选审核/摄取的数据，不接收问题、建议或展示字段。

要消除的是人工把同一投影字段写两遍，而不是合并两个输出层。

## 2. 产生顺序

Policy Digest 0.2.0 的权威顺序是：

1. 原始文件规范化为 `normalized.parsed.json`；
2. Pass A–G 形成完整 `digest.json`；
3. 根据 digest 中的 `candidate_refs[]` 和 Core 映射生成 `candidates.json`；
4. 校验三层 Schema、锚点、引用和投影一致性；
5. 生成 `digest.md` 与 `explanation.html`。

当前实现历史上只具备第 4 步的反向一致性检查，缺少第 3 步的正向生成器，因此使用者必须先手写重复字段，再由校验器发现漂移。

## 3. Policy Digest 0.2 正向投影覆盖矩阵

### 3.1 已确定、由程序覆盖生成

| digest 输入 | candidates 输出 | 转换 / ID 规则 | 缺失处理 | source / review | validator 对应规则 | 权威置信度 |
|---|---|---|---|---|---|---|
| `document_identity.doc_id` | `document.docId` | snake_case→camelCase，原值 | 缺失由 digest Schema 阻断 | 不涉及 review | `document_id_mismatch` | 高：validator 精确比较 |
| `ontology_projection.parsed_ref` / `parsed_schema_version` / `tenant` | `document.parsedRef` / `tenant` | 路径和版本原值；null tenant 省略 | 必填项由 digest Schema 阻断 | 不涉及 review | `parsed_version_mismatch` + Candidates Schema | 高：字段语义完全一致 |
| `ontology_projection.core_versions` | `coreVersions` | 深复制整个版本映射 | 缺失由 digest Schema 阻断 | 不涉及 review | 两侧 Schema；暂无逐值一致性规则 | 高：同一版本映射的命名转换 |
| 同一 candidate 的 `rules[]` | candidate `sourceBlock` | 所有 rule 必须共享同一 source block | 多来源即阻断 | 从 rule source 转换 camelCase；candidate review 保留 | 两侧 Schema；投影器执行唯一性 | 高：candidate 只有一个 sourceBlock，digest 已显式分组 |
| `rules[].disposition` | candidate `disposition` | Candidates 0.3 枚举内原值；同组必须一致 | 不支持或冲突即阻断 | candidate review 保留 | Candidates Schema | 高：两个模型使用同名字段和值 |
| `rules[].clause_types` | candidate `clauseType` | 合并、去重、稳定排序；仅接受 Candidates 0.3 枚举 | 不支持即阻断；空集省略 | 多类型强制 full review | Candidates Schema | 高：两个模型使用同名分类；不做语义改写 |
| `semantic_confidence` | candidate `confidence` | 同组取最低值 | 缺失由 digest Schema 阻断 | 保守聚合 | 两侧 Schema | 中高：保守规则为 Policy Digest 既有原则 |
| `rule_id` + 非空 `requirement` | `policy:Obligation` proposal | localId=`{rule_id}-OBLIGATION`；requirement→statement；状态固定 DRAFT/UNASSESSED | 无 requirement 时不生成 | rule review 留在 digest；candidate review 保留 | `candidate_rule_obligation_missing`、`candidate_rule_obligation_type_mismatch`、`candidate_rule_statement_mismatch` | 高：每条规范化 rule 只有一个 requirement；脚手架已采用同一 ID/类型 |
| `rules[].parameters[]` | candidate `parameters[]` | 规范化已知字段；target 固定为该 rule 的 Obligation ID | 有参数但无 requirement，或缺 type/value 时阻断 | rule source/review 留在 digest | `parameter_target_missing` + Candidates Schema | 高：target 不再依赖人工选择 |
| `process_elements[].candidate_refs[0]` | candidate 分组 | 使用显式引用；不推断 ID | 非 1 个即阻断 | candidate 的 `sourceBlock`、`review` 原样保留 | `candidate_ref_missing`；唯一性由投影器阻断 | 高：digest 显式引用 + validator |
| `element_id` | `produces[].localId` | 原值，作为稳定 proposal ID | 缺失由 digest Schema 阻断 | element 的 source/review 留在 digest；candidate 治理元数据保留 | `digest_element_candidate_missing` | 高：validator 以同 ID 查找 |
| `rdf_type` | `produces[].rdfType` | 原值 | 类型不匹配阻断 | 同上 | `candidate_element_type_mismatch` | 高：validator 精确比较 |
| `name` | `produces[].label` | 原值 | 缺失由 digest Schema 阻断 | 同上 | 仅两侧 Schema；暂无逐值一致性规则 | 中：schema/fixture 已有映射 |
| `level` | `properties.efio:hierarchyLevel` | 原值 | 阻断 | 同上 | `candidate_hierarchy_level_mismatch` | 高：validator 精确比较 |
| `parent_ref` | `properties.efio:parentElement` | 非 null 时写入 | 无父级时省略 | 同上 | `candidate_parent_mismatch` | 高：validator 精确比较 |
| `owning_process_ref` | `properties.efio:owningProcess` | 非 null 时写入 | 无归属时省略 | 同上 | `candidate_owning_process_mismatch` | 高：validator 精确比较 |
| 固定契约 | `properties.efio:mappingStatus` | 固定为 `PENDING_CORE_ALIGNMENT` | 不允许其他值 | 不改变 review | `candidate_mapping_status_missing` | 高：validator 固定值 |
| `objective_refs` | `properties.hasObjective` | 1 个为标量，多个为数组 | 空数组省略 | objective 自身 source/review 留在 digest | `candidate_objective_projection_mismatch` | 高：validator 集合比较 |
| `input_artifact_refs` | `properties.hasInput` | 1 个为标量，多个为数组 | 空数组省略 | Artifact source/review 留在 digest | `candidate_input_projection_mismatch` | 高：validator 集合比较 |
| `output_artifact_refs` | `properties.hasOutput` | 1 个为标量，多个为数组 | 空数组省略 | Artifact source/review 留在 digest | `candidate_output_projection_mismatch` | 高：validator 集合比较 |
| `process_objectives[]` | `proc:ProcessObjective` proposal | objective_id→localId；statement→label | candidate_ref 非 1 个即阻断 | source/review 留在 digest；candidate review 保留 | `candidate_objective_missing`；rdfType/label 暂无逐值规则 | 中高：validator 检查 ID，schema/fixture 提供类型和 label 映射证据 |
| `artifacts[]` | `proc:Artifact` proposal | artifact_id→localId；name→label | candidate_ref 非 1 个即阻断 | source/review 留在 digest；candidate review 保留 | `candidate_artifact_missing` | 中高：validator 检查 ID，schema/fixture 提供类型和 label 映射证据 |
| `flow_edges[main]` | 目标 proposal 的 `precededByActivity` | from_ref；多个前驱为数组 | 端点由 validator 检查 | edge source/review 留在 digest | `digest_main_edge_candidate_mismatch` / `candidate_main_edge_digest_mismatch` | 高：validator 双向检查 |
| 非 main `flow_edges[]` | `transitions[]` | edge_id→localId；端点改 camelCase；kind 转大写 | candidate_ref 非 1 个即阻断 | edge source/review 留在 digest；candidate review 保留 | `candidate_transition_projection_missing` 等 transition 规则 | 高：validator 精确检查 |
| `condition_parameters[]` | `conditionParams[]` | 已知 snake_case/camelCase 字段规范化；不生成 target | 缺 type/value 即阻断 | source/review 随 edge 留在 digest | candidates Schema；暂无逐值一致性规则 | 中：Schema 明确目标形状，digest 参数仍为开放对象 |

以上区域是 candidates 中的**生成区域**。投影器每次以 digest 覆盖它们，不保留人工改动。

### 3.2 当前保留、不由第一版投影器猜测

| candidates 数据 | 原因 | 第一版行为 |
|---|---|---|
| candidate 边界和 candidate ID | digest 已用 `candidate_refs[]` 引用边界，但 0.2 尚无首次创建 candidate ID 的策略 | 读取现有 candidates 作为 seed；不猜分组 |
| `coreVersion` / `coreVersions` | 目标 Core 的选择是摄取配置，不由规则文本决定 | 原样保留 |
| Clause proposal | 一条来源 Clause 可产生多个规范化 rules；digest 0.2 没有稳定 `clause_id`，不能无损决定共享 Clause localId | 原样保留 |
| `alignments[]` | 目标类型、IRI 与对齐种类属于显式本体决策 | 原样保留 |
| RACI/Risk/Control proposal | 当前 digest 有分析记录，但 validator 未要求统一 proposal 映射 | 原样保留 |
| candidate review | 属于候选治理状态，不是流程投影值 | 原样保留 |

这不是先验认定“必须增加 blueprint”，而是当前仓库可验证事实的边界。后续只对真实试点仍需双写的字段补最小映射，不预先增加第三份真相源。

## 4. 第一版投影器

运行：

```text
node skills/policy-digest/scripts/project-policy-digest-candidates.mjs <package-directory>
```

默认读取现有 `candidates.json` 作为 seed，保留 §3.2 的本体决策与审核数据，重新生成 §3.1 的规则和流程投影，并写入 `candidates.projected.json`。

选项：

- `--check`：不写文件；检查现有 candidates 的生成区域是否与 digest 一致；
- `--init`：按 digest 中已填写的 `candidate_refs[]` 从零创建 candidate 壳并投影；已有 candidates 时只能配合指向其他文件的 `--output` 安全预览；
- `--core-version <version>`：仅在 `--init` 且 `core_versions` 有多个不同版本时，显式指定 candidate 的目标 Core；
- `--output <path>`：指定并列输出；
- `--in-place`：备份为 `candidates.before-projection.json` 后覆盖；
- 默认不覆盖，避免破坏已审核候选。

投影结果按 candidate ID、proposal localId 和 transition localId 稳定排序；对同一输入重复运行应字节级一致。

`--init` 不负责发明候选边界。它只收集 digest 已显式引用的 candidate ID；每个 candidate 必须至少关联一条 rule，且同组 rules 必须共享 source block 和 disposition。process-only 分组或多 Core 版本歧义会立即失败，要求提供 seed candidates 或显式版本。

### 4.1 candidate_refs 基数与拆分准则

- 每条 rule、process element、objective、Artifact 和 flow edge 必须恰好填写一个 candidate_ref；零个或多个均无法确定性投影。
- 安全默认是“一条 rule 一个 candidate”，但这不是本体上的永久一一关系。同一 source block 的多条 rule 只有在 disposition 一致、且确实应共享 candidate 时才可显式合并。
- process/objective/Artifact/edge 若与某条 rule 共享来源块，优先显式归入该 rule candidate。
- 跨来源块记录不得由投影器按“名称相近”或“语义就近”自动归并；分析者必须依据业务关系显式选择 candidate_ref，无法确认时建立待确认项。
- 没有关联 rule 的纯 process candidate 无法由 `--init` 推导 sourceBlock 和 disposition，必须提供 seed `candidates.json`。
- procedural candidate 的 `obligationDraft` 是 candidate 级单值。当前同组必须恰好一条非空 requirement；多条 procedural rule 应拆分 candidate，除非未来 Candidates Schema 能无损表达多个 draft。

## 5. 第一版解决和不解决什么

已解决：

- 流程元素的 ID、类型、标签和 `efio:*` 不再双写；
- candidate 的来源、分类、置信度和 review pool 不再双写；
- 每条非空 requirement 的 `policy:Obligation` 及 parameter target 不再双写；
- objective/input/output 不再双写；
- ProcessObjective、Artifact proposal 不再双写；
- main edge 和 transition 不再双写；
- 可用 `--check` 在 CI 中阻止规则和流程投影漂移。

尚未解决：

- 来源 Clause 的共享 ID 和 Clause proposal；
- alignment、RACI、Risk、Control 的 Core 映射。

下一步应以真实包测量这些剩余手工字段，而不是直接升版。当前已确认的真实结构缺口是稳定 `clause_id`：只有试点证明共享 Clause proposal 必须自动生成时，才对 Digest Schema 做最小版本化扩展。

## 6. 安全门禁

- 投影器不得更改 digest 或 parsed；
- 不得把问题、建议或 `assertion_basis: analysis` 内容自动写入本体 proposal；
- 不得以名称相似度决定 candidate 分组或 Core 类型；
- 引用不存在、candidate_ref 不唯一或参数形状不完整时立即失败；
- `--in-place` 必须先备份；
- 生成后仍须运行完整 package validator；
- Process Core 正式支持父子属性前，必须保留 `PENDING_CORE_ALIGNMENT`。
