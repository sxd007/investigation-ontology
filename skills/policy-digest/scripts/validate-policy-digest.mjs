#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(scriptDir, '..', 'references', 'schemas');
const REQUIRED_MARKDOWN_SECTIONS = [
  /文件身份表/,
  /核心规则表/,
  /流程节点表/,
  /RACI\s*责任矩阵/i,
  /风险控制矩阵/,
  /制度问题及优化建议清单/,
  /(端到端.*(泳道|BPMN)|流程图)/i,
];
const PARSED_FIELD_ALIASES = {
  schema_version: 'parsedSchemaVersion',
  parsed_schema_version: 'parsedSchemaVersion',
  doc_id: 'docId',
  raw_ref: 'rawRef',
  block_id: 'blockId',
  block_type: 'blockType',
  block_path: 'blockPath',
  char_start: 'charStart',
  char_end: 'charEnd',
  page_hint: 'pageHint',
  heading_level: 'headingLevel',
  clause_ref: 'clauseRef',
  parse_confidence: 'parseConfidence',
  needs_verification: 'needsVerification',
  clause_sequence: 'clauseSequence',
  block_count: 'blockCount',
  toc_crosscheck: 'tocCrosscheck',
  unrecognized_regions: 'unrecognizedRegions',
  has_toc: 'hasToc',
  orphan_sections: 'orphanSections',
  header_rows: 'headerRows',
  merged_cells: 'mergedCells',
  profile_version: 'profileVersion',
};

function addIssue(issues, severity, code, message, location = '') {
  issues.push({ severity, code, message, location });
}

export function summarizeIssues(issues) {
  const byCode = {};
  for (const issue of issues) {
    byCode[issue.code] ||= { code: issue.code, errors: 0, warnings: 0, total: 0 };
    byCode[issue.code].total += 1;
    if (issue.severity === 'ERROR') byCode[issue.code].errors += 1;
    if (issue.severity === 'WARN') byCode[issue.code].warnings += 1;
  }
  return {
    errors: issues.filter((item) => item.severity === 'ERROR').length,
    warnings: issues.filter((item) => item.severity === 'WARN').length,
    total: issues.length,
    by_code: Object.values(byCode).sort((left, right) => right.total - left.total || left.code.localeCompare(right.code)),
  };
}

export function collectDiagnosticHints(parsed) {
  const aliases = new Map();
  const visit = (value, pointer = 'parsed') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const expected = PARSED_FIELD_ALIASES[key];
      if (expected) aliases.set(`${key} → ${expected}`, `${pointer}/${key}`);
      visit(child, `${pointer}/${key}`);
    }
  };
  visit(parsed);
  if (!aliases.size) return [];
  const mappings = [...aliases.keys()];
  return [{
    code: 'parsed_field_naming_mismatch',
    message: `检测到旧 snake_case parsed 字段；Parsed 0.1.0 使用 camelCase。请以脚手架的 normalized.parsed.json 为模板，例如：${mappings.slice(0, 8).join('，')}${mappings.length > 8 ? `，另有 ${mappings.length - 8} 种` : ''}。`,
    location: [...aliases.values()][0],
    count: aliases.size,
  }];
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value === 'number' ? 'number' : typeof value;
}

