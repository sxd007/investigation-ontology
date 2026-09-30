#!/usr/bin/env node
// 维度产物初稿生成器（零依赖）：从评价基线引用的 digest 机械生成四维度分析产物的预填初稿。
// 与 scaffold-dimension.mjs 互补——后者复制空白模板骨架，本脚本填充机械可知的部分
// （目标清单/RCM 矩阵映射/无控风险/orphan 控制/主路径/返工边/交接点/指标与快照清单），
// 判断列（SMART 评级、severity、设计结论、P50/P90 等）一律留白 {…} 由 AI 评价填充。
//
// 用法:
//   node generate-dimension-drafts.mjs <assessment_root> --skill <goal|risk|control|efficiency> [--baseline baseline-vN] [--force]
//   node generate-dimension-drafts.mjs <output_dir> --skill <dim> --digest <digest.json>...   （场景二：无基线直接喂 digest）
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIM_TO_DIR = { goal: 'goal', risk: 'risk', control: 'control', efficiency: 'efficiency' };
const DIMENSIONS = Object.keys(DIM_TO_DIR);

// ---------- 工具 ----------
function cell(s, max = 50) {
  let v = String(s ?? '');
  v = v.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

function loadBaseline(root, name) {
  const dir = join(root, 'baselines');
  if (!existsSync(dir)) return null;
  let file = name ? join(dir, `${name}.json`) : null;
  if (!file || !existsSync(file)) {
    let meta = null;
    try { meta = JSON.parse(readFileSync(join(root, 'meta.json'), 'utf8')); } catch { /* 无 meta */ }
    const current = meta?.current_baseline;
    if (!name && current && existsSync(join(dir, `${current}.json`))) file = join(dir, `${current}.json`);
    else {
      const versions = readdirSync(dir).map((f) => f.match(/^baseline-v(\d+)\.json$/)).filter(Boolean)
        .map((m) => Number(m[1])).sort((a, b) => b - a);
      if (name) throw new Error(`基线不存在：baselines/${name}.json`);
      if (!versions.length) return null;
      file = join(dir, `baseline-v${versions[0]}.json`);
    }
  }
  return { name: file.match(/baseline-v\d+/)[0], data: JSON.parse(readFileSync(file, 'utf8')) };
}

function loadDigests(root, baseline, explicitPaths) {
  const paths = explicitPaths.length
    ? explicitPaths.map((p) => resolve(p))
    : (baseline?.data.digests || []).map((d) => join(root, d.digest_ref)).filter((p) => existsSync(p));
  return paths.map((p) => {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    return { doc_id: data.document_identity?.doc_id || data.digest_id || '(未知)', data };
  });
}

// 多 digest 合并为统一视图；元素 ID 附加 doc 来源，多份时展示为 doc_id/ID
function mergeDigests(digests) {
  const multi = digests.length > 1;
  const q = (id, doc) => (multi ? `${doc}/${id}` : id);
  const merged = { objectives: [], risks: [], controls: [], elements: [], edges: [], raci: [], multi };
  const elementNames = new Map();
  for (const { doc_id, data } of digests) {
    for (const o of data.process_objectives || []) merged.objectives.push({ ...o, _doc: doc_id, _q: q(o.objective_id, doc_id) });
    for (const r of data.risks || []) merged.risks.push({ ...r, _doc: doc_id, _q: q(r.risk_id, doc_id) });
    for (const c of data.controls || []) merged.controls.push({ ...c, _doc: doc_id, _q: q(c.control_id, doc_id) });
    for (const e of data.process_elements || []) {
      merged.elements.push({ ...e, _doc: doc_id, _q: q(e.element_id, doc_id) });
      elementNames.set(`${doc_id}:${e.element_id}`, e.name);
    }
    for (const e of data.flow_edges || []) merged.edges.push({ ...e, _doc: doc_id, _q: q(e.edge_id, doc_id) });
    for (const a of data.role_assignments || []) merged.raci.push({ ...a, _doc: doc_id });
  }
  merged.elementName = (doc, id) => elementNames.get(`${doc}:${id}`) || id;
  merged.elementDisplay = (doc, id) => {
    const name = merged.elementName(doc, id);
    const qid = q(id, doc);
    return name === id ? qid : `${qid} ${name}`;
  };
  return merged;
}

// 主路径提取：按 L3 流程分组 main 边，从入度 0 节点走链
function mainPaths(m) {
  const byProcess = new Map();
  for (const e of m.edges) {
    if (e.edge_kind !== 'main') continue;
    const key = `${e._doc}:${e.process_ref}`;
    if (!byProcess.has(key)) byProcess.set(key, []);
    byProcess.get(key).push(e);
  }
  const paths = [];
  for (const [key, edges] of byProcess) {
    const [doc, proc] = key.split(':');
    const next = new Map();
    const indeg = new Set();
    for (const e of edges) {
      if (!next.has(e.from_ref)) next.set(e.from_ref, []);
      next.get(e.from_ref).push(e.to_ref);
      indeg.add(e.to_ref);
    }
    let starts = [...next.keys()].filter((n) => !indeg.has(n));
    if (!starts.length && edges.length) starts = [edges[0].from_ref];
    const visited = new Set();
    for (const s of starts) {
      const chain = [];
      let cur = s;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        chain.push(cur);
        cur = (next.get(cur) || [])[0];
      }
      if (chain.length) paths.push({ doc, process: proc, chain });
    }
  }
  return paths;
}

