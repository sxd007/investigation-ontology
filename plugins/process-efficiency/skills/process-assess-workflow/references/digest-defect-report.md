# Digest 缺陷报告（DDR）机制

> 下游评价技能（goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）依赖上游流程知识包（digest-schema 兼容，默认生产者 policy-digest）。上游的**遗漏、错归类、锚点错误、幻觉**会被下游继承并放大。本机制让下游在专业领域内**识别并报告**上游缺陷嫌疑，由上游验证闭环——下游不自行修改 digest，也不自行回读原文。

## 1. 三种解释的分诊原则

下游观察到异常时，必须先区分三种解释，再决定去向：

| 解释 | 判定信号 | 去向 |
|------|---------|------|
| **制度真有问题** | 排除另两种后成立；或经原文核验确认 | finding（正常通道） |
| **解构缺陷**（遗漏/错归类/锚点错/幻觉） | 下方各技能分诊表 | **DDR**（本机制） |
| **数据质量问题** | 实例层快照覆盖不足/字段缺失 | baseline 归因记录（现有纪律） |

**禁止跳过分诊直接定性**： defect-susceptible 类 finding（见 §3）在 DDR 闭环前只能保持 provisional 状态。

## 2. DDR 结构

```yaml
ddr_id: DDR-001                       # DDR-NNN 序号
reporter: rcm-analysis                # 报告技能
suspicion_type: omission              # omission | misclassification | anchor_error | hallucination
suspected_location:                   # digest 中被怀疑的位置
  doc_id: ACME-POL-001
  element_ref: RISK-007               # 或 objective/control/flow_edge 的 ID；omission 时为"应存在而缺失"的挂接点
description: 参照集"回扣"风险未覆盖，但规则 R-012 涉及供应商返利条款，疑原文有风险表述未提取
evidence:                             # 下游视角的证据（不回读原文）
  - "digest rules R-012 原文锚点 excerpt 含'返利'字样，但 risks[] 无对应风险条目"
status: open                          # open | verified | dismissed | deferred
resolution:                           # 验证结论（由 policy-digest 侧或人工填写）
  verified_by: null
  outcome: null                       # verified(缺陷成立) | dismissed(排除，须给理由)
  note: null
  digest_action: null                 # 修复时记录新 digest 版本号（supersedes 链）
```

存放位置：工作流场景 `01_assessments/ddr.yaml`（跨维度汇总，不属于任何单一技能）；嵌入场景（场景二）写入调用方指定位置。

## 3. 各技能分诊表（何时怀疑上游）

### goal-alignment

| 观察 | 缺陷嫌疑 | DDR 类型 |
|------|---------|---------|
| L3 无目标，但其 entry/exit_conditions 已表达结果态（"形成XX清单"） | 目标存在于原文但未提取 | omission |
| 父子目标冲突，且子目标挂接的元素 hierarchy_confidence 低 / decomposition_basis=inferred_structure | 层级归错导致假冲突 | misclassification |
| 目标 statement 与其 source excerpt 语义不符 | 锚点错挂 | anchor_error |

### rcm-analysis

| 观察 | 缺陷嫌疑 | DDR 类型 |
|------|---------|---------|
| `risk_unidentified`（参照集缺口）——**最高嫌疑场景** | 风险在原文有表述但未提取。**规则**：该类 finding 必须先发 DDR，dismissed 后才可升级为确认发现 | omission |
| `control_orphaned` / `control_risk_mismatch` | 控制与风险的链接提取错误，而非设计缺陷 | misclassification |
| 控制某设计属性缺失（无 frequency/evidence），且该控制所在条款锚点 excerpt 含频次/证据字样 | 字段存在于原文但未提取到 controls[] | omission |

### control-testing

| 观察 | 缺陷嫌疑 | DDR 类型 |
|------|---------|---------|
| **实例路径出现 digest 中不存在的控制点/环节**（实例数据=独立先知） | 模板遗漏了制度记载或实际存在的环节 | omission |
| `control_not_executed` 比例异常高（>50%），且快照覆盖核验通过 | 控制可能在快照未覆盖的系统执行（数据缺口）**或** digest 幻觉了不存在的控制 | hallucination（并注数据缺口可能） |
| 穿行测试的实际路径与 flow_edges 大面积不符（>2 个环节差异） | flow_edges 提取不完整，而非实际偏离 | omission |

### efficiency-diagnosis

| 观察 | 缺陷嫌疑 | DDR 类型 |
|------|---------|---------|
| 实例高频返工环在 flow_edges 无对应 reject/return 边 | 流转边遗漏 | omission |
| `serial_redundancy` 判定所依赖的 input_artifact_refs 疑似错挂（后环节实际依赖前环节产出） | 依赖关系归类错误——**不排除则并行化建议是伪优化** | misclassification |
| 环节周期对照 rules 时限发现 rules 无时限条款，但锚点 excerpt 含时限数字 | 时限参数未提取 | omission |

## 4. 验证与闭环

**验证权归属**：policy-digest（或人工审核者）——只有它能合规地回读原文（下游技能受消费纪律约束）。

```
下游发 DDR(open)
  → policy-digest 按 suspected_location 回读原文核验
     ├─ verified（缺陷成立）→ 修订 digest：
     │    · 走 supersedes/superseded_by 版本链出新版本（不就地改）
     │    · DDR 记录 digest_action = 新版本号
     │    · 受影响 findings 由报告技能重新锚定并复检结论
     └─ dismissed（原文确无）→ 记录排除理由
          · 对应 finding 从 provisional 升级为确认发现
          · "经原文核验，确属制度缺失而非解构遗漏"——排除本身就是证据加强
```

**基线联动**：baseline 声明其引用的 digest 版本/哈希。digest 修订出新版本后，baseline 的引用检测到漂移，REPORT 前须决定：本评价按原版本收口（记录已知缺陷豁免）或升版基线重跑受影响维度。

## 5. 门禁联动

process-assess-workflow 的 REPORT 阶段新增门禁：

- `upstream_defects_resolved`：全部 open DDR 已闭环（verified 已修复并重新锚定 / dismissed 已记录理由 / deferred 已评估影响并经 Owner 确认延期）

## 6. 未复核内容的降权

finding 锚定的 digest 内容若 `review.status != confirmed`（proposed 等），finding 须标注 `upstream_review: pending`；REPORT 聚合时此类 finding 单独列示，Owner 确认环节须同时确认上游复核状态。**防止未人审的解构内容直接变成评价结论。**

## 7. 双向纪律

- 下游**只报告不修改**：不写 digest、不回读原文、不替上游下"确实是遗漏"的结论（那是 verified 的语义，归上游）；
- 上游**必须响应**：DDR 不允许静默忽略；无法核验（如原文缺失）时状态置 deferred 并记录原因；
- DDR 与 digest 的 issues[] 通道分工：issues 是 policy-digest **自检**发现的文档内在缺陷；DDR 是**下游专业视角**发现的缺陷嫌疑。二者在 digest 修订时合并处理。
