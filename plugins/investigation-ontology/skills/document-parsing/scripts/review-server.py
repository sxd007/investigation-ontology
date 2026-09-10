#!/usr/bin/env python3
"""
review-server.py — Parsed 复核工具的轻量 HTTP 服务器

功能：
  1. 静态文件服务：serve 案例目录（raw/, raw/parsed/, raw/ocr_output/）
     + 模板目录（parsed-review.html）
  2. POST /save：保存人工修正到新版本 parsed JSON
  3. POST /reparse：写 .reparse 触发文件，AI 轮询检测后执行重解析
  4. POST /shutdown：关闭服务器
  5. GET /api/versions：列出某 raw 的所有 parsed 版本

用法：
  python review-server.py --port 8899 --root <case-dir> --template <template-dir>

  --port      HTTP 端口（默认 8899，被占用自动递增）
  --root      案件根目录（serve raw/ raw/parsed/ raw/ocr_output/）
  --template  模板目录路径（serve parsed-review.html）
"""

import argparse
import json
import os
import re
import socket
import sys
import threading
import time
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Windows 控制台 UTF-8 输出
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def find_free_port(start=8899, max_tries=20):
    """找到可用端口"""
    for port in range(start, start + max_tries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    return None


def kill_existing_on_port(port):
    """杀掉占用指定端口的旧进程（仅 Windows）"""
    if sys.platform != "win32":
        return
    try:
        result = os.popen(f'netstat -ano | findstr ":{port}.*LISTENING"').read()
        pids = set()
        for line in result.strip().splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[-1].isdigit():
                pids.add(int(parts[-1]))
        for pid in pids:
            if pid != os.getpid():
                try:
                    os.system(f'taskkill /F /PID {pid} >nul 2>&1')
                    print(f"已清理旧进程 PID={pid}（端口 {port}）", file=sys.stderr)
                except Exception:
                    pass
    except Exception:
        pass


class ReviewHandler(SimpleHTTPRequestHandler):
    """处理静态文件 + API 端点"""

    # 由 server 注入
    root_dir = "."
    template_dir = "."

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=self.root_dir, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API 端点
        if path == "/api/versions":
            return self._handle_versions(parsed.query)
        if path == "/api/health":
            return self._json_response({"status": "ok"})

        # 模板文件特殊处理
        if path == "/" or path == "/parsed-review.html":
            template_path = Path(self.template_dir) / "parsed-review.html"
            if template_path.exists():
                self._serve_file(template_path, "text/html; charset=utf-8")
                return
            self._json_response({"error": "template not found"}, 404)
            return

        # 其他静态文件（从 root_dir serve）
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/save":
            return self._handle_save()
        if path == "/save-ocr":
            return self._handle_save_ocr()
        if path == "/reparse":
            return self._handle_reparse()
        if path == "/shutdown":
            return self._handle_shutdown()

        self._json_response({"error": "unknown endpoint"}, 404)

    def _handle_save_ocr(self):
        """保存修改后的 OCR output 到新版本"""
        try:
            body = self._read_body()
            data = json.loads(body)
        except Exception as e:
            return self._json_response({"error": f"invalid request: {e}"}, 400)

        ocr_file = data.get("ocr_file", "")
        content = data.get("content", "")

        if not ocr_file:
            return self._json_response({"error": "ocr_file required"}, 400)

        ocr_path = Path(self.root_dir) / ocr_file
        if not ocr_path.exists():
            return self._json_response({"error": f"ocr file not found: {ocr_file}"}, 404)

        try:
            with open(ocr_path, "r", encoding="utf-8") as f:
                current_ocr = json.load(f)
        except Exception as e:
            return self._json_response({"error": f"failed to read ocr: {e}"}, 500)

        # 解析版本号
        ocr_id = current_ocr.get("ocr_id", "")
        m = re.search(r"-v(\d+)$", ocr_id)
        if not m:
            new_version = 1
            new_ocr_id = ocr_id + "-v1" if ocr_id else "OCR-v1"
        else:
            current_version = int(m.group(1))
            new_version = current_version + 1
            new_ocr_id = ocr_id.replace(f"-v{current_version}", f"-v{new_version}")

        # 构造新版本
        new_ocr = json.loads(json.dumps(current_ocr))
        new_ocr["ocr_id"] = new_ocr_id
        new_ocr["content"] = content
        new_ocr["ocr_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        new_ocr["supersedes"] = ocr_id
        new_ocr["superseded_by"] = None

        # 写入新版本文件
        new_filename = ocr_path.name.replace(f"_v{m.group(1) if m else '1'}.json", f"_v{new_version}.json")
        new_path = ocr_path.parent / new_filename

        with open(new_path, "w", encoding="utf-8") as f:
            json.dump(new_ocr, f, ensure_ascii=False, indent=2)

        # 更新旧版本
        current_ocr["superseded_by"] = new_ocr_id
        with open(ocr_path, "w", encoding="utf-8") as f:
            json.dump(current_ocr, f, ensure_ascii=False, indent=2)

        rel_path = str(new_path.relative_to(self.root_dir)).replace("\\", "/")
        return self._json_response({
            "success": True,
            "new_version": new_version,
            "file": rel_path,
            "ocr_id": new_ocr_id,
            "message": f"OCR Output 已保存为 v{new_version}",
        })

    def _handle_save(self):
        """保存人工修正到新版本 parsed JSON"""
        try:
            body = self._read_body()
            data = json.loads(body)
        except Exception as e:
            return self._json_response({"error": f"invalid request: {e}"}, 400)

        parsed_file = data.get("parsed_file", "")
        corrections = data.get("corrections", {})
        reviewer = data.get("reviewer", "unknown")

        if not parsed_file:
            return self._json_response({"error": "parsed_file required"}, 400)

        # 读取当前 parsed 文件
        parsed_path = Path(self.root_dir) / parsed_file
        if not parsed_path.exists():
            return self._json_response({"error": f"parsed file not found: {parsed_file}"}, 404)

        try:
            with open(parsed_path, "r", encoding="utf-8") as f:
                current_parsed = json.load(f)
        except Exception as e:
            return self._json_response({"error": f"failed to read parsed: {e}"}, 500)

        # 解析版本号
        parsed_id = current_parsed.get("parsed_id", "")
        m = re.search(r"-v(\d+)$", parsed_id)
        if not m:
            return self._json_response({"error": "cannot parse version from parsed_id"}, 500)
        current_version = int(m.group(1))
        new_version = current_version + 1

        # 构造新版本 parsed JSON
        new_parsed = json.loads(json.dumps(current_parsed))  # deep copy
        new_parsed["parsed_id"] = parsed_id.replace(f"-v{current_version}", f"-v{new_version}")
        new_parsed["parsed_by"] = "human_review"
        new_parsed["parsed_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        new_parsed["supersedes"] = parsed_id
        new_parsed["superseded_by"] = None

        # 应用字段修正
        correction_records = []
        for field_corr in corrections.get("fields", []):
            field_name = field_corr.get("field")
            original_value = field_corr.get("original_value")
            corrected_value = field_corr.get("corrected_value")

            if field_name and field_name in new_parsed.get("fields", {}):
                field_data = new_parsed["fields"][field_name]
                if not field_data.get("human_corrected"):
                    field_data.setdefault("_original_value", field_data.get("value"))
                field_data["value"] = corrected_value
                field_data["human_corrected"] = True
                field_data["confidence"] = 1.0

                correction_records.append({
                    "field": field_name,
                    "original_value": original_value,
                    "corrected_value": corrected_value,
                    "reason": field_corr.get("reason", "manual correction in review tool"),
                    "corrected_by": reviewer,
                    "corrected_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                })

        # 应用表格修正
        for table_corr in corrections.get("tables", []):
            table_index = table_corr.get("table_index", 0)
            if "tables" in new_parsed and table_index < len(new_parsed["tables"]):
                old_table = new_parsed["tables"][table_index]
                correction_records.append({
                    "field": f"table[{table_index}]",
                    "original_value": json.dumps({
                        "headers": old_table.get("headers", []),
                        "rows": old_table.get("rows", []),
                    }, ensure_ascii=False),
                    "corrected_value": json.dumps({
                        "headers": table_corr.get("headers", []),
                        "rows": table_corr.get("rows", []),
                    }, ensure_ascii=False),
                    "reason": "table correction in review tool",
                    "corrected_by": reviewer,
                    "corrected_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                })
                new_parsed["tables"][table_index]["headers"] = table_corr.get("headers", [])
                new_parsed["tables"][table_index]["rows"] = table_corr.get("rows", [])
                new_parsed["tables"][table_index]["row_count"] = len(table_corr.get("rows", []))

        # 写入 human_review 记录
        new_parsed["human_review"] = {
            "reviewed_by": reviewer,
            "reviewed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "overall_status": "partially_corrected" if correction_records else "confirmed",
            "corrections": correction_records,
        }

        # 更新 parsed_status
        if new_parsed.get("parsed_status") == "human_review_required":
            new_parsed["parsed_status"] = "full"

        # 写入新版本文件
        new_filename = parsed_path.name.replace(f"_v{current_version}.json", f"_v{new_version}.json")
        new_path = parsed_path.parent / new_filename

        with open(new_path, "w", encoding="utf-8") as f:
            json.dump(new_parsed, f, ensure_ascii=False, indent=2)

        # 更新旧版本的 superseded_by
        current_parsed["superseded_by"] = new_parsed["parsed_id"]
        with open(parsed_path, "w", encoding="utf-8") as f:
            json.dump(current_parsed, f, ensure_ascii=False, indent=2)

        # 返回结果（相对路径）
        rel_path = str(new_path.relative_to(self.root_dir)).replace("\\", "/")
        return self._json_response({
            "success": True,
            "new_version": new_version,
            "file": rel_path,
            "parsed_id": new_parsed["parsed_id"],
            "corrections_count": len(correction_records),
            "message": f"已保存人工修正版本 v{new_version}",
        })

    def _handle_reparse(self):
        """写入 .reparse 触发文件"""
        try:
            body = self._read_body()
            data = json.loads(body)
        except Exception as e:
            return self._json_response({"error": f"invalid request: {e}"}, 400)

        ocr_file = data.get("ocr_file", "")
        raw_file = data.get("raw_file", "")
        parsed_id = data.get("parsed_id", "")

        if not ocr_file:
            return self._json_response({"error": "ocr_file required"}, 400)

        # 写入触发文件
        ocr_path = Path(self.root_dir) / ocr_file
        trigger_path = ocr_path.with_suffix(".reparse")

        trigger_data = {
            "ocr_file": ocr_file,
            "raw_file": raw_file,
            "parsed_id": parsed_id,
            "triggered_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "triggered_by": "review-server",
        }

        with open(trigger_path, "w", encoding="utf-8") as f:
            json.dump(trigger_data, f, ensure_ascii=False, indent=2)

        return self._json_response({
            "success": True,
            "message": "重解析请求已提交，AI 将从修正后的 OCR Output 重新解析",
            "trigger_file": str(trigger_path.relative_to(self.root_dir)).replace("\\", "/"),
        })

    def _handle_shutdown(self):
        """关闭服务器"""
        self._json_response({"success": True, "message": "服务器关闭中..."})

        def delayed_shutdown():
            time.sleep(0.5)
            os._exit(0)

        threading.Thread(target=delayed_shutdown, daemon=True).start()

    def _handle_versions(self, query_string):
        """列出某 raw 的所有 parsed 版本"""
        qs = parse_qs(query_string)
        raw_id = qs.get("raw_id", [None])[0]
        if not raw_id:
            return self._json_response({"error": "raw_id required"}, 400)

        parsed_dir = Path(self.root_dir) / "raw" / "parsed"
        ocr_dir = Path(self.root_dir) / "raw" / "ocr_output"

        # 查找 parsed 版本
        parsed_versions = []
        if parsed_dir.exists():
            pattern = re.compile(rf"(\w+)-{re.escape(raw_id)}_v(\d+)\.json$")
            for f in sorted(parsed_dir.iterdir()):
                m = pattern.match(f.name)
                if m:
                    try:
                        with open(f, "r", encoding="utf-8") as fh:
                            p = json.load(fh)
                        parsed_versions.append({
                            "file": f"raw/parsed/{f.name}",
                            "parsed_id": p.get("parsed_id", ""),
                            "status": p.get("parsed_status", ""),
                            "superseded_by": p.get("superseded_by"),
                            "parsed_by": p.get("parsed_by", ""),
                        })
                    except Exception:
                        pass

        # 查找 ocr_output 版本
        ocr_versions = []
        if ocr_dir.exists():
            pattern = re.compile(rf"{re.escape(raw_id)}_ocr_v(\d+)\.json$")
            for f in sorted(ocr_dir.iterdir()):
                if pattern.match(f.name):
                    ocr_versions.append(f"raw/ocr_output/{f.name}")

        return self._json_response({
            "raw_id": raw_id,
            "ocr_versions": ocr_versions,
            "parsed_versions": parsed_versions,
        })

    def _read_body(self):
        content_length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(content_length).decode("utf-8")

    def _json_response(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, path, content_type):
        try:
            with open(path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", len(content))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self._json_response({"error": str(e)}, 500)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        # 简化日志
        sys.stderr.write(f"[review-server] {args[0]}\n")


def main():
    parser = argparse.ArgumentParser(description="Parsed 复核工具 HTTP 服务器")
    parser.add_argument("--port", type=int, default=8899, help="HTTP 端口（默认 8899）")
    parser.add_argument("--root", required=True, help="案件根目录")
    parser.add_argument("--template", required=True, help="模板目录路径")
    args = parser.parse_args()

    root = os.path.abspath(args.root)
    template = os.path.abspath(args.template)

    # 注入路径
    ReviewHandler.root_dir = root
    ReviewHandler.template_dir = template

    # 清理可能的僵尸进程，然后绑定端口
    kill_existing_on_port(args.port)
    port = args.port
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", port))
    except OSError:
        # 端口仍被占用，自动递增
        port = find_free_port(args.port + 1)
        if port is None:
            print(f"错误: 端口 {args.port}-{args.port + 19} 均被占用", file=sys.stderr)
            sys.exit(1)
        print(f"端口 {args.port} 被占用，使用 {port}", file=sys.stderr)

    # 输出端口供 AI 读取
    print(f"REVIEW_SERVER_PORT={port}")
    print(f"Root: {root}")
    print(f"Template: {template}")
    print(f"URL: http://localhost:{port}/parsed-review.html")
    print(f"按 Ctrl+C 停止服务器")
    sys.stdout.flush()

    server = HTTPServer(("127.0.0.1", port), ReviewHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        server.shutdown()


if __name__ == "__main__":
    main()
