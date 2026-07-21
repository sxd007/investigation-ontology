#!/usr/bin/env node
/**
 * evidence_chain_injector.js (v3)
 *
 * 将 evidence_registry.json + nodes/*.md|json 注入到可视化模板，
 * 生成独立的 HTML 文件（多视图应用：Reasoning / Hypothesis / Governance / Issues）。
 *
 * 数据结构 (v3):
 *   CASE_DATA         — 案件信息 + 治理统计
 *   NODES_DATA        — 认知层节点 + ontology_ref + governance
 *   EDGES_DATA        — 认知层关系边，带 relation_type + layer
 *   CHAINS_DATA       — FND 推理链树
 *   HYPOTHESIS_DATA   — HYP 支持/反驳结构 + coverage
 *   ONTOLOGY_DATA     — 本体对象摘要（来自 ontology_ref）
 *   GOVERNANCE_ISSUES — 门禁与治理风险
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

// ── 关系类型语义配置 ──────────────────────────────────────────
const RELATION_SEMANTICS = {
  derived_from:     { layer: 'cognitive', direction: 'upstream',   label: 'derive'     },
  supports:         { layer: 'cognitive', direction: 'downstream', label: 'support'    },
  contradicts:      { layer: 'cognitive', direction: 'target',     label: 'contradict' },
  involves:         { layer: 'cognitive', direction: 'entity',     label: 'involve'    },
  corroborated_by:  { layer: 'cognitive', direction: 'peer',       label: 'corroborate'},
  addresses:        { layer: 'cognitive', direction: 'hypothesis', label: 'address'    },
  supported_by:     { layer: 'cognitive', direction: 'passive-up', label: 'sup_by'     },
  contradicted_by:  { layer: 'cognitive', direction: 'passive-up', label: 'cntd_by'    },
};

// ── 本体生命周期状态 ──────────────────────────────────────────
const ONTOLOGY_LIFECYCLE_STATUSES = ['UNRESOLVED', 'VERIFIED', 'DISPUTED', 'SEALED'];

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
    // 内联数组: key: ["val1", "val2"] 或 key: [val1, val2]
    if (val.startsWith('[') && val.endsWith(']')) {
      fm[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      continue;
    }
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
    // 内联数组子键: e.g., supports: ["ARG-001", "ARG-002"]
    for (const im of [...relText.matchAll(/^[ \t]{2}(\w+):\s*\[([^\]]*)\]/gm)]) {
      const relType = im[1];
      if (relations[relType]) continue; // block-list 格式已解析，跳过
      const ids = im[2].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      if (ids.length) relations[relType] = ids.map(id => ({ id, excerpt: '', form: 'text' }));
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

  // 嵌套标量字典（如 ontology_ref: object_id: "P-0001" ...）
  // 匹配 key: 后跟缩进的 key:value 子行（不含列表项 - ）
  const nestedDictRe = /^(\w[\w_-]*):\s*\n((?:[ \t]+[^\n]+\n?)+)/gm;
  while ((m = nestedDictRe.exec(yaml)) !== null) {
    const key = m[1];
    // 已由其他规则处理的跳过
    if (key === 'sources' || key === 'relations' || fm[key] !== undefined) continue;
    const subText = m[2];
    // 只处理子行不含列表项 (- ) 的纯标量字典
    if (/^\s+- /.test(subText)) continue;
    const subDict = {};
    const kvRe = /^\s+(\w[\w_-]*):\s*(.+)$/gm;
    let sm;
    while ((sm = kvRe.exec(subText)) !== null) {
      let sv = sm[2].trim();
      if ((sv.startsWith('"') && sv.endsWith('"')) || (sv.startsWith("'") && sv.endsWith("'")))
        sv = sv.slice(1, -1);
      if (sv) subDict[sm[1]] = sv;
    }
    if (Object.keys(subDict).length > 0) fm[key] = subDict;
  }

  return { frontmatter: fm, body };
}

// ── 读取 nodes/*.md ──────────────────────────────────────────
function loadNodes(nodesDir) {
  const nodes = {};
  if (!fs.existsSync(nodesDir)) return nodes;

  for (const file of fs.readdirSync(nodesDir).filter(f => f.match(/^[A-Z]+-\d+\.(md|json)$/))) {
    const raw = fs.readFileSync(path.join(nodesDir, file), 'utf8');
    let parsed;
    if (file.endsWith('.json')) {
      try { parsed = { frontmatter: JSON.parse(raw), body: '' }; } catch { continue; }
    } else {
      parsed = parseFrontmatter(raw);
    }
    if (!parsed || !parsed.frontmatter?.id) continue;

    const fm = parsed.frontmatter;
    const id = fm.id;
    const prefix = id.replace(/-\d+$/, '');
    const cfg = TYPE_CONFIG[prefix] || { label: '其他', order: 0 };

    let title = fm.title || fm.proposition || fm.statement || fm.name || fm.summary || id;
    if (!fm.title && !fm.proposition && !fm.statement && !fm.name && Array.isArray(fm.alias) && fm.alias.length)
      title = `[${fm.role || '角色'}: ${fm.alias[0]}]`;

    // 优先用新格式 relations（derived_from + supported_by），回退到旧格式 sources
    const derivedFrom = [
      ...(fm.relations?.derived_from || []),
      ...(fm.relations?.supported_by  || []),
    ].map(r => ({
      id: r.id || r,
      excerpt: (r.excerpt || '').slice(0, 80),
      form: r.form || 'text',
    }));
    const legacySources = (fm.sources || []).map(s => ({
      id: s.id,
      excerpt: (s.excerpt || '').slice(0, 80),
      form: s.form || 'text',
    }));

    // 提取 ontology_ref（本体层绑定信息）
    const ontologyRef = fm.ontology_ref || null;
    const governance = computeGovernance(prefix, ontologyRef);

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
      ontology_ref: ontologyRef,
      governance: governance,
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

// ── 治理状态计算 ──────────────────────────────────────────────
function computeGovernance(nodeType, ontologyRef) {
  if (!ontologyRef) {
    // EV / ENT 无本体绑定 → 治理未知
    if (nodeType === 'EV' || nodeType === 'ENT') {
      return { is_verified: false, is_sealed: false, risk_level: 'unbound' };
    }
    return { is_verified: false, is_sealed: false, risk_level: 'none' };
  }
  const ls = ontologyRef.lifecycle_status || 'UNRESOLVED';
  const sealed = ontologyRef.sealed || (nodeType === 'EV' ? ls === 'SEALED' : false);
  const verified = ls === 'VERIFIED' || ls === 'SEALED';
  const disputed = ls === 'DISPUTED';
  let riskLevel = 'none';
  if (disputed) riskLevel = 'high';
  else if (ls === 'UNRESOLVED' && (nodeType === 'EV' || nodeType === 'ENT')) riskLevel = 'warn';
  return { is_verified: verified, is_sealed: sealed, risk_level: riskLevel };
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
          sources: [],  // relations 来自 nodes/FND-NNN.md，由 mergeNodes 覆盖填充
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
  for (const [id, node] of Object.entries(nodesFromFiles)) {
    if (merged[id]) {
      // 防御：文件节点的 title 若是 id 回退值，不覆盖注册表的已有 title
      if (node.title === id && merged[id].title && merged[id].title !== id)
        node.title = merged[id].title;
      merged[id] = { ...merged[id], ...node, source: merged[id].source || node.source || '' };
    } else {
      merged[id] = node;
    }
  }
  return merged;
}

// ── 构建边列表（v3: 带 relation_type + layer）───────────────────
function buildEdges(nodes) {
  const edges = [];
  const seen = new Set();  // 去重：同一条 from→to+relation_type 不重复生成

  for (const [id, node] of Object.entries(nodes)) {
    // 1) 从 sources（derived_from 合集）生成 derived_from 边
    if (node.sources?.length) {
      for (const src of node.sources) {
        if (nodes[src.id] || /^(EV|LS|ARG|FND|ENT|HYP|EVT)-\d+/.test(src.id)) {
          const key = `${src.id}→${id}:derived_from`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: src.id, to: id, relation_type: 'derived_from', layer: 'cognitive', excerpt: (src.excerpt || '').slice(0, 60), form: src.form || 'text' });
          }
        }
      }
    }

    // 2) 从 relations 字典逐类型生成边（支持 supports/contradicts/involves 等）
    const relations = node.relations || {};
    for (const [relType, items] of Object.entries(relations)) {
      if (relType === 'derived_from') continue;  // 已由 sources 覆盖
      if (!Array.isArray(items)) continue;

      const semantics = RELATION_SEMANTICS[relType] || { layer: 'cognitive', direction: 'unknown' };

      for (const item of items) {
        const tid = item.id || item;
        if (!tid) continue;
        // 确定边的方向：大部分关系 from=item→to=node（上游到下游），
        // 但 supports/contradicts 方向是 from=node→to=item（下游到目标）
        let fromId, toId;
        if (semantics.direction === 'downstream' || semantics.direction === 'target' || semantics.direction === 'hypothesis') {
          fromId = id; toId = tid;   // supports: LS→ARG, contradicts: LS→HYP
        } else {
          fromId = tid; toId = id;   // supported_by: EV→HYP, involves: ENT→EV
        }
        const key = `${fromId}→${toId}:${relType}`;
        if (!seen.has(key)) {
          seen.add(key);
          const excerpt = (typeof item === 'object' && item.excerpt) ? item.excerpt.slice(0, 60) : '';
          const form = (typeof item === 'object' && item.form) ? item.form : 'text';
          edges.push({ from: fromId, to: toId, relation_type: relType, layer: semantics.layer, excerpt, form });
        }
      }
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

// ── 统计信息（v3: 含治理统计）─────────────────────────────────
function buildCaseInfo(caseDir, nodes) {
  const info = {
    id: path.basename(caseDir),
    title: '调查案件',
    subtitle: new Date().toISOString().split('T')[0],
    stats: { total: 0, types: {}, statuses: { ready: 0, draft: 0, superseded: 0 } },
    governance: { VERIFIED: 0, SEALED: 0, UNRESOLVED: 0, DISPUTED: 0, unbound: 0 },
  };
  for (const n of Object.values(nodes)) {
    info.stats.total++;
    info.stats.types[n.type] = (info.stats.types[n.type] || 0) + 1;
    if (n.status in info.stats.statuses) info.stats.statuses[n.status]++;
    if (n.governance) {
      const ref = n.ontology_ref;
      if (!ref && (n.type === 'EV' || n.type === 'ENT')) {
        info.governance.unbound++;
      } else if (ref) {
        const ls = ref.lifecycle_status || 'UNRESOLVED';
        if (ls in info.governance) info.governance[ls]++;
      }
    }
  }
  const fnd = Object.values(nodes).find(n => n.type === 'FND');
  if (fnd) info.title = fnd.title || info.title;
  // 读取 meta.json 尝试获取调查阶段
  const metaPath = path.join(caseDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.phase) info.phase = meta.phase;
    } catch {}
  }
  return info;
}

// ── 构建 HYPOTHESIS_DATA ──────────────────────────────────────
function buildHypothesisData(nodes) {
  const hypotheses = [];
  const hypNodes = Object.values(nodes).filter(n => n.type === 'HYP');

  for (const h of hypNodes) {
    const relations = h.relations || {};
    const supportedBy = (relations.supported_by || []).map(r => r.id || r);
    const contradictedBy = (relations.contradicted_by || []).map(r => r.id || r);
    const addresses = (relations.addresses || []).map(r => r.id || r);

    const supportCount = supportedBy.length;
    const contradictionCount = contradictedBy.length;
    const hasUnresolvedContradiction = contradictionCount > 0 && h.status === 'confirmed';

    hypotheses.push({
      id: h.id,
      statement: h.title || h.assertion || '',
      status: h.status || 'active',
      confidence: h.confidence || null,
      supported_by: supportedBy,
      contradicted_by: contradictedBy,
      addresses: addresses,
      coverage: {
        support_count: supportCount,
        contradiction_count: contradictionCount,
        has_support: supportCount > 0,
        has_contradiction: contradictionCount > 0,
        has_unresolved_contradiction: hasUnresolvedContradiction,
      },
    });
  }
  return hypotheses;
}

// ── 构建 ONTOLOGY_DATA ────────────────────────────────────────
function buildOntologyData(nodes) {
  const objects = {};
  for (const n of Object.values(nodes)) {
    if (!n.ontology_ref) continue;
    const ref = n.ontology_ref;
    const oid = ref.object_id;
    if (!oid) continue;
    // 同一本体对象可能被多个认知节点引用，保留第一个来源节点
    if (!objects[oid]) {
      objects[oid] = {
        object_type: ref.object_type || '',
        display_name: n.title || n.assertion || oid,
        lifecycle_status: ref.lifecycle_status || 'UNRESOLVED',
        source_nodes: [n.id],
      };
    } else {
      objects[oid].source_nodes.push(n.id);
    }
  }
  return { objects, relations: [] };  // relations 留给 Phase 5（读取 global_ontology/relations/）
}

// ── 构建 GOVERNANCE_ISSUES ────────────────────────────────────
function buildGovernanceIssues(nodes) {
  const issues = [];
  const nodeMap = {};
  for (const n of Object.values(nodes)) nodeMap[n.id] = n;

  // 1. EV/ENT 无 ontology_ref → 治理未绑定
  for (const n of Object.values(nodes)) {
    if (n.type === 'EV' || n.type === 'ENT') {
      if (!n.ontology_ref) {
        issues.push({
          severity: 'WARN',
          type: 'unbound_ontology_ref',
          message: `${n.id} (${n.type}) 未绑定本体对象，治理状态不可追踪`,
          node: n.id,
          ontology_object: null,
        });
      } else if (n.ontology_ref.lifecycle_status === 'UNRESOLVED') {
        issues.push({
          severity: 'WARN',
          type: 'unresolved_entity',
          message: `${n.id} 对应的本体对象 ${n.ontology_ref.object_id} 尚未 VERIFIED`,
          node: n.id,
          ontology_object: n.ontology_ref.object_id,
        });
      } else if (n.ontology_ref.lifecycle_status === 'DISPUTED') {
        issues.push({
          severity: 'ERROR',
          type: 'disputed_entity',
          message: `${n.id} 对应的本体对象 ${n.ontology_ref.object_id} 处于 DISPUTED 状态`,
          node: n.id,
          ontology_object: n.ontology_ref.object_id,
        });
      }
    }
  }

  // 2. FND 链上存在未验证对象
  for (const n of Object.values(nodes)) {
    if (n.type !== 'FND') continue;
    // 检查 FND 的 derived_from 链中是否涉及治理风险节点
    const chainIds = collectChainIds(n.id, nodeMap);
    for (const cid of chainIds) {
      const cn = nodeMap[cid];
      if (!cn) continue;
      if (cn.governance && cn.governance.risk_level === 'warn') {
        issues.push({
          severity: 'WARN',
          type: 'unverified_entity_in_finding_chain',
          message: `${n.id} (FND) 的推理链中包含未验证对象 ${cid}`,
          node: n.id,
          ontology_object: cn.ontology_ref?.object_id || null,
        });
      }
      if (cn.governance && cn.governance.risk_level === 'high') {
        issues.push({
          severity: 'ERROR',
          type: 'disputed_entity_in_finding_chain',
          message: `${n.id} (FND) 的推理链中包含争议对象 ${cid}`,
          node: n.id,
          ontology_object: cn.ontology_ref?.object_id || null,
        });
      }
    }
  }

  // 3. FND 依赖的 EV 未 sealed（REVIEWING 阶段关注）
  for (const n of Object.values(nodes)) {
    if (n.type !== 'FND') continue;
    const chainIds = collectChainIds(n.id, nodeMap);
    for (const cid of chainIds) {
      const cn = nodeMap[cid];
      if (!cn || cn.type !== 'EV') continue;
      if (cn.governance && !cn.governance.is_sealed && cn.status === 'ready') {
        issues.push({
          severity: 'INFO',
          type: 'unsealed_evidence_in_chain',
          message: `${n.id} (FND) 依赖的 ${cid} (EV) 尚未 sealed`,
          node: n.id,
          ontology_object: cn.ontology_ref?.object_id || null,
        });
      }
    }
  }

  // 4. HYP coverage 问题
  for (const n of Object.values(nodes)) {
    if (n.type !== 'HYP') continue;
    const rel = n.relations || {};
    const supportedBy = (rel.supported_by || []).length;
    const contradictedBy = (rel.contradicted_by || []).length;
    if (n.status === 'active' && supportedBy === 0 && contradictedBy === 0) {
      issues.push({
        severity: 'WARN',
        type: 'unsupported_hypothesis',
        message: `${n.id} (HYP, active) 无任何支持或反驳证据`,
        node: n.id,
        ontology_object: null,
      });
    }
  }

  return issues;
}

// ── 辅助：收集推理链上所有节点 ID ──────────────────────────────
function collectChainIds(fndId, nodeMap, visited = new Set()) {
  if (visited.has(fndId)) return [];
  visited.add(fndId);
  const n = nodeMap[fndId];
  if (!n) return [];
  const ids = [fndId];
  if (n.sources) {
    for (const s of n.sources) {
      ids.push(...collectChainIds(s.id, nodeMap, visited));
    }
  }
  return ids;
}

// ── 生成 HTML（v3: 注入新增数据块）─────────────────────────────
function generateHTML(caseInfo, nodes, edges, chains, hypothesisData, ontologyData, governanceIssues) {
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
    `const HYPOTHESIS_DATA = ${JSON.stringify(hypothesisData, replacer, 2)};`,
    `const ONTOLOGY_DATA = ${JSON.stringify(ontologyData, replacer, 2)};`,
    `const GOVERNANCE_ISSUES = ${JSON.stringify(governanceIssues, replacer, 2)};`,
  ].join('\n\n');

  return html.slice(0, si + startMarker.length) + '\n\n' + dataBlock + '\n\n' + html.slice(ei);
}

// ── 主程序（v3: 含 HYP/治理数据）───────────────────────────────
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
  console.log(`[info] 边: ${edges.length} 条 (含 relation_type)`);
  const chains = buildAllChains(allNodes);
  console.log(`[info] 链: ${chains.length} 条`);
  const hypothesisData = buildHypothesisData(allNodes);
  console.log(`[info] 假设: ${hypothesisData.length} 个`);
  const ontologyData = buildOntologyData(allNodes);
  console.log(`[info] 本体对象: ${Object.keys(ontologyData.objects).length} 个`);
  const governanceIssues = buildGovernanceIssues(allNodes);
  console.log(`[info] 治理问题: ${governanceIssues.length} 项`);
  const caseInfo = buildCaseInfo(caseDir, allNodes);
  const html = generateHTML(caseInfo, allNodes, edges, chains, hypothesisData, ontologyData, governanceIssues);
  fs.writeFileSync(outputFile, html);
  console.log(`[info] 已生成: ${path.resolve(outputFile)}`);
}

main();
