#!/usr/bin/env node
/**
 * scan-chain.js — 证据链编译与完整性检查工具 (v4 统一版)
 *
 * 合并了 scan-chain.py (Python) 和 evidence_chain_injector.js (Node.js) 的全部功能。
 * 使用单一 YAML frontmatter 解析器（缩进感知状态机，移植自 Python 版）。
 *
 * 用法:
 *   node scan-chain.js cases/CASE-2026-001/ --list
 *   node scan-chain.js cases/CASE-2026-001/ --trace FND-001
 *   node scan-chain.js cases/CASE-2026-001/ --integrity
 *   node scan-chain.js cases/CASE-2026-001/ --check-chains
 *   node scan-chain.js cases/CASE-2026-001/ --validate
 *   node scan-chain.js cases/CASE-2026-001/ --sync
 *   node scan-chain.js cases/CASE-2026-001/ --graph
 *   node scan-chain.js cases/CASE-2026-001/ --html output.html
 *   node scan-chain.js cases/CASE-2026-001/ --json-dump data.json
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// §1 常量定义
// ═══════════════════════════════════════════════════════════════

const NODE_TYPES = {
  EV: 'evidence', LS: 'clue', ARG: 'argument', FND: 'finding',
  ENT: 'entity', HYP: 'hypothesis', EVT: 'event',
};

const TYPE_PREFIX_MAP = {
  evidence: 'EV', clue: 'LS', argument: 'ARG', finding: 'FND',
  entity: 'ENT', hypothesis: 'HYP', event: 'EVT',
};

const VALID_TYPES = new Set(Object.values(NODE_TYPES));

const RELATION_TYPES = new Set([
  'derived_from', 'supports', 'contradicts', 'involves',
  'corroborated_by', 'addresses', 'supported_by', 'contradicted_by',
]);

const RELATION_SEMANTICS = {
  derived_from:    { layer: 'cognitive', direction: 'upstream',   label: 'derive'     },
  supports:        { layer: 'cognitive', direction: 'downstream', label: 'support'    },
  contradicts:     { layer: 'cognitive', direction: 'target',     label: 'contradict' },
  involves:        { layer: 'cognitive', direction: 'entity',     label: 'involve'    },
  corroborated_by: { layer: 'cognitive', direction: 'peer',       label: 'corroborate'},
  addresses:       { layer: 'cognitive', direction: 'hypothesis', label: 'address'    },
  supported_by:    { layer: 'cognitive', direction: 'passive-up', label: 'sup_by'     },
  contradicted_by: { layer: 'cognitive', direction: 'passive-up', label: 'cntd_by'    },
};

const CHAIN_RULES = {
  clue:     { allowedPrefixes: new Set(['EV']),       minSources: 1 },
  argument: { allowedPrefixes: new Set(['LS', 'ARG']), minSources: 1 },
  finding:  { allowedPrefixes: new Set(['ARG']),       minSources: 1 },
  event:    { allowedPrefixes: new Set(['EV']),        minSources: 0 },
};

const REQUIRED_FIELDS = {
  evidence:  ['id', 'type', 'status'],
  clue:      ['id', 'type', 'status'],
  argument:  ['id', 'type', 'status', 'proposition'],
  finding:   ['id', 'type', 'status', 'statement', 'confidence'],
  entity:    ['id', 'type', 'entity_type', 'name'],
  hypothesis:['id', 'type', 'statement', 'status'],
  event:     ['id', 'type', 'title', 'moment', 'time_type'],
};

const ID_PATTERN = /^(EV|LS|ARG|FND|ENT|HYP|EVT)-\d{3,}$/;

const VALID_STATUS_HYP = new Set(['active', 'rejected', 'confirmed', '']);
const VALID_STATUS_GEN = new Set(['draft', 'ready', 'superseded', '']);

const ONTOLOGY_LIFECYCLE_STATUSES = new Set(['UNRESOLVED', 'VERIFIED', 'DISPUTED', 'SEALED']);
const ONTOLOGY_OBJECT_TYPES = new Set(['Person', 'Organization', 'Account', 'Evidence', 'Case']);

const TYPE_CONFIG = {
  EV:  { label: '原始证据', order: 0 },
  LS:  { label: '线索',     order: 1 },
  ARG: { label: '论据',     order: 2 },
  FND: { label: '结论',     order: 3 },
  ENT: { label: '实体',     order: 0 },
  HYP: { label: '假设',     order: 0 },
  EVT: { label: '事件',     order: 0 },
};

const LABEL_MAP = {
  derived_from: 'derive', supports: 'support',
  contradicts: 'contradict', involves: 'involve',
  corroborated_by: 'corroborate', addresses: 'address',
  supported_by: 'sup_by', contradicted_by: 'cntd_by',
};

// ═══════════════════════════════════════════════════════════════
// §2 YAML Frontmatter 解析器（缩进感知状态机，移植自 Python）
// ═══════════════════════════════════════════════════════════════

function stripQuotes(val) {
  val = val.trim();
  if (val.length >= 2 && val[0] === val[val.length - 1] && (val[0] === '"' || val[0] === "'")) {
    return val.slice(1, -1);
  }
  return val;
}

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * 解析 markdown 文件 YAML frontmatter。
 * 支持: key: scalar / key: [list] / key: [] / 缩进列表 / 嵌套字典
 * 移植自 scan-chain.py 的 parse_frontmatter，使用缩进感知而非硬编码空格数。
 */
function parseFrontmatterFile(filepath) {
  let content;
  try {
    content = fs.readFileSync(filepath, 'utf8');
  } catch (e) {
    process.stderr.write(`  [WARN] 无法读取 ${filepath}: ${e.message}\n`);
    return null;
  }
  return parseFrontmatterText(content);
}

function parseFrontmatterText(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('---', 3);
  if (end === -1) return null;

  const raw = content.slice(3, end).replace(/\r/g, '').trim();
  const body = content.slice(end + 3).trim();
  const lines = raw.split('\n');

  const result = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    const indent = indentOf(line);
    i++;

    if (!stripped || stripped.startsWith('#')) continue;

    const topMatch = stripped.match(/^(\w[\w_-]*):\s*(.*)/);
    if (!topMatch) continue;

    const key = topMatch[1];
    const val = topMatch[2].trim();

    // 内联数组: key: [val1, val2]
    if (val.startsWith('[') && val.endsWith(']')) {
      result[key] = parseInlineList(val);
      continue;
    }

    // 空列表: key: []
    if (val === '[]') {
      result[key] = [];
      continue;
    }

    // 空值 → 后续缩进行是子内容
    if (val === '' || val === '|') {
      const subLines = collectIndented(lines, i, indent);
      i += subLines.length;

      if (subLines.length > 0 && !subLines[0].trim().startsWith('- ')) {
        // 嵌套字典（如 relations: derived_from: ...）
        result[key] = parseNestedDict(subLines);
      } else if (subLines.length > 0) {
        // 值列表（如 sources: - id: xxx）
        result[key] = parseListItems(subLines);
      } else {
        result[key] = val === '|' ? '' : val;
      }
      continue;
    }

    // 普通标量值
    result[key] = stripQuotes(val);
  }

  return { frontmatter: result, body };
}

