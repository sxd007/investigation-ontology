# -*- coding: utf-8 -*-
r"""跨空间任务看板渲染器：解析登记表 + 各空间任务卡，生成单文件离线 board.html。

用法:
  python refresh_board.py [--home DIR] [--config FILE] [--registry FILE]
                          [--out FILE] [--tasks-dirname NAME] [--dry]

参数解析优先级：命令行 > config.json > 内置默认。
  --config         config.json 路径，默认 <home>/config.json（schema 见 docs/config-schema.md）
  --home           用户级目录（登记表 / 看板默认位置），默认 ~/.task-board
  --registry       登记表路径，默认 <home>/<config.registry=workspaces.md>
  --out            看板输出路径，默认 <home>/<config.board=board.html>
  --tasks-dirname  工作区级台账目录名，默认 <config.tasks_dirname=.taskboard>
  --dry            不写盘，仅打印统计
config.tips 可调阈值：stale_days（停滞判定，默认 14）、due_soon_days（临期复核，默认 7）

设计约束:
- 看板是派生缓存，每次刷新覆盖；权威数据在各工作区 <tasks-dirname>/tasks/*.md
- 统计一律脚本解析，不手算（纪律 10）
- 单文件离线 HTML：内联 CSS/JS，零 CDN 依赖；卡片正文嵌入页内，点击标题弹窗查看
  （不使用 file:// 链接 —— webview/浏览器安全策略会拦截）
- 总览 tab：工作区 → 项目视角 + 规则化综合提示；具体任务在各工作区 tab
"""
import os, io, re, sys, json, html, collections, datetime, argparse

FIVE = ('active', 'waiting', 'blocked', 'done', 'dropped')
PRI_ORDER = {'P0': 0, 'P1': 1, 'P2': 2, 'P3': 3}
ST_ORDER = {'blocked': 0, 'waiting': 1, 'active': 2}
PLACEHOLDERS = ('', '-', '无', 'none', 'None')
BODY_CAP = 6000  # 嵌入正文的字符上限


# ---------------------------------------------------------------- 卡片解析

def parse_card(path):
    """解析卡片：frontmatter（标量 / 行内列表 / 块列表）+ 正文。"""
    s = io.open(path, encoding='utf-8').read()
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)$', s, re.S)
    if not m:
        return None, ''
    fm, body = {}, m.group(2)
    cur_key = None
    for line in m.group(1).splitlines():
        blk = re.match(r'^\s+-\s+(.*)$', line)
        if blk and cur_key:
            fm.setdefault(cur_key, [])
            if isinstance(fm[cur_key], list):
                fm[cur_key].append(blk.group(1).strip())
            continue
        kv = re.match(r'^(\w+):\s*(.*)$', line)
        if kv:
            cur_key = kv.group(1)
            v = kv.group(2).strip()
            il = re.match(r'^\[(.*)\]$', v)
            if il:
                items = [x.strip().strip('"').strip("'") for x in il.group(1).split(',')]
                fm[cur_key] = [x for x in items if x]
            else:
                fm[cur_key] = v
    return fm, body


def fm_scalar(fm, key, default=''):
    v = fm.get(key, default)
    if isinstance(v, list):
        return v[0] if v else default
    return v if v not in PLACEHOLDERS else default


def fm_list(fm, key):
    v = fm.get(key)
    if isinstance(v, list):
        return [x for x in v if x not in PLACEHOLDERS]
    return []


def field_bold(body, name):
    m = re.search(r'\*\*%s\*\*[：:]\s*(.+)' % re.escape(name), body)
    return m.group(1).strip() if m else ''


def field_section_first(body, section, patterns):
    """取指定 ## 节的第一条有效内容（bullet 或编号行）。"""
    m = re.search(r'##\s*%s[^\n]*\n(.*?)(\n## |\Z)' % re.escape(section), body, re.S)
    if not m:
        return ''
    for line in m.group(1).splitlines():
        t = line.strip()
        for p in patterns:
            mm = re.match(p, t)
            if mm:
                t = mm.group(1).strip()
                break
        else:
            continue
        if not t or t in ('无', '无（可直接执行）') or t.startswith('<'):
            continue
        t = re.sub(r'\*\*', '', t)
        return t if len(t) <= 120 else t[:119] + '…'
    return ''


def field_bottleneck(body):
    return field_section_first(body, '阻塞', [r'^-\s+(.*)$'])


def field_next_step(body):
    return field_section_first(body, '下一步', [r'^\d+[.、]\s*(.*)$', r'^-\s+(.*)$'])


# ---------------------------------------------------------------- 登记表

def load_registry(path):
    s = io.open(path, encoding='utf-8').read()
    m = re.search(r'##\s*纳入汇总\s*\n(.*?)(\n## |\Z)', s, re.S)
    rows = []
    if not m:
        return rows
    for line in m.group(1).splitlines():
        mm = re.match(r'^\|\s*\*{0,2}([^|*]+)\*{0,2}\s*\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|', line)
        if mm:
            rows.append(dict(name=mm.group(1).strip(), path=mm.group(2).strip(),
                             topic=mm.group(3).strip(), tb=mm.group(4).strip()))
    return rows


