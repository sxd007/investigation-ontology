# 制度解构导览规范

## 1. 目的与边界

制度解构导览面向制度归口部门、流程负责人、内控人员和普通业务审阅者。它解决的不是“再生成一份摘要”，而是让用户独立回答：

- 哪段原文支持了这条规则或这个流程元素？
- 为什么它被判为 L1、L2、L3、L4 或 L5？
- 一份制度中识别出了哪些独立 L3 流程？
- 流程之间通过什么 Artifact 交接？
- 谁执行、谁负责、谁被征询或知会？
- 哪些内容来自制度明文，哪些是结构推断或分析判断？
- 哪些结论仍需人工确认？
- 准备进入本体候选层的 proposal、参数和流转是否与 digest 一致？

导览是 `digest.json + normalized.parsed.json + candidates.json` 的派生视图，不修改、不确认、不拒绝任何候选，也不是入库真相源。

## 2. 输入与输出

**输入：** Policy Digest 0.2.0 包中的 `digest.json`、parsed schema 0.1.0 `normalized.parsed.json` 和 candidates schema 0.3.0 `candidates.json`。<br>
**输出：** 同目录下的 `explanation.html`，或 `--output` 指定的单文件 HTML。<br>
**前置门禁：** 应先运行 Policy Digest 确定性校验；存在锚点错误时不得用界面掩盖缺陷。

```text
node skills/policy-digest/scripts/generate-policy-digest-explanation.mjs <package-directory> [--output <path>]
```

重复运行必须只由当前输入决定，不读取网络、不依赖浏览器插件、不向输入 JSON 回写状态。

## 3. 信息架构

### 3.1 怎么读

提供成果状态、原文块、规则、流程元素、L3、Artifact、角色、风险、控制和问题数量，并用自然语言解释六步解构法：锚定原文、识别规则、划分流程、递归分层、识别交接、绑定治理。

### 3.2 流程分层

按 `parent_ref` 展开 L1–L5 树。每个节点显示：

- 名称、ID、层级和 RDF 类型；
- `decomposition_basis` 与 `hierarchy_status`；
- 五维 `hierarchy_confidence`；
- 来源锚点及 parsed 原文块；
- 如有，备选层级和人工审核状态。

界面不得把文档目录渲染成流程父子树，除非 digest 已将其确认为流程层级。

### 3.3 流程提炼

以每个 L3 为审阅单元，展示目标、入口/出口、L4/L5、流程内边和 Artifact。跨 L3 只展示 `produced_by`/`consumed_by` 交接，不绘制虚构的跨流程先后关系。

### 3.4 角色职责

按 `element_ref` 展示 RACI。每一项 assignment 都是可点击记录，不能只给整张矩阵一个来源。界面解释 R/A/C/I/S 的含义，但不得替制度补全缺失角色。

### 3.5 规则与风控

分别展示规则、流程目标、风险、控制和问题：

- 规则显示其 `operationalized_by` 落点；
- 风险与控制显示 `assertion_basis`；
- 问题显示 blocking 和风险等级；
- 分析判断不得使用与制度明文相同的视觉标签。

### 3.6 本体投影

按 candidate 展示：

- `candidateId`、`disposition`、`confidence`、`coreVersion`、`reviewPool` 和审核状态；
- `produces[]` 中的 localId、rdfType、标签和临时 `efio:*` 属性；
- parameter、transition 和 alignment 数量及结构；
- `PENDING_CORE_ALIGNMENT` 的醒目标识。

本页用于审阅交换层投影，不得把 candidate 状态解释为已经摄取或正式序列化。点击 candidate 必须回到它的 `sourceBlock`。

## 4. 原文对照

点击任一结构化记录后，右侧至少显示：

- `clause_ref`、`block_path`、`block_id` 和 `page_hint`；
- parsed 中对应 block 的完整文本，而不仅是 digest 的短 excerpt；
- `parseConfidence` 和 `needsVerification`；
- 记录类型、ID 和通用映射说明；
- 对流程元素，显示分层依据和置信度分解。

定位优先顺序为精确来源键 `doc_id + block_id + block_path`，回退可使用同一 `block_id`。不得用名称相似度自动替换来源。

## 5. 友好性与可访问性

- 默认使用中文业务语言，本体术语作为辅助标签。
- 桌面端双栏，窄屏自动单栏。
- 提供全局搜索、打印样式、清晰的选中态和明文/推断/待确认图例。
- 颜色不能成为唯一状态提示；状态同时显示文字。
- 无原文匹配时明确显示“没有匹配的原文块”，不得留白或伪造摘要。

## 6. 安全与隐私

- HTML、CSS、JavaScript 和数据全部内嵌，不请求外部资源。
- JSON 注入脚本上下文前转义 `<`、`>` 和 `&`；动态文本使用文本转义。
- 导览包含制度原文，沿用原成果包访问权限；不得默认发布到公共 URL。
- 页面不包含遥测、Cookie、远程字体或第三方图表库。

## 7. 验收标准

1. 文件可在断网浏览器中独立打开。
2. 六个视图均可使用：怎么读、流程分层、流程提炼、角色职责、规则与风控、本体投影。
3. 每类结构化记录可回到 parsed 原文块。
4. L3 数量、流程树、Artifact 和 RACI 与 digest 一致，candidate/proposal 数量与 candidates 一致。
5. 推断、未解析和 blocking 状态不被弱化或隐藏。
6. 输入中的 HTML/脚本片段不能突破嵌入数据边界。
7. 生成过程不改变 digest、parsed 或 candidates。
