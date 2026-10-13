# -*- coding: utf-8 -*-
r"""发现所有工作区（多 runtime 自适应）。

用法:  python discover_ws.py [--runtime NAME] [--home DIR] [--config FILE]
                              [--tasks-dirname NAME]

权威来源：各 agent runtime 会话目录下 *.jsonl 记录里的 cwd 字段。
  - claude：~/.claude/projects/*/*.jsonl 首条含 "cwd" 的记录
  - codex：~/.codex/sessions/**/rollout-*.jsonl 的 session_meta（payload.cwd）
  - codebuddy / workbuddy：按同构约定候选（~/.<rt>/projects），目录不存在即跳过
  - 其他 runtime（含私有/定制 agent）：在 config.json 里配
    "discover": {"session_roots": ["~/.your-agent/projects"]}，脚本优先使用该列表

runtime 解析：config.discover.session_roots > --runtime > config.runtime > auto
（扫描所有存在的已知根目录）。识别不了 / 无候选目录 → 打印提示并退出 2：
登记表改由手工策展，不报错。

输出:  状态  路径  [台账:有]  [<时间戳>/<已删除> 标签]
过滤:  时间戳目录与已删除路径**打标签显示、不排除**（让你看到有什么再决定）；
       本脚本只做"发现"，纳入与否由登记表策展。
"""
import os, io, re, sys, json, glob, argparse

RUNTIMES = {
    'claude': ['~/.claude/projects'],
    'codex': ['~/.codex/sessions'],
    'codebuddy': ['~/.codebuddy/projects'],
    'workbuddy': ['~/.workbuddy/projects'],
}

TS_DIR = re.compile(r'^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$')


def load_json(path):
    try:
        return json.loads(io.open(path, encoding='utf-8').read())
    except Exception:
        return {}


def extract_cwd(jsonl_path):
    """从 jsonl 文件中找第一条 cwd 记录（兼容顶层 cwd 与 payload.cwd）。"""
    try:
        with io.open(jsonl_path, encoding='utf-8', errors='ignore') as fh:
            for line in fh:
                if '"cwd"' not in line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                cwd = obj.get('cwd') or (obj.get('payload') or {}).get('cwd')
                if cwd:
                    return cwd
    except Exception:
        pass
    return None


def scan_roots(roots, tasks_dirname, seen):
    """扫一组会话根目录，产出工作区行；返回行数。"""
    n = 0
    for root in roots:
        root = os.path.expanduser(root)
        if not os.path.isdir(root):
            print('  （跳过不存在的目录: %s）' % root)
            continue
        files = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames.sort()
            for fn in sorted(filenames):
                if fn.endswith('.jsonl'):
                    files.append(os.path.join(dirpath, fn))
        files.sort()
        for f in files:
            cwd = extract_cwd(f)
            if not cwd or cwd in seen:
                continue
            seen.add(cwd)
            base = os.path.basename(cwd.rstrip('/\\'))
            ex = os.path.isdir(cwd)
            tb = os.path.exists(os.path.join(cwd, tasks_dirname, 'TASKS.md'))
            tags = []
            if not ex:
                tags.append('已删除')
            if TS_DIR.match(base):
                tags.append('时间戳')
            out = '%s  %s%s' % ('存在  ' if ex else '已删除', cwd, '   台账:有' if tb else '')
            if tags:
                out += '   <%s>' % '/'.join(tags)
            print(out)
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runtime')
    ap.add_argument('--home')
    ap.add_argument('--config')
    ap.add_argument('--tasks-dirname')
    args = ap.parse_args()

    home = args.home or os.path.expanduser('~/.task-board')
    cfg_path = args.config or os.path.join(home, 'config.json')
    cfg = load_json(cfg_path) if os.path.exists(cfg_path) else {}
    runtime = args.runtime or cfg.get('runtime') or 'auto'
    tasks_dirname = args.tasks_dirname or cfg.get('tasks_dirname') or '.taskboard'
    custom_roots = (cfg.get('discover') or {}).get('session_roots') or []

    seen = set()
    total = 0
    if custom_roots:
        print('使用 config.discover.session_roots（%d 个根目录）' % len(custom_roots))
        total = scan_roots(custom_roots, tasks_dirname, seen)
    elif runtime == 'auto':
        print('runtime=auto：扫描所有存在的已知会话根目录')
        for name, roots in sorted(RUNTIMES.items()):
            existing = [r for r in roots if os.path.isdir(os.path.expanduser(r))]
            if not existing:
                continue
            print('── runtime: %s ──' % name)
            total += scan_roots(existing, tasks_dirname, seen)
    elif runtime in RUNTIMES:
        print('runtime=%s' % runtime)
        total = scan_roots(RUNTIMES[runtime], tasks_dirname, seen)
    else:
        print('未知 runtime: %s（已知: %s）' % (runtime, ', '.join(sorted(RUNTIMES))))
        print('→ 跳过自动发现，登记表请手工策展。')
        return 2

    if total == 0:
        print('未发现任何工作区会话记录。若确认 runtime 无误，登记表请手工策展。')
        return 2
    print('──')
    print('共发现 %d 个工作区（含已删除/时间戳标签项）。纳入与否请到登记表策展。' % total)
    return 0


if __name__ == '__main__':
    sys.exit(main())
