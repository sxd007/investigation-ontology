---
description: 首次设置向导 — 完成团队配置、证据策略，检查 MCP 集成状态
---

# /cc-investigation:cold-start-interview

首次安装后的配置向导。完成后所有技能将使用你的定制配置。

## Usage
```
/cc-investigation:cold-start-interview           完整设置（10-15分钟）
/cc-investigation:cold-start-interview --quick   快速设置（仅团队信息）
/cc-investigation:cold-start-interview --check-integrations  仅检查 MCP 集成
```

## Process
遵循 cold-start-interview 技能的 5 阶段流程：
Phase 1 检查现有配置 → Phase 2 采集信息（含角色画像选择，读取 manifests/install-profiles.json）→ Phase 2.5 MCP 配置选择（读取 mcp-configs/mcp-servers.json，让用户选择） → Phase 3 验证集成 → Phase 4 写入配置

## 完成后

配置就绪后，可以开始调查工作：

```
下一步：
  /investigate new    创建第一个案件
  /investigate list   查看已有案件（如有）

或者了解相关技能：
  /help investigation-foundation  调查方法论
  /help case-management           案件管理框架
```

## 注意
- 配置写入 ~/.claude/plugins/config/cc-investigation/（持久化，更新不丢失）
- 所有技能在运行前都会检查配置是否完成
- 编辑 ~/.claude/plugins/config/cc-investigation/team-profile.md 可随时修改
