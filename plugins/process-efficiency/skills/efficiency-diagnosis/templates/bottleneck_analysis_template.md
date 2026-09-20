# 瓶颈与返工分析（bottleneck_analysis + rework_analysis）

> 评价 ID：{assessment_id} ｜ 依据：baseline-{version} + digest 结构 ｜ 生成：{date}

## 瓶颈清单（E5）

| 环节 | 等待占比 | 队列深度 | 判定 | severity | finding |
|------|---------|---------|------|----------|---------|
| ACT-PRESCREEN | 81%（P90 等待 > 全流程 40%） | {积压件数} | 瓶颈 | medium | ED-001 |

- 单点负载：{某角色为多个串行环节 R 时的队列分析} 或 无
- severity：high=瘫痪级积压 / medium=常态性延迟 / low=偶发

## 返工分析（E6）

| 指标 | 值 | 说明 |
|------|-----|------|
| 返工率 | {x%}（走 reject/return 路径实例占比） | 建议 >10% 关注 |
| 返工集中点 | {环节 × 流向} | 集中于单点时交叉引用对应维度 |
| 设计环 vs 实际环 | {flow_edges 有环且实际高频 / 设计无环但实际高频回退} | 后者 → 交叉引用 control_bypassed（CT 主责） |

## 结构诊断摘要（E1-E3，无流程知识包时此节跳过并注明）

| 检查 | 结果 | finding |
|------|------|---------|
| 串行审批链长（可并行候选） | {明细} | serial_redundancy（依赖关系先过 DDR） |
| 制度内返工环（起点/终点/终止条件/责任角色） | {明细} | rework_loop |
| 跨部门交接次数 / 弱交接 | {明细} | handoff_excess |
