<!--
⚠️ 模板文件 — 插件发版携带，每次插件更新时覆盖。

实际用户配置写入路径（升级不受影响）：
  {配置路径}/evidence-policy.md

此文件仅供 cold-start 作为模板读取和填充。任何 skill 不得从此路径读取配置。
-->

# 证据管理策略（Evidence Policy）

*由 /efio:cold-start 在首次设置时生成并填充。*

---

## 密级体系

**影响技能：** evidence-management（登记密级）、working-paper（标签默认值）

| 级别 | 定义 | 访问控制 | 存储要求 |
|------|------|---------|---------|
| **内部（Internal）** | 仅内部使用 | 调查团队 | 标准加密 |
| **机密（Confidential）** | 泄露可能造成中度损害 | 指定成员 + NDA | AES-256 |
| **绝密（Top Secret）** | 泄露可能造成严重损害 | 项目级 + 审批 | 硬件加密 + 审计日志 |

**默认密级：** [PLACEHOLDER e.g. 机密]

## 保管链要求（Chain of Custody）

**影响技能：** evidence-management（登记流程约束）

- 证据采集后 [PLACEHOLDER e.g. 24] 小时内完成证据注册
- 每一次移交必须双方签字
- 所有数字证据计算哈希并记录
- 明确标注原件和复制件
- 保管记录保留至结案后 [PLACEHOLDER e.g. 3] 年

## 底稿质量标准

**影响技能：** working-paper（质量审查标准）

- **ALCOA 原则：** Attributable、Legible、Contemporaneous、Original、Accurate
- 底稿编号规则：WP-YYYY-NNN + 模块前缀
- 创建后 [PLACEHOLDER e.g. 7] 个工作日内完成复核

## 数据处理规则

**影响技能：** data-analysis（数据提取约束）、investigation-techniques（取证边界）

- 数据最小化原则：仅收集与调查相关的数据
- 访问记录：所有数据操作记录日志
- 跨境传输：需法务审批 [PLACEHOLDER: YES/NO]
- 数据脱敏要求：[PLACEHOLDER e.g. 个人身份信息必须脱敏]
