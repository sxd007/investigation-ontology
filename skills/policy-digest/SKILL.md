---
name: policy-digest
description: 企业制度与流程文件解构 — 当需要把制度、办法、细则及附件转化为可追溯的规则、流程、权责和风控候选，或独立生成原文对照式解构导览时使用。
origin: efio
---

# 企业制度流程解构

将篇章化制度转换为“结构化分析 JSON → 本体 candidates JSON → Markdown 六表一图”的可复核成果包。每条结论必须回到原文锚点；AI 只提出候选，不替代制度归口部门或人工审核者确认效力与语义。

## 激活条件

- 用户提供制度、管理办法、实施细则、操作规范、业务流程、授权文件或配套附件，要求解读、梳理或结构化。
- 需要提取规则、审批阈值、角色职责、端到端流程、例外路径、风险控制或证据要求。
- 需要生成可导入企业本体 candidates 层的候选记录。
- 需要比较多份关联制度的效力、版本、规则、权限或流程一致性。
- 需要为其他 Agent 提供稳定、带出处的制度知识包，而非普通摘要。

## 职责边界

- 本技能负责语义解构、候选建模、交叉检查和视图生成。
- 原始文件的文字、版面和表格解析优先交给 [document-parsing](../document-parsing/SKILL.md)；本技能必须复核其锚点与覆盖声明，不把 OCR 清晰度当成语义置信度。
- 不把摘要当作解构，不按章节机械摘录，不只还原正常审批链。
- 不直接写 Enterprise TTL，不让 AI 手写 Turtle；只生成待人审的 candidates。
- 不把推断出的“行业最佳实践”伪装成制度明文。明文要求、结构化转写、分析诊断必须分层保存。
- 不判断实例执行是否偏离制度；本技能描述的是流程模板层规范通路。

## 前置输入

执行前确认：

1. `case_root`：成果默认写入 `cases/{case_id}/policy-digests/`；找不到案件目录时先要求用户指定，不写仓库根目录。
2. 输入清单：正文、附件、表单、流程图、权限表及可用的发布/审批页。
3. 文档关系：上位依据、关联制度、替代/废止关系；未知时明确记为待确认。
4. 本体上下文：`tenant`、各目标域 `coreVersions`、candidates schema 版本。缺失时允许完成分析草稿，但禁止标记为“可入库”。
5. 分析范围：单文档或文档集；多文档时为每份文档分别生成 candidates，再生成集合级一致性报告。

禁止猜测缺失的文件编号、生效日期、审批主体、Core 版本、阈值或角色。未知值进入待确认清单。

## 标准成果包

每份文档写入：

```text
cases/{case_id}/policy-digests/{doc_id}/
├── normalized.parsed.json      # 兼容 parsed schema 0.1.0 的结构与锚点中间层
├── digest.json                 # 完整结构化分析，六表一图的单一真相源
├── candidates.json             # 严格 candidates schema 投影，供本体摄取
├── digest.md                   # digest.json 的人读视图
├── explanation.html            # 可独立打开的原文对照式解构导览
└── source-index.json           # 输入文件、哈希、解析版本与锚点覆盖索引
```

文档集另写入：

```text
cases/{case_id}/policy-digests/{set_id}/
├── document-set.json           # 成员、效力顺序与跨文档关系
└── consistency-report.md       # 冲突、重复、缺口及待裁决项
```

字段、表列、状态及映射要求见 [输出契约](./references/output-contract.md)。解构判断法见 [解构方法](./references/deconstruction-method.md)。

首次构建不要从空白手写六个文件。先运行脚手架生成一个结构校验为绿色、但明确带 blocking 占位项的起步包，再从 `normalized.parsed.json` 开始逐步替换：

```text
node skills/policy-digest/scripts/scaffold-policy-digest.mjs cases/{case_id}/policy-digests/{doc_id} --case-id {case_id} --doc-id {doc_id} --tenant {tenant}
```

Schema 只验证单文件形状；跨 parsed/digest/candidates/Markdown 的引用与投影纪律见 [校验契约速查](./references/validation-cheat-sheet.md)。

