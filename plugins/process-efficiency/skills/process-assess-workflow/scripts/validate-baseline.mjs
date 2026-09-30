#!/usr/bin/env node
// 评价基线校验器（零依赖）：按 references/schemas/assessment-baseline-0.1.0.schema.json 与
// references/baseline-contract.md 校验 baselines/baseline-v{N}.json。
// 覆盖：必填/枚举/格式、digest 与快照文件存在性、sha256 实测比对、冻结纪律、版本链（supersedes/superseded_by）。
// 冻结（status→frozen）前应 0 错误；门禁 baseline_frozen 建议加 --strict。
//
// 用法:
//   node validate-baseline.mjs <baseline-vN.json> [--no-verify-hashes] [--strict]
//   --no-verify-hashes  跳过 sha256 实测比对（仅查格式，用于快照文件暂不可达的机器）
//   --strict            把 warning 也按错误计（退出码非零）
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA256_RE = /^[0-9a-f]{64}$/;
const BASELINE_ID_RE = /^baseline-v[1-9]\d*$/;
const ASSESSMENT_ID_RE = /^PA-\d{4}-\d{3}$/;
const DIGEST_SCHEMA_VERSIONS = ['0.2.0', '0.3.0'];
const REASON_TYPES = ['evaluator_gap', 'provider_gap'];
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sha256Of(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function validate(baseline, { root, verifyHashes }) {
  const errors = [];
  const warnings = [];
  const at = (field, msg, level = 'error') => (level === 'error' ? errors : warnings).push({ field, msg });

  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    at('(root)', '基线不是 JSON 对象');
    return { errors, warnings };
  }

  // ---- 根字段 ----
  for (const key of ['baseline_schema_version', 'baseline_id', 'assessment_id', 'status', 'created_at', 'scope', 'digests', 'metrics', 'snapshots', 'data_gaps']) {
    if (!(key in baseline) || baseline[key] === null || baseline[key] === '') at(key, '必填字段缺失或为空');
  }
  if (baseline.baseline_schema_version && baseline.baseline_schema_version !== '0.1.0') {
    at('baseline_schema_version', `应为 0.1.0，实际：${baseline.baseline_schema_version}`);
  }
  if (baseline.baseline_id && !BASELINE_ID_RE.test(baseline.baseline_id)) {
    at('baseline_id', `格式应为 baseline-v{N}（N≥1），实际：${baseline.baseline_id}`);
  }
  if (baseline.assessment_id && !ASSESSMENT_ID_RE.test(baseline.assessment_id)) {
    at('assessment_id', `格式应为 PA-YYYY-NNN，实际：${baseline.assessment_id}`);
  }
  if (baseline.status && !['draft', 'frozen'].includes(baseline.status)) at('status', `非法状态 ${baseline.status}（draft/frozen）`);
  if (baseline.created_at && !DATETIME_RE.test(baseline.created_at)) at('created_at', '应为 ISO date-time', 'warn');
  if (baseline.frozen_at && !DATETIME_RE.test(baseline.frozen_at)) at('frozen_at', '应为 ISO date-time', 'warn');
  if (baseline.supersedes && !BASELINE_ID_RE.test(baseline.supersedes)) at('supersedes', `格式应为 baseline-v{N}，实际：${baseline.supersedes}`);
  if (baseline.superseded_by && !BASELINE_ID_RE.test(baseline.superseded_by)) at('superseded_by', `格式应为 baseline-v{N}，实际：${baseline.superseded_by}`);

  // ---- scope ----
  const scope = baseline.scope;
  if (scope && typeof scope === 'object') {
    if (!Array.isArray(scope.processes) || scope.processes.length === 0) at('scope.processes', '至少一个目标流程');
    else {
      for (const [i, p] of scope.processes.entries()) {
        if (!p || typeof p !== 'object' || !p.name) at(`scope.processes[${i}].name`, '缺失');
        if (p && p.name === '(待填写)') at(`scope.processes[${i}].name`, '仍是脚手架占位', 'warn');
        if (p && p.l3_ref === 'PENDING-CONFIRMATION') at(`scope.processes[${i}].l3_ref`, 'L3 标识待确认', 'warn');
      }
    }
    for (const w of [scope.data_window]) {
      if (w && typeof w === 'object') {
        if (!DATE_RE.test(w.start || '')) at('scope.data_window.start', '应为 YYYY-MM-DD');
        if (!DATE_RE.test(w.end || '')) at('scope.data_window.end', '应为 YYYY-MM-DD');
      }
    }
  }

  // ---- digests ----
  const digests = Array.isArray(baseline.digests) ? baseline.digests : [];
  const seenDocs = new Set();
  for (const [i, d] of digests.entries()) {
    const p = (k) => `digests[${i}].${k}`;
    if (!d || typeof d !== 'object') { at(`digests[${i}]`, '不是对象'); continue; }
    for (const k of ['doc_id', 'digest_ref', 'digest_schema_version', 'sha256']) {
      if (!d[k]) at(p(k), '缺失');
    }
    if (d.doc_id) {
      if (seenDocs.has(d.doc_id)) at(p('doc_id'), `重复 doc_id ${d.doc_id}`);
      seenDocs.add(d.doc_id);
    }
    if (d.digest_schema_version && !DIGEST_SCHEMA_VERSIONS.includes(d.digest_schema_version)) {
      at(p('digest_schema_version'), `非受支持版本 ${d.digest_schema_version}（${DIGEST_SCHEMA_VERSIONS.join('/')}）`);
    }
    if (d.sha256 && !SHA256_RE.test(d.sha256)) at(p('sha256'), '应为 64 位小写十六进制');
    if (d.digest_ref) {
      if (d.digest_ref.includes('\\')) at(p('digest_ref'), '路径须用 POSIX 分隔符（/）');
      const file = join(root, d.digest_ref);
      if (!existsSync(file)) at(p('digest_ref'), `文件不存在：${d.digest_ref}`);
      else {
        let digest = null;
        try { digest = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { at(p('digest_ref'), `digest JSON 解析失败：${e.message}`); }
        if (digest) {
          const actualDoc = digest.document_identity?.doc_id || digest.digest_id;
          if (d.doc_id && actualDoc && d.doc_id !== actualDoc) at(p('doc_id'), `与 digest 内 doc_id 不一致（${actualDoc}）`);
          if (digest.status === 'superseded') at(p('digest_ref'), 'digest 已被取代（status=superseded），应改引新版本', 'warn');
          if (digest.status === 'draft') at(p('digest_ref'), 'digest 仍为 draft，冻结前应完成评审', 'warn');
          const pending = Array.isArray(digest.issues) ? digest.issues.filter((x) => x && x.blocking) : [];
          if (pending.length) at(p('digest_ref'), `digest 含 ${pending.length} 个 blocking issue（门禁 digests_completed 要求清零或显式豁免）`, 'warn');
        }
        if (verifyHashes && d.sha256 && SHA256_RE.test(d.sha256)) {
          const actual = sha256Of(file);
          if (actual !== d.sha256) at(p('sha256'), `与文件实测不一致（实测 ${actual.slice(0, 12)}…）——digest 已变更，需重跑 scaffold-baseline --refresh 或升级基线版本`);
        }
      }
    }
  }

  // ---- metrics ----
  const metrics = Array.isArray(baseline.metrics) ? baseline.metrics : [];
  const seenMetrics = new Set();
  const snapshotPaths = new Set((Array.isArray(baseline.snapshots) ? baseline.snapshots : []).map((s) => s && s.path).filter(Boolean));
  for (const [i, m] of metrics.entries()) {
    const p = (k) => `metrics[${i}].${k}`;
    if (!m || typeof m !== 'object') { at(`metrics[${i}]`, '不是对象'); continue; }
    for (const k of ['metric_id', 'name', 'definition', 'data_mapping']) if (!m[k]) at(p(k), '缺失');
    if (m.metric_id) {
      if (seenMetrics.has(m.metric_id)) at(p('metric_id'), `重复 metric_id ${m.metric_id}`);
      seenMetrics.add(m.metric_id);
    }
    if (m.data_mapping && typeof m.data_mapping === 'object') {
      if (!m.data_mapping.source_system) at(p('data_mapping.source_system'), '缺失');
      if (!m.data_mapping.field) at(p('data_mapping.field'), '缺失');
    }
    if (m.snapshot_ref && !snapshotPaths.has(m.snapshot_ref)) at(p('snapshot_ref'), `引用的快照未在 snapshots 中声明：${m.snapshot_ref}`);
  }

  // ---- snapshots ----
  const snapshots = Array.isArray(baseline.snapshots) ? baseline.snapshots : [];
  const seenPaths = new Set();
  for (const [i, s] of snapshots.entries()) {
    const p = (k) => `snapshots[${i}].${k}`;
    if (!s || typeof s !== 'object') { at(`snapshots[${i}]`, '不是对象'); continue; }
    for (const k of ['path', 'source_system', 'acquired_at', 'sha256']) if (!s[k]) at(p(k), '缺失');
    if (s.path) {
      if (seenPaths.has(s.path)) at(p('path'), `重复路径 ${s.path}`);
      seenPaths.add(s.path);
      if (s.path.includes('\\')) at(p('path'), '路径须用 POSIX 分隔符（/）');
      const file = join(root, s.path);
      if (!existsSync(file)) at(p('path'), `文件不存在：${s.path}`);
      else if (verifyHashes && s.sha256 && SHA256_RE.test(s.sha256)) {
        const actual = sha256Of(file);
        if (actual !== s.sha256) at(p('sha256'), `与文件实测不一致（实测 ${actual.slice(0, 12)}…）——快照已变更，基线可复现性被破坏`);
      }
    }
    if (s.sha256 && !SHA256_RE.test(s.sha256)) at(p('sha256'), '应为 64 位小写十六进制');
    if (s.acquired_at && !DATETIME_RE.test(s.acquired_at)) at(p('acquired_at'), '应为 ISO date-time', 'warn');
    if (s.record_count !== null && s.record_count !== undefined && (!Number.isInteger(s.record_count) || s.record_count < 0)) at(p('record_count'), '应为非负整数');
    if (s.data_window && typeof s.data_window === 'object') {
      if (!DATE_RE.test(s.data_window.start || '')) at(p('data_window.start'), '应为 YYYY-MM-DD');
      if (!DATE_RE.test(s.data_window.end || '')) at(p('data_window.end'), '应为 YYYY-MM-DD');
    }
  }

  // ---- data_gaps ----
  const gaps = Array.isArray(baseline.data_gaps) ? baseline.data_gaps : [];
  for (const [i, g] of gaps.entries()) {
    const p = (k) => `data_gaps[${i}].${k}`;
    if (!g || typeof g !== 'object') { at(`data_gaps[${i}]`, '不是对象'); continue; }
    for (const k of ['source', 'reason_type', 'impact']) if (!g[k]) at(p(k), '缺失');
    if (g.reason_type && !REASON_TYPES.includes(g.reason_type)) at(p('reason_type'), `非法 ${g.reason_type}（${REASON_TYPES.join('/')}）`);
  }

  // ---- 冻结纪律 ----
  if (baseline.status === 'frozen') {
    if (!baseline.frozen_at) at('frozen_at', '冻结基线必须填 frozen_at');
    if (digests.length === 0) at('digests', '冻结基线至少引用一份 digest');
    for (const [i, s] of snapshots.entries()) {
      if (s && !s.sha256) at(`snapshots[${i}].sha256`, '冻结基线的快照必须有 sha256');
    }
    if (metrics.length === 0) at('metrics', '冻结基线未定义任何指标（门禁 metrics_defined）', 'warn');
    if (gaps.length > 0) at('data_gaps', `${gaps.length} 项数据缺口已归因，确认降级影响已写入报告限制`, 'warn');
  }
  if (baseline.status === 'draft' && baseline.frozen_at) at('frozen_at', 'draft 状态不应有 frozen_at');

  // ---- 版本链（Append-Only）----
  const dir = join(root, 'baselines');
  if (existsSync(dir) && baseline.baseline_id && BASELINE_ID_RE.test(baseline.baseline_id)) {
    const n = Number(baseline.baseline_id.match(/(\d+)$/)[1]);
    if (n > 1 && !baseline.supersedes) at('supersedes', `v${n} 应声明 supersedes=baseline-v${n - 1}`, 'warn');
    if (baseline.supersedes) {
      const prev = join(dir, `${baseline.supersedes}.json`);
      if (!existsSync(prev)) at('supersedes', `被取代的基线文件不存在：baselines/${baseline.supersedes}.json`);
      else {
        try {
          const prevObj = JSON.parse(readFileSync(prev, 'utf8'));
          if (prevObj.superseded_by !== baseline.baseline_id) {
            at('supersedes', `${baseline.supersedes}.json 的 superseded_by=${prevObj.superseded_by ?? 'null'}，未回指 ${baseline.baseline_id}`, 'warn');
          }
        } catch { /* 上一版本损坏不影响本版校验 */ }
      }
    }
    if (baseline.superseded_by) {
      if (!existsSync(join(dir, `${baseline.superseded_by}.json`))) at('superseded_by', `新版本文件不存在：baselines/${baseline.superseded_by}.json`, 'warn');
      if (baseline.status !== 'frozen') at('superseded_by', '已有后继版本的基线应处于 frozen 状态', 'warn');
    }
  }
  return { errors, warnings };
}

function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const verifyHashes = !args.includes('--no-verify-hashes');
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) throw new Error('用法: node validate-baseline.mjs <baseline-vN.json> [--no-verify-hashes] [--strict]');
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`文件不存在：${abs}`);

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`JSON 解析失败：${e.message}`);
  }

  // 评价根 = baselines/ 的父目录（基线文件位于 <root>/baselines/ 下）；不在则退化为基线所在目录
  const parent = dirname(abs);
  const root = basename(parent) === 'baselines' ? dirname(parent) : parent;
  if (baseline.baseline_id && basename(abs) !== `${baseline.baseline_id}.json`) {
    console.log(`🟡 (文件名) 与 baseline_id 不一致：${basename(abs)}`);
  }
  const { errors, warnings } = validate(baseline, { root, verifyHashes });
  console.log(`=== 基线校验：${abs} ===`);
  console.log(`评价根：${root} ｜ digest：${(baseline.digests || []).length} ｜ 指标：${(baseline.metrics || []).length} ｜ 快照：${(baseline.snapshots || []).length} ｜ 哈希实测：${verifyHashes ? '开' : '关'}`);
  console.log(`错误：${errors.length} ｜ 警告：${warnings.length}`);
  for (const e of errors) console.log(`  🔴 ${e.field}: ${e.msg}`);
  for (const w of warnings) console.log(`  🟡 ${w.field}: ${w.msg}`);
  const bad = strict ? errors.length + warnings.length : errors.length;
  if (bad > 0) {
    console.log(`✗ 校验未通过（${strict ? 'strict' : '含错误'}）。`);
    process.exitCode = 1;
  } else {
    console.log('✓ 校验通过。');
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (e) { console.error(`🔴 ${e.message}`); process.exitCode = 2; }
}
