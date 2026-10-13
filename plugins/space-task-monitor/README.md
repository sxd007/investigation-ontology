# space-task-monitor

工作空间任务台账与跨空间监控插件 — 在每个工作区维护两级任务看板（项目卡 `P-` / 任务卡 `T-`），并跨工作区汇总整体进度，解决多 agent 会话间的进度连续性。

## 能力概览

| 模式 | 范围 | 说明 |
|------|------|------|
| space | 当前工作区 | 看板读写、建卡/改卡/提升为项目、进度汇报 |
| fleet | 跨工作区 | 工作区发现、登记表策展、跨空间汇总（只读） |

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
├── skills/space-task-board/
│   ├── SKILL.md                  # 薄门面：维护端触发 + 纪律（展示端在 board.html）
│   ├── references/               # card-maintenance / setup / eod-wrap / fleet
│   ├── scripts/                  # refresh_board（渲染）/ discover_ws（发现）/ audit_tasks（校验）
│   └── templates/                # PROJECT-CARD / TASK-CARD（权威源）
├── docs/config-schema.md         # 双 config schema + 目录约定
├── examples/                     # board-sample.html（真实数据样张）+ config.sample.json
└── VERSION / README.md / 4 平台清单
```

## 状态

v0.1.0 开发完成，待端到端验证：骨架 ✅ ｜ 渲染引擎（tab 看板 + 页内卡片弹窗）✅ ｜ 数据层（模板 + config schema）✅ ｜ 薄技能 + 调度模板 ✅ ｜ 分发注册 ✅

## License

Apache-2.0
