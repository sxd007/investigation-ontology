#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDigest } from './migrate-policy-digest-0.1-to-0.2.mjs';
import { generateExplanation, renderExplanationHtml } from './generate-policy-digest-explanation.mjs';
import { renderPolicyDigestMarkdown } from './generate-policy-digest-md.mjs';
import { canonicalJson, createCandidateSeed, projectDeterministicCandidates, syncMissingCandidateSeeds } from './project-policy-digest-candidates.mjs';
import { generateScaffold } from './scaffold-policy-digest.mjs';
import { collectDiagnosticHints, summarizeIssues, validatePackage } from './validate-policy-digest.mjs';

const root = mkdtempSync(join(tmpdir(), 'policy-digest-validation-'));
const projectorScript = join(dirname(fileURLToPath(import.meta.url)), 'project-policy-digest-candidates.mjs');
const markdownScript = join(dirname(fileURLToPath(import.meta.url)), 'generate-policy-digest-md.mjs');
const source = { doc_id: 'ACME-SUPPLIER-001', block_id: 'b-001', block_path: 'ch1/art1', clause_ref: '第一条', page_hint: 1, excerpt: '供应商管理包括筛选、认证和定期评估' };
const review = () => ({ status: 'proposed', pool: 'full', reviewer: null, timestamp: null });
const confidence = () => ({ evidence: 0.95, boundary: 0.95, parent: 0.95, granularity: 0.95, overall: 0.95 });
const candidateId = 'ACME-SUPPLIER-001-C001';
const hierarchy = [
  ['CAT-PROCUREMENT', 'L1', 'proc:ProcessCategory', '采购管理', null, null],
  ['PG-SUPPLIER', 'L2', 'proc:ProcessGroup', '供应商管理', 'CAT-PROCUREMENT', null],
  ['PROC-SCREENING', 'L3', 'proc:Process', '供应商筛选', 'PG-SUPPLIER', 'PROC-SCREENING'],
  ['ACT-COLLECT', 'L4', 'proc:ProcessActivity', '收集候选供应商', 'PROC-SCREENING', 'PROC-SCREENING'],
  ['ACT-PRESCREEN', 'L4', 'proc:ProcessActivity', '初步资格筛查', 'PROC-SCREENING', 'PROC-SCREENING'],
  ['PROC-CERTIFICATION', 'L3', 'proc:Process', '供应商认证', 'PG-SUPPLIER', 'PROC-CERTIFICATION'],
  ['ACT-DUE-DILIGENCE', 'L4', 'proc:ProcessActivity', '供应商尽调', 'PROC-CERTIFICATION', 'PROC-CERTIFICATION'],
  ['ACT-CERT-APPROVAL', 'L4', 'proc:ProcessActivity', '认证审批', 'PROC-CERTIFICATION', 'PROC-CERTIFICATION'],
];

function parsed() {
  return {
    parsedSchemaVersion: '0.1.0',
    document: { docId: source.doc_id, rawRef: { path: 'raw/policy.pdf', sha256: 'a'.repeat(64) }, identity: { docNumber: source.doc_id, title: '供应商管理制度' } },
    blocks: [{ blockId: source.block_id, blockType: 'clause', text: `第一条 ${source.excerpt}。`, anchor: { blockPath: source.block_path, charStart: 0, charEnd: 25, pageHint: 1, excerpt: source.excerpt }, clauseRef: { number: '第一条', index: 1 }, parseConfidence: 0.99, needsVerification: false }],
    coverage: { clauseSequence: { declared: [1], detected: [1], gaps: [], status: 'OK' }, blockCount: { estimated: 1, parsed: 1 }, tocCrosscheck: { hasToc: false, matched: null, orphanSections: [] }, unrecognizedRegions: [], parser: { engine: 'test', model: null, timestamp: '2026-08-26T00:00:00Z' } },
  };
}

function hierarchyProperties(level, parent, owner, predecessor = null) {
  return { 'efio:hierarchyLevel': level, ...(parent ? { 'efio:parentElement': parent } : {}), ...(owner ? { 'efio:owningProcess': owner } : {}), 'efio:mappingStatus': 'PENDING_CORE_ALIGNMENT', ...(predecessor ? { precededByActivity: predecessor } : {}) };
}

function candidates() {
  const proposals = hierarchy.map(([localId, level, rdfType, label, parent, owner]) => ({
    localId, rdfType, label,
    properties: hierarchyProperties(level, parent, owner, localId === 'ACT-PRESCREEN' ? 'ACT-COLLECT' : localId === 'ACT-CERT-APPROVAL' ? 'ACT-DUE-DILIGENCE' : null),
  }));
  Object.assign(proposals.find((item) => item.localId === 'PROC-SCREENING').properties, { hasObjective: 'OBJ-SCREENING', hasOutput: 'ART-CANDIDATE-LIST' });
  Object.assign(proposals.find((item) => item.localId === 'PROC-CERTIFICATION').properties, { hasObjective: 'OBJ-CERTIFICATION', hasInput: 'ART-CANDIDATE-LIST', hasOutput: 'ART-CERT-DECISION' });
  proposals.push(
    { localId: 'R-001-OBLIGATION', rdfType: 'policy:Obligation', statement: '执行筛选和认证', obligationStatus: 'DRAFT', applicability: 'UNASSESSED' },
    { localId: 'OBJ-SCREENING', rdfType: 'proc:ProcessObjective', label: '形成候选供应商清单' },
    { localId: 'OBJ-CERTIFICATION', rdfType: 'proc:ProcessObjective', label: '确认供应商资格' },
    { localId: 'ART-CANDIDATE-LIST', rdfType: 'proc:Artifact', label: '候选供应商清单' },
    { localId: 'ART-CERT-DECISION', rdfType: 'proc:Artifact', label: '供应商认证决定' },
  );
  return {
    candidatesSchemaVersion: '0.3.0',
    document: { docId: source.doc_id, parsedRef: { path: 'normalized.parsed.json', parsedSchemaVersion: '0.1.0' }, tenant: 'acme' },
    coreVersions: { process: '0.4.0' },
    candidates: [{ candidateId, sourceBlock: { docId: source.doc_id, blockId: source.block_id, blockPath: source.block_path, excerpt: source.excerpt }, disposition: 'process-step', clauseType: ['process-step'], confidence: 0.95, coreVersion: '0.4.0', produces: proposals, reviewPool: 'full', review: { status: 'proposed', reviewer: null, timestamp: null } }],
  };
}

