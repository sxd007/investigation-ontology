# 重构方案：统一到 Node.js 的 scan-chain.js

> 状态：待评审
> 日期：2026-07-15
> 目标：将 scan-chain.py + evidence_chain_injector.js 合并为单一 Node.js 工具，修复全部已知 bug，保持功能完整

---

## 1. 设计原则

1. **单一解析器**：一个 YAML frontmatter 解析器，移植自 Python 版的缩进感知状态机（已验证正确）
2. **单一运行时**：仅依赖 Node.js（Claude Code / CodeBuddy 保证可用），零外部依赖
3. **单一文件**：`scan-chain.js`，与 `scan-chain.py` 保持同构，便于理解和迁移
4. **功能等价或增强**：scan-chain.py 的所有功能 + injector.js 的所有功能，不丢任何能力
5. **AI fallback 清晰化**：新增 `--json-dump` 选项，AI 可读取 JSON 后直接注入模板

---

## 2. 架构对比

### 当前（双解析器）

```
用户 / AI
    │
    ├─ 有 Python ──→ scan-chain.py ── subprocess ──→ injector.js ──→ HTML
    │                   (Python 解析器)                (JS 解析器，有 bug)
    │
    └─ 无 Python ──→ injector.js（直接调用）──────────→ HTML
                       (JS 解析器，有 bug)
```

### 目标（单一解析器）

```
用户 / AI
    │
    ├─ 有 Node.js ─→ scan-chain.js ──→ 检查 / Mermaid / HTML（全部功能）
    │                   (一个解析器，正确)
    │
    └─ 无 Node.js ─→ AI 读取节点 → AI 构造 JSON → AI 直接注入模板 → HTML
                       (--json-dump 输出格式文档供 AI 参考)
```

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `scripts/scan-chain.js` | **新建** | 统一工具，~900 行 |
| `scripts/scan-chain.py` | **保留** | 标记 deprecated，头注释引导到 scan-chain.js |
| `templates/evidence-chain-viz/evidence_chain_injector.js` | **废弃** | 功能已合并到 scan-chain.js |
| `templates/evidence-chain-viz/evidence_chain_viewer.html` | **修改** | 修复 Bug 4/9/11（3 处小改） |
| `SKILL.md` | **修改** | 更新命令引用 |
| `references/visualization-guide.md` | **修改** | 更新工具说明 |
| `commands/evidence.md` | **修改** | 更新命令路径 |
| `templates/evidence-chain-viz/SCAN-CHAIN-JS-SPEC.md` | **新建** | 本文档 |

---

## 4. scan-chain.js 模块设计

单文件，按功能分区（与 scan-chain.py 的结构对应）：

```
scan-chain.js (~900 行)
│
├── §1 常量定义
│   ├── NODE_TYPES / TYPE_PREFIX_MAP
│   ├── RELATION_SEMANTICS（从 injector.js 移植）
│   ├── CHAIN_RULES
│   ├── REQUIRED_FIELDS / VALID_TYPES / ID_PATTERN
│   └── ONTOLOGY_LIFECYCLE_STATUSES
│
├── §2 YAML Frontmatter 解析器（从 Python 移植，缩进感知）
│   ├── parseFrontmatter(filepath) → { frontmatter, body }
│   ├── collectIndented(lines, start, baseIndent) → lines[]
│   ├── parseNestedDict(lines) → dict
│   ├── parseListItems(lines) → array
│   ├── parseInlineList(val) → array
│   └── stripQuotes(val) → string
│
├── §3 节点加载与归一化
│   ├── loadAllNodes(caseDir) → Map<id, node>
│   ├── loadRegistry(jsonPath) → Map<id, registryNode>
│   ├── mergeNodes(fileNodes, registryNodes) → Map<id, unifiedNode>
│   ├── normalizeRelations(rawRelations) → normalized
│   ├── flatIds(relations, relType?) → string[]
│   └── computeGovernance(typePrefix, ontologyRef) → governance
│
├── §4 图构建
│   ├── buildGraph(nodes) → { all, upstream, downstream }
│   └── collectChainIds(fndId, nodeMap, visited) → string[]
│
├── §5 检查逻辑（从 scan-chain.py 移植）
│   ├── checkIntegrity(nodes) → issues[]
│   ├── checkChains(nodes) → issues[]
│   ├── validateNodeFile(caseDir, relPath) → errors[]
│   └── validateNodes(caseDir, nodes) → errors[]
│
├── §6 可视化数据构建（从 injector.js 移植 + 修 bug）
│   ├── buildEdges(nodes) → edges[]
│   ├── buildChainTree(nodes, rootId, visited) → tree
│   ├── buildAllChains(nodes) → trees[]
│   ├── buildCaseInfo(caseDir, nodes) → caseInfo
│   ├── buildHypothesisData(nodes) → hypotheses[]
│   ├── buildOntologyData(nodes) → { objects, relations }
│   └── buildGovernanceIssues(nodes) → issues[]
│
├── §7 输出格式
│   ├── formatMermaid(nodes) → string
│   ├── formatTree(tree, indent) → string
│   └── reportIssues(issues) → void (print)
│
├── §8 HTML 渲染（从 injector.js 移植）
│   ├── generateHTML(caseInfo, nodes, edges, ...) → htmlString
│   └── jsonDump(nodes, edges, chains, ...) → jsonString
│
├── §9 索引同步
│   └── syncChainIndex(caseDir, nodes) → { added, removed, updated }
│
└── §10 CLI 主入口
    └── main() — argparse 等价，分发到各功能
```

