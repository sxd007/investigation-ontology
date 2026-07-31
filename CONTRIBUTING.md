# 贡献指南

感谢你考虑为 investigation-ontology 贡献代码或内容。本文档是参与本项目的**必读规范**，涵盖架构合规、编写规范、注册同步、提交流程和伦理要求。

***

> **快速开始：** 还不确定从哪个方向入手？阅读[一、贡献方向引导](#一贡献方向引导)了解当前最需要帮助的领域。

***

## 目录

- [一、贡献方向引导](#一贡献方向引导)
- [二、架构合规——先分类，再动手](#二架构合规先分类再动手)
- [三、文件规范](#三文件规范)
- [四、注册与同步](#四注册与同步)
- [五、内容编写规范](#五内容编写规范)
- [六、伦理与许可](#六伦理与许可)
- [七、提交流程](#七提交流程)

***

## 一、贡献方向引导

本项目按**场景驱动**的策略持续扩展。以下方向是当前最需要社区贡献的领域。

### 1.1 场景经验技能（fraud-*）的扩展与完善（首要方向）

这是最核心、最需要的贡献方向。无论是新增一个 `fraud-<domain>` 还是完善已有的场景技能，你需要交付的内容包括：

#### 通用 Reference 文件的扩充

每个场景技能都应配套**不绑定单一企业的通用参考资源**，让调查员拿到后能直接替换成自己公司的制度。包括但不限于：

- **制度索引模板**（`references/policy_index.md`）— 该场景涉及哪些企业制度条款、法规依据，提供示例条款供调查员替换
- **预警信号清单**（`references/red_flags.md`）— 该场景特有的行为/数据/财务异常信号，按确定性高低分级
- **访谈问题库**（`references/interview_questions.md`）— 按角色分组的标准化问题，配合 `interview-analysis` 使用
- **法规与判例索引**（`references/legal_basis.md`）— 适用的法律法规、司法解释、行业监管文件
- **行业基准数据**（`references/benchmarks.md`）— 行业平均利润率、正常损耗率等用于异常比对的参考值

#### 普遍适用性脚本的开发

提供**参数化的可复用脚本**，调查员替换数据库表名、字段名或文件路径即可运行：

- **SQL 分析脚本**（`scripts/detect_xxx.sql`）— 参数化查询，如日期范围、金额阈值、部门代码等作为变量
- **Python 辅助脚本**（`scripts/analyze_xxx.py`）— 独立的命令行脚本，从 CSV/JSON 读入，输出结构化结果
- **伪代码分析流程**（`scripts/reasoning_flow.md`）— 不适合写代码但可以标准化的分析推理步骤

脚本应当：
- 在文件开头注释中说明**前置数据需求**（需要哪些表/字段/文件）
- 关键阈值参数化，用 `--param` 或 `[替换]` 标记
- 提供两到三种常见数据库方言的版本（如 MySQL / PostgreSQL / ClickHouse）

#### 可视化交付物模板

该场景特有的图表、报告插图、数据看板原型：

- **链路图模板**（`templates/flow_diagram.md`）— 用 Mermaid 或 ASCII art 表示的业务流程/资金流向图模板
- **报告插图模板**（`templates/report_diagram.md`）— 调查报告第 7-9 章可直接引用的可视化表达
- **数据看板原型**（`templates/dashboard.md`）— 该场景的关键指标仪表盘设计

#### 评估标准

一份好的场景贡献，应该让一个从未接触过该领域的新手调查员，拿到后能立刻知道：**查什么、怎么查、用什么工具查**。

贡献的场景技能成熟度分级：

| 成熟度 | 标准 |
|--------|------|
| **α (alpha)** | SKILL.md 框架 + 核心信号清单完整 |
| **β (beta)** | 含 reference 文件 + 至少 1 个可用脚本 |
| **GA (stable)** | references/ + scripts/ + templates/ 三件套完整，已在真实案件验证 |

### 1.2 工具赋能类技能的增强

- 数据分析脚本的通用化与参数化
- MCP 集成场景的扩展与文档化
- 新的调查技术或取证方法的补充

### 1.3 工作流类技能的优化

- 阶段定义的完善与门禁条件细化
- JSON Schema 的字段扩展（需向后兼容）
- 跨技能的数据流衔接优化

### 1.4 国际化与本地化

- 核心术语的中英文对照补充
- `docs/zh-CN/` 和 `docs/en/` 目录的双语文档同步
- 非中文场景的制度模板适配（如 FCPA、UK Bribery Act）

***

## 二、架构合规——先分类，再动手

investigation-ontology 的所有内容分为三大类。**每新增一个文件、每修改一个模块，先判定它属于哪一类**，然后遵循该类别的设计原则。

| 类别 | 范围 | 核心原则 |
|------|------|---------|
| **工作流 (Workflow)** | 阶段框架、数据模型、通用方法论 | 通用、稳定、可验证、不绑定领域 |
| **工具赋能 (Tooling)** | 数据分析、MCP 集成、SQL 脚本、可视化工具 | 弹性、可扩展、有 fallback、无强依赖 |
| **场景经验 (Domain Knowledge)** | 具体舞弊场景的调查知识 | 有方法论高度且能落地、信号 + 切入点具体可操作 |

### 2.1 分类决策原则

**工作流类：**
- 不在工作流中写任何领域特定内容（不出现"窜货""终端客户"等词）
- 数据结构必须用 JSON Schema 精确定义，字段约束计算机可验证
- 工作流框架要能适应任意调查场景（渠道/采购/医疗/金融等）

**工具赋能类：**
- 每项工具/方法必须说明"可用时"和"不可用时"两种路径
- 不写具体工具名称，写能力类型（"数据库查询类 MCP"而非"investigation-db"）
- 为用户提供二次开发入口——自定义脚本的接入方式

**场景经验类：**
- 不是简单的"行业知识堆砌"——要有分类框架（高度），也要有具体信号和切入点（落地）
- 不侵入工作流——场景内容不修改 `meta.json` 的 schema、不修改阶段定义
- 场景特有的 SQL 脚本、模板放在 `scripts/`、`references/`、`templates/` 目录下，不写入 skill 主流程

### 2.2 一个文件只归属一个类别

混合类别是架构腐化的信号。如果一个文件同时包含工作流定义和场景知识，说明抽象层级不对——拆开。此类 PR 会被要求拆分后再合并。

### 2.3 Flat Skill 约束

Claude Code 通过 `plugin.json` 中的 `"skills": ["./skills/"]` 声明技能根目录，并对 `skills/*/SKILL.md` 进行**单层 glob 扫描**——只匹配深度为 1 的 SKILL.md，不支持嵌套层级。CodeBuddy 在 `skills` 字段缺省时自动发现 `skills/<name>/SKILL.md`；声明该字段会替换默认发现，因此不得在 `.codebuddy-plugin/plugin.json` 中声明 `skills`。

- ❌ `skills/fraud-classification/channel-fraud/SKILL.md` **不会被加载**
- ✅ `skills/fraud-channel/SKILL.md` **会被加载**
- 所有 skill 在 system prompt 中平级加载，无父子层级概念

### 2.4 目录结构不得新增顶层目录

所有内容必须放入已有目录结构：

```
investigation-ontology/
├── skills/              # 技能定义（新增技能放这里）
├── agents/              # 子代理定义
├── commands/            # 斜杠命令
├── rules/               # 调查准则与规范
├── hooks/               # 生命周期钩子
├── schemas/             # 案件数据模型 JSON Schema
├── docs/                # 跨技能索引文档
├── manifests/           # 安装模块化体系
├── mcp-configs/         # MCP 推荐配置
├── config-templates/    # 配置模板
└── project-templates/   # 项目脚手架模板
```

原则上不新增顶层目录。确有需要请在 PR 中说明理由。

***

## 三、文件规范

### 3.1 命名规范

- 全小写 + 连字符（如 `evidence-management/SKILL.md`）
- 专题舞弊 skill 命名：`fraud-<topic>`（如 `fraud-channel`）
- 舞弊分类 skill 命名：`fraud-<capability>`（如 `fraud-classification`）
- 命令文件：功能明确的动词式命名（如 `investigate.md`、`evidence.md`）
- 代理文件：角色式命名（如 `evidence-analyzer.md`）

### 3.2 Frontmatter 要求

| 文件类型 | 必需 frontmatter |
|---------|-----------------|
| Skill | `name`, `description`, `origin` |
| Command | `description` |
| Agent | `name`, `description` |

示例（Skill）：

```yaml
---
name: fraud-xxx
description: 一句话描述该技能的作用
origin: efio
---
```

### 3.3 跨文件引用

- 跨文件引用必须使用相对路径（相对于仓库根目录）
- 不要使用绝对路径或外部 URL 引用仓库内的文件
- 修改文件后需确认引用目标仍然存在、路径正确

### 3.4 场景技能目录结构模板

新增一个 `fraud-<domain>` 场景技能时，推荐按以下结构组织：

```
skills/fraud-<domain>/
├── SKILL.md                    # 技能定义（必需）
├── README.md                   # 用户使用手册（推荐）
├── references/                 # 通用参考资源
│   ├── policy_index.md         # 制度索引模板
│   ├── red_flags.md            # 预警信号清单
│   └── interview_questions.md  # 访谈问题库
├── scripts/                    # 普遍适用性脚本
│   ├── detect_xxx.sql          # 数据检测 SQL
│   └── analyze_xxx.py          # 数据分析脚本
├── templates/                  # 可视化交付物模板
│   ├── flow_diagram.md         # 业务/资金链路图模板
│   ├── report_diagram.md       # 报告插图模板
│   └── dashboard.md            # 数据看板原型
└── assets/                     # 静态资源（图片等）
```

`references/`、`scripts/`、`templates/` 目录下必须是**不绑定单一企业的通用内容**。企业特定的配置放入 `config-templates/` 和用户自己的 `team-profile.md`。

***

## 四、注册与同步

investigation-ontology 采用模块化安装体系，新增或修改技能时必须同步更新注册数据，否则安装器无法识别你的变更。

### 4.1 新增场景技能的 6 文件同步

新增一个 `fraud-<domain>` 场景技能时，必须依次修改以下 6 个文件：

| # | 文件 | 操作 |
|---|------|------|
| 1 | `skills/fraud-xxx/SKILL.md` | 创建技能文件，按 ACFE 分类编写 |
| 2 | `manifests/install-modules.json` | 添加模块条目（id、paths、dependencies） |
| 3 | `manifests/install-profiles.json` | 加入 `investigator` 和 `full` 两套 profile |
| 4 | `skills/fraud-classification/SKILL.md` | 在"专题舞弊类型索引"表追加一行 |
| 5 | `agents/investigation-planner.md` | 在 Related 技能段追加引用 |
| 6 | `agents/fraud-type-classifier.md` | 在 Cross-Reference 段和 Related 段追加引用 |

此外，`project-templates/default/INVESTIGATION-HANDBOOK.md` 中的技能表也应同步更新。

### 4.2 模块注册模板（install-modules.json）

```json
{
  "id": "fraud-xxx",
  "kind": "skills",
  "description": "一句话描述",
  "paths": ["skills/fraud-xxx"],
  "targets": ["claude", "claude-project"],
  "dependencies": ["investigation-foundation", "fraud-classification"],
  "defaultInstall": false,
  "cost": "medium",
  "stability": "alpha"
}
```

**字段说明：**
- `id`：全局唯一，与目录名一致
- `paths`：相对于仓库根，指向该模块的所有文件
- `dependencies`：运行时依赖的其他模块
- `defaultInstall`：初始 alpha 阶段设为 `false`，稳定后改为 `true`
- `cost`：对 AI 上下文的消耗，可选 `light`/`medium`/`heavy`
- `stability`：`alpha`（试用）→ `beta`（可用）→ `stable`（稳定）

### 4.3 数据模型变更的三处同步

修改 `schemas/` 下的 JSON Schema 时，必须同步更新：

1. **`schemas/<model>.schema.json`** — 字段约束、类型、必填
2. **`docs/case-data-model.md`** — 创建顺序、文件关系
3. **相关 skill 中的字段说明章节** — 确保与 schema 定义一致

如在售前版本已有用户使用数据，需考虑向后兼容。

### 4.4 配置项变更的两处同步

修改 `config-templates/` 下的配置模板时：

1. **`config-templates/<template>.md`** — 新增字段并标注 **影响技能：**
2. **对应 skill 的 SKILL.md** — 添加读取和应用该字段的逻辑

配置加载逻辑必须遵循 `config-templates/config-loader.md` 的标准流程。

***

## 五、内容编写规范

### 5.1 MCP 松耦合原则

技能不得假设任何一个 MCP 存在。所有 MCP 相关章节必须遵循 **类型化 + 条件式 + fallback** 格式：

```markdown
### [能力类型]类 MCP（如配置）

- **能力：** [一句话描述能力]
- **辅助场景：** [具体分析场景]
- **不可用时：** [替代方法，由模型直接完成]
```

MCP 是环境能力，不是技能依赖。技能写"需要什么分析"，不写"调用哪个工具"。

### 5.2 阶段描述格式（工作流类）

阶段定义使用 **输入/输出/门禁** 三元组格式：

```markdown
### [阶段名称]阶段

**目标**：[一句话]
**输入**：[消费哪些产物]
**输出**：[生成哪些产物]
**质量门禁**：[门禁条件列表]
```

### 5.3 决策树（可选）

对于涉及多层判断的 skill，可以选择引入 ASCII 树形分支图。决策树不是强制规范，但在以下场景强烈推荐使用：

- skill 中存在"如果 A 那么 B，如果 C 那么 D"的判断链
- AI 在不同案件中对同一问题给出不一致的处理
- 新用户需要引导才能理解调查中的常见分支场景

**规范：** 2-3 层深度，留一个兜底分支（"其他情况"、"无法判断"）。

### 5.4 中英文与语言风格

- 技能正文使用中文（面向国内调查员）
- 关键术语首次出现时附英文对照（如"资产侵占（Asset Misappropriation）"）
- 代码注释、schema 字段名、commit message 使用英文
- Agent 定义中的 Process 章节使用中文
- 避免模糊表述，优先使用具体的数据和条件

***

## 六、伦理与许可

### 6.1 法律与伦理底线

所有贡献必须遵守以下原则：

- **严禁**将本插件或其衍生内容用于非法监控、未经授权的数据采集、歧视性筛选或任何违反适用法律的活动
- **必须引用** `rules/investigation-ethics.md` 中的 AI 辅助调查道德准则
- 不得在技能或脚本中提供规避法律约束的方法或建议
- 涉及数据隐私、跨境调查、第三方取证等内容时，必须标注法律风险提示

### 6.2 License

本仓库采用 **Apache License 2.0**。贡献即表示你同意你的贡献在相同许可下发布。

### 6.3 免责声明

贡献者在 PR 描述中需确认已阅读并理解 `DISCLAIMER.md` 的内容。插件是辅助性工具，不是替代性决策系统——所有输出均需调查员独立审慎判断。

***

## 七、提交流程

### 7.1 分支策略

1. Fork 本仓库到你的 GitHub 账号
2. 从 `main` 创建功能分支：`git checkout -b feat/fraud-xxx`
3. 分支命名约定：
   - `feat/<topic>` — 新功能/新技能
   - `fix/<topic>` — 修复
   - `docs/<topic>` — 文档
   - `refactor/<topic>` — 重构
   - `schema/<topic>` — 数据模型变更
4. 在本地完成开发和验证
5. 推送到你的 fork：`git push origin feat/fraud-xxx`
6. 向本仓库的 `main` 分支发起 PR

### 7.2 PR 描述要求

PR 标题和描述必须包含以下信息：

```markdown
## 标题
[feat/fix/docs/...] 简短描述（如"新增 fraud-healthcare 场景技能"）

## 变更类别
- [ ] 架构分类：工作流 / 工具赋能 / 场景经验
- [ ] 是否影响模块注册（install-modules.json / install-profiles.json）
- [ ] 是否影响安装配置（install-profiles.json）
- [ ] 是否影响数据模型（schemas/）
- [ ] 是否影响配置模板（config-templates/）

## 修改文件清单
- [新增] skills/fraud-healthcare/SKILL.md
- [修改] manifests/install-modules.json（新增 fraud-healthcare 模块）
- [修改] skills/fraud-classification/SKILL.md（追加索引行）

## 验证清单
- [ ] 本地 `claude plugin validate` 通过
- [ ] 已在本地插件市场安装测试
- [ ] 已确认六文件同步（如适用）
- [ ] 已检查跨文件引用路径正确
- [ ] 已确认 MCP 无强依赖
```

### 7.3 本地验证

提交 PR 前必须完成以下验证：

```bash
# 1. 验证插件配置
claude plugin validate .claude-plugin/plugin.json

# 2. 从本地路径安装测试
claude plugin marketplace add /path/to/investigation-ontology
claude plugin install investigation-ontology@investigation-ontology --profile investigator

# 3. 检查新技能是否被正确发现
# （查看 Claude Code 启动日志，确认 skills/*/SKILL.md 被加载）
```

### 7.4 Commit 规范

- 使用清晰的 commit message，中文或英文皆可
- 推荐格式：`<type>(<scope>): <description>`
  - `feat(fraud-healthcare): 新增医疗行业舞弊调查技能`
  - `fix(evidence-management): 修复证据分类枚举缺失项`
  - `docs(README): 更新安装说明`
  - `schema(meta): 新增 phase_started_at 字段`
- 一个 commit 聚焦一个变更，不要混合不相关的修改
- Commit 末尾添加 `Co-Authored-By: Claude <noreply@anthropic.com>`（如使用了 AI 协助）

### 7.5 PR 审核

提交 PR 后，维护者会在以下维度进行审核：

| 维度 | 检查重点 |
|------|---------|
| 架构分类 | 内容是否归属正确类别 |
| 注册完整性 | manifests 是否同步更新 |
| 编写规范 | frontmatter、格式、引用路径 |
| 松耦合 | 是否对 MCP 有强依赖 |
| 跨文件同步 | 6 文件同步是否完成（场景技能） |
| 伦理合规 | 是否违反法律或道德准则 |
| 向后兼容 | 数据模型变更是否影响已有用户 |

审核通过后，维护者会 squash-merge 到 `main` 分支。
