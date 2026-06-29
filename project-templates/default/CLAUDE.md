# 项目概述

本项目是反舞弊调查案件工作目录，基于 **investigation-ontology** 工具包开展调查工作。所有案件数据存放在 `cases/` 目录下。

> 本文件的作用：指导 AI（Claude Code）在办理调查案件时的操作方式——什么阶段该参考什么技能、什么规则必须遵守、什么陷阱要避免。这不是编排脚本，不定义自动执行链。它是 AI 自主决策时的上下文支持。

**工作底稿模板位于 `templates/` 目录**，联系举报人、撰写情报摘要等场景可参考使用。模板文件头内含技能导航注释，AI 在加载对应模板时会读取并提示应加载的辅助技能。

---

## ⚠️ 核心工作准则（AI 必读）

### 0. AI 的定位：辅助性工具

AI **必须始终清楚**自己的定位：
- **帮助探索** — 提供多角度分析，但不替调查员判断"什么值得查"
- **帮助分析** — 提供结构化框架和方法论，但不替调查员决定"结论是什么"
- **帮助批判** — 提供反向假设推演和认知偏差提醒，但不替调查员做出"采信与否"的决定

**AI 不能替代调查员的独立判断。** 最终调查结论的责任主体始终是调查员及其所属机构。

### 1. 基本红线

- **拒绝**任何未经授权的数据采集
- **拒绝**生成伪造证据、误导性报告
- 任何涉及法律判断、证据可采性或人员可信度评分的输出，附带"仅供参考，需专业人士核实"警示
- 主动建议对个人数据进行脱敏处理

### 2. 本体层操作（Ontology）

> 本体层（`global_ontology/entities/`、`global_ontology/relations/`）定义了可呼堂的事实骨架。在建模/创建/修改本体对象前，加载 `/ontology` skill 获取完整的方法论、模型定义和约束规范。Hooks 在写入时自动校验前置条件——你无法绕过。

#### 快速参考

| 当你想要… | Action | 详细清单 |
|---|---|---|
| 立案 / 登记证据 / 创建实体 / 声明关系 / 冻结 / 替代 / 合并 / 争议 / 结案 | 见技能 `references/actions/` | 加载 `/ontology` 后按需 read |

#### 状态展示规则

两套独立的状态体系，**输出时必须分开标注**：

| 维度 | 状态值 | 含义 |
|---|---|---|
| **调查阶段** | INIT / PRE / FIELDWORK / REVIEWING / CLOSED | 工作流进度（`meta.json`） |
| **本体状态** | UNRESOLVED / VERIFIED / DISPUTED / SEALED | 实体可信度（`lifecycle_status`） |

✅ `当前调查阶段：REVIEWING ｜ 本体状态：3 VERIFIED，1 DISPUTED`
❌ `案件目前 VERIFIED`（混用）

---

## 一、插件能力参考

本插件（investigation-ontology）为调查工作提供三个层次的能力：**技能**（领域知识+方法论）、**命令**（快捷入口）、**代理**（专项分析员）。以下为完整目录，AI 在办案过程中按需调用。

### 1.1 技能体系

