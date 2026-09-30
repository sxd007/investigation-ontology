#!/usr/bin/env node
// 评价发现校验器（零依赖）：按 process-assess-workflow/references/finding-contract.md 校验各维度 findings.yaml。
// 与 scaffold-dimension.mjs 互补——脚手架生成骨架，本脚本在 AI 填充真实数据后做契约/锚点/枚举/前缀纪律校验。
// 供四个能力技能（ASSESS 收尾）与 process-assess-workflow（REPORT 聚合前）复用。
//
// 用法:
//   node validate-findings.mjs <findings.yaml> [--strict] [--baseline <baseline-vN.json>]
//   --strict    把 warning 也按错误计（退出码非零）
//   --baseline  跨文件校验 anchor.baseline：version 须等于基线 baseline_id，snapshot_ref 须命中基线 snapshots[].path
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseYaml } from './yaml-lite.mjs';

// ---------- 契约常量（与 finding-contract.md 同步）----------
const DIMENSIONS = ['goal', 'risk', 'control', 'efficiency'];
const PREFIX_TO_DIM = { GA: 'goal', RC: 'risk', CT: 'control', ED: 'efficiency' };
const FINDING_TYPES = {
  goal: ['objective_missing', 'objective_vague', 'objective_unmeasurable', 'objective_conflict', 'goal_process_misaligned', 'kpi_absent', 'kpi_not_achieved', 'kpi_definition_unclear'],
  risk: ['risk_uncontrolled', 'risk_undercontrolled', 'risk_unidentified', 'control_orphaned', 'control_redundant', 'control_design_weak', 'control_risk_mismatch'],
  control: ['control_not_executed', 'control_bypassed', 'control_deviation', 'control_evidence_missing', 'exception_unlogged', 'segregation_conflict'],
  efficiency: ['bottleneck_wait', 'rework_loop', 'serial_redundancy', 'approval_overload', 'handoff_excess', 'cycle_time_outlier'],
};
const SEVERITIES = ['high', 'medium', 'low'];
const STATUSES = ['proposed', 'confirmed', 'provisional'];
const REC_SCOPES = ['policy_revision', 'execution_improvement', 'data_quality'];
const UPSTREAM_REVIEW = ['pending', 'resolved', 'n/a'];
const REQUIRED = ['finding_id', 'dimension', 'finding_type', 'severity', 'anchor', 'statement', 'evidence', 'recommendation'];
const DESIGN_LAYERS = ['goal', 'risk'];
const INSTANCE_LAYERS = ['control', 'efficiency'];

// ---------- 校验 ----------
const PLACEHOLDER_RE = /\{[^}]+\}/;

function hasPlaceholder(v) {
  if (typeof v === 'string') return PLACEHOLDER_RE.test(v);
  if (Array.isArray(v)) return v.some(hasPlaceholder);
  if (v && typeof v === 'object') return Object.values(v).some(hasPlaceholder);
  return false;
}