function reworkEdges(m) {
  return m.edges.filter((e) => ['reject', 'return'].includes(e.edge_kind));
}

function handoffs(m, paths) {
  const rRole = new Map();
  for (const a of m.raci) {
    if (a.raci !== 'R') continue;
    const key = `${a._doc}:${a.element_ref}`;
    if (!rRole.has(key)) rRole.set(key, new Set());
    rRole.get(key).add(a.role);
  }
  const out = [];
  for (const { doc, process, chain } of paths) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = rRole.get(`${doc}:${chain[i]}`);
      const b = rRole.get(`${doc}:${chain[i + 1]}`);
      if (!a || !b) continue;
      const overlap = [...a].filter((r) => b.has(r));
      if (overlap.length === 0) {
        out.push({ doc, process, from: chain[i], to: chain[i + 1], fromRole: [...a].join('/'), toRole: [...b].join('/') });
      }
    }
  }
  return out;
}

// ---------- 域风险参照库（rcm-analysis references/risk-lib） ----------
function loadRiskLibraries(domains) {
  const libDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'rcm-analysis', 'references', 'risk-lib');
  return domains.map((domain) => {
    const p = join(libDir, `${domain}.json`);
    if (!existsSync(p)) throw new Error(`域风险库不存在：${domain}（可用域见 risk-lib/risk-lib-contract.md）`);
    return JSON.parse(readFileSync(p, 'utf8'));
  });
}

// 字符 bigram 重合度：库条目 statement vs digest 风险 description 的机械相似度提示（非语义结论，须 AI 复核）
function bigrams(s) {
  const set = new Set();
  const t = String(s || '');
  for (let i = 0; i + 1 < t.length; i++) set.add(t.slice(i, i + 2));
  return set;
}

function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const g of A) if (B.has(g)) n++;
  return n / Math.min(A.size, B.size);
}

const SIMILARITY_HINT = 0.4;

function libraryEntries(libraries, digestRisks) {
  const entries = [];
  for (const lib of libraries) {
    for (const r of lib.risks || []) {
      if (!r.statement) continue; // 风险文本缺省的条目不作未识别风险候选（SKILL 纪律）
      let hint = null;
      let best = 0;
      for (const dr of digestRisks) {
        const s = similarity(r.statement, dr.description);
        if (s > best) { best = s; hint = dr._q; }
      }
      entries.push({
        ref: r.risk_ref, domain: lib.domain_label, statement: r.statement,
        level: r.reference_level, controls: (r.typical_controls || []).length,
        coveredHint: best >= SIMILARITY_HINT ? hint : null,
      });
    }
  }
  return entries;
}