function parseInlineList(val) {
  const items = [];
  for (const item of val.slice(1, -1).split(',')) {
    const trimmed = item.trim().replace(/^['"]|['"]$/g, '');
    if (trimmed) items.push(trimmed);
  }
  return items;
}

/**
 * 收集缩进大于 baseIndent 的连续行（移植自 _collect_indented）。
 * 空行和注释行被收集但不阻止后续行的收集。
 */
function collectIndented(lines, startIdx, baseIndent) {
  const collected = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      collected.push(line);
      continue;
    }
    if (indentOf(line) <= baseIndent) break;
    collected.push(line);
  }
  return collected;
}

/**
 * 解析嵌套字典，同时支持标量子键（ontology_ref）和列表子键（relations）。
 * 标量值存储为字符串，列表项 - 触发数组模式。
 * 同时处理 "- id: xxx"（详细格式）和 "- ARG-001"（简单格式）。
 */
function parseNestedDict(lines) {
  const result = {};
  let currentKey = null;
  let currentVal = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    i++;

    if (!stripped || stripped.startsWith('#')) continue;

    // 子键: key: value
    const sm = stripped.match(/^(\w[\w_-]*):\s*(.*)/);
    if (sm) {
      if (currentKey !== null && currentVal !== null) {
        result[currentKey] = currentVal;
      }
      currentKey = sm[1];
      const val = sm[2].trim();

      if (val === '[]') {
        currentVal = [];
      } else if (val.startsWith('[') && val.endsWith(']')) {
        currentVal = parseInlineList(val);
      } else if (val === '' || val === '|') {
        currentVal = [];  // 占位——列表项可能紧随其后
      } else {
        currentVal = stripQuotes(val);  // 标量——存储为字符串，不包装成数组
      }
      continue;
    }

    // 列表元素: - id: xxx 或 - "value" 或 - ARG-001
    const lst = stripped.match(/^- (.+)/);
    if (lst && currentKey !== null) {
      // 若当前值是标量（字符串），转为数组以接纳列表项
      if (typeof currentVal === 'string') {
        currentVal = [currentVal];
      }
      if (!Array.isArray(currentVal)) {
        currentVal = [];
      }

      const content = lst[1];
      const kv = content.match(/^(\w[\w_-]*):\s*(.*)/);
      if (kv) {
        // 详细格式: - id: EV-001
        const obj = {};
        obj[kv[1]] = stripQuotes(kv[2].trim());
        currentVal.push(obj);

        // 收集子字段（excerpt, form 等）——仅在更深缩进层
        const itemIndent = indentOf(line);
        while (i < lines.length) {
          const nxtStripped = lines[i].trim();
          if (!nxtStripped || nxtStripped.startsWith('#')) { i++; continue; }
          const nxtIndent = indentOf(lines[i]);
          if (nxtIndent <= itemIndent) break;

          const sub = nxtStripped.match(/^(\w+):\s*(.*)/);
          if (sub && typeof currentVal[currentVal.length - 1] === 'object') {
            currentVal[currentVal.length - 1][sub[1]] = stripQuotes(sub[2].trim());
            i++;
          } else {
            break;
          }
        }
      } else {
        // 简单格式: - ARG-001
        currentVal.push(stripQuotes(content));
      }
    }
  }

  if (currentKey !== null && currentVal !== null) {
    result[currentKey] = currentVal;
  }
  return result;
}

/**
 * 解析列表项（移植自 _parse_list_items）。
 */
function parseListItems(lines) {
  const items = [];
  let currentObj = null;

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) continue;

    const lst = stripped.match(/^- (.+)/);
    if (lst) {
      if (currentObj !== null) items.push(currentObj);
      const content = lst[1];
      const kv = content.match(/^(\w[\w_-]*):\s*(.*)/);
      if (kv) {
        currentObj = {};
        currentObj[kv[1]] = stripQuotes(kv[2].trim());
      } else {
        items.push(stripQuotes(content));
        currentObj = null;
      }
      continue;
    }

    const sub = stripped.match(/^(\w+):\s*(.*)/);
    if (sub && currentObj !== null) {
      currentObj[sub[1]] = stripQuotes(sub[2].trim());
    }
  }

  if (currentObj !== null) items.push(currentObj);
  return items;
}

// ═══════════════════════════════════════════════════════════════
// §3 节点加载与归一化
// ═══════════════════════════════════════════════════════════════

function readJsonNode(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeRelations(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [rt, vals] of Object.entries(raw)) {
    // 安全网：标量值自动包装为数组（如 derived_from: ARG-001 而非列表格式）
    const arr = Array.isArray(vals) ? vals : (vals ? [vals] : []);
    const cleaned = [];
    for (const v of arr) {
      if (typeof v === 'string') {
        cleaned.push(v);
      } else if (v && typeof v === 'object' && v.id) {
        cleaned.push(v);
      }
    }
    out[rt] = cleaned;
  }
  return out;
}

function flatIds(relations, relType) {
  const ids = [];
  const types = relType ? [relType] : Object.keys(relations);
  for (const t of types) {
    const items = relations[t] || [];
    for (const item of items) {
      if (typeof item === 'string') {
        ids.push(item);
      } else if (item && item.id) {
        ids.push(item.id);
      }
    }
  }
  return ids.filter(Boolean);
}

function computeGovernance(typePrefix, ontologyRef) {
  if (!ontologyRef) {
    if (typePrefix === 'EV' || typePrefix === 'ENT') {
      return { is_verified: false, is_sealed: false, risk_level: 'unbound' };
    }
    return { is_verified: false, is_sealed: false, risk_level: 'none' };
  }
  const ls = ontologyRef.lifecycle_status || 'UNRESOLVED';
  // Bug 7 修复：正确处理 sealed 的布尔值和字符串 "false"
  const sealedRaw = ontologyRef.sealed;
  const sealed = sealedRaw === true || sealedRaw === 'true' ||
                 (typePrefix === 'EV' ? ls === 'SEALED' : false);
  const verified = ls === 'VERIFIED' || ls === 'SEALED';
  const disputed = ls === 'DISPUTED';
  let riskLevel = 'none';
  if (disputed) riskLevel = 'high';
  else if (ls === 'UNRESOLVED' && (typePrefix === 'EV' || typePrefix === 'ENT')) riskLevel = 'warn';
  return { is_verified: verified, is_sealed: sealed, risk_level: riskLevel };
}

