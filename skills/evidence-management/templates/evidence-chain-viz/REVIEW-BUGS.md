# 证据链可视化机制 — 系统性 Bug Review

> 审查范围：`scan-chain.py` ↔ `evidence_chain_injector.js` ↔ `evidence_chain_viewer.html` 的完整数据流
> 审查日期：2026-07-14

## 数据流概览

```
节点文件 (nodes/*.md|json)
    │
    ├─→ scan-chain.py (Python)     → CLI 检查 / Mermaid / 触发 HTML 生成
    │      自定义 YAML frontmatter 解析器
    │
    └─→ evidence_chain_injector.js (Node.js)  → 注入 7 个数据块到 HTML 模板
           自定义 YAML frontmatter 解析器
           ↓
    evidence_chain_viewer.html (浏览器)  → 4-tab 可视化
           消费 CASE_DATA / NODES_DATA / EDGES_DATA / CHAINS_DATA /
                  HYPOTHESIS_DATA / ONTOLOGY_DATA / GOVERNANCE_ISSUES
```

**根因分析**：两个解析器（Python / JavaScript）各自独立实现 YAML frontmatter 解析，对同一份节点文件产生不同的解析结果。当数据结构发生微调（缩进变化、格式变化、字段增减），两个解析器的行为分歧导致可视化与实际数据不一致。

---

## 🔴 CRITICAL — 导致可视化数据错误或丢失

### Bug 1: injector.js 无法解析 block 格式的简单 ID 列表（含真实案例验证）

**文件**：`evidence_chain_injector.js` 第 89-98 行

**问题**：injector.js 的 `relations` 解析器只能处理两种格式：
1. block 格式但要求列表项含 `id:` 键（`- id: EV-001`）
2. 内联数组格式（`supports: ["ARG-001"]`）

但**无法处理** block 格式的简单 ID 列表：
```yaml
# 这是所有模板中的标准格式（见 LS-NNN.md, EV-NNN.md, ARG-NNN.md 等）
relations:
  supports:
    - ARG-001          # ← 简单 ID，无 id: 键
  contradicts:
    - HYP-002          # ← 简单 ID，无 id: 键
  involves:
    - ENT-001          # ← 简单 ID，无 id: 键
```

同样，`derived_from` 如果用简单格式也会失败：
```yaml
# FND-001.md — 真实案例 (CASE-2026-001)
relations:
  derived_from:
    - ARG-001          # ← 简单 ID，无 id: 键 → 解析失败！
```

**根因**：第 93 行的 id 匹配正则要求 `id:` 前缀：
```javascript
// 只匹配 "- id: xxx" 格式，不匹配 "- xxx" 格式
tm[2].matchAll(/^[ \t]+-[ \t]+id:[ \t]+([^\s"']+|"[^"]+"|'[^']+')/gm)
```

**对比**：Python 解析器（`scan-chain.py` 第 277 行）的 `_parse_nested_dict` 正确处理了两种格式：
```python
# kv 匹配 "- id: xxx" 格式
kv = re.match(r"^(\w[\w_]*):\s*(.*)", content)
if kv:
    obj = {kv.group(1): strip_quotes(kv.group(2).strip())}
else:
    # else 分支处理 "- xxx" 简单格式
    current_list.append(strip_quotes(content))
```

**影响**：
- `supports` 边完全丢失（LS→ARG, ARG→FND 连接不在 EDGES_DATA 中）
- `contradicts` 边完全丢失
- `involves` 边完全丢失（实体关联不可见）
- `corroborated_by` 边完全丢失
- `addresses` 边完全丢失
- `derived_from` 如果用简单格式也会丢失（见真实案例）
- HYP 视图的 `supported_by` / `contradicted_by` 如果用 block 格式也会丢失
- **这是最严重的 bug**，导致 HTML 可视化中关系大面积丢失

#### ✅ 真实案例验证 (CASE-2026-001)

> 来源：用户提交的《FND-ARG-LS-EV关系缺失根因分析报告》