// ---------- 各维度生成器 ----------
function genGoal(m, baseline) {
  const files = {};
  // objective_inventory.md
  const l3NoObjective = m.elements.filter((e) => e.level === 'L3' && (!e.objective_refs || e.objective_refs.length === 0));
  const objIds = new Set(m.objectives.map((o) => `${o._doc}:${o.objective_id}`));
  const brokenChain = m.objectives.filter((o) => o.parent_objective_ref && !objIds.has(`${o._doc}:${o.parent_objective_ref}`));
  const rows = m.objectives.map((o) =>
    `| ${o._q} | ${cell(o.statement, 60)} | ${o.assertion_basis} | {…} | {…} | {…} | {…} | {…} | {…} | ${(o.element_refs || []).map((r) => m.elementDisplay(o._doc, r)).join('<br>') || '{…}'} |`);
  files['objective_inventory.md'] = `# 目标清单与 SMART 评级（G1）

> 初稿由 generate-dimension-drafts.mjs 从 digest 机械生成；S/M/A/R/T 与评级列为 AI 判断留白 {…}。
> 来源：digest.json \`process_objectives[]\`。S/A/R/T 列填 ✅（满足）或 ❌（不满足）；评级=clear/partial/vague。

| 目标 ID | statement | assertion_basis | S | M | A | R | T | 评级 | 挂接 L3 |
|--------|-----------|-----------------|---|---|---|---|---|------|--------|
${rows.length ? rows.join('\n') : '| （digest 无 process_objectives） | | | | | | | | | |'}

## 评级说明

- \`analysis\` 推断的目标须在 finding 中注明"推断目标，非制度明文"
- 无目标的 L3 → \`objective_missing\`；目标与 exit_conditions 不呼应 → \`goal_process_misaligned\`
- 父子目标链不支撑上级 → \`objective_conflict\`

## 目标-流程对齐检查（G3，已机械预填）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 无目标的 L3 | ${l3NoObjective.length ? l3NoObjective.map((e) => e._q).join(', ') : '无'} | 每个产生 \`objective_missing\`（先过 DDR 分诊） |
| 目标 vs exit_conditions 呼应 | {…} | 不呼应 → \`goal_process_misaligned\` |
| 父子目标链断链 | ${brokenChain.length ? brokenChain.map((o) => `${o._q}→${o.parent_objective_ref}`).join(', ') : '无'} | 断链或冲突 → \`objective_conflict\`（inferred 层级先过 DDR） |
`;

  // kpi_scorecard.md
  const metrics = baseline?.data.metrics || [];
  const gaps = baseline?.data.data_gaps || [];
  const mrows = metrics.map((mt) =>
    `| {OBJ-xxx} | ${cell(mt.name)} | ${cell(mt.definition, 60)} | ${mt.data_mapping?.field || '{…}'}→${mt.data_mapping?.source_system || '{…}'} | {…} | ${mt.target_value ?? mt.benchmark_ref ?? '{…}'} | {…} | {…} |`);
  const grows = gaps.map((g) => `| {指标} | ${cell(g.impact)} | ${g.reason_type === 'evaluator_gap' ? '评价方' : '数据方'}（${cell(g.source, 30)}） |`);
  files['kpi_scorecard.md'] = `# KPI 计分卡（G5/G6）

> 初稿由 generate-dimension-drafts.mjs 从 ${baseline ? baseline.name : '（无基线）'} 的 metrics/data_gaps 机械生成；目标挂接、实际值、达成状态留白 {…}。
> 基准来源注明：APQC PCF 参照 / 内部历史 / 目标值（rule ID）。

| 目标 | 对应指标 | 计算口径 | 数据字段映射 | 实际值 | 基准（来源） | 达成状态 | finding |
|------|---------|---------|------------|-------|------------|---------|---------|
${mrows.length ? mrows.join('\n') : '| {…} | {…} | {…} | {…} | {…} | {…} | {…} | {…} |'}

## 说明

- 无指标 → \`kpi_absent\`（与 G4 择一输出，避免重复计数）
- 口径无法从快照复算 → \`kpi_definition_unclear\`
- 未达成且差距超合理区间 → \`kpi_not_achieved\`，severity 按差距与目标重要性判
- 计算受阻 → baseline 归因记录（评价方缺口 / 数据方缺口），不强行出 finding

## 计算限制（已按 baseline data_gaps 预填）

| 指标 | 受阻原因 | 归因（评价方/数据方缺口） |
|------|---------|------------------------|
${grows.length ? grows.join('\n') : '| （无已归因数据缺口） | | |'}
`;
  return files;
}

