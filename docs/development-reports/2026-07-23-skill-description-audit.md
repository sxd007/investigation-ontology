# Skill Description 审计报告

> 审计时间：2026-07-23
> 审计范围：cc-investigation-ontology 插件全部 23 个 skill 的 description，结合 7 个 agents、13 个 commands、3 个 hooks、install-profiles.json 和 install-modules.json 的联动关系

---

## 一、审计总览

### Skill 清单（23 个）

| # | Skill 名称 | 层级 | 对应 Agent | 对应 Command | 关联 Hook |
|---|-----------|------|-----------|-------------|-----------|
| 1 | investigation-foundation | Foundation | — | — | — |
| 2 | ontology | Foundation | — | — | validate-action, check-ref |
| 3 | cold-start | Foundation | — | /cold-start | session-start |
| 4 | mcp-integration | Foundation | — | /mcp-config | — |
| 5 | case-management | Process | case-manager | /investigate, /case | — |
| 6 | case-retrospective | Process | — | — | — |
| 7 | investigation-techniques | Process | — | — | — |
| 8 | fraud-classification | Domain | fraud-type-classifier | /fraud-type | — |
| 9 | fraud-channel | Domain | — | — | — |
| 10 | fraud-reimbursement | Domain | — | — | — |
| 11 | fraud-procurement | Domain | — | — | — |
| 12 | fraud-bid-rigging | Domain | — | — | — |
| 13 | fraud-ip | Domain | — | — | — |
| 14 | fraud-hr | Domain | — | — | — |
| 15 | fraud-fake-chop | Domain | — | — | — |
| 16 | fraud-conflicts-of-interest | Domain | — | — | — |
| 17 | evidence-management | Operations | evidence-analyzer | /evidence, /working-paper | check-ref |
| 18 | interview-analysis | Operations | interview-analyzer | /interview | — |
| 19 | data-analysis | Operations | data-analyzer | /analyze | — |
| 20 | writing-reporting | Operations | report-writer | /report | — |
| 21 | document-parsing | Operations | — | /parse | mcp-ocr-guard |
| 22 | order-execution-variance-analysis | Advanced | — | — | — |
| 23 | investigation-memory | Advanced | — | — | — |

---

## 二、发现的问题

### A. Typo / 格式错误（必须立即修复）

#### A1. order-execution-variance-analysis — 标题残留乱码

**文件：** `skills/order-execution-variance-analysis/SKILL.md` 第 11 行

**现状：**
```
## 配置前置检查weish
```

**应改为：**
```
## 配置前置检查
```

**原因：** "weish" 是残留的输入错误，出现在所有 skill 统一的配置前置检查标题中，破坏了一致性。

---

#### A2. fraud-hr — 引号未闭合

**文件：** `skills/fraud-hr/SKILL.md` 第 13 行

**现状：**
```
> **与费用报销舞弊的关系**：HR 舞弊中的某些子模式（如福利滥用、虚假报销）与 `fraud-reimbursement` 有方法论重叠，但切入角度不同——HR 舞弊关注的是"**劳动关系和薪酬结构**中的虚假，而非费用报销申报中的虚假。
```

**问题：** 开头有 `"` 但缺少闭合 `"`，应在句末"中的虚假"后补上 `"`。

**应改为：**
```
> **与费用报销舞弊的关系**：HR 舞弊中的某些子模式（如福利滥用、虚假报销）与 `fraud-reimbursement` 有方法论重叠，但切入角度不同——HR 舞弊关注的是"**劳动关系和薪酬结构**中的虚假"，而非费用报销申报中的虚假。
```

---

### B. 术语不一致（同一概念在不同位置用了不同表述）

#### B1. order-execution-variance-analysis — "项目" vs "订单" vs "order"

| 位置 | 用词 |
|------|------|
| Skill name (frontmatter) | `order-execution-variance-analysis` → 订单 |
| SKILL.md description | "**项目**执行差异分析" |
| SKILL.md H1 标题 | "# **项目**执行差异分析" |
| install-modules.json description | "**项目**执行差异分析" |
| profile.md 显示文案 | "**订单**执行差异分析" |
| profile.md Advanced Layer | "**订单**执行差异分析" |

**问题：** skill name 是 "order"（订单），但 description 和 H1 用的是"项目"。profile.md 又用了"订单"。三处不一致。

