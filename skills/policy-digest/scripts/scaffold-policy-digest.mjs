#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderPolicyDigestMarkdown } from './generate-policy-digest-md.mjs';
import { projectDeterministicCandidates } from './project-policy-digest-candidates.mjs';

const SAMPLE_EXCERPT = '本制度适用于待解构事项，责任部门应按规定完成申请、审核和结果归档。';

function review() {
  return { status: 'proposed', pool: 'full', reviewer: null, timestamp: null };
}

function confidence() {
  return { evidence: 0.25, boundary: 0.25, parent: 0.25, granularity: 0.25, overall: 0.25 };
}

function source(docId) {
  return { doc_id: docId, block_id: 'BLOCK-001', block_path: 'starter/clause-1', clause_ref: '示例条款', page_hint: 1, excerpt: SAMPLE_EXCERPT };
}

function candidateSource(docId) {
  return { docId, blockId: 'BLOCK-001', blockPath: 'starter/clause-1', excerpt: SAMPLE_EXCERPT };
}

function element(docId, elementId, level, rdfType, name, parentRef, owningProcessRef, extras = {}) {
  return {
    element_id: elementId,
    level,
    rdf_type: rdfType,
    name,
    parent_ref: parentRef,
    owning_process_ref: owningProcessRef,
    objective_refs: extras.objective_refs || [],
    owner_role_refs: [],
    input_artifact_refs: extras.input_artifact_refs || [],
    output_artifact_refs: extras.output_artifact_refs || [],
    entry_conditions: extras.entry_conditions || [],
    exit_conditions: extras.exit_conditions || [],
    decomposition_basis: 'inferred_structure',
    hierarchy_status: 'resolved',
    hierarchy_confidence: confidence(),
    alternative_levels: [],
    source: source(docId),
    review: review(),
    candidate_refs: ['CAND-001'],
  };
}

