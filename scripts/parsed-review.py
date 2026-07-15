#!/usr/bin/env python3
"""
parsed-review.py — 启动 Parsed 复核工具
========================================

在本地启动 HTTP 服务器，打开浏览器加载复核 HTML，
将 raw 文件和 parsed 文件路径自动注入到页面。

用法：
  python scripts/parsed-review.py <parsed.json> <raw.pdf>
  python scripts/parsed-review.py <parsed.json>                       # raw 路径从 parsed.source_raw 读取

依赖：
  Python 3.8+（标准库，无外部依赖）
"""

import http.server
import json
import os
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import quote


# =============================================================================
# 查找项目中的 review.html
# =============================================================================

def find_review_html() -> Path:
    """从调用位置向上查找 parsed-review.html"""
    script_dir = Path(__file__).resolve().parent
    candidates = [
        script_dir.parent / "skills" / "document-parsing" / "references" / "parsed-review.html",
        Path.cwd() / "skills" / "document-parsing" / "references" / "parsed-review.html",
    ]
    for path in candidates:
        if path.exists():
            return path.resolve()
    print("错误: 未找到 parsed-review.html", file=sys.stderr)
    print(f"  查找位置: {candidates[0]}", file=sys.stderr)
    sys.exit(1)


# =============================================================================
# 启动 HTTP 服务器
# =============================================================================

def start_server(serve_dir: Path, port: int = 0) -> tuple:
    """在指定目录启动 HTTP 服务器，返回 (server, actual_port)"""
    handler = http.server.SimpleHTTPRequestHandler

    class SilentHandler(handler):
        def log_message(self, format, *args):
            pass  # 不打印访问日志

    for attempt in range(10):
        try:
            srv = socketserver.TCPServer(("127.0.0.1", port if port > 0 else 0), SilentHandler)
            actual_port = srv.server_address[1]
            return srv, actual_port
        except OSError:
            if port > 0:
                port = 0  # 端口被占用，让系统分配
            continue
    print("错误: 无法绑定端口", file=sys.stderr)
    sys.exit(1)


# =============================================================================
# 主流程
# =============================================================================

def main():
    if len(sys.argv) < 2:
        print("用法: python scripts/parsed-review.py <parsed.json> [raw.pdf]")
        sys.exit(1)

    # 解析参数
    parsed_path = Path(sys.argv[1]).resolve()
    if not parsed_path.exists():
        print(f"错误: parsed 文件不存在: {parsed_path}", file=sys.stderr)
        sys.exit(1)

    # 读取 parsed 文件获取 raw 路径
    with open(parsed_path, "r", encoding="utf-8") as f:
        parsed_data = json.load(f)

    if len(sys.argv) >= 3:
        raw_path = Path(sys.argv[2]).resolve()
    else:
        raw_source = parsed_data.get("source_raw", "")
        if raw_source:
            raw_path = Path(raw_source).resolve()
        else:
            print("错误: 未指定 raw 文件，且 parsed 中无 source_raw", file=sys.stderr)
            sys.exit(1)

    if not raw_path.exists():
        print(f"错误: raw 文件不存在: {raw_path}", file=sys.stderr)
        sys.exit(1)

    # 找到 review.html
    review_html = find_review_html()

    # 确定服务根目录：优先用 parsed 所在目录（输出目录）
    serve_dir = parsed_path.parent
    # 确保 raw 文件也能被访问（同盘）
    if raw_path.drive == parsed_path.drive:
        # 尝试找共同祖先
        try:
            common = Path(os.path.commonpath([str(raw_path), str(parsed_path)]))
            if common.exists():
                serve_dir = common
        except ValueError:
            pass  # 不同盘，用 parsed 目录
    # 如果 raw 和 parsed 不同盘，复制 raw 到 parsed 所在目录
    if raw_path.drive != parsed_path.drive:
        import shutil
        dest = parsed_path.parent / raw_path.name
        if not dest.exists():
            print(f"  [复制] Raw 与 Parsed 不同盘，复制文件到 {dest}", file=sys.stderr)
            shutil.copy2(str(raw_path), str(dest))
        raw_path = dest
        print(f"  [注意] Raw 已复制到 {dest}", file=sys.stderr)

    # 启动 HTTP 服务器
    srv, port = start_server(serve_dir)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()

    # 构造 URL (含 raw + parsed + original OCR 响应)
    raw_rel = raw_path.relative_to(serve_dir)
    parsed_rel = parsed_path.relative_to(serve_dir)
    html_rel = review_html.relative_to(serve_dir)

    # 查找 companion original 文件: 与 parsed 同名但 .original.json 后缀
    original_path = parsed_path.with_suffix('.original.json')
    original_param = ""
    if original_path.exists():
        orig_rel = original_path.relative_to(serve_dir)
        original_param = f"&original={quote(orig_rel.as_posix())}"

    url = (
        f"http://127.0.0.1:{port}/{html_rel.as_posix()}"
        f"?raw={quote(raw_rel.as_posix())}"
        f"&parsed={quote(parsed_rel.as_posix())}"
        f"{original_param}"
    )

    print(f"\n{'='*60}")
    print(f"  📄 Parsed 复核工具已启动")
    print(f"  {'='*60}")
    print(f"  Raw:    {raw_path.name}")
    print(f"  Parsed: {parsed_path.name}")
    print(f"  Status: {parsed_data.get('parsed_status', 'unknown')}")
    print(f"  {'='*60}")
    print(f"  🔗 点击打开: {url}")
    print(f"  {'='*60}")
    print(f"  按 Ctrl+C 关闭服务器\n")

    # 自动打开浏览器
    webbrowser.open(url)

    try:
        # 保持运行直到用户 Ctrl+C
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\n关闭服务器...")
        srv.shutdown()


if __name__ == "__main__":
    main()