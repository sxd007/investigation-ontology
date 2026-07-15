---
name: case-management
description: 调查流程与案件管理 — 案件生命周期管理、调查计划编制、质量管控(质量控制)、团队协作、时间线管理、风险管理、成本管理、结案评估
origin: efio
---

# 调查流程与案件管理

好的管理出好的调查 — 流程管控是调查质量的保障。

## 配置前置检查

在执行本技能的业务操作前，按以下流程检查用户配置：

```
检查 {配置路径}/team-profile.md
├── 不存在 / 含 [PLACEHOLDER] / 含 PAUSED 标记
│   └── 自动进入 /efio:cold-start 配置向导，完成后继续当前操作
└── 配置就绪 → 继续
```

详细规则参见 `config-templates/config-loader.md`。

此技能读取的配置项：

- team-profile：审批流程（案件各行动的审批人）、案件周期约束、案件编号格式（已定义：`INV-YYYYMM-NN`，按月归零）

## When to Activate

- 启动新案件时编制调查计划
- 跟踪多个案件的进度和状态
- 评估调查质量进行内部复核
- 管理调查资源（人员/时间/预算）
- 进行结案审查
- 设计调查流程和标准操作程序(SOP)

## 案件生命周期

```
报案/线索接收
    │
    ▼
初步评估 (Triage)
    │  ┌──────────────┐
    │  │ 是否受理？     │─── 不受理 → 记录/转介/存档
    └──│ 是否有管辖权？ │
       │ 是否需要立即行动？│
       └──────┬───────┘
              ▼ 受理
        立案/案件登记
              │
              ▼
        调查策划
              │
              ▼
        调查执行 (迭代循环)
              │
              ▼
        分析/评估发现
              │
              ▼
        结论与报告
              │
              ▼
        补救/追偿/处理
              │
              ▼
        结案审查
              │
              ▼
        归档/移交
```

## 案件登记信息

```
案件编号：INV-202606-01
案件名称：张三涉嫌采购舞弊案
案件来源：举报热线匿名举报（2024-01-10）
受理日期：2024-01-11
承办人/团队：王五 / 调查一组
案件性质：内部调查（涉嫌 采购舞弊 + 利益冲突）
涉及主体：张三（采购经理）、XX供应商
预估风险等级：高风险（涉及金额预估 200-500万）
案件状态：调查中 → 待结案 → 已结案
```

## 调查计划编制框架

### 调查计划应包含

1. **调查目标** — 要回答的核心问题（3-5个）
2. **调查范围** — 时间/业务/人员/地域范围
3. **假设清单** — 核心竞争假设
4. **证据需求** — 需要收集哪些证据、从何获取
5. **调查手段** — 具体采用的方法（访谈/数据分析/取证等）
6. **里程碑与时间表** — 关键节点
7. **资源需求** — 人员/工具/外部服务
8. **风险评估** — 可能的风险及应对策略
9. **沟通计划** — 谁需要知道什么、何时知道
10. **质量管控** — 复核节点和质量标准

## 质量管理 (Quality Control)

### 调查质量维度

| 维度      | 标准          | 检查方式     |
| ------- | ----------- | -------- |
| **及时性** | 在计划时间内完成里程碑 | 进度跟踪表    |
| **全面性** | 覆盖所有调查问题和假设 | 调查问题清单复核 |
| **准确性** | 事实和证据准确无误   | 独立事实核查   |
| **客观性** | 无偏见、无预设立场   | 方法论检查    |
| **合规性** | 程序符合政策和法律法规 | 程序合规审查   |
| **充分性** | 证据足以支持结论    | 证据充分性评估  |
| **保密性** | 信息访问受到控制    | 信息访问审计   |

### 质量复核检查清单

- [ ] 调查计划是否经过审批？
- [ ] 所有调查行动是否在授权范围内？
- [ ] 证据收集程序是否合规？
- [ ] 底稿是否经过独立复核？
- [ ] 所有假设是否得到充分验证？
- [ ] 负面/矛盾证据是否被记录和考虑？
- [ ] 是否避免了常见认知偏差？
- [ ] 报告是否经过事实核查？
- [ ] 建议是否具体可执行？

## 风险管理

### 调查中的典型风险

| 风险类别     | 具体风险           | 缓释措施        |
| -------- | -------------- | ----------- |
| **证据风险** | 证据灭失/篡改/不可用    | 及时保全、多源备份   |
| **法律风险** | 取证违法/侵犯隐私/程序违规 | 事前法律咨询、合规审查 |
| **安全风险** | 调查对象报复/证据泄露    | 安全计划、信息隔离   |
| **声誉风险** | 不当披露/误判        | 保密协议、质量控制   |
| **资源风险** | 人员不足/预算超支      | 资源规划、定期评估   |
| **时间风险** | 调查时限压力         | 优先级管理、阶段性汇报 |

