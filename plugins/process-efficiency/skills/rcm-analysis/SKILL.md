---
name: rcm-analysis
description: 风险控制矩阵评价 — 构建"风险×控制"映射矩阵，评价风险覆盖度（无控风险/未识别风险）、控制设计有效性（预防/检查、自动化、频率匹配）与冗余。当需要回答"流程的风险控制设计得好不好"时使用。
origin: process-efficiency
---

# 风险控制矩阵评价

对 digest 提取的 risks（制度明文记载的风险清单）与 controls（控制清单）做**设计层**评价。核心产物是 RCM 矩阵与缺口清单。**不判断控制是否被执行**——那是 [control-testing](../control-testing/SKILL.md) 的职责（设计有效性 vs 运行有效性的边界）。

## 激活条件

- 评价流程风险识别的完备性（对照风险参照集）
- 构建"风险-控制"映射矩阵并找缺口
- 评价控制设计有效性（类型/时机/频率/自动化）
- process-assess-workflow 的 ASSESS 阶段调度本技能（dimensions 含 risk）

**不适用**：解构制度提取 risks/controls 清单（policy-digest 职责，本技能只消费）；测试控制执行情况（control-testing）；评价目标设定（goal-alignment）。

## 输入

| 输入 | 来源 | 层 |
|------|------|----|
| `risks[]`（risk_id / description / category / rule_refs / element_refs / assertion_basis） | digest.json | 设计 |
| `controls[]`（control_id / measure / element_ref / risk_refs / timing_type / execution_mode / frequency / evidence / decision_criteria） | digest.json | 设计 |
| `rules[]`（thresholds / 授权 / 时限规则，用于控制设计评价的上下文） | digest.json | 设计 |
| 风险参照集（按业务域，见 §参照集） | 本 SKILL 或调用方提供 | 设计 |

## 方法论

### R1 RCM 矩阵构建

以 `risks[]` 为行、`controls[]` 为列，映射关系来自 `controls[].risk_refs`：

```text
              CTL-001(审批)  CTL-002(复核)  CTL-003(对账)
RISK-001 虚假供应商   ●            ○             -
RISK-002 超授权采购   ●            -             -
RISK-003 信息滞后     -            -             ●(部分)

● 主要应对   ○ 辅助应对   - 无关联
```

构建时同时标记：**orphan control**（control 的 risk_refs 为空或指向不存在风险 → `control_orphaned`）。

### R2 覆盖度分析（缺口识别）

**无控风险**：矩阵中全空行的风险 → `risk_uncontrolled`（high）。判级参考：

- 制度声明为高损失场景的风险（rule_refs 中有 thresholds 涉及大额/敏感对象）→ high；
- 一般操作性风险 → medium/low。

**弱控风险**：仅有辅助控制或控制明显与风险量级不匹配（风险涉及大额资金，控制仅为事后抽检）→ `risk_undercontrolled`。

**未识别风险**：风险参照集对照——参照集中该类流程的常见风险，digest 的 risks[] 未覆盖 → `risk_unidentified`。此类 finding 的 anchor 指向参照集条目 + 最接近的 process_element（注明"制度未声明，由参照集识别"），severity 按参照集风险等级判。

### R3 控制设计有效性评价

对每个非 orphan 控制评价六个设计属性（信息来自 digest controls 字段，字段缺失本身是发现）：

| 属性 | 评价问题 | 缺陷 finding |
|------|---------|------------|
| 类型 | 预防性（事前阻止）vs 检查性（事后发现）——高风险是否有预防性控制 | `control_design_weak` |
| 时机 | 控制点位置（事前/事中/事后）与风险的匹配 | `control_design_weak` |
| 频率 | frequency 与风险发生频率匹配（日频风险配月度检查=失配） | `control_design_weak` |
| 自动化 | execution_mode 手工/系统/混合——高频控制手工执行是脆弱点 | `control_design_weak` |
| 标准 | decision_criteria 是否明确（审批无标准=控制者无法执行） | `control_design_weak` |
| 留痕 | evidence 是否定义（控制无证据=运行有效性无从验证） | `control_design_weak`（并提示 control-testing 将受阻） |

**冗余检测**：同一风险被多个同类型控制覆盖且无分工说明（非"预防+检查"的层次化设计）→ `control_redundant`（low/medium，注意与层次化设计区分——预防+检查组合是良好实践不是冗余）。

**错配检测**：control 的 risk_refs 指向的风险与其实际控制内容不符（审批控制挂在"信息滞后"风险上）→ `control_risk_mismatch`。

### R4 断链与一致性

- rule_refs 断链：风险引用的规则在 rules[] 不存在 → 记入 digest issues 反馈通道（非本技能 finding，属制度解构缺陷）；
- element_ref 悬空：控制/风险挂接的流程元素不存在 → 同上反馈通道；
- 控制挂接 L4 但风险在 L3 级别（层级错位导致覆盖幻觉）→ `control_risk_mismatch`。

## 风险参照集

**两层结构：域风险库（深化）+ 通用六类（兜底）。**

**域风险库**（[references/risk-libraries/](./references/risk-libraries/risk-library-contract.md)）：按《企业内部控制应用指引》18 域组织的结构化风险参照（风险条目 + 典型控制 + 指引条款出处 + 六类标签）。加载规则：

