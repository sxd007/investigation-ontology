# investigation-ontology 插件市场 🏪

**反舞弊调查域套件市场** — 单一仓库分发多个调查域套件，支持 Claude Code、CodeBuddy、Codex、WorkBuddy 四大平台。一次添加市场，按需安装套件。

## 套件目录

| 套件 | 版本 | 说明 | 状态 |
|------|------|------|------|
| [investigation-ontology](plugins/investigation-ontology/) | 1.1.0 | 反舞弊调查全流程套件 — 调查方法论、证据链管理、访谈分析、可视化报告、审计技术、24 技能 / 12 命令 / 7 代理 | ✅ 已发布 |

> 新套件规划中（如专项审计、合规检查等方向）。新套件落地形态：`plugins/<name>/` 子目录 + 市场清单加条目，详见 [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)。

## 添加本市场

```bash
# CodeBuddy / WorkBuddy CLI
/plugin marketplace add https://github.com/sxd007/investigation-ontology

# Claude Code
claude plugin marketplace add https://github.com/sxd007/investigation-ontology

# Codex — 在 .agents/plugins/marketplace.json 中配置
```

WorkBuddy GUI：插件页 → `+` 添加市场 → 输入上述 GitHub URL。

添加后即可按套件名安装：

```bash
/plugin install investigation-ontology@investigation-ontology
```

各套件的安装细节、技能清单与使用说明，见套件目录中对应套件的 README。

## 仓库布局（市场/套件两层对称制）

```
investigation-ontology/                  # 仓库根 = 市场根
├── .workbuddy-plugin/marketplace.json   # WorkBuddy 市场清单
├── .claude-plugin/marketplace.json      # Claude Code 市场清单
├── manifests/                           # 仓库级安装器（模块化按需安装声明）
├── docs/                                # 开发文档（架构、开发报告）
├── README.md  DEVELOPMENT_GUIDE.md  CONTRIBUTING.md
├── DISCLAIMER.md  LICENSE  SECURITY.md  CONNECTORS.md
└── plugins/                             # 套件层（并列，可扩展）
    ├── investigation-ontology/         # 主套件（24 技能，详见其 README）
    └── <future-suite>/                  # 未来套件，平级落户
```

**新增套件** = `plugins/<name>/` 新建子目录（含自己的四平台 plugin.json）+ 两份市场清单各加一条目。mixed-source 布局已实测验证，零结构变动。

## 文档导航

| 文档 | 用途 | 读者 |
|------|------|------|
| [套件目录](plugins/investigation-ontology/) | 各套件的 README（安装/技能/使用） | 最终用户 |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | 唯一开发方法论（跨平台规范、模块体系） | 开发者 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献工作流（分支策略、PR、伦理许可） | 贡献者 |
| [docs/ARCHITECTURE_NOTES.md](docs/ARCHITECTURE_NOTES.md) | 跨平台架构细节 | 开发者 |
| [DISCLAIMER.md](DISCLAIMER.md) | 免责声明与使用条款 | 所有使用者 |
| [SECURITY.md](SECURITY.md) | 安全策略与漏洞报告 | 所有使用者 |

## 兼容平台

| 平台 | 状态 | 说明 |
|------|------|------|
| CodeBuddy | ✅ | 主开发平台 |
| WorkBuddy | ✅ | 与 CodeBuddy 同引擎，共用插件包；工作区 opt-in 隔离 |
| Claude Code | ✅ | 共享技能/命令/代理，hooks 走 `.claude-plugin/` |
| Codex | ✅ | Shell hooks + MCP 配置走 `.codex-plugin/` |

## License

Apache-2.0 — 见 [LICENSE](LICENSE)。

## ⚠️ 重要免责声明

**本市场内套件均为反舞弊调查方法论知识工具集，不构成法律意见或专业调查建议。** AI 生成内容可能存在幻觉、偏见或过时信息，使用者有义务独立验证任何结论。使用前请务必阅读完整的 [DISCLAIMER.md](DISCLAIMER.md) 和各套件 README 中的免责条款。
