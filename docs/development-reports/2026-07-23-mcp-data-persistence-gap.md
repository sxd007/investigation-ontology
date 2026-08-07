# 插件设计差距分析：MCP数据持久化与案件信息检索

> **文档性质**：设计差距分析报告，供插件维护者参考  
> **分析日期**：2026-07-23  
> **分析背景**：从某测试案件中，AI 从 data-query-mcp 获取员工报销数据后，经历了"脑内处理→硬编码导出"的低效链路，暴露出插件在 MCP 数据持久化和案件信息检索两个方面的设计空白。  
> **分析方法**：以实际操作链路的原子级复盘为基础，对照插件各技能的 SKILL.md 定义，识别设计与执行之间的差距。

---

## 一、问题概述

### 问题 1：MCP 返回数据不落盘，AI 脑内处理后硬编码导出

**实际发生的操作链路：**

```
6/29 首次分析：
  mcp_call_tool query_employee expense_detail → 66条JSON
  → 数据注入对话上下文（AI"脑内"）
  → AI 脑内理解+分析
  → 直接写出分析报告 01_expense_analysis_<name>.md
  → ❌ 原始JSON从未存为文件

7/23 重新获取+导出Excel：
  mcp_call_tool query_employee expense_detail → 再次返回66条JSON
  → 数据再次注入对话上下文
  → AI 脑内"抄写"66条数据，逐行硬编码进Python脚本（~300行，数据占60%+）
  → 执行脚本生成xlsx, 该动作花费了大量的无效等待时间
  → ❌ 原始JSON仍未独立存盘
```

**后果：**
- **不可审计**：无人能复核 AI 脑内数据与 MCP 实际返回是否一致
- **不可复用**：下次分析同一批数据只能重新调 MCP，无法引用历史快照
- **有损转录**：66条×20字段的 JSON 被 AI"手动"逐行写进脚本，易出错且无法验证
- **效率低下**：导出 Excel 需 13 步 API 调用（含 4 步补救），花费数分钟，不可忍受，理想路径仅需 5 步

### 问题 2：检索案件已有信息时目录树盲搜

**实际发生的操作链路：**

```
用户问："报销数据有什么分析进展？"

AI 的操作：
  list_dir cases/<case_id>            ← 遍历根目录
  list_dir evidence                   ← 遍历子目录
  list_dir 02_PRE_INVESTIGATION       ← 遍历阶段目录
  list_dir nodes                      ← 遍历节点目录
  read_file README.md                 ← 读案件索引
  read_file 01_expense_analysis_<name>.md  ← 读分析报告
  read_file EV-002.md                 ← 读证据节点

→ 7步操作，本质是"目录树盲搜"
```

**后果：**
- 7步 API 调用完成本应 2 步完成的工作
- 每次新对话都要重复探索（AI 无持久记忆）
- 案件文件增多后，盲搜效率持续下降

### 问题 3：工作区 CODEBUDDY.md 内容缺失

**现状：**

| 项目 | 行数 | 内容 |
|------|:----:|------|
| 模板 `project-templates/default/CODEBUDDY.md` | 405行 | 完整的操作指南（核心准则、技能表、阶段任务、文件规范、质量管理） |
| 工作区 `CODEBUDDY.md` | 17行 | 仅案件概述+案件列表 |

模板中的"技能加载策略""举报处理特殊规则""文件结构规范"等关键章节全部缺失。AI 在案件工作中完全没有得到插件设计的操作指导。

---

## 二、根因分析

### 根因 1：MCP 数据缺少对等的"raw → parsed → EV"三层管线

#### 插件为文档类证据设计的完整管线

插件为文档类证据（PDF/图片/扫描件）设计了清晰的三层分离架构：

```
Layer 0: raw/合同.pdf                    ← 原始文件（用户提供）
    ↓ document-parsing 技能负责
Layer 1: raw/parsed/CONTRACT-合同_v1.json ← 结构化解析（按schema提取字段）
    ↓ evidence-management 技能负责
Layer 2: nodes/EV-004.md                  ← 证据节点（含推理关系）
```

三个技能的职责边界明确：