1. SCOPE 阶段确认评价对象的域归属（可多域并列，如采购流程挂 procurement + treasury + contract），记录选域理由；
2. 加载对应域库 JSON 作为 R2 覆盖度分析的对照基准——库条目的 `typical_controls` 同时是 `risk_undercontrolled` 判级的参照组合；
3. `risk_text_status: pending` 的域（纯控制型，风险文本待补）只能用于控制侧参照，不得据此判 `risk_unidentified`；
4. 参照库是**询问的起点不是判决的终点**：`risk_unidentified` 仍须先发 DDR + 典型场景说明；库不完备，库外风险靠评价者独立判断（完整纪律见[库契约](./references/risk-libraries/risk-library-contract.md)）。

**通用兜底集**（无域库或库外补充时使用）：

| 类别 | 典型风险 | 参照等级 |
|------|---------|---------|
| 舞弊 | 虚构/串通/利益冲突/回扣 | high |
| 错误 | 录入错误/计算错误/遗漏步骤 | medium |
| 延误 | 审批积压/交接丢失/超期 | medium |
| 合规 | 越权/未授权/违反外部法规 | high |
| 数据质量 | 记录不完整/状态不同步/证据缺失 | medium |
| 资产安全 | 资产流失/信息泄露/单点依赖 | high |

对照纪律：`risk_unidentified` 判定须给出参照集条目 + "该风险在本类流程的典型场景"的说明；不允许只凭直觉列风险。参照等级是粗粒度初判，finding severity 按 finding-contract §4 独立判级。

## 评价产出结构

```text
01_assessments/risk/
├── rcm_matrix.md               # R1 矩阵（含映射依据）
├── coverage_analysis.md        # R2 覆盖度分析（缺口/弱控/未识别）
├── control_design_review.md    # R3 六属性逐控制评价
└── findings.yaml               # 按 finding-contract 聚合
```

## 起步脚手架

直接复制本技能 `templates/` 下的产出骨架到目标维度目录（或由工作流 `scaffold-dimension.mjs` 统一生成）：

```text
node skills/process-assess-workflow/scripts/scaffold-dimension.mjs {output_root}/01_assessments/<dim> --skill <dim> [--assessment-id PA-2026-001] [--date 2026-09-29]
```

骨架含本技能文档化的全部 .md 产出与 `findings.yaml` 占位；占位符 `{assessment_id}`/`{date}` 自动替换。findings 结构遵循 finding-contract，聚合到 `findings.yaml`。

填充真实数据后运行 `node skills/process-assess-workflow/scripts/validate-findings.mjs 01_assessments/risk/findings.yaml` 做契约校验，0 错误方可进入 REPORT（可加 `--strict` 把警告也计为错误）。

## 质量纪律

1. **消费纪律**：只消费 digest-schema 兼容的流程知识包（默认生产者 policy-digest）与调用方提供的风险参照集；不读原文；**不做实例数据分析**（运行有效性归 control-testing）；
2. **锚点纪律**：finding 带 anchor.digest（risk/control 的 ID + source）；`risk_unidentified` 带 anchor.digest.element_ref + 参照集条目说明；
3. 制度明文风险（assertion_basis=explicit_text）与参照集识别风险在清单中分列，不得混排；
4. finding 结构遵循 [finding-contract](../process-assess-workflow/references/finding-contract.md)（RC-NNN 前缀）；
5. 不以"行业最佳实践"冒充制度明文——设计评价结论注明依据是制度文本还是参照集。

## 上游缺陷识别（DDR）

本技能是风险-控制领域的专家，**`risk_unidentified` 是全部四技能中上游缺陷嫌疑最高的发现类型**（参照集缺口既可能是制度真缺失，也可能是解构未提取）。观察到以下信号时按 [DDR 机制](../process-assess-workflow/references/digest-defect-report.md)报告：

| 观察 | 嫌疑 | DDR 类型 |
|------|------|---------|
| `risk_unidentified`（参照集缺口） | 风险在原文有表述但未提取 | omission |
| `control_orphaned` / `control_risk_mismatch` | 控制与风险的链接提取错误，而非设计缺陷 | misclassification |
| 控制设计属性缺失（无 frequency/evidence），但所在条款锚点 excerpt 含频次/证据字样 | 字段在原文存在但未提取到 controls[] | omission |

**纪律**：`risk_unidentified` 类 finding **必须**先发 DDR，闭环（dismissed）后才可升级为确认发现；R4 的断链类问题（rule_refs/element_ref 悬空）属明确的解构缺陷，直接记入 DDR 而非 finding。

## Related

- **上游**：[policy-digest](../policy-digest/SKILL.md)（risks/controls 清单的生产者）
- **下游**：[control-testing](../control-testing/SKILL.md)（本技能判设计有效性，它判运行有效性；本技能的 evidence 缺口 finding 是它抽样受阻的预警）
- **同级**：[goal-alignment](../goal-alignment/SKILL.md)、[efficiency-diagnosis](../efficiency-diagnosis/SKILL.md)
- **契约**：[finding-contract](../process-assess-workflow/references/finding-contract.md)
- **参照集**：[域风险参照库契约](./references/risk-libraries/risk-library-contract.md)（18 域，风险条目+典型控制+指引出处；通用六类兜底）
- **参照系**：COSO 内控框架 / RCM（Risk-Control Matrix）方法；《企业内部控制应用指引》18 域；risk 域本体（threatens/impacts 桥接）
