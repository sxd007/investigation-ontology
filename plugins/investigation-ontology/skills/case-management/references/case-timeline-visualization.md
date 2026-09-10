---
name: case-timeline-visualization
description: 案件时间线可视化指南 — 定义时间线可视化的目标、事件筛选标准、分类模型和生成流程。由 case-manager 在阶段转换或用户请求时引用，指导如何基于 evidence_registry.json 和 CHANGELOG.json 生成进度时间轴。
---

# 案件时间线可视化指南

时间线是**案件进度看板**，不是操作日志。它的目标是让调查员一眼看清：案件推进到哪了、关键里程碑是什么、卡在哪里、下一步是什么。

---

## 1. 定位与分工

时间线可视化**不追求面面俱到**,它只关注"推动案件进程的关键事件"：

| 产物 | 回答的问题 | 关注点 | 数据源 |
|------|-----------|--------|--------|
| **进度时间线**（本指南） | 案件推进到哪了？关键里程碑？卡在哪？ | 时间 + 进程 + 里程碑 | evidence_registry + CHANGELOG |


**核心原则**：时间线不重复证据链可视化的工作。假设是否被证实/证伪、证据之间的支撑关系——这些属于证据链可视化的范畴。时间线只关注"什么时候发生了什么有进程意义的事"。

注意：而**证据链可视化**（/efio:evidence visualization）用于可视化结论怎么被证据支撑的， 强调“证明逻辑 + 证据关系”，不由本技能触发生成；


---

## 2. 数据源

| 数据源 | 提供什么 | 在时间线中的角色 |
|--------|---------|-----------------|
| `evidence_registry.json → event_timeline` | 结构化事件（EVT-NNN） | 调查活动的时间锚点 |
| `evidence_registry.json → evidence_items` | 证据入库记录 | 证据获取事件 |
| `evidence_registry.json → entities` | 实体信息 | 背景事件（注册时间等，从 nodes/ 提取） |
| `CHANGELOG.json → entries` | 变更记录（CHG-NNN） | 阶段转换、门禁推进、阻塞、分析发现 |

### 合并逻辑

1. 从 `event_timeline` 收集结构化事件，按 `tags` 分配到对应调查阶段
2. 从 `CHANGELOG` 收集变更记录，按 `action` 类型判断是否值得上时间线
3. 从 `nodes/*.md` 提取实体工商注册时间作为背景事件
4. 所有事件按时间排序后统一处理阶段归属
5. `phase_transition` 类型的 CHANGELOG 事件作为阶段切换点——归入转换前的阶段，然后切换 `current_phase`

### 去重逻辑

同一天内 `event_timeline` 和 `CHANGELOG` 可能记录了同一事件（如 EVT-005 "报销记录分析完成" 和 CHG-009 "完成报销记录分析，发现'xx码头'关键线索"）。去重规则：

- 使用 2 字滑窗提取中文关键词，重叠 ≥4 个视为重复
- 保留信息更丰富的条目（通常是 CHANGELOG，因为 `detail` 字段更详细）
- **⚠️ 阻塞事件和 ✅ 里程碑事件不参与去重**，必须保留

---

## 3. 事件筛选与分类模型

> 本模型严格对齐 `changelog-rules.md` 定义的 **23 个 CHANGELOG action** 与 `schemas/changelog.schema.json` 的数据结构。时间线只收录**推动案件进程的关键事件**；纯记账、粒度过细、或已由其他视图（假设演进）覆盖的变更，不上主时间线。

### 3.1 五类事件标记

| 类型 | 标记 | 颜色 | 含义 | 数据来源 |
|------|------|------|------|---------|
| 🏁 里程碑 | `✅` | 绿 `#52c97a` | 阶段/边界/门禁/交付物的完成，定义案件"走到哪了" | CHANGELOG 阶段类 action |
| 📄 证据获取 | `📄` | 橙 `#e8a020` | 新证据入库（只记获取事实） | `evidence_registered` |
| 🔑 关键发现 | `🔑` | 紫 `#9b7ae8` | 改变调查方向的分析突破、假设生成/证实 | `hypothesis_*`、置信度上升 |
| ⚠️ 阻塞 | `⚠️` | 红 `#e85c5c` | 阻止或威胁进展的事项、回退、挂起、放弃 | `case_suspended/abandoned`、`phase_backtrack` |
| 📥 外部输入 | `📥` | 蓝 `#5a8aaa` | 外部主动提供的线索/材料 | `event_timeline` 中带 `external` 标签的事件 |

> **重要**：📥 外部输入在 CHANGELOG 中**没有对应 action**。它只来自 `evidence_registry.json → event_timeline` 里标记 `external` 的事件（如投诉、举报、外部联系）。不要试图从 CHANGELOG 找 📥。

### 3.2 分类责任：脚本确定性 vs AI 语义

每个 action 的分类责任分两级：