### 升级机制

```
正常 → 黄色预警 (风险升高) → 橙色预警 (需要协助) → 红色预警 (紧急)
```

## 时间线管理

### 时间线构建方法

1. **收集所有时间戳** — 文档日期、系统日志、通讯记录、财务凭证
2. **建立事件主干** — 按时间顺序排列关键事件
3. **填充细节层** — 补充次要事件、通讯记录、人员活动
4. **标识异常** — 时间矛盾、不合理间隙、异常顺序
5. **可视化呈现** — 甘特图/时间线图

### 常用工具方法

- **电子表格** — 最简单的案件跟踪工具
- **甘特图** — 调查进度与里程碑
- **看板/Kanban** — 任务管理（待办/进行中/待复核/已完成）

***

## 阶段管理框架

调查按四个标准阶段推进。每个阶段有明确的输入、输出和质量门禁。

### INIT 阶段 — 线索接收与立案决策

**目标**：判断线索是否值得进入正式调查，还是在 INIT 阶段终止。

**适用条件**：收到举报线索 / 系统告警 / 案件扩展请求。

**输入**：

- 举报内容或异常信号（来源、时间、精准重述）
- 关键实体信息（人员、公司、项目、设备编号等）

**输出**：

- `init_intelligence_summary.md` — 情报摘要（结构化信息提取 + 案件性质判断 + 初步调查计划）
- `meta.json` — 填写必填字段（case\_id、status、trigger\_type、created\_at）
- `checklist.yaml` — 创建，全部初始化为 false
- `evidence_registry.json` — 创建基础结构（metadata、chain\_nodes、entities、evidence\_items 登记举报线索、生成初始 hypotheses）
- `nodes/` — 创建目录，生成初始节点（EV-001 举报线索、初始 ENT 和 HYP 节点）

**质量门禁**（全部满足后推进至 PRE\_INVESTIGATION）：

| 门禁                            | 含义                        |
| ----------------------------- | ------------------------- |
| `case_opened`                 | Go/No-Go 决策已记录            |
| `objectives_defined`          | 通用目标已匹配 + 特定目标已确认         |
| `key_entities_verified`       | 关键实体已通过快查或手动验证            |
| `information_gaps_documented` | 信息缺口已标注分类（待调取/举报人无/原因未说明） |
| `case_nature_assessed`        | 案件性质已判断（舞弊调查/业务问题/其他）     |
| `investigation_plan_drafted`  | 初步调查计划已形成                 |

**关键设计**：

- INIT 阶段的结论上限为 `suspected`（除非已有独立系统核实支撑）
- `[举报人称]` 的内容不得在 INIT 阶段直接引用为已确立事实
- 所有信息缺口必须标注分类，不得留有 `[原因未说明]`
- `evidence_registry.json` 在 INIT 阶段创建基础结构（初始化 metadata、chain\_nodes、提取 entities、登记举报线索为首条证据、生成初始 hypotheses），但 INIT 阶段的证据置信度上限为 `suspected`
- `nodes/` 目录与 evidence\_registry.json 同时创建。INIT 阶段至少创建 EV-001（举报线索节点）、ENT-001（举报人实体节点）、初始 HYP 节点。**关系仅声明在 nodes/ 文件的 frontmatter 中，不在 evidence\_registry.json 中维护关系副本**

***

### PRE\_INVESTIGATION 阶段 — 静默情报收集

**目标**：在静默条件下穷尽系统内可获取的情报，形成可执行的 FIELDWORK 方案。

**适用条件**：已做出 Go 决策，进入正式调查。

**输入**：

- `init_intelligence_summary.md`（INIT 阶段案件性质判断 + 核心假设 + 调查计划）
- 系统内数据查询需求列表

**输出**：

- `pre_investigation_brief.md` — 调查范围声明 + 宏观画像 + FIELDWORK 方案
- `intelligence_summary.md` — 情报获取状态汇总 + 数据缺口说明 + 边界决策
- `evidence_registry.json` — 追加 system\_data 类型证据条目，补充 entities 信息
- `nodes/` — 追加 EV 节点（系统数据），创建 LS 节点做线索分析
- `meta.json` — 补充 SLA、investigation\_objectives 等非必填字段
- `checklist.yaml` — 更新 pre\_investigation 字段

**质量门禁**（全部满足后推进至 FIELDWORK）：

| 门禁                               | 含义                         |
| -------------------------------- | -------------------------- |
| `trigger_type_confirmed`         | 触发路径已确认并写入 meta.json       |
| `intelligence_summary_completed` | 情报汇总已完成，涵盖所有情报需求           |
| `evidence_gap_assessed`          | 数据缺口已评估，confidence 降级已记录   |
| `scope_defined`                  | 调查范围已定义（人员、时间窗、舞弊类型）       |
| `evidence_preservation_risk`     | 证据保全风险已填写（high/medium/low） |

