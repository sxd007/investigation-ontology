# 风险控制矩阵（R1）

> 行 = digest `risks[]`，列 = digest `controls[]`，映射关系来自 `controls[].risk_refs`。
> ● 主要应对  ○ 辅助应对  - 无关联

| 风险 \ 控制 | CTL-001 | CTL-002 | CTL-003 | … |
|------------|---------|---------|---------|---|
| RISK-001 虚假供应商 | ● | ○ | - | |
| RISK-002 超授权采购 | ● | - | - | |
| RISK-003 信息滞后 | - | - | ●(部分) | |
| **[参照] {参照集条目}** 制度未声明 | - | - | → `risk_unidentified`（须先 DDR） | |

## 标记

- `control` 的 `risk_refs` 为空或指向不存在风险 → `control_orphaned`（矩阵外单列）
- 映射依据须可回溯到 digest 的 risk/control ID 与 source 锚点
- **[参照]** 行为风险参照集识别的缺口，与制度明文风险分列，不得混排（制度未声明由参照集识别）

## 矩阵附注

| 项 | 结果 | 说明 |
|----|------|------|
| orphan controls（risk_refs 空/悬空） | {CTL-XXX} 或 无 | 每个产生 `control_orphaned`（先过 DDR 分诊） |
| 映射与 risk_refs 不符处 | {明细} | 语义复核推翻字面映射时必须记录理由 |
