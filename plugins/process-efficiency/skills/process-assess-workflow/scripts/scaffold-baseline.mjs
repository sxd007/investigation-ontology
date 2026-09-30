#!/usr/bin/env node
// 评价基线脚手架（零依赖）：BASELINE 阶段组装 baseline-v{N}.json 草稿。
// 与 scaffold-assessment.mjs / scaffold-dimension.mjs 互补——前者建评价外壳、后者建维度产物骨架，
// 本脚本把「digest 引用 + 数据快照」固化为版本化基线（schema：references/schemas/assessment-baseline-0.1.0.schema.json）。
//
// 用法:
//   node scaffold-baseline.mjs <assessment_root> [--version N] [--digest <digest.json 路径>]... [--force]
//       扫描 policy-digests/*/digest.json 与 snapshots/，生成 baselines/baseline-v{N}.json 草稿（N 自动递增）
//   node scaffold-baseline.mjs <assessment_root> --refresh baselines/baseline-v1.json
//       重扫 digest/快照目录，重算 sha256 与 stats，保留人工填写字段（仅 draft 可刷新）
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASELINE_ID_RE = /^baseline-v([1-9]\d*)$/;
const DIGEST_SCHEMA_VERSIONS = ['0.2.0', '0.3.0'];

function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function toPosix(p) {
  return p.split(sep).join('/');
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

function digestStats(digest) {
  const count = (key) => (Array.isArray(digest[key]) ? digest[key].length : 0);
  return {
    process_elements: count('process_elements'),
    process_objectives: count('process_objectives'),
    risks: count('risks'),
    controls: count('controls'),
    flow_edges: count('flow_edges'),
  };
}

function collectDigests(root, explicitPaths, warnings) {
  let files = explicitPaths.map((p) => resolve(p));
  if (files.length === 0) {
    const digestsDir = join(root, 'policy-digests');
    if (existsSync(digestsDir)) {
      files = listFilesRecursive(digestsDir).filter((f) => f.endsWith('digest.json'));
    }
  }
  const digests = [];
  for (const file of files) {
    let digest;
    try {
      digest = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      warnings.push(`digest 解析失败，已跳过：${file}（${e.message}）`);
      continue;
    }
    const version = digest.digest_schema_version;
    if (!DIGEST_SCHEMA_VERSIONS.includes(version)) {
      warnings.push(`digest_schema_version=${version || '(缺失)'} 非受支持版本（${DIGEST_SCHEMA_VERSIONS.join('/')}），已跳过：${file}`);
      continue;
    }
    if (digest.status === 'superseded') warnings.push(`digest 已被取代（status=superseded）：${file}；确认是否应引用其新版本`);
    if (digest.status === 'draft') warnings.push(`digest 仍为 draft：${file}；冻结基线前应完成评审`);
    digests.push({
      doc_id: digest.document_identity?.doc_id || digest.digest_id || '(未知)',
      digest_ref: toPosix(relative(root, file)),
      digest_schema_version: version,
      sha256: sha256Of(file),
      stats: digestStats(digest),
    });
  }
  return digests;
}

function collectSnapshots(root, previous = []) {
  const snapshotsDir = join(root, 'snapshots');
  if (!existsSync(snapshotsDir)) return [];
  const byPath = new Map(previous.map((s) => [s.path, s]));
  return listFilesRecursive(snapshotsDir).map((file) => {
    const rel = toPosix(relative(root, file));
    const old = byPath.get(rel) || {};
    return {
      path: rel,
      source_system: old.source_system || null,
      description: old.description ?? null,
      acquired_at: old.acquired_at || null,
      data_window: old.data_window ?? null,
      sha256: sha256Of(file),
      record_count: old.record_count ?? null,
    };
  });
}

function nextVersion(baselinesDir) {
  if (!existsSync(baselinesDir)) return 1;
  let max = 0;
  for (const name of readdirSync(baselinesDir)) {
    const m = name.match(/^baseline-v(\d+)\.json$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function buildBaseline({ root, version, warnings }) {
  const metaPath = join(root, 'meta.json');
  let meta = {};
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { warnings.push('meta.json 解析失败，assessment_id/scope 需手工补全'); }
  } else {
    warnings.push('未找到 meta.json（请先运行 scaffold-assessment.mjs），assessment_id/scope 需手工补全');
  }
  const previousId = version > 1 ? `baseline-v${version - 1}` : null;
  return {
    baseline_schema_version: '0.1.0',
    baseline_id: `baseline-v${version}`,
    assessment_id: meta.assessment_id || 'PA-0000-000',
    status: 'draft',
    created_at: new Date().toISOString(),
    frozen_at: null,
    supersedes: previousId && existsSync(join(root, 'baselines', `${previousId}.json`)) ? previousId : null,
    superseded_by: null,
    scope: {
      processes: Array.isArray(meta.processes) && meta.processes.length ? meta.processes : [{ name: '(待填写)', l3_ref: null, org: null }],
      data_window: null,
      wave: meta.wave ?? null,
    },
    digests: collectDigests(root, [], warnings),
    metrics: [],
    snapshots: collectSnapshots(root),
    data_gaps: [],
    notes: null,
  };
}

function refreshBaseline(root, baselineFile, warnings) {
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
  if (baseline.status === 'frozen') throw new Error(`基线已冻结（frozen），禁止刷新：${baselineFile}；内容变更请创建新版本`);
  const freshDigests = collectDigests(root, [], warnings);
  const digestByRef = new Map((baseline.digests || []).map((d) => [d.digest_ref, d]));
  baseline.digests = freshDigests.map((d) => ({ ...d, ...(digestByRef.has(d.digest_ref) ? {} : {}) }));
  baseline.snapshots = collectSnapshots(root, baseline.snapshots || []);
  writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  return baseline;
}

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function optionsAll(args, name) {
  const out = [];
  args.forEach((a, i) => { if (a === name && args[i + 1]) out.push(args[i + 1]); });
  return out;
}

function runCli() {
  const args = process.argv.slice(2);
  const root = args[0]?.startsWith('--') ? null : args[0];
  if (!root) {
    throw new Error('用法: node scaffold-baseline.mjs <assessment_root> [--version N] [--digest <路径>]... [--force]\n       node scaffold-baseline.mjs <assessment_root> --refresh <baseline 文件>');
  }
  const absRoot = resolve(root);
  if (!existsSync(absRoot)) throw new Error(`评价根目录不存在：${absRoot}`);
  const warnings = [];

  const refreshTarget = option(args, '--refresh');
  if (refreshTarget) {
    const file = resolve(absRoot, refreshTarget);
    if (!existsSync(file)) throw new Error(`基线文件不存在：${file}`);
    const baseline = refreshBaseline(absRoot, file, warnings);
    for (const w of warnings) console.log(`🟡 ${w}`);
    console.log(`✓ 已刷新基线草稿：${file}`);
    console.log(`  digest：${baseline.digests.length} 份 ｜ 快照：${baseline.snapshots.length} 份（sha256 已重算，人工填写字段已保留）`);
    return;
  }

  const baselinesDir = join(absRoot, 'baselines');
  mkdirSync(baselinesDir, { recursive: true });
  const version = Number(option(args, '--version')) || nextVersion(baselinesDir);
  const target = join(baselinesDir, `baseline-v${version}.json`);
  if (existsSync(target) && !args.includes('--force')) {
    throw new Error(`基线文件已存在：${target}；基线 Append-Only，如需重建请加 --force，否则用 --version ${nextVersion(baselinesDir)} 创建新版本`);
  }
  const baseline = buildBaseline({ root: absRoot, version, warnings });
  const explicit = optionsAll(args, '--digest');
  if (explicit.length) baseline.digests = collectDigests(absRoot, explicit, warnings);
  writeFileSync(target, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

  for (const w of warnings) console.log(`🟡 ${w}`);
  console.log(`✓ 已生成基线草稿：${target}`);
  console.log(`  digest：${baseline.digests.length} 份 ｜ 快照：${baseline.snapshots.length} 份`);
  console.log('⚠ 下一步：');
  console.log('  1. 补全 scope.data_window、metrics（计算口径 + data_mapping）、快照的 source_system/acquired_at；');
  console.log('  2. 快照文件放入 snapshots/ 后可重跑 --refresh 重算哈希；');
  console.log('  3. 冻结前运行 validate-baseline.mjs 校验（0 错误），再把 status 改为 frozen 并填 frozen_at。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (e) { console.error(`🔴 ${e.message}`); process.exitCode = 1; }
}