# ---------------------------------------------------------------- 聚合

def collect(ws, ws_idx, tasks_dirname, today):
    """读一个工作区的全部卡片，返回结构化数据。"""
    d = os.path.join(ws['path'], tasks_dirname, 'tasks')
    entry = dict(ws, cards=[], c=collections.Counter())
    if not os.path.isdir(d):
        entry['none'] = True
        return entry
    for f in sorted(os.listdir(d)):
        if not f.endswith('.md'):
            continue
        fm, body = parse_card(os.path.join(d, f))
        if fm is None:
            continue
        cid = fm_scalar(fm, 'id', '?')
        kind = 'P' if cid.startswith('P-') else 'T'
        st = fm_scalar(fm, 'status', '?')
        if st not in FIVE:
            st = '?'
        project = fm_scalar(fm, 'project')
        solo = (kind == 'T' and not project)
        nrv = fm_scalar(fm, 'next_review')
        overdue = bool(nrv) and st not in ('done', 'dropped') and nrv < today
        upd = fm_scalar(fm, 'updated')
        try:
            stale = (datetime.date.today() - datetime.date.fromisoformat(upd)).days if upd else None
        except ValueError:
            stale = None
        entry['cards'].append(dict(
            key='w%d-%s' % (ws_idx, cid),
            id=cid, title=fm_scalar(fm, 'title'), project=project,
            pri=fm_scalar(fm, 'priority', 'P3'), st=st, kind=kind, solo=solo,
            updated=upd, stale=stale, next_review=nrv, overdue=overdue,
            children=fm_list(fm, 'children'), kb_refs=fm_list(fm, 'kb_refs'),
            body=body[:BODY_CAP],
            goal=field_bold(body, '目标'),
            progress=field_bold(body, '进度'),
            bottleneck=field_bottleneck(body),
            next_step=field_next_step(body)))
        if st != 'done':
            key = ('proj_' if kind == 'P' else 'solo_' if solo else 'sub_') + st
            entry['c'][key] += 1
    return entry


def aggregate(ws_data):
    T = collections.Counter()
    for e in ws_data:
        T.update(e['c'])
    return T


# ---------------------------------------------------------------- HTML 渲染

