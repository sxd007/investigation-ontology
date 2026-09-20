# process-efficiency 插件设计基准

> 状态：v0.1 基准（2026-09-20 讨论定稿）。后续变更须修订本文档并在提交说明中引用。
> 定位：ontology_framework 的**应用化插件**，与 investigation-ontology（调查应用化插件）并列，通过 vendored schema + `coreVersions` 声明对齐本体架构，运行时零依赖。

---

## 一、目标与场景

对流程的**目标、风险、控制点、效率**进行规范性评价与分析。与 investigation-ontology 的范式区分：

| 插件 | 范式 | 核心问题 |
|------|------|---------|
| investigation-ontology | 事后归因（调查） | 发生了什么、谁的责任 |
| **process-efficiency** | 规范性评价 | 流程设计得好不好、跑得好不好 |

### 两种使用场景（决定架构）

**场景一（首要）：专职流程效率优化工作。** 评价者需要有序管理并逐步推进，可能同时推进多个流程的效率优化评估 → 插件须具备**工作流管理能力**。

**场景二：其他工作场景的嵌入调用。** 如调查工作中需要调用本插件能力，并将分析结果**融入**调用方的工作产物 → 要求无痕融入，**不得**在调用方语境中创建冗余的工作流架构。

## 二、双模式架构：能力层 + 工作流层

```
┌─ 工作流层（场景一）───────────────────────────┐
│  process-assess-workflow                       │
│  多评价组合管理 / 生命周期 / 基线版本化           │
└──────────────────┬─────────────────────────────┘
                   │ 调用（提供输出根与上下文）
┌─ 能力层（场景二，可独立嵌入）──────────────────┐
│  policy-digest / goal-alignment /              │
│  rcm-analysis / control-testing /              │
│  efficiency-diagnosis                          │
└────────────────────────────────────────────────┘
```

### 根心契约：能力技能必须 root-agnostic（无根化）

所有能力层技能接受调用方指定的输出根，自身不感知生命周期、不创建工作流文件（meta/CHANGELOG 等）：

- **场景一**：`process-assess-workflow` 提供根 `process-assessments/{assessment_id}/...`
- **场景二**：调用方提供根——调查员传 `cases/{case_id}/...`，产物融入案件（不建任何冗余工作流结构）

**schema 0.3.0 泛化（`case_id`→`engagement_id` + 输出根可配置）是双模式架构的使能条件**，不是化妆式改名。已完成（见 Backlog）。

## 三、技能集

| 技能 | 层 | 职责 |
|------|----|------|
| `process-assess-workflow` | 工作流 | 评价组合管理、生命周期门禁、基线组装与版本化（原草案 process-baseline 独立技能**取消**——基线组装是工作流阶段，不是能力） |
| `policy-digest` | 能力·基座 | 制度/流程文档 → 流程知识包（digest.json/candidates.json），带原文锚点。已就位 |
| `goal-alignment` | 能力 | 目标清晰度（设计层）+ KPI 达成度（实例层） |
| `rcm-analysis` | 能力 | 风险-控制映射、覆盖度、控制设计有效性 |
| `control-testing` | 能力 | 穿行测试、抽样实例 vs 模板通路 |
| `efficiency-diagnosis` | 能力 | 路径冗余（设计层）+ 周期时间/返工/瓶颈（实例层） |

四个评价技能对应"目标、风险、控制点、效率"四个字。

## 四、管线与边界：policy-digest 的位置

**policy-digest 与评价技能的关系是上下游，不是交叉**，不解耦：

```
源文档 ──policy-digest──> 流程知识包 ──评价技能──> 评价结论
        「制度说了什么」               「说的够不够好/跑得怎么样」
```

### 产物归属边界判据

| 产物 | 归属 | 回答的问题 |
|------|------|-----------|
| digest 的 risks/controls 表 | policy-digest | 制度**明文记载**了哪些风险与控制（清单） |
| RCM 覆盖度/缺口/冗余 | rcm-analysis | 这份清单**好不好**（对照风险全集） |
| digest 的 issues 清单 | policy-digest | 文档**内在缺陷**（版本冲突、条款矛盾、锚点缺失） |
| 控制设计有效性判断 | rcm-analysis / control-testing | 制度设计的控制**是否充分/被执行** |

policy-digest 的"评价味"只到**文档质量**为止（其职责边界已声明"不判断实例执行是否偏离制度"）。

### 消费纪律（单一真相源）

**评价技能永远不回头读原文，只消费 digest.json / candidates.json**；锚点追溯通过 digest 的原文锚点间接实现。这保证单一真相源，也保证场景二的调用方拿到同一套可复核结论。

## 五、process-assess-workflow 与 case-management 的范式差异

| 维度 | case-management（调查） | process-assess-workflow（评价） |
|------|------------------------|-------------------------------|
| 关系姿态 | 对抗性（对象可能是舞弊者） | 协作性（流程 Owner 是伙伴） |
| 完整性抓手 | 证据可采性门禁、假设竞争 | 基线版本化 + 数据充分性 + 干系人确认 |
| 并发形态 | 一案一事 | **组合管理**：多流程评价并行、分波次推进 |
| 结论形态 | 事实认定（达证据标准） | 评级 + 缺口清单 + 改进建议（流程 Owner 认领） |
| 可追溯纪律 | 法律级证据链 | 审计级可复现（数据快照 + 哈希，轻量） |

### 生命周期（初稿）

```
SCOPE（圈定流程范围与指标）
  → BASELINE（组装基线：digest 引用 + 指标定义 + 系统数据快照）
  → ASSESS（调度四个评价技能）
  → REPORT（收敛评级与改进建议；可选 TRACK 跟踪整改）
```

评价物根目录：`process-assessments/`，不与调查 `cases/` 混用。

## 六、与 investigation-ontology 的协作

- 两插件可共存安装，无强依赖；调查案件内解构制度流程属**案件分支深化产物**，输出仍写 `cases/{case_id}/policy-digests/`；
- `document-parsing` 解析能力由调查插件优先承担（若已安装）；未安装时按 policy-digest SKILL.md 兜底路径由模型直读并建立等价锚点；
- 实施细节见 [../README.md](../README.md)。

## 七、Backlog

- [x] **policy-digest schema 0.3.0 泛化**（2026-09-20 完成）— `case_id`→`engagement_id`、输出根按语境约定（调查语境 `cases/{case_id}/policy-digests/`，评价语境 `process-assessments/{assessment_id}/policy-digests/`）；新增 0.2→0.3 机械迁移器；validator/projector/explanation 接受 0.2.0 与 0.3.0（0.2.0 读有效，入库前迁移）；scaffold `--engagement-id` 干净切换；fixture 已迁移 0.3.0。
- [ ] `process-assess-workflow` 技能实施（生命周期门禁、组合管理、基线版本化）
- [ ] 四个评价技能实施（goal-alignment / rcm-analysis / control-testing / efficiency-diagnosis）
- [ ] 本体投影：评价发现（控制缺口等）通过 candidates 机制投影回 proc 域（ControlPoint 标注等），与 policy-digest 的 `PENDING_CORE_ALIGNMENT` 模式一致