| 技能 | 职责 | 输入 | 输出 |
|------|------|------|------|
| document-parsing | "只读取 raw 文件并写入 raw/parsed/*.json。不自动创建 EV 证据节点。" | raw 文件 | parsed JSON |
| data-analysis | "如有 raw/parsed/*.json（document-parsing 产物）：优先消费" | parsed JSON | analysis_finding |
| evidence-management | "证据来源是原始文档时 → 先调用 document-parsing 解析为结构化 parsed JSON，再用 parsed 结果创建 EV 节点" | parsed JSON + analysis | EV 节点 |

#### MCP 数据走的路径

```
mcp-integration 技能：
  "技能描述分析需求，模型自行编排 MCP 调用"
  "MCP 是环境能力，不是技能依赖"
  → 只关注工具发现和松耦合，不涉及数据保全

data-analysis 技能的"数据驱动"模式：
  "数据已在手 → 理解数据 → 确立目标 → 研判策略 → 执行分析 → 产出发现"
  → "数据已在手"的隐含假设：数据在 AI 上下文窗口中，不需要持久化

evidence-management 技能：
  → 没有提到 MCP 数据源的任何特殊处理
  → 保管链原则（哈希、元数据）未与 MCP 数据获取流程关联
```

**两个技能之间存在无人覆盖的空白地带：**

```
MCP 返回 JSON
    ↓
    ???  ← 没有技能负责这一步
    ↓
AI 脑内分析 → 产出报告 → 创建 EV 节点
```

document-parsing 的职责边界是"只读取 **raw 文件**"——它假设输入已经是磁盘文件。MCP 返回的数据不是文件，因此根本没有进入 document-parsing 的处理范围。data-analysis 假设"数据已在手"意味着"已在 AI 上下文中"，没有定义持久化步骤。

#### 对照表

| 环节 | 文档类证据 | MCP 数据 | 差距类型 |
|------|-----------|---------|---------|
| Layer 0: 原始数据 | ✅ `raw/合同.pdf` | ❌ 不存在 | **管线空白** |
| Layer 1: 结构化解析 | ✅ `raw/parsed/CONTRACT-合同_v1.json` | ❌ 不存在 | **管线空白** |
| Layer 2: 证据节点 | ✅ `nodes/EV-004.md` | ✅ 直接创建（跳过前两层） | 管线不完整 |
| 保管链（哈希/元数据） | ✅ document-parsing 实现 | ❌ 未执行 | **规范未落地** |
| data_ref 可引用 | ✅ `PARSE-ID` | ❌ 无文件可引用 | **引用缺失** |
| 注册表区分层级 | ⚠️ 单一 `location` 字段 | ❌ 无区分 | **字段不足** |

### 根因 2：data-analysis 的 analysis_finding 未强制 data_ref

data-analysis 技能定义了标准的 `analysis_finding` 输出范式：

```yaml
analysis_finding:
  data_scope:
    data_refs: [PARSE-...]    # ← 弱引用，"有则填"
  provenance:
    script_or_steps: |         # ← 必须填写，但只描述步骤
      ...
    intermediate_artifacts: [] # ← 空数组
```

- `data_refs` 是弱引用——MCP 数据没有被持久化为文件，因此无东西可填
- `provenance.script_or_steps` 虽然要求"必须填写"，但描述的是分析步骤，不是数据来源
- `intermediate_artifacts` 是空数组，没有定义应包含什么

**差距：analysis_finding 的 data_refs 设计为弱引用，且没有为 MCP 数据源定义引用格式。AI 可以写一段文字描述"通过 MCP 查询了数据"，但这不是可验证的文件引用。**

### 根因 3：evidence_registry 的 evidence_items 缺少层级区分

`evidence-registry-spec.md` 的 evidence_items 字段：

| 字段 | 说明 | 问题 |
|------|------|------|
| `location` | 存储位置，推荐格式 `raw/EV-NNN.<ext>` | 与 `raw_file_path` 语义重叠 |
| `raw_file_path` | （实际操作中自行添加） | 不在原始 spec 中 |
| `hash` | 电子证据哈希值 | MCP 数据未填写 |

