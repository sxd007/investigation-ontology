"""检查仓库内文本文件是否带 UTF-8 BOM。

BOM 会破坏 YAML frontmatter 解析（SKILL.md / commands/*.md 的 name/description 丢失），
常见来源是 PowerShell 5.1 的 Out-File / Set-Content 默认写带 BOM 的 UTF-8。

用法：
    python scripts/check-no-bom.py            # 检查，发现 BOM 退出码 1
    python scripts/check-no-bom.py --fix      # 就地剥离 BOM
"""

import os
import sys

BOM = b"\xef\xbb\xbf"
# 需要检查的文本扩展名
TEXT_EXTS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
    ".py", ".js", ".mjs", ".cjs", ".ts", ".ps1", ".sh",
    ".html", ".css", ".svg", ".csv",
}
SKIP_DIRS = {".git", "node_modules", "__pycache__"}


def find_bom_files(root: str) -> list[str]:
    hits = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in TEXT_EXTS:
                continue
            path = os.path.join(dirpath, name)
            try:
                with open(path, "rb") as fh:
                    if fh.read(3) == BOM:
                        hits.append(path)
            except OSError:
                pass
    return hits


def main() -> int:
    fix = "--fix" in sys.argv
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    hits = find_bom_files(root)
    if not hits:
        print("OK: 未发现带 BOM 的文本文件")
        return 0
    for path in hits:
        print("BOM:", os.path.relpath(path, root))
        if fix:
            with open(path, "rb") as fh:
                data = fh.read()
            with open(path, "wb") as fh:
                fh.write(data[3:])
    if fix:
        print(f"已剥离 {len(hits)} 个文件的 BOM")
        return 0
    print(f"共 {len(hits)} 个文件带 BOM；运行 --fix 可剥离")
    return 1


if __name__ == "__main__":
    sys.exit(main())
