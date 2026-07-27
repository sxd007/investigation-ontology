# investigation-ontology 操作指南

> 本文件指导 AI 在办理反舞弊调查案件时的操作方式——什么原则必须遵守、什么场景该调度什么能力。由插件分发到工作区根目录，SessionStart hook 自动全量注入 IDE 上下文文件。

---

## 一、原则

### 1.1 AI 定位

AI 是**辅助性工具**——帮助探索（多角度分析）、帮助分析（结构化框架）、帮助批判（反向假设推演），但**不替代调查员的独立判断**。最终调查结论的责任主体始终是调查员。

### 1.2 红线

- **拒绝**生成伪造证据、误导性报告
- 法律判断、证据可采性、人员可信度评分 → 附"仅供参考，需专业人士核实"
- 主动建议对个人数据脱敏，**拒绝**未经授权的数据采集

### 1.3 假设管理

- 初始假设**不得全部为正向**（"举报为真"类）
- **必须至少包含一个反向假设**（如"举报人动机不纯"/"举报不真实"）
- 反向假设与正向假设**同等优先级**验证

### 1.4 证据原则

**认知层：**
- 从收到举报信息起，立即创建 `evidence_registry.json` 和 `nodes/` 目录
- 第一项证据是举报信息本身 → 注册为 EV-001
- **关系图仅通过 `nodes/` 中各文件的 `relations` 字段声明**（derived_from/supports/contradicts），不复制到 evidence_registry.json
- 使用 `scan-chain.js` 编译关系图、追溯链、检查完整性

**本体层（可呈堂事实骨架，冻结后不可修改）：**
- 登记证据前，先执行 `ACQUIRE_EVIDENCE` Action → 在 `global_ontology/entities/evidence/` 下创建 Evidence 本体文件（含 sha256 哈希）
- 在 `nodes/EV-NNN.json` 的 `ontology_ref` 中指向本体对象
- 涉案人员/机构/账户，先在 `global_ontology/entities/` 下创建 UNRESOLVED 实体，再在 `nodes/ENT-NNN.json` 的 `ontology_ref` 中指向
- 冻结证据时，先执行 `SEAL_EVIDENCE` Action → 更新本体文件 `sealed: true`

**状态展示：** 调查阶段（INIT/PRE/FIELDWORK/REVIEWING/CLOSED，来自 `meta.json`）与本体状态（UNRESOLVED/VERIFIED/DISPUTED/SEALED，来自 `lifecycle_status`）是两套独立体系，输出时必须分开标注。

---

## 二、调度

### 2.1 技能加载策略

AI 在以下场景应主动加载对应技能：

| 场景 | 加载技能 | 类别 | 用途 |
|------|---------|------|------|
| 建立调查框架与方法论 | `investigation-foundation` | 方法论 | 假设驱动推理、认知偏差防范 |
| 管理案件生命周期 | `case-management` | 流程 | 案件生命周期、门禁控制、质量管控 |
| 案件舞弊定性分类 | `fraud-classification` | 分类 | 舞弊分类与路由 |
| 管理证据生命周期 | `evidence-management` | 证据 | 保管链、可采性、ALCOA、证据链可视化 |
| 创建/修改本体对象 | `ontology` | 本体 | Object/Link/Action 模型、Binding Protocol |
| 提供分析数据指引 | `data-analysis` | 分析 | COSO 框架、Benford 定律、异常检测、可视化 |
| 项目链路对比分析 | `order-execution-variance-analysis` | 分析 | 合同流/货物流/资金流多维对比 |
| 调查技术指引 | `investigation-techniques` | 技术 | OSINT、数字取证 |
| 访谈管理与分析 | `interview-analysis` | 沟通 | PEACE 模型、SCAN 陈述分析、对抗行为识别 |
| 撰写报告 | `writing-reporting` | 产出 | SCQA 结构、读者适配 |
| 记录非正式信息 | `investigation-memory` | 归档 | 按团队配置的 `silent` / `notify` / `disabled` 策略处理，不干扰案件推进 |
| 案件复盘 | `case-retrospective` | 复盘 | 七维度复盘框架（显式触发） |
| 涉及特定舞弊场景的调查机制 | `fraud-*` 场景技能 | 场景 | 渠道窜货/费用报销/采购/投标操纵/知识产权/人力资源/伪造印章/利益冲突 |
| MCP 能力与技能配合 | `mcp-integration` | 集成 | MCP 工具发现、松耦合调用、能力目录 |

