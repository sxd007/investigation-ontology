---
name: mcp-integration
description: 调查 MCP 能力目录 — 记录本插件生态中可用的 MCP 服务器类型及能力说明。MCP 与技能之间遵循松耦合原则：技能描述分析需求，模型自行编排 MCP 调用。
origin: efio
---

# MCP 能力目录

本技能是 MCP 配置的**学习型参考库**。MCP 的实际配置向导由 `/efio:cold-start` 的 Phase 2.5 提供。若需动态切换 MCP 配置，请运行 cold-start 或编辑项目 `.mcp.json`。

本文件记录 investigation-ontology 生态中可用的 MCP 服务器类型及其能力说明。MCP 与技能之间遵循**松耦合原则**——技能不绑定具体 MCP，MCP 不驱动技能流程。

## 配置前置检查

在执行本技能的业务操作前，按以下流程检查用户配置：

```
检查 {配置路径}/team-profile.md
├── 不存在 / 含 [PLACEHOLDER] / 含 PAUSED 标记
│   └── 自动进入 /efio:cold-start 配置向导，完成后继续当前操作
└── 配置就绪 → 继续
```

详细规则参见 `config-templates/config-loader.md`。

此技能读取的配置项：
- team-profile：集成状态表（自动填充，用于能力映射报告输出）

## 核心原则

### 松耦合模型

```
技能：描述分析需求
  （如"检查笔录中是否存在模糊限制语模式"）
      │
      │  模型同时看到
      │  ├── 技能指令（要做什么分析）
      │  └── 可用 MCP 工具列表（环境能力）
      │
      ▼
模型：自行判断是否调用 MCP 来辅助完成分析
  （检测到有语言分析工具可用 → 调用；不可用 → 直接分析）
```

### 四条原则

**1. MCP 是环境能力，不是技能依赖**
- 技能不得假设任何一个 MCP 存在
- 技能必须能完全脱离 MCP 独立执行
- MCP 是分析速度的提升，不是分析能力的补充

**2. skill 中写"需要什么分析"，不写"调用哪个工具"**
- ✅ 正确：*"分析笔录中的语言特征，可使用语言分析类 MCP 加速"*
- ❌ 错误：*"调用 investigation-sentiment 的 analyze_sentiment 方法"*
- 由模型根据可用工具列表自行匹配

**3. 任何 MCP 辅助步骤必须有 fallback**
- 必须说明"该 MCP 不可用时如何完成"
- 禁止出现 MCP 不可用时工作流中断的设计

**4. MCP 具体名称和工具名不写入 skill 文本**
- MCP 服务器名、工具名、参数结构都不写入 SKILL.md
- 唯一例外：本目录和 `mcp-configs/mcp-servers.json`
- 技能中只写"文件系统类 MCP""语言分析类 MCP"等类型描述

### 配置状态检查

运行 `/efio:cold-start --check-integrations` 可检查当前环境已配置了哪些 MCP 服务器及其状态。

---

## MCP 能力目录

以下按能力类型列出本插件生态中可能配置的 MCP 服务器。**有真实包的注明包名，暂无成熟包的标注 placeholder。**

### 一、已确认可用的 MCP

| 能力类型 | 对应包名 | 调查场景 | 不可用时 |
|---------|---------|---------|---------|
| 文件系统操作 | `@modelcontextprotocol/server-filesystem` | 证据底稿存取、案件文件检索 | 手动指定文件路径 |
| 结构化推理 | `@modelcontextprotocol/server-sequential-thinking` | 假设推演、逻辑一致性验证 | 模型直接完成推理 |
| 数据库查询 | `@modelcontextprotocol/server-sqlite` | 证据登记库查询、交易数据探查 | 使用 CSV/Excel 替代 |
| 网络搜索 | HTTP MCP（需自配服务端点） | OSINT 公开信息检索 | 浏览器手动搜索 |

### 二、有需求但暂无成熟包的 MCP（placeholder）

以下 MCP 类型在调查场景中有明确需求，但目前没有经过验证的现成 MCP 包。
标记为 `placeholder`，有新包发布后可接入。

| 能力类型 | 需求场景 | 当前 fallback |
|---------|---------|-------------|
| 语言/情感分析 | 笔录语言特征分析、CAUTIOUS 词库 | 由模型在文本中直接分析 |
| Excel/财务分析 | Benford 定律、趋势分析 | 手动审查 Excel 文件 |
| PDF 文档分析 | 合同提取、版本对比 | 手动打开 PDF 文件 |
| 邮件取证 | 邮件头解析、元数据分析 | 文本编辑器手动查看 |
| 图表可视化 | 资金流向图、关系图谱 | 文本表格描述 |
| 企业信息查询 | 工商注册、股权结构 | 浏览器手动查询公开信息 |

### 三、自定义 MCP

用户可配置自己的调查 MCP 服务器。只需在项目 `.mcp.json` 或 `~/.claude.json` 中添加，即可自动发现可用工具。所有技能无需任何修改，模型会自动匹配新工具的能力。

---

## 与技能的关系

每个领域技能都有自己的**分析辅助工具**小节（而非 MCP 调用节），格式统一为：

```
## 分析辅助工具

以下工具类型可辅助加速本技能的分析流程。这些工具不是必须的——
未配置时，由模型按分析标准直接完成。

### [能力类型]类 MCP（如配置）
- 可用于：[具体场景]
- 不可用时：[替代方法]

**工作流示意（流程固定，工具可选）：**
1. [步骤描述]
2. [步骤描述]
...
```

这与 claude-for-legal 的写法一致：条件式、类型化、始终带 fallback。

## Related
- **注册指南:** [docs/mcp注册指南.md](../../docs/mcp注册指南.md) — MCP 注册通道（用户级/项目级/插件级/CLI）和选择策略
- **配置详情:** [mcp-configs/mcp-servers.json](../../mcp-configs/mcp-servers.json), [.mcp.json](../../.mcp.json)
- **文档:** [capability-surface-selection.md](../../docs/capability-surface-selection.md)
- **Skills:** 所有 8 个领域技能均遵循本原则
