#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function edgeSource(activity, byId) {
  return activity.source || byId.get(activity.main_next)?.source;
}

function extensionProperties(proposal, level, parentRef, owningProcessRef) {
  return {
    ...(proposal.properties || {}),
    'efio:hierarchyLevel': level,
    ...(parentRef ? { 'efio:parentElement': parentRef } : {}),
    ...(owningProcessRef ? { 'efio:owningProcess': owningProcessRef } : {}),
    'efio:mappingStatus': 'PENDING_CORE_ALIGNMENT',
  };
}

export function migrateDigest(digest, candidates = null) {
  if (digest.digest_schema_version !== '0.1.0') throw new Error(`只支持 digest 0.1.0，实际为 ${digest.digest_schema_version}`);
  const activities = digest.activities || [];
  const byId = new Map(activities.map((activity) => [activity.activity_id, activity]));
  const processElements = activities.map((activity) => ({
    element_id: activity.activity_id,
    level: 'L4',
    rdf_type: 'proc:ProcessActivity',
    name: activity.name,
    parent_ref: null,
    owning_process_ref: null,
    objective_refs: [],
    owner_role_refs: [],
    input_artifact_refs: [],
    output_artifact_refs: [],
    entry_conditions: [],
    exit_conditions: [],
    decomposition_basis: 'inferred_structure',
    hierarchy_status: 'unresolved',
    hierarchy_confidence: { evidence: 0.5, boundary: 0, parent: 0, granularity: 0.5, overall: 0 },
    alternative_levels: ['L3', 'L5'],
    source: activity.source,
    review: { ...(activity.review || { status: 'proposed' }), status: 'proposed', pool: 'full', reviewer: null, timestamp: null },
    candidate_refs: [],
  }));
  const flowEdges = [];
  let edgeSequence = 1;
  for (const activity of activities) {
    if (activity.main_next) {
      flowEdges.push({
        edge_id: `EDGE-MIG-${String(edgeSequence++).padStart(3, '0')}`,
        process_ref: 'UNRESOLVED',
        from_ref: activity.activity_id,
        to_ref: activity.main_next,
        edge_kind: 'main',
        condition: null,
        condition_parameters: [],
        source: edgeSource(activity, byId),
        review: { status: 'proposed', pool: 'full', reviewer: null, timestamp: null },
        candidate_refs: [],
      });
    }
    for (const transition of activity.transitions || []) {
      flowEdges.push({
        edge_id: transition.edge_id || `EDGE-MIG-${String(edgeSequence++).padStart(3, '0')}`,
        process_ref: 'UNRESOLVED',
        from_ref: transition.from_ref || activity.activity_id,
        to_ref: transition.to_ref,
        edge_kind: String(transition.edge_kind || transition.transitionKind || 'conditional').toLowerCase(),
        condition: transition.condition || null,
        condition_parameters: transition.condition_parameters || transition.conditionParams || [],
        source: transition.source || activity.source,
        review: { ...(transition.review || {}), status: 'proposed', pool: 'full', reviewer: null, timestamp: null },
        candidate_refs: transition.candidate_refs || [],
      });
    }
  }
  const source = digest.document_identity?.source;
  const migrated = {
    ...digest,
    digest_schema_version: '0.2.0',
    status: 'draft',
    rules: (digest.rules || []).map((rule) => ({ ...rule, operationalized_by: rule.operationalized_by || [] })),
    process_elements: processElements,
    process_objectives: [],
    artifacts: [],
    flow_edges: flowEdges,
    role_assignments: (digest.role_assignments || []).map(({ activity_ref, ...assignment }) => ({ ...assignment, element_ref: activity_ref })),
    risks: (digest.risks || []).map(({ activity_refs, ...risk }) => ({ ...risk, element_refs: activity_refs || [] })),
    controls: (digest.controls || []).map(({ activity_ref, ...control }) => ({ ...control, element_ref: activity_ref ?? null })),
    issues: [
      ...(digest.issues || []),
      {
        issue_id: 'Q-MIG-HIERARCHY-001',
        type: 'migration_hierarchy_unresolved',
        related_refs: processElements.map((element) => element.element_id),
        description: '0.1 activities 无法机械推断 L1-L3 及父级；迁移后所有活动暂列 L4，须重新执行分层解构。',
        impact: '流程层级、所属 L3、目标及 Artifact 尚不可正式入库。',
        risk_level: 'high',
        recommendation: '按分层流程解构 Pass A-G 补建 L1-L3、确认 L4/L5 粒度并解析 Artifact。',
        confirmation_owner: digest.document_identity?.owning_department || null,
        blocking: true,
        source,
      },
    ],
    pending_confirmations: [
      ...(digest.pending_confirmations || []),
      {
        confirmation_id: 'CONF-MIG-HIERARCHY-001',
        question: '请确认迁移活动的 L1-L5 层级、直接父级和所属 L3 流程。',
        impact: '未确认前不得进入 ready_for_ingestion。',
        source,
        suggested_owner: digest.document_identity?.owning_department || null,
        blocking: true,
      },
    ],
    graph: {
      ...(digest.graph || { lanes: [], nodes: [], edges: [] }),
      nodes: (digest.graph?.nodes || []).map(({ activity_ref, ...node }) => ({ ...node, element_ref: activity_ref })),
      edges: digest.graph?.edges || [],
    },
    ontology_projection: {
      ...digest.ontology_projection,
      hierarchy_mapping: {
        mode: 'candidates_extension',
        extension_prefix: 'efio',
        serialization_policy: 'PENDING_CORE_ALIGNMENT',
      },
    },
  };
  delete migrated.activities;

  let migratedCandidates = candidates;
  if (candidates) {
    migratedCandidates = structuredClone(candidates);
    for (const candidate of migratedCandidates.candidates || []) {
      for (const proposal of candidate.produces || []) {
        if (proposal.rdfType === 'proc:ProcessActivity') proposal.properties = extensionProperties(proposal, 'L4', null, null);
      }
    }
  }
  return { digest: migrated, candidates: migratedCandidates };
}

function runCli() {
  const args = process.argv.slice(2);
  const input = args.find((arg) => !arg.startsWith('--'));
  if (!input) throw new Error('用法: node migrate-policy-digest-0.1-to-0.2.mjs <package-directory> [--in-place]');
  const directory = resolve(input);
  const digestPath = join(directory, 'digest.json');
  const candidatesPath = join(directory, 'candidates.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  const result = migrateDigest(readJson(digestPath), existsSync(candidatesPath) ? readJson(candidatesPath) : null);
  const inPlace = args.includes('--in-place');
  const digestOutput = inPlace ? digestPath : join(directory, 'digest.v0.2.json');
  const candidatesOutput = inPlace ? candidatesPath : join(directory, 'candidates.v0.2.json');
  if (inPlace) writeFileSync(join(directory, 'digest.v0.1.backup.json'), readFileSync(digestPath));
  writeFileSync(digestOutput, `${JSON.stringify(result.digest, null, 2)}\n`);
  if (result.candidates) {
    if (inPlace) writeFileSync(join(directory, 'candidates.v0.1.backup.json'), readFileSync(candidatesPath));
    writeFileSync(candidatesOutput, `${JSON.stringify(result.candidates, null, 2)}\n`);
  }
  console.log(`✓ ${basename(digestPath)} 0.1→0.2 迁移完成：${digestOutput}`);
  console.log('⚠ 层级无法机械恢复，已添加 blocking 待确认项；必须重新执行分层解构。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
