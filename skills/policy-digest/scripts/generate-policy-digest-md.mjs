#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function samePath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  return normalize(left) === normalize(right);
}

function text(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(text).join('；') : '—';
  return String(value).replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function sourceText(source) {
  if (!source) return '—';
  return [source.clause_ref, source.block_path, source.page_hint ? `p.${source.page_hint}` : null].filter(Boolean).join(' · ') || source.block_id || '—';
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...(rows.length ? rows : [headers.map(() => '—')]).map((row) => `| ${row.map(text).join(' | ')} |`),
  ].join('\n');
}

function mermaidLabel(value) {
  return String(value || '').replace(/["[\]{}|<>]/g, ' ').replace(/\r?\n/g, ' ').trim();
}

function renderFlowchart(digest) {
  const elements = [...(digest.process_elements || [])].sort((left, right) => left.element_id.localeCompare(right.element_id));
  const nodeName = new Map(elements.map((element, index) => [element.element_id, `N${index}`]));
  const lines = ['```mermaid', 'flowchart TD'];
  for (const element of elements) lines.push(`    ${nodeName.get(element.element_id)}["${mermaidLabel(`${element.level} ${element.name} (${element.element_id})`)}"]`);
  for (const element of elements) {
    if (element.parent_ref && nodeName.has(element.parent_ref)) lines.push(`    ${nodeName.get(element.parent_ref)} -. 包含 .-> ${nodeName.get(element.element_id)}`);
  }
  for (const edge of [...(digest.flow_edges || [])].sort((left, right) => left.edge_id.localeCompare(right.edge_id))) {
    if (!nodeName.has(edge.from_ref) || !nodeName.has(edge.to_ref)) continue;
    const label = edge.edge_kind === 'main' ? edge.edge_id : `${edge.edge_kind}: ${edge.condition || edge.edge_id}`;
    lines.push(`    ${nodeName.get(edge.from_ref)} -->|"${mermaidLabel(label)}"| ${nodeName.get(edge.to_ref)}`);
  }
  lines.push('```');
  return lines.join('\n');
}

export function renderPolicyDigestMarkdown(digest) {
  const identity = digest.document_identity || {};
  const rules = [...(digest.rules || [])].sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  const elements = [...(digest.process_elements || [])].sort((left, right) => left.element_id.localeCompare(right.element_id));
  const objectives = [...(digest.process_objectives || [])].sort((left, right) => left.objective_id.localeCompare(right.objective_id));
  const artifacts = [...(digest.artifacts || [])].sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));
  const edges = [...(digest.flow_edges || [])].sort((left, right) => left.edge_id.localeCompare(right.edge_id));
  const assignments = [...(digest.role_assignments || [])].sort((left, right) => left.assignment_id.localeCompare(right.assignment_id));
  const risks = [...(digest.risks || [])].sort((left, right) => left.risk_id.localeCompare(right.risk_id));
  const controls = [...(digest.controls || [])].sort((left, right) => left.control_id.localeCompare(right.control_id));
  const issues = [...(digest.issues || [])].sort((left, right) => left.issue_id.localeCompare(right.issue_id));
  const confirmations = [...(digest.pending_confirmations || [])].sort((left, right) => left.confirmation_id.localeCompare(right.confirmation_id));

  const processRows = [
    ...elements.map((item) => [item.element_id, item.level, item.rdf_type, item.name, item.parent_ref, item.owning_process_ref, sourceText(item.source), item.review?.status]),
    ...objectives.map((item) => [item.objective_id, '目标', 'proc:ProcessObjective', item.statement, item.parent_objective_ref, item.element_refs, sourceText(item.source), item.review?.status]),
    ...artifacts.map((item) => [item.artifact_id, '产物', item.artifact_type, item.name, item.produced_by, item.consumed_by, sourceText(item.source), item.review?.status]),
    ...edges.map((item) => [item.edge_id, '流程边', item.edge_kind, `${item.from_ref} → ${item.to_ref}`, item.process_ref, item.condition, sourceText(item.source), item.review?.status]),
  ];
  const riskControlRows = [
    ...risks.map((item) => [item.risk_id, '风险', item.description, item.rule_refs, item.element_refs, item.assertion_basis, sourceText(item.source), item.review?.status]),
    ...controls.map((item) => [item.control_id, '控制', item.measure, item.risk_refs, item.element_ref, item.assertion_basis, sourceText(item.source), item.review?.status]),
  ];
  const issueRows = [
    ...issues.map((item) => [item.issue_id, item.type, item.description, item.impact, item.recommendation, item.blocking ? '是' : '否', sourceText(item.source)]),
    ...confirmations.map((item) => [item.confirmation_id, '待确认', item.question, item.impact, item.suggested_owner, item.blocking ? '是' : '否', sourceText(item.source)]),
  ];

  return `# ${text(identity.title || identity.doc_id)} Policy Digest

> Digest：${text(digest.digest_id)} · 状态：${text(digest.status)} · 生成时间：${text(digest.generated_at)}<br>
> 本文件由 \`digest.json\` 确定性生成；业务确认状态以结构化数据为准。

## 文件身份表

${table(['字段', '值'], [
  ['文档 ID', identity.doc_id], ['制度编号', identity.doc_number], ['版本', identity.version], ['效力状态', identity.validity],
  ['发布日', identity.publication_date], ['生效日', identity.effective_date], ['归口部门', identity.owning_department],
  ['批准主体', identity.approving_authority], ['适用摘要', identity.applicability_summary], ['来源', sourceText(identity.source)],
])}

## 核心规则表

${table(['规则 ID', 'Disposition', 'Clause Type', '规范要求', '参数', '执行节点', '来源', '置信度', '审核'], rules.map((item) => [
  item.rule_id, item.disposition, item.clause_types, item.requirement || item.original_text,
  (item.parameters || []).map((parameter) => `${parameter.parameterType ?? parameter.parameter_type ?? '?'}=${parameter.value ?? '?'}`),
  item.operationalized_by, sourceText(item.source), item.semantic_confidence, item.review?.status,
]))}

## 流程节点表

${table(['记录 ID', '层级/类别', '类型', '名称/关系', '父级/流程', '归属/条件', '来源', '审核'], processRows)}

## RACI 责任矩阵

${table(['分配 ID', '流程元素', '角色', 'RACI', '授权依据', '来源', '审核'], assignments.map((item) => [
  item.assignment_id, item.element_ref, item.role, item.raci, item.authorization_basis, sourceText(item.source), item.review?.status,
]))}

## 风险控制矩阵

${table(['记录 ID', '类别', '描述/措施', '关联风险/规则', '关联流程', '依据', '来源', '审核'], riskControlRows)}

## 制度问题及优化建议清单

${table(['记录 ID', '类别', '问题/待确认', '影响', '建议/负责人', '阻断', '来源'], issueRows)}

## 端到端流程图

${renderFlowchart(digest)}
`;
}

