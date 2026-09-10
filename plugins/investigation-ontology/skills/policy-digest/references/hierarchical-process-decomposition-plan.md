# 分层流程解构实施方案

> 状态：implemented design record（0.2.0 已实现；后续 Core 正式属性与增强图表仍待办）<br>
> 目标版本：Policy Digest 0.2.0
> 对齐基线：Process Core 0.4.0、Candidates 0.3.0

## 0. 已确认实施决策（2026-08-26）

1. **版本策略**：0.2.0 采用破坏式升级；`process_elements + flow_edges` 取代扁平 `activities[]`，同时提供 0.1→0.2 迁移器，不长期维护两个权威模型。
2. **Process Core 范围**：本迭代不修改 Process Core 0.4.0。
3. **临时层级投影**：层级在 digest 中完整保存，并在 candidates `produces[].properties` 使用版本化扩展键 `efio:parentElement`、`efio:owningProcess`、`efio:hierarchyLevel`；同时写 `efio:mappingStatus: PENDING_CORE_ALIGNMENT`。这些键不得直接序列化为 Process Core 属性，后续 Core 提供正式属性时由迁移映射替换。
4. **推断策略**：允许模型推断层级，但 `decomposition_basis: inferred_structure` 必须进入全审池；确认前不得进入 `ready_for_ingestion`。
5. **首迭代范围**：实现五层流程树、Artifact 生产/消费、流程内主干/异常边、RACI/风险控制分层挂接。
6. **后续迭代**：分层 Markdown、Mermaid 全景图和逐 L3 泳道图不进入首迭代。

### 临时扩展的退出条件

- `efio:*` 是 candidates 交换层扩展，不是 Process Core 公理。
- 扩展值必须引用本 candidates 文件中的 localId，跨文件目标使用明确 IRI，不允许名称字符串充当引用。
- serializer 遇到 `PENDING_CORE_ALIGNMENT` 必须保留为待映射数据或拒绝正式 TTL 序列化，不得静默丢弃。
- Process Core 发布正式父子属性后，新增显式版本迁移；禁止仅改字段名而不留迁移记录。

## 1. 目标与裁决

Policy Digest 默认采用流程领域本体的五层架构，不再把复杂制度直接摊平成一条活动链：

| 层级 | 本体类型 | 解构语义 | 供应商管理示例 |
|---|---|---|---|
| L1 | `proc:ProcessCategory` | 业务流程域 | 采购管理 |
| L2 | `proc:ProcessGroup` | 同一能力下的流程组 | 供应商管理 |
| L3 | `proc:Process` | 有独立目标、触发、输入和结果的可运行流程 | 供应商筛选、入围评审、认证、定期评估、退出、黑名单管理 |
| L4 | `proc:ProcessActivity` | L3 流程中的关键执行活动 | 收集资料、资质审核、现场评审、批准认证 |
| L5 | `proc:Task` | 活动内最小可执行任务 | 查询工商信息、核验许可证、填写评分表 |

业务口语中的“子流程”默认映射为 L3 `Process`。它的父级通常是 L2 `ProcessGroup`，而不是把两个 L3 流程用活动顺序关系串起来。

### 核心纪律

1. **先分层、后排顺序**：先识别 L1–L5 归属，再在每个 L3 内建立活动链。
2. **包含不等于顺序**：父子归属使用层级关系；`precededByActivity` 只表达同一 L3 内 L4/L5 的无条件顺序。
3. **流程间不用活动边连接**：L3 流程之间通过输入/输出 Artifact、触发条件和业务状态衔接；Process Core 明确不建流程间顺序。
4. **文档边界不等于流程边界**：一份制度可覆盖多个 L3；一个 L3 也可由多份制度共同规定。
5. **各层均可挂目标、角色、输入、输出、控制和锚点**：不得只在叶子活动记录产出物。
6. **不强行填满五层**：原文只支持到 L3/L4 时停止；L5 仅在出现独立执行者、独立操作或独立留痕时建立。

