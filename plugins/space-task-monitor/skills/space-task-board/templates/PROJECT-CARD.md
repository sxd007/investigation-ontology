---
id: P-0
title: <项目名>
type: project
status: active
priority: P1
owner: Alpha
created: YYYY-MM-DD
updated: YYYY-MM-DD
next_review: YYYY-MM-DD
def_source: inferred
def_confirmed:
children: []
kb_refs: []
---

# P-0 · <项目名>

**目标**：<项目完成后能达到什么状态，须可验收>

**范围（不做什么）**：<明确排除项 —— 这一栏决定项目边界，防止子项无限增殖>

**验收标准**：<满足什么条件算项目完成。**写成可测的**（如"3 分钟内找到 X"），不要写成"体系完备">

**进度**：<一句话；子项完成比 N / M>

## 子项

| ID | 事项 | 状态 | 进度 |
|---|---|---|---|
| T-000 | | `active` | |

## 阻塞 / 待外部

- <项目级瓶颈；子项各自的阻塞写在各子项卡里>

## 下一步

1. <优先推哪个子项、为什么>

---

<!--
何时建项目：
  · 一个事项的子任务 ≥ 3 个，或它跨了多个会话
  · 多个子项共享同一个瓶颈（如都卡在同一份律师复核上）
  · 需要向人汇报整体进度而不只是单点进度

与任务卡的区别：
  · 项目卡管「为什么做、做到什么算完、边界在哪」—— 变更极少
  · 任务卡管「具体做完哪些、还差什么」—— 随进展变动
  · 项目卡不重复子项的细节，只给汇总表与瓶颈判断

状态取值：同任务卡（active / waiting / blocked / done / dropped）
  项目状态由子项决定：任一子项 waiting 且是关键路径 → 项目 waiting；
  全部子项 done → 项目 done，整体移入看板「近期完成」

def_source（定义来源，三项「目标/范围/验收标准」的出处，须如实标）：
  user       用户明确表述或已确认 → 同时把 def_confirmed 写为确认日期
  extracted  AI 从既有材料（日志/README）抽取，未经用户确认
  inferred   AI 归纳推断，未经用户确认
  看板对非 user 且未 confirmed 的卡标「定义待确认」；批量确认后改为 user + def_confirmed
-->