CSS = """
:root { --bd:#e8eaed; --mut:#80868b; --bg:#fafafa; --card:#fff; --ink:#202124; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font:14px/1.65 system-ui,"Segoe UI","Microsoft YaHei",sans-serif; }
.wrap { max-width:1060px; margin:0 auto; padding:20px 24px 64px; }
.hidden { display:none !important; }

.top { display:flex; align-items:baseline; gap:16px; margin-bottom:4px; }
.top h1 { font-size:18px; margin:0; font-weight:600; }
.top .meta { color:var(--mut); font-size:12px; }

.tabs { display:flex; flex-wrap:wrap; gap:2px; border-bottom:1px solid var(--bd);
  margin:12px 0 0; position:sticky; top:0; background:var(--bg); z-index:10; padding-top:6px; }
.tabs button { border:none; background:none; padding:8px 14px; cursor:pointer;
  font-size:13.5px; color:#5f6368; border-bottom:2px solid transparent; }
.tabs button:hover { color:var(--ink); }
.tabs button.on { color:#1a56db; border-bottom-color:#1a56db; font-weight:600; }
.tabs .cnt { display:inline-block; min-width:18px; margin-left:5px; padding:0 5px;
  border-radius:9px; background:#eef1f4; color:#5f6368; font-size:11px; line-height:16px; }
.tabs button.on .cnt { background:#e8f0fe; color:#1a56db; }
.tabpage { padding-top:18px; }

/* 总览 */
.stats { display:flex; gap:40px; margin:6px 0 4px; }
.stat .num { font-size:30px; font-weight:700; line-height:1.2; }
.stat .lbl { color:var(--mut); font-size:12px; }
.stat.warn .num { color:#b45309; } .stat.bad .num { color:#b91c1c; }
.subline { color:var(--mut); font-size:12px; margin-bottom:8px; }
.ovh { font-size:14px; font-weight:600; color:#3c4043; margin:28px 0 10px; }
.ovh .hint { font-weight:400; color:var(--mut); font-size:12px; margin-left:8px; }

.wsgrid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media (max-width:860px) { .wsgrid { grid-template-columns:1fr; } }
.wscard { background:var(--card); border:1px solid var(--bd); border-radius:10px;
  padding:14px 16px; }
.wscard .wsname { font-size:14px; font-weight:600; }
.wscard .wsname .gotab { float:right; font-size:12px; font-weight:400; color:#1a56db;
  cursor:pointer; }
.wscard .wstopic { color:var(--mut); font-size:11.5px; margin:2px 0 10px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pjline { padding:6px 0; border-top:1px solid #f0f1f3; }
.pjline .pjtop { display:flex; align-items:center; gap:8px; }
.pjline .pjname { font-size:13px; }
.pjline .bar { flex:1; max-width:120px; height:5px; background:#eef1f4;
  border-radius:3px; overflow:hidden; }
.pjline .bar i { display:block; height:100%; background:#1a56db; border-radius:3px; }
.pjline .ratio { color:var(--mut); font-size:11.5px; white-space:nowrap; }
.pjline .pprog { color:#5f6368; font-size:12px; margin-top:2px; }
.sololine { color:var(--mut); font-size:11.5px; margin-top:8px; }
.wscard.none .empty { padding:2px 0 0; }

.tips { list-style:none; margin:0; padding:0; }
.tips li { background:var(--card); border:1px solid var(--bd); border-radius:10px;
  padding:10px 16px; margin:8px 0; font-size:13px; }
.tips .ticon { margin-right:8px; }
.tips .tl { color:#5f6368; }

/* 表格 */
table { width:100%; border-collapse:collapse; background:var(--card);
  border:1px solid var(--bd); border-radius:10px; overflow:hidden; }
th, td { text-align:left; padding:8px 14px; vertical-align:top; font-size:13px; }
th { color:var(--mut); font-weight:500; font-size:12px; background:#f7f8f9;
  border-bottom:1px solid var(--bd); }
td { border-bottom:1px solid #f0f1f3; }
tr:last-child td { border-bottom:none; }
tr.sub td:first-child { padding-left:34px; }
tr.sub .t { color:#5f6368; }

.cardlink { color:#1a56db; cursor:pointer; }
.cardlink:hover { text-decoration:underline; }
.badge { display:inline-block; border-radius:10px; padding:1px 9px; font-size:12px;
  white-space:nowrap; }
.st-active { background:#e8f0fe; color:#1a56db; }
.st-waiting { background:#fef3c7; color:#b45309; }
.st-blocked { background:#fee2e2; color:#b91c1c; }
.st-done { background:#f3f4f6; color:#6b7280; }
.st-dropped { background:#f3f4f6; color:#9aa0a6; text-decoration:line-through; }
.pri { font-weight:600; font-size:11.5px; margin-right:6px; }
.pri-P0 { color:#b91c1c; } .pri-P1 { color:#c2410c; }
.pri-P2 { color:#1a56db; } .pri-P3 { color:#9aa0a6; }
.bneck { color:#b45309; font-size:12px; }
.overdue { color:#b91c1c; font-size:12px; font-weight:600; }
.stale { color:#b0b5ba; font-size:11px; }
.ns { color:#0d7a5f; }

.filters { display:none; flex-wrap:wrap; gap:6px; align-items:center; padding:12px 0 2px; }
.filters button { border:1px solid var(--bd); background:var(--card); border-radius:14px;
  padding:3px 12px; cursor:pointer; font-size:12.5px; color:#5f6368; }
.filters button.on { background:#202124; color:#fff; border-color:#202124; }
.filters input { border:1px solid var(--bd); border-radius:14px; padding:4px 12px;
  font-size:12.5px; width:180px; margin-left:auto; }

/* 工作区 tab */
.wshead { margin:2px 0 12px; }
.wshead .topic { font-size:13px; color:#3c4043; }
.wshead .path { color:#b0b5ba; font-size:11.5px; font-family:Consolas,monospace; }
.wssum { color:var(--mut); font-size:12.5px; margin-top:2px; }
.sech { font-size:13px; font-weight:600; color:#5f6368; margin:18px 0 6px; }
details.proj { margin:10px 0; }
details.proj > summary { cursor:pointer; list-style:none; padding:10px 16px;
  background:var(--card); border:1px solid var(--bd); border-radius:10px;
  font-size:13.5px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
details.proj > summary::-webkit-details-marker { display:none; }
details.proj[open] > summary { border-radius:10px 10px 0 0; border-bottom:none; }
details.proj > summary .arrow { color:#9aa0a6; transition:transform .15s; }
details.proj[open] > summary .arrow { transform:rotate(90deg); }
details.proj > summary .bar { flex:1; min-width:60px; max-width:140px; height:5px;
  background:#eef1f4; border-radius:3px; overflow:hidden; }
details.proj > summary .bar i { display:block; height:100%; background:#1a56db; }
details.proj > summary .subnote { color:var(--mut); font-size:12px; font-weight:400; }
details.proj > .pbody { background:var(--card); border:1px solid var(--bd);
  border-top:none; border-radius:0 0 10px 10px; padding:10px 16px 14px; }
.pmeta { font-size:12.5px; color:#3c4043; margin-bottom:8px; }
.pmeta div { margin:2px 0; }
.pmeta .k { color:var(--mut); display:inline-block; min-width:34px; }
details.proj table { border:none; border-radius:0; }
details.proj .pbody table { border-top:1px solid #f0f1f3; }
.empty { color:var(--mut); font-size:13px; padding:10px 2px; }
.foot { margin-top:36px; color:#b0b5ba; font-size:12px; border-top:1px solid var(--bd);
  padding-top:12px; }

/* 卡片弹窗 */
.overlay { position:fixed; inset:0; background:rgba(32,33,36,.45); z-index:100;
  display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; }
.modal { background:#fff; border-radius:12px; max-width:760px; width:100%;
  max-height:calc(100vh - 80px); overflow:auto; padding:24px 28px; position:relative;
  box-shadow:0 8px 30px rgba(0,0,0,.18); }
.modal .mclose { position:absolute; top:12px; right:16px; border:none; background:none;
  font-size:20px; color:#9aa0a6; cursor:pointer; }
.modal .mmeta { display:flex; gap:10px; align-items:center; flex-wrap:wrap;
  margin:6px 0 14px; font-size:12.5px; color:var(--mut); }
.modal h2.ct { font-size:17px; margin:0; padding-right:30px; }
.modal .md h1 { font-size:16px; margin:14px 0 6px; }
.modal .md h2 { font-size:14.5px; margin:16px 0 6px; border:none; padding:0; }
.modal .md h3 { font-size:13.5px; margin:12px 0 4px; }
.modal .md p { margin:6px 0; font-size:13px; }
.modal .md ul, .modal .md ol { margin:6px 0; padding-left:22px; font-size:13px; }
.modal .md table { margin:8px 0; font-size:12.5px; }
.modal .md code { background:#f3f4f6; border-radius:4px; padding:0 4px; font-size:12px; }
"""