**问题：**
1. `location` 和 `raw_file_path` 语义重叠——一个是 spec 定义的，一个是实践中自行加的
2. 没有字段区分"原始数据文件"与"衍生产物"——对于 MCP 数据，原始 JSON 快照、Excel 归档、分析报告是三个不同层级的产物，但注册表只能记录一个路径
3. 缺少 `derived_artifacts[]` 字段来记录从原始数据到最终分析结论之间的中间产物链

### 根因 4：没有任何技能定义"案件信息检索入口"

阅读全部技能后发现：

- `evidence-management` 定义了**如何创建和维护**证据注册表
- `data-analysis` 定义了**如何分析**数据
- `investigation-memory` 定义了**如何记录**非正式观察
- `case-management` 定义了**如何管理**案件阶段

**但没有任何技能定义"如何检索已有案件信息"。**

每个技能都假设 AI 已经知道当前案件有什么证据、什么假设、什么实体。但实际上，AI 在每次新对话开始时上下文是空的。

`evidence-management` 列出了 `scan-chain.js` 的 `--list`、`--trace` 等命令，但这些都是节点关系查询工具，不是案件内容检索入口。

`README.md` 是案件总索引但需要手动维护，且不是结构化的——无法用 JSON path 查询"所有关联 ENT-001 的证据"。

`evidence_registry.json` 是结构化的，但没有任何技能明确说"当需要查找案件信息时，先读这个文件"。

### 根因 5：CODEBUDDY.md 模板内容未完整分发到工作区

cold-start 技能 Phase 4.4 设计了从 `project-templates/default/CODEBUDDY.md` 到工作区 `CODEBUDDY.md` 的分发机制。模板内容完整（405行），包含：

- 核心工作准则（AI 定位、基本红线）
- 插件能力参考（技能表、命令表、代理表、**技能加载策略表**）
- 案件生命周期与各阶段任务
- 举报处理特殊规则
- 文件结构规范
- 质量管理

但工作区的 CODEBUDDY.md 只有 17 行，仅包含案件概述和案件列表。模板中的关键章节全部缺失。

CODEBUDDY.md 是 AI 的"常驻上下文"——每轮对话都会被注入系统提示。模板中的"1.4 技能加载策略"表格正是 AI 的"行为路由表"，定义了什么场景该做什么。这部分内容的缺失直接导致 AI 在案件工作中没有操作指导。

### 根因 6：保管链原则未与执行流程绑定

`evidence-collection-and-custody.md` 明确规定：

```
电子证据：邮件、聊天记录、系统日志、数据库
保全要点：镜像复制；哈希值校验；metadata保全

保管五原则：
1. 最少经手人
2. 每次交接必签名
3. 封存完好
4. 电子证据加哈希
5. 环境可控
```

MCP 返回的数据库查询结果就是电子证据（"系统日志、数据库"类别）。但保管链原则是写在参考文档里的"规范"，没有被任何技能的执行流程"强制执行"：

- `data-analysis` 的"数据驱动"模式没有引用保管链原则
- `mcp-integration` 只关注工具发现和松耦合，不涉及数据保全
- `evidence-management` 的保管链规范在 `references/` 下，是按需加载的参考文档，不是执行时的强制检查

**对于文档类证据，document-parsing 的 raw→parsed 流程天然实现了镜像复制（raw 文件一直在）；但对于 MCP 数据，没有等价的执行机制。**

---

## 三、差距全景图

```
插件设计中的数据流覆盖情况：

                    文档类证据          MCP数据           差距类型
                    ──────────         ─────────         ────────
原始数据落盘          ✅ raw/            ❌                根因1: 管线空白
结构化解析            ✅ raw/parsed/     ❌                根因1: 管线空白
保管链(哈希/元数据)   ✅ document-parsing ❌               根因6: 规范未落地
data_ref可引用       ✅ PARSE-ID        ❌                根因2: 引用缺失
注册表区分层级        ⚠️ location字段    ❌                根因3: 字段不足
证据节点创建          ✅ evidence-mgmt   ✅ 但跳过前层      根因1: 管线不完整
────────────────────────────────────────────────────────────────────
案件信息检索入口      ❌ 无技能定义       ❌ 无技能定义      根因4: 检索空白
CODEBUDDY.md分发     ✅ 模板完整         ❌ 工作区仅17行    根因5: 分发缺失
```

