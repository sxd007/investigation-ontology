<!--
⚠️ 模板文件 — 插件发版携带，每次插件更新时覆盖。

实际用户配置写入路径（升级不受影响）：
  {配置路径}/team-profile.md

此文件仅供 cold-start 作为模板读取和填充。任何 skill 不得从此路径读取配置。
每次发版更新此模板时，需要保留所有 [PLACEHOLDER] 标记，新增字段遵循下方标注格式。
-->

# 调查团队档案（Team Profile）

*由 /efio:cold-start 在首次设置时生成并填充。如果看到 [PLACEHOLDER] 标记，请运行该命令完成设置。*

*填充后直接编辑此文件（用户配置路径），改动一处即对所有技能生效。*

---

## 快速预设（Quick Presets）

*cold-start Phase 2 开始前首先读取此节，展示预设清单供选择。选定后，对应字段自动填入默认值；所有字段仍可单独覆盖。如选 `custom`，cold-start 逐字段引导输入。*

**Selected Preset:** [PLACEHOLDER: cn-compliance / hk-forensic / sg-internal-audit / apac-analyst / hr-investigation / custom]

| 预设代号 | 典型场景 | 法域 | 团队规模 | 画像 | 汇报线 | 审批强度 | 案件周期（普通/复杂） |
|---------|---------|------|---------|------|--------|---------|---------------------|
| `cn-compliance` | 中国内地反舞弊/合规团队 | CN | 4–8 人 | investigator | 法务/合规总监 → CEO | 标准 | 30 / 60 天 |
| `hk-forensic` | 香港反舞弊/法证专项调查 | HK | 2–5 人 | investigator | 审计委员会 | 严格 | 30 / 60 天 |
| `sg-internal-audit` | 新加坡内审部门 | SG | 4–10 人 | auditor | 审计委员会 | 标准 | 45 / 90 天 |
| `apac-analyst` | 亚太数据/反欺诈分析团队 | APAC-Multi | 3–6 人 | analyst | 合规/风控总监 | 轻量 | 30 / 45 天 |
| `hr-investigation` | 员工行为/劳动纪律调查 | CN/HK | 2–4 人 | interviewer | CHRO/HRBP | 轻量 | 14 / 30 天 |
| `custom` | 完全自定义 | — | — | — | — | — | — |

> **预设字段映射：** 选定预设后，cold-start 按下表自动填充各节占位符，并仅对"★ 必须确认"字段弹出确认问题，其余静默写入。
>
> | 字段 | cn-compliance | hk-forensic | sg-internal-audit | apac-analyst | hr-investigation |
> |------|-------------|-------------|------------------|-------------|-----------------|
> | Primary Jurisdiction | CN | HK | SG | APAC-Multi | CN/HK |
> | Team Size | 4–8 | 2–5 | 4–10 | 3–6 | 2–4 |
> | Selected Profile | investigator | investigator | auditor | analyst | interviewer |
> | 普通案件周期 | 30 天 | 30 天 | 45 天 | 30 天 | 14 天 |
> | 复杂案件周期 | 60 天 | 60 天 | 90 天 | 45 天 | 30 天 |
> | 立案审批 | YES ★ | YES ★ | YES ★ | NO | YES ★ |
> | 数据提取审批 | YES | YES | YES | NO | NO |
> | 访谈审批 | NO | YES | NO | NO | NO |
> | 报告发布审批 | YES | YES | YES | YES | YES |
> | 通话后强制 call_memo | YES | YES | YES | NO | YES |
> | 外部证据调取审批 | YES | YES | YES | NO | YES |

---

## 组织信息

**影响技能：** case-management（案件编号前缀）、report-writer（报告抬头）