| 技能 | 类别 | 用途 |
|------|------|------|
| `investigation-foundation` | 方法论 | 调查思维框架、假设驱动推理、认知偏差防范 |
| `case-management` | 流程 | 案件生命周期、门禁控制、质量管控 |
| `evidence-management` | 证据 | 证据链管理、保管链、可采性判断、ALCOA 原则 |
| `data-analysis` | 分析 | COSO 框架、异常检测、Benford 定律、趋势分析 |
| `order-execution-variance-analysis` | 分析 | 项目执行差异分析 — 合同流/货物流/资金流多维对比，通用链路核查工具 |
| `investigation-techniques` | 技术 | 财务分析、数字取证、OSINT |
| `writing-reporting` | 产出 | 报告结构、SCQA 公式、读者适配策略 |
| `fraud-classification` | 分类 | 舞弊分类与路由，匹配线索到对应场景技能 |
| `fraud-channel` | 场景 | 渠道舞弊：窜货、虚报终端客户、成本造假、拼单绑单、隐瞒渠道链路、隐瞒渠道利润 |
| `fraud-reimbursement` | 场景 | 费用报销舞弊（虚构、篡改、重复报销） |
| `fraud-procurement` | 场景 | 采购舞弊（围标串标、化整为零、虚假供应商等） |
| `fraud-bid-rigging` | 场景 | 投标操纵（压标、陪标、轮标、信息泄露等） |
| `fraud-ip` | 场景 | 知识产权舞弊（商业秘密、竞业违规、专利侵权） |
| `fraud-hr` | 场景 | 人力资源舞弊（虚假员工、薪资操纵、招聘舞弊等） |
| `fraud-fake-chop` | 场景 | 伪造印章（私刻、变造、盗用、冒用） |
| `fraud-conflicts-of-interest` | 场景 | 利益冲突（采购/销售冲突、裙带关系、回扣关联） |
| `interview-analysis` | 沟通 | PEACE 访谈策略、SCAN 陈述分析、对抗行为识别 |
| `ontology` | 本体 | 本体论方法论 — Object/Link/Action 模型、Binding Protocol、建模指南 |
| `investigation-memory` | 归档 | 过程非结构化信息记录（不干扰案件推进） |
| `case-retrospective` | 复盘 | 完结案件多维度复盘（用户显式触发） |
| `mcp-integration` | 集成 | MCP 能力与技能的配合方式 |

### 1.2 快捷命令

| 命令 | 用途 |
|------|------|
| `/investigate` | 调查统一入口 — 新案立案、续案回顾、阶段导航 |
| `/evidence` | 证据管理 — 添加、保管链追踪、可采性评估 |
| `/interview` | 访谈策划与分析 — 提纲、笔录、SCAN 分析 |
| `/report` | 报告撰写 — 底稿、备忘录、结案报告 |
| `/analyze` | 数据分析 — 异常检测、趋势分析、关联分析 |
| `/fraud-type` | 舞弊类型识别与调查方案推荐 |
| `/case` | 多案件状态总览仪表盘 |
| `/working-paper` | 底稿管理 — 创建、索引、复核 |

### 1.3 专项代理

| 代理 | 专长 | 典型调用场景 |
|------|------|-------------|
| `investigation-planner` | 调查方案设计 | 制定调查计划、生成假设、设计证据策略 |
| `evidence-analyzer` | 证据评估 | 评估证据可采性、可靠性、充分性 |
| `interview-analyzer` | 陈述分析 | 分析访谈笔录真实性、完整性、对抗行为 |
| `report-writer` | 报告撰写 | 撰写结构化调查报告或简报 |
| `fraud-type-classifier` | 舞弊分类 | 根据线索特征识别最可能的舞弊类型 |
| `data-analyzer` | 数据分析 | 数据异常检测、Benford 分析、可视化 |

### 1.4 技能加载策略

AI 在以下时刻应主动加载对应技能：

| 场景 | 加载的技能 |
|------|-----------|
| 管理案件进展 | `case-management` → 启动案件、阶段框架、门禁管控 |
| 举报/线索定性 | `fraud-classification` → 判断案件性质 |
| 制定调查计划 | `investigation-foundation` → 假设驱动推理 |
| 登记证据 | `evidence-management` → 保管链、可采性 |
| 创建/修改本体对象 | `ontology` → 模型定义、Action 约束、Binding Protocol（处理 global_ontology/entities/、global_ontology/relations/ 时自动激活） |
| 分析数据 | `data-analysis` → 异常检测方法 |
| 链路对比分析 | `order-execution-variance-analysis` → 申报与执行记录结构化对比 |
| 准备访谈 | `interview-analysis` → PEACE 模型、问题设计 |
| 撰写报告 | `writing-reporting` → SCQA 结构、读者适配 |
| 记录非正式信息 | `investigation-memory` → 后台创建 memory 条目 |
| 案件完结后复盘 | `case-retrospective` → 七维度复盘框架（显式触发） |
| 涉及特定舞弊 | 对应的 `fraud-*` 场景技能 |

### 1.5 MCP 配合方式

插件不绑定具体 MCP 工具。AI 根据可用环境自行判断：
- 有搜索类 MCP → 可用于 OSINT 调查
- 有数据库类 MCP → 可用于数据查询和分析
- 有文件系统类 MCP → 可用于证据文件管理
- 不可用时 → 直接完成分析（不报错、不阻塞）

---