当前默认契约为 Policy Digest 0.2.0。复杂流程制度按 L1 ProcessCategory → L2 ProcessGroup → L3 Process → L4 ProcessActivity → L5 Task 分层；`process_elements[]` 是层级真相源，`flow_edges[]` 是顺序真相源，`artifacts[]` 是跨 L3 流程衔接的首选载体。父子层级暂以 candidates 中的 `efio:parentElement`、`efio:owningProcess`、`efio:hierarchyLevel` 和 `efio:mappingStatus: PENDING_CORE_ALIGNMENT` 投影，不修改 Process Core。旧 0.1.0 包必须先运行迁移脚本，并对推断层级全量人审。具体约束见 [分层流程解构实施方案](./references/hierarchical-process-decomposition-plan.md)。

## 运行流程

### 阶段一：受理与来源固化

**目标**：确认分析对象完整、版本可识别且原件可追溯。<br>
**输入**：原始文件、案件上下文、用户说明。<br>
**输出**：输入清单和 `source-index.json` 初稿。<br>
**质量门禁**：

- 对每个输入记录相对路径、SHA-256、文件类型、获取时间和文档角色（正文/附件/表单/流程图/授权表）。
- 检查正文、附件、审批页和修订记录是否缺失；缺失不静默跳过。
- 同一制度存在多个版本时，不自行选择“现行版”；列出版本证据并请求确认。

### 阶段二：结构解析与覆盖核验

**目标**：得到可定位到条款、表格行列和页面的结构事实。<br>
**输入**：来源已固化的文件。<br>
**输出**：parsed 结果、锚点索引和覆盖声明。<br>
**质量门禁**：

- 原始 PDF、Word、Excel、图片等先按 document-parsing 路径解析；能力不可用时由模型直接读取，但仍须建立等价锚点索引。
- 将上游文字/OCR结果规范化为 `normalized.parsed.json`，严格遵循 bundled parsed schema 0.1.0；不得把 document-parsing 的案件 parsed 格式直接冒充该格式。
- 条款最低锚点为条款编号；不足时补 `blockPath`、页码提示和不超过 200 字的原文摘录。
- 表格必须保留行列关系；无法还原的表格、图片、脚注列入 `unrecognizedRegions`。
- `parseConfidence` 只回答“字是否看清”；低置信块强制进入全审池。

### 阶段三：文件身份与适用边界

**目标**：确定制度效力身份、目标和适用范围。<br>
**输入**：parsed 结果及关联文档信息。<br>
**输出**：文件身份记录、适用边界记录、待确认项。<br>
**质量门禁**：

- 提取名称、编号、版本、层级、制定/归口/审批主体、发布/生效日期、适用范围、依据、关联/替代文件、附件、解释权和有效性判断。
- 用“对象 + 场景 + 事项 + 触发条件 + 排除事项”表达适用边界。
- “有效/失效”必须有发布、生效、废止或替代依据；否则标记 `待确认`。

### 阶段四：规则与分层流程解构（Pass A–G）

**目标**：把自然语言转成可执行规则和端到端流程。<br>
**输入**：完成覆盖核验的条款与表格。<br>
**输出**：核心规则、五级流程树、流程目标、Artifact、L3 内流转边和参数投影。<br>
**质量门禁**：

- Pass A 识别制度目标、适用边界和价值链范围；Pass B 划分 L1/L2；Pass C 识别具备独立目标、入口与输出的 L3；Pass D 分解 L4/L5；Pass E 提取 Artifact；Pass F 建立 L3 内顺序；Pass G 绑定权责、风险、控制和规则。
- 用 5W2H 提取触发、主体、动作、对象、时限、地点/系统、阈值和证据。
- 强制、禁止、授权、程序、职责、处罚、引用、豁免等条款逐条分诊；混合条款保留多值类型并强制全审。
- 程序条款同时保留 Clause、义务转写和流程活动，禁止只画流程不建义务候选。
- 义务转写保留制度语义，不扩大约束范围；参数只是 statement 的结构化投影，不能替代原文转写。
- 主流程按业务时间顺序重建，不受章节顺序限制；章节父子关系不得直接冒充流程父子关系。
- 每个已解析 L3 至少具备目标、入口条件、一个 L4 和输出 Artifact；不足时保持 unresolved 并建立 blocking 人审项。
- `parent_ref` 只连接相邻层级；L3 的 `owning_process_ref` 指向自身，L4/L5 指向所属 L3；禁止父子环。
- `hierarchy_confidence.overall` 必须严格等于 evidence、boundary、parent、granularity 中的最低值。推断层级统一进入 full review。
- `flow_edges[]` 仅连接同一 L3 内元素。跨 L3 协作以 Artifact 的 `produced_by`/`consumed_by` 表达，不用伪造跨流程顺序边。
- 无条件主干边投影为活动 `precededByActivity`；有条件、升级、驳回、退回、终止、紧急通道投影为 `transitions[]`，同一边禁止双写。
- “原则上 X”仍建立有效义务；未明示例外记制度缺陷。明确豁免使用 `exemption + exemptsFrom`，不当作普通异常流。