**实际现象**：
- ✅ EV→LS 关系：正常显示（EV 为 JSON 格式，或 LS 的 `derived_from` 用了详细格式 `- id: EV-001`）
- ✅ LS→ARG 关系：正常显示（同理）
- ❌ ARG→FND 关系：**缺失**（FND-001.md 的 `derived_from` 用了简单格式 `- ARG-001`）
- ❌ FND 节点 `relations` 字段：显示为空对象 `{}`

**实际数据对比**：

| 环节 | 数据 | 状态 |
|------|------|------|
| FND-001.md 文件 | `relations: derived_from: - ARG-001` | ✅ 正确 |
| scan-chain.py 解析 | `{relations: {derived_from: ["ARG-001"]}}` | ✅ 正确 |
| injector.js 解析 | `{relations: {}}` | ❌ 空对象 |
| HTML EDGES_DATA | 缺少 `ARG-001 → FND-001` 边 | ❌ 缺失 |

**选择性故障模式**：此 bug 的隐蔽性在于——同一个 `relations` 块中，用了详细格式（`- id: EV-001\n  excerpt: "..."`）的关系能被解析，而用了简单格式（`- ARG-001`）的关系被静默丢弃。这导致部分关系正常、部分关系缺失，不易察觉。

> **注**：用户报告中提到"evidence_chain_injector.js文件不存在"——经核实文件存在（`templates/evidence-chain-viz/evidence_chain_injector.js`），可能是案件目录下的路径引用问题。用户报告建议的长期方案"将 FND 转为 JSON 格式"是不必要的——根因是正则匹配缺陷，修复正则即可。

**修复方案**：在 block-list 正则匹配后，增加对简单 ID 格式的 fallback：

```javascript
// 在第 97 行后添加：处理 "- ID" 简单格式
const simpleMatches = [...tm[2].matchAll(/^[ \t]+-[ \t]+([A-Z]+-\d+[^\s]*)\s*$/gm)];
for (const sm of simpleMatches) {
    // 检查是否已被 id: 格式匹配（避免重复）
    const alreadyMatched = items.some(it => it.id === sm[1]);
    if (!alreadyMatched) {
        items.push({ id: sm[1], excerpt: '', form: 'text' });
    }
}
```

---

### Bug 2: `supported_by` 被混入 `sources` 产生错误的 `derived_from` 边

**文件**：`evidence_chain_injector.js` 第 170-177 行 + 第 314-325 行

**问题**：`loadNodes` 中将 `supported_by` 合并进 `sources`（本意是统一上游引用）：

```javascript
const derivedFrom = [
    ...(fm.relations?.derived_from || []),
    ...(fm.relations?.supported_by  || []),   // ← 混入
].map(r => ({ id: r.id || r, ... }));
```

但 `buildEdges` 将 `sources` 中的所有项统一生成 `derived_from` 类型的边：

```javascript
// 第 318-321 行
for (const src of node.sources) {
    edges.push({ from: src.id, to: id, relation_type: 'derived_from', ... });
}
```

**影响**：
1. HYP 节点的 `supported_by` 关系被错误标记为 `derived_from`，边颜色为灰蓝而非绿色
2. `buildChainTree` 沿 `sources` 递归构建链树，会将 HYP 的 `supported_by` 引用混入 FND 推理链
3. `collectChainIds` 同理，治理检查可能误报

**修复方案**：分离 `derived_from` 和 `supported_by`，不要合并到 `sources`：

```javascript
const derivedFrom = (fm.relations?.derived_from || []).map(r => ({
    id: r.id || r,
    excerpt: (r.excerpt || '').slice(0, 80),
    form: r.form || 'text',
}));
// supported_by 不混入 sources，由 buildEdges 从 relations 字典独立处理
```

---

### Bug 3: `supported_by` 产生重复边

**文件**：`evidence_chain_injector.js` 第 314-355 行

**问题**：由于 Bug 2，`supported_by` 被混入 `sources`，`buildEdges` 从 `sources` 生成 `derived_from` 边。同时 `buildEdges` 的第二步从 `relations` 字典逐类型生成边时，`supported_by` 不在跳过列表中（只跳过了 `derived_from`），因此又生成一条 `supported_by` 边。

```javascript
// 第 330 行：只跳过 derived_from
if (relType === 'derived_from') continue;
// supported_by 不跳过 → 生成 supported_by 边
```

