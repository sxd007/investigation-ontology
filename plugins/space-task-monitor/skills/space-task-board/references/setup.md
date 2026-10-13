# Setup：首次配置 / 初始化工作区 / 调度部署

> **入口**：首次安装与自检由斜杠命令 `/workspace-board` 编排（发现 → 策展 → 看板 → 调度）。
> 本文是该命令各步骤的详细规程，也可单独用于局部操作（改调度、单空间初始化）。

## 一、首次 setup（每个 data_home 一次）

目标：确定 fleet 之家 → 写双 config → 部署两个定时任务。

### 1. 推荐 data_home 并请用户确认

| 当前 agent | 推荐 data_home |
|-----------|---------------|
| CodeBuddy | `~/.codebuddy/task-board/` |
| Claude | `~/.claude/task-board/` |
| Codex | `~/.codex/task-board/` |
| WorkBuddy | `~/.workbuddy/task-board/` |
| 其他 / 多 agent 共用一套台账 | `~/.task-board/` |

用户可覆盖为任意路径。**一个 data_home 管全部工作区**；多 agent 并用时，若希望跨 agent 共享台账，约定同一个 data_home。

### 2. 写用户级 `<data_home>/config.json`

按插件 `docs/config-schema.md` §1：填 `runtime`（当前 agent）、`home`（自身路径）、调度偏好（晨刷/EOD 的时间与工作日，**先问用户作息**，默认 08:30 / 18:00 / 周一至周五）、tips 阈值（默认即可）。

### 3. 部署定时任务（agent 内 automation）

用 `automation_update` 建两个 recurring 任务。RRULE 只支持 HOURLY/WEEKLY：
"每天 HH:MM" = `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=H;BYMINUTE=M`（days 按 config.schedule）。

**晨间刷新**（示例 prompt，路径按实际替换）：

> 运行看板刷新：执行 `python <技能目录>/scripts/refresh_board.py --config <data_home>/config.json --write-tasks-md`（Windows 用受管 Python 全路径与绝对路径）。成功后用一句话简报：N 工作区 / X 项未完成 / Y 项等外部 / Z 项受阻；失败则报告错误输出。不要做其他任何操作。

**下班收尾**（示例 prompt）：

> 执行 space-task-board 技能的下班收尾流程：读取 `<技能目录>/references/eod-wrap.md` 并严格按步骤执行。数据目录配置在 `<data_home>/config.json`。

### 4. 验证

手动跑一次晨间刷新 prompt 的全部动作，确认 `<data_home>/board.html` 生成、浏览器可打开。

**改调度偏好** = 改 config.json 的 schedule 段 + 用 `automation_update`（suggested update）重建对应任务。

## 二、初始化新工作区（每个工作区一次）

1. 建 `<工作区>/.taskboard/`、`tasks/`、`templates/`
2. 复制两个模板（**从 `<技能目录>/templates/`**，它是权威源）
3. 写 `<工作区>/.taskboard/config.json` 指针（`data_home` 指向用户级目录，schema §2）
4. `TASKS.md` 不手写 —— 回填卡片后由 `refresh_board.py --write-tasks-md` 生成（派生物）
5. 在 `<工作区>` 的 IDE 上下文文件（按当前平台：`CODEBUDDY.md` / `CLAUDE.md` / `CODEX.md`）尾部追加「任务台账」节（见下；**若文件内有其他插件的标记包裹段（如 `efio:handbook-start/end`），不得插入标记段之间**，一律追加到文件尾部；无上下文文件则建最小版：抬头指向权威导航 + 空间定位一段 + 本节）
6. 回填：读该工作区的日志、`README.md` 待办/结论节等**一手材料**聚合首版事项；目标/范围/验收标准必须从材料抽取，材料没写全宁可留空待用户补。
   **回填卡一律如实标 `def_source`**（`extracted`/`inferred`）；回填完成后把各卡三项**压缩成清单批量请用户确认**（"这几张卡的目标是这样理解的，对吗？"），确认的卡改 `user` + `def_confirmed`
7. 把该工作区加进 `<data_home>/workspaces.md` 纳入段（格式见 `references/fleet.md`）
8. 跑一次 `audit_tasks.py` 确认 0 问题

**IDE 上下文文件待粘贴节**（按当前平台选 CODEBUDDY.md / CLAUDE.md / CODEX.md）：

```markdown
## 任务台账

台账：`.taskboard\TASKS.md`（看板）＋ `.taskboard\tasks\`（`P-` 项目卡 / `T-` 任务卡）。

- 两级结构：子项 >=3 的事项建项目卡（`P-`），其余为独立任务卡（`T-`）
- 建卡必填三项：目标（可验收）· 范围（不做什么）· 验收标准
- 更新时机：新事项 → 建卡；状态或阶段变化 → 改卡；下班收尾 → 同步看板
- 查进度 → 打开全局看板网页（config.json 指针里的 data_home/board.html），不要在对话里重算
- 状态取值：`active` / `waiting` / `blocked` / `done` / `dropped`；统计一律用脚本
```

## 三、批量初始化

用户说「给每个工作空间都建台账」时：先 `discover_ws.py` + 读登记表拿纳入清单 → 逐空间执行第二节 → 全部完成后跑一次 `refresh_board.py` → 报告里**分开写**「新建了哪几个」与「刷新了哪几个」。详见 `references/fleet.md`。
