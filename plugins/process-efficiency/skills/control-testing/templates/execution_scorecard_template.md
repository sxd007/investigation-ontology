# 控制执行看板（control_execution_scorecard）

> 评价 ID：{assessment_id} ｜ 依据：baseline-{version} ｜ 生成：{date}

## 执行率总览（T3）

| 控制 | 应控实例数 | 偏差数 | 执行率 | 重点 | 偏差构成（finding_type → 条数） |
|------|-----------|--------|--------|------|------------------------------|
| CTL-001 | 1,247 | 31 | 97.5% | — | control_deviation ×31 |
| CTL-002 | 214 | 61 | 71.5% | ★ | control_not_executed ×52（先过三分诊）/ control_bypassed ×9 |

- 执行率 < 95% → 重点标记 ★，对应 finding severity 上调评估
- control_not_executed > 50% → 必须先走三分诊（未执行 / 快照外系统 / 模板幻觉→DDR）

## 偏差明细索引

完整逐条偏差见 `deviation_details.md`（每条含 anchor.baseline 定位），此处仅列汇总与重点项。