JS = """
function showTab(id) {
  document.querySelectorAll('.tabpage').forEach(function(p) { p.classList.add('hidden'); });
  document.getElementById(id).classList.remove('hidden');
  document.querySelectorAll('.tabs button').forEach(function(b) {
    b.classList.toggle('on', b.dataset.tab === id);
  });
  document.getElementById('filters').style.display = (id === 'tab-overview') ? 'none' : 'flex';
}
document.querySelectorAll('.tabs button').forEach(function(b) {
  b.addEventListener('click', function() { showTab(b.dataset.tab); });
});

/* ---- 迷你 markdown 渲染（卡片正文结构简单：标题/加粗/列表/表格/代码） ---- */
function escH(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function inline(s) {
  return escH(s)
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function renderMd(md) {
  var lines = md.split('\\n'), out = [], i = 0;
  while (i < lines.length) {
    var ln = lines[i];
    if (/^\\s*\\|/.test(ln)) {  // 表格块
      var rows = [];
      while (i < lines.length && /^\\s*\\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      var trs = rows.filter(function(r) { return !/^\\s*\\|[\\s:\\-|]+\\|\\s*$/.test(r); });
      out.push('<table>' + trs.map(function(r, ri) {
        var cells = r.replace(/^\\s*\\||\\|\\s*$/g, '').split('|');
        var tag = ri === 0 ? 'th' : 'td';
        return '<tr>' + cells.map(function(c) { return '<'+tag+'>'+inline(c.trim())+'</'+tag+'>'; }).join('') + '</tr>';
      }).join('') + '</table>');
      continue;
    }
    var m;
    if ((m = ln.match(/^(#{1,3})\\s+(.*)$/))) {
      var lv = m[1].length; out.push('<h'+lv+'>'+inline(m[2])+'</h'+lv+'>'); i++; continue;
    }
    if ((m = ln.match(/^\\s*[-*]\\s+(.*)$/))) {
      var items = [];
      while (i < lines.length && (m = lines[i].match(/^\\s*[-*]\\s+(.*)$/))) { items.push(m[1]); i++; }
      out.push('<ul>' + items.map(function(x) { return '<li>'+inline(x)+'</li>'; }).join('') + '</ul>');
      continue;
    }
    if ((m = ln.match(/^\\s*\\d+[.、]\\s*(.*)$/))) {
      var its = [];
      while (i < lines.length && (m = lines[i].match(/^\\s*\\d+[.、]\\s*(.*)$/))) { its.push(m[1]); i++; }
      out.push('<ol>' + its.map(function(x) { return '<li>'+inline(x)+'</li>'; }).join('') + '</ol>');
      continue;
    }
    if (/^\\s*---\\s*$/.test(ln)) { i++; continue; }
    if (/^\\s*$/.test(ln)) { i++; continue; }
    out.push('<p>' + inline(ln) + '</p>'); i++;
  }
  return out.join('');
}

/* ---- 卡片弹窗 ---- */
var STLBL = {active:'进行中', waiting:'等外部', blocked:'受阻', done:'已完成', dropped:'已放弃'};
function openCard(key) {
  var d = window.CARD_DATA[key]; if (!d) return;
  var ov = document.createElement('div'); ov.className = 'overlay';
  var meta = '<span class="badge st-' + d.st + '">' + (STLBL[d.st] || d.st) + '</span>'
    + '<span class="pri pri-' + d.pri + '">' + d.pri + '</span>'
    + (d.updated ? '<span>更新 ' + d.updated + '</span>' : '')
    + (d.next_review ? '<span>复核 ' + d.next_review + '</span>' : '')
    + (d.kb && d.kb.length ? '<span>参考：' + escH(d.kb.join('、')) + '</span>' : '');
  ov.innerHTML = '<div class="modal"><button class="mclose">×</button>'
    + '<h2 class="ct">' + escH(d.title) + '</h2>'
    + '<div class="mmeta">' + meta + '</div>'
    + '<div class="md">' + renderMd(d.body) + '</div></div>';
  function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  ov.addEventListener('click', function(e) { if (e.target === ov) close(); });
  ov.querySelector('.mclose').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
}
document.addEventListener('click', function(e) {
  var el = e.target.closest('.cardlink');
  if (el) { e.preventDefault(); e.stopPropagation(); openCard(el.dataset.key); return; }
  var gt = e.target.closest('.gotab');
  if (gt) { showTab(gt.dataset.tab); }
});

/* ---- 过滤器（仅工作区 tab） ---- */
function applyFilters() {
  var st = document.querySelector('.f-st.on').dataset.v;
  var pri = document.querySelector('.f-pri.on').dataset.v;
  var q = document.getElementById('q').value.trim().toLowerCase();
  document.querySelectorAll('.ws-page tr[data-st]').forEach(function(r) {
    var ok = (st === 'all' || r.dataset.st === st)
      && (pri === 'all' || r.dataset.pri === pri)
      && (!q || r.dataset.text.indexOf(q) >= 0);
    r.classList.toggle('hidden', !ok);
  });
  document.querySelectorAll('.ws-page details.proj').forEach(function(d) {
    var any = d.querySelector('tr[data-st]:not(.hidden)');
    d.classList.toggle('hidden', !any);
  });
}
document.querySelectorAll('.filters button').forEach(function(b) {
  b.addEventListener('click', function() {
    b.parentNode.querySelectorAll('button').forEach(function(x) { x.classList.remove('on'); });
    b.classList.add('on'); applyFilters();
  });
});
document.getElementById('q').addEventListener('input', applyFilters);
"""