---

## 四、改进建议

### 建议 1：为 MCP 数据建立对等的三层管线

**目标：** 让 MCP 数据走与文档类证据对等的持久化路径。

**设计方案：**

```
data-query-mcp 返回 JSON
    │
    ▼
Layer 0 — 原始数据快照（raw）
    │   存为 raw/EV-NNN_<source>_raw.json
    │   内容 = MCP 返回的原始 JSON，不做任何转换
    │   元数据 = { mcp_server, tool_name, query_params, fetched_at, case_id }
    │   完整性 = SHA-256 哈希
    │
    ▼
Layer 1 — 分析消费（AI 基于持久化文件分析）
    │   AI 读取 raw JSON 文件 → 按 data-analysis 技能的 analysis_finding 范式分析
    │   产出 = analysis_finding YAML（provenance.data_ref → raw JSON 文件路径）
    │
    ▼
Layer 2 — 证据节点（nodes/EV-NNN.md）
    │   evidence-management 技能创建 EV 节点
    │   frontmatter 中 raw_file_path → Layer 0 文件
    │   body 中引用 Layer 1 的 analysis_finding
```

**原始数据快照文件格式：**

```json
{
  "snapshot_id": "SNAP-EV-002-20260723",
  "case_id": "INV-202606-01",
  "evidence_id": "EV-002",
  "source": {
    "type": "mcp",
    "server": "data-query-mcp",
    "tool": "query_employee",
    "query_params": { "emp_code": "<EMP_CODE>", "query_type": "expense_detail" }
  },
  "fetched_at": "2026-07-23T16:05:00+08:00",
  "fetched_by": "investigator",
  "data": [
    // MCP 返回的原始 JSON 数组，原封不动
  ],
  "record_count": 66,
  "integrity": {
    "hash": "<SHA-256 of data field>",
    "algorithm": "sha-256"
  }
}
```

**存放位置：** `raw/` 目录，与文档类原始文件并列。

**触发机制：** 由 AI 在调用 MCP 后自动触发，嵌入 `data-analysis` 技能的"数据驱动"入口。不需要用户指令。

```
data-analysis 技能 — 数据驱动模式（增强版）

原版：
  数据已在手 → 理解数据 → 确立目标 → 研判策略 → 执行分析 → 产出发现

增强版：
  MCP 返回数据
    → 【新增】持久化为 raw/EV-NNN_<source>_raw.json（含哈希+元数据）
    → 理解数据（基于持久化文件，非脑内）
    → 确立目标 → 研判策略 → 执行分析
    → 产出 analysis_finding（provenance.data_ref → raw JSON 文件路径）
```

**与插件原则的兼容性：**
- 不违反 `mcp-integration` 的松耦合原则——持久化是 `data-analysis` 的内部行为，MCP 仍只负责返回数据
- 对齐 `document-parsing` 的三层分离设计——MCP 数据获得与文档类证据对等的 raw→分析→EV 管线
- 落实 `evidence-collection-and-custody` 的保管五原则——电子证据镜像复制、哈希校验、metadata 保全

### 建议 2：强化 analysis_finding 的 data_ref

**目标：** 让 MCP 数据的分析发现可追溯到原始数据文件。

**修改方案：**

```yaml
analysis_finding:
  data_scope:
    source: 数据来源
    period: 时间范围
    record_count: 记录数
    data_refs: [PARSE-..., SNAP-...]    # ← 增强：支持 SNAP-ID 引用
  provenance:
    script_or_steps: |
      ...
    intermediate_artifacts: [            # ← 增强：填写中间产物路径
      "raw/EV-002_expense_raw.json",     # MCP 数据快照
      "raw/EV-002_expense_detail_<employee_name>.xlsx"  # Excel 归档
    ]
```