**影响**：同一对节点之间出现两条边（一条 `derived_from` + 一条 `supported_by`），虽然 `seen` Set 因 `relation_type` 不同不会去重，但可视化中出现重复连线。

**修复方案**：修复 Bug 2 后此问题自动消失。或在 `buildEdges` 中也跳过 `supported_by`：

```javascript
if (relType === 'derived_from' || relType === 'supported_by') continue;
```

---

### Bug 4: XMind 视图中边 excerpt 标签永远不显示

**文件**：`evidence_chain_viewer.html` 第 633 行

**问题**：`xCollectEdges` 推入的边方向是 `{from: parent, to: child}`（第 605 行），但 `EDGES_DATA` 中的边方向是 `{from: source(child), to: node(parent)}`。excerpt 查找使用正向匹配，方向不一致：

```javascript
// 第 605 行：推入方向 parent → child
edges.push({..., from: layout.id, to: c.id, ...});

// 第 633 行：查找方向 from→to，但 EDGES_DATA 是 child→parent
const edgeData = EDGES_DATA.find(ed => ed.from === e.from && ed.to === e.to);
// ed.from(child) === e.from(parent) → false → 永远找不到
```

**对比**：同函数内的 `relation_type` 查找（第 602-603 行）正确使用了双向匹配：
```javascript
const edgeData = EDGES_DATA.find(ed => ed.from === c.id && ed.to === layout.id) ||
                 EDGES_DATA.find(ed => ed.from === layout.id && ed.to === c.id);
```

**影响**：所有 `derived_from` 边上的 excerpt 引用文本（如"设备在广州激活"）在 XMind 视图中永远不显示。

**修复方案**：

```javascript
// 第 633 行改为双向匹配
const edgeData = EDGES_DATA.find(ed =>
    (ed.from === e.from && ed.to === e.to) ||
    (ed.from === e.to && ed.to === e.from)
);
```

---

### Bug 5: `buildChainTree` 共享 `visited` Set 导致菱形依赖被剪枝

**文件**：`evidence_chain_injector.js` 第 360-375 行

**问题**：`buildChainTree` 使用共享的 `visited` Set，当一个节点被多个父节点引用时（菱形依赖），只在第一个父节点下出现：

```javascript
function buildChainTree(nodes, rootId, visited) {
    visited = visited || new Set();
    // ...
    visited.add(rootId);  // ← 标记已访问
    // ...
    for (const src of node.sources) {
        const child = buildChainTree(nodes, src.id, visited);  // ← 共享 visited
        if (child) children.push(child);
    }
}
```

**对比**：Python 版本（`scan-chain.py` 第 461 行）使用 `visited.copy()` 为每个分支创建副本：
```python
children.append(_build_tree(ref["id"], graph, visited.copy(), depth + 1))
```

**影响**：调查证据链中菱形依赖非常常见（如同一份 EV 证据被多条 LS 线索引用），被剪枝后：
- 树结构不完整，部分分支消失
- 叶子节点计数 (`xCountLeaves`) 错误，导致布局垂直间距错乱
- XMind 图整体高度可能小于实际需要

**修复方案**：

```javascript
function buildChainTree(nodes, rootId, visited) {
    visited = visited || new Set();
    const node = nodes[rootId];
    if (!node || visited.has(rootId)) return null;
    // ...
    for (const src of node.sources) {
        const child = buildChainTree(nodes, src.id, new Set(visited));  // ← 每分支副本
        if (child) children.push(child);
    }
}
```

---

## 🟠 HIGH — 导致数据解读错误

### Bug 6: `derived_from` 的 excerpt 误绑到错误项

**文件**：`evidence_chain_injector.js` 第 95 行

**问题**：excerpt 搜索从当前 item 的位置开始向后扫描整个 `tm[2]` 文本，如果当前项没有 excerpt 但后续项有，会错误匹配：

```javascript
const excerptMatch = tm[2].slice(im.index).match(/excerpt:[ \t]+"((?:[^"\\]|\\.)*)"/);
```

**示例**：
```yaml
derived_from:
    - id: EV-001
      # 无 excerpt
    - id: EV-002
      excerpt: "激活日志"
```
处理 EV-001 时，`tm[2].slice(im.index)` 从 EV-001 位置开始搜索，会匹配到 EV-002 的 excerpt "激活日志"，错误绑定到 EV-001。

