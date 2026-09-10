const fs = require('fs');
const path = require('path');

const ENTITY_SPECS = {
  person: {
    type: 'Person', id: /^P-\d{4,}$/,
    lifecycle: new Set(['UNRESOLVED', 'VERIFIED', 'DISPUTED', 'SEALED']),
    required: ['properties.name_primary'],
  },
  organization: {
    type: 'Organization', id: /^O-\d{4,}$/,
    lifecycle: new Set(['UNRESOLVED', 'VERIFIED', 'DISPUTED', 'SEALED']),
    required: ['properties.name_official', 'properties.org_type'],
  },
  account: {
    type: 'Account', id: /^acc-\d{4,}$/,
    lifecycle: new Set(['UNRESOLVED', 'VERIFIED', 'DISPUTED', 'SEALED']),
    required: ['properties.account_no_hash'],
  },
  evidence: {
    type: 'Evidence', id: /^ev-\d{3,}$/,
    lifecycle: new Set(['ACTIVE', 'SEALED']),
    required: ['integrity.raw_file_path', 'integrity.sha256', 'integrity.sealed', 'properties.evidence_type'],
  },
  case: {
    type: 'Case', id: /^CASE-\d{4}-\d{3,}$/,
    lifecycle: new Set(['ACTIVE', 'CLOSED', 'REOPENED']),
    required: ['properties.case_id', 'properties.title', 'properties.trigger_type', 'properties.lead_investigator', 'properties.time_window'],
  },
};

const RELATION_TIERS = new Set(['HARD', 'SOFT', 'LEAD']);
const ENTITY_TOP_LEVEL_FIELDS = new Set(['meta', 'properties', 'links', 'integrity', 'findings_refs', 'audit']);
const ENTITY_META_FIELDS = new Set(['id', 'type', 'lifecycle_status', 'created_at', 'created_by', 'source_evidence_ref', 'case_ref', 'superseded_by']);
const RELATION_TOP_LEVEL_FIELDS = new Set(['meta', 'core']);
const RELATION_META_FIELDS = new Set(['relation_id', 'relation_type', 'evidence_tier', 'source_evidence_refs', 'confidence', 'valid_time', 'observed_time', 'superseded_by']);

function stripComment(value) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote === '"') { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trimEnd();
  }
  return value;
}

function scalar(raw) {
  const value = stripComment(raw).trim();
  if (value === '' || value === 'null' || value === '~') return value === '' ? undefined : null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(',').map((part) => scalar(part)) : [];
  }
  if (value.length >= 2 && value[0] === value[value.length - 1] && ['"', "'"].includes(value[0])) {
    return value.slice(1, -1);
  }
  return value;
}

function tokenizeYaml(content) {
  const tokens = [];
  const errors = [];
  for (const [index, original] of content.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').entries()) {
    if (!original.trim() || original.trim().startsWith('#') || original.trim() === '---') continue;
    if (/\t/.test(original.match(/^\s*/)?.[0] || '')) {
      errors.push(`第 ${index + 1} 行使用 Tab 缩进`);
      continue;
    }
    const text = original.trim();
    if (text === '...' || text === '|') continue;
    tokens.push({ indent: original.length - original.trimStart().length, text, line: index + 1 });
  }
  return { tokens, errors };
}

function parseYamlSubset(content) {
  const { tokens, errors } = tokenizeYaml(content);
  function parseBlock(start, indent) {
    const isList = tokens[start]?.text.startsWith('- ');
    const container = isList ? [] : {};
    let i = start;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token.indent < indent) break;
      if (token.indent > indent) {
        errors.push(`第 ${token.line} 行缩进层级无法归属`);
        i++;
        continue;
      }
      if (isList) {
        if (!token.text.startsWith('- ')) break;
        const itemText = token.text.slice(2).trim();
        if (!itemText) {
          if (tokens[i + 1] && tokens[i + 1].indent > indent) {
            const child = parseBlock(i + 1, tokens[i + 1].indent);
            container.push(child.value); i = child.next; continue;
          }
          container.push(null); i++; continue;
        }
        const match = itemText.match(/^([\w-]+):\s*(.*)$/);
        if (!match) { container.push(scalar(itemText)); i++; continue; }
        const item = {};
        item[match[1]] = scalar(match[2]);
        i++;
        while (i < tokens.length && tokens[i].indent > indent) {
          const childToken = tokens[i];
          const childMatch = childToken.text.match(/^([\w-]+):\s*(.*)$/);
          if (!childMatch) { errors.push(`第 ${childToken.line} 行不是有效映射`); i++; continue; }
          const key = childMatch[1];
          const raw = childMatch[2];
          if (!raw && tokens[i + 1] && tokens[i + 1].indent > childToken.indent) {
            const child = parseBlock(i + 1, tokens[i + 1].indent);
            item[key] = child.value; i = child.next;
          } else { item[key] = scalar(raw); i++; }
        }
        container.push(item);
        continue;
      }
      const match = token.text.match(/^([\w-]+):\s*(.*)$/);
      if (!match) { errors.push(`第 ${token.line} 行不是有效映射`); i++; continue; }
      const key = match[1];
      const raw = match[2];
      if (Object.prototype.hasOwnProperty.call(container, key)) errors.push(`第 ${token.line} 行重复字段 '${key}'`);
      if (!raw && tokens[i + 1] && tokens[i + 1].indent > indent) {
        const child = parseBlock(i + 1, tokens[i + 1].indent);
        container[key] = child.value; i = child.next;
      } else { container[key] = scalar(raw); i++; }
    }
    return { value: container, next: i };
  }
  const value = tokens.length ? parseBlock(0, tokens[0].indent).value : {};
  return { value, errors };
}

