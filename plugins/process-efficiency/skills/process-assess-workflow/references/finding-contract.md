# 评价发现契约（Finding Contract）

> 四个能力层技能（goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）产出的评价发现必须遵循本契约，REPORT 阶段才能统一收敛为评级结论与改进建议清单。本契约由 process-assess-workflow 拥有，能力技能引用并遵守。

## 0. 模板层输入契约

四技能的模板层输入是 **digest-schema 兼容的流程知识包**（Policy Digest 0.2.0/0.3.0 schema 形态：L1–L5 层级、flow_edges、RACI、risks/controls、带原文锚点）。生产者不限于 policy-digest：

| 生产者 | 状态 | 说明 |
|--------|------|------|
| policy-digest（文档解构） | ✅ 已实现 | 默认路径：制度文档 → digest 成果包 |
| 本体层投影（ontology_framework Enterprise 层 → digest 形态投影） | 规划中 | 企业流程本体已入库时直接投影，评价与本体闭环 |
| 实例反推（process mining，事件日志 → 结构化路径） | 规划中 | 仅限 template-free 降级模式（§7），不能补足设计层评价 |

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
- 契约校验工具：`process-assess-workflow/scripts/validate-findings.mjs`（零依赖；AI 填充真实数据后运行，检查必填/枚举/前缀-维度一致/锚点纪律/占位符，REPORT 收敛前应 0 错误）。
- 调查案件嵌入场景（场景二）：调用方指定输出根时，findings 写入调用方指定位置，不创建本契约 §5 的目录结构。

## 6. 与 digest 的边界

评价发现**只消费**流程知识包（digest-schema 兼容，见 §0）与 baseline 快照：

- 不修改 digest（评价是消费者，制度解构缺陷走 [DDR 机制](./digest-defect-report.md)反馈，由上游验证闭环）；
- 不读制度原文（锚点经 digest 间接追溯）；
- 改进建议涉及制度修订的，标注 `recommendation_scope: policy_revision | execution_improvement | data_quality`，供 REPORT 区分建议性质。

## 7. Template-free 降级模式

无流程知识包（没有制度文档、知识包尚未建立）时，部分技能可降级为**纯实例评价**：

| 技能 | 可否降级 | 降级后范围 |
|------|---------|-----------|
| goal-alignment | ❌ 不可 | 评价对象（目标）本身缺失，声明不适用 |
| rcm-analysis | ❌ 不可 | 无设计即无"设计评价"可言，声明不适用 |
| control-testing | ✅ 部分 | 仅自洽性检查（职责冲突、留痕缺失、实例路径自洽）；绕过/偏离类发现无模板基准，跳过 |
| efficiency-diagnosis | ✅ 大部分 | E4–E7（周期分解/瓶颈/返工/离群）完整可用；E1–E3 结构诊断跳过 |

降级模式纪律：

1. findings 只带 `anchor.baseline`（无 digest 锚点可引）；
2. 报告显著标注"无模板基准——结论限于实证发现，不含设计评价"；
3. 发现实例路径高度一致的结构模式时，提示"适合后续建立流程知识包做设计层评价"，但不自行推断模板；
4. 该模式不与正常模式混用（同一评价中知识包就位后，须重跑全部维度而非只补设计层）。

## 8. 负面清单（不合格 finding 反模式）

以下形态不得进入 REPORT（validate-findings 覆盖其中可机械检查项，其余靠 ASSESS 门禁 `stakeholder_review_done` 与 REPORT 复核）：

| 反模式 | 不合格示例 | 为什么不合格 | 合格形态 |
|--------|-----------|-------------|---------|
| **空话建议** | recommendation："加强供应商管理" | 无动作、无责任方、无验证方式（REPORT 门禁 `recommendations_actionable`） | "为供应商准入增加工商信息核验步骤（责任方：采购部；验证：抽查新准入供应商的核验记录）" |
| **复述而非发现** | statement："制度规定采购须审批" | 复述 digest 内容，无评价性结论——清单归 digest，评价归 finding | "审批控制未设金额分级，小额与巨额采购同级审批（control_design_weak）" |
| **越权定性** | control-testing 输出"构成舞弊" | 可疑信号只记录现象+移交，定性归调查（T4 移交纪律） | severity=high + evidence 详列 + 移交建议条目（含快照定位） |
| **重复计数** | CT-003 与 ED-002 描述同一超期问题 | 同一问题多维各出一条，虚增发现数 | 主责技能出 finding，其他维度 `cross_ref` 交叉引用 |
| **占位残留** | recommendation："{…}" | 未填充的模板残留 | 填实或删除该 finding（validate-findings 占位符检查兜底） |
| **证据不定位** | evidence：["详见快照"] | 无法复核（锚点纪律 §2） | "snapshots/oa-export.json#rec-04127 无审批动作记录" |
| **严重度通胀** | 全部 finding severity=high | 判级失真、分诊失效（§4） | 按 §4 判据分级，调整须记录理由 |
| **阈值当判据** | "等待占比 41%>40%，故 high" | 阈值是分诊工具不是判级依据（threshold-baseline 原则） | "等待占比 41% 触发深挖；high 因该环节日均积压 N 单且涉资金结算（§4 判据）" |