## 2. 实施前差距与当前边界

### 2.1 Policy Digest 0.1.0 的原始差距（已由 0.2.0 解决）

旧版 0.1.0 `digest.json` 以 `activities[]` 为核心，只能稳定表达活动和活动边，曾缺少：

- L1–L5 流程元素的统一记录；
- 直接父级和所属 L3；
- 各层目标、入口/出口条件和流程负责人；
- Artifact 的独立身份、生产者和消费者；
- 分层依据和分层置信度；
- 层级覆盖、孤儿节点、跨流程活动边等校验。

0.2.0 已通过 `process_elements[]`、`process_objectives[]`、`artifacts[]`、`flow_edges[]`、确定性校验器和迁移器解决上述 Digest 层差距。当前剩余边界是 Process Core 尚无正式实例父子属性，因此层级仍需使用带 `PENDING_CORE_ALIGNMENT` 标记的 candidates 扩展保存。

### 2.2 Process Core 差距

Process Core 已定义五层类链，但企业实例之间缺少直接父子归属属性。Core 文档也将 PCF/Enterprise 个体归属 `parentElement` 记录为待办。因此当前可创建 L1–L5 实例，却无法在本体中无损保存“供应商筛选属于供应商管理”。

### 2.3 Candidates 差距

Candidates 0.3.0 的 `produces[].properties` 可暂存 Core 已存在的属性，但：

- 尚无已发布的流程父子属性可写；
- schema 不校验 `parentElement`、`hasInput`、`hasOutput` 的 localId 引用；
- 不能保证层级相邻、唯一父级和无环。

结论：Digest Schema、解构指令、迁移器和校验器已在 0.2.0 落地；本迭代不修改 Process Core。正式 TTL 序列化仍须等待 Core 父子属性，或由明确支持 `efio:*` 临时扩展的摄取端保留待映射状态。

## 3. 目标数据模型

### 3.1 `process_elements[]`：流程层级的单一真相源

Policy Digest 0.2.0 新增顶层 `process_elements[]`，取代 `activities[]` 作为流程结构权威源：

```json
{
  "element_id": "PROC-SUPPLIER-CERTIFICATION",
  "level": "L3",
  "rdf_type": "proc:Process",
  "name": "供应商认证",
  "parent_ref": "PG-SUPPLIER-MANAGEMENT",
  "owning_process_ref": "PROC-SUPPLIER-CERTIFICATION",
  "objective_refs": ["OBJ-SUPPLIER-CERTIFICATION"],
  "owner_role_refs": ["ROLE-SUPPLIER-MANAGER"],
  "input_artifact_refs": ["ART-SHORTLIST-DECISION"],
  "output_artifact_refs": ["ART-CERTIFICATION-DECISION"],
  "entry_conditions": ["供应商通过入围评审"],
  "exit_conditions": ["认证决定完成并归档"],
  "decomposition_basis": "explicit_text",
  "hierarchy_confidence": {
    "evidence": 0.98,
    "boundary": 0.96,
    "parent": 0.97,
    "granularity": 0.96,
    "overall": 0.96
  },
  "source": {},
  "review": {}
}
```

字段规则：

- `level` 与 `rdf_type` 固定对应，不允许自由组合。
- L1 的 `parent_ref` 必须为 null；L2–L5 必须有且只有一个直接父级。
- `parent_ref` 只允许相邻层：L2→L1、L3→L2、L4→L3、L5→L4。
- L3 的 `owning_process_ref` 指向自身；L4/L5 指向唯一祖先 L3；L1/L2 为 null。
- `decomposition_basis`：`explicit_text | inferred_structure | confirmed_by_owner`。
- `inferred_structure` 强制 `review.pool: full`，不能自动进入可入库状态。

### 3.2 `process_objectives[]`

