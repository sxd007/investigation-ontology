# 建模最佳实践

> 本体建模的质量直接影响证据链的完整性和可呈堂性。以下指南基于五个核心原则，列出常见场景的正确做法和反模式。

## 原则速查

| # | 原则 | 一句话 |
|---|------|--------|
| 1 | Evidence-Centric | 无证据不建模 |
| 2 | Epistemic Layering | 硬事实与软信号分离 |
| 3 | Identity Resolution | 一人一事一 ID |
| 4 | Temporal Integrity | 双重时间（发生时间 + 记录时间） |
| 5 | Append-Only Evolution | 不删除，只替代 |

## 创建决策树

### 何时创建新 Entity vs 引用已有

```
需要建模一个实体 → 搜索 entities/ 下是否有匹配:
  ├── tax_id / id_card_hash / hr_code 匹配 → 引用已有（不要新建）
  ├── name 匹配但关键 ID 不同 → 检查是否是别名？→ 是，引用已有并追加 aliases
  ├── 无匹配 → 创建新 Entity（UNRESOLVED）
  └── 不确定 → ADMIT_CANDIDATE 创建 UNRESOLVED，等待 RESOLVE_ENTITY 裁决
```

### 何时创建新 Relation

```
需要建模一个关系 → 检查是否有证据支撑:
  ├── 有原始证据（银行流水/审批记录/合同）→ 创建 HARD Relation
  ├── 多源间接关联（同电话/同地址）→ 创建 SOFT Relation（confidence ≤ 0.7）
  ├── 单点弱信号（举报线索）→ 创建 LEAD Relation（仅供侦查方向）
  └── 无任何证据 → 不创建 Relation，记录在认知层 LS 节点
```

## Evidence Tier 分配指南

| 场景 | Tier | 理由 |
|------|------|------|
| 银行流水中明确的转账记录 | HARD | 原始证据直接证明 |
| OA 系统中的审批节点 | HARD | 系统记录可直接验证 |
| 两人使用同一电话号码 | SOFT | 关联存在，但不一定是同一人 |
| 两人在同一 IP 登录 | SOFT | 可能是共享网络/设备 |
| 举报人称"A 和 B 有关系" | LEAD | 未经核实的举报信息 |
| 外部名单命中 | LEAD | 外部情报，需进一步核实 |

## 常见反模式

### ❌ 反模式 1：未经 RESOLVE_ENTITY 直接创建 VERIFIED

```yaml
# 错误：直接设置 lifecycle_status: VERIFIED
meta:
  lifecycle_status: VERIFIED  # ❌ 跳过了 UNRESOLVED 阶段
```

**正确做法**：所有 Entity 初始创建为 UNRESOLVED，通过 `RESOLVE_ENTITY` Action 升级。

### ❌ 反模式 2：SOFT Relation 支撑 FND 结论

```yaml
# 认知层 FND-001.md 引用了一个 SOFT Relation
# ❌ FND 只能引用 HARD
```

**正确做法**：FND 节点只能引用 `evidence_tier=HARD` 的关系。SOFT/LEAD 只能在 LS（线索分析）节点中使用。

### ❌ 反模式 3：直接修改冻结证据

```yaml
# ❌ 直接修改 sealed=true 的证据的 integrity.sha256
```

**正确做法**：创建新 Evidence，在旧 Evidence 的关联 Relation 上设置 `superseded_by`。

### ❌ 反模式 4：删除旧 Relation

```yaml
# ❌ 直接删除 relations/R-001.yaml
```

**正确做法**：创建新 Relation（R-002），设置 `R-001.superseded_by = "R-002"`。

### ❌ 反模式 5：遗忘 ontology_ref

```json
// ❌ nodes/ENT-001.json 缺少 ontology_ref
{
  "type": "entity",
  "name": "张三"
  // 缺少 ontology_ref
}
```

**正确做法**：每个 ENT/EV 节点必须包含 `ontology_ref` 指向本体对象。PostToolUse Hook 会在写入后检查并警告。

### ❌ 反模式 6：混用调查阶段与本体状态

```
❌ "案件目前 VERIFIED"
❌ "该实体处于 REVIEWING 状态"
```

**正确做法**：分开标注。
```
✅ 当前调查阶段：REVIEWING ｜ 本体状态：3 个实体 VERIFIED，1 个 DISPUTED
```

## 建模检查清单

创建/修改本体对象前自问：

- [ ] 这个实体/关系有 `source_evidence_ref` 吗？（原则 1）
- [ ] 这是一个硬事实还是软信号？Tier 选对了吗？（原则 2）
- [ ] 有没有已存在的实体指向同一现实对象？（原则 3）
- [ ] `valid_time` 和 `observed_time` 都填了吗？（原则 4）
- [ ] 需要修改已有记录时，是用 `superseded_by` 而不是删除吗？（原则 5）