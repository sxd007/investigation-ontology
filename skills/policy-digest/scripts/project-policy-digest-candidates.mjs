#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PROCESS_TYPES = new Set(['proc:ProcessCategory', 'proc:ProcessGroup', 'proc:Process', 'proc:ProcessActivity', 'proc:Task']);
const CANDIDATE_DISPOSITIONS = new Set(['purpose-preamble', 'definition', 'prohibition', 'mandatory', 'procedural', 'duty-position', 'penalty', 'citation', 'process-step', 'risk-requirement', 'exemption', 'non-normative']);
const CLAUSE_TYPES = new Set(['prohibition', 'mandatory', 'procedural', 'duty-position', 'penalty', 'citation', 'definition', 'purpose-preamble', 'exemption', 'process-step']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function stableSort(values, key) {
  return [...values].sort((left, right) => String(key(left)).localeCompare(String(key(right))));
}

function samePath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  return normalize(left) === normalize(right);
}

function oneCandidateRef(record, id, kind) {
  const refs = record.candidate_refs || [];
  if (refs.length !== 1) throw new Error(`${kind} ${id} 必须恰好有一个 candidate_ref 才能确定性投影，实际为 ${refs.length}`);
  return refs[0];
}

function processProperties(element, predecessors) {
  const properties = {
    'efio:hierarchyLevel': element.level,
    ...(element.parent_ref ? { 'efio:parentElement': element.parent_ref } : {}),
    ...(element.owning_process_ref ? { 'efio:owningProcess': element.owning_process_ref } : {}),
    'efio:mappingStatus': 'PENDING_CORE_ALIGNMENT',
    ...(element.objective_refs?.length ? { hasObjective: element.objective_refs.length === 1 ? element.objective_refs[0] : [...element.objective_refs] } : {}),
    ...(element.input_artifact_refs?.length ? { hasInput: element.input_artifact_refs.length === 1 ? element.input_artifact_refs[0] : [...element.input_artifact_refs] } : {}),
    ...(element.output_artifact_refs?.length ? { hasOutput: element.output_artifact_refs.length === 1 ? element.output_artifact_refs[0] : [...element.output_artifact_refs] } : {}),
  };
  const refs = predecessors.get(element.element_id) || [];
  if (refs.length) properties.precededByActivity = refs.length === 1 ? refs[0] : refs;
  return properties;
}

function projectParameter(parameter, target = null, context = 'parameter') {
  const projected = {
    ...(target || parameter.target ? { target: target || parameter.target } : {}),
    parameterType: parameter.parameterType ?? parameter.parameter_type,
    value: parameter.value,
    ...(parameter.valueNumber !== undefined || parameter.value_number !== undefined ? { valueNumber: parameter.valueNumber ?? parameter.value_number } : {}),
    ...(parameter.comparator ? { comparator: String(parameter.comparator).toUpperCase() } : {}),
    ...(parameter.unit ? { unit: parameter.unit } : {}),
    ...(parameter.note ? { note: parameter.note } : {}),
  };
  if (!projected.parameterType || typeof projected.value !== 'string') {
    const missing = [!projected.parameterType ? 'parameterType/parameter_type' : null, typeof projected.value !== 'string' ? 'value(string)' : null].filter(Boolean);
    throw new Error(`${context} 缺少或无效字段：${missing.join('、')}`);
  }
  return projected;
}

function sourceBlock(source) {
  return { docId: source.doc_id, blockId: source.block_id, blockPath: source.block_path, excerpt: source.excerpt };
}

function sameSource(left, right) {
  return left.doc_id === right.doc_id && left.block_id === right.block_id && left.block_path === right.block_path && left.excerpt === right.excerpt;
}