function genRisk(m, baseline, libraries = []) {
  const files = {};
  const refEntries = libraryEntries(libraries, m.risks);
  // rcm_matrix.md
  const riskIds = new Set(m.risks.map((r) => `${r._doc}:${r.risk_id}`));
  const orphans = m.controls.filter((c) => !Array.isArray(c.risk_refs) || c.risk_refs.length === 0 || c.risk_refs.every((r) => !riskIds.has(`${c._doc}:${r}`)));
  const header = m.controls.map((c) => c._q);
  const rows = m.risks.map((r) => {
    const cells = m.controls.map((c) => (Array.isArray(c.risk_refs) && c.risk_refs.includes(r.risk_id) ? '●' : '-'));
    return `| ${r._q} ${cell(r.description, 30)} | ${cells.join(' | ')} |`;
  });
  files['rcm_matrix.md'] = `# 风险控制矩阵（R1）

> 初稿由 generate-dimension-drafts.mjs 按 \`controls[].risk_refs\` 机械生成；●/○（主要/辅助）区分需 AI 语义复核后下调。
> 行 = digest \`risks[]\`，列 = digest \`controls[]\`。● 主要应对  ○ 辅助应对  - 无关联
${libraries.length ? `> [参照] 行来自域风险库（${libraries.map((l) => l.domain_label).join('、')}，共 ${refEntries.length} 条）：AI 逐条判定 digest 是否覆盖——覆盖在附注登记映射，未覆盖 → \`risk_unidentified\` 候选（须先 DDR）。` : ''}

| 风险 \\ 控制 | ${header.join(' | ') || '（无控制）'} |
|------------|${header.map(() => '---').join('|') || '---'}|
${rows.length ? rows.join('\n') : '| （digest 无 risks） | |'}
${refEntries.length
    ? refEntries.map((e) => `| **[参照] ${e.ref}** ${cell(e.statement, 40)}${e.coveredHint ? `<br>疑似已覆盖→${e.coveredHint}（机械相似，语义复核）` : ''} | ${header.map(() => '{…}').join(' | ')} |`).join('\n')
    : '| **[参照] {参照集条目}** 制度未声明 | {…} | → `risk_unidentified`（须先 DDR） |'}

## 标记

- \`control\` 的 \`risk_refs\` 为空或指向不存在风险 → \`control_orphaned\`（矩阵外单列）
- 映射依据须可回溯到 digest 的 risk/control ID 与 source 锚点
- **[参照]** 行为风险参照集识别的缺口，与制度明文风险分列，不得混排

## 矩阵附注（已机械预填）

| 项 | 结果 | 说明 |
|----|------|------|
| orphan controls（risk_refs 空/悬空） | ${orphans.length ? orphans.map((c) => c._q).join(', ') : '无'} | 每个产生 \`control_orphaned\`（先过 DDR 分诊） |
| 映射与 risk_refs 不符处 | {…} | 语义复核推翻字面映射时必须记录理由 |
`;

  // coverage_analysis.md
  const covered = new Set();
  for (const c of m.controls) for (const r of c.risk_refs || []) covered.add(`${c._doc}:${r}`);
  const uncontrolled = m.risks.filter((r) => !covered.has(`${r._doc}:${r.risk_id}`));
  files['coverage_analysis.md'] = `# 覆盖度分析（R2）

> 初稿由 generate-dimension-drafts.mjs 机械生成：无控风险 = 无任何 control.risk_refs 引用的制度明文风险；判级与弱控判断留白 {…}。

## 无控风险 \`risk_uncontrolled\`（high）

| 风险 | 判级依据（是否涉大额/敏感 thresholds） | finding |
|------|--------------------------------------|---------|
${uncontrolled.length ? uncontrolled.map((r) => `| ${r._q} ${cell(r.description, 40)} | {…}（rule_refs: ${(r.rule_refs || []).join(', ') || '无'}） | {RC-xxx} |`).join('\n') : '| （无——全部制度明文风险均有控制引用） | | |'}

## 弱控风险 \`risk_undercontrolled\`

- {…}（仅有辅助控制 / 控制与风险量级不匹配，如大额风险配事后抽检）

## 未识别风险 \`risk_unidentified\`（须先发 DDR）

| 参照集条目 | 典型场景 | 制度未声明说明 | finding |
|-----------|---------|--------------|---------|
${refEntries.length
    ? refEntries.map((e) => `| ${e.ref}（${e.domain}） | ${cell(e.statement, 60)} | ${e.coveredHint ? `机械相似 ${e.coveredHint}——疑似已覆盖，语义复核后排除或走 DDR` : '{…}（参照等级 ' + (e.level || '?') + '；典型控制参照 ' + e.controls + ' 条）'} | {RC-xxx} |`).join('\n')
    : '| {…} | {…} | {…} | {RC-xxx} |'}

> 纪律：\`risk_unidentified\` 必须先行 DDR（open），dismissed 后才升级为确认发现；不允许只凭直觉列风险。参照库是询问的起点不是判决的终点；机械相似度提示仅辅助定位，不构成覆盖结论。
`;

  // control_design_review.md
  const riskControlCount = new Map();
  for (const c of m.controls) for (const r of c.risk_refs || []) {
    const k = `${c._doc}:${r}`;
    riskControlCount.set(k, (riskControlCount.get(k) || 0) + 1);
  }
  const redundantCandidates = [...riskControlCount.entries()].filter(([, n]) => n > 1).map(([k, n]) => `${k}（${n} 个控制）`);
  const crows = m.controls.map((c) =>
    `| ${c._q} | {预防/检查} | ${c.timing_type || ''} | ${c.frequency || ''} | ${c.execution_mode || ''} | ${c.decision_criteria ? '明确' : ''} | ${Array.isArray(c.evidence) && c.evidence.length ? '定义' : ''} | {…} | {…} |`);
  files['control_design_review.md'] = `# 控制设计有效性评价（R3）

> 初稿由 generate-dimension-drafts.mjs 从 digest controls 机械预填（时机/频率/自动化/标准/留痕取 digest 原值；空单元格 = digest 字段缺失，缺失本身是发现）。
> 仅设计层；运行有效性归 control-testing。

| 控制 | 类型(预防/检查) | 时机 | 频率 | 自动化 | 标准 | 留痕 | 设计结论 | 缺陷 finding |
|------|---------------|------|------|--------|------|------|---------|-------------|
${crows.length ? crows.join('\n') : '| （digest 无 controls） | | | | | | | | |'}

## 检测项

- 冗余：\`control_redundant\`（同风险多同型控制无分工；预防+检查组合是良好实践非冗余）
- 错配：\`control_risk_mismatch\`（control 的 risk_refs 指向不符；控制挂 L4 但风险 L3 层级错位）
- 断链：rule_refs / element_ref 悬空 → 记 DDR（非 finding）

## 冗余与错配（机械候选，需 AI 复核分工后定性）

| 检查 | 结果 | finding |
|------|------|---------|
| 同风险多控制（候选，待查分工） | ${redundantCandidates.length ? redundantCandidates.join(', ') : '无'} | \`control_redundant\` |
| 控制内容与所挂风险不符 | {…} | \`control_risk_mismatch\`（先过 DDR 分诊） |
| 控制挂 L4 但风险在 L3 | {…} | \`control_risk_mismatch\` |
`;
  return files;
}

