#!/usr/bin/env node
// 评价发现聚合器（零依赖）：REPORT 阶段把各维度 findings.yaml 收敛为 assessment_report.md 评级/建议清单，
// 并按 assertion-projection.md（可选）投影 evaluation-assertions.yaml 供本体层摄取。
// 与 validate-findings.mjs 互补——聚合前应先对每维度 findings.yaml 跑校验（0 错误）。
//
// 用法:
//   node aggregate-findings.mjs <assessment_root> [--no-projection]
//   assessment_root 为含 meta.json 与 01_assessments/{goal,risk,control,efficiency}/ 的目录
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseYaml } from './yaml-lite.mjs';

const DIMENSIONS = ['goal', 'risk', 'control', 'efficiency'];
const DIM_LABEL = { goal: '目标对齐（G）', risk: '风险控制（R）', control: '控制测试（C）', efficiency: '效率诊断（E）' };
const SEV_RANK = { high: 3, medium: 2, low: 1 };
const SCOPE_LABEL = { policy_revision: '制度修订', execution_improvement: '执行改善', data_quality: '数据质量' };

// §2 finding_type → 谓词映射（v0.1.0 谓词族）
const PREDICATE_MAP = {
  risk_uncontrolled: 'proc:hasControlGap',
  risk_undercontrolled: 'proc:hasControlGap',
  control_design_weak: 'proc:designEffectivenessAssessment',
  control_not_executed: 'proc:operatingEffectivenessObservation',
  control_bypassed: 'proc:operatingEffectivenessObservation',
  kpi_not_achieved: 'proc:metricObservation',
  kpi_absent: 'proc:metricObservation',
  kpi_definition_unclear: 'proc:metricObservation',
  bottleneck_wait: 'proc:bottleneckObservation',
  cycle_time_outlier: 'proc:bottleneckObservation',
  rework_loop: 'proc:reworkObservation',
  objective_missing: 'proc:objectiveQualityAssessment',
  objective_vague: 'proc:objectiveQualityAssessment',
  objective_unmeasurable: 'proc:objectiveQualityAssessment',
  objective_conflict: 'proc:objectiveQualityAssessment',
  goal_process_misaligned: 'proc:objectiveQualityAssessment',
};

function q(s) {
  // 标量加双引号，保证手工 YAML 安全（含 #、: 等）
  if (s === null || s === undefined) return '""';
  return `"${String(s).replace(/"/g, '\\"')}"`;
}

function loadDimensions(root) {
  const result = [];
  for (const dim of DIMENSIONS) {
    const p = join(root, '01_assessments', dim, 'findings.yaml');
    if (!existsSync(p)) continue;
    let obj;
    try {
      obj = parseYaml(readFileSync(p, 'utf8'));
    } catch (e) {
      throw new Error(`解析 ${p} 失败：${e.message}`);
    }
    const list = Array.isArray(obj.findings) ? obj.findings : [];
    for (const f of list) if (f && typeof f === 'object') result.push({ ...f, dimension: f.dimension || dim });
  }
  return result;
}

function posture(high, medium, low) {
  if (high > 0) return `存在 ${high} 项 high 级发现，须优先处置并跟踪整改。`;
  if (medium > 0) return `以 ${medium} 项 medium 级为主，建议排期改进。`;
  if (low > 0) return `以 ${low} 项 low 级为主，属优化空间。`;
  return `未发现需处置的发现。`;
}