function projectRuleGroup(candidate, rules) {
  if (!rules.length) return { proposals: [], parameters: [] };
  const dispositions = new Set(rules.map((rule) => rule.disposition));
  if (dispositions.size !== 1 || !CANDIDATE_DISPOSITIONS.has(rules[0].disposition)) {
    throw new Error(`candidate ${candidate.candidateId} 的 rules 必须共享一个 Candidates 0.3 disposition；实际为 ${[...dispositions].join(', ')}`);
  }
  if (!rules.every((rule) => sameSource(rule.source, rules[0].source))) {
    throw new Error(`candidate ${candidate.candidateId} 的 rules 来自多个 source block，无法生成唯一 sourceBlock`);
  }
  const clauseTypes = [...new Set(rules.flatMap((rule) => rule.clause_types || []))].sort((left, right) => left.localeCompare(right));
  const unsupportedClauseType = clauseTypes.find((value) => !CLAUSE_TYPES.has(value));
  if (unsupportedClauseType) throw new Error(`candidate ${candidate.candidateId} 含 Candidates 0.3 不支持的 clause_type：${unsupportedClauseType}`);

  candidate.sourceBlock = sourceBlock(rules[0].source);
  candidate.disposition = rules[0].disposition;
  candidate.confidence = Math.min(...rules.map((rule) => rule.semantic_confidence));
  candidate.reviewPool = clauseTypes.length > 1 || rules.some((rule) => rule.review?.pool === 'full') ? 'full' : 'sampled';
  if (clauseTypes.length) candidate.clauseType = clauseTypes;
  else delete candidate.clauseType;

  const proposals = [];
  const parameters = [];
  const requirements = rules.filter((rule) => rule.requirement !== null && rule.requirement !== '');
  if (candidate.disposition === 'procedural') {
    if (requirements.length !== 1) throw new Error(`procedural candidate ${candidate.candidateId} 必须恰好包含一条 requirement 才能确定 obligationDraft`);
    candidate.obligationDraft = { statement: requirements[0].requirement };
  } else delete candidate.obligationDraft;

  for (const rule of rules) {
    if (rule.requirement === null || rule.requirement === '') {
      if (rule.parameters?.length) throw new Error(`rule ${rule.rule_id} 没有 requirement，不能为参数确定 Obligation target`);
      continue;
    }
    const obligationId = `${rule.rule_id}-OBLIGATION`;
    proposals.push({
      localId: obligationId,
      rdfType: 'policy:Obligation',
      statement: rule.requirement,
      obligationStatus: 'DRAFT',
      applicability: 'UNASSESSED',
    });
    for (const [parameterIndex, parameter] of (rule.parameters || []).entries()) {
      parameters.push(projectParameter(parameter, obligationId, `rule ${rule.rule_id}.parameters[${parameterIndex}]`));
    }
  }
  return { proposals, parameters };
}

function addByCandidate(target, candidateId, value, label) {
  if (!target.has(candidateId)) throw new Error(`${label} 引用不存在的 candidateId：${candidateId}`);
  target.get(candidateId).push(value);
}

export function createCandidateSeed(digest, requestedCoreVersion = null) {
  if (digest.digest_schema_version !== '0.2.0') throw new Error(`仅支持 Policy Digest 0.2.0，实际为 ${digest.digest_schema_version}`);
  const coreVersions = Object.values(digest.ontology_projection?.core_versions || {});
  const uniqueCoreVersions = [...new Set(coreVersions)];
  const coreVersion = requestedCoreVersion || (uniqueCoreVersions.length === 1 ? uniqueCoreVersions[0] : null);
  if (!coreVersion) {
    const choices = Object.entries(digest.ontology_projection?.core_versions || {}).map(([name, version]) => `${name}=${version}`).join('，') || '<empty>';
    throw new Error(`ontology_projection.core_versions 含多个不同版本（${choices}）；初始化 candidate 时必须用 --core-version 明确选择，不能猜测`);
  }
  if (requestedCoreVersion && !uniqueCoreVersions.includes(requestedCoreVersion)) {
    throw new Error(`--core-version ${requestedCoreVersion} 不在 ontology_projection.core_versions 的可选值中：${uniqueCoreVersions.join('，') || '<empty>'}`);
  }

  const candidateIds = new Set();
  for (const collection of ['rules', 'process_elements', 'process_objectives', 'artifacts', 'flow_edges']) {
    for (const record of digest[collection] || []) for (const ref of record.candidate_refs || []) candidateIds.add(ref);
  }
  if (!candidateIds.size) throw new Error('digest 没有任何 candidate_refs，无法初始化 candidate 边界');
  const rulesByCandidate = new Map([...candidateIds].map((id) => [id, []]));
  for (const rule of digest.rules || []) {
    const candidateId = oneCandidateRef(rule, rule.rule_id, 'rule');
    if (!rulesByCandidate.has(candidateId)) rulesByCandidate.set(candidateId, []);
    rulesByCandidate.get(candidateId).push(rule);
  }
  const candidates = stableSort([...candidateIds], (id) => id).map((candidateId) => {
    const rules = rulesByCandidate.get(candidateId) || [];
    if (!rules.length) throw new Error(`candidate ${candidateId} 没有关联 rule，无法确定 sourceBlock 和 disposition；请提供 seed candidates.json`);
    const first = rules[0];
    return {
      candidateId,
      sourceBlock: sourceBlock(first.source),
      disposition: first.disposition,
      confidence: first.semantic_confidence,
      coreVersion,
      produces: [],
      reviewPool: first.review?.pool || 'full',
      review: { status: 'proposed', reviewer: null, timestamp: null },
    };
  });
  return {
    candidatesSchemaVersion: digest.ontology_projection.candidates_schema_version,
    document: {
      docId: digest.document_identity.doc_id,
      parsedRef: { path: digest.ontology_projection.parsed_ref, parsedSchemaVersion: digest.ontology_projection.parsed_schema_version },
      ...(digest.ontology_projection.tenant ? { tenant: digest.ontology_projection.tenant } : {}),
    },
    coreVersions: structuredClone(digest.ontology_projection.core_versions),
    candidates,
  };
}