**影响**：边的 excerpt 标签显示错误的引用内容。

**修复方案**：限制 excerpt 搜索范围到当前项的行范围：

```javascript
// 找到下一个 "- " 开头的行或文本末尾，作为当前项的边界
const nextItemMatch = tm[2].slice(im.index + 1).match(/^[ \t]+-[ \t]+/m);
const itemEnd = nextItemMatch ? im.index + 1 + nextItemMatch.index : tm[2].length;
const itemText = tm[2].slice(im.index, itemEnd);
const excerptMatch = itemText.match(/excerpt:[ \t]+"((?:[^"\\]|\\.)*)"/);
```

---

### Bug 7: `ontology_ref.sealed: false` 被解析为 truthy 字符串

**文件**：`evidence_chain_injector.js` 第 131-139 行

**问题**：YAML frontmatter 中的布尔值 `sealed: false` 被解析为字符串 `"false"`，而 JavaScript 中 `"false"` 是 truthy：

```javascript
const kvRe = /^\s+(\w[\w_-]*):\s*(.+)$/gm;
// ...
let sv = sm[2].trim();
if ((sv.startsWith('"') && sv.endsWith('"')) || ...)
    sv = sv.slice(1, -1);
if (sv) subDict[sm[1]] = sv;  // sv = "false" (string, truthy)
```

后续在 `computeGovernance` 中：
```javascript
const sealed = ontologyRef.sealed || (nodeType === 'EV' ? ls === 'SEALED' : false);
// ontologyRef.sealed = "false" (truthy) → sealed = "false" → 被视为 true
```

**影响**：所有声明 `sealed: false` 的 EV/ENT 节点被错误标记为已封存。

**修复方案**：增加布尔值转换：

```javascript
if (sv === 'true') sv = true;
else if (sv === 'false') sv = false;
subDict[sm[1]] = sv;
```

---

### Bug 8: `form` 字段永远默认为 `'text'`

**文件**：`evidence_chain_injector.js` 第 96 行

**问题**：`derived_from` 项的 `form` 字段从未被提取，始终为 `'text'`：

```javascript
items.push({ id, excerpt: excerptMatch ? excerptMatch[1] : '', form: 'text' });
// form 永远是 'text'，不读取 YAML 中的 form: data / form: screenshot 等
```

**影响**：`form` 信息丢失。虽然当前 HTML viewer 未深度使用 `form` 字段，但 EDGES_DATA 中的 `form` 值不准确，影响后续扩展。

**修复方案**：

```javascript
const formMatch = itemText.match(/form:[ \t]+(\S+)/);
items.push({ id, excerpt: excerptMatch ? excerptMatch[1] : '', form: formMatch ? formMatch[1] : 'text' });
```

---

## 🟡 MODERATE — 导致显示不一致

### Bug 9: XMind 卡片状态点不处理 HYP 的 active/confirmed/rejected 状态

**文件**：`evidence_chain_viewer.html` 第 657 行

**问题**：XMind 卡片中的状态点只检查 `ready` 和 `draft`，HYP 节点的 `active`/`confirmed`/`rejected` 状态全部显示为灰色：

```javascript
style="background:${c.node.status==='ready'?'#52c97a':c.node.status==='draft'?'#e8a020':'#4a6880'}"
// active/confirmed/rejected → 全部 #4a6880 (灰)
```

**影响**：HYP 节点在推理链视图中的状态点颜色错误。

**修复方案**：

```javascript
const statusColors = {ready:'#52c97a', draft:'#e8a020', superseded:'#4a6880',
                      active:'#4ecdc4', confirmed:'#52c97a', rejected:'#e85c5c'};
style="background:${statusColors[c.node.status]||'#4a6880'}"
```

---

### Bug 10: scan-chain.py 中 HYP 节点 status 默认为 "draft" 而非 "active"

**文件**：`scan-chain.py` 第 345 行

**问题**：所有节点的 status 默认为 `"draft"`，但 HYP 节点的有效状态是 `active/rejected/confirmed`，不包含 `draft`：