- **脚本确定性（自动）**：仅凭 `action` 字段即可判定"上/不上"和"类型"，无需读内容。脚本按 §3.3 的表查表处理，对应 `generate_timeline.py` 中复用/重建的 `ACTION_TYPE_MAP`。
- **AI 语义（手动补充）**：`action` 本身不能确定类型，需 AI 读取该条目的 `summary` / `detail` / `related_ids` 判断方向与性质。AI 拥有**最终分类裁量权**——即便某 action 落在"确定性"表中，AI 也可基于实际内容重新归类（例如把一次失败的 `case_resumed` 改标为 ⚠️）。

### 3.3 确定性筛选表（脚本实现）

脚本仅对下表 action 做自动处理；**未列出的 action 一律交由 AI 语义分类（§3.4）**，脚本不假设其类型、保留原始 `summary`。

| action | 上时间线？ | 类型 | 说明 |
|--------|-----------|------|------|
| `case_created` | ✅ | 🏁 | 案件创建 |
| `scope_defined` | ✅ | 🏁 | 调查范围划定（边界确立） |
| `phase_transition` | ✅ | 🏁 | 阶段推进（门禁全过） |
| `gate_all_passed` | ✅ | 🏁 | 当前阶段门禁全部通过 |
| `evidence_registered` | ✅ | 📄 | 新证据登记（只记获取事实） |
| `hypothesis_generated` | ✅ | 🔑 | 竞争假设写入（方向确立） |
| `report_drafted` | ✅ | 🏁 | 中期备忘录/报告初稿 |
| `report_completed` | ✅ | 🏁 | 正式报告终稿 |
| `document_generated` | ✅ | 🏁 | 其他重要产出文档 |
| `case_closed` | ✅ | 🏁 | 结案（终态里程碑） |
| `case_resumed` | ✅ | 🏁 | 案件恢复 |
| `case_suspended` | ✅ | ⚠️ | 案件挂起（进展受威胁） |
| `status_set` | ❌ | — | 初始化记账，与 `case_created` 重叠 |
| `gate_item_completed` | ❌ | — | 粒度过细，已被 `gate_all_passed`/`phase_transition` 覆盖 |
| `evidence_registry_initialized` | ❌ | — | 文件创建记账 |
| `hypothesis_confidence_updated` | ❌ | — | 由 §6 假设演进视图（Part 2）单独呈现，不入主时间线 |

> 脚本实现要点：用一张 `ACTION_TYPE_MAP` 查表（替代现有死代码 `CHANGELOG_ACTION_MARKERS`）对上表 action 直接赋值 marker；其余 action 标记为空、保留原文交 AI。去重保护改用 `marker` 字段判定（而非 `title` 文本），见 §2 去重逻辑。

### 3.4 AI 语义分类（AI 裁量，给予充分自由度）

以下 action **脚本不判定类型**，由 AI 读取条目数据后分类。AI 应综合以下字段判断：

- `summary`：一句话摘要，含事件性质关键词
- `detail`：为什么变、什么触发（常含方向信息，如"置信度 probable → confirmed"）
- `related_ids`：关联 ID（FND-NNN / HYP-NNN / EV-NNN / CHK-xxx），指示影响对象

| action | 默认归类 | AI 判断指引（非硬性规则，AI 可据实调整） |
|--------|---------|------------------------------------------|
| `phase_backtrack` | 🏁（回退里程碑） | 阶段回退通常因发现疑点；若 `summary`/`detail` 显示进展受挫或需补课，可升为 ⚠️ |
| `evidence_confidence_updated` | 🔑（上升时） | 读 `detail` 方向：`→ confirmed/probable` 上升归 🔑；`→ suspected` 下降归 ⚠️ 或中性 |
| `finding_confidence_updated` | 🔑（上升时） | 同上，针对 FND-NNN；下降且涉及"存疑"归 ⚠️ |
| `hypothesis_status_changed` | 🔑（confirmed） | `confirmed` 归 🔑；`rejected` 归 🏁（已排除，进程推进）或中性 |
| `supplement_evidence_triggered` | ⚠️ 或 🔑 | 因"疑似发现需补证"触发：强调缺口/阻塞归 ⚠️，强调新方向归 🔑 |
| `case_abandoned` | ⚠️ | 因"线索不成立"放弃归 ⚠️；纯行政性关闭可归 🏁 终态 |
| `other` | AI 判定 | 兜底 action，AI 读 `summary` 归入五类之一；无法归类时保留原文、不上类型标记 |

> **AI 自由裁量原则**：上述"默认归类"仅为起点。AI 拥有最终分类权，可基于条目真实语义跨类调整、合并或补注。时间线目标是"让人一眼看清进程"，凡 AI 判断有助于此的归类都应采纳。

### 3.5 合并与摘要（AI 责任）

- 同日、同 `related_ids`、语义重复的条目，AI 合并为一条更丰富的事件（参考 §6 增量补充）。
- 真实 schema 中实体与假设均不走独立 CHANGELOG action，脚本不做"逐条实体合并"逻辑（旧模型中的该设计前提不成立）。

---

## 4. 信息块内容要素

每个上时间线的事件信息块应包含以下要素：

