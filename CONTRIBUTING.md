# 贡献指南

感谢你考虑为 investigation-ontology 贡献代码或内容。**所有开发方法论和编写规范见 [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md)**，本文件聚焦贡献方向和工作流。

---

## 一、贡献方向引导

### 1.1 场景经验技能（fraud-*）的扩展（首要方向）

这是最核心的贡献方向。成熟度分级见 [`DEVELOPMENT_GUIDE.md` §4.2](DEVELOPMENT_GUIDE.md#42-新增一个-skill含场景技能-6-文件同步)。

### 1.2 其他方向

- 工具赋能类技能的增强（数据分析脚本通用化、MCP 集成扩展）
- 工作流类技能的优化（阶段定义完善、JSON Schema 扩展）
- 国际化与本地化（中英文对照、FCPA/UK Bribery Act 适配）

---

## 二、架构合规

所有贡献必须遵循 [`DEVELOPMENT_GUIDE.md` §一](DEVELOPMENT_GUIDE.md#一项目架构三分法) 的架构三分法。**先分类，再动手。** 一个文件只归属一个类别，混合类别需拆分后再提交。

---

## 三、注册与同步

新增场景技能时必须完成 6 文件同步，详见 [`DEVELOPMENT_GUIDE.md` §4.2](DEVELOPMENT_GUIDE.md#42-新增一个-skill含场景技能-6-文件同步)。

数据模型变更需三处同步，详见 [`DEVELOPMENT_GUIDE.md` §4.5](DEVELOPMENT_GUIDE.md#45-修改数据模型)。

---

## 四、伦理与许可

### 法律与伦理底线

- **严禁**将本插件或其衍生内容用于非法监控、未经授权的数据采集、歧视性筛选或任何违反适用法律的活动
- 必须引用 `rules/investigation-ethics.md` 中的 AI 辅助调查道德准则
- 不得在技能或脚本中提供规避法律约束的方法或建议
- 涉及数据隐私、跨境调查、第三方取证等内容时，必须标注法律风险提示

### License

本仓库采用 **Apache License 2.0**。贡献即表示你同意你的贡献在相同许可下发布。

### 免责声明

贡献者需确认已阅读并理解 `DISCLAIMER.md`。插件是辅助性工具，不是替代性决策系统——所有输出均需调查员独立审慎判断。

---

## 五、提交流程

### 5.1 分支策略

1. Fork 本仓库到你的 GitHub 账号
2. 从 `main` 创建功能分支
3. 分支命名：`feat/<topic>` | `fix/<topic>` | `docs/<topic>` | `refactor/<topic>` | `schema/<topic>`
4. 在本地完成开发和验证
5. 推送并向 `main` 分支发起 PR

### 5.2 Commit 规范

见 [`DEVELOPMENT_GUIDE.md` §4.6](DEVELOPMENT_GUIDE.md#46-commit-规范)。

### 5.3 PR 描述要求

```markdown
## 标题
[feat/fix/docs/...] 简短描述

## 变更类别
- [ ] 架构分类：工作流 / 工具赋能 / 场景经验
- [ ] 是否影响模块注册（install-modules.json / install-profiles.json）
- [ ] 是否影响数据模型（schemas/）
- [ ] 是否影响配置模板（config-templates/）

## 修改文件清单
- [新增] skills/fraud-xxx/SKILL.md
- [修改] manifests/install-modules.json

## 验证清单
- [ ] 已确认六文件同步完成（如适用）
- [ ] 已检查跨文件引用路径正确
- [ ] 已确认 MCP 无强依赖
- [ ] 已阅读 DISCLAIMER.md
```

### 5.4 PR 审核

| 维度 | 检查重点 |
|------|---------|
| 架构分类 | 内容是否归属正确类别 |
| 注册完整性 | manifests 是否同步更新 |
| 编写规范 | frontmatter、格式、引用路径 |
| 松耦合 | 是否对 MCP 有强依赖 |
| 伦理合规 | 是否违反法律或道德准则 |
| 向后兼容 | 数据模型变更是否影响已有用户 |

审核通过后，维护者会 squash-merge 到 `main` 分支。
