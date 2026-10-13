---
id: T-000
title: <一句话事项名>
project: P-0
granularity: std
status: active
priority: P2
owner: <负责人>
created: YYYY-MM-DD
updated: YYYY-MM-DD
next_review:
due:
blocker:
def_source: inferred
def_confirmed:
kb_refs: []
sessions: []
---

# T-000 · <标题>

**目标**：<一句话，须可验收 —— 写成"能做什么"，不是"要关注什么">

**范围（不做什么）**：<明确排除项。**这一栏是防碎裂的关键** —— 不写，事项会不断长出新的子任务>

**验收标准**：<满足什么条件算完成。没有终点的卡会一直挂着，越积越碎>

**进度**：<一句话>

## 已完成

- YYYY-MM-DD <做了什么，附产物路径>

## 未完成

- <还差什么>

## 阻塞 / 待外部

- <卡在谁那里、卡什么；无则写「无」>

## 下一步

1. <下一个可立即执行的动作>

---

<!--
状态取值（只这五个）：active / waiting / blocked / done / dropped

granularity（定义分级）：
  std   标准任务（默认）—— 必填三项：目标 / 范围 / 验收标准
  mini  微任务 —— 同时满足：一个动作一句话说清、完成与否无争议、单会话可完成、
        无蔓延空间。mini 只必填「目标」一行（多数 = 标题复述），范围 / 验收可省。
        mini 一旦跨会话、长出子任务或完成标准开始模糊 → 升级回 std 并补齐三项。
        不为偷懒而 mini —— 它是给"标题即定义"的事项用的，不是逃避定义的后门。

project 字段：填所属项目 ID（如 P-1）；独立任务留空。
  子任务 ≥3 或跨多个会话 → 提升为项目：建 P-<n>-<slug>.md，本卡改为子项填 project:

due / blocker（都可留空）：
  due      真·截止日（YYYY-MM-DD）—— 与 next_review（复核节奏）是两回事；
           看板对临期 / 逾期给出提示
  blocker  阻塞归因，仅 status 为 waiting / blocked 时填：
           user（卡在你本人）/ external（外部方）/ internal（自己可解但受阻）
           不填则看板按阻塞文本推断（不如填了准）

def_source（三项的出处，须如实标）：
  user（用户表述/已确认，同时写 def_confirmed 日期）/ extracted（材料抽取待确认）/
  inferred（AI 推断待确认）。非 user 且未 confirmed → 看板标「定义待确认」

下一步：只写一条、必须是当天可立即执行的动作（看板续接清单只取第一条）；
  更多待办放「未完成」

维护纪律（卡片级）：
  · 状态有变化就改本卡 + updated；不改写历史条目，新进展追加
  · 卡是索引不是仓库：细节用 kb_refs 指过去；不得放未脱敏案件材料
  · TASKS.md 与 board.html 均为派生物，refresh 时重新生成 —— 不要手改
-->