```python
status = meta.get("status", "draft")  # HYP 无 status → draft → 不在 VALID_STATUS_HYP 中
```

**影响**：HYP 节点如缺少 `status` 字段，`--validate` 会报 "无效状态" 警告。

**修复方案**：

```python
node_type = meta.get("type", "")
default_status = "active" if node_type == "hypothesis" else "draft"
status = meta.get("status", default_status)
```

---

### Bug 11: HYP confidence = 0 时不显示置信度条

**文件**：`evidence_chain_injector.js` 第 447 行 + `evidence_chain_viewer.html` 第 720 行

**问题**：`0` 是 falsy，`h.confidence || null` 会将 `0` 转为 `null`：

```javascript
confidence: h.confidence || null,  // h.confidence = 0 → null
```

```javascript
if (h.confidence !== null) {  // null → 不渲染置信度条
```

**影响**：confidence 为 0 的假设不显示置信度条。

**修复方案**：

```javascript
confidence: h.confidence !== undefined && h.confidence !== null ? h.confidence : null,
```

---

### Bug 12: Python 解析器和 JavaScript 解析器的文件过滤不一致

**文件**：`scan-chain.py` 第 333-338 行 vs `evidence_chain_injector.js` 第 150 行

**问题**：
- Python：处理 `nodes/` 下所有非目录文件（`.json` 用 JSON 解析，其他用 frontmatter 解析）
- JavaScript：只处理匹配 `/^[A-Z]+-\d+\.(md|json)$/` 的文件

**影响**：如果 `nodes/` 目录中存在非标准命名的文件（如 `EV-001.note.md` 或 `README.md`），两个工具的节点集合不一致，导致检查结果与可视化不匹配。

**修复方案**：统一过滤逻辑。建议 JavaScript 端也处理所有 `.md`/`.json` 文件，由解析器决定是否有效。

---

## 🔵 LOW — 边界情况或设计不一致

### Bug 13: injector.js `alternative_explanations` 解析丢失子字段

**文件**：`evidence_chain_injector.js` 第 111-118 行

**问题**：`flatArrRe` 正则只匹配 `- ` 开头的行，FND 模板中的 `alternative_explanations` 子字段（`status:`, `response:`）被丢失：

```yaml
alternative_explanations:
  - explanation: "[替代解释]"
    status: rejected         # ← 丢失
    response: "[排除理由]"   # ← 丢失
```

**影响**：不影响可视化（这些字段未被 viewer 使用），但数据不完整。

---

### Bug 14: injector.js `relations` block 正则要求精确 2 空格缩进

**文件**：`evidence_chain_injector.js` 第 89 行

**问题**：`/^[ \t]{2}(\w+):\s*\n/` 要求子键恰好 2 个空格缩进。如果用户使用 4 空格缩进（部分编辑器默认），整个 `relations` 块解析失败。

**对比**：Python 解析器使用 `_collect_indented` 按相对缩进处理，更灵活。

**影响**：4 空格缩进的节点文件在 HTML 可视化中 `relations` 完全丢失。

---

### Bug 15: injector.js `nestedDictRe` 可能重复匹配已被 `flatArrRe` 处理的键

**文件**：`evidence_chain_injector.js` 第 122-140 行

**问题**：`nestedDictRe` 的 guard 是 `fm[key] !== undefined`，但 `flatArrRe` 先运行。如果 `flatArrRe` 将某个键设为错误值（如 Bug 13 中的 `alternative_explanations`），`nestedDictRe` 会跳过该键，无法修正。

**影响**：数据解析错误不可恢复。

---

## 修复优先级

| 优先级 | Bug # | 影响 | 修复复杂度 |
|--------|-------|------|-----------|
| P0 | Bug 1 | 所有非 derived_from 关系丢失 | 中 |
| P0 | Bug 2 | supported_by 产生错误边类型 | 低 |
| P0 | Bug 3 | supported_by 产生重复边 | 低（修 Bug 2 后自动消失） |
| P0 | Bug 4 | 边 excerpt 永不显示 | 低 |
| P0 | Bug 5 | 菱形依赖被剪枝 | 低 |
| P1 | Bug 6 | excerpt 误绑 | 中 |
| P1 | Bug 7 | sealed 误判 | 低 |
| P1 | Bug 8 | form 字段丢失 | 低 |
| P2 | Bug 9 | HYP 状态点颜色错误 | 低 |
| P2 | Bug 10 | HYP 默认状态 | 低 |
| P2 | Bug 11 | confidence=0 不显示 | 低 |
| P2 | Bug 12 | 文件过滤不一致 | 低 |
| P3 | Bug 13-15 | 数据不完整/边界情况 | 中 |

