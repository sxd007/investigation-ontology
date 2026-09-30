#!/usr/bin/env node
// evaluation-assertions 本地校验器（零依赖）：按 vendored schema
// references/schemas/evaluation-assertions-0.1.0.schema.json 与 assertion-projection.md 校验投影产物。
// 覆盖：结构（必填/枚举/XOR/附加属性）、supersedes 链完整性（指向存在/无环/不分叉）、未对齐率统计。
// 替代跨仓工具 ontology_domain/scripts/validate_evaluation_assertions.py 的插件内等价物。
//
// 用法:
//   node validate-evaluation-assertions.mjs <evaluation-assertions.yaml> [--strict]
//   --strict  把 warning 也按错误计（退出码非零）
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseYaml } from './yaml-lite.mjs';

const PREDICATES = [
  'proc:hasControlGap', 'proc:designEffectivenessAssessment', 'proc:operatingEffectivenessObservation',
  'proc:metricObservation', 'proc:bottleneckObservation', 'proc:reworkObservation', 'proc:objectiveQualityAssessment',
];
const ASSERTION_ID_RE = /^EAS-.+-\d+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const ROOT_KEYS = ['assertionsSchemaVersion', 'engagement', 'coreVersions', 'assertions'];
const ENGAGEMENT_KEYS = ['engagementId', 'tenant'];
const ASSERTION_KEYS = ['assertionId', 'target', 'predicate', 'value', 'evidence', 'sourceAssessment', 'sourceFinding', 'generatedAt', 'status', 'supersedesAssertion'];
const TARGET_KEYS = ['alignmentStatus', 'iri', 'digestRef'];
const COORD_KEYS = ['docId', 'elementRef'];
const VALUE_KEYS = ['severity', 'context'];
const EVIDENCE_KEYS = ['digest', 'baseline'];
const BASELINE_KEYS = ['version', 'snapshotRef'];