function loadAllNodes(caseDir) {
  const nodesDir = path.join(caseDir, 'nodes');
  const nodes = {};

  if (!fs.existsSync(nodesDir) || !fs.statSync(nodesDir).isDirectory()) {
    process.stderr.write(`  [WARN] nodes/ 目录不存在: ${nodesDir}\n`);
    return nodes;
  }

  const files = fs.readdirSync(nodesDir).sort();
  for (const file of files) {
    const fpath = path.join(nodesDir, file);
    if (fs.statSync(fpath).isDirectory()) continue;
    if (!file.endsWith('.md') && !file.endsWith('.json')) continue;

    let fm, body = '';
    if (file.endsWith('.json')) {
      fm = readJsonNode(fpath);
    } else {
      const parsed = parseFrontmatterFile(fpath);
      fm = parsed ? parsed.frontmatter : null;
      body = parsed ? parsed.body : '';
    }
    if (!fm || !fm.id || !fm.type) continue;

    const id = fm.id;
    const typePrefix = id.replace(/-\d+$/, '');
    const type = fm.type;
    const cfg = TYPE_CONFIG[typePrefix] || { label: '其他', order: 0 };

    // Bug 10 修复：HYP 默认 status 为 active
    const defaultStatus = type === 'hypothesis' ? 'active' : 'draft';
    const status = fm.status || defaultStatus;

    // Title 提取（从 injector.js 移植）
    let title = fm.title || fm.proposition || fm.statement || fm.name || id;
    if (!fm.title && !fm.proposition && !fm.statement && !fm.name &&
        Array.isArray(fm.alias) && fm.alias.length) {
      title = `[${fm.role || '角色'}: ${fm.alias[0]}]`;
    }

    // 关系归一化
    const relations = normalizeRelations(fm.relations);

    // Bug 2 修复：sources 只含 derived_from，不混入 supported_by
    const sources = (relations.derived_from || []).map(r => ({
      id: typeof r === 'string' ? r : r.id,
      excerpt: (typeof r === 'object' ? (r.excerpt || '') : '').slice(0, 80),
      form: typeof r === 'object' ? (r.form || 'text') : 'text',
    }));

    // 旧格式 sources 回退
    if (sources.length === 0 && Array.isArray(fm.sources)) {
      for (const s of fm.sources) {
        if (s && s.id) {
          sources.push({ id: s.id, excerpt: (s.excerpt || '').slice(0, 80), form: s.form || 'text' });
        }
      }
    }

    // 本体绑定
    const ontologyRef = fm.ontology_ref || null;
    const governance = computeGovernance(typePrefix, ontologyRef);

    nodes[id] = {
      id,
      type,                    // 完整类型名（来自 frontmatter）
      typePrefix,              // ID 前缀（EV/LS/ARG/...）
      status,
      title,
      body,
      assertion: fm.proposition || fm.statement || fm.title || fm.name || '',
      intent: fm.intent || '',
      relations,
      sources,                 // 仅 derived_from（Bug 2 修复）
      ontology_ref: ontologyRef,
      governance,
      confidence: fm.confidence || null,
      generated_by: fm.generated_by || '',
      reviewed_by: fm.reviewed_by || '',
      entity_type: fm.entity_type || null,
      role: fm.role || null,
      has_old_sources: Array.isArray(fm.sources),
      file: path.relative(caseDir, fpath).replace(/\\/g, '/'),
      _order: cfg.order,
    };
  }

  return nodes;
}

