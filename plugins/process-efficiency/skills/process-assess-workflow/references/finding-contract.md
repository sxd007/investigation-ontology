# 评价发现契约（Finding Contract）

> 四个能力层技能（goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）产出的评价发现必须遵循本契约，REPORT 阶段才能统一收敛为评级结论与改进建议清单。本契约由 process-assess-workflow 拥有，能力技能引用并遵守。

## 1. Finding 结构

每个评价发现是 YAML frontmatter 文档或表格行，字段如下：

```yaml
finding_id: GA-001                # 必填。前缀+3位序号：GA(goal)/RC(risk)/CT(control)/ED(efficiency)
dimension: goal                   # 必填。goal | risk | control | efficiency
finding_type: objective_vague      # 必填。各技能枚举值，见 §3
severity: high                     # 必填。high | medium | low
anchor:                            # 必填。至少一项，保证可追溯
  digest:                          # 模板层锚点（来自 digest.json）
    doc_id: ACME-POL-001
    block_id: b-012
    element_ref: PROC-SCREENING    # 相关流程元素/objective/risk/control 的 ID
  baseline:                        # 实例层锚点（来自 baseline 数据快照）
    version: baseline-v1
    snapshot_ref: snapshots/oa-export-2026q3.json
    record_ref: "rec-04127"        # 快照内记录定位（行号/记录ID）
statement: 供应商筛选目标未定义可度量标准    # 必填。一句话发现
evidence:                          # 必填。支撑细节，引用锚点内容
  - "digest process_objectives OBJ-001 statement 为'完成供应商筛选'，无数量/时限/质量要素"
recommendation: 为筛选目标补充达成标准（如'5个工作日内完成，一次通过率≥80%'）  # 建议补全，REPORT 前不得为空
owner_suggestion: 采购部（流程 Owner）       # 建议责任方
status: proposed                   # proposed | confirmed（流程 Owner 过审后 confirmed）
```

## 2. 锚点纪律（可追溯性硬约束）

1. **模板层发现**（设计层分析）必须有 `anchor.digest`——指向 digest.json 的具体 doc_id/block_id/元素 ID，经 digest 的原文锚点可回溯到制度条款；
2. **实例层发现**（数据快照分析）必须有 `anchor.baseline`——指向 baseline 版本 + 快照文件 + 记录定位；
3. **禁止悬空结论**：statement 无法落到锚点的，不得作为 finding 输出，只能进"观察（observations）"区并注明无法定位的原因；
4. anchor 不得指向基线外的未快照数据（保证可复现）。

## 3. finding_type 枚举（按技能）

| 技能 | 枚举值 |
|------|--------|
| goal-alignment | `objective_missing` / `objective_vague` / `objective_unmeasurable` / `objective_conflict` / `goal_process_misaligned` / `kpi_absent` / `kpi_not_achieved` / `kpi_definition_unclear` |
| rcm-analysis | `risk_uncontrolled` / `risk_undercontrolled` / `risk_unidentified` / `control_orphaned` / `control_redundant` / `control_design_weak` / `control_risk_mismatch` |
| control-testing | `control_not_executed` / `control_bypassed` / `control_deviation` / `control_evidence_missing` / `exception_unlogged` / `segregation_conflict` |
| efficiency-diagnosis | `bottleneck_wait` / `rework_loop` / `serial_redundancy` / `approval_overload` / `handoff_excess` / `cycle_time_outlier` |

新增枚举值须同时更新本契约（双向索引纪律）。

## 4. severity 判级指引

| 级别 | 判据 |
|------|------|
| high | 已造成或很可能造成：目标不可达成 / 高风险无控制 / 控制被系统性绕过 / 瓶颈导致流程瘫痪 |
| medium | 降低达成质量或效率，有明确改进路径：目标不可度量 / 控制设计弱但未失效 / 局部瓶颈 / 返工率偏高 |
| low | 优化空间：冗余控制 / 措辞模糊但方向明确 / 等待时间略高于合理值 |

severity 是**评价技能的初判**，REPORT 阶段结合流程 Owner 反馈可调整（调整须记录理由）。

## 5. 输出位置与聚合

- 单维度产物写入 `01_assessments/{dimension}/`（由 process-assess-workflow 的 ASSESS 调度矩阵指定）；
- findings 同时汇总到 `01_assessments/{dimension}/findings.yaml`（该维度全部 finding 的清单，REPORT 阶段由此聚合）；
- 调查案件嵌入场景（场景二）：调用方指定输出根时，findings 写入调用方指定位置，不创建本契约 §5 的目录结构。

## 6. 与 digest 的边界

评价发现**只消费** digest.json / candidates.json / baseline 快照：

- 不修改 digest（评价是消费者，制度解构缺陷记入 digest 的 issues 通道或反馈给归口部门）；
- 不读制度原文（锚点经 digest 间接追溯）；
- 改进建议涉及制度修订的，标注 `recommendation_scope: policy_revision | execution_improvement | data_quality`，供 REPORT 区分建议性质。