function validate(obj) {
  const errors = [];
  const warnings = [];
  const at = (id, field, msg, level = 'error') => (level === 'error' ? errors : warnings).push({ id, field, msg });

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    at('(root)', '(root)', '文件不是 YAML 映射');
    return { errors, warnings, stats: {} };
  }

  // ---- 根字段 ----
  for (const k of ROOT_KEYS) if (!(k in obj) || obj[k] === null || obj[k] === '') at('(root)', k, '必填字段缺失或为空');
  for (const k of Object.keys(obj)) if (!ROOT_KEYS.includes(k)) at('(root)', k, `未知字段（additionalProperties=false）`);
  if (obj.assertionsSchemaVersion && obj.assertionsSchemaVersion !== '0.1.0') {
    at('(root)', 'assertionsSchemaVersion', `应为 "0.1.0"，实际：${obj.assertionsSchemaVersion}`);
  }
  if (obj.engagement && typeof obj.engagement === 'object') {
    if (!obj.engagement.engagementId) at('(root)', 'engagement.engagementId', '缺失');
    for (const k of Object.keys(obj.engagement)) if (!ENGAGEMENT_KEYS.includes(k)) at('(root)', `engagement.${k}`, '未知字段');
  }
  if (obj.coreVersions && typeof obj.coreVersions === 'object') {
    for (const [k, v] of Object.entries(obj.coreVersions)) {
      if (!SEMVER_RE.test(String(v))) at('(root)', `coreVersions.${k}`, `版本应为 x.y.z，实际：${v}`);
    }
    if (!obj.coreVersions.proc) at('(root)', 'coreVersions.proc', '建议声明 proc Core 版本（谓词正式化基线）', 'warn');
  }
  if (obj.assertions !== undefined && !Array.isArray(obj.assertions)) at('(root)', 'assertions', '应为列表');
  const assertions = Array.isArray(obj.assertions) ? obj.assertions : [];
  if (Array.isArray(obj.assertions) && assertions.length === 0) at('(root)', 'assertions', 'minItems=1：空列表请删除该 key 或补全断言（投影无内容时不应产出本文件）', 'warn');

  // ---- 断言逐条 ----
  const seen = new Map();
  for (const [i, a] of assertions.entries()) {
    const id = (a && a.assertionId) || `(#${i + 1})`;
    if (!a || typeof a !== 'object') { at(id, '(item)', '断言不是映射'); continue; }
    for (const k of ['assertionId', 'target', 'predicate', 'value', 'evidence', 'sourceAssessment', 'sourceFinding', 'generatedAt', 'status']) {
      if (!(k in a) || a[k] === null || a[k] === '') at(id, k, '必填字段缺失或为空');
    }
    for (const k of Object.keys(a)) if (!ASSERTION_KEYS.includes(k)) at(id, k, '未知字段');

    if (typeof a.assertionId === 'string') {
      if (!ASSERTION_ID_RE.test(a.assertionId)) at(id, 'assertionId', `格式应为 EAS-{engagement_id}-NNN，实际：${a.assertionId}`);
      if (seen.has(a.assertionId)) at(id, 'assertionId', `重复 ID（首现于 ${seen.get(a.assertionId)}）`);
      seen.set(a.assertionId, id);
    }
    if (a.predicate && !PREDICATES.includes(a.predicate)) at(id, 'predicate', `不在 v0.1.0 谓词族：${a.predicate}`);
    if (a.status && !['proposed', 'confirmed'].includes(a.status)) {
      at(id, 'status', `非法 ${a.status}（proposed/confirmed；finding provisional 应在投影时归为 proposed）`);
    }
    if (a.generatedAt && !DATETIME_RE.test(a.generatedAt)) at(id, 'generatedAt', '应为 ISO date-time（带时区）', 'warn');

    // target XOR
    const t = a.target;
    if (t && typeof t === 'object') {
      for (const k of Object.keys(t)) if (!TARGET_KEYS.includes(k)) at(id, `target.${k}`, '未知字段');
      if (!t.alignmentStatus) at(id, 'target.alignmentStatus', '缺失');
      else if (!['aligned', 'unaligned'].includes(t.alignmentStatus)) at(id, 'target.alignmentStatus', `非法 ${t.alignmentStatus}`);
      else if (t.alignmentStatus === 'aligned') {
        if (!t.iri) at(id, 'target.iri', 'aligned 目标必填正式 IRI');
        if (t.digestRef) at(id, 'target.digestRef', 'aligned 目标禁带 digest 坐标（XOR）');
      } else {
        if (!t.digestRef) at(id, 'target.digestRef', 'unaligned 目标必填 digest 坐标');
        if (t.iri) at(id, 'target.iri', 'unaligned 目标禁带正式 IRI（XOR）');
        if (t.digestRef && typeof t.digestRef === 'object') {
          for (const k of ['docId', 'elementRef']) if (!t.digestRef[k]) at(id, `target.digestRef.${k}`, '缺失');
          for (const k of Object.keys(t.digestRef)) if (!COORD_KEYS.includes(k)) at(id, `target.digestRef.${k}`, '未知字段');
        }
      }
    }

    // value
    if (a.value && typeof a.value === 'object') {
      if (!a.value.severity) at(id, 'value.severity', '缺失');
      for (const k of Object.keys(a.value)) if (!VALUE_KEYS.includes(k)) at(id, `value.${k}`, '未知字段');
    }

    // evidence 双源
    const ev = a.evidence;
    if (ev && typeof ev === 'object') {
      for (const k of Object.keys(ev)) if (!EVIDENCE_KEYS.includes(k)) at(id, `evidence.${k}`, '未知字段');
      if (!ev.digest) at(id, 'evidence.digest', '缺失（双源证据缺一不可）');
      else if (typeof ev.digest === 'object') {
        for (const k of ['docId', 'elementRef']) if (!ev.digest[k]) at(id, `evidence.digest.${k}`, '缺失');
        for (const k of Object.keys(ev.digest)) if (!COORD_KEYS.includes(k)) at(id, `evidence.digest.${k}`, '未知字段');
      }
      if (!ev.baseline) at(id, 'evidence.baseline', '缺失（双源证据缺一不可）');
      else if (typeof ev.baseline === 'object') {
        for (const k of ['version', 'snapshotRef']) if (!ev.baseline[k]) at(id, `evidence.baseline.${k}`, '缺失');
        for (const k of Object.keys(ev.baseline)) if (!BASELINE_KEYS.includes(k)) at(id, `evidence.baseline.${k}`, '未知字段');
      }
    }
    if (a.supersedesAssertion && typeof a.supersedesAssertion !== 'string') at(id, 'supersedesAssertion', '应为 assertionId 字符串');
  }

  // ---- supersedes 链完整性 ----
  const ids = new Set([...seen.keys()]);
  const supersededBy = new Map();
  for (const a of assertions) {
    if (!a || typeof a !== 'object' || !a.supersedesAssertion || typeof a.supersedesAssertion !== 'string') continue;
    const id = a.assertionId || '(未知)';
    const old = a.supersedesAssertion;
    if (old === a.assertionId) at(id, 'supersedesAssertion', '不得指向自身');
    else if (!ids.has(old)) at(id, 'supersedesAssertion', `指向不存在的断言 ${old}`);
    if (supersededBy.has(old)) at(id, 'supersedesAssertion', `分叉：${old} 已被 ${supersededBy.get(old)} 重写，一个旧断言只能被一个后继重写`);
    supersededBy.set(old, id);
  }
  // 无环：沿 supersedesAssertion 反向走
  const nextOf = new Map(assertions.filter((a) => a && a.supersedesAssertion).map((a) => [a.assertionId, a.supersedesAssertion]));
  for (const start of ids) {
    const visited = new Set();
    let cur = start;
    while (cur && nextOf.has(cur)) {
      if (visited.has(cur)) { at(start, 'supersedesAssertion', `检测到环（经 ${cur}）`); break; }
      visited.add(cur);
      cur = nextOf.get(cur);
    }
  }

  const unaligned = assertions.filter((a) => a && a.target && a.target.alignmentStatus === 'unaligned').length;
  const stats = { total: assertions.length, unaligned, aligned: assertions.length - unaligned };
  return { errors, warnings, stats };
}

function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) throw new Error('用法: node validate-evaluation-assertions.mjs <evaluation-assertions.yaml> [--strict]');
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`文件不存在：${abs}`);
  let obj;
  try {
    obj = parseYaml(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`YAML 解析失败：${e.message}`);
  }
  const { errors, warnings, stats } = validate(obj);
  console.log(`=== evaluation-assertions 校验：${abs} ===`);
  console.log(`断言：${stats.total ?? 0}（unaligned ${stats.unaligned ?? 0} / aligned ${stats.aligned ?? 0}） ｜ 错误：${errors.length} ｜ 警告：${warnings.length}`);
  for (const e of errors) console.log(`  🔴 [${e.id}] ${e.field}: ${e.msg}`);
  for (const w of warnings) console.log(`  🟡 [${w.id}] ${w.field}: ${w.msg}`);
  if (stats.total) console.log(`未对齐率：${Math.round((stats.unaligned / stats.total) * 100)}%（PENDING_CORE_ALIGNMENT 沉淀进度参考）`);
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
