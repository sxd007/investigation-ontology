# 域风险参照库（Risk Libraries）

> rcm-analysis 的分业务域风险参照集：覆盖《企业内部控制应用指引》18 域，供 R2 覆盖度分析（`risk_unidentified` / `risk_undercontrolled` 判定）与 RCM 矩阵参照行使用。通用六类（舞弊/错误/延误/合规/数据质量/资产安全）仍是兜底内核，域库是其深化，**不是替代**。

## 库清单

| 域 | 文件 | 风险/控制 |
|----|------|----------|
| 组织架构 | [org-structure.json](./org-structure.json) | 2 / 21 |
| 发展战略 | [strategy.json](./strategy.json) | 2 / 16 |
| 人力资源 | [hr.json](./hr.json) | 2 / 10 |
| 社会责任 | [social-responsibility.json](./social-responsibility.json) | 4 / 17 |
| 企业文化 | [culture.json](./culture.json) | 2 / 8 |
| 资金活动 | [treasury.json](./treasury.json) | 19 / 39 |
| 采购业务 | [procurement.json](./procurement.json) | 9 / 26（已人工校准） |
| 资产管理 | [assets.json](./assets.json) | 20 / 43 |
| 销售业务 | [sales.json](./sales.json) | 10 / 27 |
| 研发与开发 | [rnd.json](./rnd.json) | 19 / 32 |
| 工程项目 | [engineering.json](./engineering.json) | 30 / 74 |
| 担保业务 | [guarantee.json](./guarantee.json) | 12 / 31 |
| 业务外包 | [outsourcing.json](./outsourcing.json) | 19 / 39 |
| 财务报告 | [financial-reporting.json](./financial-reporting.json) | 34 / 49 |
| 全面预算 | [budget.json](./budget.json) | 3 / 19 |
| 合同管理 | [contract.json](./contract.json) | 2 / 15 |
| 内部信息传递 | [info-flow.json](./info-flow.json) | 2 / 14 |
| 信息系统 | [it-systems.json](./it-systems.json) | 2 / 28 |

全部 18 域 `risk_text_status: complete`（2026-09-30：9 个纯控制型域已按财政部官方指引全文 PDF 逐字核对补录第三条风险文本，并人工校准类别；org-structure/culture 的域级风险跨阶段共用，见各文件 `calibration_note`）。风险条目带 `statement_ref`（指引条款出处）。

## Schema 0.1.0

```json
{
  "library_schema_version": "0.1.0",
  "domain": "procurement",
  "domain_label": "采购业务",
  "framework_ref": "企业内部控制应用指引第7号",
  "risk_text_status": "complete | pending",
  "calibration_note": "（可选）人工校准记录",
  "processes": [{ "process_l1": "一、采购", "process_l2": "请购" }],
  "risks": [{
    "risk_ref": "PROC-R02",
    "process_l1": "一、采购", "process_l2": "请购",
    "statement": "风险描述（指引条文原文，保留'是否存在'问句式或（一）（二）编号）",
    "statement_ref": "（可选）风险文本出处，如 应用指引第三条",
    "category": "fraud | compliance | asset_safety | delay | data_quality | error",
    "category_basis": "heuristic | calibrated | pending_risk_text",
    "reference_level": "high | medium | null",
    "typical_controls": [{
      "control_ref": "PROC-C04",
      "measure": "典型控制描述（指引条文原文）",
      "guideline_refs": ["基本规范第三十三条", "应用指引第六条"],
      "frequency": "业务发生时", "execution_mode": "人工控制", "importance": "一般控制 | 重要控制"
    }]
  }],
  "fraud_patterns": [{
    "pattern_id": "PROC-FP03",
    "name": "化整为零",
    "scenario": "手法操作描述（怎么做的）",
    "red_flags": ["可观察信号1（数据/单据里能看到什么）"],
    "stage": "易发环节",
    "related_risk_refs": ["PROC-R02"],
    "source_skill": "fraud-procurement"
  }]
}
```

## 使用纪律（防清单心态）

1. **参照库是询问的起点，不是判决的终点**：`risk_unidentified` 判定仍须先发 DDR + 给出"该风险在本类流程的典型场景"说明（rcm-analysis SKILL §R2 纪律不变）；匹配不上典型场景的库条目不得引用。
2. **本库不完备**：18 域覆盖常见业务域，但具体企业/行业可能有库外风险；库未覆盖不等于无风险，评价者的独立判断不可豁免。
3. **`reference_level` 是粗粒度初判**（2026-09-30 裁决）：仅用于分诊排序，finding 的 severity 按 finding-contract §4 独立判级，不继承参照等级。
4. **category 单标签 + 优先级裁决**（2026-09-30 裁决）：复合风险取主导成分一标签（fraud > compliance > asset_safety > delay > data_quality > error）；`category_basis: heuristic` 的标签未经人工校准，引用时可修正。
5. **多域并列**：一次评价可挂多个域库（如采购流程同时挂 procurement + treasury + contract），域归属在 SCOPE 阶段确认并记录理由。

## 校准纪律

- 转换器（`scripts/import-risk-library.py`，维护侧 Python 工具，需 openpyxl；**不入库**——gitignored，仅维护者本地持有，输入为外部工作底稿）重跑会**覆盖人工校准**；校准内容须记录在域 JSON 的 `calibration_note` 中，重转后按记录重新应用。
- 校准动作：修正 `category`（同步修正 `reference_level`）→ `category_basis` 改 `calibrated` → 在 `calibration_note` 追加记录（日期 + risk_ref + 改动 + 理由）。
- 使用中发现库条目错误/缺漏，按校准流程修正本库，**不在评价产物中夹带私货**（产物引用库条目 ID，保证跨评价一致）。

## 与调查插件的协同

舞弊类（fraud）条目可通过 investigation-ontology 的 `fraud-*` 场景技能（采购/报销/投标/渠道/HR/知产/印章/利益冲突）深化：库条目回答"这类流程该防什么"，fraud-* 类型学回答"舞弊实际长什么样、怎么查"。评价发现的可疑信号移交调查时，域库条目 ID 可作为两侧共通语言。

### fraud_patterns 补充层（2026-09-30 落地）

5 个域已带 `fraud_patterns`（42 条：procurement 15 / hr 12 / sales 7 / treasury 4 / contract 4），从 fraud-* 技能的舞弊类型学提炼，**是红旗信号视角的补充层，不是指引条文**：

- **用途一（评价侧）**：R2 覆盖度分析与 `risk_unidentified` 判定时，用 red_flags 做具体场景对照（"同一供应商订单频繁卡线"比"请购未经审批"更可查）；`related_risk_refs` 把手法挂回制度风险条目；
- **用途二（联动侧）**：control-testing 发现可疑信号移交调查（T4）时，`pattern_id` + `risk_ref` 是两插件的共通语言——评价说"疑似 PROC-FP03（化整为零）"，调查侧立刻知道查什么、怎么查；
- **纪律**：patterns 只作场景对照与移交索引，不构成发现本身——finding 仍须锚定 digest/baseline 证据；pattern 库同样不完备，未被列举的手法不等于不存在。
