# 工作区登记表（E2E fixture）

## 纳入汇总

| 别名 | 路径 | 主题 | 台账 |
|---|---|---|---|
| **阿尔法空间** | `d:/work/90.codes/investigation-ontology/cc-investigation-ontology/plugins/space-task-monitor/examples/e2e/ws-alpha` | E2E 测试空间（有台账） | ✅ 1 项目 / 1 独立任务 |
| **贝塔空间** | `d:/work/90.codes/investigation-ontology/cc-investigation-ontology/plugins/space-task-monitor/examples/e2e/ws-beta` | E2E 测试空间（无台账，验证缺数据分支） | ❌ |
| **伽马空间** | `d:/work/90.codes/investigation-ontology/cc-investigation-ontology/plugins/space-task-monitor/examples/e2e/ws-gamma` | E2E 测试空间（只有 done/dropped 终态卡，验证未完成计数为 0） | ✅ 1 done / 1 dropped |

## 排除

| 路径 | 原因 |
|---|---|
| `d:/nowhere/deleted-ws` | 路径不存在（验证已删除标签） |