export function projectDeterministicCandidates(digest, seedCandidates) {
  if (digest.digest_schema_version !== '0.2.0') throw new Error(`仅支持 Policy Digest 0.2.0，实际为 ${digest.digest_schema_version}`);
  if (seedCandidates.candidatesSchemaVersion !== '0.3.0') throw new Error(`仅支持 Candidates 0.3.0，实际为 ${seedCandidates.candidatesSchemaVersion}`);

  const projected = structuredClone(seedCandidates);
  projected.document = {
    docId: digest.document_identity.doc_id,
    parsedRef: {
      path: digest.ontology_projection.parsed_ref,
      parsedSchemaVersion: digest.ontology_projection.parsed_schema_version,
    },
    ...(digest.ontology_projection.tenant ? { tenant: digest.ontology_projection.tenant } : {}),
  };
  projected.coreVersions = structuredClone(digest.ontology_projection.core_versions);
  const candidatesById = new Map((projected.candidates || []).map((candidate) => [candidate.candidateId, candidate]));
  const proposalsByCandidate = new Map([...candidatesById.keys()].map((id) => [id, []]));
  const transitionsByCandidate = new Map([...candidatesById.keys()].map((id) => [id, []]));
  const rulesByCandidate = new Map([...candidatesById.keys()].map((id) => [id, []]));
  const deterministicIds = new Set([
    ...(digest.rules || []).map((item) => `${item.rule_id}-OBLIGATION`),
    ...(digest.process_elements || []).map((item) => item.element_id),
    ...(digest.process_objectives || []).map((item) => item.objective_id),
    ...(digest.artifacts || []).map((item) => item.artifact_id),
  ]);

  for (const candidate of projected.candidates || []) {
    candidate.produces = (candidate.produces || []).filter((proposal) => !deterministicIds.has(proposal.localId) && !PROCESS_TYPES.has(proposal.rdfType) && proposal.rdfType !== 'proc:ProcessObjective' && proposal.rdfType !== 'proc:Artifact');
    candidate.parameters = (candidate.parameters || []).filter((parameter) => !deterministicIds.has(parameter.target));
    candidate.transitions = [];
  }

  for (const rule of digest.rules || []) {
    const candidateId = oneCandidateRef(rule, rule.rule_id, 'rule');
    addByCandidate(rulesByCandidate, candidateId, rule, `rule ${rule.rule_id}`);
  }

  const predecessors = new Map();
  for (const edge of digest.flow_edges || []) {
    for (const candidateRef of edge.candidate_refs || []) if (!candidatesById.has(candidateRef)) throw new Error(`flow edge ${edge.edge_id} 引用不存在的 candidateId：${candidateRef}`);
    if (edge.edge_kind === 'main') {
      if (!predecessors.has(edge.to_ref)) predecessors.set(edge.to_ref, []);
      predecessors.get(edge.to_ref).push(edge.from_ref);
    } else {
      const candidateId = oneCandidateRef(edge, edge.edge_id, 'flow edge');
      addByCandidate(transitionsByCandidate, candidateId, {
        localId: edge.edge_id,
        fromActivity: edge.from_ref,
        toActivity: edge.to_ref,
        transitionKind: String(edge.edge_kind).toUpperCase(),
        ...(edge.condition ? { condition: edge.condition } : {}),
        ...(edge.condition_parameters?.length ? { conditionParams: edge.condition_parameters.map((parameter, parameterIndex) => projectParameter(parameter, null, `flow edge ${edge.edge_id}.condition_parameters[${parameterIndex}]`)) } : {}),
      }, `flow edge ${edge.edge_id}`);
    }
  }
  for (const values of predecessors.values()) values.sort((left, right) => left.localeCompare(right));

  for (const element of digest.process_elements || []) {
    const candidateId = oneCandidateRef(element, element.element_id, 'process element');
    addByCandidate(proposalsByCandidate, candidateId, {
      localId: element.element_id,
      rdfType: element.rdf_type,
      label: element.name,
      properties: processProperties(element, predecessors),
    }, `process element ${element.element_id}`);
  }
  for (const objective of digest.process_objectives || []) {
    const candidateId = oneCandidateRef(objective, objective.objective_id, 'process objective');
    addByCandidate(proposalsByCandidate, candidateId, {
      localId: objective.objective_id,
      rdfType: 'proc:ProcessObjective',
      label: objective.statement,
    }, `process objective ${objective.objective_id}`);
  }
  for (const artifact of digest.artifacts || []) {
    const candidateId = oneCandidateRef(artifact, artifact.artifact_id, 'artifact');
    addByCandidate(proposalsByCandidate, candidateId, {
      localId: artifact.artifact_id,
      rdfType: 'proc:Artifact',
      label: artifact.name,
    }, `artifact ${artifact.artifact_id}`);
  }

  for (const candidate of projected.candidates || []) {
    const ruleProjection = projectRuleGroup(candidate, rulesByCandidate.get(candidate.candidateId) || []);
    for (const proposal of ruleProjection.proposals) proposalsByCandidate.get(candidate.candidateId).push(proposal);
    candidate.parameters = stableSort([...(candidate.parameters || []), ...ruleProjection.parameters], (parameter) => `${parameter.target || ''}:${parameter.parameterType}:${parameter.value}`);
    if (!candidate.parameters.length) delete candidate.parameters;
    const generatedProposals = proposalsByCandidate.get(candidate.candidateId) || [];
    candidate.produces = stableSort([...(candidate.produces || []), ...generatedProposals], (proposal) => proposal.localId);
    const generatedTransitions = transitionsByCandidate.get(candidate.candidateId) || [];
    if (generatedTransitions.length) candidate.transitions = stableSort(generatedTransitions, (transition) => transition.localId);
    else delete candidate.transitions;
  }
  projected.candidates = stableSort(projected.candidates || [], (candidate) => candidate.candidateId);
  return projected;
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function runCli() {
  const args = process.argv.slice(2);
  const input = args.find((arg) => !arg.startsWith('--'));
  if (!input) throw new Error('用法: node project-policy-digest-candidates.mjs <package-directory> [--check|--init] [--core-version <version>] [--in-place|--output <path>]');
  const directory = resolve(input);
  const digestPath = join(directory, 'digest.json');
  const candidatesPath = join(directory, 'candidates.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  const digest = readJson(digestPath);
  const initialize = args.includes('--init');
  const outputIndex = args.indexOf('--output');
  const requestedOutput = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (outputIndex >= 0 && !requestedOutput) throw new Error('--output 后必须提供路径');
  const inPlace = args.includes('--in-place');
  if (inPlace && requestedOutput) throw new Error('--in-place 与 --output 不能同时使用');
  const resolvedOutput = requestedOutput ? resolve(requestedOutput) : null;
  if (resolvedOutput && samePath(resolvedOutput, candidatesPath)) throw new Error('--output 不得覆盖包内 candidates.json；请使用 --in-place 以便先备份');
  if (!existsSync(candidatesPath) && !initialize) throw new Error(`缺少 ${candidatesPath}；如 digest 已显式填写 candidate_refs，可使用 --init 严格初始化`);
  if (existsSync(candidatesPath) && initialize && (inPlace || !resolvedOutput)) {
    throw new Error('candidates.json 已存在；--init 仅允许配合指向其他文件的 --output 做安全预览，不得覆盖或忽略已有本体决策');
  }
  const coreVersionIndex = args.indexOf('--core-version');
  const requestedCoreVersion = coreVersionIndex >= 0 ? args[coreVersionIndex + 1] : null;
  if (coreVersionIndex >= 0 && !requestedCoreVersion) throw new Error('--core-version 后必须提供版本');
  if (requestedCoreVersion && !/^\d+\.\d+\.\d+$/.test(requestedCoreVersion)) throw new Error('--core-version 必须是 X.Y.Z 格式');
  if (requestedCoreVersion && !initialize) throw new Error('--core-version 仅与 --init 一起使用');
  const current = initialize ? createCandidateSeed(digest, requestedCoreVersion) : readJson(candidatesPath);
  const projected = projectDeterministicCandidates(digest, current);
  const currentText = canonicalJson(current);
  const projectedText = canonicalJson(projected);
  const changed = currentText !== projectedText;
  if (args.includes('--check')) {
    if (initialize) throw new Error('--check 需要已有 candidates.json，不能与 --init 同时使用');
    if (changed) {
      console.error('🔴 candidates.json 的确定性规则/流程投影与 digest.json 不一致');
      process.exitCode = 1;
    } else console.log('✓ candidates.json 的规则义务、参数、流程层级、目标、Artifact 和流程边投影与 digest.json 一致');
    return;
  }
  if (inPlace && existsSync(candidatesPath)) writeFileSync(join(directory, 'candidates.before-projection.json'), currentText, 'utf8');
  const outputPath = inPlace ? candidatesPath : resolvedOutput || join(directory, 'candidates.projected.json');
  writeFileSync(outputPath, projectedText, 'utf8');
  console.log(`${changed ? '✓ 已生成' : '✓ 无内容漂移，已写出'}确定性规则/流程投影：${outputPath}`);
  console.log('ℹ 已保留 Clause、alignments、Core 选择和人工审核元数据；本脚本不推断这些语义。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${basename(process.argv[1])}: ${error.message}`); process.exitCode = 1; }
}