function buildReport(assessmentId, all, coverage, projectionPath) {
  const total = all.length;
  const bySev = { high: 0, medium: 0, low: 0 };
  const byDim = { goal: 0, risk: 0, control: 0, efficiency: 0 };
  for (const f of all) {
    if (f.severity in bySev) bySev[f.severity]++;
    if (byDim[f.dimension] !== undefined) byDim[f.dimension]++;
  }
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# 流程评价报告（assessment_report.md）`);
  lines.push('');
  lines.push(`> 评价 ID：${assessmentId} ｜ 生成：${date} ｜ 覆盖维度：${DIMENSIONS.filter((d) => byDim[d] > 0).map((d) => DIM_LABEL[d]).join('、') || '（无）'}`);
  lines.push('');
  lines.push(`## 评级结论`);
  lines.push('');
  lines.push(`- 发现总数：**${total}**（high ${bySev.high} / medium ${bySev.medium} / low ${bySev.low}）`);
  for (const d of DIMENSIONS) if (byDim[d] > 0) lines.push(`- ${DIM_LABEL[d]}：${byDim[d]} 项`);
  lines.push(`- 整体态势：${posture(bySev.high, bySev.medium, bySev.low)}`);
  lines.push('');

  // 发现明细（按维度）
  lines.push(`## 发现明细`);
  lines.push('');
  for (const dim of DIMENSIONS) {
    const fs = all.filter((f) => f.dimension === dim);
    if (fs.length === 0) continue;
    lines.push(`### ${DIM_LABEL[dim]}`);
    lines.push('');
    lines.push(`| ID | 类型 | severity | 状态 | 发现 | 交叉 |`);
    lines.push(`|----|------|---------|------|------|------|`);
    for (const f of fs) lines.push(`| ${f.finding_id} | ${f.finding_type} | ${f.severity || '?'} | ${f.status || '?'} | ${f.statement || ''} | ${f.cross_ref || '—'} |`);
    lines.push('');
    for (const f of fs) {
      lines.push(`**${f.finding_id} · ${f.finding_type}**（${f.severity}）**`);
      if (Array.isArray(f.evidence) && f.evidence.length) {
        lines.push(`- 证据：${f.evidence.map((e) => String(e)).join('；')}`);
      }
      lines.push(`- 建议：${f.recommendation || '（未填）'}${f.recommendation_scope ? `（${SCOPE_LABEL[f.recommendation_scope] || f.recommendation_scope}）` : ''}${f.owner_suggestion ? ` ｜ 责任方：${f.owner_suggestion}` : ''}`);
      lines.push('');
    }
  }

  // 改进建议清单（按 scope）
  lines.push(`## 改进建议清单`);
  lines.push('');
  for (const scope of ['policy_revision', 'execution_improvement', 'data_quality']) {
    const fs = all.filter((f) => f.recommendation_scope === scope);
    lines.push(`### ${SCOPE_LABEL[scope]}`);
    lines.push('');
    if (fs.length === 0) lines.push(`- （无）`);
    else for (const f of fs) lines.push(`- [${f.finding_id}] ${f.recommendation}${f.owner_suggestion ? ` ｜ 责任方：${f.owner_suggestion}` : ''}`);
    lines.push('');
  }

  // 限制与投影覆盖率
  lines.push(`## 限制与投影覆盖率`);
  lines.push('');
  lines.push(`- 可投影 finding：${coverage.projected} / 总 ${total}（双锚点 digest+baseline 且谓词族覆盖）`);
  if (coverage.skipped.length) {
    lines.push(`- 跳过（不投影）原因：`);
    for (const s of coverage.skipped) lines.push(`  - ${s.finding_id}：${s.reason}`);
  } else if (total > 0) {
    lines.push(`- 跳过（不投影）：无`);
  }
  lines.push(`- 投影产物：${projectionPath || '（未生成，--no-projection）'}`);
  lines.push(`- 注：聚合前各维度 findings.yaml 应已通过 validate-findings.mjs（0 错误）。`);
  lines.push('');
  return lines.join('\n');
}