function typeMatches(value, expected) {
  const actual = jsonType(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function resolveLocalRef(rootSchema, ref) {
  if (!ref.startsWith('#/')) throw new Error(`仅支持本地 JSON Pointer $ref，实际为 ${ref}`);
  return ref.slice(2).split('/').reduce((current, token) => {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    return current?.[key];
  }, rootSchema);
}

function validateBySchema(value, schema, rootSchema, pointer = '$', issues = []) {
  if (schema === true || schema === undefined) return issues;
  if (schema === false) {
    addIssue(issues, 'ERROR', 'schema_false', '值被 schema 拒绝', pointer);
    return issues;
  }
  if (schema.$ref) {
    const target = resolveLocalRef(rootSchema, schema.$ref);
    if (!target) addIssue(issues, 'ERROR', 'schema_ref_missing', `无法解析 ${schema.$ref}`, pointer);
    else validateBySchema(value, target, rootSchema, pointer, issues);
    return issues;
  }

  const expectedTypes = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (expectedTypes.length && !expectedTypes.some((expected) => typeMatches(value, expected))) {
    addIssue(issues, 'ERROR', 'schema_type', `应为 ${expectedTypes.join('|')}，实际为 ${jsonType(value)}`, pointer);
    return issues;
  }
  if (Object.hasOwn(schema, 'const') && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    addIssue(issues, 'ERROR', 'schema_const', `必须等于 ${JSON.stringify(schema.const)}`, pointer);
  }
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    addIssue(issues, 'ERROR', 'schema_enum', `值 ${JSON.stringify(value)} 不在允许枚举中`, pointer);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) addIssue(issues, 'ERROR', 'schema_min_length', `长度不得小于 ${schema.minLength}`, pointer);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) addIssue(issues, 'ERROR', 'schema_max_length', `长度不得大于 ${schema.maxLength}`, pointer);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) addIssue(issues, 'ERROR', 'schema_pattern', `不匹配 ${schema.pattern}`, pointer);
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) addIssue(issues, 'ERROR', 'schema_date_time', '不是有效 ISO 8601 日期时间', pointer);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) addIssue(issues, 'ERROR', 'schema_minimum', `不得小于 ${schema.minimum}`, pointer);
    if (schema.maximum !== undefined && value > schema.maximum) addIssue(issues, 'ERROR', 'schema_maximum', `不得大于 ${schema.maximum}`, pointer);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) addIssue(issues, 'ERROR', 'schema_min_items', `元素不得少于 ${schema.minItems}`, pointer);
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) addIssue(issues, 'ERROR', 'schema_unique_items', '数组含重复元素', pointer);
    }
    if (schema.items) value.forEach((item, index) => validateBySchema(item, schema.items, rootSchema, `${pointer}/${index}`, issues));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) addIssue(issues, 'ERROR', 'schema_required', `缺少必填字段 ${key}`, `${pointer}/${key}`);
    }
    const known = new Set(Object.keys(schema.properties || {}));
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) validateBySchema(child, schema.properties[key], rootSchema, `${pointer}/${key}`, issues);
      else if (schema.additionalProperties === false) addIssue(issues, 'ERROR', 'schema_additional_property', `不允许字段 ${key}`, `${pointer}/${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateBySchema(child, schema.additionalProperties, rootSchema, `${pointer}/${key}`, issues);
      } else if (known.has(key)) {
        validateBySchema(child, schema.properties[key], rootSchema, `${pointer}/${key}`, issues);
      }
    }
  }
  for (const childSchema of schema.allOf || []) validateBySchema(value, childSchema, rootSchema, pointer, issues);
  if (schema.if) {
    const conditionalIssues = [];
    validateBySchema(value, schema.if, rootSchema, pointer, conditionalIssues);
    if (!conditionalIssues.length && schema.then) validateBySchema(value, schema.then, rootSchema, pointer, issues);
    if (conditionalIssues.length && schema.else) validateBySchema(value, schema.else, rootSchema, pointer, issues);
  }
  return issues;
}

function loadJson(filePath, issues, code) {
  if (!existsSync(filePath)) {
    addIssue(issues, 'ERROR', `${code}_missing`, `缺少文件 ${basename(filePath)}`, filePath);
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    addIssue(issues, 'ERROR', `${code}_json`, error.message, filePath);
    return null;
  }
}

function loadSchema(name) {
  return JSON.parse(readFileSync(join(schemaDir, name), 'utf8'));
}

function collectSources(value, pointer = '$', found = []) {
  if (!value || typeof value !== 'object') return found;
  if (!Array.isArray(value) && value.source && typeof value.source === 'object') found.push({ source: value.source, pointer: `${pointer}/source` });
  if (Array.isArray(value)) value.forEach((child, index) => collectSources(child, `${pointer}/${index}`, found));
  else for (const [key, child] of Object.entries(value)) if (key !== 'source') collectSources(child, `${pointer}/${key}`, found);
  return found;
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validateProjectableParameter(parameter, pointer, issues) {
  if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)) {
    addIssue(issues, 'ERROR', 'parameter_shape_invalid', '参数必须是 object', pointer);
    return;
  }
  const parameterType = parameter.parameterType ?? parameter.parameter_type;
  if (typeof parameterType !== 'string' || !parameterType) addIssue(issues, 'ERROR', 'parameter_shape_invalid', '缺少 parameterType（兼容旧名 parameter_type）', pointer);
  if (typeof parameter.value !== 'string') addIssue(issues, 'ERROR', 'parameter_shape_invalid', `value 必须是 string，实际为 ${jsonType(parameter.value)}`, pointer);
  const valueNumber = parameter.valueNumber ?? parameter.value_number;
  if (valueNumber !== undefined && typeof valueNumber !== 'number') addIssue(issues, 'ERROR', 'parameter_shape_invalid', `valueNumber 必须是 number，实际为 ${jsonType(valueNumber)}`, pointer);
  if (parameter.comparator !== undefined && !['GT', 'GE', 'LT', 'LE', 'EQ'].includes(String(parameter.comparator).toUpperCase())) {
    addIssue(issues, 'ERROR', 'parameter_shape_invalid', `comparator 不受支持：${parameter.comparator}`, pointer);
  }
  for (const field of ['target', 'unit', 'note']) {
    if (parameter[field] !== undefined && typeof parameter[field] !== 'string') addIssue(issues, 'ERROR', 'parameter_shape_invalid', `${field} 必须是 string`, pointer);
  }
}

function validateProjectableParameters(digest, issues) {
  for (const [ruleIndex, rule] of (digest.rules || []).entries()) {
    for (const [parameterIndex, parameter] of (rule.parameters || []).entries()) {
      validateProjectableParameter(parameter, `digest/rules/${ruleIndex}/parameters/${parameterIndex}`, issues);
    }
  }
  for (const [edgeIndex, edge] of (digest.flow_edges || []).entries()) {
    for (const [parameterIndex, parameter] of (edge.condition_parameters || []).entries()) {
      validateProjectableParameter(parameter, `digest/flow_edges/${edgeIndex}/condition_parameters/${parameterIndex}`, issues);
    }
  }
}

function validateAnchors(digest, candidates, parsed, issues) {
  const blocks = new Map((parsed.blocks || []).map((block) => [block.blockId, block]));
  const expectedDocId = parsed.document?.docId;
  if (digest.document_identity?.doc_id !== expectedDocId) {
    addIssue(issues, 'ERROR', 'source_doc_id_mismatch', `digest document_identity.doc_id 与 parsed document.docId 不一致：${digest.document_identity?.doc_id || '<empty>'} != ${expectedDocId || '<empty>'}`, 'digest/document_identity/doc_id');
  }
  const check = (source, pointer) => {
    const sourceDocId = source.doc_id ?? source.docId;
    if (sourceDocId !== expectedDocId) addIssue(issues, 'ERROR', 'source_doc_id_mismatch', `来源 docId 与主文档不一致：${sourceDocId || '<empty>'} != ${expectedDocId || '<empty>'}`, `${pointer}/${Object.hasOwn(source, 'doc_id') ? 'doc_id' : 'docId'}`);
    const block = blocks.get(source.block_id ?? source.blockId);
    if (!block) {
      addIssue(issues, 'ERROR', 'anchor_block_missing', `锚点引用不存在的 block ${(source.block_id ?? source.blockId) || '<empty>'}`, pointer);
      return;
    }
    const blockPath = source.block_path ?? source.blockPath;
    if (blockPath !== block.anchor?.blockPath) addIssue(issues, 'ERROR', 'anchor_path_mismatch', `blockPath 与 parsed 不一致：${blockPath} != ${block.anchor?.blockPath}`, pointer);
    const excerpt = normalizedText(source.excerpt);
    const haystack = normalizedText(`${block.text || ''} ${block.anchor?.excerpt || ''}`);
    if (excerpt && !haystack.includes(excerpt)) addIssue(issues, 'ERROR', 'anchor_excerpt_mismatch', '原文摘录无法在对应 parsed block 中定位', pointer);
  };
  for (const item of collectSources(digest)) check(item.source, item.pointer);
  (candidates.candidates || []).forEach((candidate, index) => check(candidate.sourceBlock, `candidates/${index}/sourceBlock`));
}

function validateUniqueIds(records, field, pointer, issues) {
  const seen = new Set();
  for (const [index, record] of (records || []).entries()) {
    const id = record?.[field];
    if (!id) continue;
    if (seen.has(id)) addIssue(issues, 'ERROR', 'duplicate_id', `重复 ID ${id}`, `${pointer}/${index}/${field}`);
    seen.add(id);
  }
  return seen;
}

function validateCandidateRefCardinality(records, pointer, issues) {
  for (const [index, record] of (records || []).entries()) {
    const refs = record.candidate_refs || [];
    if (refs.length !== 1) addIssue(issues, 'ERROR', 'candidate_ref_cardinality', `candidate_refs 必须恰好包含 1 个 ID，实际为 ${refs.length}`, `${pointer}/${index}/candidate_refs`);
  }
}

function asRefs(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function validateCandidateReferences(candidates, parsed, issues) {
  const candidateIds = validateUniqueIds(candidates.candidates, 'candidateId', 'candidates', issues);
  const proposalsByCandidate = new Map();
  const localIds = new Set();
  const activityIds = new Set();
  const processElements = new Map();
  const obligationIds = new Set();
  const mainEdges = new Set();
  const transitions = [];
  const transitionEdges = new Map();
  const parameters = [];

  for (const [candidateIndex, candidate] of (candidates.candidates || []).entries()) {
    proposalsByCandidate.set(candidate.candidateId, new Map((candidate.produces || []).map((proposal) => [proposal.localId, proposal])));
    for (const proposal of candidate.produces || []) {
      if (localIds.has(proposal.localId)) addIssue(issues, 'ERROR', 'duplicate_local_id', `重复 localId ${proposal.localId}`, `candidates/${candidateIndex}/produces`);
      localIds.add(proposal.localId);
      if (['proc:ProcessActivity', 'proc:Task'].includes(proposal.rdfType)) activityIds.add(proposal.localId);
      if (['proc:ProcessCategory', 'proc:ProcessGroup', 'proc:Process', 'proc:ProcessActivity', 'proc:Task'].includes(proposal.rdfType)) {
        processElements.set(proposal.localId, proposal);
      }
      if (/Obligation$/.test(proposal.rdfType || '')) obligationIds.add(proposal.localId);
      for (const predecessor of asRefs(proposal.properties?.precededByActivity)) mainEdges.add(`${predecessor}->${proposal.localId}`);
    }
    for (const [parameterIndex, parameter] of (candidate.parameters || []).entries()) parameters.push({ parameter, pointer: `candidates/${candidateIndex}/parameters/${parameterIndex}` });
    for (const [transitionIndex, transition] of (candidate.transitions || []).entries()) transitions.push({ transition, pointer: `candidates/${candidateIndex}/transitions/${transitionIndex}` });
    for (const [alignmentIndex, alignment] of (candidate.alignments || []).entries()) {
      if (!alignment.targetRef?.excerpt) addIssue(issues, 'ERROR', 'alignment_excerpt_missing', 'alignment targetRef 必须含 excerpt', `candidates/${candidateIndex}/alignments/${alignmentIndex}`);
    }
  }
  for (const { parameter, pointer } of parameters) {
    if (!parameter.target || !obligationIds.has(parameter.target)) {
      addIssue(issues, 'ERROR', 'parameter_target_missing', `parameter target 未指向已声明 Obligation：${parameter.target || '<empty>'}`, pointer);
    }
  }
  for (const { transition, pointer } of transitions) {
    if (!activityIds.has(transition.fromActivity)) addIssue(issues, 'ERROR', 'transition_from_missing', `fromActivity 不存在：${transition.fromActivity}`, pointer);
    if (!activityIds.has(transition.toActivity)) addIssue(issues, 'ERROR', 'transition_to_missing', `toActivity 不存在：${transition.toActivity}`, pointer);
    const edge = `${transition.fromActivity}->${transition.toActivity}`;
    transitionEdges.set(edge, transition);
    if (mainEdges.has(edge)) addIssue(issues, 'ERROR', 'transition_main_edge_duplicate', `同一活动边同时写入主干和 transition：${edge}`, pointer);
  }
  if (candidates.document?.docId !== parsed.document?.docId) addIssue(issues, 'ERROR', 'document_id_mismatch', 'candidates 与 parsed 的 docId 不一致', 'candidates/document/docId');
  if (candidates.document?.parsedRef?.parsedSchemaVersion !== parsed.parsedSchemaVersion) addIssue(issues, 'ERROR', 'parsed_version_mismatch', 'candidates parsedRef 版本与 normalized parsed 不一致', 'candidates/document/parsedRef');
  return { candidateIds, activityIds, mainEdges, transitionEdges, processElements, localIds, proposalsByCandidate };
}

function validateDigestReferences(digest, candidateInfo, issues) {
  const { candidateIds, mainEdges: candidateMainEdges, transitionEdges: candidateTransitionEdges, processElements: candidateProcessElements, localIds, proposalsByCandidate } = candidateInfo;
  const elementIds = validateUniqueIds(digest.process_elements, 'element_id', 'digest/process_elements', issues);
  const objectiveIds = validateUniqueIds(digest.process_objectives, 'objective_id', 'digest/process_objectives', issues);
  const artifactIds = validateUniqueIds(digest.artifacts, 'artifact_id', 'digest/artifacts', issues);
  const edgeIds = validateUniqueIds(digest.flow_edges, 'edge_id', 'digest/flow_edges', issues);
  validateUniqueIds(digest.rules, 'rule_id', 'digest/rules', issues);
  validateUniqueIds(digest.role_assignments, 'assignment_id', 'digest/role_assignments', issues);
  validateUniqueIds(digest.risks, 'risk_id', 'digest/risks', issues);
  validateUniqueIds(digest.controls, 'control_id', 'digest/controls', issues);
  validateUniqueIds(digest.issues, 'issue_id', 'digest/issues', issues);
  validateCandidateRefCardinality(digest.rules, 'digest/rules', issues);
  validateCandidateRefCardinality(digest.process_elements, 'digest/process_elements', issues);
  validateCandidateRefCardinality(digest.process_objectives, 'digest/process_objectives', issues);
  validateCandidateRefCardinality(digest.artifacts, 'digest/artifacts', issues);
  validateCandidateRefCardinality(digest.flow_edges, 'digest/flow_edges', issues);

  const levelTypes = { L1: 'proc:ProcessCategory', L2: 'proc:ProcessGroup', L3: 'proc:Process', L4: 'proc:ProcessActivity', L5: 'proc:Task' };
  const levelNumber = { L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };
  const byElementId = new Map((digest.process_elements || []).map((element) => [element.element_id, element]));
  for (const [index, element] of (digest.process_elements || []).entries()) {
    const pointer = `digest/process_elements/${index}`;
    if (levelTypes[element.level] !== element.rdf_type) addIssue(issues, 'ERROR', 'hierarchy_level_type_mismatch', `${element.level} 必须映射 ${levelTypes[element.level]}，实际为 ${element.rdf_type}`, pointer);
    if (element.level === 'L1' && element.parent_ref !== null) addIssue(issues, 'ERROR', 'hierarchy_l1_parent', 'L1 不得有 parent_ref', pointer);
    if (element.hierarchy_status === 'resolved' && element.level !== 'L1' && !element.parent_ref) addIssue(issues, 'ERROR', 'hierarchy_parent_missing', `${element.level} resolved 元素必须有直接父级`, pointer);
    if (element.parent_ref) {
      const parent = byElementId.get(element.parent_ref);
      if (!parent) addIssue(issues, 'ERROR', 'hierarchy_parent_unknown', `parent_ref 不存在：${element.parent_ref}`, pointer);
      else if (levelNumber[element.level] - levelNumber[parent.level] !== 1) addIssue(issues, 'ERROR', 'hierarchy_non_adjacent_parent', `父子必须相邻层：${parent.level}->${element.level}`, pointer);
    }
    const confidence = element.hierarchy_confidence || {};
    const expectedOverall = Math.min(confidence.evidence ?? 1, confidence.boundary ?? 1, confidence.parent ?? 1, confidence.granularity ?? 1);
    if (Math.abs((confidence.overall ?? -1) - expectedOverall) > 1e-9) addIssue(issues, 'ERROR', 'hierarchy_confidence_not_conservative', `overall 必须等于四维最低值 ${expectedOverall}`, pointer);
    if (element.decomposition_basis === 'inferred_structure' && element.review?.pool !== 'full') addIssue(issues, 'ERROR', 'inferred_hierarchy_not_full_review', '推断层级必须进入 full review pool', pointer);
    if (element.hierarchy_status === 'unresolved' && digest.status === 'ready_for_ingestion') addIssue(issues, 'ERROR', 'ready_with_unresolved_hierarchy', '存在 unresolved 层级时不得 ready_for_ingestion', pointer);
    for (const ref of element.objective_refs || []) if (!objectiveIds.has(ref)) addIssue(issues, 'ERROR', 'element_objective_missing', `objective_ref 不存在：${ref}`, pointer);
    for (const ref of [...(element.input_artifact_refs || []), ...(element.output_artifact_refs || [])]) if (!artifactIds.has(ref)) addIssue(issues, 'ERROR', 'element_artifact_missing', `artifact_ref 不存在：${ref}`, pointer);
    const proposal = candidateProcessElements.get(element.element_id);
    if (!proposal) addIssue(issues, 'ERROR', 'digest_element_candidate_missing', `流程元素没有对应 candidate proposal：${element.element_id}`, pointer);
    else {
      if (proposal.rdfType !== element.rdf_type) addIssue(issues, 'ERROR', 'candidate_element_type_mismatch', `${element.element_id} candidate rdfType 与 digest 不一致`, pointer);
      const properties = proposal.properties || {};
      if (properties['efio:hierarchyLevel'] !== element.level) addIssue(issues, 'ERROR', 'candidate_hierarchy_level_mismatch', `${element.element_id} 缺少或错误 efio:hierarchyLevel`, pointer);
      if (element.parent_ref && properties['efio:parentElement'] !== element.parent_ref) addIssue(issues, 'ERROR', 'candidate_parent_mismatch', `${element.element_id} efio:parentElement 与 digest 不一致`, pointer);
      if (element.owning_process_ref && properties['efio:owningProcess'] !== element.owning_process_ref) addIssue(issues, 'ERROR', 'candidate_owning_process_mismatch', `${element.element_id} efio:owningProcess 与 digest 不一致`, pointer);
      if (properties['efio:mappingStatus'] !== 'PENDING_CORE_ALIGNMENT') addIssue(issues, 'ERROR', 'candidate_mapping_status_missing', `${element.element_id} 必须标记 PENDING_CORE_ALIGNMENT`, pointer);
      const propertyRefs = (name) => new Set(asRefs(properties[name]));
      for (const ref of element.objective_refs || []) if (!propertyRefs('hasObjective').has(ref)) addIssue(issues, 'ERROR', 'candidate_objective_projection_missing', `${element.element_id} 未投影 hasObjective ${ref}`, pointer);
      for (const ref of element.input_artifact_refs || []) if (!propertyRefs('hasInput').has(ref)) addIssue(issues, 'ERROR', 'candidate_input_projection_missing', `${element.element_id} 未投影 hasInput ${ref}`, pointer);
      for (const ref of element.output_artifact_refs || []) if (!propertyRefs('hasOutput').has(ref)) addIssue(issues, 'ERROR', 'candidate_output_projection_missing', `${element.element_id} 未投影 hasOutput ${ref}`, pointer);
    }
    for (const ref of element.candidate_refs || []) if (!candidateIds.has(ref)) addIssue(issues, 'ERROR', 'candidate_ref_missing', `candidate_ref 不存在：${ref}`, `${pointer}/candidate_refs`);
  }
  for (const start of elementIds) {
    const seen = new Set();
    let current = byElementId.get(start);
    while (current?.parent_ref) {
      if (seen.has(current.element_id)) { addIssue(issues, 'ERROR', 'hierarchy_cycle', `层级存在环，起点 ${start}`, 'digest/process_elements'); break; }
      seen.add(current.element_id);
      current = byElementId.get(current.parent_ref);
    }
  }
  for (const element of digest.process_elements || []) {
    if (!['L4', 'L5'].includes(element.level) || element.hierarchy_status !== 'resolved') continue;
    let current = element;
    while (current && current.level !== 'L3') current = byElementId.get(current.parent_ref);
    if (!current || element.owning_process_ref !== current.element_id) addIssue(issues, 'ERROR', 'owning_process_invalid', `${element.element_id} owning_process_ref 不等于其 L3 祖先`, 'digest/process_elements');
  }
  for (const process of (digest.process_elements || []).filter((element) => element.level === 'L3' && element.hierarchy_status === 'resolved')) {
    const children = (digest.process_elements || []).filter((element) => element.parent_ref === process.element_id && element.level === 'L4');
    if (!children.length) addIssue(issues, 'ERROR', 'process_activity_missing', `L3 ${process.element_id} 至少需要一个 L4 活动`, 'digest/process_elements');
    if (!(process.objective_refs || []).length) addIssue(issues, 'ERROR', 'process_objective_missing', `L3 ${process.element_id} 缺少目标`, 'digest/process_elements');
    if (!(process.entry_conditions || []).length) addIssue(issues, 'ERROR', 'process_entry_missing', `L3 ${process.element_id} 缺少入口/触发条件`, 'digest/process_elements');
    if (!(process.output_artifact_refs || []).length) addIssue(issues, 'ERROR', 'process_output_missing', `L3 ${process.element_id} 缺少输出 Artifact`, 'digest/process_elements');
  }
  for (const proposalId of candidateProcessElements.keys()) if (!elementIds.has(proposalId)) addIssue(issues, 'ERROR', 'candidate_element_digest_missing', `candidate 流程元素未进入 digest：${proposalId}`, 'candidates');

  const digestMainEdges = new Set((digest.flow_edges || []).filter((edge) => edge.edge_kind === 'main').map((edge) => `${edge.from_ref}->${edge.to_ref}`));
  for (const edge of digestMainEdges) if (!candidateMainEdges.has(edge)) addIssue(issues, 'ERROR', 'digest_main_edge_candidate_mismatch', `digest 主干边未投影到 candidate precededByActivity：${edge}`, 'digest/activities');
  for (const edge of candidateMainEdges) if (!digestMainEdges.has(edge)) addIssue(issues, 'ERROR', 'candidate_main_edge_digest_mismatch', `candidate 主干边与 digest 不一致：${edge}`, 'candidates');

  const edgePairs = new Map();
  for (const [index, edge] of (digest.flow_edges || []).entries()) {
    const pointer = `digest/flow_edges/${index}`;
    const from = byElementId.get(edge.from_ref); const to = byElementId.get(edge.to_ref); const process = byElementId.get(edge.process_ref);
    if (!from || !to) addIssue(issues, 'ERROR', 'flow_edge_endpoint_missing', `flow edge 端点不存在：${edge.from_ref}->${edge.to_ref}`, pointer);
    if (!process || process.level !== 'L3') addIssue(issues, 'ERROR', 'flow_edge_process_invalid', `process_ref 必须指向 L3：${edge.process_ref}`, pointer);
    if (from && to && (from.owning_process_ref !== edge.process_ref || to.owning_process_ref !== edge.process_ref)) addIssue(issues, 'ERROR', 'flow_edge_cross_process', 'flow edge 两端必须属于同一 L3', pointer);
    const pair = `${edge.from_ref}->${edge.to_ref}`;
    if (edgePairs.has(pair) && edgePairs.get(pair) !== edge.edge_kind) addIssue(issues, 'ERROR', 'flow_edge_single_source_violation', `同一边同时存在 ${edgePairs.get(pair)} 和 ${edge.edge_kind}`, pointer);
    edgePairs.set(pair, edge.edge_kind);
    if (edge.edge_kind !== 'main') {
      const transition = candidateTransitionEdges.get(pair);
      if (!transition) addIssue(issues, 'ERROR', 'candidate_transition_projection_missing', `条件/异常边未投影到 candidates transition：${pair}`, pointer);
      else {
        const expectedKind = edge.edge_kind.toUpperCase();
        if (transition.transitionKind !== expectedKind) addIssue(issues, 'ERROR', 'candidate_transition_kind_mismatch', `transitionKind 应为 ${expectedKind}`, pointer);
      }
    }
    for (const ref of edge.candidate_refs || []) if (!candidateIds.has(ref)) addIssue(issues, 'ERROR', 'candidate_ref_missing', `candidate_ref 不存在：${ref}`, `${pointer}/candidate_refs`);
  }

  for (const [index, objective] of (digest.process_objectives || []).entries()) {
    if (objective.parent_objective_ref && !objectiveIds.has(objective.parent_objective_ref)) addIssue(issues, 'ERROR', 'objective_parent_missing', `目标父级不存在：${objective.parent_objective_ref}`, `digest/process_objectives/${index}`);
    for (const ref of objective.element_refs || []) if (!elementIds.has(ref)) addIssue(issues, 'ERROR', 'objective_element_missing', `目标流程元素不存在：${ref}`, `digest/process_objectives/${index}`);
    if (!localIds.has(objective.objective_id)) addIssue(issues, 'ERROR', 'candidate_objective_missing', `目标没有对应 candidate proposal：${objective.objective_id}`, `digest/process_objectives/${index}`);
  }
  for (const [index, artifact] of (digest.artifacts || []).entries()) {
    for (const ref of artifact.produced_by || []) {
      if (!elementIds.has(ref)) addIssue(issues, 'ERROR', 'artifact_element_missing', `Artifact 生产元素不存在：${ref}`, `digest/artifacts/${index}`);
      else if (!(byElementId.get(ref).output_artifact_refs || []).includes(artifact.artifact_id)) addIssue(issues, 'ERROR', 'artifact_output_not_reciprocal', `${ref} 未回指输出 ${artifact.artifact_id}`, `digest/artifacts/${index}`);
    }
    for (const ref of artifact.consumed_by || []) {
      if (!elementIds.has(ref)) addIssue(issues, 'ERROR', 'artifact_element_missing', `Artifact 消费元素不存在：${ref}`, `digest/artifacts/${index}`);
      else if (!(byElementId.get(ref).input_artifact_refs || []).includes(artifact.artifact_id)) addIssue(issues, 'ERROR', 'artifact_input_not_reciprocal', `${ref} 未回指输入 ${artifact.artifact_id}`, `digest/artifacts/${index}`);
    }
    if (!localIds.has(artifact.artifact_id)) addIssue(issues, 'ERROR', 'candidate_artifact_missing', `Artifact 没有对应 candidate proposal：${artifact.artifact_id}`, `digest/artifacts/${index}`);
  }

  for (const [index, rule] of (digest.rules || []).entries()) {
    for (const ref of rule.candidate_refs || []) if (!candidateIds.has(ref)) addIssue(issues, 'ERROR', 'candidate_ref_missing', `candidate_ref 不存在：${ref}`, `digest/rules/${index}/candidate_refs`);
    if (rule.requirement !== null && rule.requirement !== '') {
      const obligationId = `${rule.rule_id}-OBLIGATION`;
      const proposals = (rule.candidate_refs || []).map((ref) => proposalsByCandidate.get(ref)?.get(obligationId)).filter(Boolean);
      if (!proposals.length) addIssue(issues, 'ERROR', 'candidate_rule_obligation_missing', `规则没有对应的确定性 Obligation proposal：${obligationId}`, `digest/rules/${index}`);
      else for (const proposal of proposals) {
        if (proposal.rdfType !== 'policy:Obligation') addIssue(issues, 'ERROR', 'candidate_rule_obligation_type_mismatch', `${obligationId} rdfType 必须为 policy:Obligation`, `digest/rules/${index}`);
        if (proposal.statement !== rule.requirement) addIssue(issues, 'ERROR', 'candidate_rule_statement_mismatch', `${obligationId} statement 与 digest requirement 不一致`, `digest/rules/${index}`);
      }
    }
  }
  const assignmentsByElement = new Map();
  for (const [index, assignment] of (digest.role_assignments || []).entries()) {
    if (!elementIds.has(assignment.element_ref)) addIssue(issues, 'ERROR', 'raci_element_missing', `RACI element_ref 不存在：${assignment.element_ref}`, `digest/role_assignments/${index}`);
    if (!assignmentsByElement.has(assignment.element_ref)) assignmentsByElement.set(assignment.element_ref, []);
    assignmentsByElement.get(assignment.element_ref).push(assignment.raci);
  }
  for (const element of digest.process_elements || []) {
    if (!['L3', 'L4', 'L5'].includes(element.level)) continue;
    const raci = assignmentsByElement.get(element.element_id) || [];
    if (['L4', 'L5'].includes(element.level) && !raci.includes('R')) addIssue(issues, 'WARN', 'raci_responsible_missing', `元素 ${element.element_id} 没有 R`, 'digest/role_assignments');
    if (element.level === 'L3' && raci.filter((item) => item === 'A').length !== 1) addIssue(issues, 'WARN', 'raci_accountable_count', `L3 ${element.element_id} 的 A 数量不是 1`, 'digest/role_assignments');
  }
  for (const [index, risk] of (digest.risks || []).entries()) for (const ref of risk.element_refs || []) if (!elementIds.has(ref)) addIssue(issues, 'ERROR', 'risk_element_missing', `风险 element_ref 不存在：${ref}`, `digest/risks/${index}`);
  for (const [index, control] of (digest.controls || []).entries()) if (control.element_ref && !elementIds.has(control.element_ref)) addIssue(issues, 'ERROR', 'control_element_missing', `控制 element_ref 不存在：${control.element_ref}`, `digest/controls/${index}`);
  for (const [index, rule] of (digest.rules || []).entries()) for (const ref of rule.operationalized_by || []) if (!elementIds.has(ref)) addIssue(issues, 'ERROR', 'rule_element_missing', `规则 operationalized_by 不存在：${ref}`, `digest/rules/${index}`);
  const blocking = [...(digest.issues || []), ...(digest.pending_confirmations || [])].filter((item) => item.blocking);
  if (digest.status === 'ready_for_ingestion' && blocking.length) addIssue(issues, 'ERROR', 'ready_with_blockers', 'ready_for_ingestion 状态仍存在 blocking 项', 'digest/status');
  if (digest.status === 'ready_for_ingestion') {
    const proposed = collectReviewStatuses(digest).filter((status) => status === 'proposed');
    if (proposed.length) addIssue(issues, 'ERROR', 'ready_with_proposals', 'ready_for_ingestion 状态仍存在 proposed 记录', 'digest/status');
  }
}

function collectReviewStatuses(value, statuses = []) {
  if (!value || typeof value !== 'object') return statuses;
  if (!Array.isArray(value) && value.review?.status) statuses.push(value.review.status);
  if (Array.isArray(value)) value.forEach((child) => collectReviewStatuses(child, statuses));
  else for (const [key, child] of Object.entries(value)) if (key !== 'review') collectReviewStatuses(child, statuses);
  return statuses;
}

function validateMarkdown(markdownPath, digest, issues) {
  if (!existsSync(markdownPath)) {
    addIssue(issues, 'ERROR', 'markdown_missing', '缺少 digest.md', markdownPath);
    return;
  }
  const markdown = readFileSync(markdownPath, 'utf8');
  for (const pattern of REQUIRED_MARKDOWN_SECTIONS) if (!pattern.test(markdown)) addIssue(issues, 'ERROR', 'markdown_section_missing', `缺少章节 ${pattern}`, markdownPath);
  const ids = [
    ...(digest.rules || []).map((item) => item.rule_id),
    ...(digest.process_elements || []).map((item) => item.element_id),
    ...(digest.process_objectives || []).map((item) => item.objective_id),
    ...(digest.artifacts || []).map((item) => item.artifact_id),
    ...(digest.flow_edges || []).map((item) => item.edge_id),
    ...(digest.role_assignments || []).map((item) => item.assignment_id),
    ...(digest.risks || []).map((item) => item.risk_id),
    ...(digest.controls || []).map((item) => item.control_id),
    ...(digest.issues || []).map((item) => item.issue_id),
  ].filter(Boolean);
  for (const id of ids) if (!markdown.includes(id)) addIssue(issues, 'ERROR', 'markdown_record_missing', `digest.md 未呈现记录 ${id}`, markdownPath);
}

export function validatePackage(inputPath) {
  const packageDir = resolve(existsSync(inputPath) && !basename(inputPath).toLowerCase().endsWith('.json') ? inputPath : dirname(inputPath));
  const issues = [];
  const paths = {
    digest: join(packageDir, 'digest.json'),
    parsed: join(packageDir, 'normalized.parsed.json'),
    candidates: join(packageDir, 'candidates.json'),
    markdown: join(packageDir, 'digest.md'),
    sourceIndex: join(packageDir, 'source-index.json'),
  };
  const digest = loadJson(paths.digest, issues, 'digest');
  const parsed = loadJson(paths.parsed, issues, 'parsed');
  const candidates = loadJson(paths.candidates, issues, 'candidates');
  loadJson(paths.sourceIndex, issues, 'source_index');
  const hints = parsed ? collectDiagnosticHints(parsed) : [];

  if (digest) {
    if (digest.digest_schema_version !== '0.2.0') addIssue(issues, 'ERROR', 'digest_version_unsupported', '当前校验器只接受 0.2.0；请先运行 0.1→0.2 迁移器', 'digest/digest_schema_version');
    const digestSchema = loadSchema('policy-digest-0.2.0.schema.json');
    validateBySchema(digest, digestSchema, digestSchema, 'digest', issues);
    validateProjectableParameters(digest, issues);
  }
  if (parsed) validateBySchema(parsed, loadSchema('parsed-document-0.1.0.schema.json'), loadSchema('parsed-document-0.1.0.schema.json'), 'parsed', issues);
  if (candidates) validateBySchema(candidates, loadSchema('candidates-0.3.0.schema.json'), loadSchema('candidates-0.3.0.schema.json'), 'candidates', issues);
  if (digest && parsed && candidates) {
    validateAnchors(digest, candidates, parsed, issues);
    const candidateInfo = validateCandidateReferences(candidates, parsed, issues);
    validateDigestReferences(digest, candidateInfo, issues);
    validateMarkdown(paths.markdown, digest, issues);
    const parsedRef = candidates.document?.parsedRef?.path;
    if (parsedRef && basename(parsedRef) !== basename(paths.parsed)) addIssue(issues, 'ERROR', 'parsed_ref_path', `parsedRef 应指向 ${basename(paths.parsed)}`, 'candidates/document/parsedRef/path');
  }
  return { packageDir, paths, issues, hints, summary: summarizeIssues(issues) };
}

export function printResult(result, options = {}) {
  const { jsonOutput = false, summaryOnly = false, showAll = false, maxPerCode = 5 } = options;
  const summary = result.summary || summarizeIssues(result.issues);
  if (jsonOutput) console.log(JSON.stringify({ ...result, summary }, null, 2));
  else {
    console.log(`Policy Digest 校验: ${summary.errors} ERROR, ${summary.warnings} WARN`);
    if (result.hints?.length) {
      console.log('定向诊断:');
      for (const hint of result.hints) console.log(`  💡 [${hint.code}] ${hint.location ? `${hint.location}: ` : ''}${hint.message}`);
    }
    if (summary.by_code.length) {
      console.log('问题类型（按数量排序）:');
      for (const group of summary.by_code) console.log(`  ${group.errors ? '🔴' : '🟡'} [${group.code}] ×${group.total}${group.errors && group.warnings ? ` (${group.errors} ERROR, ${group.warnings} WARN)` : ''}`);
    }
    if (!summaryOnly) {
      const shownByCode = new Map();
      for (const item of result.issues) {
        const shown = shownByCode.get(item.code) || 0;
        if (!showAll && shown >= maxPerCode) continue;
        shownByCode.set(item.code, shown + 1);
        console.log(`  ${item.severity === 'ERROR' ? '🔴' : '🟡'} [${item.code}] ${item.location ? `${item.location}: ` : ''}${item.message}`);
      }
      if (!showAll) {
        for (const group of summary.by_code) {
          const omitted = group.total - (shownByCode.get(group.code) || 0);
          if (omitted > 0) console.log(`  … [${group.code}] 另有 ${omitted} 条未展开；使用 --all 查看全部`);
        }
      }
    }
    if (!result.issues.length) console.log('  ✅ Schema、锚点、引用、流程边和 Markdown 一致性校验通过');
  }
  return summary.errors ? 1 : 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const summaryOnly = args.includes('--summary-only');
  const showAll = args.includes('--all');
  const maxIndex = args.indexOf('--max-per-code');
  const maxPerCode = maxIndex >= 0 ? Number.parseInt(args[maxIndex + 1], 10) : 5;
  const target = args.find((arg) => !arg.startsWith('--'));
  if (!target) {
    console.error('用法: node validate-policy-digest.mjs <policy-digest-directory|digest.json> [--json|--summary-only|--all] [--max-per-code <n>]');
    process.exit(2);
  }
  if (!Number.isInteger(maxPerCode) || maxPerCode < 1) {
    console.error('--max-per-code 必须是大于 0 的整数');
    process.exit(2);
  }
  process.exitCode = printResult(validatePackage(isAbsolute(target) ? target : resolve(target)), { jsonOutput, summaryOnly, showAll, maxPerCode });
}