STATUS_LABEL = {'active': '进行中', 'waiting': '等外部', 'blocked': '受阻',
                'done': '已完成', 'dropped': '已放弃', '?': '?'}


def esc(s):
    return html.escape(s or '', quote=True)


def badge_st(st):
    return '<span class="badge st-%s">%s</span>' % (esc(st), STATUS_LABEL.get(st, st))


def pri_tag(c):
    return '<span class="pri pri-%s">%s</span>' % (esc(c['pri']), esc(c['pri']))


def card_link(c, cls='cardlink t'):
    return '<span class="%s" data-key="%s">%s</span>' % (cls, esc(c['key']), esc(c['title']))


def upd_cell(c):
    s = esc(c.get('updated') or '—')
    if c.get('stale') is not None and c['stale'] > 0:
        s += ' <span class="stale">%d 天前</span>' % c['stale']
    return s


def counts(e):
    c = e['c']
    pj = c['proj_active'] + c['proj_waiting'] + c['proj_blocked']
    so = c['solo_active'] + c['solo_waiting'] + c['solo_blocked']
    sb = c['sub_active'] + c['sub_waiting'] + c['sub_blocked']
    w = c['proj_waiting'] + c['solo_waiting'] + c['sub_waiting']
    a = c['proj_active'] + c['solo_active'] + c['sub_active']
    return pj, so, sb, w, a


def proj_subs(p, cards, by_id):
    subs = [by_id[i] for i in p['children'] if i in by_id]
    if not subs:
        subs = [x for x in cards if x['kind'] == 'T' and x['project'] == p['id']]
    open_subs = [x for x in subs if x['st'] not in ('done', 'dropped')]
    return subs, open_subs


# ---------------------------------------------------------------- 总览 tab

