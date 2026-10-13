# -*- coding: utf-8 -*-
"""台账健康检查 + 计数：状态计数、字段校验、状态合法性、必填三项、children 一致性、
孤儿子项、ID 缺口、看板 TASKS.md 总览计数与卡片一致性。

用法:  python audit_tasks.py <工作区路径> [--tasks-dirname NAME] [--config FILE]
       --tasks-dirname  台账目录名，默认读 config.tasks_dirname，再默认 .taskboard
退出码: 0=无问题  1=无 tasks/ 目录  2=发现问题
"""
import os, io, re, sys, json, collections, argparse, datetime

FIVE = ('active', 'waiting', 'blocked', 'done', 'dropped')

def load_json(path):
    try:
        return json.loads(io.open(path, encoding='utf-8').read())
    except Exception:
        return {}

def parse_card(path):
    s = io.open(path, encoding='utf-8').read()
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)$', s, re.S)
    if not m:
        return None, s
    fm, body = {}, m.group(2)
    for line in m.group(1).splitlines():
        kv = re.match(r'^(\w+):\s*(.*)$', line)
        if kv:
            fm[kv.group(1)] = kv.group(2).strip()
    return fm, body

def board_counts(tasks_md):
    """从 TASKS.md 总览表解析 (waiting/active/blocked/合计) 四行的 (项目,独立任务,子项,合计)。
    返回 dict；无该表返回 None。"""
    if not os.path.exists(tasks_md):
        return None
    s = io.open(tasks_md, encoding='utf-8').read()
    out = {}
    for line in s.splitlines():
        m = re.match(
            r'^\|\s*`?(waiting|active|blocked)`?\s*[^|]*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|',
            line)
        if m:
            out[m.group(1)] = tuple(int(x) for x in m.groups()[1:])
            continue
        m = re.match(
            r'^\|\s*\*\*合计未完成\*\*\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|\s*\**\s*(\d+)\s*\**\s*\|',
            line)
        if m:
            out['total'] = tuple(int(x) for x in m.groups())
    return out if ('total' in out and len(out) >= 3) else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root', nargs='?', default=os.getcwd())
    ap.add_argument('--tasks-dirname')
    ap.add_argument('--config')
    args = ap.parse_args()

    cfg = load_json(args.config) if args.config and os.path.exists(args.config) else {}
    tasks_dirname = args.tasks_dirname or cfg.get('tasks_dirname') or '.taskboard'

    root = args.root
    d = os.path.join(root, tasks_dirname, 'tasks')
    if not os.path.isdir(d):
        print('无 tasks/ 目录:', d); return 1
    issues, cards, warn_mtime = [], {}, []
    for f in sorted(os.listdir(d)):
        if not f.endswith('.md'):
            continue
        fpath = os.path.join(d, f)
        fm, body = parse_card(fpath)
        if fm is None:
            issues.append('%s: 缺 frontmatter' % f); continue
        cid = fm.get('id', '?')
        cards[cid] = (f, fm, body)
        for k in ('id', 'title', 'status', 'priority'):
            if not fm.get(k):
                issues.append('%s: frontmatter 缺 %s' % (f, k))
        st = fm.get('status', '')
        if st and st not in FIVE:
            issues.append('%s: status="%s" 非法（只允许 %s）' % (f, st, '/'.join(FIVE)))
        gran = fm.get('granularity', 'std') or 'std'
        if gran not in ('std', 'mini'):
            issues.append('%s: granularity="%s" 非法（只允许 std/mini）' % (f, gran))
        req = (('目标', r'\*\*目标\*\*'),) if gran == 'mini' else (
            ('目标', r'\*\*目标\*\*'), ('范围', r'\*\*范围'), ('验收标准', r'\*\*验收标准\*\*'))
        for label, pat in req:
            if not re.search(pat, body):
                issues.append('%s: 正文缺「%s」' % (f, label))
        upd_v = fm.get('updated', '')
        if upd_v and st not in ('done', 'dropped'):
            try:
                lag = (datetime.date.fromtimestamp(os.path.getmtime(fpath))
                       - datetime.date.fromisoformat(upd_v)).days
                if lag > 3:
                    warn_mtime.append('%s: updated=%s 落后文件修改 %d 天（卡动过但没改 updated）'
                                      % (f, upd_v, lag))
            except ValueError:
                pass
    for cid, (f, fm, body) in cards.items():
        if cid.startswith('P-'):
            ch = fm.get('children', '')
            kids = []
            m = re.match(r'^\[(.*?)\]$', ch)
            if m and m.group(1).strip():
                kids = sorted(x.strip().strip('"').strip("'") for x in m.group(1).split(','))
            actual = sorted(c for c in cards if c.startswith('T-') and cards[c][1].get('project') == cid)
            if kids != actual:
                issues.append('%s: children=%s 与实际子项=%s 不一致' % (cid, kids, actual))
            for k in kids:
                if k not in cards:
                    issues.append('%s: children 引用了不存在的 %s' % (cid, k))
        if cid.startswith('T-'):
            pj = fm.get('project', '')
            if pj and pj != '-' and pj not in cards:
                issues.append('%s: 孤儿子项，project=%s 不存在' % (f, pj))
    # ── 定义来源（提示级，不计入 issues）：非 user 且未 confirmed 的未完成卡 ──
    undef = []
    for cid, (f, fm, body) in cards.items():
        if fm.get('status') in ('done', 'dropped'):
            continue
        if fm.get('def_source', '') != 'user' and not fm.get('def_confirmed', ''):
            undef.append(cid)

    gaps = []
    for prefix, width, start in (('P-', 1, 1), ('T-', 3, 1)):
        nums = sorted(int(c.split('-')[1]) for c in cards
                      if c.startswith(prefix) and c.split('-')[1].isdigit())
        if nums:
            missing = [n for n in range(start, nums[-1] + 1) if n not in nums]
            if missing:
                gaps.append('%s: %s（done/dropped 占号属正常）' % (
                    prefix, ['%s%s' % (prefix, str(g).zfill(width)) for g in missing]))

    # ── 计数（未完成口径：不计 done / dropped）──
    cnt = collections.Counter()
    for cid, (f, fm, body) in cards.items():
        st = fm.get('status', '?')
        if st in ('done', 'dropped'):
            continue
        kind = 'P' if cid.startswith('P-') else 'T'
        solo = (kind == 'T' and fm.get('project', '-') in ('', '-'))
        cnt[('proj' if kind == 'P' else 'solo' if solo else 'sub', st)] += 1
    def g(k, s): return cnt[(k, s)]
    rows = {}
    for st in ('waiting', 'active', 'blocked'):
        rows[st] = (g('proj', st), g('solo', st), g('sub', st),
                    g('proj', st) + g('solo', st) + g('sub', st))
    tot = tuple(sum(rows[st][i] for st in rows) for i in range(4))

    # ── 看板 TASKS.md 总览计数核对 ──
    bc = board_counts(os.path.join(root, tasks_dirname, 'TASKS.md'))
    if bc is not None:
        for st in ('waiting', 'active', 'blocked'):
            if st in bc and bc[st] != rows[st]:
                issues.append('看板总览「%s」行 = %s，与卡片实际 = %s 不一致（须同步看板）'
                              % (st, bc[st], rows[st]))
        if bc['total'] != tot:
            issues.append('看板总览「合计未完成」行 = %s，与卡片实际 = %s 不一致（须同步看板）'
                          % (bc['total'], tot))

    print('── %s ──' % root)
    print('卡片 %d 张（项目 %d / 独立任务 %d / 子项 %d / done %d / dropped %d）' % (
        len(cards),
        sum(1 for c in cards if c.startswith('P-')),
        sum(1 for c, (f, fm, b) in cards.items() if c.startswith('T-') and fm.get('project', '-') in ('', '-')),
        sum(1 for c, (f, fm, b) in cards.items() if c.startswith('T-') and fm.get('project', '-') not in ('', '-')),
        sum(1 for c, (f, fm, b) in cards.items() if fm.get('status') == 'done'),
        sum(1 for c, (f, fm, b) in cards.items() if fm.get('status') == 'dropped')))
    print('未完成计数：waiting %d（项目%d+独立%d+子项%d）｜active %d（%d+%d+%d）｜blocked %d（%d+%d+%d）｜合计 %d'
          % (rows['waiting'][3], *rows['waiting'][:3],
             rows['active'][3], *rows['active'][:3],
             rows['blocked'][3], *rows['blocked'][:3], tot[3]))
    if bc is None:
        print('  提示: 看板 TASKS.md 无总览表或格式不可识别，跳过计数核对')
    else:
        print('  看板总览计数: %s' % ('一致' if not any('看板总览' in i for i in issues) else '不一致（见下）'))
    print('发现问题 %d 条' % len(issues))
    for i in issues:
        print('  -', i)
    for gp in gaps:
        print('  提示: ID 缺口', gp)
    if undef:
        print('  提示: 定义未经用户确认 %d 张：%s（批量确认后把 def_source 改为 user 并写 def_confirmed）'
              % (len(undef), ', '.join(undef)))
    for w in warn_mtime:
        print('  提示:', w)
    return 0 if not issues else 2

if __name__ == '__main__':
    sys.exit(main())
