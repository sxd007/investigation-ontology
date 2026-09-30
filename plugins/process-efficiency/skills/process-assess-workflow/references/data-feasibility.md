# 数据可行性预检（Data Feasibility Pre-check）

> 实例层分析（control-testing 的穿行/偏差测试、efficiency-diagnosis 的周期分解/瓶颈/返工）的**前置强制步骤**：动手分析之前，先核验基线快照能支撑哪些测试项，把"能做什么、降级什么、剔除什么"显式声明为产物。目的：防 garbage-in-gospel-out——拿先天不足的数据硬算出看似精密的结论，比不算更有害。
> 执行时机：BASELINE 门禁 `data_snapshots_sealed` 之后、各维度实例层分析之前；产物 `01_assessments/{dimension}/data_feasibility.md`（由 generate-dimension-drafts 预填骨架）。

## 检查项

| # | 检查项 | 检查方法 | 合格标准 | 不合格的降级路径 |
|---|--------|---------|---------|----------------|
| F1 | **时间戳粒度** | 抽样 N 条记录看时间戳精度 | 分钟级及以上（E4-E7 需要动作级） | 天级 → 周期分解降级为"环节顺序 + 天级耗时分布"；时限类偏差测试（超时限审批）剔除；其余测试不受影响 |
| F2 | **实例可聚合性** | 随机抽 5-10 笔实例，尝试拼出完整路径（申请→审批→执行→归档各环节的人/时间/动作） | ≥90% 实例可聚合（经验值，待校准） | 不足 → control-testing 降级为自洽性检查（template-free 路径，finding-contract §7）；efficiency E4-E7 只对可聚合子集计算并注明样本偏差 |
| F3 | **环节可映射** | 快照环节名/步骤码 → digest L4 元素的映射表，统计实例步骤的映射覆盖率 | ≥80%（经验值，待校准）；映射表本身是底稿，随 data_feasibility 存档 | 不足 → 只测可映射控制点；过低（<50%）→ 穿行对照（T2）与路径类分析整体降级，先排查是否快照外系统执行 |
| F4 | **字段完整性** | 逐字段核对：操作人 / 动作类型 / 时间 / 业务对象 | 四要素齐全 | 缺操作人 → `segregation_conflict` 不可测；缺动作类型 → `control_not_executed` 不可测；缺业务对象 → 只能做聚合统计。逐项在产物中标注 |
| F5 | **快照覆盖核验** | 窗口内实例数与业务量级 sanity check（与流程 Owner 或业务量统计对照） | 量级一致（无系统性缺失） | 不一致 → 归因 data_gaps（评价方/数据方），"未执行"类发现必须先排除"快照外执行"（三分诊②）再定性 |
| F6 | **触发条件可判定** | 对条件触发型控制，确认快照含判定触发条件的字段（金额/类型/状态） | 应控实例可圈定 | 不可圈定 → 该控制测试降级为"仅已执行实例的合规性检查"，标注无法计算执行率 |

## 产物：测试项可行性矩阵

预检结论必须收敛为一张矩阵——**每个计划测试项**明确三态之一，不得含糊：

| 测试项 | 结论 | 依据（检查项） | 降级/限制说明 |
|--------|------|--------------|--------------|
| T2 穿行测试 | full / degraded / excluded | F2/F3 | {…} |
| T3 执行偏差分析 | full / degraded / excluded | F1/F4/F5 | {…} |
| E4 周期分解 | full / degraded / excluded | F1/F2 | {…} |
| … | | | |

- `full`：按方法论完整执行；`degraded`：缩小范围/降低精度并在报告限制节注明；`excluded`：不做，原因与数据归因写入报告限制；
- 矩阵是 ASSESS 门禁 `data_sufficiency_assessed` 的直接证据，REPORT 的限制节从这里摘编。

## 纪律

1. **先声明后分析**：可行性矩阵签署前不得产出实例层 finding——事后补的预检是装饰；
2. **降级不失锚**：degraded/excluded 的测试项不是"没做"，是"声明不做"——必须落进报告限制节（`data_sufficiency_assessed` 门禁已有此要求，本预检是其操作化）；
3. **阈值标注**：F2/F3 的合格线为经验值（见 [threshold-baseline](./threshold-baseline.md)），首个 golden case 后校准；企业有既有数据质量标准时优先用内部标准；
4. **不重复劳动**：BASELINE 阶段已做的快照覆盖核验（F5）可直接引用，不返工；预检只新增 F1/F2/F3/F4/F6 的实测。

## Related

- [threshold-baseline](./threshold-baseline.md)（F2/F3 阈值登记处）
- control-testing SKILL（T1-T3 消费本预检结论）、efficiency-diagnosis SKILL（E4-E7）
- finding-contract §7（template-free 降级模式——F2 不合格的法定退路）
