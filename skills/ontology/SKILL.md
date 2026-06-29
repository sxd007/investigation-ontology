---
name: ontology
description: >
  操作 global_ontology/entities/ 或 global_ontology/relations/ 目录、创建或修改本体对象 (Person/Organization/Account/Evidence/Case)、
  断言关系 (Relation: TRANSFERRED/HAS_ACCOUNT/WORKS_AT...)、或执行本体 Action
  (CLOSE_CASE/RESOLVE_ENTITY/SEAL_EVIDENCE/ASSERT_RELATION 等) 时，必须使用本技能。
  调查本体论定义"什么存在"的结构性方法论 — 覆盖 Object Types、Link Types、Action 治理规则、
  以及认知层与本体层的 Binding Protocol。
origin: efio
paths: global_ontology/entities/*, global_ontology/relations/*
---

# 调查本体论 (Investigation Ontology)

## What This Is

本体层定义了案件事实的**结构性骨架** — 什么实体存在、它们之间如何关联、什么操作可以改变它们的状态。

它与认知层（分析推理过程）**严格分离**：

```
本体层（Ontology）          认知层（Epistemic Layer）
─────────────────          ──────────────────────────
回答"什么存在"              回答"我们如何知道"
Object Types                LS → ARG → FND 推理链
Link Types                  竞争假设 HYP
Action 治理                  证据可采性评估
不可绕过的前置条件            案件工作流
```

> **架构来源**：基于 Palantir Ontology 三层架构 + investigation-ontology 证据链/案件管理方法论。详见 `design-phylosophy.md`。

## Core Concepts

### 1. Object Types: What Exists

| Type | ID 前缀 | 存储路径 | 说明 |
|------|--------|---------|------|
| Person | `P-` | `global_ontology/entities/person/` | 自然人 |
| Organization | `O-` | `global_ontology/entities/organization/` | 组织/机构 |
| Account | `acc-` | `global_ontology/entities/account/` | 金融账户 |
| Evidence | `ev-` | `global_ontology/entities/evidence/` | 证据载体 |
| Case | `CASE-YYYY-NNN` | `global_ontology/entities/case/` | 案件容器 |

完整 schema、状态机、约束见：
- [models/person.md](models/person.md)
- [models/organization.md](models/organization.md)
- [models/account.md](models/account.md)
- [models/evidence.md](models/evidence.md)
- [models/case.md](models/case.md)

### 2. Link Types: How Things Relate

| 分类 | 类型 | 语义 | 默认 Tier |
|------|------|------|----------|
| STRUCTURAL | HAS_ACCOUNT | 拥有账户 | HARD |
| STRUCTURAL | WORKS_AT | 任职 | HARD |
| STRUCTURAL | ROLE_AT | 控制/董监高 | HARD |
| BEHAVIORAL | TRANSFERRED | 资金转移 | HARD |
| BEHAVIORAL | APPROVED | 审批 | HARD |
| INTELLIGENCE | SHARED_ATTR | 共享属性 | SOFT |
| INTELLIGENCE | CIRCLE_LINK | 圈子关联 | SOFT |
| INTELLIGENCE | LEAD_MATCH | 线索匹配 | LEAD |

完整 schema、Tier 约束见 [models/relation.md](models/relation.md)。

### 3. Action Types: What Can Change

每个 Action 定义操作契约 — 前置条件（preconditions）编码治理规则，效果（effects）编码状态转换。

| 组 | Action | 人工阀门 |
|----|--------|---------|
| 认知流水线 | ACQUIRE_EVIDENCE, ADMIT_CANDIDATE, RESOLVE_ENTITY, ASSERT_RELATION | **需人** |
| 治理行为 | SEAL_EVIDENCE, SUPERSEDE_RELATION, MERGE_ENTITIES, DISPUTE_ENTITY, SEAL_ENTITY | **需人** |
| 案件生命周期 | OPEN_CASE, CLOSE_CASE, REOPEN_CASE | **需人** |

详细治理规则见 [references/action-governance.md](references/action-governance.md)。

各 Action 的逐条校验清单见 `references/actions/`。

## Five Core Principles

| # | 原则 | 含义 |
|---|------|------|
| 1 | **Evidence-Centric** | 所有数据必须可追溯至原始证据 |
| 2 | **Epistemic Layering** | 严格区分 Hard Fact 与 Soft Signal |
| 3 | **Identity Resolution** | 一人一事一 Canonical ID |
| 4 | **Temporal Integrity** | valid_time（发生时间）+ observed_time（记录时间） |
| 5 | **Append-Only Evolution** | 不物理删除，只通过 superseded_by 作废 |

## Binding Protocol

认知层节点通过 `ontology_ref` 绑定本体对象：

```json
{
  "ontology_ref": {
    "object_id": "P-0001",
    "object_type": "Person",
    "lifecycle_status": "UNRESOLVED"
  }
}
```

关键约束：
- ENT/EV 节点必须包含 `ontology_ref`
- FND 节点只能引用 HARD Relation
- LS/ARG/HYP 不映射本体

详见 [references/binding-protocol.md](references/binding-protocol.md)。

## How Hooks Enforce This

Hooks 是治理规则的**编译后执行体**，Claude 无法绕过：

| Hook | 触发时机 | 作用 |
|------|---------|------|
| PreToolUse: validate-ontology-action.sh | Write/Edit global_ontology/entities/、global_ontology/relations/ 前 | 现场校验 precondition，不满足则 deny |
| PostToolUse: check-ontology-ref.sh | Write nodes/ENT-*.json、nodes/EV-*.json 后 | 检查 ontology_ref 有效性，缺失则警告 |

详见 `hooks/hooks.json` 和 `scripts/` 目录。

## Four-Layer Defense

```
Layer 1: Skill + CLAUDE.md   → 效率层，减少触发拒绝
Layer 2: JSON Schema + hook   → 格式校验（pre-commit）
Layer 3: PreToolUse Hook      → 代码闸门 ★ 核心防线
Layer 4: audit-binding.sh     → 定期巡检，最终兜底
```

## Modeling Guide

创建/修改本体对象的最佳实践，包括：
- 创建决策树（何时新建 vs 引用已有）
- Evidence Tier 分配指南
- 6 个常见反模式及正确做法
- 建模自检清单

详见 [references/modeling-guide.md](references/modeling-guide.md)。

## Additional Resources

| 资源 | 说明 |
|------|------|
| `models/` | 6 个 Object/Link 类型的完整 schema、状态机、约束 |
| `references/action-governance.md` | Action 分类、前置条件、Hook 覆盖 |
| `references/binding-protocol.md` | 认知层↔本体层映射规范、ID 命名空间 |
| `references/modeling-guide.md` | 建模最佳实践、反模式、检查清单 |
| `references/actions/` | 各 Action 的逐条校验清单（11 个 .md） |
| `hooks/hooks.json` | PreToolUse/PostToolUse Hook 配置 |
| `scripts/validate-ontology-action.sh` | PreToolUse 校验脚本 |
| `scripts/check-ontology-ref.sh` | PostToolUse 检查脚本 |
| `design-phylosophy.md` | 完整设计哲学文档（架构级） |