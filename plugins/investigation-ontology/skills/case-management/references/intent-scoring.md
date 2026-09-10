---
name: intent-scoring
description: 涉案人员意图评分参考框架 — 评分公式、证据分类权重、阈值区间、计算步骤。由 case-manager 在 REVIEWING 阶段调用，也供 report-writer 引用到报告结论章节。
---

# 涉案人员意图评分框架

## 用途

在 REVIEWING（收敛定性）阶段，对每名涉案人员（`entity_type: subject`）计算其主观意图评分，作为：

1. `checklist.reviewing.subject_intent_scored` 门禁的判断依据
2. 最终报告第 7 章（调查结论）中"主谋/合谋/存疑/被欺骗"定性的结构化支撑

**这不是替代调查员专业判断的自动工具**，而是确保评分一致性和可追溯性的参考框架。所有评分结果须经调查员确认。

## 评分公式

```
score(subject) = Σ weight(category)
                 for evidence_items
                 where subject.entity_id ∈ evidence_item.related_entities[]
                 and evidence_item.scoring_category is not null
                 and evidence_item.confidence ≠ "suspected"
```

**规则：**

- 每条证据的 `scoring_category` 对应一个固定权重，**可叠加**（一个 subject 的多条证据触发同一类别则累加）
- `confidence == "suspected"` 的证据不参与评分，避免以未定论证据做定性
- 评分结果写入 `entities[].intent_score`，阈值映射写入 `entities[].intent_level`

## 证据评分分类与权重

### 加重项（正向评分）

| 类别 | 编码 | 权重 | 典型触发场景 |
|------|------|------|-------------|
| **蓄意策划** | `deliberate_planning` | +30 | 提前设计交易结构、使用壳公司、借用他人账户、伪造文件或印章、系统性操作 |
| **隐瞒行为** | `concealment` | +25 | 销毁/删除证据、使用私人通讯工具办公、隐藏关联关系、以他人名义持股 |
| **利益获取** | `personal_gain` | +20 | 收取回扣或好处费、截留公司款项、利益输送至个人关联方、不当报销 |
| **虚假陈述** | `false_statement` | +20 | 访谈中提供可证实为假的信息、前后陈述矛盾、编造交易过程 |
| **拒绝配合** | `non_cooperation` | +15 | 拒绝访谈/提供材料、以虚假理由拖延、已离职或失联规避调查 |
| **知情不报** | `knowledge_withholding` | +10 | 明知他人舞弊未报告、为他人提供便利条件、审批环节知情未质疑 |
| **重复违规** | `repeated_violation` | +15 | 同一手法在多个项目/时间段出现、历史有类似违规记录 |

### 减轻项（负向评分）

| 类别 | 编码 | 权重 | 典型触发场景 |
|------|------|------|-------------|
| **过失疏忽** | `negligence` | -10 | 未尽审慎义务但不涉及故意、内控流程缺失导致被动违规、因业务压力非蓄意 |
| **主动补救** | `proactive_remediation` | -15 | 调查初期即主动坦白全部事实、退还全部不当利益、积极配合提供关键证据、指证主谋 |

### 归类原则

1. **就高不就低**：同一行为同时满足多个类别时，取权重最高的类别登记，不重复计分
2. **基于已定论证据**：评分仅基于 `confidence >= "probable"` 的证据，`suspected` 证据在补充取证后再评估
3. **抵减项需核实**：`proactive_remediation` 必须经独立验证（非本人声称），至少满足"主动坦白 + 退还不当利益 + 配合指证"中的两项

## 阈值与定性

| 评分区间 | 定性 | 含义 | 对流程的影响 |
|----------|------|------|-------------|
| > 80 | `mastermind` | **主谋**：策划并主导舞弊行为 | 建议最重处理措施 |
| 50–80 | `complicit` | **合谋**：参与并配合舞弊行为 | 区分主次责任 |
| 30–50 | `inconclusive` | **存疑**：现有证据不足以判断意图 | **触发 REVIEWING→FIELDWORK 回退**，补充取证后再评 |
| < 30 | `deceived` | **被欺骗**：非故意参与，或被他人利用 | 从轻或免责方向建议 |

