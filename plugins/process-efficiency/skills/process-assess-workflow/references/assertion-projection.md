# 断言投影契约（Assertion Projection）

> REPORT 阶段的**可选**投影产物：把已确认的评价发现（findings）按 framework 第四交换 schema 投影为 `01_assessments/evaluation-assertions.yaml`，供本体层摄取沉淀（跨评价积累、整改验证、调查插件控制可绕过性查询）。
> 上游权威：ACP-002（ontology_domain 仓库 `ontology_process/design/decisions/ACP-002.md`，已批准含评审修订）；schema 权威源是 ontology_framework `design/schemas/evaluation-assertions.schema.json`，本技能 vendored 副本见 [schemas/evaluation-assertions-0.1.0.schema.json](./schemas/evaluation-assertions-0.1.0.schema.json)。
> 评价闭环**不依赖**本投影——投影失败不阻塞 REPORT 门禁。

## 1. 投影范围（哪些 finding 可投影）

投影是 finding 的**子集**，两个硬条件缺一不可：

1. **双锚点**：finding 同时具有 `anchor.digest` 与 `anchor.baseline`（schema 双源证据必填）。template-free 降级模式（finding-contract §7）的 finding 只有 baseline 锚点，**不投影**，在投影文件头部注释记录跳过原因；
2. **finding_type 有谓词映射**（§2 表）：v0.1.0 谓词族未覆盖的类型不投影（不强行塞入近似谓词）。

## 2. finding_type → 谓词映射（ACP-002 §3.2-B）

| finding_type | 谓词 | 断言目标（target 来源） |
|---|---|---|
| `risk_uncontrolled` / `risk_undercontrolled` | `proc:hasControlGap` | anchor.digest.element_ref 指向的 ControlPoint |
| `control_design_weak` | `proc:designEffectivenessAssessment` | 同上 |
| `control_not_executed` / `control_bypassed` | `proc:operatingEffectivenessObservation` | 同上 |
| `kpi_not_achieved` / `kpi_absent` / `kpi_definition_unclear` | `proc:metricObservation` | element_ref 指向的 Metric |
| `bottleneck_wait` / `cycle_time_outlier` | `proc:bottleneckObservation` | element_ref 指向的 ProcessActivity |
| `rework_loop` | `proc:reworkObservation` | 同上（返工环端点活动） |
| `objective_missing` / `objective_vague` / `objective_unmeasurable` / `objective_conflict` / `goal_process_misaligned` | `proc:objectiveQualityAssessment` | element_ref 指向的 ProcessObjective |

**不投影**（v0.1.0 谓词族未覆盖，另案评估）：`risk_unidentified`（DDR 嫌疑最高类，闭环前本就不应沉淀）、`control_orphaned` / `control_redundant` / `control_risk_mismatch` / `control_deviation` / `control_evidence_missing` / `exception_unlogged` / `segregation_conflict` / `serial_redundancy` / `approval_overload` / `handoff_excess`。

## 3. 字段映射（finding-contract → schema）

注意**命名风格切换**：finding-contract 用 snake_case，schema 用 camelCase。

| schema 字段 | 来源 |
|---|---|
| `assertionId` | `EAS-{assessment_id}-{NNN}`（投影文件内顺序编号） |
| `target.alignmentStatus` | `unaligned`（默认，digest 坐标定位）；目标元素已入库（PENDING_CORE_ALIGNMENT 对齐记录有实例 IRI）时 `aligned` + `target.iri` |
| `target.digestRef` | `{docId: anchor.digest.doc_id, elementRef: anchor.digest.element_ref}`（unaligned 必填） |
| `predicate` | §2 映射表 |
| `value.severity` | finding `severity` 原值（裁决 8：暂沿用插件词表） |
| `value.context` | finding `statement`（一句话发现） |
| `evidence.digest` | 同 `target.digestRef` 的 digest 坐标（模板层锚点） |
| `evidence.baseline` | `{version: anchor.baseline.version, snapshotRef: anchor.baseline.snapshot_ref}`（有 `record_ref` 时拼入 snapshotRef，如 `…json#rec-04127`） |
| `sourceAssessment` | `assessment_id` |
| `sourceFinding` | `finding_id`（如 RC-001） |
| `generatedAt` | 投影生成时间（ISO 8601 带时区） |
| `status` | 与 finding `status` 同步（Owner 过审 confirmed → 断言 confirmed） |
| `supersedesAssertion` | 复检/对齐升级时引用被重写的旧断言 ID（不就地修改，Append-Only） |

文件级字段：`assertionsSchemaVersion: "0.1.0"`；`engagement.engagementId` = `assessment_id`；`coreVersions.proc` = 生成时 proc Core 版本（当前 `0.5.0`）。

## 4. 生成与校验流程

1. REPORT 阶段聚合各维度 `findings.yaml` 后，按 §1 过滤可投影 finding；
2. 按 §3 映射生成 `01_assessments/evaluation-assertions.yaml`；
3. 用 vendored schema 校验结构（含 aligned/unaligned XOR 条件约束）；supersedes 链完整性（指向存在/无环/不分叉）与未对齐率统计可借 ontology_domain 的 `scripts/validate_evaluation_assertions.py`（跨仓工具，可选）；
4. 跳过清单（不满足 §1 条件的 finding + 原因）写入投影文件头部注释，并在 `assessment_report.md` 限制节注明投影覆盖率。

## 5. 治理纪律（与 candidates 一致）

- 断言是**评价产物非事实**——`PENDING_CORE_ALIGNMENT`，framework 摄取前须评审；
- 断言不可变：复检出新断言走 `supersedesAssertion`，unaligned→aligned 升级同走 supersedes 重写（裁决 3/7）；
- 断言=观察/证据层，不表达 deficiency 认定（权威载体是 risk:ControlDeficiency，裁决 6）——调查/审计语境消费时注意分层。