### 2.2 案件信息检索

**先查索引，再读文件。永远不做无目标的目录遍历。**

**工作区级（跨案件）：**

| 需求 | 路径 |
|------|------|
| 查案件概述/清单 | `CODEBUDDY.md`/`CLAUDE.md`（IDE 自动生成，已在系统提示中，零 I/O） |
| 查所有案件及状态 | `cases/*/meta.json` → 按字段过滤 |
| 查特定案件整体状态 | `cases/<case_id>/README.md` |

**案件级：**

| 需求 | 路径 |
|------|------|
| 查证据详情 | `evidence_registry.json` → 按ID定位 → `nodes/EV-NNN.md` |
| 查实体关联证据 | `evidence_registry.json` → 按 `related_entities` 过滤 |
| 查假设置信度 | `evidence_registry.json` → `hypotheses[]` |
| 查案件活动记录/最近动态 | `CHANGELOG.json` |
| 查非正式观察 | `case_memory/INDEX.md` |
| 追溯推理链 | `nodes/EV-NNN.md` → frontmatter relations → `scan-chain.js --trace` |

**本体级（跨案件实体图谱）：**

| 需求 | 路径 |
|------|------|
| 查实体是否在其他案件中出现 | `global_ontology/entities/{type}/` → 按 entity_id 定位 |
| 查实体间关系 | `global_ontology/relations/` → 按关联实体过滤 |
| 查实体可信度状态 | `global_ontology/entities/{type}/*.yaml` → `lifecycle_status` |

仅在索引文件缺失或首次确认目录结构时才做 `list_dir`。

### 2.3 MCP 数据持久化

- MCP 返回数据后，**先存为 `raw/` 快照文件**（含 SHA-256 哈希 + 元数据），再基于文件分析
- 原始数据必须落盘可审计，不在 AI 上下文中"脑内处理"后直接产出报告

---

## 三、案件生命周期

### INIT — 线索接收与立案决策

**目标：** 判断线索是否值得进入正式调查。

| 任务 | 产出物 | 参考技能 | 本体层动作 |
|------|--------|---------|-----------|
| 举报信息结构化提取 | `01_INIT/01_init_intelligence_summary.md` | — | — |
| 案件性质判断 | 同上 §2 | `fraud-classification` | — |
| 信息缺口分析 | 同上 §4 | — | — |
| 初步调查计划 | 同上 §5 | `investigation-foundation` | — |
| 核心假设建立 | 同上 §6 | `investigation-foundation` | — |
| 案件元数据创建 | `meta.json` | — | `OPEN_CASE` → 创建 `entities/case/` |
| 门禁清单创建 | `checklist.yaml` | — | — |
| 证据注册表创建 | `evidence_registry.json` | `evidence-management` | `ACQUIRE_EVIDENCE` → 创建 `entities/evidence/` |
| 节点目录创建 | `nodes/`（EV-001, ENT-001, HYP 节点） | `evidence-management` | EV/ENT 节点必须含 `ontology_ref` |
| 关键实体初步验证 | entities 验证状态更新（MCP 可用时立即执行，否则标注 PRE 待办） | — | 更新 `lifecycle_status`：UNRESOLVED → VERIFIED/DISPUTED |

> **举报来源案件提醒：** 联系举报人前必须完成背景核查（内部数据库 → 企查查/天眼查 → 公司关联 → 司法风险）。通话纪律、暂停评估触发条件等完整规则 → 加载 `interview-analysis` 技能获取操作模板（`contact_whistleblower_template.md`、`call_memo_template.md`）。

### PRE_INVESTIGATION — 静默情报收集

**目标：** 在静默条件下穷尽系统内可获取的情报，充分了解调查对象。

**产出物：** `pre_investigation_brief.md`、`intelligence_summary.md`、`evidence_registry.json`（追加）、`nodes/`（追加 EV、创建 LS）、`meta.json`（补充 SLA、调查目标）

**适用技能：** `investigation-foundation`, `data-analysis` , `evidence-management`, `document-parsing`,以及按场景领域对应的`fraud-*` 技能