function loadRegistry(jsonPath) {
  if (!fs.existsSync(jsonPath)) return {};
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch { return {}; }

  // 项目格式: { evidence_items: [...], findings: [...] }
  if (raw.evidence_items && Array.isArray(raw.evidence_items)) {
    const result = {};
    for (const item of raw.evidence_items) {
      const id = item.evidence_id;
      if (!id) continue;
      result[id] = {
        id,
        type: 'EV', typePrefix: 'EV',
        status: item.confidence === 'confirmed' ? 'ready' : 'draft',
        title: item.summary || item.source || id,
        body: '', assertion: item.summary || '', intent: '',
        sources: [], relations: {},
        confidence: item.confidence || 'probable',
        evidence_type: item.type || '',
        collected_at: item.collected_at || '',
        collected_by: item.collected_by || '',
        source: item.source || '',
        generated_by: '', reviewed_by: '',
      };
    }
    if (raw.findings && Array.isArray(raw.findings)) {
      for (const f of raw.findings) {
        const fid = f.finding_id;
        if (!fid) continue;
        result[fid] = {
          id: fid, type: 'FND', typePrefix: 'FND',
          status: f.confidence === 'confirmed' ? 'ready' : 'draft',
          title: f.statement || fid,
          body: '', assertion: f.statement || '', intent: '',
          sources: [], relations: {},
          confidence: f.confidence || 'probable',
          fraud_type: Array.isArray(f.fraud_type) ? f.fraud_type.join(', ') : (f.fraud_type || ''),
          generated_by: '', reviewed_by: '',
        };
      }
    }
    return result;
  }

  // 老格式 fallback
  if (raw.evidence && Array.isArray(raw.evidence)) return extractSimple(raw.evidence, 'id');
  if (Array.isArray(raw)) return extractSimple(raw, 'id');
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

function mergeNodes(fileNodes, registryNodes) {
  const merged = { ...registryNodes };
  for (const [id, node] of Object.entries(fileNodes)) {
    if (merged[id]) {
      merged[id] = { ...merged[id], ...node, source: merged[id].source || node.source || '' };
    } else {
      merged[id] = node;
    }
  }
  return merged;
}

// ═══════════════════════════════════════════════════════════════
// §4 图构建
// ═══════════════════════════════════════════════════════════════

function buildGraph(nodes) {
  const allNodes = {};
  const upstream = {};
  const downstream = {};

  for (const n of Object.values(nodes)) {
    allNodes[n.id] = n;
    upstream[n.id] = [];
    if (!downstream[n.id]) downstream[n.id] = [];

    for (const [rt, items] of Object.entries(n.relations || {})) {
      for (const item of items) {
        const tid = typeof item === 'object' ? item.id : item;
        if (!tid) continue;
        upstream[n.id].push({
          id: tid,
          relation_type: rt,
          excerpt: typeof item === 'object' ? (item.excerpt || '') : '',
        });
        if (rt === 'derived_from' || rt === 'supports') {
          if (!downstream[tid]) downstream[tid] = [];
          downstream[tid].push({ id: n.id, relation_type: rt });
        }
      }
    }
  }

  return { all: allNodes, upstream, downstream };
}

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

// ═══════════════════════════════════════════════════════════════
// §5 检查逻辑（从 scan-chain.py 移植）
// ═══════════════════════════════════════════════════════════════

function checkIntegrity(nodes) {
  const issues = [];
  const allIds = new Set(Object.keys(nodes));
  const statusMap = {};
  for (const n of Object.values(nodes)) statusMap[n.id] = n.status;
  const graph = buildGraph(nodes);

  // 废弃 sources
  for (const n of Object.values(nodes)) {
    if (n.has_old_sources) {
      issues.push({ severity: 'WARN', type: 'deprecated_sources',
        message: `${n.id} 使用了已废弃的 'sources' 字段，应改用 'relations'`, node: n.id });
    }
  }

  // ready 依赖 draft
  for (const n of Object.values(nodes)) {
    if (n.type !== 'finding' && n.type !== 'argument') continue;
    if (n.status !== 'ready') continue;
    for (const refId of flatIds(n.relations)) {
      if (statusMap[refId] && statusMap[refId] !== 'ready') {
        issues.push({ severity: 'WARN', type: 'draft_dependency',
          message: `${n.id} (ready) 依赖 ${refId} (status: ${statusMap[refId]})`,
          node: n.id, depends_on: refId });
      }
    }
  }

  // 缺失引用
  for (const n of Object.values(nodes)) {
    for (const refId of flatIds(n.relations)) {
      if (!allIds.has(refId)) {
        const sev = (n.type === 'finding' || n.type === 'argument') ? 'ERROR' : 'WARN';
        issues.push({ severity: sev, type: 'missing_source',
          message: `${n.id} 引用不存在的节点 ${refId}`, node: n.id, depends_on: refId });
      }
    }
  }

  // FND 直引 EV
  for (const n of Object.values(nodes)) {
    if (n.type !== 'finding') continue;
    for (const refId of flatIds(n.relations, 'derived_from')) {
      if (refId.startsWith('EV-')) {
        issues.push({ severity: 'INFO', type: 'direct_evidence_ref',
          message: `${n.id} 直接引用 EV-，建议通过 ARG 节点`, node: n.id, depends_on: refId });
      }
    }
  }

  // 孤立
  for (const n of Object.values(nodes)) {
    if (['evidence', 'entity', 'hypothesis', 'event'].includes(n.type)) continue;
    const hasUp = (graph.upstream[n.id] || []).length > 0;
    const hasDown = (graph.downstream[n.id] || []).length > 0;
    if (!hasUp && !hasDown) {
      issues.push({ severity: 'INFO', type: 'orphan_node',
        message: `${n.id} 无上下游关联`, node: n.id });
    }
  }

  // 治理 readiness
  for (const n of Object.values(nodes)) {
    if (n.type !== 'finding') continue;
    const chainIds = collectChainIds(n.id, graph.all, new Set());
    for (const cid of chainIds) {
      const cn = graph.all[cid];
      if (!cn || !cn.ontology_ref) continue;
      const ls = cn.ontology_ref.lifecycle_status || '';
      if (ls === 'DISPUTED') {
        issues.push({ severity: 'ERROR', type: 'disputed_in_finding_chain',
          message: `${n.id} (FND) 的推理链中 ${cid} 处于 DISPUTED 状态`, node: n.id, depends_on: cid });
      } else if (ls === 'UNRESOLVED' && ['evidence', 'entity'].includes(cn.type)) {
        issues.push({ severity: 'WARN', type: 'unresolved_in_finding_chain',
          message: `${n.id} (FND) 的推理链中 ${cid} 尚未 VERIFIED`, node: n.id, depends_on: cid });
      }
    }
  }

  // FND ready 链中 draft
  for (const n of Object.values(nodes)) {
    if (n.type !== 'finding' || n.status !== 'ready') continue;
    const chainIds = collectChainIds(n.id, graph.all, new Set());
    for (const cid of chainIds) {
      const cn = graph.all[cid];
      if (cn && cn.status === 'draft' && ['clue', 'argument', 'evidence'].includes(cn.type)) {
        issues.push({ severity: 'WARN', type: 'draft_in_ready_chain',
          message: `${n.id} (FND, ready) 的链中 ${cid} 仍为 draft`, node: n.id, depends_on: cid });
      }
    }
  }

  return issues;
}

function checkChains(nodes) {
  const issues = [];
  const allIds = new Set(Object.keys(nodes));

  // 1. 类型检查
  for (const n of Object.values(nodes)) {
    const rules = CHAIN_RULES[n.type];
    if (!rules) continue;
    const derived = flatIds(n.relations, 'derived_from');
    for (const refId of derived) {
      if (!allIds.has(refId)) continue;
      const prefix = refId.split('-')[0];
      if (!rules.allowedPrefixes.has(prefix)) {
        issues.push({ severity: 'WARN', type: 'chain_type_mismatch',
          message: `${n.id} (${n.type}) derived_from ${refId} 应为 ${[...rules.allowedPrefixes]} 类型，实际为 ${prefix}`,
          node: n.id, depends_on: refId });
      }
    }
    if (derived.length < rules.minSources) {
      issues.push({ severity: rules.minSources > 0 ? 'ERROR' : 'INFO', type: 'chain_insufficient_sources',
        message: `${n.id} (${n.type}) derived_from 应 ≥${rules.minSources} 个，实际 ${derived.length} 个`, node: n.id });
    }
  }

  // 2. 循环引用
  const graph = {};
  for (const n of Object.values(nodes)) {
    graph[n.id] = flatIds(n.relations, 'derived_from').filter(id => allIds.has(id));
  }
  const visited = new Set();
  const pathStack = new Set();
  function detectCycle(nid) {
    if (pathStack.has(nid)) return [nid];
    if (visited.has(nid)) return null;
    visited.add(nid);
    pathStack.add(nid);
    for (const nb of graph[nid] || []) {
      const res = detectCycle(nb);
      if (res !== null) {
        pathStack.delete(nid);
        return res[0] !== nb ? [nid, ...res] : [nb, nid];
      }
    }
    pathStack.delete(nid);
    return null;
  }
  for (const nid of Object.keys(graph)) {
    const cycle = detectCycle(nid);
    if (cycle) {
      const deduped = [...new Set(cycle)];
      issues.push({ severity: 'ERROR', type: 'chain_cycle',
        message: `derived_from 循环: ${deduped.join(' → ')}`, node: deduped[0] });
    }
  }

  // 3. 冲突
  const sup = new Set(), cnt = new Set();
  for (const n of Object.values(nodes)) {
    for (const ref of flatIds(n.relations, 'supports')) sup.add(`${n.id}|${ref}`);
    for (const ref of flatIds(n.relations, 'contradicts')) cnt.add(`${n.id}|${ref}`);
  }
  for (const pair of sup) {
    if (cnt.has(pair)) {
      const [a, b] = pair.split('|');
      issues.push({ severity: 'WARN', type: 'chain_conflict',
        message: `${a} 同时对 ${b} 标记 supports 和 contradicts`, node: a, depends_on: b });
    }
  }

  // 4. HYP coverage
  for (const n of Object.values(nodes)) {
    if (n.type !== 'hypothesis') continue;
    const supportedBy = flatIds(n.relations, 'supported_by');
    const contradictedBy = flatIds(n.relations, 'contradicted_by');

    if (n.status === 'active' && !supportedBy.length && !contradictedBy.length) {
      issues.push({ severity: 'WARN', type: 'unsupported_hypothesis',
        message: `${n.id} (HYP, active) 无任何支持或反驳证据`, node: n.id });
    }
    if (n.status === 'confirmed' && contradictedBy.length) {
      issues.push({ severity: 'WARN', type: 'confirmed_with_contradictions',
        message: `${n.id} (HYP, confirmed) 仍存在反驳证据: ${contradictedBy.join(', ')}`, node: n.id });
    }
    if (n.status === 'rejected' && !contradictedBy.length) {
      const addresses = flatIds(n.relations, 'addresses');
      if (!addresses.length) {
        issues.push({ severity: 'INFO', type: 'rejected_without_contradictions',
          message: `${n.id} (HYP, rejected) 无反驳证据，需确认 rejection 理由`, node: n.id });
      }
    }
  }

  return issues;
}

function validateNodeFile(caseDir, relPath) {
  const errors = [];
  const fpath = path.join(caseDir, relPath);
  if (!fs.existsSync(fpath)) {
    return [{ severity: 'ERROR', type: 'file_not_found', message: `${relPath}: 不存在` }];
  }

  let meta;
  if (fpath.endsWith('.json')) {
    meta = readJsonNode(fpath);
  } else {
    const parsed = parseFrontmatterFile(fpath);
    meta = parsed ? parsed.frontmatter : null;
  }
  if (!meta) {
    return [{ severity: 'ERROR', type: 'unparseable', message: `${relPath}: 无法解析` }];
  }

  const nid = meta.id || '';
  const ntype = meta.type || '';

  if (!ID_PATTERN.test(nid)) {
    errors.push({ severity: 'ERROR', type: 'invalid_id', message: `${relPath}: ID '${nid}' 格式不符` });
  }
  if (!VALID_TYPES.has(ntype)) {
    errors.push({ severity: 'ERROR', type: 'invalid_type', message: `${relPath}: 无效类型 '${ntype}'` });
    return errors;
  }

  for (const field of REQUIRED_FIELDS[ntype] || []) {
    const val = meta[field];
    if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
      errors.push({ severity: 'ERROR', type: 'missing_field', message: `${relPath}: 缺少必填字段 '${field}'` });
    }
  }

  const prefix = nid.split('-')[0];
  if (prefix !== TYPE_PREFIX_MAP[ntype]) {
    errors.push({ severity: 'WARN', type: 'prefix_mismatch',
      message: `${relPath}: 前缀 '${prefix}' 与类型 '${ntype}' 不匹配` });
  }

  const status = meta.status || '';
  const valid = ntype === 'hypothesis' ? VALID_STATUS_HYP : VALID_STATUS_GEN;
  if (status && !valid.has(status)) {
    errors.push({ severity: 'WARN', type: 'invalid_status',
      message: `${relPath}: 无效状态 '${status}'（应为 ${[...valid].filter(Boolean)}）` });
  }

  if (Array.isArray(meta.sources)) {
    errors.push({ severity: 'WARN', type: 'deprecated_field',
      message: `${relPath}: 'sources' 已废弃，请改用 'relations'` });
  }

  // ontology_ref 检查
  const ontologyRef = meta.ontology_ref;
  if (ontologyRef) {
    if (typeof ontologyRef !== 'object' || Array.isArray(ontologyRef)) {
      errors.push({ severity: 'WARN', type: 'invalid_ontology_ref',
        message: `${relPath}: ontology_ref 应为字典对象` });
    } else {
      if (!ontologyRef.object_id) {
        errors.push({ severity: 'WARN', type: 'missing_ontology_ref_field',
          message: `${relPath}: ontology_ref 缺少 object_id` });
      }
      const objType = ontologyRef.object_type || '';
      if (objType && !ONTOLOGY_OBJECT_TYPES.has(objType)) {
        errors.push({ severity: 'WARN', type: 'invalid_ontology_object_type',
          message: `${relPath}: ontology_ref.object_type '${objType}' 不合法` });
      }
      const ls = ontologyRef.lifecycle_status || '';
      if (ls && !ONTOLOGY_LIFECYCLE_STATUSES.has(ls)) {
        errors.push({ severity: 'WARN', type: 'invalid_ontology_lifecycle',
          message: `${relPath}: ontology_ref.lifecycle_status '${ls}' 不合法` });
      }
    }
  } else if (ntype === 'evidence' || ntype === 'entity') {
    errors.push({ severity: 'WARN', type: 'missing_ontology_ref',
      message: `${relPath}: ${ntype} 节点应包含 ontology_ref 绑定本体对象` });
  }

  return errors;
}