function buildProjection(assessmentId, all) {
  const projected = [];
  const skipped = [];
  let n = 0;
  for (const f of all) {
    const hasDigest = f.anchor && f.anchor.digest && typeof f.anchor.digest === 'object';
    const hasBaseline = f.anchor && f.anchor.baseline && typeof f.anchor.baseline === 'object';
    const predicate = PREDICATE_MAP[f.finding_type];
    if (!hasDigest || !hasBaseline) { skipped.push({ finding_id: f.finding_id, reason: '非双锚点（缺 digest 或 baseline）' }); continue; }
    if (!predicate) { skipped.push({ finding_id: f.finding_id, reason: `finding_type ${f.finding_type} 无谓词映射（v0.1.0 未覆盖）` }); continue; }
    n++;
    const ea = [];
    const d = f.anchor.digest;
    const b = f.anchor.baseline;
    const snapRef = b.record_ref ? `${b.snapshot_ref}#${b.record_ref}` : b.snapshot_ref;
    ea.push(`- assertionId: ${q(`EAS-${assessmentId}-${String(n).padStart(3, '0')}`)}`);
    ea.push(`  target:`);
    ea.push(`    alignmentStatus: ${q('unaligned')}`);
    ea.push(`    digestRef:`);
    ea.push(`      docId: ${q(d.doc_id)}`);
    ea.push(`      elementRef: ${q(d.element_ref)}`);
    ea.push(`  predicate: ${q(predicate)}`);
    ea.push(`  value:`);
    ea.push(`    severity: ${q(f.severity || 'medium')}`);
    ea.push(`    context: ${q(f.statement || '')}`);
    ea.push(`  evidence:`);
    ea.push(`    digest:`);
    ea.push(`      docId: ${q(d.doc_id)}`);
    ea.push(`      elementRef: ${q(d.element_ref)}`);
    ea.push(`    baseline:`);
    ea.push(`      version: ${q(b.version)}`);
    ea.push(`      snapshotRef: ${q(snapRef)}`);
    ea.push(`  sourceAssessment: ${q(assessmentId)}`);
    ea.push(`  sourceFinding: ${q(f.finding_id)}`);
    ea.push(`  generatedAt: ${q(new Date().toISOString())}`);
    ea.push(`  status: ${q(f.status || 'proposed')}`);
    projected.push(ea.join('\n'));
  }
  const header = [
    `# 评价断言投影（evaluation-assertions.yaml）`,
    `# 按 assertion-projection.md 生成；schema 权威：ontology_framework evaluation-assertions.schema.json (v0.1.0)`,
    `# 评价闭环不依赖本投影；投影失败不阻塞 REPORT 门禁。`,
    `assertionsSchemaVersion: ${q('0.1.0')}`,
    `engagement:`,
    `  engagementId: ${q(assessmentId)}`,
    `coreVersions:`,
    `  proc: ${q('0.5.0')}`,
    `assertions:`,
    '',
  ].join('\n');
  const body = projected.length ? projected.join('\n') + '\n' : '# （无可投影 finding）\n';
  return { yaml: header + body, projected: n, skipped };
}

function runCli() {
  const args = process.argv.slice(2);
  const noProjection = args.includes('--no-projection');
  const root = args.find((a) => !a.startsWith('--'));
  if (!root) throw new Error('用法: node aggregate-findings.mjs <assessment_root> [--no-projection]');
  const abs = resolve(root);
  if (!existsSync(abs)) throw new Error(`目录不存在：${abs}`);

  let assessmentId = 'PA-UNKNOWN';
  const metaPath = join(abs, 'meta.json');
  if (existsSync(metaPath)) {
    try { assessmentId = JSON.parse(readFileSync(metaPath, 'utf8')).assessment_id || assessmentId; } catch { /* 用默认 */ }
  }

  const all = loadDimensions(abs);
  let projectionPath = null;
  let coverage = { projected: 0, skipped: [] };
  if (!noProjection) {
    const proj = buildProjection(assessmentId, all);
    const dir = join(abs, '01_assessments');
    mkdirSync(dir, { recursive: true });
    const pp = join(dir, 'evaluation-assertions.yaml');
    writeFileSync(pp, proj.yaml, 'utf8');
    projectionPath = pp;
    coverage = { projected: proj.projected, skipped: proj.skipped };
  }
  const report = buildReport(assessmentId, all, coverage, projectionPath);
  const rp = join(abs, 'assessment_report.md');
  writeFileSync(rp, report, 'utf8');

  console.log(`✓ 已生成评价报告：${rp}`);
  console.log(`  发现总数：${all.length} ｜ 投影：${coverage.projected} ｜ 跳过：${coverage.skipped.length}`);
  if (projectionPath) console.log(`✓ 已生成投影产物：${projectionPath}`);
}

if (process.argv[1]) {
  try { runCli(); } catch (e) { console.error(`🔴 ${e.message}`); process.exitCode = 1; }
}
