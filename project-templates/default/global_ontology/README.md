# global_ontology/ — 全局本体层

> **本目录在项目初始化时自动创建，无需手动维护目录结构。**

---

## 这个目录是什么？

`global_ontology/` 是本调查项目的**跨案件共享实体图谱**。

这里存储的是"现实世界中什么存在"的结构性骨架——人员、机构、账户、证据载体、案件容器，以及它们之间的关系。它与 `cases/<case_id>/` 下的认知层（推理过程、假设、工作底稿）**严格分离**。

---

## 为什么不放在 cases/<case_id>/ 下？

这是最常见的困惑点，值得解释清楚。

**核心原因：Identity Resolution（身份归一）原则。**

同一个人（张三，`P-0001`）可能在多个案件中出现——在 CASE-001 中是嫌疑人，在 CASE-002 中作为证人出现。如果把实体文件放在各自案件目录下，张三就会有两份副本，而这两份副本一旦出现分歧，就破坏了调查的基本可信度。

`global_ontology/` 保证：

| 能力 | 需要全局共享的原因 |
|------|-----------------|
| **一人一 ID** | P-0001 在任何案件中都是同一个对象，状态（UNRESOLVED→VERIFIED）全局生效 |
| **跨案件去重** | `MERGE_ENTITIES` 操作将两个疑似同一人的记录合并，必须全局可见 |
| **跨案件情报关联** | SHARED_ATTR / CIRCLE_LINK 关系可以连接来自不同案件的实体，发现重复作案模式 |
| **图数据库就绪** | `./entities/` + `./relations/` 可直接投影为属性图，无需跨目录拼接 |

**案件归属通过关系表达，而非目录结构：**
- `./entities/case/CASE-2026-001.yaml` 中的 `involved_entities` 字段列出本案涉及的所有实体
- 各实体/证据的 YAML 文件里有 `case_ref` 字段指向案件 ID

---

## 目录结构

```
global_ontology/
├── README.md                    ← 本文件
│
├── entities/                    ← Object Types（实体对象）
│   ├── person/                  P-XXXX.yaml   自然人
│   ├── organization/            O-XXXX.yaml   组织/机构
│   ├── account/                 acc-XXXX.yaml 金融账户
│   ├── evidence/                ev-XXXX.yaml  证据载体
│   └── case/                    CASE-YYYY-NNN.yaml 案件容器
│
└── relations/                   ← Link Types（实体间关系）
    └── R-XXXX.yaml              TRANSFERRED / HAS_ACCOUNT / WORKS_AT / ...
```

---

## 与认知层的分工

```
global_ontology/（本文件）            cases/<case_id>/（认知层）
────────────────────────            ─────────────────────────
回答"什么存在"                        回答"我们如何知道"
实体对象（Object Types）              EV→LS→ARG→FND 推理链
关系图（Link Types）                  竞争假设 HYP
Action 治理约束                       证据可采性 SPIRIT
跨案件共享                            单案件隔离
```

认知层节点（`nodes/ENT-*.json`、`nodes/EV-*.json`）通过 `ontology_ref` 字段绑定到本目录中的对应本体对象。

---

## 操作规范

- 在 `./entities/` 或 `./relations/` 下创建或修改文件前，必须加载 `/ontology` skill
- 每次操作对应一个明确的 Action（OPEN_CASE / ACQUIRE_EVIDENCE / ASSERT_RELATION / ...）
- 所有 Action 均需人工确认，Hooks 会在写入时自动校验前置条件
- 实体状态遵循追加式演进：UNRESOLVED → VERIFIED，不可物理删除，仅可通过 `superseded_by` 作废

详见 `skills/ontology/SKILL.md`。