---

## 5. YAML 解析器设计（核心——从 Python 移植）

这是所有 bug 的根源。Python 版用缩进感知状态机，JS 版用硬编码正则。移植 Python 的方法到 JS：

### 5.1 核心思路

```
不靠正则猜缩进空格数，而是：
1. 提取 --- 之间的 YAML 文本
2. 按行分割
3. 逐行处理，根据相对缩进确定层级
4. 对每个 key: value，根据 value 形态分支：
   - "key: [a, b]"     → 内联数组
   - "key: []"          → 空数组
   - "key:" 或 "key: |" → 收集缩进子行，递归处理
   - "key: value"       → 标量
5. 缩进子行处理：
   - 以 "- " 开头 → 列表项
   - 否则 → 嵌套字典
```

### 5.2 关键函数签名

```javascript
// 主入口
function parseFrontmatter(filepath) {
    // 读取文件，提取 --- 之间的 YAML
    // 返回 { frontmatter: {...}, body: "..." } 或 null
}

// 收集缩进大于 baseIndent 的连续行（移植自 _collect_indented）
function collectIndented(lines, startIdx, baseIndent) {
    // 遍历 lines[startIdx..]
    // 跳过空行和注释行
    // 遇到缩进 <= baseIndent 的非空行时停止
    // 返回收集的行数组
}

// 解析嵌套字典（移植自 _parse_nested_dict）
function parseNestedDict(lines) {
    // 处理 "subkey: value" 和 "subkey:" + 缩进列表
    // 列表项支持两种格式：
    //   "- id: EV-001\n  excerpt: ..."  → { id, excerpt, form }
    //   "- ARG-001"                      → "ARG-001"（简单格式）
    // 返回 { subkey: [...] }
}

// 解析列表项（移植自 _parse_list_items）
function parseListItems(lines) {
    // 处理 "- key: value" 和 "- value" 两种格式
    // 返回数组（对象或字符串）
}
```

### 5.3 类型修正（修复 Bug 7）

Python 解析器不需要处理布尔值/数字的类型转换（Python 的 YAML 解析返回字符串，后续逻辑不依赖类型）。但 JS 版的 `computeGovernance` 用 `ontologyRef.sealed ||` 判断真值，需要正确的布尔类型：

```javascript
function coerceValue(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    return val;  // 字符串
}
```

在 `parseNestedDict` 中对 scalar 值调用 `coerceValue`。

---

## 6. 统一节点模型

合并两个工具的节点模型，取各自所长：