| 字段 | 影响说明 |
|------|---------|
| 组织名称 | 报告抬头中的组织名 |
| 行业 | 影响案件风险评估的行业上下文（金融/制造/零售等不同舞弊模式权重不同） |
| 主要法域 | **核心配置项** — 影响证据可采性判断、访谈录音合规要求、监管报送触发条件；详见文末"配置影响详解" |
| 监管机构 | 如有（如 SFC/HKMA/CBIRC），案件报告会增加监管报送提醒及截止日期倒计时 |

**Organization Name:** [PLACEHOLDER]
**Industry:** [PLACEHOLDER]
**Primary Jurisdiction:** [PLACEHOLDER]
**Regulatory Bodies:** [PLACEHOLDER]

## 调查团队

**影响技能：** case-management（审批路由）、investigation-planner（资源分配）

| 字段 | 影响说明 |
|------|---------|
| 团队规模 | 影响案件分工合理性判断：1–3人→单线顺序执行；4–8人→有限并行；9+人→多工作流并行，investigation-planner 自动启用任务分配模式 |
| 负责人 | 升级和审批的默认收件人；汇报线的第一级节点 |
| 汇报线 | 报告分发路径和审批链；汇报至审计委员会时 report-writer 自动套用董事会级报告格式，并在封面标注保密等级 |

**Team Name:** [PLACEHOLDER]
**Team Size:** [PLACEHOLDER]
**Team Lead:** [PLACEHOLDER]
**Reporting Line:** [PLACEHOLDER]

## 角色画像（Skill Profile）

**影响技能：** 全部（决定办案时默认聚焦/优先提示哪些技能集）

*由 cold-start 读取 `manifests/install-profiles.json` 后引导选择。画像决定本团队默认聚焦的技能集，避免无关技能干扰；不阻止按需临时加载任何其他技能。可随时改为其他画像或 `full`。*

| 字段 | 影响说明 |
|------|---------|
| 选定画像 | investigator/auditor/analyst/interviewer/full 之一，决定优先加载的技能集 |
| 激活技能集 | 该画像包含的技能模块列表（来源：install-profiles.json） |

**Selected Profile:** [PLACEHOLDER: investigator/auditor/analyst/interviewer/full]
**Active Skills:** [PLACEHOLDER]

## 调查通信纪律

**影响技能：** interview-analysis（举报人联系约束）、investigation-planner（计划中的时间框定）

*本节定义调查过程中与举报人/证人/当事人的交互规则。各 skill 在执行通信相关操作前读取此节，按约束执行。*

### 举报人联系约束

| 参数 | 默认值 | 影响说明 |
|------|--------|---------|
| 同一事项连续通话上限 | [PLACEHOLDER] | 超过此次数后必须内部复盘才能再次联系 |
| 举报人背景核查要求在通话前完成 | [PLACEHOLDER: YES/NO] | YES 时 interview-analysis 会阻止未完成核查的通话 |
| 通话后强制输出 call_memo | [PLACEHOLDER: YES/NO] | YES 时每次通话后必须输出备忘录 |
| 外部证据调取审批要求 | [PLACEHOLDER: YES/NO] | YES 时调取外部证据前必须走审批 |

### 案件周期约束

| 参数 | 默认值 | 影响说明 |
|------|--------|---------|
| 普通案件周期上限 | [PLACEHOLDER e.g. 30天] | 到达上限时 case-management 触发阶段预警；低于 50% 剩余时间时 investigation-planner 自动压缩取证优先级排序 |
| 复杂案件周期上限 | [PLACEHOLDER e.g. 60天] | 同上；超期后自动生成"周期延长说明"模板，需审批人签字才可继续推进 |

## 审批流程

**影响技能：** case-management（门禁权限判断）、report-writer（发布前审批）

| 行动 | 是否需要审批 | 审批人 |
|------|------------|--------|
| 立案（Case Opening） | [PLACEHOLDER: YES/NO] | [PLACEHOLDER] |
| 数据提取（Data Extraction） | [PLACEHOLDER: YES/NO] | [PLACEHOLDER] |
| 访谈（Interview） | [PLACEHOLDER: YES/NO] | [PLACEHOLDER] |
| 报告发布（Report Release） | [PLACEHOLDER: YES/NO] | [PLACEHOLDER] |

