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

## 组织信息

**影响技能：** case-management（案件编号前缀）、report-writer（报告抬头）

| 字段 | 影响说明 |
|------|---------|
| 组织名称 | 报告抬头中的组织名 |
| 行业 | 影响案件风险评估的行业上下文 |
| 主要法域 | 影响证据合规要求（各地证据法差异） |
| 监管机构 | 如有，案件报告会增加监管报送提醒 |

**Organization Name:** [PLACEHOLDER]
**Industry:** [PLACEHOLDER]
**Primary Jurisdiction:** [PLACEHOLDER]
**Regulatory Bodies:** [PLACEHOLDER]

## 调查团队

**影响技能：** case-management（审批路由）、investigation-planner（资源分配）

| 字段 | 影响说明 |
|------|---------|
| 团队规模 | 影响案件分工的合理性判断 |
| 负责人 | 升级和审批的默认目标 |
| 汇报线 | 报告的分发和审批链 |

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
| 普通案件周期上限 | [PLACEHOLDER e.g. 30天] | 到达上限时 case-management 触发阶段预警 |
| 复杂案件周期上限 | [PLACEHOLDER e.g. 60天] | 同上 |

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

*编辑此文件即可更新配置。改一处，所有技能读取新值。*