```javascript
// scan-chain.js 内部的节点结构
{
    // ── 身份（两工具共有）──
    id: "EV-001",
    type: "evidence",           // 完整类型名（来自 frontmatter）
    typePrefix: "EV",           // ID 前缀（从 id 提取）
    status: "draft",

    // ── 内容（来自 injector.js，可视化需要）──
    title: "王赞供述: 扩容虚构",
    body: "## 关键内容摘要\n...",
    assertion: "王赞供述: 扩容虚构",
    intent: "",

    // ── 关系（来自 Python 的 normalize_relations，可视化用 relations 字典）──
    relations: {
        derived_from: [{ id: "EV-001", excerpt: "...", form: "data" }],
        supports: ["ARG-001"],           // 字符串数组
        contradicts: [],
        involves: ["ENT-001"],
        // ...
    },

    // ── sources（仅 derived_from，修复 Bug 2）──
    // supported_by 不再混入
    sources: [{ id: "EV-001", excerpt: "...", form: "data" }],

    // ── 本体绑定（来自 injector.js）──
    ontology_ref: {
        object_id: "ev-010",
        object_type: "Evidence",
        lifecycle_status: "VERIFIED",
        sealed: true                   // 正确的布尔值（修复 Bug 7）
    },
    governance: {
        is_verified: true,
        is_sealed: true,
        risk_level: "none"
    },

    // ── 类型特有字段（来自 injector.js）──
    confidence: "probable",             // FND/EV: string; HYP: number
    generated_by: "ai",
    reviewed_by: "",
    entity_type: null,
    role: null,

    // ── Registry 补充字段（来自 injector.js loadRegistry）──
    evidence_type: "documentary",
    collected_at: "2026-06-14T10:00:00",
    collected_by: "调查员",
    source: "合同文件",

    // ── 元数据（来自 Python）──
    file: "nodes/EV-001.md",
    has_old_sources: false,

    // ── 可视化排序（来自 injector.js）──
    _order: 0
}
```

### 6.1 关键修复点

| 字段 | 原 injector.js | 修复后 | 对应 Bug |
|------|---------------|--------|---------|
| `sources` | `derived_from` + `supported_by` 合并 | 仅 `derived_from` | Bug 2/3 |
| `relations` | 部分格式丢失（正则缺陷） | 全格式覆盖（缩进感知解析器） | Bug 1 |
| `ontology_ref.sealed` | 字符串 `"false"`（truthy） | 布尔值 `false` | Bug 7 |
| `sources[].form` | 永远 `'text'` | 从 frontmatter 提取 | Bug 8 |
| `status`（HYP） | 默认 `'draft'` | 按 type 默认：HYP→`'active'`，其他→`'draft'` | Bug 10 |

---

## 7. Bug 修复映射

### 7.1 在 scan-chain.js 中修复的 Bug

| Bug | 修复位置 | 修复方式 |
|-----|---------|---------|
| **Bug 1**：block 简单 ID 丢失 | §2 parseNestedDict | 移植 Python 的 else 分支：`- ARG-001` → 字符串项 |
| **Bug 2**：supported_by 混入 sources | §3 loadAllNodes | `sources` 只从 `derived_from` 构建 |
| **Bug 3**：supported_by 重复边 | §6 buildEdges | 修复 Bug 2 后自动消失；额外在 buildEdges 跳过 `supported_by` |
| **Bug 5**：菱形依赖剪枝 | §6 buildChainTree | `new Set(visited)` 每分支副本 |
| **Bug 6**：excerpt 误绑 | §6 buildEdges | 限制 excerpt 搜索到当前项行范围 |
| **Bug 7**：sealed 布尔值 | §2 coerceValue | `'true'→true, 'false'→false` |
| **Bug 8**：form 永远 text | §6 buildEdges | 从 frontmatter 提取 form 字段 |
| **Bug 10**：HYP 默认状态 | §3 loadAllNodes | 按 type 设置默认 status |
| **Bug 11**：confidence=0 | §6 buildHypothesisData | 用 `?? null` 替代 `\|\| null` |
| **Bug 12**：文件过滤不一致 | §3 loadAllNodes | 统一处理所有 .md/.json 文件 |

### 7.2 在 evidence_chain_viewer.html 中修复的 Bug

| Bug | 修复位置 | 修复方式 |
|-----|---------|---------|
| **Bug 4**：excerpt 方向不匹配 | 第 633 行 | 改为双向匹配 `(ed.from===e.from&&ed.to===e.to)\|\|(ed.from===e.to&&ed.to===e.from)` |
| **Bug 9**：HYP 状态点颜色 | 第 657 行 | 用 statusColors 映射表替代三元表达式 |

