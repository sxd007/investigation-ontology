# 评价阈值基线（Threshold Baseline）

> 四个能力技能使用的全部数值阈值集中登记：**出处、性质、校准指引**。原则：阈值是**分诊/初判工具，不是判级依据**——finding 的 severity 始终按 finding-contract §4 判据独立判级。凡标注「经验值」的阈值无权威出处，可按企业历史数据校准（校准记录写进 baseline 的 notes）。

## 阈值总表

| 阈值 | 用于 | 性质 | 校准指引 |
|------|------|------|---------|
| 执行率 < **95%** → 重点标记 | control-testing T3 执行率看板 | 内审实务经验值（对应属性抽样语境的可容忍偏差率 5%；非权威标准） | 可按控制重要性分级：关键控制 95%、一般控制 90% |
| `control_not_executed` > **50%** → 先三分诊再定性 | control-testing DDR 分诊 | 经验值（过半未执行时，模板幻觉或数据缺口比系统性不执行更可能） | 一般无需校准 |
| 穿行差异 > **2 个环节** → DDR(omission) 分诊 | control-testing T2 | 经验值（1-2 环节差异更可能是真实偏离，>2 更可能是模板不完整） | 流程复杂度高时可上调 |
| 日频抽 **20-30 个工作日** / 月频抽 **3-6 个月** | control-testing T1 选样 | 经验值，非统计抽样（严格的属性抽样应按置信度/可容忍偏差率/预期偏差率反推样本量） | 系统数据可用时**直接全量**，抽样仅用于人工核验部分 |
| P90 等待 > 全流程等待的 **40%** → `bottleneck_wait` | efficiency-diagnosis E5 | 经验启发式（无权威出处） | 可改用企业历史分布的分位数（如 P75 以上）替代 |
| 返工率 > **10%** → 重点关注 | efficiency-diagnosis E6 | 经验启发式（无权威出处；创意/研发类流程容忍度天然更高） | 按流程类型分级：审批类 10%、研发类 20%+ |
| P90/P50 比值 > **3** → `cycle_time_outlier` | efficiency-diagnosis E7 | 统计启发式（分布偏度经验界） | 可用 IQR 法（> Q3 + 1.5×IQR）替代，更稳健 |
| SMART 缺 **3+ 项** → vague / 缺 1-2 项 → partial | goal-alignment G2 | 经验值（SMART 为通用管理工具，无权威判级标准） | 一般无需校准 |
| 串行链长 / 交接次数阈值（E1/E3 目前无数值） | efficiency-diagnosis | 待实践校准——golden case 积累后补充 | 从实例数据分布反推 |
| 实例可聚合 ≥ **90%** / 环节映射覆盖 ≥ **80%** | 数据可行性预检 F2/F3（control-testing / efficiency-diagnosis 实例层前置） | 经验值（首个 golden case 后校准） | 企业有数据质量标准时优先用内部标准；<50% 时 F3 触发"快照外系统"排查 |

## 使用纪律

1. 产物中引用阈值时**不得包装为"行业标准"或"最佳实践"**——经验值就是经验值，表述为"建议阈值"；
2. 企业有内部基准（历史均值、考核线）时**优先用内部基准替代经验值**，并在产物中注明替代依据；
3. 阈值触发只决定"是否深挖/是否重点标记"，不直接决定 finding 有无与 severity；
4. 新增阈值必须登记本表（双向索引纪律，同 finding_type 枚举）。

## Related

- [finding-contract](./finding-contract.md)（severity 判级 §4——阈值之上的人判依据）
- control-testing SKILL（T1/T2/T3 阈值使用点）、efficiency-diagnosis SKILL（E5/E6/E7）
