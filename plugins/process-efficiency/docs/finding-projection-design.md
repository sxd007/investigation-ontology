# 评价发现的本体投影设计（提案）

> **状态：已实施**（2026-09-28）。ACP-002（ontology_domain 仓库 `ontology_process/design/decisions/ACP-002.md`）已批准并完成框架侧实施：framework schema v0.1.0 + process-core v0.5.0（proc:EvaluationAssertion + 7 谓词 + supersedes 链）+ process-shapes v0.2.0。插件侧：vendored schema 与投影契约见 `skills/process-assess-workflow/references/assertion-projection.md`（**投影操作的权威依据**；本文件保留为设计背景材料）。
> **注意**：本文 §3 的 YAML 草案为 snake_case 记号；正式 schema 为 camelCase（assertionId/alignmentStatus/digestRef/sourceAssessment/generatedAt），以 vendored schema 与投影契约为准。

## 1. 动机

评价发现目前随评价归档（`01_assessments/`），下次评价或调查无法直接消费。投影到本体层的价值：

- **跨评价积累**：流程 X 的控制缺口沉淀为 ControlPoint 断言后，下次评价、控制整改验证、甚至调查插件（评估某控制的可绕过性）可直接查询；
- **与 candidates 闭环**：policy-digest 把制度"应然"投给本体层；本投影把评价发现的"实然偏差"投给本体层——应然+实然在同一图谱，是 proc 域四大用例（风控识别/效率诊断/事后监督/实例映射）的完整数据面。

## 2. 形态分析：为何不能复用 candidates-0.3.0

| 维度 | candidates 0.3.0 | 评价发现投影 |
|------|------------------|-------------|
| 语义 | 制度文档 → **新实例提案** | 评价结论 → **对已有实例的断言** |
| 证据（必填） | `sourceBlock`（docId/blockId/原文 excerpt） | digest 锚点 **+ baseline 快照**（双源，且实例层证据根本不在文档里） |
| 对象 | policy:Clause / proc:Process 等新实例 | 已入库的 proc 实例（ControlPoint/Metric/ProcessActivity） |
| review 语义 | 条款提取的提取正确性 | 评价结论的定性正确性 |

结论：需要**独立的断言交换格式** `evaluation-assertions`（**ACP-002 已裁决**：framework 第四交换 schema）。谓词按 ACP-002 裁决 4 一次性正式化为 `proc:`/`risk:` IRI；实例未对齐时 target 用结构化 digest 坐标（裁决 2 修订：不使用任何品牌前缀键）。

## 3. 映射草案（finding → 本体断言；已按 ACP-002 裁决修订）

| finding_type（示例） | 本体对象 | 断言谓词（正式化目标 IRI） |
|--------------------|---------|------------------------------------------|
| `risk_uncontrolled` / `risk_undercontrolled` | proc:ControlPoint（或风险所在 element） | `proc:hasControlGap`（值：severity + 参照条目 + 评价 ID） |
| `control_design_weak` | proc:ControlPoint | `proc:designEffectivenessAssessment`（六属性缺陷明细） |
| `control_not_executed` / `control_bypassed` | proc:ControlPoint | `proc:operatingEffectivenessObservation`（执行率/偏差构成 + 快照定位） |
| `kpi_not_achieved` / `kpi_absent` | proc:Metric | `proc:metricObservation`（实际值/基准/基准来源/达成状态） |
| `bottleneck_wait` / `cycle_time_outlier` | proc:ProcessActivity | `proc:bottleneckObservation`（P50/P90/等待占比） |
| `rework_loop` | proc:ProcessActivity（返工环端点） | `proc:reworkObservation`（返工率/流向） |
| `objective_vague` 等 | proc:ProcessObjective | `proc:objectiveQualityAssessment`（SMART 评级） |

断言记录结构（按 ACP-002 修订）：

```yaml
assertion_id: EAS-{assessment_id}-001
target:                                  # 无前缀键；见 ACP-002 裁决 2 修订
  alignment_status: unaligned            # aligned 时直接用 proc/risk 实例 IRI
  digest_ref: {doc_id, element_ref}
predicate: proc:hasControlGap            # 一次性正式化的谓词 IRI
value: { severity, finding_ref, context }
evidence:
  digest: {doc_id, element_ref}
  baseline: {version, snapshot_ref}
source_assessment: {assessment_id}
source_finding: {RC-001}
generated_at: {timestamp}
status: proposed                          # 与 finding 同步；Owner 确认 → confirmed
```

## 4. 治理与待定项

**治理纪律**（与 candidates 一致）：

1. 断言是**评价产物非事实**——`PENDING_CORE_ALIGNMENT`，framework 摄取前须评审；
2. 断言不可变，评价复检后出新断言（引用旧断言 supersedes），不就地修改；
3. severity/结论的 Owner 确认状态随断言携带（proposed/confirmed）。

**待定项**（已在 ACP-002 裁决，2026-09-20）：

1. **schema 归属**：→ 独立 evaluation-assertions schema（framework 第四交换 schema）；
2. **实例定位约定**：→ 接受未对齐目标降级，target 用结构化 digest 坐标（alignment_status + digest_ref），无任何前缀键；quality_gate 增未对齐率统计；
3. **跨评价聚合语义**：→ 时间序列（supersedes 链全保留，Shapes 约束无环无断）。

## 5. 实施路径建议

1. 本文档作为提案输入 ontology_framework 的设计评审；
2. 对齐后：framework 出正式 schema → 本仓库 vendored（同 policy-digest 模式）→ REPORT 阶段增加可选的投影产物（`01_assessments/evaluation-assertions.yaml`）；
3. 在此之前，评价闭环完全不受影响（findings 已满足评价内消费）。
