# 目标清单（objective_inventory）

> 评价 ID：{assessment_id} ｜ 依据：baseline-{version} ｜ 生成：{date}

## 目标 × SMART × 挂接

| 目标 ID | L3 挂接 | statement 摘要 | 断言依据 | S | M | A | R | T | 评级 | finding |
|---------|--------|---------------|---------|---|---|---|---|---|------|---------|
| OBJ-001 | PROC-SCREENING | 形成候选供应商清单 | explicit_text | ✓ | ✗ | ✓ | ✓ | ✗ | partial | GA-001 |
| OBJ-002 | — | （无 L3 挂接） | analysis | — | — | — | — | — | 悬空 | GA-002 |

- S/M/A/R/T 列：✓ 满足 / ✗ 不满足 / — 不适用（目标本身悬空时）
- 评级：clear（5✓）/ partial（1-2✗）/ vague（3+✗）/ 悬空（element_refs 无有效挂接）
- 断言依据：explicit_text（制度明文）/ analysis（推断，注明）

## 目标-流程对齐检查（G3）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 无目标的 L3 | {PROC-XXX, ...} 或 无 | 每个产生 objective_missing（先过 DDR 分诊） |
| 目标 vs exit_conditions 呼应 | {一致/不呼应明细} | 不呼应 → goal_process_misaligned |
| 父子目标链 | {完整/断链明细} | 断链或冲突 → objective_conflict（inferred 层级先过 DDR） |