| 要素 | 必填？ | 说明 | 数据来源 |
|------|--------|------|---------|
| **日期** | ✅ | `YYYY-MM-DD`，同日多事件只显示一次 | `moment` / `timestamp` |
| **标题** | ✅ | 简短描述（≤25 字符），不包含 ID 后缀 | `title` / `summary` |
| **类型标记** | ✅ | 🏁/📄/🔑/⚠️/📥 之一 | 由 `action` 推断 |
| **关联节点** | 可选 | EV-NNN / ENT-NNN / HYP-NNN | `related_ids` |
| **金额** | 条件 | 证据类事件如有金额则显示 | 从 `summary` 正则提取 |
| **阶段归属** | ✅ | 由 `phase_transition` 追踪的 `current_phase` | 自动推断 |

### 标题截短规则

Mermaid `timeline` 不支持文字换行，因此 MD 版需要截短。HTML 版可依赖 CSS `word-wrap`，但仍建议控制长度：

- 案件事件标题：≤25 字符
- 证据摘要：≤28 字符（含金额）
- 去掉 `(CHG-NNN)` / `(EVT-NNN)` 后缀

---

## 5. 可视化布局

### 横向时间轴（推荐）

- 一条独立的横向时间轴轨道，每个Phase 按顺序自左向右分布，分别用不同的主题色区分
- 事件点沿轴排列，信息卡上下交替分布（奇数索引在上，偶数在下）
- 同日多事件合并到一个信息卡， 形成项目列表， 多事件之间的背景用斑马纹或者其他的颜色进行区隔
- 圆点颜色区分类型：绿(里程碑) / 橙(证据) / 紫(发现) / 红(阻塞) / 蓝(外部)
- 横向可滚动，文字 CSS 自动换行

### 纵向列表（备用）

- 适合事件较多、需要完整展示的场景
- 左右交替或纯纵向排列
- 每个事件一个卡片，CSS 控制换行

### Phase 主题色

| Phase | 颜色 | 色值 |
|-------|------|------|
| 外部事件 | 蓝 | `#5a8aaa` |
| INIT | 青 | `#4ecdc4` |
| PRE_INVESTIGATION | 琥珀 | `#e8a020` |
| FIELDWORK | 紫 | `#9b7ae8` |
| REVIEWING | 绿 | `#7aaa5a` |
| CLOSED | 绿 | `#52c97a` |

---

## 6. 生成流程

### 自动生成

```bash
# 横向时间轴 HTML（推荐）
python scripts/generate_timeline_h_html.py <case_dir>

# 纵向列表 HTML
python scripts/generate_timeline_v_html.py <case_dir>

# Mermaid Markdown（备用，IDE 原生渲染）
python scripts/generate_timeline.py <case_dir>
```

输出文件：
- `case_timeline_h.html` — 横向时间轴（主用）
- `case_timeline.html` — 纵向列表（备用）
- `case_timeline_mermaid.md` — Mermaid 版（备用）

### 生成时机

| 时机 | 触发方式 | 说明 |
|------|---------|------|
| 阶段转换时 | 自动 | INIT→PRE, PRE→FIELDWORK 等转段后自动生成 |
| 用户请求时 | /efio:case timeline  | 按需生成 |
| 重要证据入库时 | 自动 | 新 EV 入库后增量更新 |

### AI 增量补充

脚本生成的是**结构化基线**。以下内容需要 AI 在基线上手动补充：

| 缺失内容 | 原因 | 补充方式 |
|---------|------|---------|
| 跨年度背景事件（如"2023~2025 项目运营期"） | 不在 registry 中 | AI 从节点 body 提取 |
| 语义 action 的类型分类 | `phase_backtrack` / `evidence_confidence_updated` / `finding_confidence_updated` / `hypothesis_status_changed` / `supplement_evidence_triggered` / `case_abandoned` / `other` 需读 `summary`/`detail`/`related_ids` 判断 | AI 按 §3.4 归入 🏁/🔑/⚠️，或保留原文不上类型标记 |
| 同日语义重复条目合并 | 脚本仅做关键词去重，不做语义合并 | AI 将同日、同 `related_ids` 的条目合并为一条更丰富的事件（见 §3.5） |

---

## 7. 与证据链可视化的协作

| 场景 | 用哪个可视化 | 原因 |
|------|------------|------|
| 汇报案件进度 | 进度时间线 | 一眼看清推进情况和里程碑 |
| 审查假设是否被证实 | 证据链 HTML（假设验证视图） | 展示支撑/反驳证据和覆盖率 |
| 检查证据完整性 | 证据链 HTML（治理视图） | 展示本体绑定和封存状态 |
| 识别调查阻塞 | 进度时间线 | ⚠️ 标记直观显示阻塞点 |
| 复盘调查过程 | 进度时间线 + CHANGELOG | 时间线看全局，CHANGELOG 看细节 |
| 评估证据充分性 | 证据链 HTML（问题清单视图） | 展示证据链缺口和治理问题 |

**原则**：时间线管"进程"，证据链管"证明"。两者互补，不互相替代。
 