function validate(obj, baselineCtx = null) {
  const errors = [];
  const warnings = [];
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.findings)) {
    errors.push({ finding_id: '(root)', field: 'findings', msg: '缺少 findings 列表' });
    return { errors, warnings };
  }
  const seen = new Set();
  const allIds = new Set((obj.findings || []).filter((f) => f && typeof f === 'object' && typeof f.finding_id === 'string').map((f) => f.finding_id));
  for (const f of obj.findings) {
    const fid = (f && f.finding_id) || '(未知)';
    const at = (field, msg, level = 'error') => (level === 'error' ? errors : warnings).push({ finding_id: fid, field, msg });

    if (!f || typeof f !== 'object') { at('(item)', 'finding 不是映射'); continue; }
    for (const r of REQUIRED) if (!(r in f) || f[r] === null || f[r] === '') at(r, `必填字段缺失或为空`);

    // finding_id 前缀 + 维度一致
    if (typeof f.finding_id === 'string') {
      const m = f.finding_id.match(/^([A-Z]{2})-(\d{3})$/);
      if (!m) at('finding_id', `格式应为 前缀-3位序号（如 GA-001），实际：${f.finding_id}`);
      else {
        const dim = PREFIX_TO_DIM[m[1]];
        if (!dim) at('finding_id', `未知前缀 ${m[1]}（GA/RC/CT/ED）`);
        else if (f.dimension && f.dimension !== dim) at('finding_id', `前缀 ${m[1]} 表示 ${dim}，与 dimension=${f.dimension} 不一致`);
      }
      if (seen.has(f.finding_id)) at('finding_id', `重复 ID`);
      seen.add(f.finding_id);
    }

    if (f.dimension && !DIMENSIONS.includes(f.dimension)) at('dimension', `非法维度 ${f.dimension}`);
    if (f.finding_type) {
      const allowed = FINDING_TYPES[f.dimension] || [];
      if (!allowed.includes(f.finding_type)) at('finding_type', `维度 ${f.dimension || '?'} 不允许 ${f.finding_type}（允许：${allowed.join(' / ')}）`);
    }
    if (f.severity && !SEVERITIES.includes(f.severity)) at('severity', `非法 severity ${f.severity}`);
    if (f.status && !STATUSES.includes(f.status)) at('status', `非法 status ${f.status}`);
    if (f.recommendation_scope && !REC_SCOPES.includes(f.recommendation_scope)) at('recommendation_scope', `非法 recommendation_scope ${f.recommendation_scope}`);

    // 锚点纪律（§2）
    if (f.anchor && typeof f.anchor === 'object') {
      const hasDigest = f.anchor.digest && typeof f.anchor.digest === 'object';
      const hasBaseline = f.anchor.baseline && typeof f.anchor.baseline === 'object';
      if (!hasDigest && !hasBaseline) at('anchor', '至少需 digest 或 baseline 之一');
      if (DESIGN_LAYERS.includes(f.dimension) && !hasDigest) at('anchor.digest', `设计层(${f.dimension})发现必须含 anchor.digest`);
      if (INSTANCE_LAYERS.includes(f.dimension) && !hasBaseline) at('anchor.baseline', `实例层(${f.dimension})发现必须含 anchor.baseline`);
      if (hasDigest) for (const k of ['doc_id', 'block_id', 'element_ref']) if (!(k in f.anchor.digest)) at(`anchor.digest.${k}`, '缺失');
      if (hasBaseline) {
        for (const k of ['version', 'snapshot_ref', 'record_ref']) if (!(k in f.anchor.baseline)) at(`anchor.baseline.${k}`, '缺失');
        // 跨文件校验（--baseline）：锚点必须命中基线声明的版本与快照
        if (baselineCtx) {
          const b = f.anchor.baseline;
          if (b.version && b.version !== baselineCtx.baseline_id) {
            at('anchor.baseline.version', `与基线 ${baselineCtx.baseline_id} 不一致：${b.version}`);
          }
          if (b.snapshot_ref && !baselineCtx.snapshotPaths.has(b.snapshot_ref)) {
            at('anchor.baseline.snapshot_ref', `未命中基线 snapshots[].path：${b.snapshot_ref}（基线外未快照数据，违反锚点纪律 §2）`);
          }
        }
      }
    }

    // evidence 非空列表
    if (f.evidence !== undefined && f.evidence !== null) {
      if (!Array.isArray(f.evidence)) at('evidence', '应为列表');
      else if (f.evidence.length === 0) at('evidence', '不得为空列表');
      else if (f.evidence.some((e) => !e || String(e).trim() === '')) at('evidence', '含空条目');
    }

    // recommendation 非空（去占位符后）
    if (typeof f.recommendation === 'string' && f.recommendation.trim() === '') at('recommendation', '不得为空');

    // 可选字段
    if (f.cross_ref && typeof f.cross_ref === 'string') {
      if (!/^[A-Z]{2}-\d{3}$/.test(f.cross_ref)) at('cross_ref', `格式应为 前缀-3位序号，实际：${f.cross_ref}`, 'warn');
      else if (!allIds.has(f.cross_ref) && f.cross_ref !== fid) at('cross_ref', `引用 ${f.cross_ref} 不在本文件 findings 中`, 'warn');
    }
    if (f.status === 'provisional' && !f.upstream_review) at('upstream_review', 'status=provisional（DDR 待闭环）应填 upstream_review', 'warn');
    if (f.upstream_review && !UPSTREAM_REVIEW.includes(f.upstream_review)) at('upstream_review', `非法 upstream_review ${f.upstream_review}`, 'warn');
    if (!('owner_suggestion' in f) || !f.owner_suggestion) at('owner_suggestion', '建议责任方缺失', 'warn');

    // 占位符检测
    if (hasPlaceholder(f)) at('(值)', '存在未填充占位符 {...}', 'warn');
  }
  return { errors, warnings };
}

// ---------- CLI ----------
function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const baselineIdx = args.indexOf('--baseline');
  const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : null;
  const path = args.find((a, i) => !a.startsWith('--') && (baselineIdx < 0 || i !== baselineIdx + 1));
  if (!path) throw new Error('用法: node validate-findings.mjs <findings.yaml> [--strict] [--baseline <baseline-vN.json>]');
  const abs = resolve(path);
  if (!existsSync(abs)) throw new Error(`文件不存在：${abs}`);
  let baselineCtx = null;
  if (baselinePath) {
    const bAbs = resolve(baselinePath);
    if (!existsSync(bAbs)) throw new Error(`基线文件不存在：${bAbs}`);
    const b = JSON.parse(readFileSync(bAbs, 'utf8'));
    baselineCtx = { baseline_id: b.baseline_id, snapshotPaths: new Set((b.snapshots || []).map((s) => s && s.path).filter(Boolean)) };
  }
  let obj;
  try {
    obj = parseYaml(readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`YAML 解析失败：${e.message}`);
  }
  const { errors, warnings } = validate(obj, baselineCtx);
  const n = (obj.findings || []).length;
  console.log(`=== findings 校验：${abs} ===`);
  console.log(`发现数：${n} ｜ 错误：${errors.length} ｜ 警告：${warnings.length}`);
  for (const e of errors) console.log(`  🔴 [${e.finding_id}] ${e.field}: ${e.msg}`);
  for (const w of warnings) console.log(`  🟡 [${w.finding_id}] ${w.field}: ${w.msg}`);
  const bad = strict ? errors.length + warnings.length : errors.length;
  if (bad > 0) {
    console.log(`✗ 校验未通过（${strict ? 'strict' : '含错误'}）。`);
    process.exitCode = 1;
  } else {
    console.log('✓ 校验通过。');
  }
}

if (process.argv[1]) {
  try { runCli(); } catch (e) { console.error(`🔴 ${e.message}`); process.exitCode = 2; }
}
