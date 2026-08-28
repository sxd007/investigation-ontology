#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(scriptDir);
const scanner = join(pluginRoot, 'skills', 'evidence-management', 'scripts', 'scan-chain.js');
const hookRunner = join(pluginRoot, 'scripts', 'run-hook.mjs');
const policyDigestValidatorTests = join(pluginRoot, 'skills', 'policy-digest', 'scripts', 'test-policy-digest-validation.mjs');
const codeBuddyHooks = join(pluginRoot, 'hooks', 'hooks.json');
const codeBuddyPlugin = join(pluginRoot, '.codebuddy-plugin', 'plugin.json');
const skillsRoot = join(pluginRoot, 'skills');
const tempRoot = mkdtempSync(join(tmpdir(), 'case-validation-'));

function registry(findings = [], chainNodes = []) {
  return {
    metadata: {
      case_id: 'CASE-TEST-001',
      generated_at: '2026-07-28T00:00:00Z',
    },
    chain_nodes: chainNodes,
    entities: [],
    evidence_items: [],
    findings,
    hypotheses: [],
    event_timeline: [],
  };
}

function makeCase(name, registryData, nodeContent = null) {
  const caseDir = join(tempRoot, name);
  mkdirSync(join(caseDir, 'nodes'), { recursive: true });
  writeFileSync(join(caseDir, 'evidence_registry.json'), JSON.stringify(registryData, null, 2));
  if (nodeContent !== null) writeFileSync(join(caseDir, 'nodes', 'FND-001.md'), nodeContent);
  return caseDir;
}