function validateNodes(caseDir, nodes) {
  const errors = [];
  const seen = {};
  for (const n of Object.values(nodes)) {
    errors.push(...validateNodeFile(caseDir, n.file || ''));
    if (seen[n.id]) {
      errors.push({ severity: 'ERROR', type: 'duplicate_id',
        message: `ID '${n.id}' 重复: ${seen[n.id]} 和 ${n.file}` });
    }
    seen[n.id] = n.file;
  }
  return errors;
}

// ═══════════════════════════════════════════════════════════════
// §6 可视化数据构建（从 injector.js 移植 + 修 bug）
// ═══════════════════════════════════════════════════════════════

function buildEdges(nodes) {
  const edges = [];
  const seen = new Set();

  for (const [id, node] of Object.entries(nodes)) {
    // 1) 从 sources（仅 derived_from）生成边
    if (node.sources && node.sources.length) {
      for (const src of node.sources) {
        if (nodes[src.id] || /^(EV|LS|ARG|FND|ENT|HYP|EVT)-\d+/.test(src.id)) {
          const key = `${src.id}→${id}:derived_from`;
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: src.id, to: id, relation_type: 'derived_from', layer: 'cognitive',
              excerpt: (src.excerpt || '').slice(0, 60), form: src.form || 'text' });
          }
        }
      }
    }

    // 2) 从 relations 字典逐类型生成边
    const relations = node.relations || {};
    for (const [relType, items] of Object.entries(relations)) {
      if (relType === 'derived_from') continue;  // 已由 sources 覆盖
      if (!Array.isArray(items)) continue;

      const semantics = RELATION_SEMANTICS[relType] || { layer: 'cognitive', direction: 'unknown' };

      for (const item of items) {
        const tid = typeof item === 'object' ? (item.id || '') : item;
        if (!tid) continue;

        let fromId, toId;
        if (['downstream', 'target', 'hypothesis'].includes(semantics.direction)) {
          fromId = id; toId = tid;
        } else {
          fromId = tid; toId = id;
        }
        const key = `${fromId}→${toId}:${relType}`;
        if (!seen.has(key)) {
          seen.add(key);
          const excerpt = typeof item === 'object' ? (item.excerpt || '').slice(0, 60) : '';
          const form = typeof item === 'object' ? (item.form || 'text') : 'text';
          edges.push({ from: fromId, to: toId, relation_type: relType, layer: semantics.layer, excerpt, form });
        }
      }
    }
  }
  return edges;
}