---

## 根因总结

1. **双解析器 divergence（核心根因，已被真实案例验证）**：Python 和 JavaScript 各自实现 YAML frontmatter 解析器，对同一份数据产生不同结果。CASE-2026-001 中，scan-chain.py 正确解析了 FND-001.md 的 `derived_from: - ARG-001`，但 injector.js 将其解析为空对象 `{}`。长期维护应考虑统一解析逻辑（如用 JS 实现唯一的解析器，Python 端调用或移植相同逻辑）。

2. **正则过度耦合缩进和格式**：JavaScript 解析器的正则表达式硬编码了空格数量（`{2}`, `{4}`, `{6}`），且要求 `id:` 键前缀。对缩进变化和格式变化零容忍——同一个 `relations` 块中，详细格式（`- id: EV-001\n  excerpt: "..."`）能被解析，简单格式（`- ARG-001`）被静默丢弃。这种"选择性故障"极大增加了排查难度。

3. **sources 字段语义过载**：`loadNodes` 将 `derived_from` 和 `supported_by` 合并到 `sources`，导致下游所有消费 `sources` 的函数（`buildEdges`, `buildChainTree`, `collectChainIds`）行为偏差。

4. **边方向不一致**：`buildEdges` 生成边时使用 `from=source, to=node` 方向，但 `xCollectEdges` 推入边时使用 `from=parent, to=child` 方向，导致查找时方向不匹配。

5. **静默失败设计缺陷**：injector.js 在解析失败时不报错、不警告，直接返回空对象。用户报告中 FND-001.relations = `{}` 就是典型表现——没有任何错误提示，只是数据悄悄丢失。应在解析后增加完整性校验（如：节点文件中声明了 `relations` 但解析结果为空时输出 WARN）。

---

## 与用户根因分析报告的交叉验证

> 用户报告：`FND-ARG-LS-EV关系缺失根因分析报告.md`

### 用户报告中的准确判断

| 判断 | 评价 |
|------|------|
| 根因在 injector.js 而非 scan-chain.py | ✅ 正确——与本次审查一致 |
| scan-chain.py 正确解析了 FND-001.md | ✅ 正确——Python 解析器处理了简单 ID 格式 |
| injector.js 对 MD 格式节点的 relations 解析失败 | ✅ 正确——定位到了正确的组件 |
| JSON 格式节点 relations 正常 | ✅ 正确——JSON 不经过 YAML 解析器 |
| FND-001.relations 在 HTML 中显示为 `{}` | ✅ 正确——与本次审查 Bug 1 完全吻合 |

### 用户报告中的不准确之处

| 判断 | 修正 |
|------|------|
| "evidence_chain_injector.js文件不存在" | ❌ 文件存在于 `templates/evidence-chain-viz/evidence_chain_injector.js`（660 行），可能是案件目录路径引用问题 |
| "HTML注入器的解析逻辑问题"（未定位具体原因） | 补充：具体原因是第 93 行正则 `/^[ \t]+-[ \t]+id:/` 只匹配 `- id: xxx`，不匹配 `- ARG-001` 简单格式 |
| 长期方案"将所有FND节点从.md转为.json" | ❌ 不必要——根因是正则缺陷，修复正则即可。转 JSON 会丢失 markdown body 内容（推理路径、剩余怀疑等），影响详情面板展示 |
| 未提及 `supports`/`contradicts`/`involves` 等其他关系类型的丢失 | 补充：同一 bug 影响所有用 block 简单格式声明的关系类型，不仅仅是 `derived_from` |
| 未提及 excerpt 方向不匹配、菱形依赖剪枝等问题 | 补充：这些问题与 Bug 1 独立，即使修复 Bug 1 仍会存在 |