function writeOntologyFile(projectRoot, relativePath, content) {
  const filePath = join(projectRoot, 'global_ontology', relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function scan(caseDir, ...args) {
  return spawnSync(process.execPath, [scanner, caseDir, ...(args.length ? args : ['--validate'])], { encoding: 'utf8' });
}

function runHook(filePath, cwd, toolName = 'write_to_file') {
  const input = JSON.stringify({
    cwd,
    tool_name: toolName,
    tool_input: { file_path: filePath },
  });
  return spawnSync(process.execPath, [hookRunner, 'validate-case-file'], {
    cwd,
    input,
    encoding: 'utf8',
  });
}

try {
  const pluginConfig = JSON.parse(readFileSync(codeBuddyPlugin, 'utf8'));
  const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const discoveredSkills = skillDirectories
    .filter((name) => existsSync(join(skillsRoot, name, 'SKILL.md')));
  assert.equal(Object.hasOwn(pluginConfig, 'skills'), false, '默认 skills/<name>/SKILL.md 布局不得声明 CodeBuddy skills 字段，否则会关闭默认发现');
  assert.ok(discoveredSkills.length > 0, 'CodeBuddy 默认发现至少应包含一个技能');
  assert.deepEqual(discoveredSkills, skillDirectories, 'skills 下每个一级目录都必须包含 SKILL.md，确保 CodeBuddy 默认发现无遗漏');

  const policyDigestTestResult = spawnSync(process.execPath, [policyDigestValidatorTests], { encoding: 'utf8' });
  assert.equal(policyDigestTestResult.status, 0, policyDigestTestResult.stdout + policyDigestTestResult.stderr);

  const hookConfig = JSON.parse(readFileSync(codeBuddyHooks, 'utf8'));
  const preWriteMatcher = hookConfig.hooks.PreToolUse.find((entry) => entry.id === 'pre:write:case-file-guard')?.matcher || '';
  const postWriteMatcher = hookConfig.hooks.PostToolUse.find((entry) => entry.id === 'post:write:ontology-ref-check')?.matcher || '';
  for (const toolName of ['Write', 'Edit', 'MultiEdit']) {
    assert.match(toolName, new RegExp(preWriteMatcher), `PreToolUse matcher 缺少官方工具名: ${toolName}`);
    assert.match(toolName, new RegExp(postWriteMatcher), `PostToolUse matcher 缺少官方工具名: ${toolName}`);
  }
  for (const toolName of ['write_to_file', 'replace_in_file', 'multi_replace_string_in_file']) {
    assert.match(toolName, new RegExp(preWriteMatcher), `PreToolUse matcher 缺少兼容工具名: ${toolName}`);
    assert.match(toolName, new RegExp(postWriteMatcher), `PostToolUse matcher 缺少兼容工具名: ${toolName}`);
  }
  assert.match('delete_file', new RegExp(postWriteMatcher), 'PostToolUse matcher 缺少兼容工具名: delete_file');
  assert.doesNotMatch('NotebookEdit', new RegExp(postWriteMatcher), 'PostToolUse matcher 不应误匹配 NotebookEdit');

  const validFinding = {
    finding_id: 'FND-001',
    statement: '已确认测试事实',
    confidence: 'confirmed',
  };
  const validNode = `---\nid: FND-001\ntype: finding\nstatus: ready # draft | ready | superseded\nstatement: "已确认测试事实 # 引号内不是注释"\nconfidence: confirmed\nrelations:\n  derived_from: [] # 暂无上游\n---\n\n# FND-001\n\n## 推理路径\n暂无\n\n## 推理依据\n暂无\n\n## 剩余怀疑\n暂无\n`;
  const validCase = makeCase('valid', registry([validFinding], [{ id: 'FND-001', type: 'finding', status: 'ready' }]), validNode);
  const validResult = scan(validCase);
  assert.equal(validResult.status, 0, validResult.stdout + validResult.stderr);
  assert.match(validResult.stdout, /Registry、节点与本体绑定验证通过/);

  const stringCase = makeCase('string-finding', registry(['【已确认】无 ID 的字符串事实']));
  const stringResult = scan(stringCase);
  assert.equal(stringResult.status, 1, stringResult.stdout + stringResult.stderr);
  assert.match(stringResult.stdout, /findings\/0: 类型应为 object/);
  assert.match(stringResult.stderr, /findings\[0\] 应为对象/);

  const blockedHtml = join(stringCase, 'should-not-exist.html');
  const htmlResult = scan(stringCase, '--html', blockedHtml);
  assert.equal(htmlResult.status, 1, htmlResult.stdout + htmlResult.stderr);
  assert.equal(existsSync(blockedHtml), false);

  const typoNode = `---\nid: FND-001\ntype: finding\nstatus: draft\nstatment: "字段拼写错误"\nconfidence: probable\nrelations:\n  derive_from: []\n---\n`;
  const typoCase = makeCase('frontmatter-typo', registry(), typoNode);
  const typoResult = scan(typoCase);
  assert.equal(typoResult.status, 1, typoResult.stdout + typoResult.stderr);
  assert.match(typoResult.stdout, /未知 frontmatter 字段 'statment'.*'statement'/);
  assert.match(typoResult.stdout, /未知关系 'derive_from'.*'derived_from'/);
  assert.match(typoResult.stdout, /缺少必填字段 'statement'/);

  const missingIndexCase = makeCase('missing-index', registry([validFinding]), validNode);
  const missingIndexResult = scan(missingIndexCase);
  assert.equal(missingIndexResult.status, 1, missingIndexResult.stdout + missingIndexResult.stderr);
  assert.match(missingIndexResult.stdout, /node_missing_from_chain_index/);

  const hypNode = `---\nid: HYP-001\ntype: hypothesis\nstatus: active\nstatement: "测试假设"\nrelations:\n  supported_by: []\n  contradicted_by: []\n---\n\n# HYP-001\n`;
  const hypCase = makeCase('hyp-status', registry([], [{ id: 'HYP-001', type: 'hypothesis', status: 'active' }]), null);
  writeFileSync(join(hypCase, 'nodes', 'HYP-001.md'), hypNode);
  const hypResult = scan(hypCase);
  assert.equal(hypResult.status, 0, hypResult.stdout + hypResult.stderr);

  const missingSectionNode = `---\nid: FND-001\ntype: finding\nstatus: ready\nstatement: "缺少章节"\nconfidence: confirmed\nrelations:\n  derived_from: []\n---\n\n# FND-001\n`;
  const missingSectionCase = makeCase('missing-section', registry([validFinding], [{ id: 'FND-001', type: 'finding', status: 'ready' }]), missingSectionNode);
  const missingSectionResult = scan(missingSectionCase);
  assert.equal(missingSectionResult.status, 0, missingSectionResult.stdout + missingSectionResult.stderr);
  assert.match(missingSectionResult.stdout, /missing_body_section/);

  const projectRoot = join(tempRoot, 'ontology-project');
  const boundCase = join(projectRoot, 'cases', 'CASE-TEST-002');
  mkdirSync(join(boundCase, 'nodes'), { recursive: true });
  writeOntologyFile(projectRoot, 'entities/person/P-0001.yaml', `meta:\n  id: "P-0001"\n  type: Person\n  lifecycle_status: VERIFIED\n  created_at: "2026-07-28T00:00:00Z"\n  created_by: tester\nproperties:\n  name_primary: "测试人员"\n`);
  writeOntologyFile(projectRoot, 'entities/evidence/ev-001.yaml', `meta:\n  id: "ev-001"\n  type: Evidence\n  lifecycle_status: ACTIVE\n  created_at: "2026-07-28T00:00:00Z"\n  created_by: tester\nintegrity:\n  raw_file_path: "cases/CASE-TEST-002/raw/EV-001.txt"\n  sha256: "abc123"\n  sealed: false\nproperties:\n  evidence_type: OTHER\n`);
  const boundRegistry = registry([], [
    { id: 'ENT-001', type: 'entity', status: 'draft' },
    { id: 'EV-001', type: 'evidence', status: 'ready' },
  ]);
  boundRegistry.entities.push({
    entity_id: 'ENT-001', entity_type: 'subject', name: '测试人员',
    ontology_ref: { object_id: 'P-0001', object_type: 'Person', lifecycle_status: 'VERIFIED' },
  });
  boundRegistry.evidence_items.push({
    evidence_id: 'EV-001', type: 'documentary', summary: '测试证据', source: '测试',
    collected_at: '2026-07-28T00:00:00Z',
    ontology_ref: { object_id: 'ev-001', object_type: 'Evidence', sealed: false },
  });
  writeFileSync(join(boundCase, 'evidence_registry.json'), JSON.stringify(boundRegistry, null, 2));
  const entityNode = `---\nid: ENT-001\ntype: entity\nentity_type: subject\nname: "测试人员"\nontology_ref:\n  object_id: "P-0001"\n  object_type: Person\n  lifecycle_status: VERIFIED\nrelations:\n  involves: []\n---\n\n# ENT-001\n`;
  writeFileSync(join(boundCase, 'nodes', 'ENT-001.md'), entityNode);
  const evidenceNode = `---\nid: EV-001\ntype: evidence\nstatus: ready\nontology_ref:\n  object_id: "ev-001"\n  object_type: Evidence\n  sealed: false\nrelations:\n  involves:\n    - ENT-001\n---\n\n# EV-001\n\n## 关键内容摘要\n测试\n\n## 使用说明\n测试\n`;
  writeFileSync(join(boundCase, 'nodes', 'EV-001.md'), evidenceNode);
  const boundResult = scan(boundCase);
  assert.equal(boundResult.status, 0, boundResult.stdout + boundResult.stderr);

  boundRegistry.evidence_items[0].ontology_ref.sealed = true;
  writeFileSync(join(boundCase, 'evidence_registry.json'), JSON.stringify(boundRegistry, null, 2));
  const sealedDriftResult = scan(boundCase);
  assert.equal(sealedDriftResult.status, 1, sealedDriftResult.stdout + sealedDriftResult.stderr);
  assert.match(sealedDriftResult.stdout, /ontology_sealed_mismatch/);
  boundRegistry.evidence_items[0].ontology_ref.sealed = false;

  boundRegistry.entities[0].ontology_ref.lifecycle_status = 'DISPUTED';
  writeFileSync(join(boundCase, 'evidence_registry.json'), JSON.stringify(boundRegistry, null, 2));
  const driftResult = scan(boundCase);
  assert.equal(driftResult.status, 1, driftResult.stdout + driftResult.stderr);
  assert.match(driftResult.stdout, /ontology_lifecycle_mismatch/);
  boundRegistry.entities[0].ontology_ref.lifecycle_status = 'VERIFIED';

  boundRegistry.entities[0].ontology_ref.object_id = 'P-9999';
  writeFileSync(join(boundCase, 'evidence_registry.json'), JSON.stringify(boundRegistry, null, 2));
  const missingObjectResult = scan(boundCase);
  assert.equal(missingObjectResult.status, 1, missingObjectResult.stdout + missingObjectResult.stderr);
  assert.match(missingObjectResult.stdout, /ontology_ref_not_found/);

  const invalidRelation = writeOntologyFile(projectRoot, 'relations/R-001.yaml', `meta:\n  relation_id: "R-001"\n  relation_type: WORKS_AT\n  evidence_tier: HARD\n  source_evidence_refs: []\n  observed_time: "2026-07-28T00:00:00Z"\ncore:\n  from_entity: "P-0001"\n  to_entity: "O-9999"\n`);
  const ontologyHookResult = runHook(invalidRelation, projectRoot);
  assert.equal(ontologyHookResult.status, 0, ontologyHookResult.stdout + ontologyHookResult.stderr);
  const ontologyHookOutput = JSON.parse(ontologyHookResult.stdout);
  assert.match(ontologyHookOutput.hookSpecificOutput.additionalContext, /Ontology Schema/);
  assert.match(ontologyHookOutput.hookSpecificOutput.additionalContext, /ontology_missing_relation_endpoint/);

  const hookResult = runHook(join(stringCase, 'evidence_registry.json'), stringCase);
  assert.equal(hookResult.status, 0, hookResult.stdout + hookResult.stderr);
  const hookOutput = JSON.parse(hookResult.stdout);
  assert.match(hookOutput.hookSpecificOutput.additionalContext, /写入后校验未通过/);
  assert.match(hookOutput.hookSpecificOutput.additionalContext, /findings\/0/);

  const validHookResult = runHook(join(validCase, 'evidence_registry.json'), validCase);
  assert.equal(validHookResult.status, 0, validHookResult.stdout + validHookResult.stderr);
  assert.equal(validHookResult.stdout, '');

  const deleteCase = makeCase('delete-node', registry([validFinding], [{ id: 'FND-001', type: 'finding', status: 'ready' }]), validNode);
  const deletedNode = join(deleteCase, 'nodes', 'FND-001.md');
  rmSync(deletedNode);
  const deleteHookResult = runHook(deletedNode, deleteCase, 'delete_file');
  assert.equal(deleteHookResult.status, 0, deleteHookResult.stdout + deleteHookResult.stderr);
  const deleteHookOutput = JSON.parse(deleteHookResult.stdout);
  assert.match(deleteHookOutput.hookSpecificOutput.additionalContext, /chain_index_missing_node/);

  const irrelevant = join(stringCase, 'notes.md');
  writeFileSync(irrelevant, 'not a case schema file');
  const irrelevantResult = runHook(irrelevant, stringCase);
  assert.equal(irrelevantResult.status, 0);
  assert.equal(irrelevantResult.stdout, '');

  console.log('✓ case validation tests passed (17 scenarios)');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