**建议：** 统一为"**订单执行差异分析**"，与 skill name 的 "order" 对齐。如果实际覆盖范围确实不限于订单而是更广义的"项目"，则应同步修改 skill name。

---

#### B2. fraud-procurement — "拆分订单" vs "化整为零"

| 位置 | 用词 |
|------|------|
| SKILL.md description | "拆分订单" |
| install-modules.json description | "化整为零" |

**建议：** 统一用词。"化整为零"是采购舞弊的标准术语，建议统一为"化整为零（拆分订单）"或择一使用。

---

#### B3. fraud-channel — "渠道销售" vs "ICT"

| 位置 | 用词 |
|------|------|
| SKILL.md description | "渠道销售特价订单场景" |
| install-modules.json description | "**ICT** 特价订单渠道场景" |

**问题：** SKILL.md 适用于所有渠道销售，但 install-modules.json 限定了 "ICT" 行业，过于狭窄。渠道舞弊方法论的适用范围不限于 ICT 行业。

**建议：** install-modules.json 统一为"渠道销售特价订单场景"，去掉 "ICT" 限定。

---

#### B4. investigation-memory — 描述完全错位

| 位置 | 描述 |
|------|------|
| SKILL.md | "调查场景记忆系统 — 案件过程中非结构化信息的底层归档，记录讨论分支、灵感、犹豫、思考过程" |
| profile.md 显示 | "**多案件记忆与关联分析**" |
| install-modules.json | "调查场景记忆系统 — 记录案件过程中的非结构化信息..." |

**问题：** profile.md 中的短描述"多案件记忆与关联分析"完全偏离了 skill 的实际定位。该 skill 是**单案件过程中的过程记录**，不是跨案件记忆或关联分析。这会导致用户在 profile 切换时对 skill 能力产生错误预期。

**建议：** profile.md 中改为"调查过程记忆与回溯"或"调查场景记忆系统"。

---

#### B5. investigation-techniques — 覆盖范围描述不一致

| 位置 | 描述 |
|------|------|
| SKILL.md | "财务数据分析、数字取证、外勤调查、监控技术、公开信息检索(OSINT)、通讯分析、关系图谱分析、资产追踪" |
| install-modules.json | "访谈技巧、数据分析、数字取证、文档审查、外勤调查、监控技术" |

**问题：**
- SKILL.md 列了 8 项，install-modules.json 列了 6 项，仅 3 项重叠
- install-modules.json 多了"访谈技巧"（应属于 interview-analysis）和"文档审查"
- SKILL.md 多了 OSINT、通讯分析、关系图谱、资产追踪

**建议：** 以 SKILL.md 为准，同步更新 install-modules.json。

---

#### B6. mcp-integration — "能力目录" vs "集成层"

| 位置 | 描述 |
|------|------|
| SKILL.md | "调查 MCP **能力目录** — 记录本插件生态中可用的 MCP 服务器类型及能力说明" |
| install-modules.json | "调查 MCP **工具集成层** — 技能与 MCP 服务器的连接桥梁" |

**问题：** SKILL.md 定位为"目录"（被动参考），install-modules.json 定位为"集成层"（主动桥梁）。两者语义不同。

**建议：** SKILL.md 的"能力目录"定位更准确（实际内容确实是 MCP 类型说明），install-modules.json 同步改为"调查 MCP 能力目录"。

---

#### B7. cold-start — install-modules.json 中的 "interview" 误导

| 位置 | 描述 |
|------|------|
| SKILL.md | "首次设置向导 — 引导调查员完成团队配置..." |
| SKILL.md 正文 | "「cold-start」指插件初始化启动，**与访谈（interview）无关**" |
| install-modules.json | "首次设置向导 — **Cold-start interview** 引导调查员完成团队配置..." |

**问题：** install-modules.json 使用了 "Cold-start interview" 一词，直接与 SKILL.md 正文中的明确声明矛盾。

**建议：** install-modules.json 中删除 "interview"，改为"首次设置向导 — 引导调查员完成团队配置..."。

---

### C. Description 触发力不足（Under-triggering 风险）

根据 skill-creator 的最佳实践，description 应具有"pushy"特质——不仅要说明 skill 做什么，还要明确何时应该使用。以下 skill 的 description 触发力不足：

#### C1. investigation-foundation — "认知基础"过于抽象

**现状：**
```
反舞弊调查哲学与方法论 — 调查思维框架、科学推理方法、认知偏差防控、假设驱动调查、证据金字塔、调查伦理与职业道德。所有调查技能的认知基础。
```

