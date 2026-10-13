---
name: space-task-board
version: 0.1.0
description: 工作空间任务台账的维护与调度配置。当需要新建/更新任务卡或项目卡、把任务提升为项目、初始化工作区台账、首次 setup（推荐数据目录+写配置+部署晨间刷新/下班收尾定时任务）、调整调度偏好、批量初始化多个工作区时使用。**不要**用于回答"进度如何/还有什么没做/看板"——那是 <data_home>/board.html 的职责，让用户直接打开网页或重跑对应定时任务即可，不加载本技能。
---

# 工作空间任务台账（维护端）

## 定位

本技能只管**写**与**配置**，不管**看**：

| 关切 | 归属 |
|------|------|
| 看进度、从哪里捡起来 | `<data_home>/board.html`（定时任务自动生成，ready to show） |
| 补充刷新看板 | 重跑晨间刷新定时任务，或 `scripts/refresh_board.py`（**不是**触发本技能） |
| 建卡 / 改卡 / 提升项目 | 本技能 `references/card-maintenance.md` |
| 首次安装与自检 | 斜杠命令 `/workspace-board`（编排入口，规程在本技能 `references/setup.md` + `fleet.md`） |
| 初始化工作区台账 / 调度配置 | 本技能 `references/setup.md` |
| 下班收尾（读会话→写卡→刷板） | 定时任务执行 `references/eod-wrap.md` |
| 跨空间发现 / 登记表策展 / 批量初始化 | 本技能 `references/fleet.md` |

## 首次自检（每会话最多提一次）

进入会话时按两级检测，**命中才提议、最多提一次、被拒或未被回应就不再问**：

1. **全局未 setup**：当前平台推荐的 `data_home` 下无 `config.json`，且本技能从未部署过 → 提议：
   > 「还没部署任务看板。要跑一下 `/workspace-board` 吗？（发现工作空间、确认清单、出看板、设定时任务，几分钟）」
2. **当前工作区未初始化**（全局已 setup，但本空间无 `.taskboard/TASKS.md`）→ 提议：
   > 「这个工作空间还没有任务台账。要我建一个吗？（会创建 `.taskboard/` 骨架并回填当前已知待办）」

用户同意 → 走 `references/setup.md` 对应流程；拒绝或未回应 → 正常干活，**本会话不再提**。

## 数据位置

- **工作区级**：`<工作区>/.taskboard/`（`tasks/` 卡片＝唯一权威数据 · `TASKS.md` 文本看板 · `config.json` 指针）
- **用户级** `<data_home>/`：`config.json` 总配置 · `workspaces.md` 登记表 · `board.html` 看板网页（派生缓存）
- `data_home` 由 setup 按当前 agent 推荐、用户确认（CodeBuddy→`~/.codebuddy/task-board/` 等，全表见 `references/setup.md`）
- 配置 schema：插件 `docs/config-schema.md`；所有脚本参数优先级：**命令行 > config.json > 内置默认**

## 两级结构（防碎裂的核心）

```
项目 P-x  ← 有目标、有范围、有验收标准；子项 >=3 时才建
   ├── 任务 T-x
   └── 任务 T-x
独立任务 T-x  ← 不属任何项目的单一事项
```

**判据**：子项 >= 3 或跨多个会话 → 项目；否则 → 独立任务。不为提升而提升。

## 纪律（硬约束）

1. **建卡必填三项**：目标（可验收）· 范围（不做什么）· 验收标准 —— 缺项即碎裂；用户没说就问，**不得编造**
2. **状态只用五个值**：`active` / `waiting` / `blocked` / `done` / `dropped`
3. **卡片是索引不是仓库**：正文只写要点，细节留在知识库/日志，用 `kb_refs` 指过去
4. **不改写历史条目**：已完成项保留原位，新进展追加；`done` 卡片保留 30 天再删
5. **ID 不回收**：done/dropped 占号不补（缺口是历史，不是错误）
6. **统计一律用脚本，不手算**：`scripts/audit_tasks.py <工作区路径>`
7. **变更同步三处**：卡片本身 → 所属项目卡子项表 → `TASKS.md` 对应行（看板网页随下次定时刷新自动更新）
8. **fleet 只读**：跨空间只汇总，不改其他工作区的台账；要改进那个工作区（批量初始化例外，见 `references/fleet.md`）
9. 台账内**不得放未脱敏案件材料**
10. **不主动刷台账**：只在被要求、或事项确实发生变更时写卡；当天进度由会话承载，下班收尾定时任务兜底
11. **回填以一手材料为准**：读该工作区日志/README 待办节抽取，材料没写全宁可留空

## 脚本（`<技能目录>/scripts/`，均支持 `--config`）

| 脚本 | 用途 |
|------|------|
| `refresh_board.py` | 解析登记表+各空间卡片 → 生成 `<data_home>/board.html`（看板唯一生成入口，定时任务与手动补充共用） |
| `audit_tasks.py <工作区路径>` | 未完成计数 + 看板计数一致性 + 健康检查（字段/必填三项/children/孤儿/ID 缺口） |
| `discover_ws.py` | 多 runtime 自适应发现工作区（只给候选，登记表做策展） |

> Windows：脚本与路径一律用绝对路径；`python` 用受管 Python 全路径。

## 模板

`<技能目录>/templates/`（`PROJECT-CARD.md` / `TASK-CARD.md`）是**权威源**；初始化时复制到各空间 `.taskboard/templates/`。改模板先改这里，再同步各空间。