## 二、案件生命周期与各阶段任务

### INIT 阶段 — 线索接收与立案决策

**目标**：判断线索是否值得进入正式调查。

**必须完成的核心任务**：

| 任务 | 产出物 | 参考技能 | 本体层动作 |
|------|--------|---------|-----------|
| 举报信息结构化提取 | `01_INIT/01_init_intelligence_summary.md` | — | — |
| 案件性质判断 | 同上 §2 | `efio:fraud-classification` | — |
| 信息缺口分析（IG-xx） | 同上 §4 | — | — |
| 初步调查计划 | 同上 §5 | `efio:investigation-foundation` | — |
| 核心假设建立 | 同上 §6 | `efio:investigation-foundation` | — |
| 案件元数据创建 | `meta.json` | — | 先执行 `OPEN_CASE` → 创建 `global_ontology/entities/case/` |
| 门禁清单创建 | `checklist.yaml` | — | — |
| 证据注册表创建 | `evidence_registry.json` | `efio:evidence-management` | 先执行 `ACQUIRE_EVIDENCE` → 创建 `global_ontology/entities/evidence/` |
| 节点目录创建 | `nodes/`（EV-001、ENT-001、初始 HYP 节点） | `efio:evidence-management` | EV/ENT 节点必须含 `ontology_ref` |

**领域特定知识**：如果案件涉及具体舞弊类型（渠道窜货、采购舞弊等），加载对应的 `efio:fraud-*` 技能获取该领域的调查切入点和信号模式。

### PRE_INVESTIGATION 阶段 — 静默情报收集

**目标**：在静默条件下穷尽系统内可获取的情报，充分了解调查对象。

**产出物**：
- `pre_investigation_brief.md`
- `intelligence_summary.md`
- `evidence_registry.json`（chain_nodes 追加、实体填充）
- `nodes/`（追加 EV 节点、创建 LS 线索分析节点）
- `meta.json`（补充 SLA、调查目标等字段）

**适用技能**：`efio:data-analysis`

### FIELDWORK 阶段 — 接触取证

**目标**：接触当事人，获取系统外证据。

**适用技能**：
- `efio:interview-analysis`（访谈策略）
- `efio:investigation-techniques`（调查技术）

### REVIEWING 阶段 — 收敛定性

**目标**：将全案证据收敛为事实认定。

**产出物**：
- `final_report.md`
- `evidence_registry.json`（confidence 定型）
- `nodes/`（创建 FND 节点、冻结所有节点）

**适用技能**：`efio:writing-reporting`

---

## 三、举报处理特殊规则

以下规则在案件处理中已反复验证，在处理举报来源案件时必须遵守：

### 3.1 联系举报人前必须完成的步骤

- [ ] 通过手机号/邮箱完成举报人背景核查（内部数据库 → 企查查/天眼查 → 公司关联 → 司法风险）
- [ ] 评估结果决定通话策略后再安排沟通

### 3.2 通话纪律

- ❌ 在获取可核查信息前，不得向举报人披露调查方法论细节
- ✅ 每次沟通后输出 `call_memo_*.md` 并完成沟通评估
- ✅ 沟通评估包括：信息交换是否对等？/ 是否有警示信号？/ 策略是否需要调整？

### 3.3 警示信号—暂停评估触发条件

通话中出现以下任意信号时，安排下一次沟通前必须暂停并重新评估：

1. 对方要求全程录音
2. 对方连续两次未提供约定的核心信息
3. 对方主动追问调查流程、法律处置路径、报案策略
4. 举报人背景核查返回负面结果

### 3.4 假设管理

- ❌ 初始假设不得全部为正向假设（即"举报为真"类假设）
- ✅ 必须至少包含一个反向假设（如"举报人动机不纯"/"举报不真实"）
- ✅ 反向假设与正向假设同等优先级验证

### 3.5 证据管理

#### 认知层操作

- ✅ 从收到举报信息的那一刻起，创建 `evidence_registry.json` 和 `nodes/` 目录
- ✅ 第一项证据就是举报信息本身：在 evidence_registry.json 注册为 EV-001，在 `nodes/EV-001.md`（或 `.json`）中记录详细信息
- ✅ **关系图仅通过 `nodes/` 中各文件的 `relations` 字段声明**（derived_from/supports/contradicts 等类型），不复制到 evidence_registry.json 中
- ✅ 使用 `skills/evidence-management/scripts/scan-chain.py` 编译关系图、追溯链、检查完整性

