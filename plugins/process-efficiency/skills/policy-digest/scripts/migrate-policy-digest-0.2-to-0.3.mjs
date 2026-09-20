#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

/**
 * Policy Digest 0.2.0 → 0.3.0：机械迁移（语境标识泛化 + efio: 前缀键清理）。
 * - digest.json：case_id → engagement_id；删除 ontology_projection.hierarchy_mapping.extension_prefix（0.3.0 不再要求扩展键前缀，层级映射键直接用 hierarchyLevel/parentElement/owningProcess/mappingStatus）；digest_schema_version 提升至 0.3.0；status 与全部内容保持不变（无语义损失，不重置 review 状态）。
 * - source-index.json：case_id → engagement_id（如存在）。
 * - candidates.json：produces[].properties 中的 efio: 前缀键去前缀（键语义不变，framework candidates schema 对 properties 为开放对象，前缀无契约作用）。
 * - normalized.parsed.json：不受影响。
 */
const EFIO_KEY_MAP = {
  'efio:hierarchyLevel': 'hierarchyLevel',
  'efio:parentElement': 'parentElement',
  'efio:owningProcess': 'owningProcess',
  'efio:mappingStatus': 'mappingStatus',
};

export function migrateDigestEngagement(digest) {
  if (digest.digest_schema_version !== '0.2.0') throw new Error(`只支持 digest 0.2.0，实际为 ${digest.digest_schema_version}`);
  if (!digest.case_id || typeof digest.case_id !== 'string') throw new Error('缺少必填字段 case_id，无法完成语境标识迁移');
  const { case_id, ...rest } = digest;
  const migrated = { ...rest, digest_schema_version: '0.3.0', engagement_id: case_id };
  if (migrated.ontology_projection?.hierarchy_mapping && 'extension_prefix' in migrated.ontology_projection.hierarchy_mapping) {
    const { extension_prefix, ...hierarchyMapping } = migrated.ontology_projection.hierarchy_mapping;
    migrated.ontology_projection = { ...migrated.ontology_projection, hierarchy_mapping: hierarchyMapping };
  }
  return migrated;
}

export function migrateSourceIndex(sourceIndex) {
  if (!sourceIndex || typeof sourceIndex !== 'object') return sourceIndex;
  if (!('case_id' in sourceIndex)) return sourceIndex;
  const { case_id, ...rest } = sourceIndex;
  return { ...rest, engagement_id: case_id };
}

export function migrateCandidates(candidates) {
  if (!candidates || typeof candidates !== 'object' || !Array.isArray(candidates.candidates)) return candidates;
  const migrated = structuredClone(candidates);
  for (const candidate of migrated.candidates) {
    for (const proposal of candidate.produces || []) {
      if (!proposal.properties || typeof proposal.properties !== 'object') continue;
      const rebuilt = {};
      for (const [key, value] of Object.entries(proposal.properties)) {
        rebuilt[EFIO_KEY_MAP[key] || key] = value;
      }
      proposal.properties = rebuilt;
    }
  }
  return migrated;
}

function runCli() {
  const args = process.argv.slice(2);
  const input = args.find((arg) => !arg.startsWith('--'));
  if (!input) throw new Error('用法: node migrate-policy-digest-0.2-to-0.3.mjs <package-directory> [--in-place]');
  const directory = resolve(input);
  const digestPath = join(directory, 'digest.json');
  const sourceIndexPath = join(directory, 'source-index.json');
  const candidatesPath = join(directory, 'candidates.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  const hasSourceIndex = existsSync(sourceIndexPath);
  const hasCandidates = existsSync(candidatesPath);
  const digest = migrateDigestEngagement(readJson(digestPath));
  const sourceIndex = hasSourceIndex ? migrateSourceIndex(readJson(sourceIndexPath)) : null;
  const candidates = hasCandidates ? migrateCandidates(readJson(candidatesPath)) : null;
  const inPlace = args.includes('--in-place');
  const digestOutput = inPlace ? digestPath : join(directory, 'digest.v0.3.json');
  const sourceIndexOutput = inPlace ? sourceIndexPath : join(directory, 'source-index.v0.3.json');
  const candidatesOutput = inPlace ? candidatesPath : join(directory, 'candidates.v0.3.json');
  if (inPlace) {
    writeFileSync(join(directory, 'digest.v0.2.backup.json'), readFileSync(digestPath));
    if (hasSourceIndex) writeFileSync(join(directory, 'source-index.v0.2.backup.json'), readFileSync(sourceIndexPath));
    if (hasCandidates) writeFileSync(join(directory, 'candidates.v0.2.backup.json'), readFileSync(candidatesPath));
  }
  writeFileSync(digestOutput, `${JSON.stringify(digest, null, 2)}\n`);
  if (hasSourceIndex && sourceIndex) writeFileSync(sourceIndexOutput, `${JSON.stringify(sourceIndex, null, 2)}\n`);
  if (hasCandidates && candidates) writeFileSync(candidatesOutput, `${JSON.stringify(candidates, null, 2)}\n`);
  console.log(`✓ ${basename(digestPath)} 0.2→0.3 迁移完成：${digestOutput}`);
  console.log('ℹ 机械迁移：case_id → engagement_id、删除 extension_prefix、candidates 的 efio: 前缀键去前缀；review 状态保持不变；如需重建 digest.md 请运行 Markdown 生成器。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
