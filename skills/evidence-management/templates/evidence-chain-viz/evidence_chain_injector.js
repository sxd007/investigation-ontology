#!/usr/bin/env node
/**
 * evidence_chain_injector.js
 *
 * 将 evidence_registry.json + nodes/*.md 注入到可视化模板，
 * 生成独立的 HTML 文件（XMind 左→右逻辑图，零外部依赖）。
 *
 * 用法: node evidence_chain_injector.js <case_dir> [output.html]
 * 示例: node evidence_chain_injector.js ../../../../cases/CASE-2026-0608 output.html
 */

const fs = require('fs');
const path = require('path');

// ── 节点类型配置 ──────────────────────────────────────────────
const TYPE_CONFIG = {
  EV:  { label: '原始证据',  order: 0 },
  LS:  { label: '线索',      order: 1 },
  ARG: { label: '论据',      order: 2 },
  FND: { label: '结论',      order: 3 },
  ENT: { label: '实体',      order: 0 },
  HYP: { label: '假设',      order: 0 },
  EVT: { label: '事件',      order: 0 },
};

// ── Frontmatter 解析 ──────────────────────────────────────────
function parseFrontmatter(content) {
  const fm = {};
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return null;

  const yaml = fmMatch[1].replace(/\r/g, '');
  const body = content.slice(fmMatch[0].length).trim();

  // 标量 key: value（[ \t]* 不匹配换行，防止跨行误吃）
  const scalarRe = /^(\w[\w_-]*)[ \t]*:[ \t]*(.+)$/gm;
  let m;
  while ((m = scalarRe.exec(yaml)) !== null) {
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (val) fm[key] = val;
  }

  // sources 数组（旧格式：多行对象 - id/excerpt/form）
  const sources = [];
  const srcObjRe = /^\s+-\s+id:\s*(\S+)\s*\n\s+excerpt:\s*"((?:[^"\\]|\\.)*)"\s*\n\s+form:\s*(\S+)/gm;
  while ((m = srcObjRe.exec(yaml)) !== null)
    sources.push({ id: m[1], excerpt: m[2], form: m[3] });
  if (sources.length > 0) fm.sources = sources;

  // relations 字典（新格式：relations: derived_from: - id: xxx）
  const relBlockMatch = yaml.match(/^relations:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
  if (relBlockMatch) {
    const relText = relBlockMatch[1];
    const relations = {};
    // 匹配子键（如 derived_from:），收集其列表项
    const typeMatches = [...relText.matchAll(/^[ \t]{2}(\w+):\s*\n((?:[ \t]{4}-[ \t]+[^\n]+\n?(?:[ \t]{6}[^\n]+\n?)*)*)/gm)];
    for (const tm of typeMatches) {
      const relType = tm[1];
      const items = [];
      for (const im of [...tm[2].matchAll(/^[ \t]+-[ \t]+id:[ \t]+([^\s"']+|"[^"]+"|'[^']+')/gm)]) {
        const id = im[1].replace(/^['"]|['"]$/g, '');
        const excerptMatch = tm[2].slice(im.index).match(/excerpt:[ \t]+"((?:[^"\\]|\\.)*)"/);
        items.push({ id, excerpt: excerptMatch ? excerptMatch[1] : '', form: 'text' });
      }
      if (items.length) relations[relType] = items;
    }
    if (Object.keys(relations).length > 0) fm.relations = relations;
  }

  // 简单数组
  const flatArrRe = /^(\w[\w_-]*):\s*\n((?:\s+-\s+[^\n]+\n?)+)/gm;
  while ((m = flatArrRe.exec(yaml)) !== null) {
    const key = m[1];
    if (key === 'sources') continue;
    const items = m[2].match(/-\s+([^\n]+)/g);
    if (items)
      fm[key] = items.map(i => i.replace(/^-\s+/, '').trim().replace(/^"(.*)"$/, '$1'));
  }

  return { frontmatter: fm, body };
}

// ── 读取 nodes/*.md ──────────────────────────────────────────
function loadNodes(nodesDir) {
  const nodes = {};
  if (!fs.existsSync(nodesDir)) return nodes;

  for (const file of fs.readdirSync(nodesDir).filter(f => f.match(/^[A-Z]+-\d+\.(md|json)$/))) {
    const raw = fs.readFileSync(path.join(nodesDir, file), 'utf8');
    const parsed = parseFrontmatter(raw);
    if (!parsed || !parsed.frontmatter?.id) continue;

    const fm = parsed.frontmatter;
    const id = fm.id;
    const prefix = id.replace(/-\d+$/, '');
    const cfg = TYPE_CONFIG[prefix] || { label: '其他', order: 0 };

    let title = fm.title || fm.proposition || fm.statement || fm.name || id;
    if (!fm.title && !fm.proposition && !fm.statement && !fm.name && Array.isArray(fm.alias) && fm.alias.length)
      title = `[${fm.role || '角色'}: ${fm.alias[0]}]`;

    // 优先用新格式 relations.derived_from，回退到旧格式 sources
    const derivedFrom = (fm.relations?.derived_from || []).map(r => ({
      id: r.id || r,
      excerpt: (r.excerpt || '').slice(0, 80),
      form: r.form || 'text',
    }));
    const legacySources = (fm.sources || []).map(s => ({
      id: s.id,
      excerpt: (s.excerpt || '').slice(0, 80),
      form: s.form || 'text',
    }));

    nodes[id] = {
      id,
      type: prefix,
      status: fm.status || 'draft',
      title,
      body: parsed.body || '',
      assertion: fm.proposition || fm.statement || fm.title || fm.name || '',
      intent: fm.intent || '',
      sources: derivedFrom.length > 0 ? derivedFrom : legacySources,
      relations: fm.relations || {},
      generated_by: fm.generated_by || '',
      reviewed_by: fm.reviewed_by || '',
      confidence: fm.confidence || null,
      entity_type: fm.entity_type || null,
      role: fm.role || null,
      _w: cfg.order,
    };
  }
  return nodes;
}

// ── 读取 evidence_registry.json ──────────────────────────────
function loadRegistry(jsonPath) {
  if (!fs.existsSync(jsonPath)) return {};
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // { evidence_items: [...] }  <- 项目格式
  if (raw.evidence_items && Array.isArray(raw.evidence_items)) {
    const result = {};
    for (const item of raw.evidence_items) {
      const id = item.evidence_id;
      if (!id) continue;
      result[id] = {
        id,
        type: 'EV',
        status: item.confidence === 'confirmed' ? 'ready' : 'draft',
        title: item.summary || item.source || id,
        body: '',
        assertion: item.summary || '',
        intent: '',
        sources: [],
        confidence: item.confidence || 'probable',
        evidence_type: item.type || '',
        collected_at: item.collected_at || '',
        collected_by: item.collected_by || '',
        source: item.source || '',
        generated_by: '',
        reviewed_by: '',
      };
    }
    // 同时提取 findings
    if (raw.findings && Array.isArray(raw.findings)) {
      for (const f of raw.findings) {
        const fid = f.finding_id;
        if (!fid) continue;
        result[fid] = {
          id: fid,
          type: 'FND',
          status: f.confidence === 'confirmed' ? 'ready' : 'draft',
          title: f.statement || fid,
          body: '',
          assertion: f.statement || '',
          intent: '',
          sources: (f.supporting_evidence_ids || []).map(eid => ({
            id: eid, excerpt: '', form: 'text',
          })),
          confidence: f.confidence || 'probable',
          fraud_type: Array.isArray(f.fraud_type) ? f.fraud_type.join(', ') : (f.fraud_type || ''),
          generated_by: '',
          reviewed_by: '',
        };
      }
    }
    return result;
  }

  // 老格式 fallback ...
  if (raw.evidence && Array.isArray(raw.evidence))
    return extractSimple(raw.evidence, 'id');
  if (Array.isArray(raw))
    return extractSimple(raw, 'id');
  return {};
}

function extractSimple(arr, idField) {
  const result = {};
  for (const item of arr) {
    const id = item[idField];
    if (id) result[id] = { ...item, type: (item.type || id.replace(/-\d+$/, '')).toUpperCase() };
  }
  return result;
}

// ── 合并 nodes 与 registry ───────────────────────────────────
function mergeNodes(nodesFromFiles, registryEntries) {
  const merged = { ...registryEntries };
  for (const [id, node] of Object.entries(nodesFromFiles))
    merged[id] = merged[id] ? { ...merged[id], ...node, source: merged[id].source || node.source || '' } : node;
  return merged;
}

// ── 构建边列表 ───────────────────────────────────────────────
function buildEdges(nodes) {
  const edges = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (!node.sources?.length) continue;
    for (const src of node.sources) {
      if (nodes[src.id] || /^(EV|LS|ARG|FND|ENT|HYP|EVT)-\d+/.test(src.id))
        edges.push({ from: src.id, to: id, excerpt: (src.excerpt || '').slice(0, 60), form: src.form || 'text' });
    }
  }
  return edges;
}

// ── 构建证据链层级（用于 treemap）─────────────────────────────
function buildChainTree(nodes, rootId, visited) {
  visited = visited || new Set();
  const node = nodes[rootId];
  if (!node || visited.has(rootId)) return null;
  visited.add(rootId);

  const isLeaf = node.type === 'EV' || node.type === 'ENT' || node.type === 'EVT';
  let children = [];
  if (!isLeaf && node.sources?.length) {
    for (const src of node.sources) {
      const child = buildChainTree(nodes, src.id, visited);
      if (child) children.push(child);
    }
  }
  return { id: node.id, type: node.type, status: node.status, title: node.title, children };
}

function buildAllChains(nodes) {
  const findings = Object.values(nodes).filter(n => n.type === 'FND').sort((a, b) => a.id.localeCompare(b.id));
  if (!findings.length) {
    const referenced = new Set();
    for (const n of Object.values(nodes)) if (n.sources) for (const s of n.sources) referenced.add(s.id);
    // 也从 relations 中收集被引用节点（新格式）
    for (const n of Object.values(nodes)) {
      for (const items of Object.values(n.relations || {}))
        for (const r of items) referenced.add(r.id || r);
    }
    return Object.values(nodes).filter(n => !referenced.has(n.id) && !['ENT','EVT','HYP'].includes(n.type)).map(n => buildChainTree(nodes, n.id)).filter(Boolean);
  }
  return findings.map(f => buildChainTree(nodes, f.id)).filter(Boolean);
}

// ── 统计信息 ─────────────────────────────────────────────────
function buildCaseInfo(caseDir, nodes) {
  const info = {
    id: path.basename(caseDir),
    title: '调查案件',
    subtitle: new Date().toISOString().split('T')[0],
    stats: { total: 0, types: {}, statuses: { ready: 0, draft: 0, superseded: 0 } },
  };
  for (const n of Object.values(nodes)) {
    info.stats.total++;
    info.stats.types[n.type] = (info.stats.types[n.type] || 0) + 1;
    if (n.status in info.stats.statuses) info.stats.statuses[n.status]++;
  }
  const fnd = Object.values(nodes).find(n => n.type === 'FND');
  if (fnd) info.title = fnd.title || info.title;
  return info;
}

// ── 生成 HTML ────────────────────────────────────────────────
function generateHTML(caseInfo, nodes, edges, chains) {
  const tplPath = path.join(__dirname, 'evidence_chain_viewer.html');
  let html = fs.readFileSync(tplPath, 'utf8');

  const startMarker = '// INJECTION_START_MARKER';
  const endMarker = '// INJECTION_END_MARKER';
  const si = html.indexOf(startMarker), ei = html.indexOf(endMarker);
  if (si === -1 || ei === -1) { console.error('[error] 模板缺少注入标记'); process.exit(1); }

  const replacer = (k, v) => v === undefined ? null : v;
  const dataBlock = [
    `const CASE_DATA = ${JSON.stringify(caseInfo, replacer, 2)};`,
    `const NODES_DATA = ${JSON.stringify(nodes, replacer, 2)};`,
    `const EDGES_DATA = ${JSON.stringify(edges, replacer, 2)};`,
    `const CHAINS_DATA = ${JSON.stringify(chains, replacer, 2)};`,
  ].join('\n\n');

  return html.slice(0, si + startMarker.length) + '\n\n' + dataBlock + '\n\n' + html.slice(ei);
}

// ── 主程序 ────────────────────────────────────────────────────
function main() {
  const caseDir = process.argv[2];
  const outputFile = process.argv[3] || 'evidence_chain_output.html';
  if (!caseDir) { console.error('用法: node evidence_chain_injector.js <case_dir> [output.html]'); process.exit(1); }
  if (!fs.existsSync(caseDir)) { console.error(`[error] 案件目录不存在: ${caseDir}`); process.exit(1); }

  console.log(`[info] 读取案件: ${caseDir}`);
  const registry = loadRegistry(path.join(caseDir, 'evidence_registry.json'));
  console.log(`[info] 注册表: ${Object.keys(registry).length} 条`);
  const fileNodes = loadNodes(path.join(caseDir, 'nodes'));
  console.log(`[info] nodes/: ${Object.keys(fileNodes).length} 个`);
  const allNodes = mergeNodes(fileNodes, registry);
  console.log(`[info] 合并后: ${Object.keys(allNodes).length} 节点`);
  const edges = buildEdges(allNodes);
  console.log(`[info] 边: ${edges.length} 条`);
  const chains = buildAllChains(allNodes);
  console.log(`[info] 链: ${chains.length} 条`);
  const caseInfo = buildCaseInfo(caseDir, allNodes);
  const html = generateHTML(caseInfo, allNodes, edges, chains);
  fs.writeFileSync(outputFile, html);
  console.log(`[info] 已生成: ${path.resolve(outputFile)}`);
}

main();
