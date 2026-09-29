# 瓶颈分析（E5 + E7，实例层 + baseline）

| 环节 | 等待占比 | P90等待/全流程 | 队列深度 | 制度时限对照 | bottleneck_wait | cycle_time_outlier |
|------|---------|--------------|---------|------------|----------------|-------------------|
| {PE-xxx} | {…} | {…} | {积压件数} | {rules 时限} | high/medium/low | 是/否 |

## 说明

- 等待占比最高（P90 等待 > 全流程 40%）→ `bottleneck_wait`（high=瘫痪级 / medium=常态 / low=偶发）
- 环节 P50 超出 rules 时限 → 独立标注"制度违约率"，与 control-testing `control_deviation` 交叉引用（不重复计数）
- 单点负载：某角色同时是多串行环节 R → 队列深度分析
- `cycle_time_outlier`：P90/P50 比值异常大（>3）→ 待深挖项