export function buildScaffold({ caseId, docId, tenant = null, title = '待解构制度', generatedAt = new Date().toISOString() }) {
  const src = source(docId);
  const processElements = [
    element(docId, 'CAT-001', 'L1', 'proc:ProcessCategory', '待确认业务域', null, null),
    element(docId, 'GROUP-001', 'L2', 'proc:ProcessGroup', '待确认流程组', 'CAT-001', null),
    element(docId, 'PROC-001', 'L3', 'proc:Process', '待确认流程', 'GROUP-001', 'PROC-001', {
      objective_refs: ['OBJ-001'], output_artifact_refs: ['ART-001'], entry_conditions: ['收到待处理事项'], exit_conditions: ['形成并归档处理结果'],
    }),
    element(docId, 'ACT-001', 'L4', 'proc:ProcessActivity', '待确认活动', 'PROC-001', 'PROC-001'),
  ];
  const digest = {
    digest_schema_version: '0.2.0',
    digest_id: `PD-${docId}-STARTER`,
    case_id: caseId,
    status: 'draft',
    generated_at: generatedAt,
    source_index_ref: 'source-index.json',
    document_identity: {
      doc_id: docId, title, doc_number: null, version: null, policy_level: null, drafting_department: null,
      owning_department: null, approving_authority: null, publication_date: null, effective_date: null,
      applicability_summary: null, higher_authorities: [], related_documents: [], superseded_documents: [],
      attachments: [], interpretation_authority: null, validity: 'pending_confirmation', source: src,
    },
    scope: { subjects: [], scenarios: [], matters: [], triggers: [], exclusions: [] },
    rules: [{
      rule_id: 'RULE-001', source: src, original_text: SAMPLE_EXCERPT, disposition: 'mandatory', clause_types: ['mandatory'],
      applicable_subjects: [], trigger: null, requirement: '责任部门应按规定完成申请、审核和结果归档。', responsible_roles: ['责任部门'],
      parameters: [], evidence_requirements: ['归档结果'], exception_note: null, operationalized_by: ['ACT-001'],
      semantic_confidence: 0.25, uncertainty_reason: '脚手架占位内容，必须替换并复核。', review: review(), candidate_refs: ['CAND-001'],
    }],
    process_elements: processElements,
    process_objectives: [{
      objective_id: 'OBJ-001', statement: '完成事项处理并形成可追溯结果。', parent_objective_ref: null,
      element_refs: ['PROC-001'], assertion_basis: 'analysis', source: src, review: review(), candidate_refs: ['CAND-001'],
    }],
    artifacts: [{
      artifact_id: 'ART-001', name: '事项处理结果', artifact_type: 'document', produced_by: ['PROC-001'], consumed_by: [],
      required_fields: [], retention_requirement: null, source: src, review: review(), candidate_refs: ['CAND-001'],
    }],
    flow_edges: [],
    role_assignments: [
      { assignment_id: 'RACI-PROC-001-A', element_ref: 'PROC-001', role: '待确认流程负责人', raci: 'A', authorization_basis: null, source: src, review: review() },
      { assignment_id: 'RACI-PROC-001-R', element_ref: 'PROC-001', role: '待确认执行角色', raci: 'R', authorization_basis: null, source: src, review: review() },
      { assignment_id: 'RACI-ACT-001-R', element_ref: 'ACT-001', role: '待确认执行角色', raci: 'R', authorization_basis: null, source: src, review: review() },
    ],
    risks: [], controls: [],
    issues: [{
      issue_id: 'ISSUE-SCAFFOLD-001', type: 'scaffold_placeholder', related_refs: ['CAT-001', 'GROUP-001', 'PROC-001', 'ACT-001'],
      description: '成果包仍包含脚手架占位内容。', impact: '当前内容不代表原制度，不得入库。', risk_level: 'high',
      recommendation: '替换示例 parsed block，按 Pass A–G 重建 digest，再机械生成下游产物。', confirmation_owner: null, blocking: true, source: src,
    }],
    graph: { lanes: [], nodes: [], edges: [] },
    pending_confirmations: [{
      confirmation_id: 'CONF-SCAFFOLD-001', question: '请确认制度原文、流程边界、角色和输出 Artifact。',
      impact: '未完成前不得进入 ready_for_ingestion。', source: src, suggested_owner: null, blocking: true,
    }],
    ontology_projection: {
      candidates_schema_version: '0.3.0', candidates_ref: 'candidates.json', parsed_schema_version: '0.1.0',
      parsed_ref: 'normalized.parsed.json', tenant, core_versions: { process: '0.4.0' },
      hierarchy_mapping: { mode: 'candidates_extension', extension_prefix: 'efio', serialization_policy: 'PENDING_CORE_ALIGNMENT' },
    },
  };
  const candidateSeed = {
    candidatesSchemaVersion: '0.3.0',
    document: { docId, parsedRef: { path: 'normalized.parsed.json', parsedSchemaVersion: '0.1.0' }, ...(tenant ? { tenant } : {}) },
    coreVersions: { process: '0.4.0' },
    candidates: [{
      candidateId: 'CAND-001', sourceBlock: candidateSource(docId), disposition: 'mandatory', clauseType: ['mandatory'],
      confidence: 0.25, coreVersion: '0.4.0',
      produces: [{ localId: 'RULE-001-CLAUSE', rdfType: 'policy:Clause', label: '示例条款', clauseNumber: '示例条款', clauseText: SAMPLE_EXCERPT }],
      reviewPool: 'full',
      review: { status: 'proposed', reviewer: null, timestamp: null },
    }],
  };
  const candidates = projectDeterministicCandidates(digest, candidateSeed);
  const parsed = {
    parsedSchemaVersion: '0.1.0',
    document: { docId, rawRef: { path: 'raw/REPLACE-WITH-SOURCE', sha256: '0'.repeat(64) }, identity: { title } },
    blocks: [{
      blockId: 'BLOCK-001', blockType: 'clause', text: SAMPLE_EXCERPT,
      anchor: { blockPath: 'starter/clause-1', charStart: 0, charEnd: SAMPLE_EXCERPT.length, pageHint: 1, excerpt: SAMPLE_EXCERPT },
      clauseRef: { number: '示例条款', index: 1 }, parseConfidence: 0.25, needsVerification: true,
    }],
    coverage: {
      clauseSequence: { declared: [1], detected: [1], gaps: [], status: 'OK' },
      blockCount: { estimated: 1, parsed: 1 }, tocCrosscheck: { hasToc: false, matched: null, orphanSections: [] },
      unrecognizedRegions: [], parser: { engine: 'policy-digest-scaffold', model: null, timestamp: generatedAt },
    },
  };
  const sourceIndex = {
    schema_version: 'starter-0.1.0', doc_id: docId,
    warning: '脚手架占位来源，必须替换为真实文件路径、哈希、解析版本和覆盖信息。',
    sources: [{ path: 'raw/REPLACE-WITH-SOURCE', sha256: '0'.repeat(64), role: 'main', acquired_at: generatedAt }],
  };
  return { parsed, digest, candidates, sourceIndex, markdown: renderPolicyDigestMarkdown(digest) };
}

export function generateScaffold(outputDirectory, options) {
  const directory = resolve(outputDirectory);
  if (existsSync(directory) && !options.force) throw new Error(`目标目录已存在：${directory}；如需覆盖脚手架文件请添加 --force`);
  mkdirSync(directory, { recursive: true });
  const data = buildScaffold(options);
  writeFileSync(join(directory, 'normalized.parsed.json'), `${JSON.stringify(data.parsed, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, 'digest.json'), `${JSON.stringify(data.digest, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, 'candidates.json'), `${JSON.stringify(data.candidates, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, 'source-index.json'), `${JSON.stringify(data.sourceIndex, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, 'digest.md'), data.markdown, 'utf8');
  return { directory, ...data };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function runCli() {
  const args = process.argv.slice(2);
  const output = args[0]?.startsWith('--') ? null : args[0];
  const caseId = option(args, '--case-id');
  const docId = option(args, '--doc-id');
  if (!output || !caseId || !docId) throw new Error('用法: node scaffold-policy-digest.mjs <output-directory> --case-id <CASE-ID> --doc-id <DOC-ID> [--tenant <tenant>] [--title <title>] [--force]');
  const result = generateScaffold(output, { caseId, docId, tenant: option(args, '--tenant'), title: option(args, '--title') || '待解构制度', force: args.includes('--force') });
  console.log(`✓ 已生成可通过结构校验的 Policy Digest 起步包：${result.directory}`);
  console.log('⚠ 包内均为占位内容且含 blocking 项；请先替换真实 parsed 来源，再按 Pass A–G 增量构建。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
