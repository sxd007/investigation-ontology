# ten-rule-policy 回归 fixture

本目录保存完全脱敏、内容合成的 Policy Digest 0.2.0 回归包，用于在接近真实复杂度的规模下保护 projector、validator、Markdown 和 HTML 生成链路。

## 固定规模

- 10 条 rule
- 39 个流程元素
- 7 个流程目标
- 9 个 Artifact
- 17 条 flow edge
- 75 个 candidate，全部具有 `sourceBlock`
- 6 个指向 `*-OBLIGATION` 的规则参数
- 205 个 explanation record，ID 全部唯一
- 49 个 parsed block

## 文件

| 文件 | 用途 |
|---|---|
| `normalized.parsed.json` | 合成 parsed 文档与来源块 |
| `source-index.json` | 合成来源索引 |
| `digest.json` | Policy Digest 分析真相源 |
| `candidates.json` | seed 与确定性投影的 golden file |
| `digest.md` | 确定性 Markdown golden file |

`candidates.json` 和 `digest.md` 同时是规范包文件与期望输出，不另存重复的 `*.expected.*` 文件。

## 运行

从插件仓库根目录执行：

    node skills/policy-digest/scripts/test-ten-rule-policy-fixture.mjs

该测试还会故意破坏两个 rule 的 source block ID，确认 validator 只在对应位置报告两个 `anchor_block_missing`。

## 数据纪律

- 所有正文、主体、角色和来源均为合成占位内容。
- 不包含原始制度、案件标识、企业名称、真实人员、真实金额或真实文件哈希。
- 不提交脱敏映射、生成中间 seed 或可重新生成的 `explanation.html`。
