#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
}

function sourceKey(source = {}) {
  return `${source.doc_id || source.docId || ''}::${source.block_id || source.blockId || ''}::${source.block_path || source.blockPath || ''}`;
}

function refs(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function record(id, kind, title, detail, source, extra = {}) {
  return { id, kind, title, detail, source: source || null, source_key: sourceKey(source), ...extra };
}

function digestSource(source = {}) {
  return {
    doc_id: source.docId || source.doc_id || '',
    block_id: source.blockId || source.block_id || '',
    block_path: source.blockPath || source.block_path || '',
    clause_ref: null,
    page_hint: null,
    excerpt: source.excerpt || '',
  };
}

export function buildExplanationModel(digest, parsed, candidates = null) {
  if (digest.digest_schema_version !== '0.2.0') throw new Error(`仅支持 Policy Digest 0.2.0，实际为 ${digest.digest_schema_version}`);
  const elements = digest.process_elements || [];
  const byElement = new Map(elements.map((item) => [item.element_id, item]));
  const children = new Map(elements.map((item) => [item.element_id, []]));
  for (const item of elements) if (item.parent_ref && children.has(item.parent_ref)) children.get(item.parent_ref).push(item.element_id);
  const sourceBlocks = (parsed.blocks || []).map((block) => ({
    block_id: block.blockId,
    block_path: block.anchor?.blockPath || '',
    clause_ref: block.clauseRef?.number || '',
    page_hint: block.anchor?.pageHint ?? null,
    text: block.text || block.anchor?.excerpt || '',
    parse_confidence: block.parseConfidence ?? null,
    needs_verification: Boolean(block.needsVerification),
    source_key: sourceKey({ doc_id: parsed.document?.docId, block_id: block.blockId, block_path: block.anchor?.blockPath }),
  }));
  const records = [];
  for (const rule of digest.rules || []) records.push(record(rule.rule_id, 'rule', rule.requirement || rule.original_text, rule.original_text, rule.source, { links: refs(rule.operationalized_by), review: rule.review, confidence: rule.semantic_confidence }));
  for (const item of elements) records.push(record(item.element_id, 'process', item.name, `${item.level} · ${item.rdf_type}`, item.source, {
    level: item.level, parent_ref: item.parent_ref, owning_process_ref: item.owning_process_ref, children: children.get(item.element_id) || [],
    objectives: refs(item.objective_refs), inputs: refs(item.input_artifact_refs), outputs: refs(item.output_artifact_refs),
    entry_conditions: refs(item.entry_conditions), exit_conditions: refs(item.exit_conditions), basis: item.decomposition_basis,
    hierarchy_status: item.hierarchy_status, confidence: item.hierarchy_confidence, alternatives: refs(item.alternative_levels), review: item.review,
  }));
  for (const objective of digest.process_objectives || []) records.push(record(objective.objective_id, 'objective', objective.statement, `关联流程：${refs(objective.element_refs).join('、') || '未关联'}`, objective.source, { links: refs(objective.element_refs), basis: objective.assertion_basis, review: objective.review }));
  for (const artifact of digest.artifacts || []) records.push(record(artifact.artifact_id, 'artifact', artifact.name, artifact.artifact_type, artifact.source, { produced_by: refs(artifact.produced_by), consumed_by: refs(artifact.consumed_by), review: artifact.review }));
  for (const edge of digest.flow_edges || []) records.push(record(edge.edge_id, 'edge', `${byElement.get(edge.from_ref)?.name || edge.from_ref} → ${byElement.get(edge.to_ref)?.name || edge.to_ref}`, edge.condition || edge.edge_kind, edge.source, { process_ref: edge.process_ref, from_ref: edge.from_ref, to_ref: edge.to_ref, edge_kind: edge.edge_kind, review: edge.review }));
  for (const assignment of digest.role_assignments || []) records.push(record(assignment.assignment_id, 'role', `${assignment.role} · ${assignment.raci}`, byElement.get(assignment.element_ref)?.name || assignment.element_ref, assignment.source, { element_ref: assignment.element_ref, raci: assignment.raci, review: assignment.review }));
  for (const risk of digest.risks || []) records.push(record(risk.risk_id, 'risk', risk.description, `关联流程：${refs(risk.element_refs).join('、') || '未关联'}`, risk.source, { links: refs(risk.element_refs), basis: risk.assertion_basis, review: risk.review }));
  for (const control of digest.controls || []) records.push(record(control.control_id, 'control', control.measure, byElement.get(control.element_ref)?.name || control.element_ref || '未关联流程', control.source, { element_ref: control.element_ref, links: refs(control.risk_refs), basis: control.assertion_basis, review: control.review }));
  for (const issue of digest.issues || []) records.push(record(issue.issue_id, 'issue', issue.description, issue.recommendation || '', issue.source, { blocking: issue.blocking, risk_level: issue.risk_level, links: refs(issue.related_refs) }));
  const candidateRecords = (candidates?.candidates || []).map((candidate) => {
    const candidateSource = digestSource(candidate.sourceBlock);
    const proposals = (candidate.produces || []).map((proposal) => ({
      local_id: proposal.localId,
      rdf_type: proposal.rdfType,
      label: proposal.label || proposal.statement || proposal.clauseText || '',
      properties: proposal.properties || {},
    }));
    return record(candidate.candidateId, 'candidate', candidate.candidateId, candidate.disposition, candidateSource, {
      disposition: candidate.disposition,
      clause_types: refs(candidate.clauseType),
      confidence: candidate.confidence,
      core_version: candidate.coreVersion,
      review_pool: candidate.reviewPool,
      review: candidate.review,
      proposals,
      parameters: refs(candidate.parameters),
      transitions: refs(candidate.transitions),
      alignments: refs(candidate.alignments),
    });
  });
  records.push(...candidateRecords);

  return {
    meta: { digest_id: digest.digest_id, status: digest.status, generated_at: digest.generated_at, title: digest.document_identity?.title || parsed.document?.identity?.title || digest.digest_id, doc_id: digest.document_identity?.doc_id || parsed.document?.docId, schema_version: digest.digest_schema_version },
    identity: digest.document_identity,
    scope: digest.scope,
    source_blocks: sourceBlocks,
    records,
    roots: elements.filter((item) => !item.parent_ref).map((item) => item.element_id),
    process_ids: elements.filter((item) => item.level === 'L3').map((item) => item.element_id),
    pending_confirmations: digest.pending_confirmations || [],
    counts: {
      source_blocks: sourceBlocks.length, rules: (digest.rules || []).length, process_elements: elements.length,
      processes: elements.filter((item) => item.level === 'L3').length, artifacts: (digest.artifacts || []).length,
      roles: (digest.role_assignments || []).length, risks: (digest.risks || []).length, controls: (digest.controls || []).length,
      issues: (digest.issues || []).length, candidates: candidateRecords.length,
    },
  };
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function renderExplanationHtml(model) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${String(model.meta.title).replace(/[<>&"]/g, '')} · 制度解构导览</title>
<style>
:root{--bg:#f4f6f8;--panel:#fff;--ink:#17202a;--muted:#65717e;--line:#dce2e8;--blue:#1769aa;--blue2:#e9f3fb;--green:#247a52;--amber:#a75d00;--red:#b42318;--shadow:0 8px 28px rgba(25,38,52,.08)}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}button,input{font:inherit}.top{padding:22px 28px;background:#12344d;color:#fff}.top h1{margin:0 0 4px;font-size:24px}.top p{margin:0;color:#c9dae6}.status{display:inline-block;margin-left:8px;padding:2px 8px;border:1px solid #7ea5bf;border-radius:999px;font-size:12px}.layout{display:grid;grid-template-columns:minmax(540px,1fr) minmax(360px,.72fr);gap:16px;padding:16px;min-height:calc(100vh - 92px)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}.toolbar{display:flex;gap:8px;align-items:center;padding:12px;border-bottom:1px solid var(--line);position:sticky;top:0;background:#fff;z-index:3}.tabs{display:flex;gap:4px;flex-wrap:wrap}.tab,.filter{border:0;background:transparent;padding:7px 10px;border-radius:7px;color:var(--muted);cursor:pointer}.tab.active,.tab:hover,.filter:hover{background:var(--blue2);color:var(--blue)}.search{margin-left:auto;min-width:180px;border:1px solid var(--line);border-radius:7px;padding:7px 10px}.content{padding:16px;max-height:calc(100vh - 170px);overflow:auto}.view{display:none}.view.active{display:block}.intro{padding:13px 15px;background:#edf6fc;border-left:4px solid var(--blue);border-radius:8px;margin-bottom:14px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.metric{padding:12px;border:1px solid var(--line);border-radius:9px}.metric b{display:block;font-size:22px;color:var(--blue)}h2{font-size:18px;margin:18px 0 10px}h3{font-size:15px;margin:14px 0 8px}.card{border:1px solid var(--line);border-radius:9px;padding:11px 12px;margin:8px 0;cursor:pointer;transition:.15s}.card:hover,.card.selected{border-color:#65a6d3;background:#f5faff}.card-head{display:flex;gap:8px;align-items:center}.card-title{font-weight:650}.card-id{font:11px ui-monospace,Consolas,monospace;color:var(--muted)}.detail{color:var(--muted);margin-top:4px}.badge{display:inline-block;padding:2px 7px;border-radius:999px;background:#edf0f3;color:#58636f;font-size:11px}.badge.L1,.badge.L2,.badge.L3{background:#e5f1fa;color:#155d8d}.badge.warn{background:#fff3dd;color:var(--amber)}.badge.danger{background:#feeceb;color:var(--red)}.tree{margin-left:16px;border-left:1px dashed #b9c8d3;padding-left:12px}.process-box{border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0}.flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.flow-node{padding:6px 9px;background:#eef5fa;border-radius:7px}.arrow{color:var(--blue)}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}.source-panel{position:relative}.source-head{padding:14px 16px;border-bottom:1px solid var(--line)}.source-head h2{margin:0}.source-list{padding:12px 16px;max-height:calc(100vh - 165px);overflow:auto}.source-block{padding:12px;border:1px solid var(--line);border-radius:9px;margin-bottom:10px}.source-block.active{border:2px solid var(--blue);background:#f4faff}.source-meta{color:var(--muted);font-size:12px;margin-bottom:6px}.source-text{white-space:pre-wrap}.explain{margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.explain strong{color:var(--blue)}.empty{padding:24px;text-align:center;color:var(--muted)}.method{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.method div{padding:10px;background:#f7f9fa;border-radius:8px}.legend{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.mobile-source{display:none}@media(max-width:980px){.layout{grid-template-columns:1fr}.content{max-height:none}.source-list{max-height:none}.metrics{grid-template-columns:repeat(2,1fr)}.source-panel{position:static}}@media print{.toolbar,.search{display:none}.layout{display:block}.panel{box-shadow:none;margin-bottom:12px}.content,.source-list{max-height:none}.view{display:block!important}.card{break-inside:avoid}}
</style></head><body>
<header class="top"><h1>制度解构导览 <span class="status" id="status"></span></h1><p id="subtitle"></p></header>
<main class="layout"><section class="panel"><div class="toolbar"><div class="tabs"><button class="tab active" data-view="overview">怎么读</button><button class="tab" data-view="hierarchy">流程分层</button><button class="tab" data-view="processes">流程提炼</button><button class="tab" data-view="roles">角色职责</button><button class="tab" data-view="trace">规则与风控</button><button class="tab" data-view="projection">本体投影</button></div><input id="search" class="search" placeholder="搜索名称、ID、角色…"></div><div class="content"><div id="overview" class="view active"></div><div id="hierarchy" class="view"></div><div id="processes" class="view"></div><div id="roles" class="view"></div><div id="trace" class="view"></div><div id="projection" class="view"></div></div></section><aside class="panel source-panel"><div class="source-head"><h2>原文对照</h2><div class="detail">点击左侧任一记录，查看它来自哪一条原文，以及为何这样结构化。</div></div><div id="sources" class="source-list"></div></aside></main>
<script id="policy-data" type="application/json">${safeJson(model)}</script>
<script>
const M=JSON.parse(document.getElementById('policy-data').textContent);const R=new Map(M.records.map(x=>[x.id,x]));const E=[...R.values()].filter(x=>x.kind==='process');const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const arr=v=>Array.isArray(v)?v:[];const byKind=k=>[...R.values()].filter(x=>x.kind===k);let selected='';
document.getElementById('status').textContent=M.meta.status;document.getElementById('subtitle').textContent=M.meta.title+' · '+M.meta.doc_id+' · Digest '+M.meta.schema_version;
function badge(t,c=''){return '<span class="badge '+c+'">'+esc(t)+'</span>'}function card(x,body=''){return '<article class="card" data-id="'+esc(x.id)+'"><div class="card-head">'+badge(x.kind)+(x.level?badge(x.level,x.level):'')+'<span class="card-title">'+esc(x.title)+'</span></div><div class="card-id">'+esc(x.id)+'</div>'+(x.detail?'<div class="detail">'+esc(x.detail)+'</div>':'')+body+'</article>'}
function tree(id){const x=R.get(id);if(!x)return '';return card(x,'<div class="legend">'+(x.basis?badge('依据：'+x.basis,x.basis==='inferred_structure'?'warn':''):'')+(x.hierarchy_status?badge('层级：'+x.hierarchy_status,x.hierarchy_status!=='resolved'?'danger':''):'')+'</div>')+(arr(x.children).length?'<div class="tree">'+x.children.map(tree).join('')+'</div>':'')}
function overview(){const c=M.counts;document.getElementById('overview').innerHTML='<div class="intro"><b>这不是另一份摘要。</b> 它是可独立打开的审阅界面：左侧展示 AI 如何从制度原文形成规则、流程层级、角色、控制和本体候选；点击任何结构化记录，右侧立即显示对应原文块、锚点和判断依据。</div><div class="metrics">'+[['原文块',c.source_blocks],['L3 流程',c.processes],['规则',c.rules],['角色指派',c.roles],['流程元素',c.process_elements],['Artifact',c.artifacts],['本体候选',c.candidates],['问题',c.issues]].map(x=>'<div class="metric"><b>'+x[1]+'</b>'+x[0]+'</div>').join('')+'</div><h2>解构步骤</h2><div class="method"><div><b>1. 锚定原文</b><br>保留条款、结构路径、页码和原文块。</div><div><b>2. 识别规则</b><br>提取主体、触发、要求、参数和例外。</div><div><b>3. 划分流程</b><br>按独立目标、入口和输出判断 L3 边界。</div><div><b>4. 递归分层</b><br>形成 L1–L5 父子树，不照搬章节目录。</div><div><b>5. 识别交接</b><br>用 Artifact 的生产/消费连接不同流程。</div><div><b>6. 绑定治理</b><br>将 RACI、风险、控制和规则挂到准确层级。</div></div><h2>审阅提示</h2><div class="legend">'+badge('explicit_text 明文')+badge('inferred_structure 推断','warn')+badge('unresolved 待确认','danger')+'</div>'}
function hierarchy(){document.getElementById('hierarchy').innerHTML='<div class="intro">分层回答“它属于什么”，流转回答“它先后怎么做”。点击节点核对直接父级、所属 L3、分层依据和置信度。</div>'+M.roots.map(tree).join('')}
function processes(){let html='<div class="intro">每个 L3 是具有独立目标、入口、活动和输出的可运行流程。跨 L3 协作通过 Artifact 交接，而不是伪造流程顺序边。</div>';for(const pid of M.process_ids){const p=R.get(pid);const descendants=[];const walk=id=>{for(const child of arr(R.get(id)?.children)){descendants.push(child);walk(child)}};walk(pid);const scope=new Set([pid,...descendants]);const edges=byKind('edge').filter(x=>x.process_ref===pid);const arts=byKind('artifact').filter(x=>arr(x.produced_by).some(id=>scope.has(id))||arr(x.consumed_by).some(id=>scope.has(id)));const objectives=arr(p.objectives).map(id=>R.get(id)?.title||id);const boundary='<div class="method"><div><b>目标</b><br>'+esc(objectives.join('；')||'未提取')+'</div><div><b>入口</b><br>'+esc(arr(p.entry_conditions).join('；')||'未提取')+'</div><div><b>出口</b><br>'+esc(arr(p.exit_conditions).join('；')||'未提取')+'</div><div><b>分层依据</b><br>'+esc(p.basis||'未记录')+'</div></div>';html+='<section class="process-box">'+card(p,boundary)+'<h3>包含的活动与任务</h3>'+(descendants.length?descendants.map(id=>card(R.get(id))).join(''):'<div class="detail">未提取子活动</div>')+'<h3>流程内流转</h3><div class="flow">'+(edges.length?edges.map(x=>'<button class="filter" data-id="'+esc(x.id)+'"><span class="flow-node">'+esc(R.get(x.from_ref)?.title||x.from_ref)+'</span> <span class="arrow">→</span> <span class="flow-node">'+esc(R.get(x.to_ref)?.title||x.to_ref)+'</span></button>').join(''):'<span class="detail">未提取流转边</span>')+'</div><h3>输入/输出交接</h3>'+(arts.length?arts.map(x=>card(x)).join(''):'<div class="detail">未提取 Artifact</div>')+'</section>'}document.getElementById('processes').innerHTML=html}
function roles(){const roles=byKind('role');document.getElementById('roles').innerHTML='<div class="intro">RACI 表示 R 执行、A 最终负责、C 征询、I 知会、S 支持。每一项都能回到自己的制度依据。</div><table><thead><tr><th>流程层级</th><th>角色</th><th>RACI</th><th>记录</th></tr></thead><tbody>'+roles.map(x=>'<tr class="card" data-id="'+esc(x.id)+'"><td>'+esc(R.get(x.element_ref)?.title||x.element_ref)+'</td><td>'+esc(x.title.replace(/ · [RACIS]$/,''))+'</td><td>'+badge(x.raci)+'</td><td class="card-id">'+esc(x.id)+'</td></tr>').join('')+'</tbody></table>'}
function trace(){const groups=[['规则','rule'],['目标','objective'],['风险','risk'],['控制','control'],['问题与待确认','issue']];document.getElementById('trace').innerHTML='<div class="intro">这里展示“原文要求 → 流程落点 → 风险控制”的推导链。分析建议不会伪装成制度明文。</div>'+groups.map(([n,k])=>'<h2>'+n+'</h2>'+((byKind(k).map(x=>card(x)).join(''))||'<div class="detail">无记录</div>')).join('')}
function projection(){const candidates=byKind('candidate');document.getElementById('projection').innerHTML='<div class="intro"><b>本页展示准备进入本体候选层的数据。</b> 请重点检查 Core 版本、review pool、proposal 类型、parameter target、transition 端点和临时 efio:* 映射。PENDING_CORE_ALIGNMENT 不等于已可正式序列化。</div>'+(candidates.length?candidates.map(x=>{const proposals=arr(x.proposals).map(p=>'<li><span class="card-id">'+esc(p.local_id)+'</span> · '+esc(p.rdf_type)+(p.label?' · '+esc(p.label):'')+(p.properties['efio:mappingStatus']?'<br>'+badge(p.properties['efio:mappingStatus'],'warn'):'')+'</li>').join('');const details='<div class="legend">'+badge('disposition: '+x.disposition)+badge('confidence: '+x.confidence)+badge('Core: '+x.core_version)+badge('review: '+x.review_pool,(x.review_pool==='full'?'warn':''))+'</div><h3>Produces ('+arr(x.proposals).length+')</h3><ul>'+proposals+'</ul><div class="detail">Parameters '+arr(x.parameters).length+' · Transitions '+arr(x.transitions).length+' · Alignments '+arr(x.alignments).length+'</div>';return card(x,details)}).join(''):'<div class="empty">当前导览未加载 candidates.json</div>')}
function why(x){if(x.kind==='process')return '根据原文中的目标、边界、责任、输入输出与执行粒度，将其判定为 '+x.level+'；分层依据为 '+(x.basis||'未记录')+'。';if(x.kind==='role')return '原文将“'+x.title.replace(/ · [RACIS]$/,'')+'”与该流程元素关联，并按职责语义映射为 RACI '+x.raci+'。';if(x.kind==='artifact')return '该对象被识别为流程产出或输入，用于说明流程之间如何交接。';if(x.kind==='edge')return '该记录表达同一 L3 内的执行顺序或条件路径，不代表父子层级。';if(x.kind==='rule')return '从原文提取规范性要求，并通过关联 ID 指向落实该要求的流程元素。';if(x.kind==='candidate')return '这是由结构化记录投影到本体摄取交换层的候选。它仍需检查 Core 版本、proposal、参数、流转和人审状态。';if(x.kind==='risk'||x.kind==='control')return '此记录按 assertion_basis 区分制度明文与分析判断：'+(x.basis||'未记录')+'。';return '该结论保留独立来源锚点，需结合原文和审核状态判断。'}
function sources(){const q=document.getElementById('search').value.trim().toLowerCase();const selectedRecord=R.get(selected);let blocks=M.source_blocks.filter(b=>!q||(b.text+' '+b.block_id+' '+b.block_path+' '+b.clause_ref).toLowerCase().includes(q));if(selectedRecord){const exact=blocks.filter(b=>b.source_key===selectedRecord.source_key||b.block_id===selectedRecord.source?.block_id);if(exact.length)blocks=exact}document.getElementById('sources').innerHTML=blocks.length?blocks.map(b=>'<section class="source-block '+(selectedRecord&&(b.source_key===selectedRecord.source_key||b.block_id===selectedRecord.source?.block_id)?'active':'')+'"><div class="source-meta">'+esc(b.clause_ref||'未编号')+' · '+esc(b.block_path)+' · '+esc(b.block_id)+(b.page_hint?' · 第 '+b.page_hint+' 页':'')+(b.needs_verification?' '+badge('解析待核','warn'):'')+'</div><div class="source-text">'+esc(b.text)+'</div>'+(selectedRecord?'<div class="explain"><strong>结构化为：</strong> '+esc(selectedRecord.kind)+' / '+esc(selectedRecord.id)+'<br><strong>判断说明：</strong> '+esc(why(selectedRecord))+(selectedRecord.confidence&&typeof selectedRecord.confidence==='object'?'<br><strong>层级置信：</strong> '+Object.entries(selectedRecord.confidence).map(([k,v])=>esc(k)+' '+esc(v)).join(' · '):'')+'</div>':'')+'</section>').join(''):'<div class="empty">没有匹配的原文块</div>'}
function bind(){document.querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>{selected=el.dataset.id;document.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));el.classList.add('selected');sources()})}function render(){overview();hierarchy();processes();roles();trace();projection();bind();sources()}document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab,.view').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.getElementById(t.dataset.view).classList.add('active');bind()});document.getElementById('search').oninput=()=>{const q=document.getElementById('search').value.trim().toLowerCase();document.querySelectorAll('.card').forEach(c=>{const x=R.get(c.dataset.id);c.style.display=!q||(x&&JSON.stringify(x).toLowerCase().includes(q))?'':'none'});sources()};render();
</script></body></html>`;
}

export function generateExplanation(packageDirectory, outputPath = null) {
  const directory = resolve(packageDirectory);
  const digestPath = join(directory, 'digest.json');
  const parsedPath = join(directory, 'normalized.parsed.json');
  const candidatesPath = join(directory, 'candidates.json');
  if (!existsSync(digestPath)) throw new Error(`缺少 ${digestPath}`);
  if (!existsSync(parsedPath)) throw new Error(`缺少 ${parsedPath}`);
  const model = buildExplanationModel(readJson(digestPath), readJson(parsedPath), existsSync(candidatesPath) ? readJson(candidatesPath) : null);
  const target = resolve(outputPath || join(directory, 'explanation.html'));
  writeFileSync(target, renderExplanationHtml(model), 'utf8');
  return { outputPath: target, model };
}

function runCli() {
  const args = process.argv.slice(2); const input = args.find((arg) => !arg.startsWith('--'));
  if (!input) throw new Error('用法: node generate-policy-digest-explanation.mjs <package-directory> [--output <path>]');
  const outputIndex = args.indexOf('--output'); const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
  if (outputIndex >= 0 && !output) throw new Error('--output 后必须提供路径');
  const result = generateExplanation(input, output);
  console.log(`✓ 已生成独立制度解构导览：${result.outputPath}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { runCli(); } catch (error) { console.error(`🔴 ${error.message}`); process.exitCode = 1; }
}