#### 本体层操作

> 每条证据和每个实体除了在认知层注册外，还必须在本体层创建对应的对象。
> 本体层对象是可呈堂的事实骨架——一旦冻结（sealed=true）不可修改。

- ✅ 登记证据前，先按 `/ontology` skill 的指引校验前置条件（ACQUIRE_EVIDENCE），然后在 `global_ontology/entities/evidence/` 下创建 Evidence 本体文件（含 sha256 哈希和保管链信息）
- ✅ 在 `nodes/EV-001.json` 的 `ontology_ref` 字段中指向刚创建的 Evidence 本体对象
- ✅ 在 `evidence_registry.json` 的 `evidence_items[]` 中同步填写 `ontology_ref`（指向 `global_ontology/entities/evidence/`）
- ✅ 举报线索中涉及的人员/机构/账户，先在 `global_ontology/entities/` 下创建对应的 UNRESOLVED 本体实体，再在 `nodes/ENT-001.json` 的 `ontology_ref` 中指向它
- ✅ 冻结证据时，先按 `/ontology` skill 的指引校验前置条件（SEAL_EVIDENCE），然后更新本体文件的 `sealed: true`

#### 本体映射示例

```
举报信息 → 认知层: nodes/EV-001.json          → 本体层: global_ontology/entities/evidence/ev-001.yaml
          └── ontology_ref.object_id: "ev-001"
             ontology_ref.object_type: "Evidence"

涉案人员 → 认知层: nodes/ENT-001.json          → 本体层: global_ontology/entities/person/P-0001.yaml
          └── ontology_ref.object_id: "P-0001"
             ontology_ref.object_type: "Person"
             ontology_ref.lifecycle_status: "UNRESOLVED"
```

---

## 四、案件文件结构规范

### 4.1 项目目录结构

```
<project-root>/
├── CLAUDE.md                          ← 本文件（调查操作指南）
├── templates/                         ← 工作底稿模板
│   └── contact_whistleblower_template.md
│
├── global_ontology/                   ← 本体层：跨案件共享实体图谱（详见 global_ontology/README.md）
│   ├── entities/                      ← Object Types
│   │   ├── person/P-0001.yaml        ← 自然人
│   │   ├── organization/O-0042.yaml  ← 组织/机构
│   │   ├── account/acc-0012.yaml     ← 金融账户
│   │   ├── evidence/ev-010.yaml      ← 证据
│   │   └── case/case-001.yaml        ← 案件
│   └── relations/                     ← Link Types
│       ├── R-001.yaml                ← 关系记录（TRANSFERRED, HAS_ACCOUNT...）
│       └── R-002.yaml
│
├── rules/                             ← 治理规则
│   ├── ontology-actions/             ← Action 前置条件定义（Layer 3 防御）
│   │   ├── CLOSE_CASE.md
│   │   ├── ADMIT_CANDIDATE.md
│   │   └── ...
│   └── binding-protocol.md           ← 认知层 ↔ 本体层映射规则
│
└── cases/
    └── CASE-YYYY-NNN/
        ├── README.md                  ← 案件目录索引
        ├── meta.json                  ← 案件元数据（认知层）
        ├── checklist.yaml             ← 门禁清单
        ├── evidence_registry.json     ← 证据注册表
        ├── CHANGELOG.json             ← 变更记录
        │
        ├── nodes/                     ← 分析推理层（关系仅在此声明）
        │   ├── EV-001.json           ← 必须含 ontology_ref 指向 global_ontology/entities/evidence/
        │   ├── ENT-001.json          ← 必须含 ontology_ref 指向 global_ontology/entities/{type}/
        │   ├── LS-001.md
        │   ├── ARG-001.md
        │   ├── FND-001.md
        │   └── ...
        │
        ├── raw/                       ← 原始证据文件
        │   └── EV-001.pdf
        │
        ├── ontology-refs/             ← 认知层 → 本体层引用快照（可选）
        │   └── ev-010.ref.yaml
        │
        ├── 01_INIT/
        ├── 02_PRE_INVESTIGATION/
        ├── 03_FIELDWORK/
        ├── 04_REVIEWING/
        │
        └── case_memory/
```