---

## 8. CLI 接口

与 scan-chain.py 保持一致，增强 `--html`（不再 subprocess）：

```
用法: node scan-chain.js <case_dir> [options]

选项:
  --list                 列出所有节点及关系类型
  --trace <NODE_ID>      追溯证据链 (derived_from)
  --integrity            完整性检查
  --check-chains         推理链逻辑完整性检查
  --validate             节点文件结构验证
  --sync                 同步 chain_nodes 索引
  --graph                Mermaid 流程图
  --html [OUTPUT]        交互式 HTML（默认 evidence_chain_output.html）
  --json-dump [OUTPUT]   输出 JSON 数据（供 AI fallback 使用）
```

### 8.1 `--html` 行为变化

```
之前（scan-chain.py --html）:
  Python 解析节点 → subprocess 调 injector.js → injector.js 重新解析 → 生成 HTML

之后（scan-chain.js --html）:
  JS 解析节点 → 构建 7 个数据块 → 直接注入模板 → 生成 HTML
  （一个进程，一次解析）
```

### 8.2 `--json-dump` 新增

输出 7 个数据块的 JSON 文件，格式与 HTML 模板中的注入格式完全一致：

```json
{
  "caseInfo": { ... },
  "nodes": { ... },
  "edges": [ ... ],
  "chains": [ ... ],
  "hypothesisData": [ ... ],
  "ontologyData": { ... },
  "governanceIssues": [ ... ]
}
```

**AI fallback 用途**：当 Node.js 不可用时，AI 读取节点文件 → 按 `--json-dump` 的格式构造 JSON → 直接替换 HTML 模板中的 `INJECTION_START_MARKER` ~ `INJECTION_END_MARKER` 区间 → 写出 HTML。

---

## 9. HTML 模板修改

`evidence_chain_viewer.html` 只需 2 处小修：

### 9.1 修复 Bug 4（第 633 行）

```javascript
// 之前（方向不匹配，永远找不到）：
const edgeData = EDGES_DATA.find(ed => ed.from === e.from && ed.to === e.to);

// 之后（双向匹配）：
const edgeData = EDGES_DATA.find(ed =>
    (ed.from === e.from && ed.to === e.to) ||
    (ed.from === e.to && ed.to === e.from)
);
```

### 9.2 修复 Bug 9（第 657 行）

```javascript
// 之前（只处理 ready/draft）：
style="background:${c.node.status==='ready'?'#52c97a':c.node.status==='draft'?'#e8a020':'#4a6880'}"

// 之后（全状态映射）：
const _statusColors = {ready:'#52c97a',draft:'#e8a020',superseded:'#4a6880',
                       active:'#4ecdc4',confirmed:'#52c97a',rejected:'#e85c5c'};
// 在 renderXMind 函数内使用：
style="background:${_statusColors[c.node.status]||'#4a6880'}"
```

---

## 10. 文档更新

### 10.1 SKILL.md 修改

```markdown
### 6. 证据链可视化

**生成可视化 HTML 的操作步骤：**

1. 确认案件目录路径（通常为 `cases/CASE-YYYY-NNN/`）
2. 读取 `evidence_registry.json` 和 `nodes/` 目录确认数据就绪
3. 执行 `node skills/evidence-management/scripts/scan-chain.js <case_dir> --html <output_path>.html`
   - 如环境中无 Node.js，由 AI 读取数据后直接注入 HTML 模板
   - AI fallback 参考 `--json-dump` 输出格式
4. 用浏览器打开生成的 HTML 文件
```

### 10.2 工具速查表修改

```markdown
| 命令 | 用途 |
|------|------|
| `scan-chain.js <case_dir> --list` | 列出所有节点和关系 |
| `scan-chain.js <case_dir> --trace FND-001` | 追溯 FND-001 完整证据链 |
| `scan-chain.js <case_dir> --integrity` | 完整性检查 |
| `scan-chain.js <case_dir> --check-chains` | 推理链逻辑检查 |
| `scan-chain.js <case_dir> --validate` | 节点结构验证 |
| `scan-chain.js <case_dir> --sync` | 同步 chain_nodes 索引 |
| `scan-chain.js <case_dir> --graph` | Mermaid 图预览 |
| `scan-chain.js <case_dir> --html output.html` | 交互式 HTML |
| `scan-chain.js <case_dir> --json-dump data.json` | JSON 数据输出（AI fallback） |
```

