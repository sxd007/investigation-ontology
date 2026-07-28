#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(scriptDir);
const scanner = join(pluginRoot, 'skills', 'evidence-management', 'scripts', 'scan-chain.js');
const hookRunner = join(pluginRoot, 'scripts', 'run-hook.mjs');
const tempRoot = mkdtempSync(join(tmpdir(), 'case-validation-'));

function registry(findings = []) {
  return {
    metadata: {
      case_id: 'CASE-TEST-001',
      generated_at: '2026-07-28T00:00:00Z',
    },
    chain_nodes: [],
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

function scan(caseDir, ...args) {
  return spawnSync(process.execPath, [scanner, caseDir, ...(args.length ? args : ['--validate'])], { encoding: 'utf8' });
}

function runHook(filePath, cwd) {
  const input = JSON.stringify({
    cwd,
    tool_input: { file_path: filePath },
  });
  return spawnSync(process.execPath, [hookRunner, 'validate-case-file'], {
    cwd,
    input,
    encoding: 'utf8',
  });
}

try {
  const validFinding = {
    finding_id: 'FND-001',
    statement: '已确认测试事实',
    confidence: 'confirmed',
  };
  const validNode = `---\nid: FND-001\ntype: finding\nstatus: ready # draft | ready | superseded\nstatement: "已确认测试事实 # 引号内不是注释"\nconfidence: confirmed\nrelations:\n  derived_from: [] # 暂无上游\n---\n\n# FND-001\n`;
  const validCase = makeCase('valid', registry([validFinding]), validNode);
  const validResult = scan(validCase);
  assert.equal(validResult.status, 0, validResult.stdout + validResult.stderr);
  assert.match(validResult.stdout, /节点结构验证通过/);

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

  const hookResult = runHook(join(stringCase, 'evidence_registry.json'), stringCase);
  assert.equal(hookResult.status, 0, hookResult.stdout + hookResult.stderr);
  const hookOutput = JSON.parse(hookResult.stdout);
  assert.match(hookOutput.hookSpecificOutput.additionalContext, /写入后校验未通过/);
  assert.match(hookOutput.hookSpecificOutput.additionalContext, /findings\/0/);

  const validHookResult = runHook(join(validCase, 'evidence_registry.json'), validCase);
  assert.equal(validHookResult.status, 0, validHookResult.stdout + validHookResult.stderr);
  assert.equal(validHookResult.stdout, '');

  const irrelevant = join(stringCase, 'notes.md');
  writeFileSync(irrelevant, 'not a case schema file');
  const irrelevantResult = runHook(irrelevant, stringCase);
  assert.equal(irrelevantResult.status, 0);
  assert.equal(irrelevantResult.stdout, '');

  console.log('✓ case validation tests passed (7 scenarios)');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
