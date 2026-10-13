# space-task-monitor 配置 Schema

两份配置文件，分工明确：**用户级 config.json 是 fleet 之家的总配置**；**工作区级 config.json 只是一枚指针**，回答"本空间的台账归哪个 fleet 管"。

所有路径解析优先级：**命令行参数 > config.json > 内置默认**。

---

## 1. 用户级 `<data_home>/config.json`

`data_home` 由 setup 时按当前 agent 推荐、用户确认：

| agent | 推荐 data_home |
|-------|---------------|
| CodeBuddy | `~/.codebuddy/task-board/` |
| Claude | `~/.claude/task-board/` |
| Codex | `~/.codex/task-board/` |
| WorkBuddy | `~/.workbuddy/task-board/` |
| 其他 / 多 agent 共用 | `~/.task-board/` |

```json
{
  "version": 1,
  "home": "~/.codebuddy/task-board",
  "runtime": "codebuddy",
  "tasks_dirname": ".taskboard",
  "registry": "workspaces.md",
  "board": "board.html",
  "schedule": {
    "morning_refresh": { "enabled": true,  "time": "08:30", "days": ["MO", "TU", "WE", "TH", "FR"] },
    "eod_wrap":        { "enabled": true,  "time": "18:00", "days": ["MO", "TU", "WE", "TH", "FR"] }
  },
  "tips": { "stale_days": 14, "due_soon_days": 7 }
}
```

| 字段 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `version` | 是 | — | schema 版本，当前 `1` |
| `home` | 否 | `~/.task-board` | data_home 自指；供 `--config` 直读场景解析其余相对路径 |
| `runtime` | 是 | — | 当前 agent 标识（`codebuddy`/`claude`/`codex`/`workbuddy`/…），discover 据此选择会话目录适配器；不在内置注册表的 runtime 用 `discover.session_roots` 指定 |
| `tasks_dirname` | 否 | `.taskboard` | 工作区级台账目录名（历史目录迁移完成前可暂配为旧目录名） |
| `discover.session_roots` | 否 | — | 自定义会话根目录列表（私有/定制 agent 用），优先级高于 runtime 内置适配器 |
| `registry` | 否 | `workspaces.md` | 登记表文件名（相对 data_home） |
| `board` | 否 | `board.html` | 看板输出文件名（相对 data_home） |
| `schedule.morning_refresh` | 否 | 见上 | 晨间看板刷新的定时偏好，**供 setup 部署 agent 定时任务时读取**，`refresh_board.py` 本身不消费 |
| `schedule.eod_wrap` | 否 | 见上 | 下班收尾的定时偏好，同上 |
| `tips.stale_days` | 否 | `14` | 综合提示「进行中但 N 天未更新」阈值 |
| `tips.due_soon_days` | 否 | `7` | 综合提示「N 天内到期复核」窗口 |

**改偏好 = 改 config + 重建定时任务**（setup 动作的「重新部署调度」分支）。

## 2. 工作区级 `<工作区>/.taskboard/config.json`

```json
{
  "version": 1,
  "data_home": "C:/Users/<用户名>/.codebuddy/task-board",
  "created": "2026-10-13"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `version` | 是 | schema 版本 |
| `data_home` | 是 | 指向用户级 fleet 之家（绝对路径）。agent 在本空间工作时据此找到登记表与看板 |
| `created` | 否 | 台账初始化日期 |

## 3. 目录约定汇总

```
<data_home>/                     ← 用户级（全局唯一）
├── config.json                  ← 本文件 §1
├── workspaces.md                ← 登记表（策展权威）
└── board.html                   ← 看板（派生缓存，每次刷新覆盖）

<工作区>/.taskboard/             ← 工作区级（每空间一份）
├── config.json                  ← 本文件 §2（指针）
├── TASKS.md                     ← 空间看板（markdown 文本视图）
├── tasks/                       ← 卡片（P-*.md / T-*.md，权威数据）
└── templates/                   ← 卡片模板副本（权威源在插件 skills/space-task-board/templates/）
```

**权威与派生**：卡片是唯一权威数据；`TASKS.md`、`board.html` 均为派生缓存，可从卡片重建。
