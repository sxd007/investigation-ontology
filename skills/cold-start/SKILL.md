---
name: cold-start
description: 首次设置向导 — 引导调查员完成团队配置、证据策略、集成检查和偏好设置。写入持久化配置路径，所有技能依赖此配置运行。支持中断恢复、升级合并和增量更新。
origin: efio
user-invocable: true
---

# Cold-Start 配置向导

首次安装 investigation-ontology 后的设置向导。在一次对话中完成所有配置，让插件从"通用模板"变成"你的调查工具"。

> **注意：** 本技能是**配置类**技能，不属于调查业务流程。

---

## 触发条件

| 场景 | 行为 |
|------|------|
| 插件安装后首次触发（SessionStart hook） | 自动提示运行 |
| **调用任意插件功能时配置未就绪** | **自动进入本向导，无需用户手动触发** |
| 用户主动运行 `/efio:cold-start` | 进入状态检测 |
| 用户运行 `--check-integrations` | 仅检查集成状态，不重新设置 |
| 用户运行 `--redo` | 重新完整设置，覆盖现有配置（先展示 diff） |

---

## 状态检测（入口）

每次运行时，先解析 `{PLUGIN_CONFIG_DIR}`（见 `config-templates/config-loader.md § 平台路径`），再检查四种状态：

| 平台 | {PLUGIN_CONFIG_DIR} |
|------|---------------------|
| Claude Code | `{配置路径}` |
| CodeBuddy   | `~/.codebuddy/plugins/config/efio` |
| Codex       | `~/.codex/plugins/config/efio` |

```
{PLUGIN_CONFIG_DIR}/team-profile.md 的状态:

DOES_NOT_EXIST      → 进入 Phase 1（全新设置）
├── evidence-policy.md 也不存在 → 标记为"可选，稍后设置"

PAUSED              → 提示用户"上次中断于[章节]，是否继续？"
├── 用户选择继续 → 跳转至中断点
├── 用户选择重来 → 进入 Phase 1

HAS_PLACEHOLDER     → 提示"配置不完整，继续补全或重来？"
├── 用户选择补全 → 逐个定位 [PLACEHOLDER] 位置并引导填写
├── 用户选择重来 → 进入 Phase 1

READY               → "配置已就绪，是否需要：
                         ├── --redo    重新完整设置
                         ├── --check-integrations  仅检查集成
                         └── 取消"
```

团队配置已就绪（READY）且用户选了 `--redo` 时，在覆盖前展示 diff：

```
── 准备覆盖现有配置 ─────────────────────────
原值: 普通案件周期上限: 30天
新值: 普通案件周期上限: 45天
                                              ← 后续字段变化逐行展示
── 确认覆盖？(yes/no) ───────────────────────
```

---

## Phase 1: 全新设置

用户首次使用或选择重来时进入此阶段。目标：完整填写 team-profile.md。

### 1.0 快速预设选择（Quick Preset）

**在逐字段采集之前**，读取 `config-templates/team-profile.md § 快速预设` 中的预设清单，向用户展示：

```
┌─ 请选择最接近你们团队的预设配置 ─────────────────────┐
│  1. cn-compliance    — 中国内地反舞弊/合规团队        │
│  2. hk-forensic      — 香港反舞弊/法证专项调查        │
│  3. sg-internal-audit — 新加坡内审部门               │
│  4. apac-analyst     — 亚太数据/反欺诈分析团队        │
│  5. hr-investigation — 员工行为/劳动纪律调查          │
│  6. custom           — 完全自定义（逐字段填写）         │
└───────────────────────────────────────────────────┘
```

- 用户选择预设（1–5）时：按预设映射表静默填入默认值，仅对标注 ★ 的字段弹出确认问题（立案审批人姓名、团队负责人姓名、组织名称等必须手动输入的信息）；其余字段直接写入，写入后向用户简短列出已填项供确认。
- 用户选择 `custom`（6）时：跳过本节，进入 1.1 逐字段采集。
- 若用户已有现成的公司资料（官网/企业介绍）：先用资料提取组织信息，然后再让用户选预设以填充其余字段。

