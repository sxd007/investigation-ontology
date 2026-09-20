#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

/**
 * Policy Digest 0.2.0 → 0.3.0：纯机械迁移（语境标识泛化）。
 * - digest.json：case_id → engagement_id；digest_schema_version 提升至 0.3.0；status 与全部内容保持不变（无语义损失，不重置 review 状态）。
 * - source-index.json：case_id → engagement_id（如存在）。
 * - candidates.json / normalized.parsed.json：不受影响（无 case 语义）。
 */
export function migrateDigestEngagement(digest) {
  if (digest.digest_schema_version !== '0.2.0') throw new Error(`只支持 digest 0.2.0，实际为 ${digest.digest_schema_version}`);
  if (!digest.case_id || typeof digest.case_id !== 'string') throw new Error('缺少必填字段 case_id，无法完成语境标识迁移');
  const { case_id, ...rest } = digest;
  return { ...rest, digest_schema_version: '0.3.0', engagement_id: case_id };
}

export function migrateSourceIndex(sourceIndex) {
  if (!sourceIndex || typeof sourceIndex !== 'object') return sourceIndex;
  if (!('case_id' in sourceIndex)) return sourceIndex;
  const { case_id, ...rest } = sourceIndex;
  return { ...rest, engagement_id: case_id };
}

function runCli() {
  const args = process.argv.slice(2);
  const input = args.find((arg) => !arg.startsWith('--'));
  if (!input) throw new Error('用法: node migrate-policy-digest-0.2-to-0.3.mjs <package-directory> [--in-place]');
  const directory = resolve(input);
  const digestPath = join(directory, 'digest.json');
  const sourceIndexPath = join(directory, 'source-index.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  const hasSourceIndex = existsSync(sourceIndexPath);
  const digest = migrateDigestEngagement(readJson(digestPath));
  const sourceIndex = hasSourceIndex ? migrateSourceIndex(readJson(sourceIndexPath)) : null;
  const inPlace = args.includes('--in-place');
  const digestOutput = inPlace ? digestPath : join(directory, 'digest.v0.3.json');
  const sourceIndexOutput = inPlace ? sourceIndexPath : join(directory, 'source-index.v0.3.json');
  if (inPlace) {
    writeFileSync(join(directory, 'digest.v0.2.backup.json'), readFileSync(digestPath));
    if (hasSourceIndex) writeFileSync(join(directory, 'source-index.v0.2.backup.json'), readFileSync(sourceIndexPath));
  }
  writeFileSync(digestOutput, `${JSON.stringify(digest, null, 2)}\n`);
  if (hasSourceIndex && sourceIndex) writeFileSync(sourceIndexOutput, `${JSON.stringify(sourceIndex, null, 2)}\n`);
  console.log(`✓ ${basename(digestPath)} 0.2→0.3 迁移完成：${digestOutput}`);
  console.log('ℹ 纯机械迁移（case_id → engagement_id），内容与 review 状态保持不变；如需重建 candidates/digest.md 请分别运行 projector 与 Markdown 生成器。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
