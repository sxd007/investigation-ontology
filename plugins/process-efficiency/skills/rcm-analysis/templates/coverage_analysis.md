# 覆盖度分析（R2）

## 无控风险 `risk_uncontrolled`（high）

| 风险 | 判级依据（是否涉大额/敏感 thresholds） | finding |
|------|--------------------------------------|---------|
| RISK-xxx | {rule_refs 涉大额→high；一般操作→medium/low} | RC-xxx |

## 弱控风险 `risk_undercontrolled`

- 仅有辅助控制 / 控制与风险量级不匹配（大额风险配事后抽检）

## 未识别风险 `risk_unidentified`（须先发 DDR）

| 参照集条目 | 典型场景 | 制度未声明说明 | finding |
|-----------|---------|--------------|---------|
| {舞弊/回扣} | {本类流程典型场景} | {制度未声明，由参照集识别} | RC-xxx |

> 纪律：`risk_unidentified` 必须先行 DDR（open），dismissed 后才升级为确认发现；不允许只凭直觉列风险。
