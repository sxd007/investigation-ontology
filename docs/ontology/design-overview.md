# Ontology 层设计概述

> 本文档概述 investigation-ontology 中集成本体层（Ontology Layer）的设计。
> 完整设计哲学参见 [investigation-ontology](https://github.com/your-org/investigation-ontology) 仓库的 `design-phylosophy.md`。

---

## 为什么需要本体层？

investigation-ontology 的认知层（`meta.json`、`evidence_registry.json`、`nodes/`）已经很好地解决了"如何推理"的问题。但缺少一个**可呈堂的事实骨架**——经过质证的高置信事实需要独立于推理过程存储，确保：

1. **证据中心**：所有实体和关系可追溯至原始证据
2. **状态不可绕过**：治理规则（如"结案时所有 Entity 必须 VERIFIED"）由 Action 前置条件强制执行
3. **图数据库就绪**：`entities/` + `relations/` 可直接投影为属性图，支持穿透查询

## 架构关系

```
认知层（investigation-ontology）          本体层（Ontology）
─────────────────────              ─────────────────
meta.json                          entities/case/*.yaml
evidence_registry.json             entities/evidence/*.yaml
nodes/ENT-*.json  ──ontology_ref──→ entities/person/*.yaml
nodes/EV-*.json   ──ontology_ref──→ entities/evidence/*.yaml
（无直接映射）                       entities/organization/*.yaml
（无直接映射）                       entities/account/*.yaml
（无直接映射）                       relations/*.yaml
```

## 分层防御

| 层 | 位置 | 作用 |
|---|---|---|
| Layer 1 | CLAUDE.md + AI prompt | 创建节点时自动写入 ontology_ref |
| Layer 2 | JSON Schema + pre-commit | 提交时校验 ontology_ref 必填 |
| Layer 3 | PreToolUse Hook + `scripts/validate-ontology-action.sh` | 写入 entities/、relations/ 时代码强制校验前置条件 |
| Layer 4 | `scripts/audit-binding.sh` | 定期巡检发现偏移 |

## 文件映射

| 本体层目录 | 对应的 Object Type | 说明 |
|---|---|---|
| `entities/person/` | Person | 自然人 |
| `entities/organization/` | Organization | 组织/机构 |
| `entities/account/` | Account | 金融账户 |
| `entities/evidence/` | Evidence | 证据载体 |
| `entities/case/` | Case | 案件容器 |
| `relations/` | Link Types | 实体间关系 |