### 阶段五：权责与风险控制

**目标**：建立角色、职责、权限、风险、控制和证据闭环。<br>
**输入**：规则和流程活动。<br>
**输出**：RACI 记录、风险控制记录及对齐候选。<br>
**质量门禁**：

- RACI、风险和控制可绑定任一流程层级；每个 L3/L4 至少一个 R，L3 原则上只有一个 A。缺失或多 A 进入问题清单，不由 AI 补角色。
- 检查申请、审批、执行、验收、付款、监督和归档的职责分离。
- 每项关键控制回答：风险 → 控制责任人 → 执行节点 → 判断标准 → 证据 → 监督 → 整改。
- 风险要求同时产生控制点和控制程序，并用 `realizedAtPoint` 对齐；只建一侧视为不完整。
- 证据类型、保存期限、频率和阈值在原文明确时投影为 parameters；模糊词不伪造数值。

### 阶段六：例外、冲突与缺口检查

**目标**：识别制度设计问题和多文档不一致。<br>
**输入**：全部结构化记录及文档关系。<br>
**输出**：问题记录、优化建议和跨文档一致性报告。<br>
**质量门禁**：

- 检查紧急事项、系统故障、审批人缺席、材料不全、退回/驳回、变更、取消/终止、超预算/权限、补办、跨组织事项。
- 区分“制度明文事实”“跨文档冲突判断”“最佳实践建议”；问题和建议不进入本体 candidates。
- 多文档比较先确定效力/版本顺序，再比较同一主体、事项、触发、阈值、权限、时限和流向；无法确定优先级时只报冲突候选。
- 建议不得改变原制度含义，且必须说明影响、风险等级和建议确认责任部门。

### 阶段七：生成、校验与交付

**目标**：形成机器可用、人可读、可入库前复核的成果包。<br>
**输入**：全部候选记录和问题记录。<br>
**输出**：`digest.json`、`candidates.json`、`digest.md`、`explanation.html` 及集合级报告。<br>
**质量门禁**：

1. 先完成 `normalized.parsed.json`，再写 `digest.json`，最后按投影契约生成 `candidates.json` 和 `digest.md`，禁止三份下游成果独立编写。运行正向投影器覆盖生成 candidate 来源/分类、Rule Obligation、rule parameter target、流程层级、目标、Artifact 和流程边；候选边界、共享 Clause、Core 选择、alignment 与审核数据从 seed candidates 保留，不得在投影阶段猜测。
2. `candidates.json` 严格遵循 candidates schema 0.3.0：不添加分析问题、评分或展示字段。
3. 每一表行、候选、RACI 指派、风险控制和流程边都必须带原文锚点；无锚点记录不得进入交付包。
4. 引用完整：parameter target 指向本文件 Obligation；transition 两端指向本文件活动；alignment 目标含 excerpt。
5. 未确认记录保持 `review.status: proposed`；AI 不写 confirmed、modified、rejected 或 serialized。
6. 低解析置信、低语义置信、混合条款、未识别区域、跨文档冲突和关键字段缺失全部进入全审池。
7. Core 版本、tenant 或必要 parsedRef 缺失时，将成果标为“分析草稿/不可入库”，不得用占位版本通过校验。
8. candidates 必须为每个流程元素、目标和 Artifact 建立 proposal；流程元素使用临时 `efio:*` 层级属性，目标/输入/输出继续使用 Process Core 原生关系。
9. 校验通过后从 `digest.json + normalized.parsed.json + candidates.json` 机械生成 `explanation.html`；不得在导览中新增分析事实或改写原文。

确定性规则/流程投影使用：