选定预设后，将 `Selected Preset` 字段写入配置，后续 `--redo` 流程展示 diff 时包含此字段。

### 1.1 组织信息

**影响技能：** case-management、report-writer

采集：组织名称、行业、主要法域、监管机构。

提问策略：先问是否有现成的介绍（公司官网/About页面/企业信息卡片），有则读取提取，无则逐项填空。**2 个问题以内完成本节。**

### 1.2 调查团队

**影响技能：** case-management、investigation-planner

团队名称、规模、负责人、汇报线。

### 1.3 调查通信纪律

**影响技能：** interview-analysis、investigation-planner

关键参数：

| 参数 | 建议提问方式 |
|------|------------|
| 同一事项连续通话上限 | "同一个举报线索，最多可以连续联系举报人几次必须停下来复盘？" |
| 通话前背景核查 | "联系举报人之前是否需要先做背景核查？" |
| 通话后强制 call_memo | "每次通话后是否强制输出通话备忘录？" |
| 案件周期上限 | "普通案件从立案到结案，通常希望控制在多少天内？" |

### 1.4 审批流程

**影响技能：** case-management、report-writer

逐项确认：立案/数据提取/访谈/报告发布是否需要审批、谁来批。

### 1.5 报告偏好

语言、报告格式、编号规则等。

### 1.6 角色画像选择（Skill Profile）

**影响技能：** 全部（决定办案时默认聚焦/优先提示的技能集）

读取 `manifests/install-profiles.json`，向用户展示可选角色画像及其技能集，引导选择其一。画像是 install-profiles.json 在运行期的消费方——决定本团队默认聚焦哪些技能。

| 画像 | 适用 | 技能集（摘要） |
|------|------|--------------|
| investigator | 一线反舞弊调查员（默认推荐），覆盖报案到结案全流程 | 全部核心 + 本体 + 全部 fraud-* 场景 + 访谈/证据/报告 |
| auditor | 内审/合规，侧重数据分析与流程审计 | 调查基础、本体、数据分析、证据管理、写作报告 |
| analyst | 数据分析师，侧重数据挖掘与异常检测 | 调查基础、本体、数据分析、证据管理、写作报告 |
| interviewer | 访谈/问话专家，侧重陈述分析与证言评估 | 调查基础、本体、访谈分析、证据管理、写作报告 |
| full | 需要全部能力（含记忆、复盘、订单差异分析） | install-profiles.json 中的所有模块 |

提问策略：先问"你的团队主要做哪类调查工作？"，据答案推荐画像。**1 个问题完成本节。**

选定后，将画像名与其 `modules` 列表写入 team-profile.md 的"角色画像"节（`Selected Profile` 与 `Active Skills`）。该画像决定办案时优先加载/提示的技能，但不阻止按需临时加载任何其他场景技能（`full` 之外的画像仍可临时加载）。

### 1.7 调查记忆策略

说明 `investigation-memory` 在所有 profile 中安装，并会将符合准入规则的非正式过程信息写入案件目录。询问一次写入策略：

- `silent`：后台写入，成功后不提示
- `notify`：写入后给出一行提示（推荐安全默认值）
- `disabled`：禁止新写入，只读已有条目

将选择写入 team-profile.md 的 `Memory Write Policy`。用户未选择、升级时暂未补全或旧配置缺少该字段时使用 `notify`，不得直接回退到静默写入。

---

## Phase 2.5: MCP 环境配置

用户选定角色画像后，检查已有 MCP 配置，引导用户按需补充。

