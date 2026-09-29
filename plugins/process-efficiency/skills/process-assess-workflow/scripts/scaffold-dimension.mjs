#!/usr/bin/env node
// 维度产出脚手架：复制某能力技能 templates/ 下的产出骨架到目标维度目录。
// 与 scaffold-assessment.mjs 互补——后者建评价外壳，本脚本建单个维度的分析产物骨架。
// 能力技能 root-agnostic：输出根由调用方（process-assess-workflow 或场景二嵌入方）指定。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DIM_TO_SKILL = {
  goal: 'goal-alignment',
  risk: 'rcm-analysis',
  control: 'control-testing',
  efficiency: 'efficiency-diagnosis',
};
const DIMENSIONS = Object.keys(DIM_TO_SKILL);

function option(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function runCli() {
  const args = process.argv.slice(2);
  const output = args[0]?.startsWith('--') ? null : args[0];
  const dim = option(args, '--skill');
  if (!output || !dim) {
    throw new Error('用法: node scaffold-dimension.mjs <output_dir> --skill <goal|risk|control|efficiency> [--assessment-id <PA-YYYY-NNN>] [--date <YYYY-MM-DD>] [--force]');
  }
  if (!DIMENSIONS.includes(dim)) {
    throw new Error(`不支持的维度：${dim}；可选值：${DIMENSIONS.join(', ')}`);
  }

  // scripts/ -> process-assess-workflow/ -> skills/ -> <skill>/templates
  const skillsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const tplDir = join(skillsRoot, DIM_TO_SKILL[dim], 'templates');
  if (!existsSync(tplDir)) throw new Error(`未找到模板目录：${tplDir}`);

  const target = resolve(output);
  if (existsSync(target) && !args.includes('--force')) {
    throw new Error(`目标目录已存在：${target}；如需覆盖请加 --force`);
  }
  mkdirSync(target, { recursive: true });

  const assessmentId = option(args, '--assessment-id') || '{assessment_id}';
  const date = option(args, '--date') || '{date}';

  // 只复制规范名模板（不带 _template 后缀）；_template.md 是既有草稿/示例，不作为实例化目标
  const files = readdirSync(tplDir).filter((f) => f.endsWith('.md') && !f.endsWith('_template.md'));
  for (const f of files) {
    const src = join(tplDir, f);
    let content = readFileSync(src, 'utf8');
    content = content.split('{assessment_id}').join(assessmentId).split('{date}').join(date);
    writeFileSync(join(target, f), content, 'utf8');
  }

  // 各维度共享 findings.yaml 骨架（来自工作流共享模板，含完整 finding-contract 字段示例）
  const findingsTpl = join(skillsRoot, 'process-assess-workflow', 'templates', 'findings_template.yaml');
  let findingsCount = 0;
  if (existsSync(findingsTpl)) {
    let fc = readFileSync(findingsTpl, 'utf8');
    fc = fc.split('{assessment_id}').join(assessmentId).split('{date}').join(date);
    writeFileSync(join(target, 'findings.yaml'), fc, 'utf8');
    findingsCount = 1;
  }

  const total = files.length + findingsCount;
  console.log(`✓ 已生成维度产出骨架：${target}（${total} 个文件，维度=${dim}；含 findings.yaml 骨架）`);
  console.log('⚠ 骨架为占位内容；请按 digest/baseline 实际数据填充，findings 按 finding-contract 聚合到 findings.yaml。');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (e) { console.error(`🔴 ${e.message}`); process.exitCode = 1; }
}