```text
node skills/policy-digest/scripts/project-policy-digest-candidates.mjs cases/{case_id}/policy-digests/{doc_id} --in-place
```

已有 `candidates.json` 时，先省略 `--in-place` 生成并列的 `candidates.projected.json` 复核；使用 `--check` 可在不写文件的情况下检测规则/流程投影漂移。常规模式从 seed candidates 保留候选 ID、共享 Clause、Core 选择、alignment 和审核数据。

没有 `candidates.json` 时，仅当 digest 已显式声明 candidate_refs、每个 candidate 至少关联一条同来源同 disposition 的 rule、且目标 Core 版本唯一时，才可使用 `--init` 创建壳；多版本时必须同时给出 `--core-version`。不得以 `--init` 覆盖已有 candidates，也不得为 process-only 分组猜 disposition。

每条可投影记录必须恰好一个 candidate_ref；candidate 拆分遵循投影契约 §4.1。Rule 和 flow edge 参数必须包含 `parameterType` 与字符串 `value`；当前由 package validator 以 `parameter_shape_invalid` 门禁，不能因单文件 Schema 仍接受开放 object 而省略。所有 digest source 和 candidate sourceBlock 的文档 ID 必须与 parsed 主文档一致。

`digest.md` 必须通过 `generate-policy-digest-md.mjs` 从最终 digest 重建。默认先生成 `digest.generated.md` 复核，再用 `--in-place` 安全覆盖；交付或 CI 使用 `--check` 阻止人读视图漂移。

### 确定性校验

成果生成后必须运行：

```text
node skills/policy-digest/scripts/validate-policy-digest.mjs cases/{case_id}/policy-digests/{doc_id}
```

校验器不做语义补全，只检查可确定的契约：

- 三层 JSON 的版本化 Schema；
- digest/candidates 到 normalized parsed 的锚点可定位性；
- ID 唯一性及 parameter、transition、alignment、流程目标、Artifact、RACI、candidate 引用完整性；
- 相邻父层、无环、L3 归属、层级置信度保守性和推断层级全审；
- L3 完整性、Artifact 双向引用、同一 L3 流转边及其 candidates 投影；
- 无条件主干边与条件/异常 transition 的单源纪律；
- `ready_for_ingestion` 不得带 blocking 或 proposed 记录；
- 六表一图章节和结构化记录 ID 均已呈现在 `digest.md`。

存在 ERROR 时不得交付入库；WARN 必须进入人工复核说明。使用 `--json` 可输出机器可读校验报告。

默认输出先按 error code 汇总，并且每类只展开前 5 条，避免重复错误形成“错误墙”。使用 `--summary-only` 仅看分组统计，`--all` 查看全部明细，或用 `--max-per-code <n>` 调整每类展开数量。

`normalized.parsed.json` 使用 `parsedSchemaVersion`、`docId`、`blockId`、`blockPath` 等 camelCase 字段；digest 来源锚点才使用 snake_case。校验器检测到旧 `schema_version/doc_id/block_id` 等字段时，必须先输出 `parsed_field_naming_mismatch` 定向诊断，不静默改写输入。

## 独立功能：制度解构导览

当用户说“解释这份解构结果”“对照原文看流程分层”“让我审阅角色职责来源”或已有 Policy Digest 包但不要求重新分析时，独立执行导览生成，不重跑语义解构：

```text
node skills/policy-digest/scripts/generate-policy-digest-explanation.mjs cases/{case_id}/policy-digests/{doc_id}
```

也可用 `--output <path>` 指定输出。生成的 `explanation.html` 是无外部依赖的单文件，可直接发送给制度归口部门并在浏览器离线打开。它必须提供：

- “怎么读”页：用非本体术语解释从原文到结构化记录的六步方法和数量概览；
- “流程分层”页：展开 L1–L5 树，显示明文/推断依据、层级状态和置信度；
- “流程提炼”页：按 L3 展示目标、流程内边和 Artifact 输入输出交接；
- “角色职责”页：按流程元素展示 RACI，每项均可单独回到来源；
- “规则与风控”页：展示规则、目标、风险、控制、问题及其流程落点；
- “本体投影”页：展示 candidate、proposal、Core 版本、review pool、parameter、transition、alignment 和临时 `efio:*` 映射；
- “原文对照”栏：点击任一结构化记录，定位 `block_id + block_path + clause_ref + page_hint`，显示完整 parsed 原文块及该类型的判断说明；
- 全文搜索、窄屏布局和打印样式，且不依赖联网资源。