def render_overview(ws_data, T, now, today, stale_days=14, due_soon=7):
    have = sum(1 for e in ws_data if not e.get('none'))
    pjT = T['proj_active'] + T['proj_waiting'] + T['proj_blocked']
    soT = T['solo_active'] + T['solo_waiting'] + T['solo_blocked']
    sbT = T['sub_active'] + T['sub_waiting'] + T['sub_blocked']
    wT = T['proj_waiting'] + T['solo_waiting'] + T['sub_waiting']
    aT = T['proj_active'] + T['solo_active'] + T['sub_active']
    bT = T['proj_blocked'] + T['solo_blocked'] + T['sub_blocked']
    total = pjT + soT + sbT

    out = ['<div class="tabpage" id="tab-overview">']
    out.append('<div class="stats">'
               '<div class="stat"><div class="num">%d</div><div class="lbl">未完成</div></div>'
               '<div class="stat warn"><div class="num">%d</div><div class="lbl">等外部</div></div>'
               '<div class="stat"><div class="num">%d</div><div class="lbl">进行中</div></div>'
               '<div class="stat bad"><div class="num">%d</div><div class="lbl">受阻</div></div>'
               '</div>' % (total, wT, aT, bT))
    out.append('<div class="subline">%d 个工作区（%d 有台账）· %d 项目 · %d 独立任务 · %d 子项</div>'
               % (len(ws_data), have, pjT, soT, sbT))

    # 工作区 → 项目 视角
    out.append('<div class="ovh">工作空间与项目<span class="hint">点项目看详情 · 点右上角进该空间明细</span></div>')
    out.append('<div class="wsgrid">')
    for i, e in enumerate(ws_data):
        if e.get('none'):
            out.append('<div class="wscard none"><div class="wsname">%s'
                       '<span class="gotab" data-tab="tab-ws-%d">明细 →</span></div>'
                       '<p class="empty">无台账 —— 缺数据</p></div>' % (esc(e['name']), i))
            continue
        pj, so, sb, w, a = counts(e)
        out.append('<div class="wscard"><div class="wsname">%s'
                   '<span class="gotab" data-tab="tab-ws-%d">明细 →</span></div>'
                   '<div class="wstopic">%s</div>' % (esc(e['name']), i, esc(e['topic'])))
        by_id = {x['id']: x for x in e['cards']}
        projects = [x for x in e['cards'] if x['kind'] == 'P' and x['st'] not in ('done', 'dropped')]
        projects.sort(key=lambda x: (ST_ORDER.get(x['st'], 9), PRI_ORDER.get(x['pri'], 9)))
        for p in projects:
            subs, open_subs = proj_subs(p, e['cards'], by_id)
            done_n = len(subs) - len(open_subs)
            pct = int(done_n * 100 / len(subs)) if subs else 0
            prog = ''
            if p['progress']:
                prog = '<div class="pprog">%s</div>' % esc(p['progress'])
            out.append('<div class="pjline"><div class="pjtop">%s%s %s'
                       '<span class="bar"><i style="width:%d%%"></i></span>'
                       '<span class="ratio">%d/%d</span></div>%s</div>'
                       % (pri_tag(p), card_link(p), badge_st(p['st']), pct, done_n, len(subs), prog))
        out.append('<div class="sololine">独立任务 %d 项 · 子项 %d 项 ｜ 等外部 %d · 进行中 %d</div></div>'
                   % (so, sb, w, a))
    out.append('</div>')

    # 综合提示（规则化：卡在用户 / 受阻 / 复核超期 / 临期 / 停滞 / 最值得续接）
    tips = []
    user_blk, blk, od, due, stale14, resume = [], [], [], [], [], []
    soon = (datetime.date.today() + datetime.timedelta(days=due_soon)).isoformat()
    for e in ws_data:
        if e.get('none'):
            continue
        for c in e['cards']:
            if c['st'] in ('done', 'dropped'):
                continue
            if c['st'] in ('waiting', 'blocked') and '用户' in (c['bottleneck'] or ''):
                user_blk.append((e, c))
            elif c['st'] == 'blocked':
                blk.append((e, c))
            if c['overdue']:
                od.append((e, c))
            elif c['next_review'] and today <= c['next_review'] <= soon:
                due.append((e, c))
            if c['st'] == 'active' and c.get('stale') is not None and c['stale'] >= stale_days:
                stale14.append((e, c))
            if c['st'] in ('active', 'waiting', 'blocked') and c['next_step']:
                resume.append((e, c))
    resume.sort(key=lambda x: ({'waiting': 0, 'active': 1, 'blocked': 2}.get(x[1]['st'], 9),
                               PRI_ORDER.get(x[1]['pri'], 9)))

    def names(lst, n=3):
        s = '、'.join(card_link(c) for _, c in lst[:n])
        return s + (' <span class="tl">等 %d 项</span>' % len(lst) if len(lst) > n else '')

    if user_blk:
        tips.append(('🔴', '<b>%d 项卡在你本人</b> —— %s' % (len(user_blk), names(user_blk))))
    if blk:
        tips.append(('🔴', '<b>%d 项受阻</b> —— %s' % (len(blk), names(blk))))
    if od:
        tips.append(('🟠', '<b>%d 项复核已超期</b> —— %s' % (len(od), names(od))))
    if due:
        tips.append(('🟡', '<b>%d 项 7 天内到期复核</b> —— %s' % (len(due), names(due))))
    if stale14:
        tips.append(('🟡', '<b>%d 项进行中但超 %d 天未更新</b> —— %s（还在推进吗？）'
                     % (len(stale14), stale_days, names(stale14))))
    if wT:
        ext = wT - len(user_blk)
        if ext > 0:
            tips.append(('🟡', '<b>%d 项等外部</b> —— 除去卡在你本人的，主要压在外部方，'
                         '逐个空间 tab 看「卡在什么」' % ext))
    if resume:
        e, c = resume[0]
        tips.append(('🟢', '<b>最值得续接</b> —— %s · %s：<span class="ns">▶ %s</span>'
                     % (esc(e['name']), card_link(c), esc(c['next_step']))))

    out.append('<div class="ovh">需要你知道的<span class="hint">综合提示 · 规则生成，每日刷新</span></div>')
    if tips:
        out.append('<ul class="tips">')
        for icon, text in tips:
            out.append('<li><span class="ticon">%s</span>%s</li>' % (icon, text))
        out.append('</ul>')
    else:
        out.append('<p class="empty">没有需要特别提示的事项。</p>')
    out.append('</div>')
    return '\n'.join(out)