```json
{
  "objective_id": "OBJ-SUPPLIER-CERTIFICATION",
  "statement": "确保供应商具备持续履约所需资质与能力",
  "parent_objective_ref": "OBJ-SUPPLIER-GOVERNANCE",
  "element_refs": ["PROC-SUPPLIER-CERTIFICATION"],
  "assertion_basis": "explicit_text",
  "source": {},
  "review": {}
}
```

映射：`proc:ProcessObjective` + `hasObjective`；目标分解映射 `hasSubObjective`。

### 3.3 `artifacts[]`

```json
{
  "artifact_id": "ART-CERTIFICATION-DECISION",
  "name": "供应商认证决定",
  "artifact_type": "decision",
  "produced_by": ["ACT-CERTIFICATION-APPROVAL"],
  "consumed_by": ["PROC-SUPPLIER-PERIODIC-EVALUATION"],
  "required_fields": [],
  "retention_requirement": null,
  "source": {},
  "review": {}
}
```

`artifact_type` 初始枚举：`document | data | system_record | physical_object | decision`。

映射：`proc:Artifact`；生产者使用 `hasOutput`，消费者使用 `hasInput`。同一 Artifact 可连接两个 L3 流程，形成可查询的流程衔接，但不制造流程间 `precededByActivity`。

### 3.4 `flow_edges[]`

统一保存 L3 内活动边：

```json
{
  "edge_id": "EDGE-CERT-001",
  "process_ref": "PROC-SUPPLIER-CERTIFICATION",
  "from_ref": "ACT-DUE-DILIGENCE",
  "to_ref": "ACT-CERTIFICATION-REVIEW",
  "edge_kind": "main",
  "condition": null,
  "condition_parameters": [],
  "source": {},
  "review": {}
}
```

- `main` 投影为目标活动的 `precededByActivity`。
- `conditional | escalation | reject | return | termination | emergency` 投影为 `transitions[]`。
- `from_ref` 与 `to_ref` 必须属于同一 `process_ref`；跨 L3 边一律报错。
- `activities[]`、活动内嵌 `main_next/transitions` 在 0.2.0 中取消，避免多个顺序真相源。

### 3.5 其他记录引用升级

- `role_assignments[].element_ref`：替代只允许活动的 `activity_ref`，使 RACI 可挂 L1–L5。
- `risks[].element_refs`、`controls[].element_ref`：允许风险与控制挂到流程组、流程或活动。
- `rules[].operationalized_by[]`：显式关联规则/义务与流程元素。
- `graph` 改为派生视图配置，不再重复保存节点和边业务事实。

## 4. 默认递归解构算法

### Pass A：识别流程目录

不按文档章节直接建活动，而是先扫描全部正文、附件、表格和流程图，形成候选流程目录：

- 业务域/能力名；
- 独立目标；
- 触发事件；
- 开始与结束状态；
- 输入与输出；
- 独立责任主体；
- 周期性或可重复运行单元；
- 独立例外或终止机制。

### Pass B：判定 L3 流程边界

一个候选单元满足以下多数条件时建立 L3：

1. 有独立业务目标；
2. 有明确触发；
3. 有可识别的开始和结束；
4. 有自己的输入和输出；
5. 包含至少两个关键活动；
6. 有独立流程负责人；
7. 可周期性或相对独立运行；
8. 有独立异常、终止或评价机制。

证据不足时不擅自拆分，记录 `inferred_structure` 和待确认项。

### Pass C：建立 L1/L2 归属

- 从制度目的、适用业务和职责章节识别 L1 业务域。
- 将目标和治理对象相近的 L3 聚合为 L2。
- 供应商筛选、认证、评估、退出等应作为 L2“供应商管理”下的同级 L3，而不是一条扁平活动链。

### Pass D：递归拆活动与任务

- 每个 L3 独立做 SIPOC。
- 将具备独立责任角色、判断、输入输出或留痕的步骤建为 L4。
- 只有需要指导具体执行、且存在独立动作/操作人/留痕时继续拆成 L5。
- 达到原文可支持的最细粒度即停止，不以“填满五层”为目标。