function genControl(m, baseline) {
  const files = {};
  const snapshots = baseline?.data.snapshots || [];
  // sampling_plan.md
  const srows = snapshots.map((s) =>
    `| ${s.path} | ${s.data_window ? `${s.data_window.start}~${s.data_window.end}` : '{…}'}${s.record_count != null ? ` / ${s.record_count} 条` : ''} | {…} | {…} |`);
  const crows = m.controls.map((c) => `| ${c._q} | ${c.frequency || '{…}'} | {…} | {…} | {…} |`);
  files['sampling_plan.md'] = `# 抽样计划（T1）

> 初稿由 generate-dimension-drafts.mjs 预填（快照清单来自 ${baseline ? baseline.name : '（无基线）'}，待测控制来自 digest controls）；样本策略与范围留白 {…}。
> 无统计学强制，供起评参考；全量数据可用时直接全量。须记录方法+范围，保证可复现。

## 数据源与覆盖核验

| 快照 | 覆盖范围 | 可重建路径 | 覆盖核验结论 |
|------|---------|-----------|------------|
${srows.length ? srows.join('\n') : '| {…} | {…} | {…} | {…} |'}

## 选样

| 控制频率 | 建议样本 | 说明 |
|---------|---------|------|
| 每笔触发 | 全量扫描高频项 + 随机抽样复核 | 系统数据可全量 |
| 日频 | 抽 20-30 个工作日 | 覆盖月初/月末 |
| 月频 | 抽 3-6 个月 | 覆盖季度末 |
| 触发式 | 全量触发实例 | 通常量少 |

| 待测控制 | 频率 | 样本策略 | 样本范围 | 理由 |
|---------|------|---------|---------|------|
${crows.length ? crows.join('\n') : '| {…} | {…} | {…} | {…} | {…} |'}

## 本次抽样

- 抽样方法：{…}（全量/随机种子/分层依据）
- 样本范围：{…}
- 偏差发现后：扩展样本或全量核验（注明）
- 数据快照前置：执行记录须能按单笔实例聚合完整路径；无法聚合的部分降级并列入报告限制

## 复现声明

- 选样方法：{…}
- 他人可按本方案从 baseline 快照重建同一样本集
`;

  // walkthrough.md — 模板路径参考（机械生成）
  const paths = mainPaths(m);
  const pathLines = paths.map(({ doc, process, chain }) =>
    `- ${m.elementDisplay(doc, process)}：${chain.map((id) => m.elementDisplay(doc, id)).join(' → ')}`);
  files['walkthrough.md'] = `# 穿行测试路径对照（T2）

> 初稿由 generate-dimension-drafts.mjs 预填"模板路径参考"（flow_edges main 边机械走链）；实例选择与实际路径对照留白 {…}。
> 选 3-5 笔典型实例（正常 1-2 + 各条件路径各 1），走完整路径对照模板。

## 模板路径参考（flow_edges main 边）

${pathLines.length ? pathLines.join('\n') : '- （digest 无 main 边）'}

## 实例选择

| # | 快照实例 | 路径类型 | 选择理由 |
|---|---------|---------|---------|
| 1 | {rec-xxx} | 正常主路径 | 典型样本 |
| 2 | {rec-yyy} | 条件路径（{edge_kind}） | 覆盖 {EDGE-XXX} |

| 实例 | 实际路径 | 模板路径(flow_edges) | 差异(环节) | 控制点经过 | Artifact 产出 |
|------|---------|---------------------|-----------|-----------|--------------|
| {rec-001} | {…} | {…} | {…} | {…} | {…} |

## 说明

- 实际路径与 \`flow_edges\` 大面积不符（>2 环节差异）→ 先发 DDR（omission），不定性为偏离
- 每个控制点是否被经过（审批人对照 RACI）；输出 Artifact 对照 digest artifacts

## 汇总

- 穿行差异：{…}（>2 个环节差异 → DDR(omission) 分诊，再定性偏离）
`;

  // control_execution_scorecard.md
  const erows = m.controls.map((c) => `| ${c._q} | {…} | {…} | {…} | {…} | {…} | {…} |`);
  files['control_execution_scorecard.md'] = `# 控制执行率看板（T3）

> 初稿由 generate-dimension-drafts.mjs 预填控制点行（来自 digest controls）；实例计数与偏差构成留白 {…}（须从 baseline 快照统计）。
> 偏差率 = 偏差实例数 / 应控实例数。执行率低于建议阈值（95%）的控制列为重点 finding。

| 控制点 | 应控实例 | 偏差实例 | 偏差率 | 重点标记 | 偏差构成（finding_type→条数） | finding |
|--------|---------|---------|-------|---------|------------------------------|---------|
${erows.length ? erows.join('\n') : '| （digest 无 controls） | | | | | | |'}

## 偏差类型

\`control_not_executed\`(应执行未执行) / \`control_bypassed\`(绕过) / \`control_deviation\`(执行但偏离) /
\`exception_unlogged\`(例外未记录) / \`control_evidence_missing\`(留痕缺失) / \`segregation_conflict\`(职责冲突)

## 说明

- 执行率 < 95% → 重点标记 ★，对应 finding severity 上调评估
- \`control_not_executed\` > 50% → 必须先走三分诊（未执行 / 快照外系统 / 模板幻觉→DDR），再定性
- 完整逐条偏差见 \`deviation_details.md\`（每条含 \`anchor.baseline\` 定位）
`;
  return files;
}

