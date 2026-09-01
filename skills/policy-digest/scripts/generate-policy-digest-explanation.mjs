#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEMPLATE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'explanation-template.html');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

}

function sourceKey(source = {}) {
  return `${source.doc_id || source.docId || ''}::${source.block_id || source.blockId || ''}::${source.block_path || source.blockPath || ''}`;
}

function refs(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function record(id, kind, title, detail, source, extra = {}) {
  return { id, kind, title, detail, source: source || null, source_key: sourceKey(source), ...extra };
}

function digestSource(source = {}) {
  return {
    doc_id: source.docId || source.doc_id || '',
    block_id: source.blockId || source.block_id || '',
    block_path: source.blockPath || source.block_path || '',
    clause_ref: null,
    page_hint: null,
    excerpt: source.excerpt || '',
  };
}

export function buildExplanationModel(digest, parsed, candidates = null) {
  if (digest.digest_schema_version !== '0.2.0') throw new Error(`仅支持 Policy Digest 0.2.0，实际为 ${digest.digest_schema_version}`);
  const elements = digest.process_elements || [];
  const byElement = new Map(elements.map((item) => [item.element_id, item]));
  const children = new Map(elements.map((item) => [item.element_id, []]));
  for (const item of elements) if (item.parent_ref && children.has(item.parent_ref)) children.get(item.parent_ref).push(item.element_id);
  const sourceBlocks = (parsed.blocks || []).map((block) => ({
    block_id: block.blockId,
    block_path: block.anchor?.blockPath || '',
    clause_ref: block.clauseRef?.number || '',
    page_hint: block.anchor?.pageHint ?? null,
    text: block.text || block.anchor?.excerpt || '',
    parse_confidence: block.parseConfidence ?? null,
    needs_verification: Boolean(block.needsVerification),
    source_key: sourceKey({ doc_id: parsed.document?.docId, block_id: block.blockId, block_path: block.anchor?.blockPath }),
  }));
  const records = [];
  for (const rule of digest.rules || []) records.push(record(rule.rule_id, 'rule', rule.requirement || rule.original_text, rule.original_text, rule.source, { links: refs(rule.operationalized_by), review: rule.review, confidence: rule.semantic_confidence }));
  for (const item of elements) records.push(record(item.element_id, 'process', item.name, `${item.level} · ${item.rdf_type}`, item.source, {
    level: item.level, parent_ref: item.parent_ref, owning_process_ref: item.owning_process_ref, children: children.get(item.element_id) || [],
    objectives: refs(item.objective_refs), inputs: refs(item.input_artifact_refs), outputs: refs(item.output_artifact_refs),
    entry_conditions: refs(item.entry_conditions), exit_conditions: refs(item.exit_conditions), basis: item.decomposition_basis,
    hierarchy_status: item.hierarchy_status, confidence: item.hierarchy_confidence, alternatives: refs(item.alternative_levels), review: item.review,
  }));
  for (const objective of digest.process_objectives || []) records.push(record(objective.objective_id, 'objective', objective.statement, `关联流程：${refs(objective.element_refs).join('、') || '未关联'}`, objective.source, { links: refs(objective.element_refs), basis: objective.assertion_basis, review: objective.review }));
  for (const artifact of digest.artifacts || []) records.push(record(artifact.artifact_id, 'artifact', artifact.name, artifact.artifact_type, artifact.source, { produced_by: refs(artifact.produced_by), consumed_by: refs(artifact.consumed_by), review: artifact.review }));
  for (const edge of digest.flow_edges || []) records.push(record(edge.edge_id, 'edge', `${byElement.get(edge.from_ref)?.name || edge.from_ref} → ${byElement.get(edge.to_ref)?.name || edge.to_ref}`, edge.condition || edge.edge_kind, edge.source, { process_ref: edge.process_ref, from_ref: edge.from_ref, to_ref: edge.to_ref, edge_kind: edge.edge_kind, review: edge.review }));
  for (const assignment of digest.role_assignments || []) records.push(record(assignment.assignment_id, 'role', `${assignment.role} · ${assignment.raci}`, byElement.get(assignment.element_ref)?.name || assignment.element_ref, assignment.source, { element_ref: assignment.element_ref, raci: assignment.raci, review: assignment.review }));
  for (const risk of digest.risks || []) records.push(record(risk.risk_id, 'risk', risk.description, `关联流程：${refs(risk.element_refs).join('、') || '未关联'}`, risk.source, { links: refs(risk.element_refs), basis: risk.assertion_basis, review: risk.review }));
  for (const control of digest.controls || []) records.push(record(control.control_id, 'control', control.measure, byElement.get(control.element_ref)?.name || control.element_ref || '未关联流程', control.source, { element_ref: control.element_ref, links: refs(control.risk_refs), basis: control.assertion_basis, review: control.review }));
  for (const issue of digest.issues || []) records.push(record(issue.issue_id, 'issue', issue.description, issue.recommendation || '', issue.source, { blocking: issue.blocking, risk_level: issue.risk_level, links: refs(issue.related_refs) }));
  const candidateRecords = (candidates?.candidates || []).map((candidate) => {
    const candidateSource = digestSource(candidate.sourceBlock);
    const proposals = (candidate.produces || []).map((proposal) => ({
      local_id: proposal.localId,
      rdf_type: proposal.rdfType,
      label: proposal.label || proposal.statement || proposal.clauseText || '',
      properties: proposal.properties || {},
    }));
    return record(candidate.candidateId, 'candidate', candidate.candidateId, candidate.disposition, candidateSource, {
      disposition: candidate.disposition,
      clause_types: refs(candidate.clauseType),
      confidence: candidate.confidence,
      core_version: candidate.coreVersion,
      review_pool: candidate.reviewPool,
      review: candidate.review,
      proposals,
      parameters: refs(candidate.parameters),
      transitions: refs(candidate.transitions),
      alignments: refs(candidate.alignments),
    });
  });
  records.push(...candidateRecords);

  return {
    meta: { digest_id: digest.digest_id, status: digest.status, generated_at: digest.generated_at, title: digest.document_identity?.title || parsed.document?.identity?.title || digest.digest_id, doc_id: digest.document_identity?.doc_id || parsed.document?.docId, schema_version: digest.digest_schema_version },
    identity: digest.document_identity,
    scope: digest.scope,
    source_blocks: sourceBlocks,
    records,
    roots: elements.filter((item) => !item.parent_ref).map((item) => item.element_id),
    process_ids: elements.filter((item) => item.level === 'L3').map((item) => item.element_id),
    pending_confirmations: digest.pending_confirmations || [],
    counts: {
      source_blocks: sourceBlocks.length, rules: (digest.rules || []).length, process_elements: elements.length,
      processes: elements.filter((item) => item.level === 'L3').length, artifacts: (digest.artifacts || []).length,
      roles: (digest.role_assignments || []).length, risks: (digest.risks || []).length, controls: (digest.controls || []).length,
      issues: (digest.issues || []).length, candidates: candidateRecords.length,
    },
  };
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function renderExplanationHtml(model, template = null) {
  const source = template ?? readFileSync(TEMPLATE_PATH, 'utf8');
  const title = String(model.meta.title).replace(/[<>&"]/g, '');
  return source
    .replace('__TITLE__', () => title)
    .replace('__POLICY_DATA__', () => safeJson(model));
}

export function generateExplanation(packageDirectory, outputPath = null) {
  const directory = resolve(packageDirectory);
  const digestPath = join(directory, 'digest.json');
  const parsedPath = join(directory, 'normalized.parsed.json');
  const candidatesPath = join(directory, 'candidates.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  if (!existsSync(parsedPath)) throw new Error(`缺少 ${parsedPath}`);
  const model = buildExplanationModel(readJson(digestPath), readJson(parsedPath), existsSync(candidatesPath) ? readJson(candidatesPath) : null);
  const target = resolve(outputPath || join(directory, 'explanation.html'));
  writeFileSync(target, renderExplanationHtml(model), 'utf8');
  return { outputPath: target, model };
}

function runCli() {
  const args = process.argv.slice(2); const input = args.find((arg) => !arg.startsWith('--'));
  if (!input) throw new Error('用法: node generate-policy-digest-explanation.mjs <package-directory> [--output <path>]');
  const outputIndex = args.indexOf('--output'); const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (outputIndex >= 0 && !output) throw new Error('--output 后必须提供路径');
  const result = generateExplanation(input, output);
  console.log(`✓ 已生成独立制度解构导览：${result.outputPath}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
