---
description: 舞弊类型识别与调查方案 — 根据线索特征匹配涉及类型并推荐调查策略
---

# /fraud-type

分析线索/案件描述，识别最可能涉及的舞弊类型，并推荐调查方案。

## Usage
```
/fraud-type classify [desc]  根据案件描述推荐舞弊类型
/fraud-type compare [a] [b]  比较两种舞弊类型的调查方案差异
/fraud-type red-flags [type] 查看某类舞弊的预警信号清单
```

## Process
基于 ACFE 职业舞弊分类体系，从线索特征匹配舞弊类型，然后推荐该类型的最佳调查手段组合。
