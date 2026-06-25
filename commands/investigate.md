---
description: 调查入口命令 — 新案立案、续案回顾、阶段导航、状态总览。所有调查工作的起点。
---

# /investigate

调查工作统一入口。无论新建案件还是继续已有案件，都从这里开始。

## Usage

```
/investigate new                             启动新案件
/investigate continue <case_id>              继续已有案件
/investigate status [case_id]                查看案件状态摘要
/investigate whereami                        查看当前阶段及下一步
/investigate list                            列出所有案件
```

---

## /investigate new — 新案件

**前置检查 — 项目级冷启动**：

执行案件创建前，先检查项目根目录是否已就绪：

```
检查: 项目根目录是否存在 CLAUDE.md？
  ├── 有 → 跳过，读取其中的项目规则和阶段定义
  └── 无 → 从插件模板部署:
      1. 复制 project-templates/default/CLAUDE.md 到项目根目录
      2. 复制 project-templates/default/.mcp.json 到项目根目录（自动加载 PDF 分析等连接器）
      3. 告知用户 "项目环境已就绪 — 已创建项目级 CLAUDE.md"
      4. 确保 templates/ 和 cases/ 目录存在
```

> 项目级 CLAUDE.md 是 AI 在办案时的操作手册（生命周期、举报规则、文件规范、质量标准）。插件提供通用能力，CLAUDE.md 告诉 AI 在这个项目里怎么用这些能力。

**流程**：

1. **收集初始信息**
   - 引导用户提供：线索来源、涉及人员/公司、行为描述、涉及金额（如有）
   - 如信息不足，主动追问，不自行猜测

2. **创建案件档案**
   - 创建 `cases/{case_id}/` 目录
   - 创建 `cases/{case_id}/nodes/` 目录（分析推理层）
   - 创建 `cases/{case_id}/raw/` 目录（原始证据文件存放）
   - 生成 `meta.json`（填写必填字段：case_id, status=INIT, trigger_type, created_at）
   - 生成 `checklist.yaml`（全部门禁初始化为 false）
   - 生成 `evidence_registry.json`（含初始 `chain_nodes` 索引、metadata）
   - 生成 `CHANGELOG.json`（首条变更记录 case_created）
   - 告知用户案件编号

3. **进入 INIT 阶段引导**
   - 展示当前 INIT 门禁清单（6 项）
   - 引导用户逐项完成：
     ```
     当前 INIT 阶段，需要完成以下 6 项才能进入外围调查：

     □ case_opened               — 立案决策（等你完成线索分析后确认）
     □ objectives_defined        — 调查目标设定
     □ key_entities_verified     — 关键实体初步核验
     □ information_gaps_documented — 信息缺口记录
     □ case_nature_assessed      — 案件性质判断
     □ investigation_plan_drafted — 初步调查计划

     建议从分析举报线索开始：先告诉我你掌握的信息，我们一起拆解。
     ```

4. **线索讨论模式**
   - 收到线索后，主动分析：
     - 提取关键实体（人员、公司、项目）
     - 匹配可能的舞弊类型（参见 fraud-classification 技能）
     - 识别信息缺口并追问用户
     - 初步生成 2-3 个竞争假设
   - 完成后更新 `checklist.yaml` 对应门禁

5. **立案决策**
   - 汇总线索分析结论 → 建议 Go / No-Go
   - 用户确认后 → `case_opened = true`
   - 创建初始节点文件：`nodes/EV-001.md`（举报线索）、`nodes/ENT-001.json`（举报人实体）、`nodes/HYP-001.json`（初始假设）
   - 更新 `evidence_registry.json` 的 `chain_nodes`、`entities`、`evidence_items`、`hypotheses`
   - 提示：可以进入外围调查了（`/investigate status` 查看门禁进度）

---

## /investigate continue <case_id> — 继续案件

**流程**：

1. 读取 `cases/{case_id}/meta.json`、`checklist.yaml`、`evidence_registry.json`
2. 输出案件状态摘要：

```
━━ 案件 CASE-2026-001 ━━━━━━━━━━━━━━━━━━━━━━
状态: FIELDWORK（实地调查阶段）
创建: 2026-06-10 | 触发: 举报热线

已完成:
  ✅ 线索分析与立案（INIT） — 6/6 门禁通过
  ✅ 外围数据收集（PRE_INVESTIGATION） — 5/5 门禁通过

当前阶段 FIELDWORK:
  □ 证据收集率 65%（upload_ratio: 0.65）
  □ 访谈笔录审查 — 未完成
  □ 对抗行为评估 — 未完成

最近动态: 6月12日 完成代理商访谈（张三）

下一步建议:
  1. 建议安排终端客户 B 公司访谈 — 可用 /interview 准备提纲
  2. 访谈笔录完成后用 case-manager 更新门禁状态
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

3. 如有 `suspected` 的 finding 未解决，标注提醒

---

## /investigate status [case_id] — 状态总览

不带 case_id 时，列出所有案件及状态：

```
案件列表:
  CASE-2026-001  张三案          FIELDWORK   2026-06-10
  CASE-2026-002  李四案          INIT        2026-06-12
```

带 case_id 时，输出该案件的详细状态摘要。

---

## /investigate whereami — 当前导航

读取当前活跃案件（按 `last_activity` 最近者），输出：

```
当前位置: CASE-2026-001 / FIELDWORK 阶段

FIELDWORK 门禁进度: 2/5

下一步操作建议:
  1. [证据收集] 还有 3 份预期证据未获取，建议调取签收单
  2. [访谈] 安排终端客户访谈 — 运行 /interview 准备
  3. [门禁] 完成后运行 case-manager 更新状态
```

---

## /investigate list — 案件列表

列出 `cases/` 下所有案件，按 `last_activity` 排序。

---

## 相关命令

```
/case         案件管理命令（case-manager 门禁操作）
/interview    访谈策划与笔录分析
/evidence     证据注册表操作
/report       调查报告撰写
/fraud-type   舞弊类型识别
/analyze      数据分析与异常检测
```

## References

- `docs/user-journey.md` — 完整用户旅程地图
- `skills/case-management/SKILL.md` — 四阶段框架与门禁定义
- `skills/investigation-foundation/SKILL.md` — 方法论基础
- `agents/case-manager.md` — 门禁检查与状态变更
