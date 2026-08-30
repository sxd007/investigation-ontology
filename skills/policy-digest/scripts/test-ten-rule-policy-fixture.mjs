#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateExplanation } from './generate-policy-digest-explanation.mjs';
import { renderPolicyDigestMarkdown } from './generate-policy-digest-md.mjs';
import { validatePackage } from './validate-policy-digest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(scriptDir, '..', 'test-fixtures', 'ten-rule-policy');
const projectorScript = join(scriptDir, 'project-policy-digest-candidates.mjs');
const root = mkdtempSync(join(tmpdir(), 'ten-rule-policy-fixture-'));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function runProjector(args) {
  return spawnSync(process.execPath, [projectorScript, ...args], { encoding: 'utf8' });
}

try {
  const workDir = join(root, 'work');
  cpSync(fixtureDir, workDir, { recursive: true });

  const check = runProjector([workDir, '--check']);
  assert.equal(check.status, 0, check.stdout + check.stderr);

  const validation = validatePackage(workDir);
  assert.equal(validation.summary.errors, 0, JSON.stringify(validation.issues, null, 2));
  assert.deepEqual(validation.issues.filter((item) => item.severity === 'ERROR'), []);

  const projected1 = join(root, 'projected-1.json');
  const projected2 = join(root, 'projected-2.json');
  for (const output of [projected1, projected2]) {
    const result = runProjector([workDir, '--output', output]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.equal(readFileSync(projected1, 'utf8'), readFileSync(projected2, 'utf8'));
  assert.equal(readFileSync(projected1, 'utf8'), readFileSync(join(workDir, 'candidates.json'), 'utf8'));

  const digest = readJson(join(workDir, 'digest.json'));
  assert.equal(renderPolicyDigestMarkdown(digest), readFileSync(join(workDir, 'digest.md'), 'utf8'));

  const explanation = generateExplanation(workDir, join(root, 'explanation.html'));
  const recordIds = explanation.model.records.map((record) => record.id);
  assert.equal(recordIds.length, 205);
  assert.equal(new Set(recordIds).size, 205, 'explanation record IDs must be unique');
  assert.equal(explanation.model.source_blocks.length, 49);

  const candidates = readJson(join(workDir, 'candidates.json'));
  const parameters = candidates.candidates.flatMap((candidate) => candidate.parameters || []);
  const obligationParameters = parameters.filter((parameter) => /-OBLIGATION$/.test(parameter.target));
  assert.equal(digest.rules.length, 10);
  assert.equal(digest.process_elements.length, 39);
  assert.equal(digest.process_objectives.length, 7);
  assert.equal(digest.artifacts.length, 9);
  assert.equal(digest.flow_edges.length, 17);
  assert.equal(candidates.candidates.length, 75);
  assert.equal(new Set(candidates.candidates.map((candidate) => candidate.candidateId)).size, 75);
  assert.ok(candidates.candidates.every((candidate) => candidate.sourceBlock?.blockId));
  assert.equal(obligationParameters.length, 6);

  const brokenDir = join(root, 'broken');
  cpSync(fixtureDir, brokenDir, { recursive: true });
  const brokenDigestPath = join(brokenDir, 'digest.json');
  const brokenDigest = readJson(brokenDigestPath);
  brokenDigest.rules[0].source.block_id = 'b-999';
  brokenDigest.rules[1].source.block_id = 'b-998';
  writeFileSync(brokenDigestPath, JSON.stringify(brokenDigest, null, 2));
  const brokenErrors = validatePackage(brokenDir).issues.filter((item) => item.severity === 'ERROR');
  assert.deepEqual(
    brokenErrors.map(({ code, location }) => ({ code, location })),
    [
      { code: 'anchor_block_missing', location: '$/rules/0/source' },
      { code: 'anchor_block_missing', location: '$/rules/1/source' },
    ],
  );

  console.log('✓ ten-rule-policy fixture tests passed (10 rules / 75 candidates / 6 obligation params / 205 records)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