// Bug 5 修复：每分支 visited 副本，菱形依赖不被剪枝
function buildChainTree(nodes, rootId, visited) {
  visited = visited || new Set();
  const node = nodes[rootId];
  if (!node || visited.has(rootId)) return null;
  visited.add(rootId);

  const isLeaf = ['EV', 'ENT', 'EVT'].includes(node.typePrefix);
  const children = [];
  if (!isLeaf && node.sources && node.sources.length) {
    for (const src of node.sources) {
      const child = buildChainTree(nodes, src.id, new Set(visited));  // ← 每分支副本
      if (child) children.push(child);
    }
  }
  return { id: node.id, type: node.typePrefix, status: node.status, title: node.title, children };
}

function buildAllChains(nodes) {
  const findings = Object.values(nodes).filter(n => n.typePrefix === 'FND').sort((a, b) => a.id.localeCompare(b.id));
  if (!findings.length) {
    // 回退逻辑：无 FND 时，从未被 derived_from 引用的节点开始建链。
    // 注意：只看 derived_from（即 n.sources），不看 supported_by/involves/contradicts 等横向关系。
    // 否则被 HYP 的 supported_by 引用的 EV 会被误判为"已在链中"而排除，
    // 导致早期阶段（无 FND）的可视化缺失大量节点。
    const referenced = new Set();
    for (const n of Object.values(nodes)) {
      if (n.sources) for (const s of n.sources) referenced.add(s.id);
    }
    return Object.values(nodes)
      .filter(n => !referenced.has(n.id) && !['ENT', 'EVT', 'HYP'].includes(n.typePrefix))
      .map(n => buildChainTree(nodes, n.id)).filter(Boolean);
  }
  return findings.map(f => buildChainTree(nodes, f.id)).filter(Boolean);
}

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
    info.stats.types[n.typePrefix] = (info.stats.types[n.typePrefix] || 0) + 1;
    if (n.status in info.stats.statuses) info.stats.statuses[n.status]++;
    if (n.governance) {
      const ref = n.ontology_ref;
      if (!ref && (n.typePrefix === 'EV' || n.typePrefix === 'ENT')) {
        info.governance.unbound++;
      } else if (ref) {
        const ls = ref.lifecycle_status || 'UNRESOLVED';
        if (ls in info.governance) info.governance[ls]++;
      }
    }
  }
  const fnd = Object.values(nodes).find(n => n.typePrefix === 'FND');
  if (fnd) info.title = fnd.title || info.title;
  const metaPath = path.join(caseDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.phase) info.phase = meta.phase;
    } catch {}
  }
  return info;
}

// Bug 11 修复：confidence = 0 正确处理
function buildHypothesisData(nodes) {
  const hypotheses = [];
  const hypNodes = Object.values(nodes).filter(n => n.typePrefix === 'HYP');

  for (const h of hypNodes) {
    const relations = h.relations || {};
    const supportedBy = flatIds(relations, 'supported_by');
    const contradictedBy = flatIds(relations, 'contradicted_by');
    const addresses = flatIds(relations, 'addresses');

    // Bug 11 修复：用显式 null 检查替代 || falsy
    let confidence = null;
    if (h.confidence !== null && h.confidence !== undefined && h.confidence !== '') {
      confidence = typeof h.confidence === 'number' ? h.confidence : parseFloat(h.confidence);
      if (isNaN(confidence)) confidence = null;
    }

    hypotheses.push({
      id: h.id,
      statement: h.title || h.assertion || '',
      status: h.status || 'active',
      confidence,
      supported_by: supportedBy,
      contradicted_by: contradictedBy,
      addresses,
      coverage: {
        support_count: supportedBy.length,
        contradiction_count: contradictedBy.length,
        has_support: supportedBy.length > 0,
        has_contradiction: contradictedBy.length > 0,
        has_unresolved_contradiction: contradictedBy.length > 0 && h.status === 'confirmed',
      },
    });
  }
  return hypotheses;
}

