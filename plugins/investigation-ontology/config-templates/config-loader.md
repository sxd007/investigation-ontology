# 配置加载契约（Config Loading Contract）

**所有 skill 和 agent 不得直接执行实质性工作，直到已完成以下配置检查。**

---

## § 平台路径（Platform Config Path）

在读写任何用户配置前，必须先确定 `{PLUGIN_CONFIG_DIR}`，规则如下：

| 运行平台 | {PLUGIN_CONFIG_DIR} |
|---------|---------------------|
| **Claude Code** | `~/.claude/plugins/config/efio` |
| **CodeBuddy**   | `~/.codebuddy/plugins/config/efio` |
| **Codex**       | `~/.codex/plugins/config/efio` |
| **其他 / 未知** | `~/.investigation-ontology/config`（降级路径） |

**检测方式：** 平台由运行时上下文隐式决定——Claude Code 下 `$CLAUDE_PLUGIN_ROOT` 有值，CodeBuddy 下 `$CODEBUDDY_PLUGIN_ROOT` 有值，Codex 下 `$INVESTIGATION_ONTOLOGY_ROOT` 有值。如无法从环境变量判断，询问用户当前使用的平台。

---

## 前置规则

1. 配置路径（持久化，升级不覆盖）：
   ```
   {PLUGIN_CONFIG_DIR}/team-profile.md
   {PLUGIN_CONFIG_DIR}/evidence-policy.md
   {PLUGIN_CONFIG_DIR}/ocr-backend.md
   ```
   其中 `{PLUGIN_CONFIG_DIR}` 按上方平台路径表解析。
   team-profile.md 为必需；evidence-policy.md 和 ocr-backend.md 为可选。

2. 模板路径（插件自带，每次更新被覆盖）：
   ```
   <plugin-root>/config-templates/team-profile.md
   <plugin-root>/config-templates/evidence-policy.md
   <plugin-root>/config-templates/ocr-backend.md
   ```

3. 唯一豁免此检查的 skill：**cold-start** 自身。其他所有 skill 必须按以下流程执行。

---

## 标准加载流程

### Step 1: 检测配置状态

对每个配置文件的四种状态做分支判断：

```
READ {PLUGIN_CONFIG_DIR}/team-profile.md    ← 路径按上方平台表解析

IF 文件不存在:
  → 告知用户: "检测到插件尚未初始化，正在自动启动配置向导（约 10-15 分钟），完成后将继续您的操作。"
  → 自动执行 /efio:cold-start 完整流程（Phase 1 → 2.5 → 3 → 4）

ELSE IF 文件包含 "<!-- SETUP PAUSED AT:":
  → 告知用户: "检测到上次配置未完成，正在自动从断点继续。"
  → 自动执行 /efio:cold-start 断点恢复流程

ELSE IF 文件包含 "[PLACEHOLDER]":
  → 告知用户: "检测到配置不完整，正在自动引导补全。"
  → 自动执行 /efio:cold-start 补全流程（定位所有 [PLACEHOLDER] 逐项填写）

ELSE:
  → 配置就绪。继续。
  → 读取并记忆各字段值，按影响域调整 skill 行为（见 Step 2）。
```

### Step 2: 加载配置并应用到当前 skill

读取 `team-profile.md`，找到匹配当前 skill 的配置项（各字段的"影响技能"标注决定了归属），然后：

- **直接约束类**：当前 skill 的行为受配置值直接限制
  - 例如：interview-analysis 读取"同一事项连续通话上限"，达到上限时阻止操作
  - 例如：evidence-management 读取"默认密级"，登记新证据时自动填入
- **参数化类**：配置值改变输出的默认值
  - 例如：writing-reporting 读取"默认语言"，切换输出语言
  - 例如：case-management 读取"案件编号格式"，生成 ID 时使用

**如果当前 skill 在 team-profile.md 中没有对应配置项，正常跳过 Step 2。不是每个 skill 都需要配置。** 配置系统的原则是"需要时读取，不需要时忽略"。

### Step 3: 对 evidence-policy.md 重复 Step 1 的检查

同样四种状态判断。evidence-policy.md 是可选的——如果文件不存在或未配置，skill 使用内置默认值，**不阻止工作流**（不像 team-profile.md 缺失时必需停止）。

### Step 4: 对 ocr-backend.md 重复 Step 1 的检查

同样四种状态判断。ocr-backend.md 是可选的——如果文件不存在，document-parsing 技能回退到端口+1 约定推导（从 MCP URL 推导上传地址），**不阻止工作流**。仅当 OCR 路径实际执行且推导失败时，降级 AI 视觉解析并提示用户运行 `/efio:cold-start` 配置 OCR 后端。

---

## 配置状态的判断标准

| 状态 | 判断条件 | 处理方式 |
|------|---------|---------|
| DOES_NOT_EXIST | 文件路径不存在 | team-profile → 自动启动 cold-start 完整流程；evidence-policy → 使用默认值 |
| PAUSED | 文件包含 `<!-- SETUP PAUSED AT:` | 自动 resume cold-start 断点恢复流程 |
| HAS_PLACEHOLDER | 文件包含 `[PLACEHOLDER]`（不区分大小写） | 自动进入 cold-start 补全流程 |
| READY | 以上条件都不满足 | 读取配置，继续执行 |

---

## 新增配置项的规范

当在模板中新增一个配置项时，必须标注：

```
### 配置项名称

**影响技能：** skill-a, skill-b

| 字段 | 影响说明 |
|------|---------|
| 参数名 | 这个值会改变什么行为 |

**参数值：** [PLACEHOLDER]
```

**三步完成新增：**
1. 在 `config-templates/team-profile.md` 对应节中添加字段 + 影响技能标注
2. 目标 skill 的 SKILL.md 中添加读取该字段 + 应用的逻辑
3. 此 `config-loader.md` 无需修改（标准流程已覆盖）

---

*此文件描述加载规范。实际加载指令在 cold-start 和各 skill 的 SKILL.md 中执行。*