function element(tuple) {
  const [element_id, level, rdf_type, name, parent_ref, owning_process_ref] = tuple;
  return {
    element_id, level, rdf_type, name, parent_ref, owning_process_ref,
    objective_refs: element_id === 'PROC-SCREENING' ? ['OBJ-SCREENING'] : element_id === 'PROC-CERTIFICATION' ? ['OBJ-CERTIFICATION'] : [],
    owner_role_refs: [], input_artifact_refs: element_id === 'PROC-CERTIFICATION' ? ['ART-CANDIDATE-LIST'] : [],
    output_artifact_refs: element_id === 'PROC-SCREENING' ? ['ART-CANDIDATE-LIST'] : element_id === 'PROC-CERTIFICATION' ? ['ART-CERT-DECISION'] : [],
    entry_conditions: level === 'L3' ? ['满足启动条件'] : [], exit_conditions: level === 'L3' ? ['形成流程结果'] : [],
    decomposition_basis: 'explicit_text', hierarchy_status: 'resolved', hierarchy_confidence: confidence(), alternative_levels: [], source, review: review(), candidate_refs: [candidateId],
  };
}

function digest() {
  const processElements = hierarchy.map(element);
  const roleAssignments = [];
  for (const item of processElements.filter((value) => ['L3', 'L4'].includes(value.level))) {
    roleAssignments.push({ assignment_id: `RA-${item.element_id}-R`, element_ref: item.element_id, role: `${item.name}执行人`, raci: 'R', authorization_basis: null, source, review: review() });
    if (item.level === 'L3') roleAssignments.push({ assignment_id: `RA-${item.element_id}-A`, element_ref: item.element_id, role: `${item.name}负责人`, raci: 'A', authorization_basis: null, source, review: review() });
  }
  return {
    digest_schema_version: '0.2.0', digest_id: 'PD-ACME-SUPPLIER-001-v1', case_id: 'CASE-2026-001', status: 'review_required', generated_at: '2026-08-26T00:00:00Z', source_index_ref: 'source-index.json',
    document_identity: { doc_id: source.doc_id, title: '供应商管理制度', doc_number: source.doc_id, version: null, policy_level: null, drafting_department: null, owning_department: '采购部', approving_authority: null, publication_date: null, effective_date: null, applicability_summary: null, higher_authorities: [], related_documents: [], superseded_documents: [], attachments: [], interpretation_authority: null, validity: 'pending_confirmation', source },
    scope: { subjects: ['采购部'], scenarios: ['供应商管理'], matters: ['筛选', '认证'], triggers: ['供应商准入需求'], exclusions: [] },
    rules: [{ rule_id: 'R-001', source, original_text: source.excerpt, disposition: 'process-step', clause_types: ['process-step'], applicable_subjects: ['采购部'], trigger: '供应商准入需求', requirement: '执行筛选和认证', responsible_roles: ['采购部'], parameters: [], evidence_requirements: [], exception_note: null, operationalized_by: ['PROC-SCREENING', 'PROC-CERTIFICATION'], semantic_confidence: 0.95, uncertainty_reason: null, review: review(), candidate_refs: [candidateId] }],
    process_elements: processElements,
    process_objectives: [
      { objective_id: 'OBJ-SCREENING', statement: '形成候选供应商清单', parent_objective_ref: null, element_refs: ['PROC-SCREENING'], assertion_basis: 'explicit_text', source, review: review(), candidate_refs: [candidateId] },
      { objective_id: 'OBJ-CERTIFICATION', statement: '确认供应商资格', parent_objective_ref: null, element_refs: ['PROC-CERTIFICATION'], assertion_basis: 'explicit_text', source, review: review(), candidate_refs: [candidateId] },
    ],
    artifacts: [
      { artifact_id: 'ART-CANDIDATE-LIST', name: '候选供应商清单', artifact_type: 'document', produced_by: ['PROC-SCREENING'], consumed_by: ['PROC-CERTIFICATION'], required_fields: [], retention_requirement: null, source, review: review(), candidate_refs: [candidateId] },
      { artifact_id: 'ART-CERT-DECISION', name: '供应商认证决定', artifact_type: 'decision', produced_by: ['PROC-CERTIFICATION'], consumed_by: [], required_fields: [], retention_requirement: null, source, review: review(), candidate_refs: [candidateId] },
    ],
    flow_edges: [
      { edge_id: 'EDGE-SCREENING-001', process_ref: 'PROC-SCREENING', from_ref: 'ACT-COLLECT', to_ref: 'ACT-PRESCREEN', edge_kind: 'main', condition: null, condition_parameters: [], source, review: review(), candidate_refs: [candidateId] },
      { edge_id: 'EDGE-CERT-001', process_ref: 'PROC-CERTIFICATION', from_ref: 'ACT-DUE-DILIGENCE', to_ref: 'ACT-CERT-APPROVAL', edge_kind: 'main', condition: null, condition_parameters: [], source, review: review(), candidate_refs: [candidateId] },
    ],
    role_assignments: roleAssignments, risks: [], controls: [], issues: [], graph: { lanes: [], nodes: [], edges: [] }, pending_confirmations: [],
    ontology_projection: { candidates_schema_version: '0.3.0', candidates_ref: 'candidates.json', parsed_schema_version: '0.1.0', parsed_ref: 'normalized.parsed.json', tenant: 'acme', core_versions: { process: '0.4.0' }, hierarchy_mapping: { mode: 'candidates_extension', extension_prefix: 'efio', serialization_policy: 'PENDING_CORE_ALIGNMENT' } },
  };
}