导览只消费已存在的数据，不是新的真相源。无法定位原文的记录应先由校验器阻断，而不是在页面中补造说明。详细视图规则见 [制度解构导览规范](references/explanation-view.md)。

## 置信度与人审规则

- `parseConfidence` 与 `confidence` 分开保存，前者不得直接复制为后者。
- 置信度是路由信号，不是事实概率；必须同时记录不确定原因。
- 待确认项至少包含：记录 ID、问题、影响、来源锚点、建议确认人、阻断级别。
- 阻断级别：`blocking` 阻止 candidates 入库；`non_blocking` 允许继续但必须人审。
- 人工确认后应 append-only 记录 reviewer、timestamp 和 reviewPatch；不得覆盖初始 AI 提案。

## 六表一图视图

`digest.md` 必须从 `digest.json` 生成并按顺序包含：

1. 文件身份表；
2. 核心规则表；
3. 分层流程节点表（含目标、Artifact 和 L3 内流转）；
4. RACI 责任矩阵；
5. 风险控制矩阵；
6. 制度问题及优化建议清单；
7. 端到端泳道图或 BPMN 等价图。

流程图只消费结构化活动和流转边；不得在图中新增 JSON 中不存在的节点、角色或条件。

## 完成标准

只有同时满足以下条件，才可称为“解构完成”：

- 来源完整性和解析覆盖已声明，所有遗漏区域均显式列出。
- 每条结构化记录均有稳定锚点和原文摘录。
- 规则、流程层级、目标、Artifact、角色、参数、风险、控制、证据和例外之间引用可解析。
- 正常流与异常流完整，且不存在主干边/transition 双写。
- 六表一图与 JSON 一致，多文档冲突项有比较依据。
- `explanation.html` 可独立打开，流程、角色、规则和风控记录均可点击回到 parsed 原文块。
- 所有 blocking 待确认项已解决。
- candidates 通过格式和引用完整性校验，且人审状态真实。

## 相关技能

- [文档结构化解析](../document-parsing/SKILL.md)：原始文件解析、OCR、表格保真和版本管理。
- [调查本体论](../ontology/SKILL.md)：当前仓库的调查实体/关系治理；与本技能输出的企业制度 Core candidates 不可混用。
- [数据分析](../data-analysis/SKILL.md)：对制度执行数据进行控制测试；不替代制度模板解构。

## 版本化格式

- [Policy Digest schema 0.2.0（当前）](./references/schemas/policy-digest-0.2.0.schema.json)
- [Policy Digest schema 0.1.0（旧版）](./references/schemas/policy-digest-0.1.0.schema.json)
- [Parsed Document schema 0.1.0](./references/schemas/parsed-document-0.1.0.schema.json)
- [Candidates schema 0.3.0](./references/schemas/candidates-0.3.0.schema.json)
- [确定性校验器](./scripts/validate-policy-digest.mjs)
- [最小合法起步包脚手架](./scripts/scaffold-policy-digest.mjs)
- [Candidates 确定性规则/流程投影器](./scripts/project-policy-digest-candidates.mjs)
- [六表一图 Markdown 生成器](./scripts/generate-policy-digest-md.mjs)
- [校验器回归测试](./scripts/test-policy-digest-validation.mjs)
- [十规则脱敏 fixture 回归测试](./scripts/test-ten-rule-policy-fixture.mjs)
- [0.1 → 0.2 迁移器](./scripts/migrate-policy-digest-0.1-to-0.2.mjs)
- [制度解构导览生成器](./scripts/generate-policy-digest-explanation.mjs)
- [制度解构导览规范](references/explanation-view.md)
- [分层流程解构实施方案](./references/hierarchical-process-decomposition-plan.md)
- [校验契约速查](./references/validation-cheat-sheet.md)
- [Digest → Candidates 正向投影契约](./references/candidates-projection-contract.md)

以上副本随技能分发并作为当前执行契约。上游本体框架升版时，不静默覆盖；先评估兼容性，再新增版本化副本并更新本节。