### 10.3 scan-chain.py 头部添加 deprecated 标记

```python
"""
⚠️ DEPRECATED: 此脚本已迁移到 scan-chain.js（Node.js）。
   新案件请使用: node scan-chain.js <case_dir> [options]
   本文件保留用于向后兼容，不再接收功能更新。
"""
```

---

## 11. 测试策略

### 11.1 解析器测试

构造测试用例覆盖所有 frontmatter 格式：

```yaml
# test-node-1.md — 详细格式 derived_from
relations:
  derived_from:
    - id: EV-001
      excerpt: "测试引用"
      form: data

# test-node-2.md — 简单格式 derived_from（Bug 1 触发场景）
relations:
  derived_from:
    - ARG-001

# test-node-3.md — 混合格式
relations:
  derived_from:
    - id: EV-001
      excerpt: "详细"
      form: data
    - EV-002              # 简单格式混在同一列表
  supports:
    - ARG-001
    - ARG-002
  contradicts:
    - HYP-002
  involves:
    - ENT-001

# test-node-4.md — 内联数组格式
relations:
  supports: ["ARG-001", "ARG-002"]
  contradicts: []

# test-node-5.md — 4 空格缩进（Bug 14 触发场景）
relations:
    derived_from:
        - id: EV-001
          excerpt: "四空格缩进"

# test-node-6.md — ontology_ref 含布尔值
ontology_ref:
  object_id: "ev-010"
  object_type: "Evidence"
  sealed: false           # Bug 7 触发场景

# test-node-7.json — JSON 格式
{"id": "EV-007", "type": "evidence", "relations": {"derived_from": ["EV-001"]}}
```

验证：每个测试用例的解析结果与 Python 解析器（scan-chain.py）的输出一致。

### 11.2 端到端测试

使用 CASE-2026-001 的实际数据（用户报告中的案例）：
1. `node scan-chain.js CASE-2026-001/ --html test.html`
2. 打开 test.html，验证 FND-001 的 relations 不再为空
3. 验证 ARG→FND 边存在且有正确的 relation_type
4. 验证 supports/contradicts/involves 边全部可见

### 11.3 回归测试

对 scan-chain.py 的每个 `--` 选项，验证 scan-chain.js 的输出一致：
- `--list`：节点列表格式一致
- `--trace FND-001`：链树结构一致
- `--integrity`：发现问题一致
- `--check-chains`：检查结果一致
- `--validate`：验证错误一致
- `--graph`：Mermaid 输出一致

---

## 12. 实施步骤

| 步骤 | 内容 | 预估行数 |
|------|------|---------|
| 1 | 编写 §2 YAML 解析器（从 Python 移植） | ~150 行 |
| 2 | 编写 §3 节点加载与归一化 | ~100 行 |
| 3 | 编写 §4 图构建 | ~40 行 |
| 4 | 移植 §5 检查逻辑（从 scan-chain.py 翻译） | ~200 行 |
| 5 | 移植 §6 可视化数据构建（从 injector.js + 修 bug） | ~180 行 |
| 6 | 移植 §7-8 输出与渲染 | ~100 行 |
| 7 | 编写 §9-10 索引同步与 CLI | ~80 行 |
| 8 | 修改 evidence_chain_viewer.html（2 处修复） | ~5 行 |
| 9 | 更新文档（SKILL.md / visualization-guide.md / evidence.md） | — |
| 10 | 测试 | — |

---

## 13. 不做什么

- **不删除 scan-chain.py** — 保留向后兼容，标记 deprecated
- **不删除 evidence_chain_injector.js** — 保留向后兼容，但 SKILL.md 不再引导使用
- **不引入 npm 依赖** — 解析器是手写的缩进感知状态机，不需要 js-yaml
- **不改 HTML 模板的 CSS/布局** — 只修 2 个 JS bug
- **不改节点文件格式规范** — 节点格式不变，是工具适配节点，不是节点适配工具
- **不改 evidence_registry.json schema** — 数据结构不变