**变更点：**
- `data_refs` 支持新的 `SNAP-` 前缀（MCP 数据快照），与 `PARSE-` 前缀（文档解析产物）并列
- `intermediate_artifacts` 从空数组变为应填字段，记录从原始数据到分析结论之间的所有中间产物
- 不改变 `data_refs` 的弱引用性质——有则填，不阻塞分析流程

### 建议 3：扩展 evidence_registry 的 evidence_items 字段

**目标：** 让注册表能区分原始数据与衍生产物。

**修改方案：**

```json
{
  "evidence_id": "EV-002",
  "type": "analytical",
  "subtype": "expense_analysis",
  "source": "内部报销系统 (data-query-mcp)",
  "location": "raw/EV-002_expense_raw.json",           // ← Layer 0 原始数据
  "location_type": "mcp_snapshot",                      // ← 新增：标识数据来源类型
  "hash": "<SHA-256>",                                  // ← 电子证据哈希
  "derived_artifacts": [                                // ← 新增：衍生产物链
    "raw/EV-002_expense_detail_<employee_name>.xlsx",
    "02_PRE_INVESTIGATION/01_expense_analysis_<employee_name>.md"
  ],
  "related_entities": ["ENT-001"]
}
```

**变更点：**
- `location` 统一指向最原始的数据文件（MCP 快照 JSON 或用户提供的文档）
- 新增 `location_type`：枚举值 `file` / `mcp_snapshot` / `manual_entry`，标识数据来源类型
- 新增 `derived_artifacts[]`：记录从原始数据到最终分析结论之间的所有衍生产物
- `hash` 对 MCP 数据也必须填写（SHA-256 of data field）
- 废弃实践中自行添加的 `raw_file_path` 和 `raw_file_description`（被 `location` + `derived_artifacts` 取代）

### 建议 4：定义"案件信息检索入口"规则

**目标：** 让 AI 在面对案件相关问题时，有标准的信息检索路径，不做目录盲搜。

**设计方案：** 在 CODEBUDDY.md 的"技能加载策略"表中增加检索规则：

```
| 场景 | 执行的动作 |
|------|-----------|
| 检索案件已有信息 | 先读 evidence_registry.json 按字段搜索，不做目录遍历 |
| 查找特定证据详情 | evidence_registry.json → evidence_items[] → 按ID/关键字定位 → read nodes/EV-NNN.md |
| 查找特定实体的关联证据 | evidence_registry.json → 按 related_entities 过滤 |
| 查找假设置信度 | evidence_registry.json → hypotheses[] |
| 查找非正式观察记录 | case_memory/INDEX.md |
| 查找案件整体状态 | README.md |
| 追溯证据推理链 | nodes/EV-NNN.md → frontmatter relations → scan-chain.js --trace |
```

**核心原则：先查索引，再读文件。永远不做无目标的目录遍历。**

**仅在以下情况才做 `list_dir`：**
1. 新案件第一次接触——需要确认目录结构
2. 索引文件本身缺失——evidence_registry.json 不存在或损坏
3. 搜索不在索引覆盖范围内的文件——如临时脚本、配置文件

**放置位置：** CODEBUDDY.md → "1.4 技能加载策略"表，作为新行追加。

### 建议 5：恢复并增强工作区 CODEBUDDY.md

**目标：** 将模板的完整内容分发到工作区，并追加本次分析得出的两条新规则。

**操作步骤：**

1. 用 `project-templates/default/CODEBUDDY.md` 的完整内容（405行）覆盖工作区的 17 行版本
2. 在"1.4 技能加载策略"表中追加：
   - "检索案件已有信息" → "先读 evidence_registry.json 按字段搜索"
   - "MCP 返回数据后" → "先存为 raw/EV-NNN_<source>_raw.json（含哈希+元数据），再基于文件分析"
3. 在"三、举报处理特殊规则"或新增"九、数据处理规则"章节中，明确 MCP 数据的持久化要求

**同时更新插件模板：** 将上述两条规则写入 `project-templates/default/CODEBUDDY.md`，使所有新安装的插件都能分发到用户项目。

### 建议 6：将保管链原则绑定到 data-analysis 执行流程