**问题：** "所有调查技能的认知基础"是元描述，不驱动触发。模型看到这句话不会因此更倾向于在新案件启动时加载这个 skill。

**建议改为：**
```
反舞弊调查哲学与方法论 — 调查思维框架、科学推理方法、认知偏差防控、假设驱动调查、证据金字塔、调查伦理。在任何新调查案件启动、设计调查方案、评估证据充分性或面对复杂不确定情境时，应首先使用本技能建立方法论框架。
```

---

#### C2. investigation-techniques — "全景"听起来像目录

**现状：**
```
调查工具与技术全景 — 财务数据分析、数字取证、外勤调查、监控技术、公开信息检索(OSINT)、通讯分析、关系图谱分析、资产追踪
```

**问题：** "全景"一词暗示这是一个参考目录而非可执行技能。没有触发条件指引。

**建议改为：**
```
调查工具与技术选择 — 当需要为调查方案选择具体调查手段、评估调查资源需求、或需要跨领域调查工具知识（数字取证、外勤调查、OSINT、通讯分析、关系图谱、资产追踪）时使用本技能。
```

---

#### C3. mcp-integration — "目录"定位过于被动

**现状：**
```
调查 MCP 能力目录 — 记录本插件生态中可用的 MCP 服务器类型及能力说明。MCP 与技能之间遵循松耦合原则：技能描述分析需求，模型自行编排 MCP 调用。
```

**问题：** 描述为"记录...说明"，完全被动。模型不会主动触发一个"目录"。

**建议改为：**
```
调查 MCP 能力参考 — 当需要了解本插件生态中可用的 MCP 服务器类型及其能力、或需要判断某项调查任务是否可由 MCP 辅助完成时使用本技能。MCP 与技能松耦合：技能描述分析需求，模型自行编排 MCP 调用。
```

---

#### C4. data-analysis — 开头过于方法论化

**现状：**
```
调查数据分析的方法论与分类框架。当需要对交易/财务/日志数据做异常检测...
```

**问题：** 以"方法论与分类框架"开头，听起来像学术参考而非可执行技能。虽然后面有触发条件，但开头的抽象定位可能降低触发优先级。

**建议改为：**
```
调查数据分析与审计技术 — 当需要对交易/财务/日志数据做异常检测、趋势分析、Benford分析、关联分析、重复检测，或需要为调查假设寻找数据支持、在数据未到手时主动规划数据需求时使用本技能。涵盖分析目标研判、策略选择、主动数据规划、执行能力边界和标准产出范式。
```

---

#### C5. investigation-memory — 缺少明确触发条件

**现状：**
```
调查场景记忆系统 — 案件过程中非结构化信息的底层归档，记录讨论分支、灵感、犹豫、思考过程，形成可查询的考察档案，支撑复盘与定向检索，但不干扰案件推进与方法论执行
```

**问题：** 描述了 skill 做什么，但没有说**什么时候**应该使用。模型不会主动判断"现在该记录一条 memory 了"。

**建议改为：**
```
调查场景记忆系统 — 在案件调查过程中，当出现探索过但未深入的路径、感觉异常但证据不足的疑虑、基于经验的直觉推测、或非正式观察到的行为信号时，使用本技能记录为可查询的考察档案。支撑复盘与定向检索，不干扰案件推进与方法论执行。
```

---

#### C6. case-retrospective — "仅在用户显式要求时执行"可能过度限制

**现状：**
```
案件回顾与复盘技术 — 完结案件的多维度复盘框架，聚焦调查员的能力、经验、逻辑、工作方法和工作流组织。独立于案件调查流程，仅在用户显式要求时执行，目标为提升调查员觉知而非产出案件结论
```

**问题：** "仅在用户显式要求时执行"是准确的设计意图，但作为 description 中的措辞，可能导致模型即使用户说了"复盘""回顾"等词也不触发（因为模型可能不确定这是否算"显式要求"）。

**建议改为：**
```
案件回顾与复盘技术 — 完结案件的多维度复盘框架，聚焦调查员的能力、经验、逻辑、工作方法。当用户提到"复盘""回顾总结""做得怎么样"等复盘意图时触发。独立于案件调查流程，目标为提升调查员觉知而非产出案件结论。
```

---

### D. Description 触发竞争/歧义