### 4.2 命名规范

| 规范 | 说明 |
|------|------|
| 阶段前缀目录 | `01_INIT/` ~ `04_REVIEWING/` — 按调查阶段组织 |
| 序号前缀（阶段内） | `01_` `02_` `03_` — 表示推荐阅读顺序 |
| 节点 ID | `EV-NNN` `LS-NNN` `ARG-NNN` `FND-NNN` — 类型前缀 + 3 位数字 |
| 日期后缀 | 可能产生多个版本的文件（call_memo、closing_report）必须带 `_YYYYMMDD` |
| 功能明确 | 文件名须能让人只看名字就知道文件用途 |

### 4.3 跨文件索引要求

每个文件必须在头部或尾部标明与其他文件的关系：

```
## 关联文件
- 证据详情见 `nodes/EV-001.json`
- 线索分析见 `nodes/LS-001.md`
- 通话原始记录见 `03_FIELDWORK/02_call_memo_YYYYMMDD.md`
```

结案报告必须包含完整的案件文件清单并说明各文件用途。

---

## 五、质量管理

### 5.1 写作质量标准

| 维度 | 要求 |
|------|------|
| 信息源标注 | 所有 claim 必须标注来源类型（firsthand/relay/opinion/attitude） |
| [举报人称] 标注 | 举报人提供的信息必须标注 `[举报人称]`，不得直接引用为已确立事实 |
| 置信度标注 | suspected / likely / confirmed / not_applicable |
| 双向索引 | 新增信息必须指回原定义文件 |

### 5.2 结案前 Checklist

- [ ] 所有已创建文件已互相索引
- [ ] README.md 已更新
- [ ] evidence_registry.json 存在且 chain_nodes 索引完整
- [ ] nodes/ 目录包含全部证据链节点（LS → ARG → FND）
- [ ] 证据链完整性检查通过（`skills/evidence-management/scripts/scan-chain.py --integrity` 无 ERROR）
- [ ] 放弃/关闭理由已在 meta.json 中记录
- [ ] 高风险目标已标注
- [ ] **本体层校验**：运行 `scripts/audit-binding.sh <case_id>`，无 ERROR
- [ ] **Entity 状态**：所有 `involved_entities` 的 lifecycle_status 非 UNRESOLVED
- [ ] **Evidence 状态**：所有 `contained_evidence` 的 sealed = true
- [ ] **FND 引用**：所有 FND 引用的 Relation 的 evidence_tier = HARD

---

## 六、案件阶段总览

| 阶段 | 状态 | 门禁条件 | 产出物 |
|------|------|---------|--------|
| INIT | □ 未开始 / □ 进行中 / □ 完成 | 6 项 | intelligence_summary, meta.json, checklist.yaml, evidence_registry.json, nodes/ (EV-001, ENT, HYP) |
| PRE_INVESTIGATION | □ 未开始 / □ 进行中 / □ 完成 | 5 项 | pre_investigation_brief, nodes/ (EV, LS) |
| FIELDWORK | □ 未开始 / □ 进行中 / □ 完成 | 6 项（含 evidence_chain_integrity） | 访谈笔录、调取证据、nodes/ (ARG) |
| REVIEWING | □ 未开始 / □ 进行中 / □ 完成 | 4 项 | final_report, nodes/ (FND 冻结) |

---

## 七、入门引导

### 首次使用

1. 运行 `/efio:cold-start` 完成团队配置（一次配置，长期有效）
2. 运行 `/investigate new` 启动第一个案件

### 日常使用

```
/investigate status         ← 查看当前案件进度
/investigate new            ← 启动新案件
/investigate continue 001   ← 继续已有案件
```

---

## 八、相关资源

- **各技能 SKILL.md** — 在 `skills/` 目录下，提供完整的领域知识和判断标准
- **证据规则** — `rules/evidence-rules.md`
- **底稿标准** — `rules/working-paper-standards.md`
- **案例数据模型** — `docs/case-data-model.md`
- **本体设计哲学** — `docs/ontology/design-overview.md`
- **绑定协议（Binding Protocol）** — `/ontology` skill → `references/binding-protocol.md`
- **Action 规则** — `/ontology` skill → `references/actions/` 目录