function genEfficiency(m, baseline) {
  void baseline;
  const files = {};
  const paths = mainPaths(m);
  const rework = reworkEdges(m);
  const hoffs = handoffs(m, paths);

  // structure_review.md
  const e1 = paths.map(({ doc, process, chain }) =>
    `- ${m.elementDisplay(doc, process)}：主路径 ${chain.length} 环节（${chain.map((id) => m.elementDisplay(doc, id)).join(' → ')}）—— 并行机会/阈值匹配判断 {…}`);
  const e2 = rework.map((e) =>
    `- ${e._q}：${m.elementDisplay(e._doc, e.from_ref)} → ${m.elementDisplay(e._doc, e.to_ref)}（${e.edge_kind}${e.condition ? `，条件：${cell(e.condition, 30)}` : ''}）—— 终止条件/责任角色检查 {…}`);
  const e3 = hoffs.map((h) =>
    `- ${m.elementDisplay(h.doc, h.from)}（${h.fromRole}）→ ${m.elementDisplay(h.doc, h.to)}（${h.toRole}）—— 弱交接检查 {…}`);
  files['structure_review.md'] = `# 路径结构诊断（E1-E3，设计层，仅 digest）

> 初稿由 generate-dimension-drafts.mjs 机械生成（主路径走链 / reject·return 边 / R 角色变更交接点）；判断与定性留白 {…}。

## E1 串行审批链 / 并行机会

${e1.length ? e1.join('\n') : '- （digest 无 main 边）'}

- 阈值匹配：审批层级与 rules 金额/风险阈值是否匹配（小额走长链 → \`approval_overload\`）{…}
- 并行机会：前后环节无数据依赖（input_artifact_refs 对照）→ \`serial_redundancy\` {…}

## E2 返工环（reject/return 边，共 ${rework.length} 条）

${e2.length ? e2.join('\n') : '- 无 reject/return 边（设计层无返工环；若实例层返工率高 → 路径外循环，对照 E6）'}

- 无终止条件或无 RACI 责任角色 → \`rework_loop\`

## E3 交接链（R 角色变更点，共 ${hoffs.length} 处）

${e3.length ? e3.join('\n') : '- 主路径无跨角色交接（或 RACI 数据不足）'}

- "传递即丢失"弱交接（前角色输出 Artifact 不在后角色 input_artifact_refs）→ \`handoff_excess\` {…}
`;

  // cycle_time_decomposition.md / bottleneck_analysis.md — 环节行骨架（L4/L5）
  const activities = m.elements.filter((e) => ['L4', 'L5'].includes(e.level));
  const arows = activities.map((e) => `| ${e._q} ${cell(e.name, 30)} | {…} | {…} | {…} | {…} | {…} | {…} | {…} |`);
  files['cycle_time_decomposition.md'] = `# 周期时间分解（E4，实例层 + baseline）

> 初稿由 generate-dimension-drafts.mjs 预填环节行（digest L4/L5 元素）；实例统计列留白 {…}（须从 baseline 快照计算）。
> 环节耗时 = 离开时间戳 - 进入时间戳；等待 = 进入后首个动作前；处理 = 环节内动作总时长。统计 P50/P90/最大。

| 环节 | 实例数 | P50 | P90 | 最大 | 等待占比 | 制度时限（rule） | 违约率 |
|------|--------|-----|-----|-----|---------|----------------|--------|
${arows.length ? arows.join('\n') : '| {PE-xxx} | {…} | {…} | {…} | {…} | {…} | {…} | {…} |'}

## 说明

- 等待占比 = P50 等待时间 / P50 环节总耗时
- 制度时限违约同时是 \`control_deviation\` 时，交叉引用 CT-finding（不重复计数）
- 周期分布双峰（大量快+少量极慢）提示条件分支未区分 → 结合 \`flow_edges\` 条件分析

## 分布形态

- {…}
`;

  const brows = activities.map((e) => `| ${e._q} ${cell(e.name, 30)} | {…} | {…} | {…} | {…} | {…} | {…} |`);
  files['bottleneck_analysis.md'] = `# 瓶颈分析（E5 + E7，实例层 + baseline）

> 初稿由 generate-dimension-drafts.mjs 预填环节行（digest L4/L5 元素）；判断列留白 {…}。

| 环节 | 等待占比 | P90等待/全流程 | 队列深度 | 制度时限对照 | bottleneck_wait | cycle_time_outlier |
|------|---------|--------------|---------|------------|----------------|-------------------|
${brows.length ? brows.join('\n') : '| {PE-xxx} | {…} | {…} | {…} | {…} | {…} | {…} |'}

## 说明

- 等待占比最高（P90 等待 > 全流程 40%）→ \`bottleneck_wait\`（high=瘫痪级 / medium=常态 / low=偶发）
- 环节 P50 超出 rules 时限 → 独立标注"制度违约率"，与 control-testing \`control_deviation\` 交叉引用（不重复计数）
- 单点负载：某角色同时是多串行环节 R → 队列深度分析
- \`cycle_time_outlier\`：P90/P50 比值异常大（>3）→ 待深挖项
`;

  // rework_analysis.md
  files['rework_analysis.md'] = `# 返工率分析（E6，实例层 + baseline）

> 初稿由 generate-dimension-drafts.mjs 预填设计层对照基线（digest reject/return 边 ${rework.length} 条）；实例统计留白 {…}。

- 返工率 = 走 reject/return 路径实例占比：{…}
- 返工原因分布（哪个环节返工件最多、流向哪里）：{…}
- 返工率高（>10% 建议）且集中于单点 → 该单点是质量/规则问题，交叉引用对应维度

## 设计层对照（已机械预填）

- digest 设计层返工路径：${rework.length ? rework.map((e) => `${m.elementDisplay(e._doc, e.from_ref)}→${m.elementDisplay(e._doc, e.to_ref)}（${e.edge_kind}）`).join('；') : '无'}
- \`rework_loop\`（设计层，E2）与实际返工率（实例层）对照：设计无环但实际高频回退 → 路径外循环，记 \`control_bypassed\` 交叉引用（control-testing 主责）
`;
  return files;
}