### Pass E：建立 Artifact 衔接

- 对每个 L1–L5 提取输入、输出和证据产物。
- 对相邻 L3，优先用“上游输出被下游消费”表达衔接。
- 同名产物先做身份解析；名称相同但字段、效力或版本不同的产物不得自动合并。

### Pass F：建立流程内顺序和异常路径

每个 L3 单独建立 L4/L5 主干和 transition。禁止在不同 L3 的节点间建立活动边。

### Pass G：挂接规则、角色、风险和控制

将义务、RACI、风险、控制点、控制程序、参数和证据要求挂到准确的流程层级，不默认全部挂到 L4。

## 5. Process Core 配套改造

在上游 Process Core 新增 additive 属性，建议版本 0.5.0：

```turtle
proc:parentElement a owl:ObjectProperty ;
  owl:inverseOf proc:hasChildElement ;
  rdfs:subPropertyOf fnd:partOf ;
  rdfs:domain proc:ProcessCategory ;
  rdfs:range proc:ProcessCategory .

proc:hasChildElement a owl:ObjectProperty ;
  rdfs:subPropertyOf fnd:hasPart ;
  rdfs:domain proc:ProcessCategory ;
  rdfs:range proc:ProcessCategory .
```

设计纪律：

- 只保存直接父级，不声明传递性；闭包查询用 `parentElement+`。
- OWL 只表达通用语义；相邻层级、唯一父级、无环由 SHACL 约束。
- L1 无父级；L2–L5 `parentElement` 恰好一个。
- 企业流程实例和 PCF Reference 实例均可使用；`referencesPCF` 仍只做企业 L3 Process 到 PCF Process 的对齐，不替代父子关系。

需要同步修改：Process Core、process shapes、architecture/change-log、bundle、Core 版本注册表及测试。

## 6. Candidates 投影方案

Process Core 暂不修改时：

- 每个 `process_elements[]` 仍产生相应 L1–L5 `rdfType` 实例；
- 层级临时投影到 `properties.efio:parentElement`、`properties.efio:owningProcess` 和 `properties.efio:hierarchyLevel`；
- 所有使用临时层级键的提案写 `properties.efio:mappingStatus: PENDING_CORE_ALIGNMENT`；
- `hasObjective`、`hasInput`、`hasOutput`、`precededByActivity` 等 Process Core 0.4.0 已存在属性继续使用原生映射；
- 正式 TTL 入库前必须由摄取端明确支持该扩展，或保持 candidates/digest 待映射状态。

Process Core 将来发布正式父子属性后：

- 每个 `process_elements[]` 产生一个相应 `rdfType` 实例；
- `properties.parentElement` 指向同文档或已存在的父元素 localId/IRI；
- `objective_refs` 投影为 `hasObjective`；
- `input_artifact_refs`、`output_artifact_refs` 投影为 `hasInput/hasOutput`；
- RACI 产生 `proc:Role` + `proc:RoleAssignment`；
- L4/L5 主干产生 `precededByActivity`；异常边产生 `transitions[]`。

Candidates 格式首迭代维持 0.3.0，使用 `produces[].properties` 承载版本化 `efio:*` 扩展；Policy Digest 校验器承担引用、层级和 `mappingStatus` 校验。后续可将通用层级引用能力纳入 Candidates 0.4.0。

## 7. 确定性校验新增项

校验器必须新增：

1. `level ↔ rdf_type` 固定映射；
2. L1 无父级，L2–L5 唯一父级；
3. 父子只跨一个层级；
4. 层级图无环、全部节点可达某个 L1；
5. L4/L5 有唯一 `owning_process_ref`，且与祖先 L3 一致；
6. flow edge 两端属于同一 L3；
7. 主干边与 transition 不双写；
8. Artifact producer/consumer 引用存在；
9. 每个 L3 至少有目标、触发/入口、输出；缺失产生 blocking 或制度缺陷；
10. 每个 L3 至少一个 L4，除非原文明示其仅为目录分类；
11. 每个 L4 至少一个 R；关键 L3 只有一个 A/流程负责人；
12. 所有推断层级进入全审池；
13. digest、candidates、Markdown 层级树和分层泳道图一致。

