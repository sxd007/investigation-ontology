# 评价发现的本体投影设计（提案）

> **状态：Draft 提案**（2026-09-20）。涉及 ontology_framework 的本体层交换契约，本仓库不单方面发明正式 schema——efio: 扩展键与断言格式须与 ontology_framework 评审对齐后才能升级为正式契约。评价闭环（SCOPE→…→REPORT）**不依赖**本投影，投影是跨评价沉淀的增强路径。

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

结论：需要**独立的断言交换格式**（暂名 `evaluation-assertions`），沿用 efio: 扩展 + `PENDING_CORE_ALIGNMENT` 纪律，但 schema 归属待 framework 评审（可能成为 framework 的新 schema，或并入 candidates 0.4.0 的"来源类型"扩展）。

## 3. 映射草案（finding → 本体断言）

| finding_type（示例） | 本体对象 | efio: 断言键草案（PENDING_CORE_ALIGNMENT） |
|--------------------|---------|------------------------------------------|
| `risk_uncontrolled` / `risk_undercontrolled` | proc:ControlPoint（或风险所在 element） | `efio:hasControlGap`（值：severity + 参照条目 + 评价 ID） |
| `control_design_weak` | proc:ControlPoint | `efio:designEffectivenessAssessment`（六属性缺陷明细） |
| `control_not_executed` / `control_bypassed` | proc:ControlPoint | `efio:operatingEffectivenessObservation`（执行率/偏差构成 + 快照定位） |
| `kpi_not_achieved` / `kpi_absent` | proc:Metric | `efio:metricObservation`（实际值/基准/基准来源/达成状态） |
| `bottleneck_wait` / `cycle_time_outlier` | proc:ProcessActivity | `efio:bottleneckObservation`（P50/P90/等待占比） |
| `rework_loop` | proc:ProcessActivity（返工环端点） | `efio:reworkObservation`（返工率/流向） |
| `objective_vague` 等 | proc:ProcessObjective | `efio:objectiveQualityAssessment`（SMART 评级） |

断言记录结构（草案）：

```yaml
assertion_id: EAS-{assessment_id}-001
target: {proc 实例 IRI 或 efio 临时定位键}   # 见 §4 待定项 2
predicate: efio:hasControlGap
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

**待定项**（阻塞正式 schema 的三件事）：

1. **schema 归属**：evaluation-assertions 是 framework 独立 schema 还是 candidates 0.4.0 扩展——framework 侧评审定夺；
2. **实例定位约定**：评价场景中 digest 元素（PE-xxx）映射到已入库 proc 实例 IRI 的映射关系（应通过 digest 的 `PENDING_CORE_ALIGNMENT` 对齐记录建立），未对齐时断言只能用 efio: 临时键，价值受限；
3. **跨评价聚合语义**：同一 ControlPoint 被多次评价时的断言叠加规则（最新优先/时间序列/加权）。

## 5. 实施路径建议

1. 本文档作为提案输入 ontology_framework 的设计评审；
2. 对齐后：framework 出正式 schema → 本仓库 vendored（同 policy-digest 模式）→ REPORT 阶段增加可选的投影产物（`01_assessments/evaluation-assertions.yaml`）；
3. 在此之前，评价闭环完全不受影响（findings 已满足评价内消费）。
