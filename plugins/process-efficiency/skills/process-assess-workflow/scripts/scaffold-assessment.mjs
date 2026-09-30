#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIMENSIONS = ['goal', 'risk', 'control', 'efficiency'];
const ASSESSMENT_ID_PATTERN = /^PA-\d{4}-\d{3}$/;

function buildScaffold({ assessmentId, title, processes = [], dimensions = ['goal', 'risk', 'control', 'efficiency'], wave = null, generatedAt = new Date().toISOString() }) {
  if (!ASSESSMENT_ID_PATTERN.test(assessmentId)) throw new Error(`assessment_id 必须符合 PA-YYYY-NNN 格式，实际为 ${assessmentId}`);
  const invalidDimensions = dimensions.filter((item) => !DIMENSIONS.includes(item));
  if (invalidDimensions.length) throw new Error(`不支持的维度：${invalidDimensions.join(', ')}；可选值：${DIMENSIONS.join(', ')}`);

  const meta = {
    assessment_id: assessmentId,
    status: 'scoped',
    processes: processes.map((name) => ({ name, l3_ref: 'PENDING-CONFIRMATION', org: null })),
    dimensions,
    wave,
    current_baseline: null,
    created_by: null,
    created_at: generatedAt,
    last_activity: generatedAt,
    suspend_info: null,
    abandon_info: null,
  };

  const checklistYaml = `assessment_id: ${assessmentId}
scope:
  completed: false
  processes_identified: false
  dimensions_confirmed: false
  stakeholders_mapped: false
  data_sources_listed: false
  success_criteria_defined: false
baseline:
  completed: false
  digests_completed: false
  metrics_defined: false
  data_snapshots_sealed: false
  baseline_frozen: false
assess:
  completed: false
  dimensions_covered: false
  findings_anchored: false
  data_sufficiency_assessed: false
  stakeholder_review_done: false
report:
  completed: false
  rating_drafted: false
  gaps_itemized: false
  recommendations_actionable: false
  baseline_referenced: false
`;

  const readme = `# ${title || assessmentId}

## 概要

| 项 | 值 |
|----|----|
| 评价 ID | ${assessmentId} |
| 状态 | scoped（起步包占位） |
| 目标流程 | ${processes.length ? processes.join('、') : '（待填写）'} |
| 评价维度 | ${dimensions.join(' / ')} |
| 波次 | ${wave || '—'} |

## 产物索引

| 文件 | 用途 | 状态 |
|------|------|------|
| \`meta.json\` | 评价元数据 | 占位（processes 的 l3_ref 待确认） |
| \`checklist.yaml\` | 阶段门禁清单 | 全部 false |
| \`scope_charter.md\` | SCOPE 产物 | 待创建 |
| \`baselines/\` | 版本化评价基线 | 待创建 |
| \`01_assessments/\` | 各维度评价产物 | 待创建 |
| \`assessment_report.md\` | 评价报告 | 待创建 |

## 当前阻塞

- 起步包为占位内容：processes 的 L3 标识与组织归属未确认；SCOPE 各门禁未满足。
- 下一步：填写 scope_charter.md，逐项满足 SCOPE 门禁。
`;

  return { meta, checklistYaml, readme };
}

export function generateScaffold(outputDirectory, options) {
  const directory = resolve(outputDirectory);
  if (existsSync(directory) && !options.force) throw new Error(`目标目录已存在：${directory}；如需覆盖请添加 --force`);
  mkdirSync(join(directory, 'baselines'), { recursive: true });
  mkdirSync(join(directory, '01_assessments'), { recursive: true });
  const data = buildScaffold(options);
  writeFileSync(join(directory, 'meta.json'), `${JSON.stringify(data.meta, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, 'checklist.yaml'), data.checklistYaml, 'utf8');
  writeFileSync(join(directory, 'README.md'), data.readme, 'utf8');

  const portfolioPath = resolve(outputDirectory, '..', 'PORTFOLIO.md');
  if (existsSync(portfolioPath)) {
    const entry = `| ${options.assessmentId} | ${options.processes?.join('、') || '（待填写）'} | ${options.dimensions?.join('/') || ''} | scoped | ${options.wave || '—'} | 待确认 | ${data.meta.created_at.slice(0, 10)} |\n`;
    const content = readFileSync(portfolioPath, 'utf8');
    const lines = content.split('\n');
    const lastTableRow = lines.reduce((acc, line, index) => (line.trim().startsWith('|') ? index : acc), -1);
    lines.splice(lastTableRow + 1, 0, entry.trimEnd());
    writeFileSync(portfolioPath, lines.join('\n'), 'utf8');
  } else {
    writeFileSync(portfolioPath, `# 评价组合看板\n\n| 评价 | 流程 | 维度 | 阶段 | 波次 | Owner 确认状态 | 最近活动 |\n|------|------|------|------|------|--------------|---------|\n| ${options.assessmentId} | ${options.processes?.join('、') || '（待填写）'} | ${options.dimensions?.join('/') || ''} | scoped | ${options.wave || '—'} | 待确认 | ${data.meta.created_at.slice(0, 10)} |\n`, 'utf8');
  }
  return { directory, ...data };
}
function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function runCli() {
  const args = process.argv.slice(2);
  const output = args[0]?.startsWith('--') ? null : args[0];
  const assessmentId = option(args, '--assessment-id');
  if (!output || !assessmentId) throw new Error('用法: node scaffold-assessment.mjs <output-directory> --assessment-id <PA-YYYY-NNN> [--title <标题>] [--processes <逗号分隔>] [--dimensions <逗号分隔>] [--wave <波次>] [--force]');
  const dimensions = (option(args, '--dimensions') || 'goal,risk,control,efficiency').split(',').map((item) => item.trim()).filter(Boolean);
  const processes = (option(args, '--processes') || '').split(',').map((item) => item.trim()).filter(Boolean);
  const result = generateScaffold(output, {
    assessmentId, title: option(args, '--title'), processes, dimensions, wave: option(args, '--wave'), force: args.includes('--force'),
  });
  console.log(`✓ 已生成流程评价起步包：${result.directory}`);
  console.log('⚠ 包内均为占位内容；请先完成 scope_charter.md 并逐项满足 SCOPE 门禁。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