**关键设计**：

- **静默原则**：不得接触或惊动任何涉案方
- 情报需求由各领域场景自定义，通过 `checklist.pre_investigation.intel_items` 登记
- 每个 `unavailable` 的情报项须完成归因记录（调查方缺口 / 被调查方缺口）
- 存在调查方缺口的项须完成 confidence 降级评估

***

### FIELDWORK 阶段 — 接触取证

**目标**：接触当事人，获取系统外证据，围绕核心假设完成证明或排除。

**适用条件**：PRE\_INVESTIGATION 门禁全部满足。

**输入**：

- `pre_investigation_brief.md`（调查焦点 + FIELDWORK 方案）
- `intelligence_summary.md`（情报缺口、异常标志）
- `references/interview_question_bank.md`（如领域场景有定义）

**输出**：

- 访谈笔录（套用领域场景对应的模板）
- 现场核查报告
- `evidence_registry.json` — 追加 testimonial / documentary / digital\_forensics 类型证据
- `nodes/` — 大量追加 EV 节点（访谈、调证），创建 ARG 节点构建论据
- `checklist.yaml` — 更新 fieldwork 字段

**质量门禁**（全部满足后推进至 REVIEWING）：

| 门禁                              | 含义                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `upload_ratio >= 0.8`           | 已获取证据 / 预期证据总数 ≥ 80%                                                               |
| `digital_forensics_done`        | 数字取证已完成（或判定不适用）                                                                    |
| `contact_data_obtained`         | 系统外数据的获取结果已记录                                                                      |
| `statement_quality_reviewed`    | 关键访谈笔录已按独立第三人视角审查                                                                  |
| `adversarial_behavior_assessed` | 已识别并记录对抗行为                                                                         |
| `evidence_chain_integrity`      | `skills/evidence-management/scripts/scan-chain.js --integrity` 无 ERROR（无缺失引用、无断裂链） |

**关键设计**：

- `contacted_subjects` 设为 `true` 后，FIELDWORK→PRE\_INVESTIGATION 回退路径关闭
- 访谈笔录应达到"独立第三人可读懂并评估证明力"的标准
- 每识别出一个关键对抗行为，至少同步输出一条独立取证路径
- 如确认存在 suspected 置信度的发现，在 REVIEWING 阶段触发回退

***

### REVIEWING 阶段 — 收敛定性

**目标**：将全案证据收敛为可判断的事实认定，回应辩解，形成结论。

**适用条件**：FIELDWORK 门禁全部满足。

**输入**：

- `evidence_registry.json`（完整，含 findings\[]、evidence\_items\[]、entities\[]）
- 各阶段产物（INIT 摘要、PRE 简报、FIELDWORK 访谈记录等）

**输出**：

- `final_report.md` — 最终调查报告
- `evidence_registry.json` — findings confidence 定型，替代解释处理完毕
- `nodes/` — 创建 FND 节点做事实认定，冻结所有节点（不再新增或修改）

**质量门禁**（全部满足后推进至 CLOSED）：

| 门禁                                  | 含义                         |
| ----------------------------------- | -------------------------- |
| `conclusion_drafted`                | 调查结论已起草                    |
| `suspected_findings_resolved`       | 所有 suspected 的 finding 已处置 |
| `major_defenses_responded`          | 每条 finding 的主要辩解已回应        |
| `alternative_explanations_reviewed` | 关键替代解释已标记排除/保留/待补证         |
| `subject_intent_scored`             | 涉案人员意图评分已完成                |

**关键设计**：

- 存在 `suspected` 的 finding 时，不直接拒绝结案——触发 REVIEWING→FIELDWORK 补充取证回退
- 无法支撑结论的内容，不得强行写入确定事实
- 报告应以未参与调查的第三人为读者，使其能理解"为什么这样认定"
- 最终报告和 evidence\_registry 在 CLOSED 后冻结

***

## 数据结构

案件管理涉及两个核心数据文件。精确的字段约束见对应 JSON Schema，以下为本 skill 管理的字段说明。

### meta.json — 案件元数据

**用途**：每个案件的身份证和状态面板。记录案件从创建到结案的全周期信息。

**JSON Schema**：`schemas/meta.schema.json`

**各字段说明：**