#### D1. investigation-techniques vs data-analysis — "数据分析"重叠

| Skill | 相关措辞 |
|-------|---------|
| investigation-techniques | "财务数据分析"（作为工具之一） |
| data-analysis | "交易/财务/日志数据做异常检测、趋势分析、Benford分析" |

**问题：** 当用户说"帮我分析这些财务数据"时，两个 skill 可能同时竞争。investigation-techniques 的"财务数据分析"是泛指，data-analysis 是具体方法论。

**建议：** investigation-techniques 的 description 中将"财务数据分析"改为"财务数据分析方法概览"或直接去掉，在正文中说明具体的分析方法论由 data-analysis skill 提供。

---

#### D2. investigation-techniques install-modules.json vs interview-analysis — "访谈技巧"重叠

**问题：** install-modules.json 的 investigation-techniques 描述包含"访谈技巧"，但这属于 interview-analysis 的领域。虽然 SKILL.md 中没有这个问题，但 install-modules.json 的描述用于安装时的能力展示，会误导用户。

**建议：** install-modules.json 中删除"访谈技巧"。

---

#### D3. evidence-management — 证据链与底稿管理的边界

**现状：**
```
证据链与调查底稿管理 — 证据识别与收集、链式保管(Custody Chain)、证据可采性评估、证据链可视化(推理链图/假设验证/治理状态)、底稿编制规范、底稿复核与归档、电子证据保全
```

**问题：** description 同时覆盖"证据链管理"和"底稿编制"，但项目中有独立的 `/working-paper` 命令。虽然 working-paper 命令的 Process 指向 evidence-management skill，但 description 的宽泛可能导致在纯底稿场景下过度加载证据链相关内容。

**建议：** 明确主次关系，改为"证据链管理为主，底稿编制为辅"的表述：
```
证据链管理 — 证据识别与收集、链式保管(Custody Chain)、证据可采性评估、证据链可视化(推理链图/假设验证/治理状态)、电子证据保全。兼覆底稿编制规范与复核标准。
```

---

### E. Profile 缺失（Critical — 影响功能可用性）

#### E1. document-parsing 不在任何 profile 中

**问题：** `install-profiles.json` 的 6 个 profile（minimal、investigator、auditor、analyst、interviewer、full）均**不包含** `document-parsing` 模块。但 `install-modules.json` 中 document-parsing 的 `defaultInstall: true`。

| Profile | 是否包含 document-parsing |
|---------|------------------------|
| minimal | ❌ |
| investigator | ❌ |
| auditor | ❌ |
| analyst | ❌ |
| interviewer | ❌ |
| full | ❌ |

**影响：** document-parsing 是 OCR 和文档结构化的核心 skill，有独立的 hook（mcp-ocr-guard）和命令（/parse）。即使 `defaultInstall: true`，不在任何 profile 中意味着 profile 切换时不会包含它。full profile 声称"全部 26 个技能激活"，但实际应该是 27 个（含 document-parsing）。

**建议：** 将 document-parsing 添加到至少 `investigator`、`auditor`、`analyst` 和 `full` profile 中。

---

#### E2. investigator profile 缺少 data-analysis

**问题：** `investigator` profile 不包含 `data-analysis` 模块。一线调查员在调查过程中经常需要分析交易数据、财务数据，缺少 data-analysis 会导致 investigator 在遇到数据分析需求时缺少方法论支撑。

**建议：** 将 data-analysis 添加到 investigator profile。

---

#### E3. investigator profile 缺少 document-parsing

**问题：** 调查员在办案过程中必然遇到需要解析的文档（合同、发票、报表等），缺少 document-parsing 意味着 investigator 无法有效处理原始文档。

**建议：** 将 document-parsing 添加到 investigator profile。

---

### F. Skill-Agent-Command 描述对齐分析

#### F1. 对齐良好的三元组（无需修改）

| Skill | Agent | Command | 对齐状态 |
|-------|-------|---------|---------|
| case-management | case-manager | /investigate, /case | ✅ Agent 是 Skill 的子集角色，命令指向 Skill |
| fraud-classification | fraud-type-classifier | /fraud-type | ✅ 三者描述一致 |
| interview-analysis | interview-analyzer | /interview | ✅ Agent 覆盖后置分析，Skill 覆盖全流程 |
| writing-reporting | report-writer | /report | ✅ 三者描述一致 |
| evidence-management | evidence-analyzer | /evidence, /working-paper | ✅ Agent 是 Skill 的子集角色 |