# ---------------------------------------------------------------- 工作区 tab

TABLE_HEAD = ('<table><thead><tr><th style="width:36%">子项</th><th>状态</th>'
              '<th style="width:26%">进度 / 阻塞</th><th style="width:22%">下一步</th>'
              '<th>更新</th></tr></thead><tbody>')


def row(c, sub=True):
    attrs = ' data-st="%s" data-pri="%s" data-text="%s"%s' % (
        esc(c['st']), esc(c['pri']), esc(c['title'].lower()), ' class="sub"' if sub else '')
    t = pri_tag(c) + card_link(c)
    info = esc(c.get('progress') or '—')
    if c.get('bottleneck') and c['st'] in ('waiting', 'blocked'):
        info += '<div class="bneck">⚠ %s</div>' % esc(c['bottleneck'])
    if c.get('overdue'):
        info += '<div class="overdue">复核超期（%s）</div>' % esc(c['next_review'])
    ns = '<span class="ns">▶ %s</span>' % esc(c['next_step']) if c.get('next_step') else '—'
    return ('<tr%s><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>'
            % (attrs, t, badge_st(c['st']), info, ns, upd_cell(c)))


def render_proj_panel(p, cards, by_id):
    subs, open_subs = proj_subs(p, cards, by_id)
    done_n = len(subs) - len(open_subs)
    pct = int(done_n * 100 / len(subs)) if subs else 0
    out = ['<details class="proj" open><summary><span class="arrow">▸</span>'
           '%s<b>%s</b> %s<span class="bar"><i style="width:%d%%"></i></span>'
           '<span class="subnote">子项 %d/%d</span></summary>'
           % (pri_tag(p), card_link(p), badge_st(p['st']), pct, done_n, len(subs))]
    meta = []
    if p['goal']:
        meta.append('<div><span class="k">目标</span>%s</div>' % esc(p['goal']))
    if p['progress']:
        meta.append('<div><span class="k">进度</span>%s</div>' % esc(p['progress']))
    if p['bottleneck'] and p['st'] in ('waiting', 'blocked'):
        meta.append('<div class="bneck">⚠ %s</div>' % esc(p['bottleneck']))
    if p['next_step']:
        meta.append('<div class="ns">▶ %s</div>' % esc(p['next_step']))
    out.append('<div class="pbody">')
    if meta:
        out.append('<div class="pmeta">%s</div>' % ''.join(meta))
    if open_subs:
        out.append(TABLE_HEAD)
        for s in sorted(open_subs, key=lambda x: (ST_ORDER.get(x['st'], 9),
                                                  PRI_ORDER.get(x['pri'], 9))):
            out.append(row(s))
        out.append('</tbody></table>')
    else:
        out.append('<p class="empty">无未完成子项。</p>')
    out.append('</div></details>')
    return '\n'.join(out)


def render_ws_page(e, idx):
    parts = ['<div class="tabpage ws-page hidden" id="tab-ws-%d">' % idx]
    parts.append('<div class="wshead"><div class="topic">%s</div>'
                 '<div class="path">%s</div>' % (esc(e['topic']), esc(e['path'])))
    if e.get('none'):
        parts.append('</div><p class="empty">无台账 —— 缺数据，不等于「无未完成事项」。</p></div>')
        return '\n'.join(parts)
    pj, so, sb, w, a = counts(e)
    parts.append('<div class="wssum">%d 项目 · %d 独立任务 · %d 子项 ｜ 等外部 %d · 进行中 %d</div></div>'
                 % (pj, so, sb, w, a))
    cards = e['cards']
    by_id = {x['id']: x for x in cards}
    projects = [x for x in cards if x['kind'] == 'P' and x['st'] not in ('done', 'dropped')]
    solos = [x for x in cards if x['solo'] and x['st'] not in ('done', 'dropped')]
    if projects:
        parts.append('<div class="sech">项目（%d）</div>' % len(projects))
        for p in sorted(projects, key=lambda x: (ST_ORDER.get(x['st'], 9),
                                                 PRI_ORDER.get(x['pri'], 9))):
            parts.append(render_proj_panel(p, cards, by_id))
    if solos:
        parts.append('<div class="sech">独立任务（%d）</div>' % len(solos))
        parts.append(TABLE_HEAD.replace('子项', '事项'))
        for s in sorted(solos, key=lambda x: (ST_ORDER.get(x['st'], 9),
                                              PRI_ORDER.get(x['pri'], 9))):
            parts.append(row(s, sub=False))
        parts.append('</tbody></table>')
    if not projects and not solos:
        parts.append('<p class="empty">无未完成事项。</p>')
    parts.append('</div>')
    return '\n'.join(parts)


# ---------------------------------------------------------------- 整页