function buildOntologyData(nodes) {
  const objects = {};
  for (const n of Object.values(nodes)) {
    if (!n.ontology_ref) continue;
    const ref = n.ontology_ref;
    const oid = ref.object_id;
    if (!oid) continue;
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
  return { objects, relations: [] };
}

function buildGovernanceIssues(nodes) {
  const issues = [];
  const nodeMap = {};
  for (const n of Object.values(nodes)) nodeMap[n.id] = n;

  // 1. EV/ENT 无 ontology_ref
  for (const n of Object.values(nodes)) {
    if (n.typePrefix !== 'EV' && n.typePrefix !== 'ENT') continue;
    if (!n.ontology_ref) {
      issues.push({ severity: 'WARN', type: 'unbound_ontology_ref',
        message: `${n.id} (${n.typePrefix}) 未绑定本体对象，治理状态不可追踪`, node: n.id, ontology_object: null });
    } else if (n.ontology_ref.lifecycle_status === 'UNRESOLVED') {
      issues.push({ severity: 'WARN', type: 'unresolved_entity',
        message: `${n.id} 对应的本体对象 ${n.ontology_ref.object_id} 尚未 VERIFIED`, node: n.id,
        ontology_object: n.ontology_ref.object_id });
    } else if (n.ontology_ref.lifecycle_status === 'DISPUTED') {
      issues.push({ severity: 'ERROR', type: 'disputed_entity',
        message: `${n.id} 对应的本体对象 ${n.ontology_ref.object_id} 处于 DISPUTED 状态`, node: n.id,
        ontology_object: n.ontology_ref.object_id });
    }
  }

  // 2. FND 链上未验证/争议对象
  for (const n of Object.values(nodes)) {
    if (n.typePrefix !== 'FND') continue;
    const chainIds = collectChainIds(n.id, nodeMap);
    for (const cid of chainIds) {
      const cn = nodeMap[cid];
      if (!cn || !cn.governance) continue;
      if (cn.governance.risk_level === 'warn') {
        issues.push({ severity: 'WARN', type: 'unverified_entity_in_finding_chain',
          message: `${n.id} (FND) 的推理链中包含未验证对象 ${cid}`, node: n.id,
          ontology_object: cn.ontology_ref?.object_id || null });
      }
      if (cn.governance.risk_level === 'high') {
        issues.push({ severity: 'ERROR', type: 'disputed_entity_in_finding_chain',
          message: `${n.id} (FND) 的推理链中包含争议对象 ${cid}`, node: n.id,
          ontology_object: cn.ontology_ref?.object_id || null });
      }
    }
  }

  // 3. FND 依赖的 EV 未 sealed
  for (const n of Object.values(nodes)) {
    if (n.typePrefix !== 'FND') continue;
    const chainIds = collectChainIds(n.id, nodeMap);
    for (const cid of chainIds) {
      const cn = nodeMap[cid];
      if (!cn || cn.typePrefix !== 'EV') continue;
      if (cn.governance && !cn.governance.is_sealed && cn.status === 'ready') {
        issues.push({ severity: 'INFO', type: 'unsealed_evidence_in_chain',
          message: `${n.id} (FND) 依赖的 ${cid} (EV) 尚未 sealed`, node: n.id,
          ontology_object: cn.ontology_ref?.object_id || null });
      }
    }
  }

  // 4. HYP coverage
  for (const n of Object.values(nodes)) {
    if (n.typePrefix !== 'HYP') continue;
    const rel = n.relations || {};
    const supBy = (rel.supported_by || []).length;
    const cntBy = (rel.contradicted_by || []).length;
    if (n.status === 'active' && supBy === 0 && cntBy === 0) {
      issues.push({ severity: 'WARN', type: 'unsupported_hypothesis',
        message: `${n.id} (HYP, active) 无任何支持或反驳证据`, node: n.id, ontology_object: null });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════
// §7 输出格式
// ═══════════════════════════════════════════════════════════════

function formatMermaid(nodes) {
  const lines = ['graph LR'];
  for (const n of Object.values(nodes)) {
    for (const [rt, items] of Object.entries(n.relations || {})) {
      for (const item of items) {
        const tid = typeof item === 'object' ? item.id : item;
        if (!tid) continue;
        const label = LABEL_MAP[rt] || rt;
        lines.push(`  ${tid} -->|${label}| ${n.id}`);
      }
    }
  }
  return lines.join('\n');
}

function formatTree(tree, indent = 0) {
  const prefix = '  '.repeat(indent);
  const mark = tree.status === 'ready' ? '✓' : '!';
  if (tree.pruned) return `${prefix}  └─ ${tree.id} [...] (截断)\n`;
  let line = `${prefix}  └─ ${tree.id} (${tree.type || '?'}) [${mark}]\n`;
  for (const c of tree.children || []) line += formatTree(c, indent + 1);
  return line;
}

function reportIssues(issues) {
  const levels = { ERROR: '🔴', WARN: '🟡', INFO: '🔵' };
  const errors = issues.filter(i => i.severity === 'ERROR');
  const warns = issues.filter(i => i.severity === 'WARN');
  const infos = issues.filter(i => i.severity === 'INFO');
  console.log(`\n📋 ${errors.length} ERROR, ${warns.length} WARN, ${infos.length} INFO`);
  for (const i of issues) {
    console.log(`  ${levels[i.severity]} [${i.type}] ${i.message}`);
  }
  if (errors.length) process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// §8 HTML 渲染
// ═══════════════════════════════════════════════════════════════

function generateHTML(caseInfo, nodes, edges, chains, hypothesisData, ontologyData, governanceIssues) {
  const tplPath = path.join(__dirname, '..', 'templates', 'evidence-chain-viz', 'evidence_chain_viewer.html');
  let html = fs.readFileSync(tplPath, 'utf8');

  const startMarker = '// INJECTION_START_MARKER';
  const endMarker = '// INJECTION_END_MARKER';
  const si = html.indexOf(startMarker), ei = html.indexOf(endMarker);
  if (si === -1 || ei === -1) {
    console.error('[error] 模板缺少注入标记');
    process.exit(1);
  }

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

function jsonDump(caseInfo, nodes, edges, chains, hypothesisData, ontologyData, governanceIssues) {
  const replacer = (k, v) => v === undefined ? null : v;
  return JSON.stringify({
    caseInfo, nodes, edges, chains, hypothesisData, ontologyData, governanceIssues,
  }, replacer, 2);
}

// ═══════════════════════════════════════════════════════════════
// §9 索引同步
// ═══════════════════════════════════════════════════════════════

function syncChainIndex(caseDir, nodes) {
  const registryPath = path.join(caseDir, 'evidence_registry.json');
  if (!fs.existsSync(registryPath)) {
    process.stderr.write('  [ERROR] evidence_registry.json 不存在\n');
    return { added: [], removed: [], updated: [] };
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const existing = {};
  for (const n of registry.chain_nodes || []) existing[n.id] = n;

  const fileIndex = {};
  for (const node of Object.values(nodes)) {
    fileIndex[node.id] = { id: node.id, type: node.type, status: node.status };
  }

  const currentIds = new Set(Object.keys(existing));
  const fileIds = new Set(Object.keys(fileIndex));

  const added = [...fileIds].filter(id => !currentIds.has(id));
  const removed = [...currentIds].filter(id => !fileIds.has(id));
  const updated = [];
  for (const id of [...fileIds].filter(id => currentIds.has(id))) {
    if (JSON.stringify(existing[id]) !== JSON.stringify(fileIndex[id])) updated.push(id);
  }

  const newIndex = Object.keys(fileIndex).sort().map(id => fileIndex[id]);
  registry.chain_nodes = newIndex;
  registry.metadata = registry.metadata || {};
  registry.metadata.last_updated = new Date().toISOString();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');

  return { added, removed, updated };
}

// ═══════════════════════════════════════════════════════════════
// §10 CLI 主入口
// ═══════════════════════════════════════════════════════════════

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node scan-chain.js <case_dir> [options]');
    console.error('选项: --list --trace<ID> --integrity --check-chains --validate --sync --graph --html[FILE] --json-dump[FILE]');
    process.exit(1);
  }

  const caseDir = path.resolve(args[0]);
  if (!fs.existsSync(caseDir) || !fs.statSync(caseDir).isDirectory()) {
    console.error(`[ERROR] 目录不存在: ${caseDir}`);
    process.exit(1);
  }

  // 解析选项
  const opts = {
    list: false, trace: null, integrity: false, checkChains: false,
    validate: false, sync: false, graph: false, html: null, jsonDump: null,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--list') opts.list = true;
    else if (arg === '--trace') opts.trace = args[++i];
    else if (arg === '--integrity') opts.integrity = true;
    else if (arg === '--check-chains') opts.checkChains = true;
    else if (arg === '--validate') opts.validate = true;
    else if (arg === '--sync') opts.sync = true;
    else if (arg === '--graph') opts.graph = true;
    else if (arg === '--html') opts.html = args[++i] || 'evidence_chain_output.html';
    else if (arg === '--json-dump') opts.jsonDump = args[++i] || 'evidence_chain_data.json';
  }

  // 加载节点
  const fileNodes = loadAllNodes(caseDir);
  const registry = loadRegistry(path.join(caseDir, 'evidence_registry.json'));
  const nodes = mergeNodes(fileNodes, registry);
  process.stderr.write(`✓ 加载 ${Object.keys(nodes).length} 个节点\n`);

  // --list
  if (opts.list) {
    console.log(`\n${'ID'.padEnd(12)} ${'类型'.padEnd(12)} ${'状态'.padEnd(12)} 关系                          文件`);
    console.log('-'.repeat(80));
    const sorted = Object.values(nodes).sort((a, b) => a.id.localeCompare(b.id));
    for (const n of sorted) {
      const rt = Object.keys(n.relations || {}).join(',') || '(无)';
      console.log(`${n.id.padEnd(12)} ${n.type.padEnd(12)} ${n.status.padEnd(12)} ${rt.padEnd(30)} ${n.file || ''}`);
    }
  }

  // --trace
  if (opts.trace) {
    const graph = buildGraph(nodes);
    if (!graph.all[opts.trace]) {
      console.error(`[ERROR] 节点 ${opts.trace} 不存在`);
      process.exit(1);
    }
    console.log(`\n📎 证据链追溯: ${opts.trace}`);
    console.log('-'.repeat(40));
    // 构建树
    function buildTraceTree(nid, visited, depth) {
      if (visited.has(nid) || depth > 20) return { id: nid, pruned: true };
      visited.add(nid);
      const node = graph.all[nid] || {};
      const children = [];
      for (const ref of graph.upstream[nid] || []) {
        if (ref.relation_type === 'derived_from') {
          children.push(buildTraceTree(ref.id, new Set(visited), depth + 1));
        }
      }
      return { id: nid, type: node.typePrefix || '?', status: node.status || 'draft', children };
    }
    const tree = buildTraceTree(opts.trace, new Set(), 0);
    console.log(formatTree(tree));
  }

  // --integrity
  if (opts.integrity) {
    const issues = checkIntegrity(nodes);
    if (!issues.length) console.log('\n✅ 完整性检查通过');
    else reportIssues(issues);
  }

  // --check-chains
  if (opts.checkChains) {
    const issues = checkChains(nodes);
    if (!issues.length) console.log('\n✅ 推理链检查通过');
    else reportIssues(issues);
  }

  // --validate
  if (opts.validate) {
    const issues = validateNodes(caseDir, nodes);
    if (!issues.length) console.log('\n✅ 节点结构验证通过');
    else reportIssues(issues);
  }

  // --sync
  if (opts.sync) {
    const res = syncChainIndex(caseDir, nodes);
    console.log(`\n📝 索引同步: +${res.added.length} -${res.removed.length} ~${res.updated.length}`);
    if (res.added.length) console.log(`  新增: ${res.added.join(', ')}`);
    if (res.removed.length) console.log(`  移除: ${res.removed.join(', ')}`);
    if (res.updated.length) console.log(`  更新: ${res.updated.join(', ')}`);
  }

  // --graph
  if (opts.graph) {
    console.log(`\n\`\`\`mermaid\n${formatMermaid(nodes)}\n\`\`\``);
  }

  // --html
  if (opts.html) {
    const edges = buildEdges(nodes);
    const chains = buildAllChains(nodes);
    const hypothesisData = buildHypothesisData(nodes);
    const ontologyData = buildOntologyData(nodes);
    const governanceIssues = buildGovernanceIssues(nodes);
    const caseInfo = buildCaseInfo(caseDir, nodes);
    const html = generateHTML(caseInfo, nodes, edges, chains, hypothesisData, ontologyData, governanceIssues);
    fs.writeFileSync(opts.html, html);
    console.log(`\n🌐 已生成 HTML: ${path.resolve(opts.html)}`);
    console.log('   用浏览器打开查看交互式证据链图');
  }

  // --json-dump
  if (opts.jsonDump) {
    const edges = buildEdges(nodes);
    const chains = buildAllChains(nodes);
    const hypothesisData = buildHypothesisData(nodes);
    const ontologyData = buildOntologyData(nodes);
    const governanceIssues = buildGovernanceIssues(nodes);
    const caseInfo = buildCaseInfo(caseDir, nodes);
    const json = jsonDump(caseInfo, nodes, edges, chains, hypothesisData, ontologyData, governanceIssues);
    fs.writeFileSync(opts.jsonDump, json);
    console.log(`\n📦 已生成 JSON: ${path.resolve(opts.jsonDump)}`);
    console.log('   AI fallback: 读取此 JSON 格式，构造数据块后注入 HTML 模板');
  }

  // 无选项 → 帮助
  if (!opts.list && !opts.trace && !opts.integrity && !opts.checkChains &&
      !opts.validate && !opts.sync && !opts.graph && !opts.html && !opts.jsonDump) {
    console.error('用法: node scan-chain.js <case_dir> [options]');
    console.error('选项: --list --trace<ID> --integrity --check-chains --validate --sync --graph --html[FILE] --json-dump[FILE]');
  }
}

main();