**目标：** 让保管链原则从"参考文档"变为"执行检查点"。

**修改方案：**

在 `data-analysis` 技能的"数据驱动"模式中，增加数据保全检查步骤：

```
data-analysis 技能 — 数据驱动模式（增强版）

MCP 返回数据
  → 【新增】数据保全检查：
    ├── 数据是否已持久化为文件？ → 否 → 自动存为 raw/EV-NNN_<source>_raw.json
    ├── 是否计算了哈希？ → 否 → 计算 SHA-256 并写入快照文件
    └── 是否记录了元数据？ → 否 → 记录 mcp_server/tool/params/fetched_at
  → 理解数据（基于持久化文件）
  → 确立目标 → 研判策略 → 执行分析
  → 产出 analysis_finding（data_ref → raw JSON 文件路径）
```

**不新增技能**——而是在 `data-analysis` 现有的"数据驱动"入口中增加一个前置检查步骤，引用 `evidence-collection-and-custody` 的保管五原则。

---

## 五、实施优先级

| 优先级 | 建议 | 实施位置 | 影响范围 | 复杂度 |
|:------:|------|---------|---------|:-----:|
| P0 | 恢复工作区 CODEBUDDY.md 完整内容 | 工作区 CODEBUDDY.md | 当前案件 | 低 |
| P0 | 追加检索规则和 MCP 持久化规则 | 工作区 CODEBUDDY.md + 模板 | 当前案件 + 新案件 | 低 |
| P1 | 为 EV-002 补救：存原始 JSON 快照 | cases/CASE-2026-001/raw/ | 当前案件 | 低 |
| P1 | 定义 MCP 数据快照文件格式 | data-analysis SKILL.md | 全局 | 中 |
| P2 | 扩展 evidence_registry 字段 | evidence-registry-spec.md + schema | 全局 | 中 |
| P2 | 强化 analysis_finding 的 data_ref | data-analysis SKILL.md | 全局 | 低 |
| P3 | 将保管链原则绑定到执行流程 | data-analysis SKILL.md | 全局 | 中 |

---

## 六、预期效果

### 改进前 vs 改进后对比

| 场景 | 改进前 | 改进后 | 改善 |
|------|--------|--------|------|
| 检索案件信息 | 7步目录遍历 | 2步索引查询 | **-71%** |
| MCP数据导出Excel | 13步（含4步补救） | 5步（存JSON→写脚本→执行→更新registry→更新node） | **-62%** |
| MCP数据可审计性 | ❌ 无原始文件 | ✅ raw JSON + 哈希 + 元数据 | 从无到有 |
| 保管链合规 | ❌ 未执行 | ✅ 镜像复制+哈希校验+metadata | 从无到有 |
| AI操作指导 | ❌ 17行简版 | ✅ 405行完整版+2条新规则 | 从无到有 |

---

## 附录：相关文件索引

| 文件 | 位置 | 相关性 |
|------|------|--------|
| `project-templates/default/CODEBUDDY.md` | 插件仓库 | 模板（405行完整版） |
| `skills/data-analysis/SKILL.md` | 插件仓库 | 需增加 MCP 持久化步骤 |
| `skills/evidence-management/references/evidence-registry-spec.md` | 插件仓库 | 需扩展字段定义 |
| `skills/evidence-management/references/evidence-collection-and-custody.md` | 插件仓库 | 保管链原则（需绑定到执行流程） |
| `skills/document-parsing/SKILL.md` | 插件仓库 | 三层分离设计的参考模板 |
| `skills/mcp-integration/SKILL.md` | 插件仓库 | 松耦合原则（不需修改） |
| `skills/cold-start/SKILL.md` | 插件仓库 | Phase 4.4 分发机制 |
| 工作区 `CODEBUDDY.md` | 工作区根目录 | 需恢复完整内容 |
| `cases/CASE-2026-001/evidence_registry.json` | 案件目录 | 需补充 raw_file_path 指向 JSON 快照 |
| `cases/CASE-2026-001/scripts/export_expense_detail.py` | 案件目录 | 当前硬编码脚本（待重构为数据分离版） |
