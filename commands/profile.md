---
description: 技能配置管理器 — 中途切换调查团队的技能 profile（角色画像），动态更新激活的技能集
---

# /efio:profile

调查团队技能配置的管理工具。首次配置在 `/efio:cold-start` 的 Phase 1.6 进行；此命令用于中途切换 profile 或查看当前配置。

## Usage

```
/efio:profile                    # 交互式菜单（默认）
/efio:profile --current          # 查看当前激活的 profile 和技能
/efio:profile --switch           # 切换到另一个 profile
/efio:profile --describe <name>  # 查看某个 profile 的详细说明
```

## 使用场景

| 场景 | 命令 |
|------|------|
| 我现在用的是 investigator，想看激活了哪些技能 | `--current` |
| 这个案件主要是数据分析，我想切换到 analyst 配置 | `--switch` |
| 我想了解 full profile 包含哪些技能 | `--describe full` |

## Process

### --current：查看当前配置

读取 `team-profile.md` 的"角色画像"节，展示当前激活的 profile 和技能列表：

```
当前的技能配置（Role Profile）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 当前 Profile: investigator

描述：
一线反舞弊调查员（默认推荐）
覆盖报案到结案全流程，重点关注 fraud-* 场景

激活的技能（22 个）：
  
  【Foundation Layer】
  ✓ investigation-foundation       调查方法论与框架
  ✓ investigation-memory           多案件记忆与关联分析
  ✓ ontology                        本体层定义与 Binding Protocol
  
  【Process Layer】
  ✓ case-management                案件全生命周期管理
  ✓ case-retrospective             案件复盘与流程改进
  ✓ investigation-techniques       调查方法与工具
  
  【Domain Layer】
  ✓ fraud-classification           舞弊分类与诊断
  ✓ fraud-channel                  渠道舞弊（采购、销售）
  ✓ fraud-reimbursement            报销舞弊检测
  ✓ fraud-conflicts-of-interest    利益冲突识别
  ✓ fraud-ip                       知识产权舞弊
  ✓ fraud-hr                       HR 舞弊（招聘、薪酬）
  ✓ fraud-bid-rigging              围标舞弊
  ✓ fraud-fake-chop                假公章识别
  
  【Operations Layer】
  ✓ evidence-management            证据管理与合规
  ✓ interview-analysis             访谈分析与陈述评估
  ✓ data-analysis                  数据分析与异常检测
  ✓ writing-reporting              调查报告撰写

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### --switch：切换 Profile

交互式流程：

```
1. 读取 manifests/install-profiles.json，展示所有可用 profile
2. 用户选择想切换到的 profile
3. 确认用户的选择
4. 根据新 profile 的 modules 列表，更新 team-profile.md 中的"角色画像"节
5. 展示迁移对比（旧 profile 的技能 → 新 profile 的技能）
```

**交互示例**：

```
> /efio:profile --switch

可用的技能配置 Profile（来自 manifests/install-profiles.json）：

[1] investigator (当前使用)
    ✓ 一线反舞弊调查员（默认推荐）
    → 22 个技能激活

[2] auditor
    □ 内审/合规，侧重数据分析与流程审计
    → 14 个技能激活（子集）

[3] analyst
    □ 数据分析师，侧重数据挖掘与异常检测
    → 16 个技能激活

[4] interviewer
    □ 访谈/问话专家，侧重陈述分析与证言评估
    → 15 个技能激活

[5] full
    □ 需要全部能力（含记忆、复盘、订单差异分析）
    → 全部 26 个技能激活

选择新的 Profile (序号)：
> 3

准备切换：investigator (22 个技能) → analyst (16 个技能)

技能变化：
  移除 (6 个):
    ✗ fraud-bid-rigging
    ✗ fraud-fake-chop
    ✗ fraud-conflicts-of-interest
    ✗ fraud-channel
    ✗ fraud-hr
    ✗ order-execution-variance-analysis
    
  保留 (16 个):
    ✓ investigation-foundation, investigation-memory, ontology, ...
    ✓ evidence-management, data-analysis, writing-reporting, ...
    
  新增 (0 个):
    -

确认切换？ (yes/no)
> yes

✓ Profile 已更新

新的激活技能配置（analyst）：
  ✓ investigation-foundation
  ✓ investigation-memory
  ✓ ontology
  ✓ case-management
  ✓ data-analysis
  ✓ evidence-management
  ✓ interview-analysis
  ✓ writing-reporting
  ✓ investigation-techniques
  ✓ investigation-foundation
  ✓ fraud-classification
  ... (共 16 个)

已保存到 team-profile.md
```

### --describe：查看 Profile 详细说明

展示某个 profile 的完整信息（来自 `install-profiles.json`）：

```
> /efio:profile --describe full

Profile: full
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

描述：
需要全部能力（含记忆、复盘、订单差异分析）

适用场景：
  • 大型综合反舞弊项目，需要全方位能力
  • 多领域交叉调查
  • 团队配置齐全，培训充分
  • 作为 reference，了解全部可用技能

激活的技能（26 个）：

  【Foundation Layer】
  • investigation-foundation       调查方法论与框架
  • investigation-memory          多案件记忆与关联分析
  • investigation-techniques      调查方法与工具
  • ontology                      本体层定义与 Binding Protocol

  【Process Layer】
  • case-management              案件全生命周期管理
  • case-retrospective           案件复盘与流程改进

  【Domain Layer】
  • fraud-classification         舞弊分类与诊断
  • fraud-channel                渠道舞弊（采购、销售）
  • fraud-reimbursement          报销舞弊检测
  • fraud-conflicts-of-interest  利益冲突识别
  • fraud-ip                     知识产权舞弊
  • fraud-hr                     HR 舞弊（招聘、薪酬）
  • fraud-bid-rigging            围标舞弊
  • fraud-fake-chop              假公章识别

  【Operations Layer】
  • evidence-management          证据管理与合规
  • interview-analysis           访谈分析与陈述评估
  • data-analysis                数据分析与异常检测
  • writing-reporting            调查报告撰写

  【Advanced Layer】
  • order-execution-variance-analysis  订单执行差异分析

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 完成后

profile 切换后，立即生效。调查工作中模型会根据新的激活技能集自动调整关键词触发和建议。

## 注意

- 与 `/efio:mcp-config` 命令形成对称：profile 管理**技能配置**，mcp-config 管理 **MCP 能力**
- 切换 profile 不会移除已创建的案件记录，仅影响后续新案件的技能加载
- 即使不在某个 profile 中，用户也可以通过 `/help <skill>` 手动加载任何技能

## 相关

- **首次配置:** [cold-start](./cold-start.md) Phase 1.6
- **MCP 配置:** [mcp-config](./mcp-config.md)
- **Profile 定义:** [manifests/install-profiles.json](../manifests/install-profiles.json)
- **团队配置:** [config-templates/team-profile.md](../config-templates/team-profile.md)