| 字段                         | 必填起始阶段 | 填写时机              | 说明                      |
| -------------------------- | ------ | ----------------- | ----------------------- |
| `case_id`                  | INIT   | 创建时               | 格式 `INV-YYYYMM-NN`（如 INV-202606-01），全局唯一 |
| `status`                   | INIT   | 阶段切换时             | 枚举值，单向推进                |
| `trigger_type`             | INIT   | 创建时               | 触发路径（举报/数据驱动/案件扩展）      |
| `parent_case_id`           | —      | case\_expansion 时 | 父案件 ID                  |
| `case_title`               | —      | 创建时（推荐）           | 案件名称                    |
| `created_by`               | —      | 创建时（推荐）           | 创建人                     |
| `created_at`               | INIT   | 创建时               | ISO 8601 时间戳            |
| `last_activity`            | —      | 每次状态变更            | 最后活动时间戳                 |
| `version`                  | —      | 递增                | 乐观锁版本号，更新时校验            |
| `sla`                      | —      | INIT（推荐）          | 各阶段预期完成时间               |
| `investigation_objectives` | —      | INIT→PRE 间        | 调查目标（通用+特定）             |
| `suspend_info`             | —      | 挂起时               | 案件挂起原因和起止时间             |
| `abandon_info`             | —      | 放弃时               | 案件放弃原因                  |

**通用目标匹配参考（随 fraud\_type 自动匹配）：**

| 舞弊类型 | 自动启用的通用目标                           |
| ---- | ----------------------------------- |
| 资产侵占 | GO-01（确认事实）、GO-02（人员画像）、GO-07（报告）   |
| 财务造假 | GO-01、GO-04（资金流向）、GO-06（文件核对）、GO-07 |
| 腐败贿赂 | GO-01、GO-02、GO-03（关系网络）、GO-07       |
| 采购舞弊 | GO-01、GO-04、GO-06、GO-07             |
| 网络欺诈 | GO-01、GO-05（技术取证）、GO-07             |

### checklist.yaml — 阶段门禁清单

**用途**：记录各阶段完成状态，作为阶段推进的门禁依据。每个阶段的条件全部满足后，才能推进至下一阶段。

**JSON Schema**：`schemas/checklist.schema.json`

**阶段与门禁概要：**

| 阶段                     | 核心门禁                                                                                                                                                              | 推进目标                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **INIT**               | case\_opened、objectives\_defined、key\_entities\_verified、information\_gaps\_documented、case\_nature\_assessed、investigation\_plan\_drafted                        | → PRE\_INVESTIGATION |
| **PRE\_INVESTIGATION** | intelligence\_summary\_completed、evidence\_gap\_assessed、scope\_defined、evidence\_preservation\_risk                                                              | → FIELDWORK          |
| **FIELDWORK**          | upload\_ratio >= 0.8、digital\_forensics\_done、contact\_data\_obtained、statement\_quality\_reviewed、adversarial\_behavior\_assessed、**evidence\_chain\_integrity** | → REVIEWING          |
| **REVIEWING**          | conclusion\_drafted、suspected\_findings\_resolved、major\_defenses\_responded、alternative\_explanations\_reviewed                                                  | → CLOSED             |

**关键设计：**

1. **`pre_investigation.intel_items`** 为开放对象，key 由各领域场景自定义（如渠道舞弊场景的 IR-01 \~ IR-05），不在 schema 中预定义
2. **`fieldwork.contacted_subjects`** 一旦设为 `true`，FIELDWORK→PRE\_INVESTIGATION 的回退路径关闭
3. **`reviewing.suspected_findings_resolved`** 为 `false` 时，触发 REVIEWING→FIELDWORK 证据补充回退
4. 所有阶段的 `completed` 为汇总值，不应独立设置，应在该阶段所有门禁条件满足后同步更新

### 创建顺序与参考

创建新案件时的文件创建顺序指引见 [`docs/case-data-model.md`](../../docs/case-data-model.md)。其中 `evidence_registry.json` 在 INIT 阶段即创建基础结构（metadata、entities、evidence\_items 中登记举报线索、初始 hypotheses），与 `meta.json` 和 `checklist.yaml` 同步初始化。

***

## Related

- **Skills:** [调查哲学与方法论](../investigation-foundation/SKILL.md), [证据链与底稿管理](../evidence-management/SKILL.md), [写作与报告技巧](../writing-reporting/SKILL.md), [调查本体论](../ontology/SKILL.md) — 立案/结案的本体层操作规范
- **Agents:** `case-manager` for 案件管理, `evidence-analyzer` for 质量审查
- **Commands:** `/case` 案件管理, `/case-status` 案件状态, `/checklist` 质量检查清单

## References

- `references/intent-scoring.md` — 涉案人员意图评分框架（评分公式、证据分类权重、阈值区间）
- ACFE "Fraud Case Management"
- PMI "Project Management Body of Knowledge (PMBOK)" — 项目管理方法论借鉴
- ISO 37000 — Governance of organizations