1. **检查已有配置** — 读取用户级 (`~/.codebuddy/mcp.json`) 和项目级 (`.mcp.json`) 配置，展示当前状态
2. **能力补充建议** — 对比 `mcp-configs/mcp-servers.json`，展示尚未配置的可选 MCP
3. **选择注册通道** — 引导用户按决策树选择用户级或项目级（通用能力→用户级，案件专用→项目级）
4. **写入配置** — 按选择的通道写入对应配置文件
5. **验证与记录** — 验证可用性，记录到 team-profile.md 集成状态表

> 详细流程和示例见 `references/mcp-configuration.md`。注册通道选择策略见 `docs/mcp注册指南.md`。

用户也可选择"暂不配置，稍后用 `/efio:mcp-config` 添加"。

### 2.6 OCR 后端配置

如果 Phase 2.5 检测到 `paddleOCR-mcp` 已注册，引导用户配置 OCR 文档投递机制。写入 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`。

```
检测到 paddleOCR-mcp 已注册。需要配置文档投递方式。

┌─ OCR 服务器如何接收文件？──────────────────────────────┐
│  1. 自动推导（标准部署，MCP 端口+1 即上传接口）         │  ← 默认推荐
│  2. 显式指定上传地址（云服务/反向代理/不同主机）         │
│  3. 共享文件系统（NFS/SMB 挂载，无需上传）              │
│  4. 自定义投递方式                                      │
│  5. 暂不配置（使用默认回退，后续可手动编辑）             │
└──────────────────────────────────────────────────────┘
```

根据用户选择，从 `config-templates/ocr-backend.md` 模板生成配置文件并填入对应值：

- 选 1（auto）→ `Upload Method: auto`，其余字段填默认值
- 选 2（http）→ 追问上传地址和认证信息，填入 `Upload Endpoint` 和 `Auth Headers`
- 选 3（shared_fs）→ 追问共享路径前缀，填入 `Shared Path Prefix`
- 选 4（custom）→ 追问投递步骤描述，填入 `Custom Upload Instructions`
- 选 5 → 跳过，ocr-backend.md 不生成。document-parsing 回退到端口+1 约定推导。输出摘要中显示"OCR 后端: 未配置（端口+1 回退）"。

> ocr-backend.md 是可选配置。不生成时 document-parsing 技能回退到端口+1 约定推导。

---

## Phase 3: 验证集成

检查已配置的 MCP 服务器的可用性。运行 `--check-integrations` 时仅执行此阶段。

对用户选定的各 MCP 逐一验证：
- **HTTP/SSE 类型**：检查服务端点可达性
- **stdio 类型**：检查命令可执行性

输出按用户级 / 项目级分组展示，标记 ✓ 可用 / ✗ 故障。详细示例见 `references/mcp-configuration.md` 第 5 节。

---

## Phase 4: 写入配置 + 模板合并

### 4.1 全新写入

首次设置时，按模板结构写入 `{PLUGIN_CONFIG_DIR}/team-profile.md`（路径按平台表解析，见 § 状态检测入口）。模板中所有 `[PLACEHOLDER]` 替换为用户填写值。

如果 Phase 2.6 生成了 OCR 后端配置，同样写入 `{PLUGIN_CONFIG_DIR}/ocr-backend.md`。

### 4.2 模板合并（升级场景）

插件升级后，`config-templates/team-profile.md` 和 `config-templates/ocr-backend.md` 可能新增了配置项。检测流程：

```
1. READ 新模板 (config-templates/team-profile.md, config-templates/ocr-backend.md)
2. READ 现有用户配置 ({PLUGIN_CONFIG_DIR}/team-profile.md, {PLUGIN_CONFIG_DIR}/ocr-backend.md)
3. 按 H2 节逐节对比:
   - 模板中存在但配置中不存在的节 → 标记为"新配置项"
   - 模板和配置中都存在但配置中有 [PLACEHOLDER] → 标记为"待补全"
   - 配置中已填写的字段 → 保留不动
