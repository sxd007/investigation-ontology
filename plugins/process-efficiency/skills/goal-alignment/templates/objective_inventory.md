# 目标清单与 SMART 评级（G1）

> 来源：digest.json `process_objectives[]`。S/A/R/T 列填 ✅（满足）或 ❌（不满足）；评级=clear/partial/vague。

| 目标 ID | statement | assertion_basis | S | M | A | R | T | 评级 | 挂接 L3 |
|--------|-----------|-----------------|---|---|---|---|---|------|--------|
| OBJ-001 | {目标陈述} | explicit_text / analysis | ✅ | ❌ | ✅ | ✅ | ❌ | partial | {PE-xxx} |

## 评级说明

- `analysis` 推断的目标须在 finding 中注明"推断目标，非制度明文"
- 无目标的 L3 → `objective_missing`；目标与 exit_conditions 不呼应 → `goal_process_misaligned`
- 父子目标链不支撑上级 → `objective_conflict`

## 目标-流程对齐检查（G3）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 无目标的 L3 | {PROC-XXX, ...} 或 无 | 每个产生 `objective_missing`（先过 DDR 分诊） |
| 目标 vs exit_conditions 呼应 | {一致/不呼应明细} | 不呼应 → `goal_process_misaligned` |
| 父子目标链 | {完整/断链明细} | 断链或冲突 → `objective_conflict`（inferred 层级先过 DDR） |
