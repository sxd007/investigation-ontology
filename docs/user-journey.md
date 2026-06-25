---
description: 用户从创建案件到结案的全流程引导地图——五个阶段、涉及组件、产出物、现状评估
---

# 调查全流程用户引导图

```
用户旅程                             架构映射                             状态
─────────────────────────────────────────────────────────────────────
                                   事前准备 → /cold-start-interview     � 已创建并衔接 /investigate
                                                                       
1. 启动案件                           → /investigate 入口命令            � 已实现 new/continue/status
   ├── 新案件：创建档案                 → cases/{case_id}/ + meta.json    🟢 数据结构就绪
   │   ├── agent 与调查员讨论线索       → 需要 agent 主动分析+追问       � /investigate new 线索讨论模式
   │   ├── 初步核实举报线索             → key_entities_verified 门禁     🟢 门禁已定义，流程未串
   │   ├── 联系举报人扩充线索           → 举报人接触（静默边界例外）      🔴 无具体引导
   │   └── 形成立案判断                 → case_opened 门禁               🟢 门禁已定义
   │                                                                    
   └── 继续案件：回顾状态               → 读取 meta+checklist+evidence   � /investigate continue
                                       → 输出状态摘要                     🟢 /investigate continue

2. INIT 阶段                           → 初始评估 + 立案                🟢 阶段已定义
   ├── 分析讨论举报线索                 → 假设生成（假设类型体系）        🟢 foundation 已定义
   ├── 举报人沟通与线索扩充             → 信息缺口分类记录               🟢 门禁已定义
   └── 立案决策                         → case_opened 门禁检查           🟢 case-manager 可做
                                                                       
3. PRE_INVESTIGATION 阶段               → 静默情报收集                   🟢 阶段已定义
   ├── 发起数据收集                     → data-analyzer 参与             🟡 agent 骨架，缺实质内容
   ├── 数据分析与异常检测               → 数据分析方法论                 🟢 data-analysis 技能就绪
   ├── 整理分析结果                     → evidence_registry 登记         🟢 schema 就绪，流程未串
   ├── 形成事实总结                     → intelligence_summary.md         🟢 产出已定义
   ├── 形成假设清单                     → 假设类型体系应用               🟢 foundation 就绪
   └── 穷尽数据后进入实地调查           → 门禁检查 → FIELDWORK           🟢 case-manager 可做
                                                                       
4. FIELDWORK 阶段                      → 接触取证                       🟢 阶段已定义
   ├── 调取资料（当事人/企业提供）       → documentary 证据收集           🟢 evidence-registry 就绪
   ├── 开展访谈                         → interview-analyzer              🟡 agent 骨架，缺实质内容
   │   └── 按角色问问题                 → interview_question_bank.md      🟢 fraud-channel 已提供
   ├── 电子取证分析                     → digital_forensics              🔴 无具体方法引导
   ├── 进一步推进调查                   → 迭代假设验证                    🟢 foundation 分析工作流
   └── 形成阶段性报告                  → pre_investigation_brief.md      🟢 产出已定义
                                                                       
5. REVIEWING → CLOSED                  → 收敛定性 + 结案                🟢 阶段已定义
   ├── 撰写调查报告                     → report-writer                   🟡 agent 骨架，缺实质内容
   ├── 可视化汇报材料                   → 报告可视化                      🔴 无具体引导
   └── 证据归档                         → evidence_registry 冻结         🟢 schema 就绪

状态图例: 🟢 已就绪  🟡 有骨架需补内容  🔴 缺失
```

---

## 当前就绪度盘点

### 🟢 已就绪（不用动）

