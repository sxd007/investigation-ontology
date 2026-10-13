# space-task-monitor

工作空间任务台账与跨空间监控插件 — 在每个工作区维护两级任务看板（项目卡 `P-` / 任务卡 `T-`），并跨工作区汇总整体进度，解决多 agent 会话间的进度连续性。

## 能力概览

| 层 | 说明 |
|------|------|
| 展示 | 离线看板网页 `board.html`（总览 + 分工作区 tab + 卡片弹窗），定时自动生成，ready to show |
| 维护 | 工作区内建卡/改卡/提升为项目（agent 行为纪律，非用户触发） |
| 调度 | agent 内定时任务：晨间刷新看板、下班收尾写卡 |
| fleet | 跨工作区发现、登记表策展、汇总（只读） |

## 安装后部署

**装好插件后，执行一次斜杠命令：**

```
/workspace-board
```

命令引导完成四步（全程有确认，不静默改东西）：

| 步骤 | 做什么 | 需要你确认的 |
|------|--------|-------------|
| 1 检查 | 发现当前 agent 管理的全部工作空间，检查各空间台账状态 | — |
| 2 策展 | 列出工作空间清单与状态 | 纳入/排除哪些空间；哪些空间要**回填**建台账 |
| 3 看板 | 跨空间汇总生成 `board.html` 并展示 | — |
| 4 调度 | 部署晨间刷新 / 下班收尾两个定时任务 | 时间与工作日偏好（默认 08:30 / 18:00 / 周一至周五） |

命令幂等：已部署的环境重跑 = 状态自检 + 按需重配。

**之后**：日常无需任何操作——早上看板已刷好，下班自动收尾。看进度打开 `board.html`；改时间说「调整看板调度」；急看最新状态说「重跑看板刷新」（执行的是定时任务，不是技能）；新工作区说「初始化任务台账」（agent 也会每会话主动提议一次）。

## 数据位置

- 空间层：`<工作区>/.taskboard/`（`TASKS.md` 看板 + `tasks/` 卡片 + `config.json` 指针）
- 全局层：`<data_home>/`（`config.json` 总配置 + `workspaces.md` 登记表 + `board.html` 看板网页）
- `data_home` 由 setup 按当前 agent 推荐（`~/.codebuddy/task-board/` 等），schema 见 [`docs/config-schema.md`](docs/config-schema.md)

> 数据归用户所有、目录约定与 agent 平台解耦 —— 多个 agent 平台可共享同一套台账。

## 运行方式

定时静默为主：setup 部署 agent 内定时任务（晨间刷新看板 / 下班收尾写卡），用户打开 `board.html` 即见状态；看板由 `skills/space-task-board/scripts/refresh_board.py` 确定性生成，零 LLM 成本。

## 结构

```
plugins/space-task-monitor/
├── commands/workspace-board.md   # 斜杠命令：首次安装与自检入口
├── skills/space-task-board/
│   ├── SKILL.md                  # 薄门面：维护端触发 + 纪律（展示端在 board.html）
│   ├── references/               # card-maintenance / setup / eod-wrap / fleet
│   ├── scripts/                  # refresh_board（渲染）/ discover_ws（发现）/ audit_tasks（校验）
│   └── templates/                # PROJECT-CARD / TASK-CARD（权威源）
├── docs/config-schema.md         # 双 config schema + 目录约定
├── examples/                     # e2e/ 虚构数据 fixture（入库样张）+ config.sample.json
└── VERSION / README.md / 4 平台清单
```

## 状态

v0.1.0：骨架 ✅ ｜ 渲染引擎 ✅ ｜ 数据层 ✅ ｜ 薄技能 + 调度模板 ✅ ｜ E2E 验证 ✅ ｜ 分发注册 ✅

## License

Apache-2.0