#### F2. data-analysis skill vs data-analyzer agent — 描述风格差异

| 维度 | Skill | Agent |
|------|-------|-------|
| 定位 | "方法论与分类框架" | "理解场景与输入数据，辅助确立分析目标" |
| 风格 | 学术化、抽象 | 行动导向、具体 |

**问题：** Skill 的 description 比 Agent 的更抽象，这不太寻常——通常 Skill description 应该是触发入口，比 Agent 更行动导向。当前 Agent description 反而更适合作为 Skill description。

**建议：** 参考 Agent description 的行动导向风格改写 Skill description（见 C4 建议）。

---

#### F3. 缺少对应 Agent 的 Skill

以下 skill 没有对应的专属 agent，这是设计选择（非所有 skill 都需要 agent），但值得确认是否有意为之：

| Skill | 有无 Agent | 是否需要 |
|-------|-----------|---------|
| document-parsing | ❌ | 不需要 — skill 自身已足够明确 |
| investigation-foundation | ❌ | 不需要 — 方法论参考型 |
| investigation-techniques | ❌ | 不需要 — 工具选择参考型 |
| investigation-memory | ❌ | 不需要 — 后台记录型 |
| case-retrospective | ❌ | 不需要 — 独立复盘型 |
| mcp-integration | ❌ | 不需要 — 参考目录型 |
| order-execution-variance-analysis | ❌ | **可选** — 如果差异分析需要反复迭代，可考虑增加 agent |
| 所有 fraud-* | ❌ | 不需要 — fraud-type-classifier 统一路由 |

---

### G. Description 格式不一致

#### G1. YAML description 值类型不一致

| 格式 | 数量 | 使用者 |
|------|------|--------|
| 纯字符串 | 21 | 大多数 skill |
| `>` 折叠标量 | 2 | ontology, document-parsing |

**问题：** 两种格式在功能上等价，但不一致增加了解析复杂度和维护成本。

**建议：** 统一为纯字符串格式（单行）。如果 description 较长，可使用 YAML 的双引号字符串。

---

#### G2. Description 长度差异大

| 类别 | 字数范围 | 示例 |
|------|---------|------|
| 过短（<40字） | 30-40 | investigation-techniques: "调查工具与技术全景 — 财务数据分析..." |
| 适中（40-80字） | 40-80 | 大多数 skill |
| 过长（>80字） | 80-120 | investigation-memory, document-parsing, data-analysis |

**建议：** 目标控制在 50-80 字，包含"做什么 + 何时用"两个要素。

---

### H. Hook-Skill 联动验证

| Hook | 关联 Skill | 联动状态 |
|------|-----------|---------|
| session-start | cold-start | ✅ Hook 检查配置状态，提示运行 cold-start |
| pre-write-naming | — | ✅ 通用命名规范检查，不绑定特定 skill |
| validate-action | ontology | ✅ Hook 强制本体 Action 前置条件，与 ontology skill 的 Action 治理对齐 |
| mcp-ocr-guard | document-parsing | ✅ Hook 拦截直接调用 paddleOCR-mcp，引导使用 document-parsing skill |
| check-ref | ontology, evidence-management | ✅ Hook 检查 ontology_ref 引用完整性 |

**结论：** Hook 与 Skill 的联动关系良好，无发现问题。

---

## 三、修改建议优先级

### P0 — 立即修复（影响功能正确性）

| # | 问题 | 文件 | 修改内容 |
|---|------|------|---------|
| 1 | A1 | order-execution-variance-analysis/SKILL.md | 删除标题中的 "weish" |
| 2 | A2 | fraud-hr/SKILL.md | 闭合引号 |
| 3 | E1 | install-profiles.json | 将 document-parsing 添加到 investigator/auditor/analyst/full profile |

### P1 — 尽快修复（影响触发准确性）

| # | 问题 | 文件 | 修改内容 |
|---|------|------|---------|
| 4 | B1 | order-execution-variance-analysis/SKILL.md | 统一"项目"/"订单"术语 |
| 5 | B4 | commands/profile.md | 修正 investigation-memory 的短描述 |
| 6 | B7 | install-modules.json | 删除 cold-start 中的 "interview" |
| 7 | C1 | investigation-foundation/SKILL.md | 增加触发条件 |
| 8 | C2 | investigation-techniques/SKILL.md | 改为行动导向描述 |
| 9 | C5 | investigation-memory/SKILL.md | 增加触发条件 |
| 10 | E2 | install-profiles.json | investigator profile 添加 data-analysis |
| 11 | E3 | install-profiles.json | investigator profile 添加 document-parsing |