export function generatePolicyDigestMarkdown(packageDirectory, options = {}) {
  const directory = resolve(packageDirectory);
  const digestPath = join(directory, 'digest.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  const outputPath = resolve(options.output || join(directory, options.inPlace || options.check ? 'digest.md' : 'digest.generated.md'));
  const generated = renderPolicyDigestMarkdown(readJson(digestPath));
  const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').replace(/^\uFEFF/, '') : null;
  if (options.check) return { outputPath, changed: current !== generated, generated };
  if (options.inPlace && existsSync(outputPath)) writeFileSync(join(directory, 'digest.before-generation.md'), current, 'utf8');
  writeFileSync(outputPath, generated, 'utf8');
  return { outputPath, changed: current !== generated, generated };
}

function runCli() {
  const args = process.argv.slice(2);
  const input = args.find((argument) => !argument.startsWith('--'));
  if (!input) throw new Error('用法: node generate-policy-digest-md.mjs <package-directory> [--check|--in-place|--output <path>]');
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (outputIndex >= 0 && !output) throw new Error('--output 后必须提供路径');
  const inPlace = args.includes('--in-place');
  if (inPlace && output) throw new Error('--in-place 与 --output 不能同时使用');
  if (output && samePath(output, join(resolve(input), 'digest.md'))) throw new Error('--output 不得覆盖包内 digest.md；请使用 --in-place 以便先备份');
  const check = args.includes('--check');
  if (check && output) throw new Error('--check 固定检查包内 digest.md，不能与 --output 同时使用');
  const result = generatePolicyDigestMarkdown(input, { output, inPlace, check });
  if (check) {
    if (result.changed) {
      console.error('🔴 digest.md 与 digest.json 的确定性生成结果不一致');
      process.exitCode = 1;
    } else console.log('✓ digest.md 与 digest.json 一致');
    return;
  }
  console.log(`✓ 已生成 Policy Digest Markdown：${result.outputPath}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${basename(process.argv[1])}: ${error.message}`); process.exitCode = 1; }
}