function markdown(data) {
  const ids = [...data.rules.map((x) => x.rule_id), ...data.process_elements.map((x) => x.element_id), ...data.process_objectives.map((x) => x.objective_id), ...data.artifacts.map((x) => x.artifact_id), ...data.flow_edges.map((x) => x.edge_id), ...data.role_assignments.map((x) => x.assignment_id)].join(' ');
  return `# 供应商管理制度解构\n\n## 文件身份表\n${source.doc_id}\n\n## 核心规则表\nR-001\n\n## 流程节点表\n${ids}\n\n## RACI 责任矩阵\n${ids}\n\n## 风险控制矩阵\n\n## 制度问题及优化建议清单\n\n## 端到端泳道流程图\n`;
}

function writePackage(name, digestData, candidateData = candidates(), parsedData = parsed(), sourceIndexData = {}) {
  const directory = join(root, name); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'normalized.parsed.json'), JSON.stringify(parsedData, null, 2));
  writeFileSync(join(directory, 'digest.json'), JSON.stringify(digestData, null, 2));
  writeFileSync(join(directory, 'candidates.json'), JSON.stringify(candidateData, null, 2));
  writeFileSync(join(directory, 'source-index.json'), JSON.stringify(sourceIndexData, null, 2)); writeFileSync(join(directory, 'digest.md'), markdown(digestData));
  return directory;
}

function runProjector(args) {
  return spawnSync(process.execPath, [projectorScript, ...args], { encoding: 'utf8' });
}

function runMarkdownGenerator(args) {
  return spawnSync(process.execPath, [markdownScript, ...args], { encoding: 'utf8' });
}