### 存疑处置规则

- `inconclusive` 不直接允许结案 —— 必须触发回退 FIELDWORK 补充取证
- 补充取证后仍无法提升至 `complicit` 或 `deceived` 的，在报告中明确说明"证据不足以判断意图"并记录原因
- 调查报告不得使用"疑似主谋/疑似合谋"等模糊定性

## 计算步骤

### Step 1 — 确定评分对象

从 `evidence_registry.json.entities[]` 中筛选 `entity_type == "subject"` 的对象。对每个 subject 执行以下步骤。

### Step 2 — 扫描关联证据

遍历 `evidence_items[]`，筛选满足以下条件的条目：

- `related_entities[]` 包含该 subject 的 `entity_id`
- `scoring_category` 不为 `null`
- `confidence` 不为 `"suspected"`

### Step 3 — 汇总评分

```
score = 0
score_breakdown = []

for each matching evidence_item:
    category = evidence_item.scoring_category
    weight = scoring_weights[category]
    score += weight

    if category already in score_breakdown:
        score_breakdown[category].evidence_count += 1
        score_breakdown[category].subtotal += weight
    else:
        score_breakdown.append({category, weight, evidence_count: 1, subtotal: weight})
```

### Step 4 — 映射定性

根据阈值映射 `intent_level`：

```
if score > 80:           intent_level = "mastermind"
elif score >= 50:        intent_level = "complicit"
elif score >= 30:        intent_level = "inconclusive"  # 触发回退
else:                    intent_level = "deceived"
```

### Step 5 — 写入 evidence_registry.json

更新对应 subject 的实体记录：

```json
{
  "entity_id": "ENT-001",
  "intent_score": 65,
  "intent_level": "complicit",
  "score_breakdown": [
    { "category": "deliberate_planning", "weight": 30, "evidence_count": 1, "subtotal": 30 },
    { "category": "personal_gain", "weight": 20, "evidence_count": 2, "subtotal": 40 },
    { "category": "negligence", "weight": -10, "evidence_count": 1, "subtotal": -10 }
  ],
  "scored_at": "2026-06-15T10:00:00Z",
  "scored_by": "case-manager"
}
```

### Step 6 — 更新 checklist

```yaml
reviewing:
  subject_intent_scored: true
```

## 数据模型要求

本框架依赖以下字段：

### evidence_items[]（已有，需补充字段）

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `scoring_category` | `string` (enum) | 证据对应的评分分类 | **需新增** |
| `related_entities` | `string[]` | 关联实体 ID 列表 | 已有 |

### entities[]（已有，需补充字段）

| 字段 | 类型 | 说明 | 状态 |
|------|------|------|------|
| `intent_score` | `integer` | 意图评分总分 | **需新增** |
| `intent_level` | `string` (enum) | 意图定性 | **需新增** |
| `score_breakdown` | `object[]` | 各分类评分明细 | **需新增** |
| `scored_at` | `date-time` | 评分时间 | **需新增** |
| `scored_by` | `string` | 评分人/agent | **需新增** |

## 使用时机

| 时机 | 执行者 | 动作 |
|------|--------|------|
| FIELDWORK→REVIEWING 前 | evidence-analyzer | 确保 `evidence_items[].scoring_category` 已填写 |
| REVIEWING Step 1 | case-manager | 执行门禁检查，确认 `subject_intent_scored` 状态 |
| REVIEWING Step 3 | case-manager 或 report-writer | 按本框架计算评分，写入 evidence_registry |
| REVIEWING→CLOSED 前 | case-manager | 检查是否所有得分在 30–50 区间的 subject 已完成补充取证 |

## 与现有机制的关系

- `checklist.reviewing.suspected_findings_resolved` 对应**证据级置信度**检查
- `checklist.reviewing.subject_intent_scored` 对应**人员级意图评分**
- 两者独立：即使所有 finding `>= probable`，仍可能因证据不足判定 `inconclusive`
- 两者互锁：`inconclusive` 触发的回退与 `suspected_findings` 触发的回退走同一路径