4. 如存在"新配置项"或"待补全"项:
   → "插件升级后新增了以下配置项，需要补充："
   → 逐项引导填写
5. 无新增项 → "无需变更，配置已是最新"
```

`Memory Write Policy` 属于持久化行为配置。升级发现该字段缺失时必须列入“新配置项”并说明写盘影响；补全前运行期采用 `notify` 安全默认值。

### 4.3 MCP 状态记录

在 team-profile.md 的"集成状态"节记录验证结果（含注册通道列）。表格式样见 `references/mcp-configuration.md` 第 6 节。

### 4.4 项目操作手册

在当前工作区根目录中写入 `INVESTIGATION-HANDBOOK.md`——这是插件的操作指南原件，包含技能加载策略、案件生命周期、文件规范、质量管理等完整内容。

| 项目 | 说明 |
|------|------|
| 目标路径 | `<workspace-root>/INVESTIGATION-HANDBOOK.md` |
| 内容来源 | `project-templates/default/INVESTIGATION-HANDBOOK.md` |
| 写入方式 | **完整复制模板内容，不做摘要、不缩减、不改写** |
| 覆盖策略 | 如已存在，对比内容；内容一致则跳过，不一致则覆盖并告知用户 |

> **注意：** 不直接写入 `CODEBUDDY.md`/`CLAUDE.md`/`CODEX.md`——这些文件由 IDE 自动管理。
> 插件的 SessionStart hook 会自动将 INVESTIGATION-HANDBOOK.md 中的精简规则段
> （`<!-- efio:inject-start -->` 至 `<!-- efio:inject-end -->` 标记之间）
> 注入到平台对应的上下文文件中。hook 具有双重自愈机制：
> 1. INVESTIGATION-HANDBOOK.md 缺失时自动从模板复制
> 2. 平台上下文文件中标记段缺失或过期时自动重新注入

### 4.5 输出摘要

```
╔══════════════════════════════════════════════════════════════════╗
║              investigation-ontology 配置完成                           ║
╠══════════════════════════════════════════════════════════════════╣
║  组织: XX 集团公司  |  行业: 制造  |  法域: 中国大陆              ║
║  团队: 调查部 (5人)  |  汇报: 审计委员会                          ║
║  通信纪律: 已配置    |  审批流程: 已配置                           ║
║  角色画像: investigator  |  启用模块: {按 profile 实时计算}         ║
║  MCP 集成: 2/3 可用  |  缺失: 自定义搜索服务                       ║
║  OCR 后端: auto / http / shared_fs / custom / 未配置(端口+1回退)       ║
╚══════════════════════════════════════════════════════════════════╝
┌─ 推荐的下一步 ──────────────────────────────────────────────────┐
│  /investigate new    启动第一个案件                              │
│  /help investigation-foundation  了解调查基础方法论               │
└─────────────────────────────────────────────────────────────────┘
```
│  /efio:cold-start  重新配置               │
│  --check-integrations                    检查集成状态            │
└────────────────────────────────────────────────────────────────┘
```

---

## 升级说明（发版注意）

每次发版更新 `config-templates/team-profile.md` 或 `config-templates/ocr-backend.md` 时：

1. **保留模板结构**：所有字段保持 `[PLACEHOLDER]` 标记
2. **新增字段必须标注"影响技能"**：确保 cold-start 能识别并归入正确的合并流程
3. **不修改 config-loader.md**：该契约已覆盖所有场景
4. **用户配置不受影响**：`{PLUGIN_CONFIG_DIR}/*` 不会被插件更新覆盖

---

## Related

- **Skills:** [调查流程与案件管理](../case-management/SKILL.md)、[MCP 能力目录](../mcp-integration/SKILL.md)
- **Config System:** [config-loader.md](../../config-templates/config-loader.md)、[team-profile.md 模板](../../config-templates/team-profile.md)
- **Commands:** `/efio:cold-start`, `--check-integrations`, `--redo`
