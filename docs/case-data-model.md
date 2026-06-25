# 案件数据模型

本文件回答：**创建一个新案件时，需要初始化哪些数据文件？顺序是什么？去哪找精确的字段定义？**

> **本体层说明**：本模型描述的是**认知层**（cc-investigation skills）的数据结构。在此基础上，每个案件还需要同步维护**本体层**的实体和关系文件（`entities/`、`relations/`），通过 `ontology_ref` 字段与认知层节点关联。详见 `docs/ontology/design-overview.md`。

## 案件核心数据文件

每个案件包含 **4 个核心数据结构文件 + nodes/ 分析层目录**。创建顺序如下：

```
                    meta.json ✓        checklist.yaml ✓       evidence_registry.json ✓    CHANGELOG.json ✓    nodes/ ✓
                    ───────────────    ──────────────────     ─────────────────────────    ──────────────    ────────────
INIT                创建并填写必填字段   同时创建，全部填 false  创建基础结构                  创建，写入首条      创建初始 EV-001
                     (case_id/status/                          填写 metadata、              变更记录            节点（举报线索）
                      trigger_type/...)                        创建 chain_nodes 索引、      (case_created)    创建初始 ENT/HYP
                                                               提取 entities、                                   节点
                                                               登记举报线索为证据条目、
                                                               生成初始 hypotheses

PRE_INVESTIGATION   更新 status         更新 pre_investigation 追加 chain_nodes 条目        追加变更记录        追加 EV 节点
                                       -> completed             更新 entities                                   创建 LS 节点

FIELDWORK           更新 last_activity  更新 fieldwork         追加 chain_nodes 条目        追加变更记录        大量追加 EV 节点
                                                                                                              创建 ARG 节点

REVIEWING           更新 status         更新 reviewing         findings confidence 定型      追加变更记录        创建 FND 节点
                                           subject_intent_scored      更新 entities[].intent_                            冻结所有节点
                                           → true                     score / intent_level

CLOSED              更新 status         更新 closed            归档                         追加结案记录        归档
```

**核心原则**：evidence_registry.json 是结构化摘要和节点索引（chain_nodes）；nodes/ 目录承载分析推理层和关系图（relations 字段）。两者通过 ID 空间关联，关系仅声明在节点文件中。

---

## 文件 ① meta.json — 案件元数据

| 项目 | 说明 |
|------|------|
| **路径** | `cases/{case_id}/meta.json` |
| **用途** | 案件身份、状态、触发路径、调查目标、SLA |
| **精确 schema** | [`schemas/meta.schema.json`](../schemas/meta.schema.json) |
| **字段说明** | [`skills/case-management/SKILL.md`](../skills/case-management/SKILL.md) |

**创建时机**：INIT 阶段创建，仅需填写 `case_id`、`status`（INIT）、`trigger_type`、`created_at` 四个必填字段即可。

**必填字段示例**：
```json
{
  "case_id": "CASE-2026-001",
  "status": "INIT",
  "trigger_type": "whistleblowing",
  "created_at": "2026-06-13T10:00:00Z"
}
```

---

## 文件 ② checklist.yaml — 阶段门禁清单

| 项目 | 说明 |
|------|------|
| **路径** | `cases/{case_id}/checklist.yaml` |
| **用途** | 记录各阶段完成状态，门禁条件全部满足后才能推进下一阶段 |
| **精确 schema** | [`schemas/checklist.schema.json`](../schemas/checklist.schema.json) |
| **字段说明** | [`skills/case-management/SKILL.md`](../skills/case-management/SKILL.md) |

**创建时机**：与 meta.json 同时创建，所有字段初始值为 `false` 或 `null`。

---

## 文件 ③ evidence_registry.json — 证据注册表

| 项目 | 说明 |
|------|------|
| **路径** | `cases/{case_id}/evidence_registry.json` |
| **用途** | 节点索引（chain_nodes）、实体管理（entities）、证据条目注册（evidence_items）、事实认定摘要（findings）、假设追踪（hypotheses）、事件时间线（event_timeline）。**不含关系图**——关系由 nodes/ 目录中各节点文件声明。 |
| **精确 schema** | [`schemas/evidence-registry.schema.json`](../schemas/evidence-registry.schema.json) |
| **字段说明** | [`skills/evidence-management/SKILL.md`](../skills/evidence-management/SKILL.md) |

**创建时机**：INIT 阶段与 meta.json、checklist.yaml 同时创建。

---

## 文件 ④ CHANGELOG.json — 案件变更记录

| 项目 | 说明 |
|------|------|
| **路径** | `cases/{case_id}/CHANGELOG.json` |
| **用途** | 全生命周期变更留痕 |
| **精确 schema** | [`schemas/changelog.schema.json`](../schemas/changelog.schema.json) |

**创建时机**：INIT 阶段与其他核心文件同时创建。首条变更记录为 `case_created`。

**变更记录设计原则**：
1. 只记录"有人会回头查"的有意义变更
2. 不记录 AI 执行操作本身
3. 每条变更必须回答"什么变了"和"为什么变"
4. 读者的假设是"6 个月后接手案件的陌生人"

---

## 文件 ⑤ nodes/ 目录 — 分析推理层

| 项目 | 说明 |
|------|------|
| **路径** | `cases/{case_id}/nodes/` |
| **用途** | 承载证据链的推理分析：线索提炼（LS）、论据构建（ARG）、事实认定推理（FND）。关系图仅通过各节点文件的 `relations` 字段声明（derived_from/supports/contradicts 等类型）。 |
| **模板参考** | [`project-templates/default/nodes/`](../project-templates/default/nodes/) |
| **生命周期管理** | [`skills/evidence-management/SKILL.md`](../skills/evidence-management/SKILL.md) |
| **本体层绑定** | ENT 和 EV 节点必须包含 `ontology_ref` 字段指向 `entities/` 中的本体对象，详见 `/ontology` skill → `references/binding-protocol.md` |

**节点类型**：

| 前缀 | 类型 | 文件格式 | 说明 | 本体层映射 |
|------|------|----------|------|-----------|
| EV- | evidence | JSON/MD | 原始证据注册和详细分析 | 必须含 `ontology_ref` → `entities/evidence/` |
| LS- | clue | MD | 从原始证据中提炼的线索 | 不映射 |
| ARG- | argument | MD | 基于线索的论据构建 | 不映射 |
| FND- | finding | MD | 基于论据的事实认定 | 引用 `relations/` (仅 HARD) |
| ENT- | entity | JSON | 涉案实体详情 | 必须含 `ontology_ref` → `entities/{type}/` |
| HYP- | hypothesis | JSON | 假设详情 | 不映射 |
| EVT- | event | JSON | 事件时间线详情 | 不映射 |

**关键规则**：
- 节点类型由 frontmatter 中的 `type` 字段决定，不按类型分子目录
- 关系通过 `relations` 字段向上游声明（每种关系有独立语义类型），不维护反向引用
- `scan-chain.py` 可编译关系图、追溯链、检查完整性

---

## 领域扩展

各领域场景可在案件目录下增加自己的数据文件。扩展文件不纳入核心 schema，由各领域场景自行管理。

---

## 参考

- [案件管理 skill](../skills/case-management/SKILL.md) — meta.json + checklist.yaml 字段说明
- [证据管理 skill](../skills/evidence-management/SKILL.md) — evidence_registry.json + nodes/ 字段说明
- [变更记录 schema](../schemas/changelog.schema.json) — CHANGELOG.json 精确字段定义