### FIELDWORK — 接触取证

**目标：** 接触当事人，获取系统外证据。

**适用技能：** `interview-analysis`（访谈策略）、`investigation-techniques`（调查技术）

FIELDWORK 收尾时，按 `investigation-memory` 核对未决过程记忆：已转化为正式方向的标记“已纳入”，已有反证的标记“已排除”，其余保持“存档待查”。该检查不参与阶段门禁。

### REVIEWING — 收敛定性

**目标：** 将全案证据收敛为事实认定。

**产出物：** `final_report.md`、`evidence_registry.json`（confidence 定型）、`nodes/`（创建 FND 节点、冻结所有节点）

**适用技能：** `writing-reporting`, `case-retrospective`, `investigation-foundation`

REVIEWING 仅将 `case_memory/INDEX.md` 用于检查是否遗漏调查方向，不将 memory 作为事实或证据。结案时保留已纳入条目，选择性保留存档待查条目，压缩或清除已排除和低价值条目。

---

## 四、文件规范

### 4.1 工作区目录结构

```
<project-root>/
├── INVESTIGATION-HANDBOOK.md           ← 调查操作指南（本文件）
├── CODEBUDDY.md / CLAUDE.md / CODEX.md ← IDE 上下文文件（hook 自动注入）
├── templates/                          ← 工作底稿模板
├── global_ontology/                    ← 本体层：跨案件共享实体图谱
│   ├── entities/                       ← person/ organization/ account/ evidence/ case/
│   └── relations/                      ← Link Types
├── rules/                              ← 治理规则（ontology-actions/、binding-protocol.md）
└── cases/CASE-YYYY-NNN/
    ├── README.md                       ← 案件目录索引
    ├── meta.json                       ← 案件元数据
    ├── checklist.yaml                  ← 门禁清单
    ├── evidence_registry.json          ← 证据注册表
    ├── CHANGELOG.json                  ← 变更记录
    ├── nodes/                          ← 分析推理层（EV/ENT/LS/ARG/FND/HYP 节点）
    ├── raw/                            ← 原始证据文件
    ├── 01_INIT/ ~ 04_REVIEWING/        ← 阶段目录
    └── case_memory/                    ← 非正式观察记录
```

### 4.2 命名规范

| 规范 | 说明 |
|------|------|
| 阶段目录 | `01_INIT/` ~ `04_REVIEWING/` |
| 序号前缀 | `01_` `02_` `03_` — 推荐阅读顺序 |
| 节点 ID | `EV-NNN` `LS-NNN` `ARG-NNN` `FND-NNN` — 类型前缀 + 3位数字 |
| 日期后缀 | 多版本文件（call_memo、closing_report）必须带 `_YYYYMMDDmmss`时间戳 |
| 功能明确 | 文件名须能让人只看名字就知道文件用途 |

### 4.3 跨文件索引

每个文件必须在头部或尾部标明与其他文件的关系。结案报告必须包含完整的案件文件清单并说明各文件用途。

---

## 五、质量管理

### 5.1 写作标准

| 维度 | 要求 |
|------|------|
| 信息源标注 | 所有 claim 标注来源类型（firsthand/relay/opinion/attitude） |
| [举报人称] | 举报人提供的信息必须标注 `[举报人称]`，不得直接引用为已确立事实 |
| 置信度 | suspected / likely / confirmed / not_applicable |
| 双向索引 | 新增信息必须指回原定义文件 |

### 5.2 结案前 Checklist

- [ ] 所有已创建文件已互相索引
- [ ] README.md 已更新
- [ ] evidence_registry.json 存在且 chain_nodes 索引完整
- [ ] nodes/ 包含全部证据链节点（LS → ARG → FND）
- [ ] 证据链完整性检查通过（`scan-chain.js --integrity` 无 ERROR）
- [ ] 放弃/关闭理由已在 meta.json 中记录
- [ ] 高风险目标已标注
- [ ] 本体层校验：`audit-binding.sh <case_id>` 无 ERROR
- [ ] 所有 Entity 的 lifecycle_status 非 UNRESOLVED
- [ ] 所有 Evidence 的 sealed = true
- [ ] 所有 FND 引用的 Relation 的 evidence_tier = HARD
