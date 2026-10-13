---
description: 任务看板首次安装与自检 — 发现工作空间、策展登记表、回填台账、生成看板、部署定时任务
---

# /workspace-board

任务看板的**首次安装与状态自检入口**。幂等：已部署过的环境重跑本命令 = 状态检查 + 按需重配。

先加载 `space-task-board` 技能，其 `references/setup.md` 与 `references/fleet.md` 是本命令各步骤的详细规程；本命令负责编排顺序与向用户确认。

## 流程

### Step 0 · 数据之家（仅首次）

1. 按当前平台推荐 `data_home`（表见 `references/setup.md` §一.1），**请用户确认或改径**
2. 写用户级 `<data_home>/config.json`（schema 见插件 `docs/config-schema.md`；`runtime` 填当前 agent，调度段先写默认值，Step 4 再按用户偏好改）

已存在 config.json → 跳过，报一句"检测到已部署：\<data_home\>"。

### Step 1 · 检查全部工作空间

1. 跑 `python <技能目录>/scripts/discover_ws.py --config <data_home>/config.json`
   （Windows：受管 Python 全路径 + 绝对路径）
2. 拿到候选清单（含 `<时间戳>` / `<已删除>` 标签项）；对已纳入或有台账的空间，可用
   `audit_tasks.py` 补充计数状态

### Step 2 · 用户策展 + 回填确认

1. **列表给用户**：工作区别名 · 路径 · 台账状态（有/无/计数）· 标签
2. **请用户确认增减**：哪些纳入汇总、哪些排除（时间戳/已删除默认建议排除）→
   写 `<data_home>/workspaces.md`（格式见 `references/fleet.md`；排除段写原因）
3. **询问是否回填**：对纳入但无台账的空间，逐个问"要现在建台账并回填吗？"
   - 是 → 按 `references/setup.md` §二初始化（骨架 → 一手材料回填 →
     必填三项从材料抽取，抽不齐**留空并当场问用户**，不编造）
   - 否 → 跳过，登记表台账列标 ❌

### Step 3 · 生成并展示看板

1. 跑 `python <技能目录>/scripts/refresh_board.py --config <data_home>/config.json`
2. 输出一句话简报：N 工作区 / X 项未完成 / Y 项等外部 / Z 项受阻
3. **展示**：在 IDE 内预览或告知用户 `<data_home>/board.html` 已生成、可双击打开
   （页内点击事项名可看卡片全文）

### Step 4 · 调度偏好 + 部署定时任务

1. **询问用户**：
   - 晨间刷新：几点？（默认 08:30）哪些天？（默认周一至周五）要不要？
   - 下班收尾：几点？（默认 18:00）要不要？（它会读当天会话写卡+刷板+给收尾小结）
2. 把偏好写回 `<data_home>/config.json` 的 `schedule` 段
3. 用 `automation_update` 部署/重建两个 recurring 任务
   （RRULE 仅支持 HOURLY/WEEKLY："每天 HH:MM" = `FREQ=WEEKLY;BYDAY=...;BYHOUR=H;BYMINUTE=M`；
   prompt 模板见 `references/setup.md` §一.3，路径按实际替换）
4. 汇报：两个任务的名称与调度；告知用户日后**改偏好 = 说「调整看板调度」**
   （改 config.schedule + 重建任务，无需重跑本命令全部流程）

## 收尾输出

一段式总结：data_home 位置 · 纳入 N 个空间（新建台账 X 个 / 已有 Y 个 / 无台账 Z 个）·
看板路径 · 两个定时任务的调度 · 日常使用方式（看进度打开 board.html；急看说「重跑看板刷新」）。

## 注意

- 本命令是唯一需要用户显式发起的环节；部署完成后日常**不需要**再触发技能或命令
- 全程遵守技能纪律：fleet 只读（Step 2 的回填是在各空间内操作，不是跨空间写）、
  统计一律脚本、必填三项不编造、台账内不得放未脱敏案件材料