try {
  const scaffoldDirectory = join(root, 'scaffold');
  generateScaffold(scaffoldDirectory, { caseId: 'CASE-STARTER', docId: 'DOC-STARTER', tenant: 'acme' });
  const scaffoldValidation = validatePackage(scaffoldDirectory);
  assert.deepEqual(scaffoldValidation.issues.filter((item) => item.severity === 'ERROR'), [], JSON.stringify(scaffoldValidation.issues, null, 2));
  assert.equal(scaffoldValidation.summary.errors, 0);
  assert.ok(readFileSync(join(scaffoldDirectory, 'digest.json'), 'utf8').includes('ISSUE-SCAFFOLD-001'));
  assert.ok(readFileSync(join(scaffoldDirectory, 'normalized.parsed.json'), 'utf8').includes('"parsedSchemaVersion": "0.1.0"'));
  const legacyParsed = { schema_version: '0.1.0', document: { doc_id: 'DOC-OLD', raw_ref: {} }, blocks: [{ block_id: 'B-1', block_type: 'clause', anchor: { block_path: 'ch1', char_start: 0, char_end: 1 } }] };
  const namingHints = collectDiagnosticHints(legacyParsed);
  assert.equal(namingHints[0].code, 'parsed_field_naming_mismatch');
  assert.ok(namingHints[0].message.includes('schema_version → parsedSchemaVersion'));
  assert.ok(namingHints[0].message.includes('block_id → blockId'));

  const validDigest = digest();
  const validDirectory = writePackage('valid', validDigest, projectDeterministicCandidates(validDigest, candidates()));
  const valid = validatePackage(validDirectory);
  assert.deepEqual(valid.issues.filter((item) => item.severity === 'ERROR'), [], JSON.stringify(valid.issues, null, 2));
  const initialized = projectDeterministicCandidates(validDigest, createCandidateSeed(validDigest));
  assert.equal(initialized.candidates.length, 1);
  assert.ok(initialized.candidates[0].produces.some((item) => item.localId === 'R-001-OBLIGATION'));
  const initializedDirectory = writePackage('initialized', validDigest, initialized);
  assert.deepEqual(validatePackage(initializedDirectory).issues.filter((item) => item.severity === 'ERROR'), []);
  const driftedValidationCandidates = structuredClone(initialized);
  driftedValidationCandidates.candidates[0].produces.find((item) => item.localId === 'R-001-OBLIGATION').obligationStatus = 'EFFECTIVE';
  const driftedValidationDirectory = writePackage('projection-drift', validDigest, driftedValidationCandidates);
  assert.ok(validatePackage(driftedValidationDirectory).issues.some((item) => item.code === 'candidate_projection_drift'));
  const missingL3ResponsibleDigest = structuredClone(validDigest);
  missingL3ResponsibleDigest.role_assignments = missingL3ResponsibleDigest.role_assignments.filter((item) => !(item.element_ref === 'PROC-SCREENING' && item.raci === 'R'));
  const missingL3ResponsibleCandidates = projectDeterministicCandidates(missingL3ResponsibleDigest, initialized);
  const missingL3ResponsibleDirectory = writePackage('missing-l3-responsible', missingL3ResponsibleDigest, missingL3ResponsibleCandidates);
  assert.ok(validatePackage(missingL3ResponsibleDirectory).issues.some((item) => item.code === 'raci_responsible_missing'));

  const coverageParsed = parsed();
  coverageParsed.blocks.push(
    { blockId: 'b-900', blockType: 'clause', text: '第九十条 本制度由采购部负责解释。', anchor: { blockPath: 'ch9/art90', charStart: 100, charEnd: 118, pageHint: 3, excerpt: '本制度由采购部负责解释' }, clauseRef: { number: '第九十条', index: 90 }, parseConfidence: 0.99, needsVerification: false },
    { blockId: 'b-h1', blockType: 'heading', text: '第一章 总则', anchor: { blockPath: 'ch1', charStart: 0, charEnd: 5, pageHint: 1, excerpt: '第一章 总则' }, headingLevel: 1, parseConfidence: 0.99, needsVerification: false },
  );
  coverageParsed.coverage.blockCount = { estimated: 3, parsed: 3 };
  const unaccountedDirectory = writePackage('coverage-unaccounted', validDigest, initialized, coverageParsed);
  const unaccountedIssues = validatePackage(unaccountedDirectory).issues.filter((item) => item.code === 'source_block_unaccounted');
  assert.equal(unaccountedIssues.length, 1);
  assert.equal(unaccountedIssues[0].severity, 'WARN');
  assert.ok(unaccountedIssues[0].message.includes('b-900') && unaccountedIssues[0].message.includes('负责解释'));
  const readyDigest = structuredClone(validDigest);
  readyDigest.status = 'ready_for_ingestion';
  const readyDirectory = writePackage('coverage-ready', readyDigest, initialized, coverageParsed);
  const readyUnaccounted = validatePackage(readyDirectory).issues.filter((item) => item.code === 'source_block_unaccounted');
  assert.equal(readyUnaccounted.length, 1);
  assert.equal(readyUnaccounted[0].severity, 'ERROR');
  const skippedDirectory = writePackage('coverage-skipped', validDigest, initialized, coverageParsed, { skipped_blocks: [{ block_id: 'b-900', reason: '解释权归属条款，不产生流程规则' }] });
  assert.ok(!validatePackage(skippedDirectory).issues.some((item) => item.code === 'source_block_unaccounted'));
  const badSkippedDirectory = writePackage('coverage-bad-skipped', validDigest, initialized, coverageParsed, { skipped_blocks: [{ block_id: 'b-999', reason: '' }, { block_id: source.block_id, reason: '误声明已引用块' }] });
  const badSkippedCodes = validatePackage(badSkippedDirectory).issues;
  assert.ok(badSkippedCodes.some((item) => item.code === 'skipped_block_unknown'));
  assert.ok(badSkippedCodes.some((item) => item.code === 'skipped_block_reason_missing'));
  assert.ok(badSkippedCodes.some((item) => item.code === 'skipped_block_referenced' && item.severity === 'WARN'));

  const generatedMarkdown = renderPolicyDigestMarkdown(validDigest);
  for (const id of ['R-001', 'PROC-SCREENING', 'OBJ-SCREENING', 'ART-CANDIDATE-LIST', 'EDGE-SCREENING-001', 'RA-PROC-SCREENING-R']) assert.ok(generatedMarkdown.includes(id));
  const markdownDirectory = writePackage('markdown-cli', validDigest, initialized);
  const markdownDefault = runMarkdownGenerator([markdownDirectory]);
  assert.equal(markdownDefault.status, 0, markdownDefault.stderr);
  assert.equal(readFileSync(join(markdownDirectory, 'digest.generated.md'), 'utf8'), generatedMarkdown);
  assert.notEqual(runMarkdownGenerator([markdownDirectory, '--check']).status, 0);
  const markdownInPlace = runMarkdownGenerator([markdownDirectory, '--in-place']);
  assert.equal(markdownInPlace.status, 0, markdownInPlace.stderr);
  assert.ok(readFileSync(join(markdownDirectory, 'digest.before-generation.md'), 'utf8').includes('# 供应商管理制度解构'));
  assert.equal(runMarkdownGenerator([markdownDirectory, '--check']).status, 0);
  assert.notEqual(runMarkdownGenerator([markdownDirectory, '--output', join(markdownDirectory, 'digest.md')]).status, 0);
  writeFileSync(join(markdownDirectory, 'digest.md'), `${generatedMarkdown}\n人工漂移\n`);
  assert.notEqual(runMarkdownGenerator([markdownDirectory, '--check']).status, 0);
  assert.equal(runMarkdownGenerator([markdownDirectory, '--in-place']).status, 0);
  assert.equal(runMarkdownGenerator([markdownDirectory, '--check']).status, 0);

  const cliInitDirectory = writePackage('cli-init', validDigest);
  rmSync(join(cliInitDirectory, 'candidates.json'));
  const cliInit = runProjector([cliInitDirectory, '--init', '--in-place']);
  assert.equal(cliInit.status, 0, cliInit.stderr);
  assert.ok(readFileSync(join(cliInitDirectory, 'candidates.json'), 'utf8').includes('R-001-OBLIGATION'));
  assert.equal(runProjector([cliInitDirectory, '--check']).status, 0);
  const driftedCandidates = JSON.parse(readFileSync(join(cliInitDirectory, 'candidates.json'), 'utf8'));
  driftedCandidates.candidates[0].confidence = 0.01;
  writeFileSync(join(cliInitDirectory, 'candidates.json'), canonicalJson(driftedCandidates));
  const driftCheck = runProjector([cliInitDirectory, '--check']);
  assert.equal(driftCheck.status, 1);
  assert.ok(driftCheck.stderr.includes('不一致'));
  const inPlace = runProjector([cliInitDirectory, '--in-place']);
  assert.equal(inPlace.status, 0, inPlace.stderr);
  assert.ok(readFileSync(join(cliInitDirectory, 'candidates.before-projection.json'), 'utf8').includes('0.01'));
  assert.equal(runProjector([cliInitDirectory, '--check']).status, 0);

  const cliOutputDirectory = writePackage('cli-output', validDigest);
  const explicitOutput = join(cliOutputDirectory, 'review', 'projected.json');
  mkdirSync(dirname(explicitOutput), { recursive: true });
  const cliOutput = runProjector([cliOutputDirectory, '--output', explicitOutput]);
  assert.equal(cliOutput.status, 0, cliOutput.stderr);
  assert.ok(readFileSync(explicitOutput, 'utf8').includes('R-001-OBLIGATION'));
  const existingCandidatesBeforePreview = readFileSync(join(cliOutputDirectory, 'candidates.json'), 'utf8');
  const initPreviewPath = join(cliOutputDirectory, 'review', 'initialized.json');
  const initPreview = runProjector([cliOutputDirectory, '--init', '--output', initPreviewPath]);
  assert.equal(initPreview.status, 0, initPreview.stderr);
  assert.ok(readFileSync(initPreviewPath, 'utf8').includes('R-001-OBLIGATION'));
  assert.equal(readFileSync(join(cliOutputDirectory, 'candidates.json'), 'utf8'), existingCandidatesBeforePreview);
  assert.notEqual(runProjector([cliOutputDirectory, '--in-place', '--output', explicitOutput]).status, 0);
  assert.notEqual(runProjector([cliOutputDirectory, '--init']).status, 0);
  assert.notEqual(runProjector([cliOutputDirectory, '--init', '--output', join(cliOutputDirectory, 'candidates.json')]).status, 0);
  assert.notEqual(runProjector([cliOutputDirectory, '--output', join(cliOutputDirectory, 'candidates.json')]).status, 0);
  assert.notEqual(runProjector([cliOutputDirectory, '--core-version', '0.4.0']).status, 0);
  const incrementalDigest = structuredClone(validDigest);
  incrementalDigest.ontology_projection.core_versions = { policy: '0.1.0', process: '0.4.0' };
  incrementalDigest.rules.push({
    ...structuredClone(incrementalDigest.rules[0]),
    rule_id: 'R-002',
    original_text: '供应商认证决定应形成记录',
    requirement: '供应商认证决定应形成记录',
    candidate_refs: ['ACME-SUPPLIER-001-C002'],
  });
  const incrementalSeed = projectDeterministicCandidates(validDigest, candidates());
  incrementalSeed.candidates[0].produces.push({ localId: 'R-001-CLAUSE', rdfType: 'policy:Clause', clauseNumber: '第一条', clauseText: source.excerpt });
  incrementalSeed.candidates[0].alignments = [{ kind: 'derivedFrom', targetRef: { docId: source.doc_id, blockPath: source.block_path, excerpt: source.excerpt } }];
  const incrementalDirectory = writePackage('incremental-candidate-sync', incrementalDigest, incrementalSeed);
  const incrementalPreviewPath = join(incrementalDirectory, 'review', 'projected.json');
  mkdirSync(dirname(incrementalPreviewPath), { recursive: true });
  assert.notEqual(runProjector([incrementalDirectory]).status, 0);
  const incrementalPreview = runProjector([incrementalDirectory, '--sync-missing-candidates', '--output', incrementalPreviewPath]);
  assert.equal(incrementalPreview.status, 0, incrementalPreview.stderr);
  const incrementalProjected = JSON.parse(readFileSync(incrementalPreviewPath, 'utf8'));
  const addedCandidate = incrementalProjected.candidates.find((item) => item.candidateId === 'ACME-SUPPLIER-001-C002');
  assert.equal(addedCandidate.coreVersion, '0.1.0');
  assert.ok(addedCandidate.produces.some((item) => item.localId === 'R-002-CLAUSE' && item.rdfType === 'policy:Clause'));
  assert.ok(addedCandidate.produces.some((item) => item.localId === 'R-002-OBLIGATION' && item.obligationStatus === 'DRAFT'));
  const preservedCandidate = incrementalProjected.candidates.find((item) => item.candidateId === candidateId);
  assert.deepEqual(preservedCandidate.alignments, incrementalSeed.candidates[0].alignments);
  assert.ok(preservedCandidate.produces.some((item) => item.localId === 'R-001-CLAUSE'));
  assert.equal(canonicalJson(syncMissingCandidateSeeds(incrementalDigest, incrementalProjected)), canonicalJson(incrementalProjected));
  const incrementalInPlace = runProjector([incrementalDirectory, '--sync-missing-candidates', '--in-place']);
  assert.equal(incrementalInPlace.status, 0, incrementalInPlace.stderr);
  assert.ok(!readFileSync(join(incrementalDirectory, 'candidates.before-projection.json'), 'utf8').includes('ACME-SUPPLIER-001-C002'));
  assert.equal(runProjector([incrementalDirectory, '--check']).status, 0);
  assert.deepEqual(validatePackage(incrementalDirectory).issues.filter((item) => item.severity === 'ERROR'), []);
  const processOnlyDigest = structuredClone(validDigest);
  processOnlyDigest.process_elements[0].candidate_refs = ['PROCESS-ONLY-CANDIDATE'];
  assert.throws(() => syncMissingCandidateSeeds(processOnlyDigest, candidates()), /process-only 或共享 Clause/);
  const sharedCandidateDigest = structuredClone(incrementalDigest);
  sharedCandidateDigest.rules.push({ ...structuredClone(sharedCandidateDigest.rules[1]), rule_id: 'R-003' });
  assert.throws(() => syncMissingCandidateSeeds(sharedCandidateDigest, incrementalSeed), /恰好关联一条 rule/);
  const clauseCollisionSeed = structuredClone(incrementalSeed);
  clauseCollisionSeed.candidates[0].produces.push({ localId: 'R-002-CLAUSE', rdfType: 'policy:Clause' });
  assert.throws(() => syncMissingCandidateSeeds(incrementalDigest, clauseCollisionSeed), /localId R-002-CLAUSE 已存在/);
  const seedWithRuleProposal = candidates();
  seedWithRuleProposal.candidates[0].produces.push({ localId: 'RULE-KEEP', rdfType: 'policy:Obligation', statement: '必须保留的规则投影' });
  seedWithRuleProposal.candidates[0].produces.find((item) => item.localId === 'PROC-SCREENING').properties['efio:hierarchyLevel'] = 'L5';
  seedWithRuleProposal.candidates[0].disposition = 'mandatory';
  seedWithRuleProposal.candidates[0].confidence = 0.1;
  seedWithRuleProposal.document.docId = 'STALE-DOC';
  seedWithRuleProposal.coreVersions = { process: '9.9.9' };
  const digestWithParameter = structuredClone(validDigest);
  digestWithParameter.rules[0].parameters = [{ parameter_type: 'duration', value: '5个工作日', value_number: 5, comparator: 'le', unit: '工作日' }];
  const projected = projectDeterministicCandidates(digestWithParameter, seedWithRuleProposal);
  const projectedCandidate = projected.candidates[0];
  assert.equal(projected.candidates[0].produces.find((item) => item.localId === 'PROC-SCREENING').properties['efio:hierarchyLevel'], 'L3');
  assert.ok(projectedCandidate.produces.some((item) => item.localId === 'RULE-KEEP'));
  assert.deepEqual(projectedCandidate.produces.find((item) => item.localId === 'R-001-OBLIGATION'), {
    localId: 'R-001-OBLIGATION', rdfType: 'policy:Obligation', statement: '执行筛选和认证', obligationStatus: 'DRAFT', applicability: 'UNASSESSED',
  });
  assert.deepEqual(projectedCandidate.parameters, [{ target: 'R-001-OBLIGATION', parameterType: 'duration', value: '5个工作日', valueNumber: 5, comparator: 'LE', unit: '工作日' }]);
  assert.equal(projectedCandidate.disposition, 'process-step');
  assert.equal(projectedCandidate.confidence, 0.95);
  assert.equal(projected.document.docId, source.doc_id);
  assert.deepEqual(projected.coreVersions, { process: '0.4.0' });
  assert.equal(canonicalJson(projectDeterministicCandidates(digestWithParameter, projected)), canonicalJson(projected));
  const malformedRuleParameter = structuredClone(validDigest);
  malformedRuleParameter.rules[0].parameters = [{ value: '5个工作日' }];
  assert.throws(() => projectDeterministicCandidates(malformedRuleParameter, candidates()), /rule R-001\.parameters\[0\].*parameterType/);
  const malformedEdgeParameter = structuredClone(validDigest);
  malformedEdgeParameter.flow_edges[0].edge_kind = 'conditional';
  malformedEdgeParameter.flow_edges[0].condition_parameters = [{ parameterType: 'threshold', value: 5 }];
  assert.throws(() => projectDeterministicCandidates(malformedEdgeParameter, candidates()), /flow edge EDGE-SCREENING-001\.condition_parameters\[0\].*value\(string\)/);
  const malformedParameterDirectory = writePackage('malformed-parameter', malformedRuleParameter);
  assert.ok(validatePackage(malformedParameterDirectory).issues.some((item) => item.code === 'parameter_shape_invalid' && item.location === 'digest/rules/0/parameters/0'));
  const mismatchedSourceDigest = structuredClone(validDigest);
  mismatchedSourceDigest.process_elements[0].source.doc_id = 'STALE-DOC';
  const sourceMismatchDirectory = writePackage('source-mismatch', mismatchedSourceDigest);
  assert.ok(validatePackage(sourceMismatchDirectory).issues.some((item) => item.code === 'source_doc_id_mismatch' && item.location === '$/process_elements/0/source/doc_id'));
  const multiCoreDigest = structuredClone(validDigest);
  multiCoreDigest.ontology_projection.core_versions = { policy: '0.1.0', process: '0.4.0' };
  assert.throws(() => createCandidateSeed(multiCoreDigest), /policy=0\.1\.0.*process=0\.4\.0/);
  assert.throws(() => createCandidateSeed(multiCoreDigest, '9.9.9'), /不在.*可选值/);
  const comparatorConflictDigest = structuredClone(validDigest);
  comparatorConflictDigest.rules[0].original_text = '超过 6 小时应升级审批';
  comparatorConflictDigest.rules[0].requirement = '超过 6 小时应升级审批';
  comparatorConflictDigest.rules[0].parameters = [{ parameterType: 'duration_threshold', value: '6', valueNumber: 6, comparator: 'GE', unit: '小时' }];
  const comparatorConflictCandidates = projectDeterministicCandidates(comparatorConflictDigest, candidates());
  const comparatorConflictDirectory = writePackage('comparator-conflict', comparatorConflictDigest, comparatorConflictCandidates);
  assert.ok(validatePackage(comparatorConflictDirectory).issues.some((item) => item.code === 'rule_comparator_conflict' && item.location.endsWith('/comparator')));
  const requirementConflictDigest = structuredClone(validDigest);
  requirementConflictDigest.rules[0].original_text = '700 元以上应升级审批';
  requirementConflictDigest.rules[0].requirement = '超过 700 元应升级审批';
  const requirementConflictCandidates = projectDeterministicCandidates(requirementConflictDigest, candidates());
  const requirementConflictDirectory = writePackage('requirement-comparator-conflict', requirementConflictDigest, requirementConflictCandidates);
  assert.ok(validatePackage(requirementConflictDirectory).issues.some((item) => item.code === 'rule_comparator_conflict' && item.location.endsWith('/requirement')));
  const consistentComparatorDigest = structuredClone(validDigest);
  consistentComparatorDigest.rules[0].original_text = '0–700 元（含 700 元）无需审批，700 元以上需要审批，比例不得超过 20%';
  consistentComparatorDigest.rules[0].requirement = '0–700 元（含）无需审批，700 元以上需要审批，比例不超过 20%';
  consistentComparatorDigest.rules[0].parameters = [
    { parameterType: 'amount_threshold', value: '700', valueNumber: 700, comparator: 'LE', unit: '元' },
    { parameterType: 'amount_threshold', value: '700', valueNumber: 700, comparator: 'GE', unit: '元' },
    { parameterType: 'ratio_limit', value: '20%', valueNumber: 0.2, comparator: 'LE', unit: '比例' },
  ];
  const consistentComparatorCandidates = projectDeterministicCandidates(consistentComparatorDigest, candidates());
  const consistentComparatorDirectory = writePackage('consistent-comparators', consistentComparatorDigest, consistentComparatorCandidates);
  assert.ok(!validatePackage(consistentComparatorDirectory).issues.some((item) => item.code === 'rule_comparator_conflict'));
  writeFileSync(join(validDirectory, 'candidates.json'), canonicalJson(projectDeterministicCandidates(validDigest, projected)));
  assert.deepEqual(validatePackage(validDirectory).issues.filter((item) => item.severity === 'ERROR'), []);
  const explanation = generateExplanation(validDirectory);
  const explanationHtml = readFileSync(explanation.outputPath, 'utf8');
  assert.ok(explanationHtml.includes('制度解构导览'));
  assert.ok(explanationHtml.includes('原文对照'));
  assert.ok(explanationHtml.includes('流程分层'));
  assert.ok(explanationHtml.includes('本体投影'));
  const browserScript = explanationHtml.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/)?.[1];
  assert.ok(browserScript, '应包含内嵌交互脚本');
  assert.doesNotThrow(() => new Function(browserScript), '内嵌交互脚本应可解析');
  assert.equal(explanation.model.counts.processes, 2);
  assert.equal(explanation.model.counts.candidates, 1);
  assert.ok(explanation.model.records.some((item) => item.kind === 'candidate' && item.id === candidateId));
  assert.ok(explanation.model.records.find((item) => item.id === candidateId).proposals.some((item) => item.local_id === 'PROC-SCREENING'));
  assert.ok(explanation.model.records.some((item) => item.id === 'RA-PROC-SCREENING-R'));
  assert.ok(explanation.model.source_blocks.some((item) => item.block_id === 'b-001'));
  assert.ok(!renderExplanationHtml({ ...explanation.model, meta: { ...explanation.model.meta, title: '</script><script>alert(1)</script>' } }).includes('</script><script>alert(1)</script>'));
  assert.ok(!explanationHtml.includes('__POLICY_DATA__'), '模板数据占位符应被替换');
  assert.ok(!explanationHtml.includes('__TITLE__'), '模板标题占位符应被替换');
  assert.ok(explanationHtml.includes('id="roles-matrix"') || explanationHtml.includes("id='roles-matrix'") || explanationHtml.includes('roles-matrix'), '应包含 RACI 矩阵容器');
  assert.ok(explanationHtml.includes('trace-matrix'), '应包含规则风控矩阵容器');
  assert.ok(explanationHtml.includes('全部展开') && explanationHtml.includes('全部折叠'), '应包含折叠控制');
  const coverageSkippedDirectory = writePackage('coverage-skipped-explanation', validDigest, initialized, coverageParsed, { skipped_blocks: [{ block_id: 'b-900', reason: '解释权归属条款，不产生流程规则' }] });
  const coverageExplanation = generateExplanation(coverageSkippedDirectory);
  const coverageByBlockId = new Map(coverageExplanation.model.source_blocks.map((item) => [item.block_id, item]));
  assert.equal(coverageByBlockId.get('b-001').coverage, 'referenced');
  assert.equal(coverageByBlockId.get('b-900').coverage, 'skipped');
  assert.equal(coverageByBlockId.get('b-h1').coverage, 'exempt');
  const coverageExplanationHtml = readFileSync(coverageExplanation.outputPath, 'utf8');
  assert.ok(coverageExplanationHtml.includes('已声明跳过'));
  const unaccountedExplanation = generateExplanation(unaccountedDirectory);
  assert.equal(unaccountedExplanation.model.source_blocks.find((item) => item.block_id === 'b-900').coverage, 'unaccounted');
  assert.ok(readFileSync(unaccountedExplanation.outputPath, 'utf8').includes('未被消化'));

  const invalidDigest = structuredClone(validDigest);
  invalidDigest.process_elements.find((x) => x.element_id === 'ACT-CERT-APPROVAL').owning_process_ref = 'PROC-SCREENING';
  invalidDigest.process_elements.find((x) => x.element_id === 'PROC-CERTIFICATION').hierarchy_confidence.overall = 0.99;
  invalidDigest.flow_edges.push({ ...invalidDigest.flow_edges[0], edge_id: 'EDGE-BAD-CROSS', process_ref: 'PROC-SCREENING', from_ref: 'ACT-COLLECT', to_ref: 'ACT-CERT-APPROVAL' });
  const invalidCodes = new Set(validatePackage(writePackage('invalid', invalidDigest)).issues.map((item) => item.code));
  assert.ok(invalidCodes.has('owning_process_invalid'));
  assert.ok(invalidCodes.has('hierarchy_confidence_not_conservative'));
  assert.ok(invalidCodes.has('flow_edge_cross_process'));
  const missingObligationCandidates = candidates();
  missingObligationCandidates.candidates[0].produces = missingObligationCandidates.candidates[0].produces.filter((item) => item.localId !== 'R-001-OBLIGATION');
  const missingObligationCodes = new Set(validatePackage(writePackage('missing-obligation', validDigest, missingObligationCandidates)).issues.map((item) => item.code));
  assert.ok(missingObligationCodes.has('candidate_rule_obligation_missing'));
  const missingCandidateRefDigest = structuredClone(validDigest);
  missingCandidateRefDigest.rules[0].candidate_refs = [];
  assert.ok(validatePackage(writePackage('missing-candidate-ref', missingCandidateRefDigest)).issues.some((item) => item.code === 'candidate_ref_cardinality'));
  const multipleCandidateRefsDigest = structuredClone(validDigest);
  multipleCandidateRefsDigest.flow_edges[0].candidate_refs = [candidateId, candidateId];
  assert.ok(validatePackage(writePackage('multiple-candidate-refs', multipleCandidateRefsDigest)).issues.some((item) => item.code === 'candidate_ref_cardinality'));
  const ambiguousRules = structuredClone(validDigest);
  ambiguousRules.rules.push({ ...structuredClone(ambiguousRules.rules[0]), rule_id: 'R-002', source: { ...source, block_id: 'b-002' } });
  assert.throws(() => projectDeterministicCandidates(ambiguousRules, candidates()), /多个 source block/);
  const grouped = summarizeIssues([
    { severity: 'ERROR', code: 'anchor_excerpt_mismatch' },
    { severity: 'ERROR', code: 'anchor_excerpt_mismatch' },
    { severity: 'WARN', code: 'raci_responsible_missing' },
  ]);
  assert.equal(grouped.errors, 2);
  assert.equal(grouped.warnings, 1);
  assert.equal(grouped.by_code[0].code, 'anchor_excerpt_mismatch');
  assert.equal(grouped.by_code[0].total, 2);

  const old = structuredClone(validDigest);
  old.digest_schema_version = '0.1.0'; old.activities = [{ activity_id: 'ACT-OLD', name: '旧活动', responsible_roles: [], inputs: [], action: '执行', outputs: [], main_next: null, transitions: [], control_refs: [], source, review: review() }];
  old.role_assignments = []; old.risks = []; old.controls = []; old.issues = []; old.pending_confirmations = [];
  delete old.process_elements; delete old.process_objectives; delete old.artifacts; delete old.flow_edges; delete old.ontology_projection.hierarchy_mapping;
  const migrated = migrateDigest(old, candidates()).digest;
  assert.equal(migrated.digest_schema_version, '0.2.0'); assert.equal(migrated.process_elements[0].hierarchy_status, 'unresolved');
  assert.ok(migrated.issues.some((item) => item.blocking));

  console.log('✓ policy-digest 0.2 tests passed (scaffold + projector CLI + Markdown CLI + diagnostics + hierarchy + artifacts + edges + migration + explanation)');
} finally { rmSync(root, { recursive: true, force: true }); }