## 报告偏好

**影响技能：** writing-reporting（默认格式）、working-paper（编号规则）

| 字段 | 影响说明 |
|------|---------|
| 默认报告格式 | writing-reporting 选择模板结构 |
| 默认语言 | 输出语言 |
| 底稿编号格式 | working-paper command 生成编号 |
| 案件编号格式 | case-management 生成案件 ID |

**Default Report Format:** [PLACEHOLDER]
**Default Language:** [PLACEHOLDER]
**Working Paper Index Format:** [PLACEHOLDER]
**Case Number Format:** [PLACEHOLDER]

## 集成状态（自动检测）

**影响技能：** mcp-integration（能力映射报告）

*此表由 cold-start 的 --check-integrations 阶段自动填充，用户无需手工填写。*

| 集成项 | 状态 | 不可用时降级方式 |
|--------|------|-----------------|
| 文件系统操作 | [PLACEHOLDER] | 用户手动指定路径 |
| 搜索工具 | [PLACEHOLDER] | 模型直接推理 |
| 数据分析（SQL/脚本） | [PLACEHOLDER] | 手动分析 |
| 企业信息查询 | [PLACEHOLDER] | 浏览器搜索 |

*更新：运行 `/efio:cold-start --check-integrations`*

---

## 配置影响详解（参考）

*本节说明各配置项对具体工作流的行为影响，供配置时参考。此节为只读文档，cold-start 不解析此节内容。*

### 1. 主要法域（Primary Jurisdiction）

法域是影响面最广的单一配置项，决定了从取证标准到报告义务的全链路行为。

**CN（中国内地）**

| 影响点 | 具体行为 |
|--------|---------|
| evidence-management | 提示《数据安全法》/《网络安全法》数据出境限制；电子证据须经原件核验，链式保管说明更严格 |
| interview-analysis | 提示录音须遵守《个人信息保护法》；对党员/国企干部访谈，提示纪检程序优先原则 |
| report-writer | 国企案件自动添加"是否需向纪委/监委报送"提醒；涉及刑事线索时标注强制移送义务 |
| investigation-planner | 证据跨境移转计划中增加合规审查步骤；证人协议模板切换为中文版劳动法口径 |

**HK（香港）**

| 影响点 | 具体行为 |
|--------|---------|
| evidence-management | 证据标准参照英国普通法；PDPO 合规检查；商业文件调取参考《公司条例》授权范围 |
| interview-analysis | 提示 POBO（防贿条例）下的自愿声明规则；自愿性确认步骤嵌入访谈前检查表 |
| report-writer | 汇报至审计委员会时套用香港上市规则披露格式；可选 SFC/HKMA 报送附录 |
| investigation-planner | 引入 LPP（法律专业特权）评估步骤；外聘律师协调节点自动插入关键阶段 |

**SG（新加坡）**

| 影响点 | 具体行为 |
|--------|---------|
| evidence-management | PDPA 合规提示；《证据法》电子记录可采性检查 |
| interview-analysis | 提示 CPIB 优先管辖权；如涉及公务员需评估是否移送 |
| report-writer | 上市公司案件添加 SGX 披露义务提醒 |

**APAC-Multi（跨境）**

| 影响点 | 具体行为 |
|--------|---------|
| 全部技能 | 每步操作前提示"请确认当前证据/访谈所在地法域"；数据流转自动附加多法域合规矩阵 |
| investigation-planner | 计划中自动插入跨境协调节点和法律意见审查里程碑 |

---

### 2. 团队规模 × 汇报线

这两项联合决定调查组织模式和审批路由。

**团队规模**

