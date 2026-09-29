# 路径结构诊断（E1-E3，设计层，仅 digest）

## E1 串行审批链 / 并行机会

- 纯串行审批链（连续同角色节点无分支）链长统计
- 阈值匹配：审批层级与 rules 金额/风险阈值是否匹配（小额走长链 → `approval_overload`）
- 并行机会：前后环节无数据依赖（input_artifact_refs 对照）→ `serial_redundancy`（多串行无依赖）

## E2 返工环

- reject/return 边构成"回退前序环节"路径；无终止条件或无 RACI 责任角色 → `rework_loop`

## E3 交接链

- 按 RACI 统计跨部门/跨角色交接次数；"传递即丢失"弱交接（前角色输出 Artifact 不在后角色 input_artifact_refs）→ `handoff_excess`