function get(object, pointer) {
  return pointer.split('.').reduce((value, key) => value && value[key], object);
}

function issue(severity, type, message, file) {
  return { severity, type, message: file ? `${file}: ${message}` : message, file };
}

function findProjectRoot(startPath) {
  let current = path.resolve(startPath);
  if (fs.existsSync(current) && fs.statSync(current).isFile()) current = path.dirname(current);
  while (true) {
    if (fs.existsSync(path.join(current, 'global_ontology'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function walkYaml(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkYaml(full));
    else if (/\.ya?ml$/i.test(entry.name) && !/^template\./i.test(entry.name)) files.push(full);
  }
  return files;
}

function validateKnownFields(data, allowed, pointer, relPath, issues) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  for (const field of Object.keys(data)) {
    if (!allowed.has(field)) issues.push(issue('ERROR', 'ontology_unknown_field', `未知字段 '${pointer}${field}'`, relPath));
  }
}

function validateEntity(data, folder, relPath) {
  const issues = [];
  const spec = ENTITY_SPECS[folder];
  if (!spec) return [issue('ERROR', 'unknown_ontology_entity_folder', `不支持的实体目录 '${folder}'`, relPath)];
  validateKnownFields(data, ENTITY_TOP_LEVEL_FIELDS, '', relPath, issues);
  validateKnownFields(data.meta, ENTITY_META_FIELDS, 'meta.', relPath, issues);
  for (const field of ['meta.id', 'meta.type', 'meta.lifecycle_status', 'meta.created_at', 'meta.created_by', ...spec.required]) {
    if (get(data, field) === undefined || get(data, field) === '') issues.push(issue('ERROR', 'ontology_missing_field', `缺少必填字段 '${field}'`, relPath));
  }
  const id = get(data, 'meta.id');
  if (id && !spec.id.test(String(id))) issues.push(issue('ERROR', 'ontology_invalid_id', `meta.id '${id}' 不符合 ${spec.id}`, relPath));
  if (id && path.basename(relPath).replace(/\.ya?ml$/i, '') !== id) {
    issues.push(issue('ERROR', 'ontology_filename_id_mismatch', `文件名应与 meta.id '${id}' 一致`, relPath));
  }
  if (get(data, 'meta.type') && get(data, 'meta.type') !== spec.type) {
    issues.push(issue('ERROR', 'ontology_type_mismatch', `目录 '${folder}' 应为 ${spec.type}，实际为 '${get(data, 'meta.type')}'`, relPath));
  }
  const lifecycle = get(data, 'meta.lifecycle_status');
  if (lifecycle && !spec.lifecycle.has(lifecycle)) {
    issues.push(issue('ERROR', 'ontology_invalid_lifecycle', `meta.lifecycle_status '${lifecycle}' 应为 ${[...spec.lifecycle].join(', ')}`, relPath));
  }
  if (folder === 'evidence') {
    const sealed = get(data, 'integrity.sealed');
    if (sealed !== undefined && typeof sealed !== 'boolean') issues.push(issue('ERROR', 'ontology_invalid_sealed', 'integrity.sealed 应为 boolean', relPath));
    if (lifecycle === 'SEALED' && sealed !== true) issues.push(issue('ERROR', 'ontology_seal_mismatch', '生命周期为 SEALED 时 integrity.sealed 必须为 true', relPath));
  }
  if (folder === 'case' && get(data, 'properties.case_id') && get(data, 'properties.case_id') !== id) {
    issues.push(issue('ERROR', 'ontology_case_id_mismatch', `properties.case_id '${get(data, 'properties.case_id')}' 与 meta.id '${id}' 不一致`, relPath));
  }
  return issues;
}

function validateRelation(data, relPath) {
  const issues = [];
  validateKnownFields(data, RELATION_TOP_LEVEL_FIELDS, '', relPath, issues);
  validateKnownFields(data.meta, RELATION_META_FIELDS, 'meta.', relPath, issues);
  for (const field of ['meta.relation_id', 'meta.relation_type', 'meta.evidence_tier', 'meta.observed_time', 'core.from_entity', 'core.to_entity']) {
    if (get(data, field) === undefined || get(data, field) === '') issues.push(issue('ERROR', 'ontology_missing_field', `缺少必填字段 '${field}'`, relPath));
  }
  const id = get(data, 'meta.relation_id');
  if (id && !/^R-\d{3,}$/.test(String(id))) issues.push(issue('ERROR', 'ontology_invalid_relation_id', `meta.relation_id '${id}' 格式不合法`, relPath));
  if (id && path.basename(relPath).replace(/\.ya?ml$/i, '') !== id) {
    issues.push(issue('ERROR', 'ontology_filename_id_mismatch', `文件名应与 meta.relation_id '${id}' 一致`, relPath));
  }
  const tier = get(data, 'meta.evidence_tier');
  if (tier && !RELATION_TIERS.has(tier)) issues.push(issue('ERROR', 'ontology_invalid_evidence_tier', `meta.evidence_tier '${tier}' 不合法`, relPath));
  const refs = get(data, 'meta.source_evidence_refs');
  if (tier === 'HARD' && (!Array.isArray(refs) || refs.length === 0)) {
    issues.push(issue('ERROR', 'ontology_hard_relation_without_evidence', 'HARD 关系必须包含 source_evidence_refs', relPath));
  }
  const confidence = get(data, 'meta.confidence');
  if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
    issues.push(issue('ERROR', 'ontology_invalid_confidence', 'meta.confidence 应为 0.0-1.0 的数字', relPath));
  }
  return issues;
}

function loadOntology(projectRoot) {
  const ontologyRoot = path.join(projectRoot, 'global_ontology');
  const issues = [];
  const objects = new Map();
  const relations = [];
  for (const file of walkYaml(ontologyRoot)) {
    const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
    const parsed = parseYamlSubset(fs.readFileSync(file, 'utf8'));
    for (const message of parsed.errors) issues.push(issue('ERROR', 'ontology_yaml_syntax', message, relPath));
    const relative = path.relative(ontologyRoot, file).replace(/\\/g, '/');
    if (relative.startsWith('entities/')) {
      const folder = relative.split('/')[1];
      issues.push(...validateEntity(parsed.value, folder, relPath));
      const id = get(parsed.value, 'meta.id');
      if (id) {
        if (objects.has(id)) issues.push(issue('ERROR', 'duplicate_ontology_id', `本体 ID '${id}' 与 ${objects.get(id).file} 重复`, relPath));
        else objects.set(id, {
          id, type: get(parsed.value, 'meta.type'), lifecycle_status: get(parsed.value, 'meta.lifecycle_status'),
          sealed: get(parsed.value, 'integrity.sealed'), file: relPath, data: parsed.value,
        });
      }
    } else if (relative.startsWith('relations/')) {
      issues.push(...validateRelation(parsed.value, relPath));
      relations.push({ file: relPath, data: parsed.value });
    }
  }
  for (const relation of relations) {
    for (const field of ['core.from_entity', 'core.to_entity']) {
      const target = get(relation.data, field);
      if (target && !objects.has(target)) issues.push(issue('ERROR', 'ontology_missing_relation_endpoint', `${field} 引用不存在的本体对象 '${target}'`, relation.file));
    }
    for (const target of get(relation.data, 'meta.source_evidence_refs') || []) {
      const object = objects.get(target);
      if (!object) issues.push(issue('ERROR', 'ontology_missing_evidence_ref', `source_evidence_refs 引用不存在的证据 '${target}'`, relation.file));
      else if (object.type !== 'Evidence') issues.push(issue('ERROR', 'ontology_wrong_evidence_ref_type', `source_evidence_refs '${target}' 实际类型为 ${object.type}`, relation.file));
    }
  }
  return { ontologyRoot, objects, relations, issues };
}

module.exports = { ENTITY_SPECS, findProjectRoot, get, loadOntology, parseYamlSubset };