def render_board(ws_data, T, now, registry_path, today, stale_days=14, due_soon=7):
    card_data = {}
    for e in ws_data:
        for c in e.get('cards', []):
            card_data[c['key']] = dict(title=c['title'], st=c['st'], pri=c['pri'],
                                       updated=c['updated'], next_review=c['next_review'],
                                       kb=c['kb_refs'], body=c['body'])
    data_js = json.dumps(card_data, ensure_ascii=False).replace('</', '<\\/')

    out = ['<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">',
           '<meta name="viewport" content="width=device-width,initial-scale=1">',
           '<title>任务看板 · %s</title>' % now[:10],
           '<style>%s</style></head><body><div class="wrap">' % CSS]
    out.append('<div class="top"><h1>任务看板</h1>'
               '<span class="meta">%s 生成 · 派生缓存，权威数据在各工作区任务卡</span></div>' % now)

    nav = ['<div class="tabs"><button class="on" data-tab="tab-overview">总览</button>']
    for i, e in enumerate(ws_data):
        if e.get('none'):
            nav.append('<button data-tab="tab-ws-%d">%s <span class="cnt">?</span></button>'
                       % (i, esc(e['name'])))
        else:
            n = sum(v for _, v in e['c'].items())
            nav.append('<button data-tab="tab-ws-%d">%s <span class="cnt">%d</span></button>'
                       % (i, esc(e['name']), n))
    nav.append('</div>')
    out.append(''.join(nav))

    out.append('<div class="filters" id="filters">'
               '<span><button class="f-st on" data-v="all">全部状态</button>'
               '<button class="f-st" data-v="active">进行中</button>'
               '<button class="f-st" data-v="waiting">等外部</button>'
               '<button class="f-st" data-v="blocked">受阻</button></span>'
               '<span><button class="f-pri on" data-v="all">全部优先级</button>'
               '<button class="f-pri" data-v="P0">P0</button>'
               '<button class="f-pri" data-v="P1">P1</button>'
               '<button class="f-pri" data-v="P2">P2</button>'
               '<button class="f-pri" data-v="P3">P3</button></span>'
               '<input id="q" type="search" placeholder="搜索标题…">'
               '</div>')

    out.append(render_overview(ws_data, T, now, today, stale_days, due_soon))
    for i, e in enumerate(ws_data):
        out.append(render_ws_page(e, i))

    out.append('<div class="foot">登记表：%s ｜ 本页由 refresh_board.py 生成，'
               '统计由脚本解析得出；点击任意事项名称查看卡片全文（页内弹窗）。</div>'
               % esc(registry_path))
    out.append('</div><script>window.CARD_DATA=%s;</script>' % data_js)
    out.append('<script>%s</script></body></html>' % JS)
    return '\n'.join(out)


# ---------------------------------------------------------------- main

def load_json(path):
    try:
        return json.loads(io.open(path, encoding='utf-8').read())
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--home')
    ap.add_argument('--config')
    ap.add_argument('--registry')
    ap.add_argument('--out')
    ap.add_argument('--tasks-dirname')
    ap.add_argument('--dry', action='store_true')
    args = ap.parse_args()

    # 优先级：命令行 > config.json > 内置默认
    home = args.home or os.path.expanduser('~/.task-board')
    cfg_path = args.config or os.path.join(home, 'config.json')
    cfg = load_json(cfg_path) if os.path.exists(cfg_path) else {}
    if not args.home and cfg.get('home'):
        home = os.path.expanduser(cfg['home'])
    tasks_dirname = args.tasks_dirname or cfg.get('tasks_dirname') or '.taskboard'
    registry = args.registry or os.path.join(home, cfg.get('registry', 'workspaces.md'))
    out_path = args.out or os.path.join(home, cfg.get('board', 'board.html'))
    tips_cfg = cfg.get('tips') or {}
    stale_days = int(tips_cfg.get('stale_days', 14))
    due_soon = int(tips_cfg.get('due_soon_days', 7))
    if not os.path.exists(registry):
        print('登记表不存在: %s' % registry)
        return 1

    today = datetime.date.today().isoformat()
    workspaces = load_registry(registry)
    ws_data = [collect(ws, i, tasks_dirname, today) for i, ws in enumerate(workspaces)]
    T = aggregate(ws_data)
    now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    page = render_board(ws_data, T, now, registry, today, stale_days, due_soon)

    pjT = T['proj_active'] + T['proj_waiting'] + T['proj_blocked']
    soT = T['solo_active'] + T['solo_waiting'] + T['solo_blocked']
    sbT = T['sub_active'] + T['sub_waiting'] + T['sub_blocked']
    wT = T['proj_waiting'] + T['solo_waiting'] + T['sub_waiting']
    aT = T['proj_active'] + T['solo_active'] + T['sub_active']
    bT = T['proj_blocked'] + T['solo_blocked'] + T['sub_blocked']
    stat = ('%d 工作区 / %d 项目 / %d 独立任务 / %d 子项 / waiting %d / active %d / blocked %d'
            % (len(ws_data), pjT, soT, sbT, wT, aT, bT))
    if args.dry:
        print('[dry] %s' % stat)
    else:
        io.open(out_path, 'w', encoding='utf-8').write(page)
        print('board 已生成: %s ｜ %s' % (out_path, stat))
    return 0


if __name__ == '__main__':
    sys.exit(main())