const GENERATORS = { goal: genGoal, risk: genRisk, control: genControl, efficiency: genEfficiency };

// ---------- CLI ----------
function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function optionsAll(args, name) {
  const out = [];
  args.forEach((a, i) => { if (a === name && args[i + 1]) out.push(args[i + 1]); });
  return out;
}

function runCli() {
  const args = process.argv.slice(2);
  const root = args[0]?.startsWith('--') ? null : args[0];
  const dim = option(args, '--skill');
  if (!root || !dim) throw new Error('用法: node generate-dimension-drafts.mjs <assessment_root|output_dir> --skill <goal|risk|control|efficiency> [--baseline baseline-vN] [--digest <路径>]... [--risk-library <域,逗号分隔>] [--force]');
  if (!DIMENSIONS.includes(dim)) throw new Error(`不支持的维度：${dim}；可选值：${DIMENSIONS.join(', ')}`);
  const absRoot = resolve(root);
  const explicitDigests = optionsAll(args, '--digest');
  if (!existsSync(absRoot)) {
    if (explicitDigests.length) mkdirSync(absRoot, { recursive: true });
    else throw new Error(`目录不存在：${absRoot}`);
  }
  const baseline = explicitDigests.length ? null : loadBaseline(absRoot, option(args, '--baseline'));
  if (!baseline && !explicitDigests.length) {
    throw new Error('未找到可用基线（baselines/baseline-v*.json）；请先运行 scaffold-baseline.mjs，或用 --digest 直接指定 digest.json（场景二）');
  }
  const libraryOpt = option(args, '--risk-library');
  let libraries = [];
  if (libraryOpt) {
    if (dim !== 'risk') console.log(`🟡 --risk-library 仅作用于 risk 维度，当前 ${dim} 已忽略`);
    else libraries = loadRiskLibraries(libraryOpt.split(',').map((s) => s.trim()).filter(Boolean));
  }
  const digests = loadDigests(absRoot, baseline, explicitDigests);
  if (!digests.length) throw new Error('未加载到任何 digest（检查基线 digests 引用或 --digest 路径）');
  const merged = mergeDigests(digests);
  const files = GENERATORS[dim](merged, baseline, libraries);

  // 输出目录：评价根语境 → 01_assessments/{dim}/；--digest 直喂语境 → 当前目录即输出目录
  const outDir = explicitDigests.length ? absRoot : join(absRoot, '01_assessments', DIM_TO_DIR[dim]);
  mkdirSync(outDir, { recursive: true });
  const force = args.includes('--force');
  const written = [];
  const skipped = [];
  for (const [name, content] of Object.entries(files)) {
    const target = join(outDir, name);
    if (existsSync(target) && !force) { skipped.push(name); continue; }
    writeFileSync(target, content, 'utf8');
    written.push(name);
  }
  console.log(`✓ 维度初稿生成（${dim}）：${outDir}`);
  console.log(`  digest：${digests.map((d) => d.doc_id).join(', ')} ｜ 基线：${baseline ? baseline.name : '（--digest 直喂，无基线）'}${libraries.length ? ` ｜ 风险库：${libraries.map((l) => l.domain).join(', ')}` : ''}`);
  if (written.length) console.log(`  已生成：${written.join(', ')}`);
  if (skipped.length) console.log(`  已跳过（存在，--force 覆盖）：${skipped.join(', ')}`);
  console.log('⚠ 初稿中 {…} 为 AI 判断留白；机械预填部分（映射/清单/路径）复核语义后可直接采用。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (e) { console.error(`🔴 ${e.message}`); process.exitCode = 1; }
}
