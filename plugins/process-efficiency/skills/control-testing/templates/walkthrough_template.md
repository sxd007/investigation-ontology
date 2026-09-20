# 穿行测试记录（walkthrough）

> 评价 ID：{assessment_id} ｜ 依据：baseline-{version} + digest 模板通路 ｜ 生成：{date}

## 实例选择

| # | 快照实例 | 路径类型 | 选择理由 |
|---|---------|---------|---------|
| 1 | {rec-xxx} | 正常主路径 | 典型样本 |
| 2 | {rec-yyy} | 条件路径（{edge_kind}） | 覆盖 {EDGE-XXX} |

## 路径对照（T2）

| 模板环节（flow_edges） | 实例环节（快照时间戳） | 一致 | 偏差说明 |
|----------------------|----------------------|------|---------|
| ACT-COLLECT → ACT-PRESCREEN | ✓ {操作人@时间} | ✓ | — |
| {ACT-PRESCREEN → ACT-APPROVAL} | **快照无此环节** | ✗ | {缺失或实际为模板外直达 → 大面积不符时先发 DDR(omission)} |

| 检查项 | 结果 |
|--------|------|
| 控制点是否被经过（角色对照 RACI） | {明细} |
| 输出 Artifact 是否产生（对照 digest artifacts） | {明细} |

## 汇总

- 穿行差异：{0 / 1 / >2 个环节}（>2 个环节差异 → DDR(omission) 分诊，再定性偏离）
