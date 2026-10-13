---
id: P-1
title: E2E 演示项目
type: project
status: active
priority: P1
owner: Alpha
created: 2026-10-10
updated: 2026-10-13
next_review:
children: ["T-001", "T-002", "T-003"]
kb_refs: []
---

# P-1 · E2E 演示项目

**目标**：验证 .taskboard 结构端到端可用。

**范围（不做什么）**：不碰真实工作区数据。

**验收标准**：refresh/audit/discover 三脚本在 fixture 上全部通过。

**进度**：子项完成比 1 / 3。

## 子项

| ID | 事项 | 状态 | 进度 |
|---|---|---|---|
| T-001 | 活动子项 | `active` | 推进中 |
| T-002 | 等外部子项 | `waiting` | 卡用户确认 |
| T-003 | 已完成子项 | `done` | 2026-10-12 完成 |

## 阻塞 / 待外部

- T-002 卡在用户：需确认演示数据口径

## 下一步

1. 推 T-001 完成刷新链路验证
