#!/usr/bin/env node
// 工作流工具链回归测试（零依赖）：把 process-assess-workflow 九个脚本的端到端链路固化为回归。
// 覆盖：scaffold-assessment → scaffold-baseline → validate-baseline（草稿错误/冻结通过/哈希篡改/版本链）
//       → generate-dimension-drafts（四维度预填 + 重跑跳过 + --digest 场景二）
//       → validate-findings（--baseline 锚点跨文件校验）→ aggregate-findings（投影 + provisional 映射 + 缩进）
//       → validate-evaluation-assertions（正例通过 + 负面六类：XOR/谓词/status/悬空/分叉/环）
// 数据源：policy-digest 的 ten-rule-policy fixture（39 元素/7 目标/5 风险/5 控制/17 边）。
//
// 用法: node test-workflow-toolchain.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixtureDigest = join(scriptDir, '..', '..', 'policy-digest', 'test-fixtures', 'ten-rule-policy', 'digest.json');
const S = (name) => join(scriptDir, name);
const root = mkdtempSync(join(tmpdir(), 'workflow-toolchain-'));
const A = join(root, 'process-assessments', 'PA-2026-001');
const SNAPSHOT_CONTENT = '{"records":[{"id":"rec-04127"}]}';

function run(script, args) {
  const r = spawnSync(process.execPath, [S(script), ...args], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
}

try {
  // ---- 1. scaffold-assessment ----
  let r = run('scaffold-assessment.mjs', [A, '--assessment-id', 'PA-2026-001', '--title', 'toolchain regression', '--processes', 'supplier-onboarding', '--dimensions', 'goal,risk,control,efficiency']);
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(A, 'meta.json')) && existsSync(join(A, 'checklist.yaml')) && existsSync(join(A, 'baselines')));
  // --force 对既有目录不报错（EEXIST 回归）
  r = run('scaffold-assessment.mjs', [A, '--assessment-id', 'PA-2026-001', '--processes', 'supplier-onboarding', '--force']);
  assert.equal(r.status, 0, `--force 应可重建：${r.out}`);

  // ---- 2. scaffold-baseline ----
  mkdirSync(join(A, 'policy-digests', 'TEN-RULE'), { recursive: true });
  copyFileSync(fixtureDigest, join(A, 'policy-digests', 'TEN-RULE', 'digest.json'));
  mkdirSync(join(A, 'snapshots'), { recursive: true });
  writeFileSync(join(A, 'snapshots', 'oa-export-2026q3.json'), SNAPSHOT_CONTENT, 'utf8');
  r = run('scaffold-baseline.mjs', [A]);
  assert.equal(r.status, 0, r.out);
  const v1Path = join(A, 'baselines', 'baseline-v1.json');
  const v1 = readJson(v1Path);
  assert.equal(v1.baseline_id, 'baseline-v1');
  assert.equal(v1.status, 'draft');
  assert.equal(v1.digests.length, 1);
  assert.deepEqual(v1.digests[0].stats, { process_elements: 39, process_objectives: 7, risks: 5, controls: 5, flow_edges: 17 });
  assert.equal(v1.snapshots.length, 1);
  assert.match(v1.digests[0].sha256, /^[0-9a-f]{64}$/);

  // ---- 3. validate-baseline：草稿缺字段 → 错误；补齐冻结 → 通过 ----
  r = run('validate-baseline.mjs', [v1Path]);
  assert.equal(r.status, 1, '缺 source_system/acquired_at 应失败');
  assert.ok(r.out.includes('snapshots[0].source_system') && r.out.includes('snapshots[0].acquired_at'), r.out);
  const v1Fill = readJson(v1Path);
  v1Fill.scope.data_window = { start: '2026-07-01', end: '2026-09-30' };
  Object.assign(v1Fill.snapshots[0], { source_system: 'OA', acquired_at: '2026-09-30T08:00:00Z', record_count: 1 });
  v1Fill.metrics.push({ metric_id: 'KPI-001', name: 'cycle time', definition: 'p50 days', unit: 'day', target_value: 5, benchmark_ref: null, data_mapping: { source_system: 'OA', dataset: null, field: 'cycle_days', filter: null }, snapshot_ref: 'snapshots/oa-export-2026q3.json' });
  v1Fill.status = 'frozen';
  v1Fill.frozen_at = new Date().toISOString();
  writeFileSync(v1Path, `${JSON.stringify(v1Fill, null, 2)}\n`, 'utf8');
  r = run('validate-baseline.mjs', [v1Path]);
  assert.equal(r.status, 0, `冻结基线应通过：${r.out}`);

  // ---- 4. 哈希篡改检测 + 恢复 ----
  writeFileSync(join(A, 'snapshots', 'oa-export-2026q3.json'), `${SNAPSHOT_CONTENT}tampered`, 'utf8');
  r = run('validate-baseline.mjs', [v1Path]);
  assert.equal(r.status, 1, '篡改后应失败');
  assert.ok(r.out.includes('与文件实测不一致'), r.out);
  writeFileSync(join(A, 'snapshots', 'oa-export-2026q3.json'), SNAPSHOT_CONTENT, 'utf8');

  // ---- 5. frozen 拒刷新；v2 版本链 ----
  r = run('scaffold-baseline.mjs', [A, '--refresh', 'baselines/baseline-v1.json']);
  assert.notEqual(r.status, 0, 'frozen 应拒绝刷新');
  assert.ok(r.out.includes('已冻结'), r.out);
  r = run('scaffold-baseline.mjs', [A]);
  assert.equal(r.status, 0, r.out);
  const v2 = readJson(join(A, 'baselines', 'baseline-v2.json'));
  assert.equal(v2.supersedes, 'baseline-v1');
  r = run('validate-baseline.mjs', [join(A, 'baselines', 'baseline-v2.json')]);
  assert.ok(r.out.includes('未回指 baseline-v2'), `版本链回指警告：${r.out}`);

  // ---- 6. generate-dimension-drafts 四维度 ----
  for (const dim of ['goal', 'risk', 'control', 'efficiency']) {
    r = run('generate-dimension-drafts.mjs', [A, '--skill', dim]);
    assert.equal(r.status, 0, `${dim}: ${r.out}`);
  }
  const dimFile = (d, f) => readFileSync(join(A, '01_assessments', d, f), 'utf8');
  assert.ok(dimFile('risk', 'rcm_matrix.md').includes('| RISK-01'), 'RCM 风险行');
  assert.ok(dimFile('risk', 'rcm_matrix.md').includes('●'), 'RCM 映射标记');
  assert.ok(dimFile('risk', 'rcm_matrix.md').includes('| orphan controls（risk_refs 空/悬空） | 无 |'), 'orphan 实算');
  assert.ok(dimFile('risk', 'coverage_analysis.md').includes('全部制度明文风险均有控制引用'), '无控风险实算');
  assert.ok(dimFile('goal', 'objective_inventory.md').includes('| OBJ-01'), '目标行');
  assert.ok(dimFile('goal', 'objective_inventory.md').includes('| 无目标的 L3 | 无 |'), 'G3 实算');
  assert.ok(dimFile('control', 'walkthrough.md').includes('模板路径参考'), '穿行模板路径');
  assert.ok(dimFile('control', 'walkthrough.md').includes('控制点穿行结论'), '穿行结论表（底稿惯例）');
  assert.ok(dimFile('control', 'control_execution_scorecard.md').includes('工作底稿索引'), '看板底稿索引列');
  assert.ok(dimFile('control', 'sampling_plan.md').includes('oa-export-2026q3.json'), '快照覆盖表');
  assert.ok(dimFile('control', 'sampling_plan.md').includes('测试程序词表'), '测试程序词表');
  assert.ok(dimFile('efficiency', 'structure_review.md').includes('主路径 6 环节'), 'E1 走链');
  assert.ok(dimFile('efficiency', 'structure_review.md').includes('共 1 条'), 'E2 返工边');
  assert.ok(dimFile('efficiency', 'structure_review.md').includes('共 12 处'), 'E3 交接点');
  // 数据可行性预检（实例层两维度强制前置产物）
  assert.ok(dimFile('control', 'data_feasibility.md').includes('测试项可行性矩阵'), 'control 预检矩阵');
  assert.ok(dimFile('control', 'data_feasibility.md').includes('T2 穿行测试'), 'control 预检测试项');
  assert.ok(dimFile('efficiency', 'data_feasibility.md').includes('E4 周期时间分解'), 'efficiency 预检测试项');
  assert.ok(dimFile('control', 'data_feasibility.md').includes('oa-export-2026q3.json'), '预检快照清单预填');
  // 重跑跳过 + --force 覆盖
  r = run('generate-dimension-drafts.mjs', [A, '--skill', 'risk']);
  assert.ok(r.out.includes('已跳过'), `重跑应跳过：${r.out}`);
  r = run('generate-dimension-drafts.mjs', [A, '--skill', 'risk', '--force']);
  assert.ok(!r.out.includes('已跳过'), `--force 应覆盖：${r.out}`);
  // --digest 场景二（无基线，目录自动创建）
  r = run('generate-dimension-drafts.mjs', [join(root, 'embedded-risk'), '--skill', 'risk', '--digest', join(A, 'policy-digests', 'TEN-RULE', 'digest.json')]);
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(root, 'embedded-risk', 'rcm_matrix.md')), '场景二产物');
  // --risk-library 域风险库集成（参照行 + 未识别风险表预填；非 risk 维度警告；未知域报错）
  r = run('generate-dimension-drafts.mjs', [A, '--skill', 'risk', '--risk-library', 'procurement', '--force']);
  assert.equal(r.status, 0, r.out);
  assert.ok(dimFile('risk', 'rcm_matrix.md').includes('[参照] PROC-R01'), '矩阵参照行预填');
  assert.ok(dimFile('risk', 'coverage_analysis.md').includes('PROC-R01（采购业务）'), '未识别风险表预填');
  r = run('generate-dimension-drafts.mjs', [A, '--skill', 'goal', '--risk-library', 'procurement', '--force']);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes('仅作用于 risk 维度'), `非 risk 维度应警告：${r.out}`);
  r = run('generate-dimension-drafts.mjs', [A, '--skill', 'risk', '--risk-library', 'nonexistent-domain']);
  assert.notEqual(r.status, 0, '未知域应报错');

  // ---- 7. validate-findings --baseline 锚点跨文件校验 ----
  const findingsPath = join(A, '01_assessments', 'control', 'findings.yaml');
  const finding = (id, type, version, snapshot, status) => `  - finding_id: ${id}
    dimension: control
    finding_type: ${type}
    severity: high
    anchor:
      digest:
        doc_id: FIXTURE-POLICY-001
        block_id: b-012
        element_ref: CTRL-01
      baseline:
        version: ${version}
        snapshot_ref: ${snapshot}
        record_ref: "rec-04127"
    statement: test finding ${id}
    evidence:
      - "detail"
    recommendation: enforce approval step and verify via sampled records
    owner_suggestion: ops
    status: ${status}
`;
  writeFileSync(findingsPath, `findings:\n${finding('CT-001', 'control_not_executed', 'baseline-v1', 'snapshots/oa-export-2026q3.json', 'provisional')}${finding('CT-002', 'control_deviation', 'baseline-v9', 'snapshots/not-in-baseline.json', 'proposed')}`, 'utf8');
  r = run('validate-findings.mjs', [findingsPath, '--baseline', v1Path]);
  assert.equal(r.status, 1, '坏锚点应失败');
  assert.ok(r.out.includes('[CT-002] anchor.baseline.version') && r.out.includes('未命中基线 snapshots[].path'), r.out);
  assert.ok(!r.out.includes('[CT-001] anchor'), '好锚点不应误报');
  // 空话建议检测（负面清单 §8）：warning 但不阻塞
  const vague = finding('CT-003', 'control_deviation', 'baseline-v1', 'snapshots/oa-export-2026q3.json', 'proposed').replace('enforce approval step and verify via sampled records', '加强管理');
  writeFileSync(findingsPath, `findings:\n${finding('CT-001', 'control_not_executed', 'baseline-v1', 'snapshots/oa-export-2026q3.json', 'provisional')}${vague}`, 'utf8');
  r = run('validate-findings.mjs', [findingsPath, '--baseline', v1Path]);
  assert.equal(r.status, 0, '空话建议只应警告');
  assert.ok(r.out.includes('[CT-003] recommendation') && r.out.includes('疑似空话建议'), `空话检测：${r.out}`);
  writeFileSync(findingsPath, `findings:\n${finding('CT-001', 'control_not_executed', 'baseline-v1', 'snapshots/oa-export-2026q3.json', 'provisional')}${finding('CT-002', 'control_deviation', 'baseline-v1', 'snapshots/oa-export-2026q3.json', 'proposed')}`, 'utf8');
  r = run('validate-findings.mjs', [findingsPath, '--baseline', v1Path]);
  assert.equal(r.status, 0, `修正后应通过：${r.out}`);

  // ---- 8. aggregate-findings 投影（provisional→proposed、缩进、跳过统计）----
  r = run('aggregate-findings.mjs', [A]);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.out.includes('投影：1') && r.out.includes('跳过：1'), r.out);
  const ea = readFileSync(join(A, '01_assessments', 'evaluation-assertions.yaml'), 'utf8');
  assert.ok(ea.includes('  - assertionId: "EAS-PA-2026-001-001"'), '断言块缩进（yaml-lite 兼容）');
  assert.ok(ea.includes('status: "proposed"') && !ea.includes('provisional'), 'provisional→proposed 映射');
  assert.ok(existsSync(join(A, 'assessment_report.md')), '评价报告');

  // ---- 9. validate-evaluation-assertions：正例 + 负面六类 ----
  r = run('validate-evaluation-assertions.mjs', [join(A, '01_assessments', 'evaluation-assertions.yaml')]);
  assert.equal(r.status, 0, `正例应通过：${r.out}`);
  assert.ok(r.out.includes('未对齐率：100%'), r.out);
  const badPath = join(root, 'bad-assertions.yaml');
  const badOne = (id, extra) => `  - assertionId: "${id}"
    target:
      alignmentStatus: "unaligned"
      digestRef: { docId: "DOC-1", elementRef: "CTL-1" }
    predicate: "proc:hasControlGap"
    value: { severity: "low" }
    evidence:
      digest: { docId: "DOC-1", elementRef: "CTL-1" }
      baseline: { version: "baseline-v1", snapshotRef: "snapshots/x.json" }
    sourceAssessment: "PA-2026-001"
    sourceFinding: "RC-001"
    generatedAt: "2026-09-30T00:00:00Z"
    status: "proposed"
${extra}`;
  writeFileSync(badPath, `assertionsSchemaVersion: "0.1.0"
engagement: { engagementId: "PA-2026-001" }
coreVersions: { proc: "0.5.0" }
assertions:
  - assertionId: "EAS-PA-2026-001-001"
    target:
      alignmentStatus: "aligned"
      digestRef: { docId: "DOC-1", elementRef: "CTL-1" }
    predicate: "proc:notAPredicate"
    value: { severity: "high" }
    evidence:
      digest: { docId: "DOC-1", elementRef: "CTL-1" }
    sourceAssessment: "PA-2026-001"
    sourceFinding: "CT-001"
    generatedAt: "2026-09-30T00:00:00Z"
    status: "provisional"
${badOne('EAS-PA-2026-001-002', '    supersedesAssertion: "EAS-PA-2026-001-999"\n')}${badOne('EAS-PA-2026-001-003', '    supersedesAssertion: "EAS-PA-2026-001-004"\n')}${badOne('EAS-PA-2026-001-004', '    supersedesAssertion: "EAS-PA-2026-001-003"\n')}${badOne('EAS-PA-2026-001-005', '    supersedesAssertion: "EAS-PA-2026-001-003"\n')}`, 'utf8');
  r = run('validate-evaluation-assertions.mjs', [badPath]);
  assert.equal(r.status, 1, '负面应失败');
  for (const needle of ['不在 v0.1.0 谓词族', '非法 provisional', 'aligned 目标必填正式 IRI', 'aligned 目标禁带 digest 坐标', '双源证据缺一不可', '指向不存在的断言', '分叉', '检测到环']) {
    assert.ok(r.out.includes(needle), `应检出「${needle}」：${r.out}`);
  }

  console.log('✓ 工作流工具链回归测试全部通过（9 脚本 / 8 组链路 / 正负面断言 40+）');
} finally {
  rmSync(root, { recursive: true, force: true });
}
