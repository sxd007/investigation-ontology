# 控制执行率看板（T3）

> 偏差率 = 偏差实例数 / 应控实例数。执行率低于建议阈值（95%）的控制列为重点 finding。

| 控制点 | 应控实例 | 偏差实例 | 偏差率 | 重点标记 | 偏差构成（finding_type→条数） | finding |
|--------|---------|---------|-------|---------|------------------------------|---------|
| CTL-001 | {n} | {m} | {m/n} | {是/否} | {control_deviation ×k} | CT-xxx |

## 偏差类型

`control_not_executed`(应执行未执行) / `control_bypassed`(绕过) / `control_deviation`(执行但偏离) /
`exception_unlogged`(例外未记录) / `control_evidence_missing`(留痕缺失) / `segregation_conflict`(职责冲突)

## 说明

- 执行率 < 95% → 重点标记 ★，对应 finding severity 上调评估
- `control_not_executed` > 50% → 必须先走三分诊（未执行 / 快照外系统 / 模板幻觉→DDR），再定性
- 完整逐条偏差见 `deviation_details.md`（每条含 `anchor.baseline` 定位）
