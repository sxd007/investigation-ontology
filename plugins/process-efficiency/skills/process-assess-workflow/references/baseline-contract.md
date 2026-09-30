# 评价基线契约（Baseline Contract）

> 评价基线（`baselines/baseline-v{N}.json`）把「制度怎么说」（digest 引用）与「实际怎么跑」（指标定义 + 实例数据快照）固化为版本化快照，是评价结论可复现性与 finding 实例层锚点（`anchor.baseline`）的载体。本契约由 process-assess-workflow 拥有；JSON Schema 权威定义见 [schemas/assessment-baseline-0.1.0.schema.json](./schemas/assessment-baseline-0.1.0.schema.json)。

## 1. 定位与生命周期

```
draft（组装中，可 --refresh 重算哈希）
  │  validate-baseline.mjs 0 错误
  ▼
frozen（冻结，禁改；后续变更 → 新版本 v{N+1}）
```

- **Append-Only**：基线文件冻结后不得修改；制度修订、数据窗口变化、取数口径调整都通过创建 `baseline-v{N+1}` 承载，新版声明 `supersedes`，旧版回写 `superseded_by`（回写旧版的 `superseded_by` 是版本链维护的唯一例外，不构成内容变更）。
- **结论可追溯**：已发布的评价报告必须注明依据的 baseline 版本（REPORT 门禁 `baseline_referenced`）；finding 的 `anchor.baseline.version` 引用本契约的 `baseline_id`。

## 2. 结构要点

| 区段 | 内容 | 关键纪律 |
|------|------|---------|
| 头部 | `baseline_id` / `assessment_id` / `status` / `created_at` / `frozen_at` / `supersedes` / `superseded_by` | 文件名 = `{baseline_id}.json`；v{N>1} 必须声明 supersedes |
| `scope` | 目标流程（来自 meta.json）、`data_window`、波次 | 与 SCOPE 章程一致；数据窗口是快照取数的口径边界 |
| `digests` | 模板层引用：`doc_id` + `digest_ref`（相对评价根，POSIX 路径）+ schema 版本 + sha256 + stats | 哈希即冻结点——digest 任何变更都会使实测失配；被取代（superseded）的 digest 应改引新版本 |
| `metrics` | 指标定义：`metric_id` / `name` / `definition`（计算口径）/ `data_mapping`（source_system + field）/ 可选 `benchmark_ref`、`snapshot_ref` | 门禁 `metrics_defined` 的依据；`snapshot_ref` 必须指向 `snapshots[].path` 之一 |
| `snapshots` | 实例数据快照清单：`path`（相对评价根，POSIX）+ `source_system` + `acquired_at` + sha256 + 可选 `data_window` / `record_count` | finding 锚点 `anchor.baseline.snapshot_ref` 引用 `path`；`record_ref` 定位快照内记录（行号/记录 ID），不在本契约展开 |
| `data_gaps` | 无法获取的数据源归因：`reason_type` = `evaluator_gap`（评价方未取数）/ `provider_gap`（数据方无法提供）+ `impact` | 门禁 `data_snapshots_sealed` 的"已归因"依据；降级影响须写入报告限制 |

## 3. 与 finding-contract 的锚点对齐

```yaml
# findings.yaml 中的实例层锚点（finding-contract §1）
anchor:
  baseline:
    version: baseline-v1                      # = 本契约 baseline_id
    snapshot_ref: snapshots/oa-export.json    # = 本契约 snapshots[].path
    record_ref: "rec-04127"                   # 快照内记录定位（契约外，评价技能自定）
```

三值必须能在对应基线文件中解析：`version` 指向存在的基线版本，`snapshot_ref` 命中该版本 `snapshots[].path`。悬空锚点（指向基线外未快照数据）违反 finding-contract §2。

## 4. 工具链

```text
# 组装草稿（扫描 policy-digests/*/digest.json 与 snapshots/，版本号自动递增）
node skills/process-assess-workflow/scripts/scaffold-baseline.mjs process-assessments/PA-YYYY-NNN

# 快照/digest 变动后刷新草稿哈希（仅 draft；保留人工填写字段）
node skills/process-assess-workflow/scripts/scaffold-baseline.mjs process-assessments/PA-YYYY-NNN --refresh baselines/baseline-v1.json

# 冻结前校验（结构 + 文件存在性 + sha256 实测 + 冻结纪律 + 版本链）
node skills/process-assess-workflow/scripts/validate-baseline.mjs process-assessments/PA-YYYY-NNN/baselines/baseline-v1.json --strict
```

冻结操作本身由 AI/调查员执行：校验 0 错误后将 `status` 改为 `frozen` 并填 `frozen_at`，然后勾选门禁 `baseline_frozen`。

## 5. 与门禁的映射

| BASELINE 门禁 | 本契约的承载 |
|--------------|-------------|
| `digests_completed` | `digests[]` 全部 sha256 实测一致、无 blocking issue 未豁免、非 draft/superseded |
| `metrics_defined` | `metrics[]` 每项含 `definition` + `data_mapping` |
| `data_snapshots_sealed` | `snapshots[]` 全部含 sha256 + `acquired_at`；缺口在 `data_gaps[]` 归因 |
| `baseline_frozen` | `status=frozen` + `frozen_at` 已填 + validate-baseline 0 错误 |