| 规模 | investigation-planner 行为 | case-management 行为 |
|------|--------------------------|---------------------|
| 1–3 人（Solo/小型） | 单线顺序任务；不建议并行 FIELDWORK；每阶段明确 owner = 单人 | 审批升级默认推送团队负责人本人，提示"需外部支持时建议借调" |
| 4–8 人（中型） | 最多 2 条并行工作线；任务分配模板出现"推荐分工"建议 | 审批路由可区分"立案审批人"/"执行成员"两级 |
| 9+ 人（大型） | 多工作流并行；自动生成项目式分工矩阵；支持专项负责人（evidence lead / interview lead） | 三级审批链激活；案件仪表板自动纳入进度汇总视图 |

**汇报线**

| 汇报线 | report-writer 行为 | case-management 行为 |
|--------|-------------------|---------------------|
| 审计委员会 | 报告格式切换为董事会简报级（执行摘要优先，技术细节附录化）；保密等级标注 RESTRICTED | 阶段升级通知推送至审委联系人；启用独立性声明页 |
| 法务/GC | 报告自动标注"法律专业特权保护，禁止外部披露"；可添加律师函头 | 数据提取审批默认流转至法务；证据清单附加法律持有链 |
| HR/CHRO | 报告语言切换为"劳动纪律"口径，弱化刑事用语；涉及纪律处分结论前添加劳动法提醒 | 案件编号前缀加 `HR-`；访谈计划默认通知 HR BP |
| 合规/风控 | 报告增加"合规漏洞归因"章节模板 | 案件关闭前自动生成整改建议清单供合规跟踪 |

---

### 3. 调查周期约束

周期配置是案件执行节奏的核心参数，影响所有时间敏感型工作流。

```
┌─────────────────────────────────────────────────────────┐
│  案件周期时钟（case-management 内部计时）                    │
│                                                         │
│  立案  ──► INIT ──► PRE_INVESTIGATION ──► FIELDWORK      │
│                                          ↑              │
│                              周期预警触发点（50% 用完）    │
│                                                         │
│  FIELDWORK ──► REVIEWING ──► CLOSED                     │
│                  ↑                                      │
│             周期告警（80% 用完）                           │
│                                                         │
│  超期未关闭 → 自动生成延期申请模板 → 推送审批人              │
└─────────────────────────────────────────────────────────┘
```

| 场景 | 周期设置建议 | investigation-planner 调整 |
|------|------------|--------------------------|
| 快速核实类（举报内容简单） | 14–21 天 | 跳过深度数据分析，直接进入证人访谈 |
| 标准单点舞弊 | 30 天 | 标准五阶段，取证与访谈并行 |
| 复杂多人/多法域 | 60–90 天 | 分批取证，多轮访谈，允许中途假设修正 |
| 系统性舞弊/回溯审计 | 90 天+ | 启用回溯审计模式（case-retrospective 技能） |

---

### 4. 审批链路

审批配置决定每个"门禁动作"是否需要外部授权，直接影响办案速度与独立性。

**审批强度 × 行动矩阵**

| 行动 | 轻量（Light） | 标准（Standard） | 严格（Strict） |
|------|-------------|-----------------|--------------|
| 立案 | 自动立案 | 团队负责人审批 | 团队负责人 + 汇报线上级审批 |
| 数据提取 | 自主执行 | 团队负责人审批 | 团队负责人 + 法务审批 |
| 外部证据调取 | 自主执行 | 法务审批 | 法务 + 汇报线上级审批 |
| 访谈安排 | 自主执行 | 自主执行 | 团队负责人审批 |
| 报告发布 | 负责人签字 | 双签（负责人 + 汇报线） | 多级签批（负责人→汇报线→审委/CEO） |

**案件管理行为**

- **审批挂起**：case-management 在等待审批时将案件标记为 `PENDING_APPROVAL`，阻止执行审批项下的子操作；
- **审批超时**：超过 48h 未响应时触发升级提醒（升级至下一级联系人）；
- **审批记录**：所有审批决定自动写入 `CHANGELOG.json`，附审批人、时间戳、意见摘要。

---

*编辑此文件即可更新配置。改一处，所有技能读取新值。*