### P2 — 计划修复（影响一致性和体验）

| # | 问题 | 文件 | 修改内容 |
|---|------|------|---------|
| 12 | B2 | install-modules.json 或 SKILL.md | 统一 fraud-procurement 术语 |
| 13 | B3 | install-modules.json | fraud-channel 去掉 "ICT" 限定 |
| 14 | B5 | install-modules.json | 同步 investigation-techniques 覆盖范围 |
| 15 | B6 | install-modules.json | 统一 mcp-integration 定位 |
| 16 | C3 | mcp-integration/SKILL.md | 增加触发条件 |
| 17 | C4 | data-analysis/SKILL.md | 改为行动导向开头 |
| 18 | C6 | case-retrospective/SKILL.md | 明确触发词 |
| 19 | D1 | investigation-techniques/SKILL.md | 消除与 data-analysis 的竞争 |
| 20 | D2 | install-modules.json | 删除 investigation-techniques 的"访谈技巧" |
| 21 | D3 | evidence-management/SKILL.md | 明确主次关系 |
| 22 | G1 | ontology/SKILL.md, document-parsing/SKILL.md | 统一 YAML 格式 |

---

## 四、Skill-Agent-Command 联动关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户输入 / 自然语言                             │
└──────────────┬──────────────────────────────────┬───────────────────┘
               │                                  │
    ┌──────────▼──────────┐           ┌──────────▼──────────┐
    │   Commands (入口)    │           │  Skill Description  │
    │  /investigate        │           │  (触发匹配)          │
    │  /case               │           │                     │
    │  /evidence           │           └──────────┬──────────┘
    │  /interview          │                      │
    │  /analyze            │           ┌──────────▼──────────┐
    │  /report             │           │   Skills (方法论)    │
    │  /fraud-type         │──────────▶│  case-management    │
    │  /parse              │           │  evidence-management │
    │  /working-paper      │           │  data-analysis      │
    │  /cold-start         │           │  ...23 skills       │
    │  /profile            │           └──────────┬──────────┘
    │  /mcp-config         │                      │
    └──────────────────────┘           ┌──────────▼──────────┐
                                       │  Agents (执行体)     │
          ┌────────────────────────────│  case-manager       │
          │                            │  evidence-analyzer  │
          │   Hooks (守护)             │  data-analyzer      │
          │   session-start ──────────▶│  interview-analyzer │
          │   validate-action ────────▶│  fraud-type-classifier│
          │   mcp-ocr-guard ──────────▶│  investigation-planner│
          │   check-ref ──────────────▶│  report-writer      │
          │                            └─────────────────────┘
          └─── 全部指向 Skills 层执行 ──┘
```

**联动发现：**
1. Hooks 与 Skills 的联动完整，3 个 PreToolUse + 1 个 PostToolUse + 1 个 SessionStart 均有明确的 skill 指向
2. Commands 与 Skills 的映射清晰，每个命令都在 Process 节明确引用了对应 skill
3. Agents 与 Skills 的映射通过 description 对齐，5 个有专属 agent 的 skill 对齐良好
4. **缺口：** document-parsing 有 hook 和 command 但不在任何 profile 中（E1）

---

## 五、总结

本次审计共发现 **22 个问题**，按优先级分布：

- **P0（立即修复）：3 个** — typo、引号闭合、profile 缺失
- **P1（尽快修复）：8 个** — 术语不一致、触发力不足、profile 缺失
- **P2（计划修复）：11 个** — 一致性优化、触发竞争消除

**最关键的三个问题：**
1. `document-parsing` 不在任何 profile 中，导致即使安装了也无法通过 profile 激活
2. `order-execution-variance-analysis` 有 typo 残留（"weish"）
3. 多个 skill 的 description 触发力不足，可能导致模型在实际使用中不主动加载这些 skill

**整体评价：** Skill-Agent-Command-Hook 四层联动架构设计清晰，大部分 skill 的 description 质量良好。主要问题集中在术语一致性、profile 完整性和部分 skill 的触发条件缺失上。修复这些问题可以显著提升插件的自动触发准确率和用户体验。