## 8. Markdown 产出升级

六表一图升级为“目录 + 分层明细”：

1. 文件身份表；
2. **流程架构树（L1–L5）**；
3. **子流程清单（每个 L3 的目标、触发、输入、输出、负责人）**；
4. 核心规则表；
5. 按 L3 分组的流程节点表；
6. 按 L3 分组的 RACI；
7. Artifact 输入输出矩阵；
8. 风险控制矩阵；
9. 问题及优化建议；
10. 一张 L2 全景图 + 每个 L3 一张泳道图。

全景图只展示 L3 及 Artifact 衔接；泳道图只展示该 L3 内 L4/L5 和 transition，避免把不同抽象层混画。

## 9. 实施顺序

### 阶段 0：临时映射契约（不改 Process Core）

- 固化 `efio:*` 层级扩展键、localId 引用规则和退出条件；
- serializer 默认不得把临时扩展冒充 Process Core 属性；
- 将未来正式 Core 映射列为独立迁移事项，不阻塞 Digest 0.2.0。

**门禁**：扩展契约、引用校验和待映射阻断规则具备回归测试。

### 阶段 1：Policy Digest 0.2 Schema

- 新增 `process_elements`、`process_objectives`、`artifacts`、`flow_edges`；
- 将 `activities` 迁移到 `process_elements(L4/L5)`；
- 将顺序从活动内字段迁移到 `flow_edges`；
- 提供 0.1→0.2 迁移说明，不静默改写旧成果。

**门禁**：供应商管理样例能表达完整 L1–L5 树且无重复真相源。

### 阶段 2：解构方法与技能指令

- 把 Pass A–G 写入 SKILL 主流程；
- 默认先输出流程架构树草案，再深入每个 L3；
- 增加拆分/停止判据和推断全审规则。

**门禁**：同一文档重复运行时，L3 边界和层级结构稳定；差异必须可解释。

### 阶段 3：Candidates 投影与校验器

- 实现层级、Artifact、目标和 RACI 投影；
- 增加 §7 的确定性校验；
- 对缺 Core 版本、未确认父级或悬空 Artifact 阻止入库。

**门禁**：Digest→Candidates→TTL 机械序列化无语义补写。

### 阶段 4：视图生成

- 生成流程架构树、L3 子流程目录、Artifact 矩阵；
- 生成 L2 全景图和逐 L3 泳道图；
- Markdown 所有节点和边必须回指 digest ID。

**门禁**：图中不存在 JSON 未声明节点，且不混画不同层级顺序。

### 阶段 5：试点与标定

至少选择三类制度：

1. 供应商管理：多 L3、周期评价、退出与黑名单；
2. 采购审批：阈值分支、升级和退回；
3. 合同管理：跨部门 RACI、Artifact 密集。

前 3 份文档全量人审，记录：L3 边界改判率、父级改判率、Artifact 合并改判率、活动/任务粒度改判率。任何维度改判率超过阈值时保持全审并调整判据。

## 10. 验收标准

实现完成后应满足：

- 用户能从 L1 下钻到 L5，也能从任一产出物反查生产/消费流程；
- 每个 L3 都可独立回答目标、触发、输入、输出、负责人、活动、例外和控制；
- 不存在跨 L3 的 `precededByActivity` 或 transition；
- 文档章节结构和流程结构可不同且均保留；
- Digest 层级可完整、机械地投影到 Process Core；
- Core 暂不支持的语义不伪造属性；
- 所有推断父子关系有锚点、置信度和人审记录；
- 供应商管理示例可建成“采购管理 → 供应商管理 → 六个 L3 流程 → 各自 L4/L5 与 Artifact”的完整闭环。