| 组件 | 说明 |
|------|------|
| `schemas/meta.schema.json` | 案件元数据 schema |
| `schemas/checklist.schema.json` | 阶段门禁 schema |
| `schemas/evidence-registry.schema.json` | 证据注册表 schema |
| `skills/case-management/SKILL.md` | 四阶段定义 + 门禁 + 数据结构说明 |
| `skills/investigation-foundation/SKILL.md` | 假设类型体系 + 分析工作流 + 6 条调查原则 |
| `skills/data-analysis/SKILL.md` | 数据分析方法论 |
| `skills/evidence-management/SKILL.md` | 证据全生命周期管理 |
| `skills/fraud-channel/SKILL.md` | 渠道舞弊模式 + 信号 + 切入点 |
| `skills/interview-analysis/SKILL.md` | 访谈方法论 + SCAN |
| `skills/writing-reporting/SKILL.md` | 报告结构 + 写作技巧 |
| `agents/case-manager.md` | 门禁检查 + 状态变更 + 决策日志（需扩展导航功能） |
| `rules/investigation-ethics.md` | 含职业怀疑准则 |

### 🟡 有骨架需补内容

| 组件 | 缺口 |
|------|------|
| `agents/investigation-planner.md` | Process 太简略（6 步），需扩展为 15+ 步可操作流程 |
| `agents/evidence-analyzer.md` | 同样太简略 |
| `agents/interview-analyzer.md` | 同样太简略 |
| `agents/data-analyzer.md` | 同样太简略 |
| `agents/report-writer.md` | 同样太简略 |
| `agents/fraud-type-classifier.md` | 同样太简略 |
| ~~`/cold-start-interview` 命令~~ | ✅ 已解决 — "完成后"节指向 `/investigate new`；并新增角色画像选择（读取 install-profiles.json） |

### 🔴 缺失

| 缺口 | 影响 |
|------|------|
| ~~`/investigate` 入口命令~~ | ✅ 已实现 — commands/investigate.md 提供 new/continue/status |
| ~~Agent 主动分析/追问能力~~ | ✅ 已实现 — /investigate new 的"线索讨论模式"主动分析+追问 |
| ~~继续案件（状态回顾）~~ | ✅ 已实现 — /investigate continue 读取档案输出状态摘要 |
| 举报人沟通引导 | 静默边界例外场景（举报人可接触），无具体操作指引 |
| 举报人沟通引导 | 静默边界例外场景（举报人可接触），无具体操作指引 |
| 阶段间导航 | 每个阶段完成后，用户不知道下一步该调用哪个 agent |
| Agent 间协作机制 | 🟡 已解决 — HITL 交付确认模式：每个 agent 末尾按 展示→讨论→确认→写入→建议 交付，调查员确认后才写入并建议下一步 agent |
| 电子取证方法引导 | FIELDWORK 阶段缺数字取证的具体操作指引 |
| 可视化汇报引导 | CLOSED 阶段缺报告可视化建议 |

---

## 缺失优先级的建议

按用户旅程的顺序，优先补**阻塞用户前进的**：

### P0 — 用户走不通的（✅ 已全部实现）

1. ✅ **`/investigate` 入口命令** — commands/investigate.md 提供 new/continue/status 三个子命令
2. ✅ **Agent 主动分析能力** — /investigate new 定义"线索讨论模式"，主动提取实体、匹配舅弊类型、识别缺口并追问
3. ✅ **继续案件状态回顾** — /investigate continue 读取 meta+checklist+evidence 输出状态摘要

### P1 — 用户能走但体验差

4. **阶段间导航** — 每个阶段完成时，case-manager 告诉用户下一步该做什么、该用哪个 agent
5. **Agent Process 补全** — 7 个 agent 的 process 从 5 步扩展到可操作流程
6. **冷启动 → 案件创建 的衔接** — `/cold-start-interview` 完成后指向 `/investigate`

### P2 — 特定场景优化

7. 举报人沟通引导
8. 电子取证方法引导
9. 可视化汇报引导
10. Agent 间自动编排

---

## 下一步建议

P0（用户走不通的）三个缺口已全部实现（`/investigate` 命令）。剩余工作集中在 P1/P2 体验优化：

1. **阶段间导航** — 每阶段完成时由 case-manager 提示下一步该用哪个 agent
2. **Agent Process 补全** — 扩展 7 个 agent 的 process 到可操作粒度
3. **电子取证 / 可视化汇报引导** — 补充 FIELDWORK/CLOSED 阶段的具体操作指引
