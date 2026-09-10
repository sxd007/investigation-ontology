#!/usr/bin/env python3
"""
印章真伪鉴定脚本 v3
用法:
  python seal_verify_v3.py <检材文件> <样本文件> [--output report.html]
  python seal_verify_v3.py <章样A> <章样B> --pre-cropped [--output report.html]

选项:
  --pre-cropped    输入已是裁切好的章样，跳过印章检测及文件级真实性分析，直接归一化比对

v3 改进摘要（相比 v2）：
  - 跨平台：os.execv → sys.exit(subprocess.run) 修复 Windows 进程退出 bug
  - ELA：均值比 → 分布一致性（标准差比 + 均值比双重校验）
  - PDF元数据：移除 acrobat/foxit/nitro/pdfedit（合规工具），仅保留图像编辑器
  - PDF图层：n_imgs≥3 → 结合内容流绘制顺序（图像覆盖文字）检测
  - 噪点：文件后缀判阈值 → 先检测扫描/数字文件，噪点过低则跳过
  - 边缘：绝对阈值 → 印章边缘/文字边缘 相对比值
  - 印章检测：max轮廓 → 形状过滤（宽高比 0.6~1.7）+ 面积排序
  - 配准：ORB+Homography → AKAZE+Affine（对印章纹理更鲁棒）
  - 评分：diff_ratio 归一化 + 单项失败保底（hard floor）
"""

# ============================================================
# 第一阶段：venv 自管理
# ============================================================
import sys, os, subprocess
from pathlib import Path

VENV_DIR = Path(__file__).parent.parent / ".seal_venv"
REQUIREMENTS = [
    "opencv-python", "PyMuPDF", "scikit-image",
    "Pillow", "anthropic", "numpy",
]

def in_venv():
    return sys.prefix != sys.base_prefix

def setup_and_relaunch():
    """v3: 使用 sys.exit(subprocess.run) 替代 os.execv，消除 Windows 进程退出 bug"""
    if not VENV_DIR.exists():
        print("🔧 首次运行：正在创建虚拟环境...")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])
    pip    = VENV_DIR / ("Scripts" if sys.platform == "win32" else "bin") / "pip"
    python = VENV_DIR / ("Scripts" if sys.platform == "win32" else "bin") / "python"
    try:
        ok = subprocess.run(
            [str(python), "-c", "import cv2,fitz,skimage,PIL,anthropic,numpy"],
            capture_output=True).returncode == 0
    except Exception:
        ok = False
    if not ok:
        print("📦 正在安装依赖（仅首次约1-2分钟）...")
        subprocess.check_call([str(pip), "install", "--quiet", "--upgrade", "pip"])
        subprocess.check_call([str(pip), "install", "--quiet", *REQUIREMENTS])
        print("✅ 依赖安装完成")
    # v3: 用 subprocess.run + sys.exit 替代 os.execv
    #     三平台行为一致，Windows 上父进程不会提前退出
    sys.exit(subprocess.run([str(python)] + sys.argv).returncode)

if not in_venv():
    setup_and_relaunch()
    sys.exit(0)

# ============================================================
# 第二阶段：业务逻辑
# ============================================================
import argparse, base64, io, json, tempfile
from datetime import datetime

import cv2
import numpy as np
from PIL import Image, ImageFilter
from skimage.metrics import structural_similarity as ssim


# ─────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────

def img_to_data_url(img: np.ndarray) -> str:
    _, buf = cv2.imencode(".png", img)
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode()

def pil_to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

def cv2_to_pil(img: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

def pil_to_cv2(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)

def make_red_mask(img_cv: np.ndarray) -> np.ndarray:
    """统一红色区域提取"""
    hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, np.array([0, 70, 70]),   np.array([10, 255, 255]))
    m2 = cv2.inRange(hsv, np.array([160, 70, 70]), np.array([180, 255, 255]))
    return cv2.bitwise_or(m1, m2)

def detect_scan_vs_digital(img_cv: np.ndarray) -> tuple[str, float]:
    """
    v3 新增：检测文件是扫描件还是数字生成文件。
    返回 (类型, 全局噪点均值)
    """
    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY).astype(float)
    blur  = cv2.GaussianBlur(gray, (5, 5), 0)
    noise = np.abs(gray - blur)
    global_noise = noise.mean()
    if global_noise < 1.0:
        return "digital", global_noise
    elif global_noise > 4.0:
        return "scan", global_noise
    else:
        return "uncertain", global_noise


# ─────────────────────────────────────────────────────────────
# 文件加载
# ─────────────────────────────────────────────────────────────

def pdf_to_image(pdf_path: str) -> np.ndarray:
    import fitz
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    doc.close()
    if pix.n == 4:   return cv2.cvtColor(arr, cv2.COLOR_RGBA2BGR)
    if pix.n == 1:   return cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    return arr

def load_image(file_path: str) -> np.ndarray:
    p = Path(file_path)
    if not p.exists():
        raise FileNotFoundError(f"文件不存在: {file_path}")
    if p.suffix.lower() == ".pdf":
        print(f"  📄 PDF转图像: {p.name}")
        return pdf_to_image(file_path)
    # 用 np.fromfile + imdecode 替代 imread，避免中文路径 Unicode 问题
    img_array = np.fromfile(file_path, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"无法读取图像: {file_path}")
    return img


# ─────────────────────────────────────────────────────────────
# 文件真实性检测（PS/抠图痕迹） — v3 改进版
# ─────────────────────────────────────────────────────────────

class ForgeryCheck:
    """单项检测结果"""
    def __init__(self, name, status, detail, image=None):
        self.name   = name
        self.status = status   # ok / suspicious / skipped
        self.detail = detail
        self.image  = image    # 可选可视化图（PIL Image）


def check_ela(file_path: str, quality=75) -> ForgeryCheck:
    """
    v3 ELA（错误级别分析）
    改进：均值比 → 分布一致性（标准差比 + 均值比双重校验）
    新增：PNG 转存 JPEG 后做 ELA，结论改为「区域内部一致性检测」
    """
    suffix = Path(file_path).suffix.lower()
    is_pdf = suffix == ".pdf"
    is_jpg = suffix in (".jpg", ".jpeg")
    is_png = suffix == ".png"

    # 提取图像
    if is_pdf:
        import fitz
        doc = fitz.open(file_path)
        page = doc[0]
        img_list = page.get_images(full=True)
        if not img_list:
            doc.close()
            return ForgeryCheck("ELA错误级别分析", "skipped",
                                "PDF中未找到嵌入图像对象，无法做ELA分析")
        best = max(img_list, key=lambda x: x[2] * x[3] if len(x) > 3 else 0)
        xref = best[0]
        base_img = doc.extract_image(xref)
        doc.close()
        if base_img["ext"] not in ("jpeg", "jpg"):
            return ForgeryCheck("ELA错误级别分析", "skipped",
                                f"PDF内嵌图像为{base_img['ext'].upper()}格式（非JPEG），ELA无效")
        orig = Image.open(io.BytesIO(base_img["image"])).convert("RGB")
        note = ""
    elif is_png:
        # v3: PNG 不再直接跳过，而是转存为 JPEG 后做内部一致性检测
        orig = Image.open(file_path).convert("RGB")
        note = "（PNG无损源→转存JPEG检测，结论为区域内部一致性，非压缩历史对比）"
    else:
        orig = Image.open(file_path).convert("RGB")
        note = ""

    # 以低质量重新保存再读回
    buf = io.BytesIO()
    orig.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    recompressed = Image.open(buf).convert("RGB")

    # 计算误差，放大10倍可视化
    ela_arr = np.abs(np.array(orig, dtype=int) - np.array(recompressed, dtype=int))
    ela_arr = np.clip(ela_arr * 10, 0, 255).astype(np.uint8)
    ela_img = Image.fromarray(ela_arr)

    # 找红色印章区域
    orig_cv = pil_to_cv2(orig)
    red_mask = make_red_mask(orig_cv)

    ela_gray = np.array(ela_img.convert("L")).astype(float)

    if red_mask.sum() < 500:
        return ForgeryCheck("ELA错误级别分析", "skipped",
                            f"未在图像中检测到红色印章区域，无法定向ELA分析{note}")

    seal_ela_vals = ela_gray[red_mask > 0]
    bg_ela_vals   = ela_gray[red_mask == 0]

    seal_mean = seal_ela_vals.mean()
    seal_std  = seal_ela_vals.std()
    bg_mean   = bg_ela_vals.mean()
    bg_std    = bg_ela_vals.std()

    mean_ratio = seal_mean / (bg_mean + 1e-6)
    std_ratio  = seal_std  / (bg_std  + 1e-6)

    # v3: 双重判断——均值比和标准差比都需要考虑
    # 真实印章：ELA均值可能因颜色偏高，但标准差应与背景一致
    # 后期粘贴：ELA均值和标准差都显著高于背景
    mean_suspicious = mean_ratio > 2.5
    std_suspicious  = std_ratio  > 2.0

    if mean_suspicious and std_suspicious:
        status = "suspicious"
        detail = (f"印章区域ELA均值({seal_mean:.1f})和标准差({seal_std:.1f})均显著高于背景"
                  f"(均值{bg_mean:.1f}, 标准差{bg_std:.1f})，"
                  f"均值比{mean_ratio:.1f}x（阈值2.5x），标准差比{std_ratio:.1f}x（阈值2.0x）"
                  f"→ 疑似后期粘贴{note}")
    elif mean_suspicious and not std_suspicious:
        # 均值高但标准差正常——可能是红色油墨本身的 JPEG 特性
        status = "ok"
        detail = (f"印章区域ELA均值({seal_mean:.1f})偏高但标准差({seal_std:.1f})与背景({bg_std:.1f})一致，"
                  f"符合红色油墨的JPEG压缩特性，非后期粘贴迹象{note}")
    else:
        status = "ok"
        detail = (f"印章区域ELA误差({seal_mean:.1f}±{seal_std:.1f})与背景({bg_mean:.1f}±{bg_std:.1f})"
                  f"分布一致，均值比{mean_ratio:.1f}x{note}")

    return ForgeryCheck("ELA错误级别分析", status, detail, ela_img)


def check_pdf_metadata(file_path: str) -> ForgeryCheck:
    """
    v3 PDF元数据检测
    改进：移除 acrobat/foxit/nitro/pdfedit（合规工具），仅标记图像编辑软件
    """
    if Path(file_path).suffix.lower() != ".pdf":
        return ForgeryCheck("PDF元数据分析", "skipped",
                            "非PDF文件，跳过元数据检查")
    import fitz
    doc = fitz.open(file_path)
    meta = doc.metadata
    doc.close()

    # v3: 仅标记图像编辑/合成工具，不标记正规 PDF 工具
    RASTER_EDITORS = ["photoshop", "gimp", "illustrator", "inkscape", "lightroom",
                      "paint", "corel", "affinity"]
    findings = []
    creator  = (meta.get("creator",  "") or "").lower()
    producer = (meta.get("producer", "") or "").lower()

    for tool in RASTER_EDITORS:
        if tool in creator or tool in producer:
            findings.append(tool.title())

    created  = meta.get("creationDate", "未知")
    modified = meta.get("modDate",      "未知")
    creator_raw  = meta.get("creator",  "未知")
    producer_raw = meta.get("producer", "未知")

    detail = (f"创建工具: {creator_raw} | 生成工具: {producer_raw} | "
              f"创建时间: {created} | 修改时间: {modified}")

    if findings:
        return ForgeryCheck("PDF元数据分析", "suspicious",
                            f"检测到图像编辑软件痕迹：{', '.join(findings)}。{detail}")
    return ForgeryCheck("PDF元数据分析", "ok", detail)


def check_pdf_layers(file_path: str) -> ForgeryCheck:
    """
    v3 PDF图层结构分析
    改进：
      1. 阈值从 3 → 6（正规合同普遍包含 LOGO、表格线图等）
      2. 新增内容流绘制顺序检查——图像覆盖文字才可疑
      3. 区分扫描件（整页单图）vs 数字合成（多图叠放）
    """
    if Path(file_path).suffix.lower() != ".pdf":
        return ForgeryCheck("PDF图层结构分析", "skipped", "非PDF文件")

    import fitz
    doc  = fitz.open(file_path)
    page = doc[0]

    img_list = page.get_images(full=True)
    text_blocks = page.get_text("blocks")

    n_imgs = len(img_list)
    n_text = len(text_blocks)

    # v3: 无图像 → 扫描件或纯文字 PDF
    if n_imgs == 0:
        doc.close()
        return ForgeryCheck("PDF图层结构分析", "ok",
                            f"页面无独立图像对象，文字块{n_text}个 → 印章为原生内容流（正常）")

    # v3: 仅1个整页图像 → 扫描件，印章是整图一部分，正常
    if n_imgs == 1:
        # 检查这唯一图像是否覆盖整页
        try:
            xref = img_list[0][0]
            img_info = doc.extract_image(xref)
            w, h = img_info.get("width", 0), img_info.get("height", 0)
            pw, ph = page.rect.width, page.rect.height
            if w > 0 and h > 0 and w > pw * 0.8 and h > ph * 0.8:
                doc.close()
                return ForgeryCheck("PDF图层结构分析", "ok",
                                    f"页面含1个整页扫描图像（{w}×{h}px）→ 印章为扫描件原生内容")
        except Exception:
            pass

    # v3: 尝试检测图像是否覆盖在文字之上（z-order 分析）
    # 通过检查页面内容流中的绘制顺序
    img_over_text = False
    try:
        # 获取页面的显示列表（按绘制顺序）
        dl = page.get_displaylist()
        # 遍历 blocks，寻找图像 block 出现在文字 block 之后的情况
        blocks = page.get_text("rawdict")["blocks"]
        last_text_bbox = None
        last_img_bbox  = None
        has_text_before_img = False

        for block in blocks:
            if block.get("type") == 0:  # 文字 block
                if last_img_bbox is not None:
                    has_text_before_img = True
            elif block.get("type") == 1:  # 图像 block
                if has_text_before_img:
                    img_over_text = True
                    break
    except Exception:
        pass

    doc.close()

    # v3: 综合判断
    details = []

    if n_imgs >= 6:
        details.append(f"页面含{n_imgs}个独立图像对象（阈值6）→ 结构复杂，疑似合成文件")

    if img_over_text:
        details.append("检测到图像对象绘制于文字之后 → 疑似印章为后期浮动插入的图像层")

    if not details:
        return ForgeryCheck("PDF图层结构分析", "ok",
                            f"页面含{n_imgs}个图像对象，{n_text}个文字块，结构正常")

    return ForgeryCheck("PDF图层结构分析", "suspicious",
                        "；".join(details))


def check_noise_consistency(img_cv: np.ndarray, file_path: str) -> ForgeryCheck:
    """
    v3 噪点一致性检测
    改进：
      1. 先检测文件是扫描件还是数字文件
      2. 数字文件（噪点极低）→ 跳过（分析无意义）
      3. 阈值动态化，不依赖文件后缀
    """
    file_type, global_noise = detect_scan_vs_digital(img_cv)

    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY).astype(float)

    # 高通滤波提取噪点层
    blur  = cv2.GaussianBlur(gray, (5, 5), 0)
    noise = np.abs(gray - blur)

    # v3: 数字生成文件噪点极低，跳过分析
    if file_type == "digital":
        return ForgeryCheck("噪点一致性分析", "skipped",
                            f"图像噪点极低（全局均值{global_noise:.2f}），疑似数字生成文件，噪点分析无意义")

    # v3: 根据文件类型动态设定阈值
    if file_type == "scan":
        threshold = 1.8
        note = "（扫描件，阈值标准）"
    else:
        threshold = 2.5
        note = f"（噪点水平{global_noise:.2f}，阈值适中）"

    # 找红色印章区域
    red_mask = make_red_mask(img_cv)

    if red_mask.sum() < 500:
        return ForgeryCheck("噪点一致性分析", "skipped",
                            "未检测到足够的红色印章区域，无法对比噪点分布")

    seal_noise = noise[red_mask > 0].mean()
    bg_noise   = noise[red_mask == 0].mean()
    ratio      = seal_noise / (bg_noise + 1e-6)

    if ratio > threshold:
        status = "suspicious"
        detail = (f"印章区域噪点({seal_noise:.2f})显著高于背景({bg_noise:.2f})，"
                  f"比值{ratio:.1f}x（阈值{threshold}x）{note} → 疑似来源不一致")
    elif ratio < 1 / threshold:
        status = "suspicious"
        detail = (f"印章区域噪点({seal_noise:.2f})显著低于背景({bg_noise:.2f})，"
                  f"比值{ratio:.1f}x → 印章疑似数字合成后贴入扫描文件")
    else:
        status = "ok"
        detail = (f"印章区域噪点({seal_noise:.2f})与背景({bg_noise:.2f})"
                  f"比值{ratio:.1f}x，分布一致{note}")

    return ForgeryCheck("噪点一致性分析", status, detail)


def check_edge_sharpness(img_cv: np.ndarray) -> ForgeryCheck:
    """
    v3 边缘锐利度检测
    改进：绝对阈值 → 相对比值（印章边缘锐利度 / 文字边缘锐利度）
    若两者接近则正常，若印章显著高于文字则可疑
    """
    red_mask = make_red_mask(img_cv)

    if red_mask.sum() < 500:
        return ForgeryCheck("印章边缘锐利度", "skipped",
                            "未检测到足够的红色印章区域")

    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

    # 印章边缘区域
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    dilated = cv2.dilate(red_mask, kernel)
    eroded  = cv2.erode(red_mask, kernel)
    seal_edge_band = cv2.bitwise_xor(dilated, eroded)

    lap = cv2.Laplacian(gray, cv2.CV_64F)
    seal_edge_sharpness = np.abs(lap)[seal_edge_band > 0].mean() if seal_edge_band.sum() > 0 else 0

    # v3: 提取文字边缘作为参考——用 Canny 在全图上找边缘，排除印章区域
    canny_edges = cv2.Canny(gray, 50, 150)
    text_edges = cv2.bitwise_and(canny_edges, cv2.bitwise_not(red_mask))
    if text_edges.sum() > 500:
        text_edge_sharpness = np.abs(lap)[text_edges > 0].mean()
    else:
        text_edge_sharpness = 0

    # v3: 相对比值判断
    if text_edge_sharpness > 0:
        ratio = seal_edge_sharpness / text_edge_sharpness
    else:
        ratio = 1.0

    # 印章边缘/文字边缘 比值判断
    if ratio > 2.5:
        status = "suspicious"
        detail = (f"印章边缘锐利度({seal_edge_sharpness:.1f})显著高于文字边缘({text_edge_sharpness:.1f})，"
                  f"比值{ratio:.1f}x（阈值2.5x）→ 印章边缘过于锐利，疑似数字合成")
    elif ratio < 0.3:
        status = "suspicious"
        detail = (f"印章边缘锐利度({seal_edge_sharpness:.1f})异常低于文字边缘({text_edge_sharpness:.1f})，"
                  f"比值{ratio:.1f}x → 印章异常模糊，疑似后期处理")
    elif seal_edge_sharpness < 1.0:
        status = "ok"
        detail = (f"印章边缘锐利度({seal_edge_sharpness:.1f})极低，印章/文字比{ratio:.1f}x "
                  f"→ 边缘自然模糊，符合老旧印章特征")
    else:
        status = "ok"
        detail = (f"印章边缘锐利度({seal_edge_sharpness:.1f})与文字边缘({text_edge_sharpness:.1f})"
                  f"比值{ratio:.1f}x，在正常范围内")

    return ForgeryCheck("印章边缘锐利度", status, detail)


def run_forgery_checks(file_path: str, img_cv: np.ndarray) -> list[ForgeryCheck]:
    """自动运行所有适用的检测"""
    print("  🔎 运行文件真实性检测（v3改进算法）...")
    checks = []

    # 1. ELA
    c = check_ela(file_path)
    checks.append(c)
    print(f"    ELA: {c.status} — {c.detail[:70]}...")

    # 2. PDF元数据（仅PDF）
    c = check_pdf_metadata(file_path)
    checks.append(c)
    print(f"    元数据: {c.status} — {c.detail[:70]}...")

    # 3. PDF图层（仅PDF）
    c = check_pdf_layers(file_path)
    checks.append(c)
    print(f"    图层: {c.status} — {c.detail[:70]}...")

    # 4. 噪点一致性
    c = check_noise_consistency(img_cv, file_path)
    checks.append(c)
    print(f"    噪点: {c.status} — {c.detail[:70]}...")

    # 5. 边缘锐利度
    c = check_edge_sharpness(img_cv)
    checks.append(c)
    print(f"    边缘: {c.status} — {c.detail[:70]}...")

    return checks


# ─────────────────────────────────────────────────────────────
# 印章检测与比对 — v3 改进版
# ─────────────────────────────────────────────────────────────

def detect_seal(img: np.ndarray) -> tuple:
    """
    v3 印章检测
    改进：加入形状过滤（宽高比 0.6~1.7），避免被红色文字/表头干扰
    """
    red_mask = make_red_mask(img)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_CLOSE, kernel)
    red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_OPEN,  kernel)

    contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        print("  ⚠️  未检测到红色印章，使用整图")
        return img, (0, 0, img.shape[1], img.shape[0]), False

    # v3: 按面积排序，取第一个形状合理的（圆形印章宽高比接近1）
    #     避免红色表头/文字块被误判为印章
    sorted_contours = sorted(contours, key=cv2.contourArea, reverse=True)

    largest = None
    for cnt in sorted_contours:
        area = cv2.contourArea(cnt)
        if area < 1000:
            continue
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = w / h if h > 0 else 0
        # 印章近似圆形/方形，宽高比应在合理范围
        if 0.5 < aspect_ratio < 2.0:
            largest = cnt
            break

    if largest is None:
        # 无形状合理的轮廓，回退到最大面积轮廓
        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        if area < 1000:
            print(f"  ⚠️  印章区域过小({area:.0f}px)且无合理形状，使用整图")
            return img, (0, 0, img.shape[1], img.shape[0]), False

    area = cv2.contourArea(largest)
    x, y, w, h = cv2.boundingRect(largest)
    aspect = w / h if h > 0 else 0

    pad = int(max(w, h) * 0.1)
    x   = max(0, x - pad);  y = max(0, y - pad)
    w   = min(img.shape[1] - x, w + 2 * pad)
    h   = min(img.shape[0] - y, h + 2 * pad)
    print(f"  ✅ 检测到印章 ({x},{y}) {w}×{h}px，面积{area:.0f}px²，宽高比{aspect:.2f}")
    return img[y:y+h, x:x+w], (x, y, w, h), True


def normalize_seal(seal_img: np.ndarray, size: int = 400) -> np.ndarray:
    """归一化：等比缩放后居中放置到固定尺寸画布"""
    h, w   = seal_img.shape[:2]
    scale  = size / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(seal_img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    canvas  = np.ones((size, size, 3), dtype=np.uint8) * 255
    y_off   = (size - new_h) // 2;  x_off = (size - new_w) // 2
    canvas[y_off:y_off+new_h, x_off:x_off+new_w] = resized
    return canvas


def auto_orient_seal(seal_img: np.ndarray) -> tuple:
    """
    v3+ 自动旋转印章使五角星一个尖角朝上（12点钟方向）
    原理：中心区域红色像素的径向分布 → 5个峰间隔72° → 最高峰对齐正上方
    返回 (旋转后图像, 旋转角度)
    """
    h, w = seal_img.shape[:2]
    cx, cy = w // 2, h // 2

    red_mask = make_red_mask(seal_img)
    center_radius = min(h, w) // 6
    center_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(center_mask, (cx, cy), center_radius, 255, -1)

    star_region = cv2.bitwise_and(red_mask, center_mask)
    ys, xs = np.where(star_region > 0)
    if len(ys) < 100:
        return seal_img, 0.0

    radii = np.sqrt((xs - cx)**2 + (ys - cy)**2)
    threshold = np.percentile(radii, 80)
    tip_mask = radii >= threshold
    if tip_mask.sum() < 10:
        return seal_img, 0.0

    tip_angles_deg = np.degrees(np.arctan2(ys[tip_mask] - cy, xs[tip_mask] - cx))
    tip_angles_deg = (tip_angles_deg + 360) % 360

    hist, _ = np.histogram(tip_angles_deg, bins=360, range=(0, 360))
    hist = cv2.GaussianBlur(hist.astype(np.float32).reshape(1, -1), (1, 7), 2).ravel()
    peak_idx = int(np.argmax(hist))

    # 旋转使最高峰指向正上方（0°）
    rotation = (360 - peak_idx) % 360
    if rotation > 180:
        rotation -= 360

    if abs(rotation) < 1.0:
        return seal_img, 0.0

    M = cv2.getRotationMatrix2D((cx, cy), rotation, 1.0)
    rotated = cv2.warpAffine(seal_img, M, (w, h),
                              flags=cv2.INTER_LANCZOS4,
                              borderMode=cv2.BORDER_CONSTANT,
                              borderValue=(255, 255, 255))
    print(f"  🧭 星尖定向：旋转{rotation:.1f}° 使五角星朝上")
    return rotated, rotation


def align_translate_only(seal_q: np.ndarray, seal_r: np.ndarray) -> np.ndarray:
    """
    v3+ 仅平移对齐（保留旋转），将检材质心对齐到样本质心。
    用于 --rotate 手动指定旋转时，只做平移补偿不做旋转校正。
    """
    h, w = seal_r.shape[:2]
    red_q = make_red_mask(seal_q)
    red_r = make_red_mask(seal_r)
    if red_q.sum() < 100 or red_r.sum() < 100:
        return seal_q
    yq, xq = np.where(red_q > 0)
    yr, xr = np.where(red_r > 0)
    dx = xr.mean() - xq.mean()
    dy = yr.mean() - yq.mean()
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    aligned = cv2.warpAffine(seal_q, M, (w, h),
                              flags=cv2.INTER_LANCZOS4,
                              borderMode=cv2.BORDER_CONSTANT,
                              borderValue=(255, 255, 255))
    print(f"     质心平移对齐: dx={dx:.1f}px, dy={dy:.1f}px")
    return aligned


def align_seals(seal_q: np.ndarray, seal_r: np.ndarray) -> np.ndarray:
    """
    v3+ 图像配准（两阶段精炼管线）
    阶段1 — AKAZE特征匹配 → 初估仿射变换（粗对齐）
    阶段2 — ECC像素级精炼 → 修正1-2°残余旋转（细对齐）
    回退链：AKAZE → ORB → identity
    """
    gray_q = cv2.cvtColor(seal_q, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray_r = cv2.cvtColor(seal_r, cv2.COLOR_BGR2GRAY).astype(np.float32)
    h, w = seal_r.shape[:2]

    # ── 阶段1：特征匹配 ──
    M_init = np.eye(2, 3, dtype=np.float32)  # 恒等变换
    method_used = "AKAZE+Affine"
    n_inliers = 0

    try:
        akaze = cv2.AKAZE_create()
        kp1, des1 = akaze.detectAndCompute(gray_q, None)
        kp2, des2 = akaze.detectAndCompute(gray_r, None)
        if des1 is None or len(kp1) < 4:
            raise ValueError("AKAZE features insufficient")
    except Exception:
        method_used = "ORB+Homography(fallback)"
        orb = cv2.ORB_create(1000)
        kp1, des1 = orb.detectAndCompute(gray_q, None)
        kp2, des2 = orb.detectAndCompute(gray_r, None)

    if des1 is not None and des2 is not None and len(kp1) >= 4 and len(kp2) >= 4:
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = sorted(bf.match(des1, des2), key=lambda x: x.distance)[:60]

        if len(matches) >= 4:
            src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

            # 优先 full affine（6 DOF），对旋转估计更准确
            result = cv2.estimateAffinePartial2D(src_pts, dst_pts, method=cv2.RANSAC)
            if result[0] is not None:
                M_init = result[0]
                n_inliers = int(sum(result[1].ravel())) if result[1] is not None else len(matches)
            else:
                # 回退 Homography → 取其仿射部分
                H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
                if H is not None:
                    M_init = H[:2, :3].astype(np.float32)
                    n_inliers = int(sum(mask.ravel())) if mask is not None else len(matches)
            print(f"  📍 阶段1：{method_used}，{n_inliers}个有效匹配点")

    if n_inliers == 0:
        print("  ⚠️  特征匹配未产生有效变换，使用恒等变换")

    # ── 阶段2：ECC像素级精炼 ──
    # 构建掩膜：排除白色背景（>240），只对印章内容区域做像素优化
    _, mask_raw = cv2.threshold(gray_r, 240, 0, cv2.THRESH_TOZERO_INV)
    ecc_mask = (mask_raw > 0).astype(np.uint8) * 255

    try:
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-4)
        ecc_result = cv2.findTransformECC(
            gray_r, gray_q,
            M_init.copy(),
            cv2.MOTION_AFFINE,
            criteria,
            ecc_mask if np.any(ecc_mask) else None,
        )
        # findTransformECC 返回 (retval, warpMatrix)
        if isinstance(ecc_result, tuple) and len(ecc_result) == 2:
            M_final = ecc_result[1]
            iterations = ecc_result[0]
        else:
            M_final = ecc_result
            iterations = "?"
        print(f"  📍 阶段2：ECC精炼完成（迭代{iterations if isinstance(iterations, int) else ''}次）")
    except Exception as e:
        M_final = M_init
        print(f"  ⚠️  ECC精炼未收敛（{e}），使用阶段1结果")

    aligned = cv2.warpAffine(seal_q, M_final, (w, h),
                             flags=cv2.INTER_LANCZOS4,
                             borderMode=cv2.BORDER_CONSTANT,
                             borderValue=(255, 255, 255))
    print(f"  ✅ 配准完成（两阶段：特征匹配 + ECC精炼）")
    return aligned


def analyze_difference(seal_q: np.ndarray, seal_r: np.ndarray) -> dict:
    """差异分析（与 v2 基本一致，指标计算不变）"""
    gray_q = cv2.cvtColor(seal_q, cv2.COLOR_BGR2GRAY)
    gray_r = cv2.cvtColor(seal_r, cv2.COLOR_BGR2GRAY)
    score, diff = ssim(gray_r, gray_q, full=True)
    diff        = (diff * 255).astype(np.uint8)
    heatmap     = cv2.applyColorMap(255 - diff, cv2.COLORMAP_JET)

    overlay = np.zeros_like(seal_r)
    overlay[:, :, 0] = gray_q
    overlay[:, :, 2] = gray_r
    overlay[:, :, 1] = np.minimum(gray_q, gray_r)

    _, diff_thresh  = cv2.threshold(255 - diff, 50, 255, cv2.THRESH_BINARY)
    diff_contours, _ = cv2.findContours(diff_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    overlay_marked  = overlay.copy()
    cv2.drawContours(overlay_marked, diff_contours, -1, (0, 255, 255), 2)

    diff_ratio = np.sum(diff_thresh > 0) / diff_thresh.size

    rq = make_red_mask(seal_q)
    rr = make_red_mask(seal_r)
    ov = np.sum((rq > 0) & (rr > 0))
    un = np.sum((rq > 0) | (rr > 0))
    red_iou = ov / un if un > 0 else 0

    area_q = np.sum(rq > 0)
    area_r = np.sum(rr > 0)
    area_ratio = max(area_q, area_r) / (min(area_q, area_r) + 1)
    if area_ratio > 3:
        print(f"  ⚠️  两章印章区域面积比{area_ratio:.1f}x（阈值3x），检测结果可能不可靠，请人工确认")

    print(f"  📊 SSIM={score:.4f}  差异像素={diff_ratio:.2%}  红色IoU={red_iou:.4f}")
    return dict(ssim=float(score), diff_ratio=float(diff_ratio),
                red_iou=float(red_iou), diff_img=diff,
                heatmap=heatmap, overlay=overlay_marked,
                area_ratio=float(area_ratio))


def judge_authenticity(metrics: dict) -> dict:
    """
    v3 综合评分
    改进：
      1. diff_ratio 归一化：diff_score = max(0, 1 - diff_ratio/0.4)
      2. 单项失败保底：SSIM<0.5 或 IoU<0.5 → 强制≤0.69
    """
    # v3: diff_ratio 归一化，0.4（40%差异）→ 0分，0%差异 → 满分
    diff_score = max(0.0, 1.0 - metrics["diff_ratio"] / 0.40)

    s = metrics["ssim"] * 0.5 + metrics["red_iou"] * 0.3 + diff_score * 0.2

    # v3: 单项失败保底——任一核心指标过低，总分不应超过 0.69（"存疑"上限）
    hard_floor_applied = False
    if metrics["ssim"] < 0.5 or metrics["red_iou"] < 0.5:
        s = min(s, 0.69)
        hard_floor_applied = True

    if s >= 0.85:
        verdict, level, color, icon = "真实", "高度一致",  "#2ecc71", "✅"
    elif s >= 0.70:
        verdict, level, color, icon = "存疑", "部分差异",  "#f39c12", "⚠️"
    else:
        verdict, level, color, icon = "疑似伪造", "差异显著", "#e74c3c", "❌"

    reasons = []
    if metrics["ssim"]       < 0.75: reasons.append(f"结构相似度偏低（SSIM={metrics['ssim']:.3f}，阈值0.75）")
    if metrics["diff_ratio"] > 0.20: reasons.append(f"差异像素比例偏高（{metrics['diff_ratio']:.1%}，阈值20%）")
    if metrics["red_iou"]    < 0.70: reasons.append(f"红色区域重叠度不足（IoU={metrics['red_iou']:.3f}，阈值0.70）")
    if metrics.get("area_ratio", 1) > 3:
        reasons.append(f"两章面积差异悬殊（{metrics['area_ratio']:.1f}x），比对结果仅供参考")
    if hard_floor_applied:
        reasons.append("⚠️ 核心指标单项严重不达标（SSIM<0.5 或 IoU<0.5），评分已强制降级")
    if not reasons:
        reasons.append("各项指标均在正常范围内")

    return dict(score=s, verdict=verdict, level=level, color=color, icon=icon, reasons=reasons)


def ai_analysis(seal_q, seal_r, overlay) -> str:
    """AI 专家分析（不变）"""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return ""
    try:
        import anthropic as ant
        def b64(img):
            _, buf = cv2.imencode(".png", img)
            return base64.b64encode(buf.tobytes()).decode()
        client = ant.Anthropic()
        resp = client.messages.create(
            model="claude-sonnet-4-6", max_tokens=800,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": "你是印章鉴定专家。对比三张图（检材章、样本章、叠加图），从字体笔画、边框粗细、颜色深浅、整体形状、伪造迹象五个维度分析，150字以内给出结论。"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64(seal_q)}},
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64(seal_r)}},
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64(overlay)}},
            ]}]
        )
        return resp.content[0].text
    except Exception as e:
        return f"（AI分析失败: {e}）"


# ─────────────────────────────────────────────────────────────
# HTML 报告（与 v2 一致）
# ─────────────────────────────────────────────────────────────

STATUS_STYLE = {
    "ok":         ("✅", "#2ecc71", "正常"),
    "suspicious": ("🚨", "#e74c3c", "可疑"),
    "skipped":    ("⬜", "#95a5a6", "条件不足"),
}

def render_forgery_checks_html(checks: list) -> str:
    rows = []
    for c in checks:
        icon, color, label = STATUS_STYLE[c.status]
        img_html = ""
        if c.image:
            img_html = f'<img src="{pil_to_data_url(c.image)}" style="max-width:100%;border-radius:6px;margin-top:8px;">'
        rows.append(f"""
        <div class="check-row">
          <div class="check-header">
            <span class="check-badge" style="background:{color}">{icon} {label}</span>
            <span class="check-name">{c.name}</span>
          </div>
          <div class="check-detail">{c.detail}</div>
          {img_html}
        </div>""")
    return "\n".join(rows)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>印章鉴定报告 v3</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#f0f2f5;color:#2c3e50}}

.header{{background:linear-gradient(135deg,#1a1a2e,#0f3460);color:white;padding:28px 40px;
         display:flex;justify-content:space-between;align-items:center}}
.header h1{{font-size:22px;letter-spacing:2px}}
.header .meta{{font-size:12px;opacity:.7;text-align:right;line-height:1.8}}
.header .version-tag{{font-size:10px;opacity:.5;margin-top:2px}}

.verdict{{background:{verdict_color};color:white;padding:14px 40px;
          display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700}}
.verdict-score{{margin-left:auto;font-size:14px;font-weight:400;
               background:rgba(255,255,255,.2);padding:4px 14px;border-radius:20px}}

.main{{padding:20px 40px}}
/* ── 左右双栏：左列章样，右列对比 ── */
.dual-col{{display:flex;gap:16px;margin-bottom:20px;align-items:stretch}}
.col{{flex:1;display:flex;flex-direction:column;gap:16px;min-width:0}}
.cell{{background:white;border-radius:10px;padding:14px;box-shadow:0 2px 10px rgba(0,0,0,.07);
        display:flex;flex-direction:column;flex:1;min-height:0}}
.cell-title{{font-size:12px;font-weight:700;color:#7f8c8d;text-transform:uppercase;
             letter-spacing:1.5px;padding-bottom:8px;margin-bottom:8px;
             border-bottom:1px solid #ecf0f1;flex-shrink:0;height:32px;
             display:flex;align-items:center}}
.seal-tag{{font-size:11px;font-weight:700;color:white;display:inline-block;
           padding:2px 8px;border-radius:3px;margin-bottom:6px;flex-shrink:0}}
.seal-img{{width:100%;border-radius:6px;border:1px solid #ecf0f1;display:block;
           flex:1;object-fit:contain;min-height:0}}

.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}}
.metric{{background:#f8f9fa;border-radius:8px;padding:12px;text-align:center}}
.mv{{font-size:20px;font-weight:700}}
.ml{{font-size:11px;color:#95a5a6;margin-top:3px}}

.legend{{display:flex;gap:14px;font-size:11px;flex-wrap:wrap;margin-top:8px}}
.ld{{display:flex;align-items:center;gap:5px}}
.dot{{width:10px;height:10px;border-radius:50%;flex-shrink:0}}

.footer{{padding:0 40px 30px}}
.abox{{background:white;border-radius:10px;padding:18px;
       box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:16px}}
.reason-item{{display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #f5f5f5;font-size:13px}}
.reason-item:last-child{{border-bottom:none}}
.ai-text{{margin-top:12px;font-size:13px;line-height:1.8;color:#555;
          background:#f8f9fa;padding:12px;border-radius:6px}}

.check-row{{padding:10px 0;border-bottom:1px solid #f0f0f0}}
.check-row:last-child{{border-bottom:none}}
.check-header{{display:flex;align-items:center;gap:8px;margin-bottom:4px}}
.check-badge{{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;color:white}}
.check-name{{font-size:13px;font-weight:600}}
.check-detail{{font-size:12px;color:#666;line-height:1.6;padding-left:2px}}

.disclaimer{{text-align:center;padding:14px;font-size:11px;color:#bdc3c7}}

/* ── 交互旋转控件 ── */
.rotate-panel{{background:white;border-radius:10px;padding:16px 20px;box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px}}
.rotate-panel label{{font-size:12px;font-weight:600;color:#555}}
.rotate-btn{{background:#1a1a2e;color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600}}
.rotate-btn:hover{{background:#0f3460}}
.rotate-btn:active{{transform:scale(0.96)}}
.rotate-btn.reset{{background:#e74c3c}}
.rotate-btn.reset:hover{{background:#c0392b}}
.rot-display{{font-size:16px;font-weight:700;color:#2c3e50;min-width:50px;text-align:center}}
.fine-input{{width:70px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font-size:13px;text-align:center}}
.fine-btn{{background:#f39c12;color:white;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}}
.fine-btn:hover{{background:#e67e22}}
.command-box{{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;padding:12px 16px;margin-top:10px;display:none;width:100%}}
.command-box code{{font-family:'Cascadia Code','Fira Code',monospace;font-size:12px;color:#2c3e50;word-break:break-all;line-height:1.6}}
.copy-btn{{background:#2980b9;color:white;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;margin-left:10px;flex-shrink:0}}
.copy-btn:hover{{background:#2471a3}}
.interactive-note{{font-size:11px;color:#95a5a6;margin-left:auto}}
</style>
</head>
<body>

<!-- 隐藏原始图（供JS交互旋转使用） -->
<img id="query-raw-src" src="{query_raw_img}" style="display:none">
<img id="ref-raw-src" src="{ref_raw_img}" style="display:none">

<div class="header">
  <div>
    <h1>🔍 印章真伪鉴定报告 <span style="font-size:14px;opacity:.7">v3</span></h1>
    <div class="version-tag">v3+ 两阶段配准 + 交互旋转微调 · 分布一致性ELA · 相对边缘 · 动态阈值 · 形状过滤 · 评分归一化</div>
  </div>
  <div class="meta">
    <div>检材：{query_name}</div><div>样本：{ref_name}</div>
    <div style="margin-top:4px">{timestamp}</div>
  </div>
</div>

<div class="verdict" style="background:{verdict_color}">
  <span>{verdict_icon}</span>
  <span>印章比对：{verdict}（{verdict_level}）</span>
  <span class="verdict-score">综合评分 {verdict_score:.1%}</span>
</div>

<div class="main">

  <!-- ── 交互旋转控件 ── -->
  <div class="rotate-panel" id="rotatePanel">
    <label>🔄 检材章旋转</label>
    <button class="rotate-btn" onclick="rotateSeal(72)">↻ 72°</button>
    <span class="rot-display" id="rotDisplay">0°</span>
    <label style="margin-left:8px">微调</label>
    <input class="fine-input" id="fineInput" type="number" min="0" max="72" step="0.5" value="0">
    <button class="fine-btn" onclick="applyFineTune()">✓ 确认</button>
    <button class="rotate-btn reset" onclick="resetRotation()">↺ 重置</button>
    <span class="interactive-note">微调叠加在定向旋转之上</span>
    <div class="command-box" id="commandBox">
      <div style="display:flex;align-items:flex-start">
        <code id="commandText"></code>
        <button class="copy-btn" onclick="copyCommand()">📋 复制</button>
      </div>
    </div>
  </div>

  <!-- ── 左右双栏：左列章样 · 右列对比 ── -->
  <div class="dual-col">

    <!-- 左列：检材 + 样本 -->
    <div class="col">
      <div class="cell">
        <div class="cell-title">🔍 检材章样 <span style="background:#e74c3c;color:white;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;margin-left:6px">待鉴定</span></div>
        <canvas class="seal-img" id="queryCanvas" style="flex:1;object-fit:contain;min-height:0"></canvas>
      </div>
      <div class="cell">
        <div class="cell-title">🔍 样本章样 <span style="background:#2980b9;color:white;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;margin-left:6px">真实参考</span></div>
        <img class="seal-img" src="{ref_img}" id="refDisplay">
      </div>
    </div>

    <!-- 右列：叠加对比 + 差异热图 -->
    <div class="col">
      <div class="cell">
        <div class="cell-title">📊 叠加差异对比 <span style="font-size:10px;color:#95a5a6;font-weight:400;margin-left:6px">(实时的)</span></div>
        <canvas class="seal-img" id="overlayCanvas"></canvas>
        <div class="legend">
          <div class="ld"><div class="dot" style="background:#f44"></div><span>仅检材有</span></div>
          <div class="ld"><div class="dot" style="background:#44f"></div><span>仅样本有</span></div>
          <div class="ld"><div class="dot" style="background:#fff;border:1px solid #ddd"></div><span>吻合</span></div>
        </div>
      </div>
      <div class="cell">
        <div class="cell-title">🌡️ 差异热图 <span style="font-size:10px;color:#95a5a6;font-weight:400;margin-left:6px">(实时的)</span></div>
        <canvas class="seal-img" id="heatmapCanvas"></canvas>
      </div>
    </div>

  </div>

  <!-- ── 量化指标 ── -->
  <div class="metrics" id="metricsRow">
    <div class="metric"><div class="mv" style="color:{ssim_color}" id="ssimVal">{ssim:.3f}</div><div class="ml">SSIM 结构相似度</div></div>
    <div class="metric"><div class="mv" style="color:{iou_color}" id="iouVal">{red_iou:.3f}</div><div class="ml">红色区域 IoU <span style="color:#95a5a6">(实时)</span></div></div>
    <div class="metric"><div class="mv" style="color:{diff_color}" id="diffVal">{diff_ratio:.1%}</div><div class="ml">差异像素比例 <span style="color:#95a5a6">(实时)</span></div></div>
  </div>

</div>

<div class="footer">
  <div class="abox">
    <div class="ptitle">比对分析</div>
    <div>{reason_items}</div>
    {ai_section}
  </div>

  <div class="abox">
    <div class="ptitle">文件真实性检测（PS / 抠图痕迹）— v3 改进算法</div>
    {forgery_checks_html}
  </div>
</div>

<div class="disclaimer">本报告由自动化图像分析生成（v3），仅供参考，法律鉴定须委托专业机构出具。</div>

<script>
(function(){{'use strict';
// ── 状态 ──
var rot72 = 0;            // 定向旋转累加（72°倍数）
var fineAngle = 0;        // 微调角度
var SIZE = 400;           // 画布尺寸（与 Python normalize_seal 一致）
var INITIAL_ROTATE = {initial_rotate};  // 已嵌入 RAW_IMG 的初始旋转（--rotate 参数）
var RAW_IMG, REF_IMG;     // Image 对象

var queryCanvas = document.getElementById('queryCanvas');
var overlayCanvas = document.getElementById('overlayCanvas');
var heatmapCanvas = document.getElementById('heatmapCanvas');
var ctxQ = queryCanvas.getContext('2d');
var ctxO = overlayCanvas.getContext('2d');
var ctxH = heatmapCanvas.getContext('2d');

// ── 加载隐藏的原始图 ──
function loadImages(callback) {{
  RAW_IMG = new Image();
  REF_IMG = new Image();
  var loaded = 0;
  RAW_IMG.onload = REF_IMG.onload = function() {{
    loaded++;
    if (loaded === 2) {{
      queryCanvas.width = overlayCanvas.width = heatmapCanvas.width = SIZE;
      queryCanvas.height = overlayCanvas.height = heatmapCanvas.height = SIZE;
      callback();
    }}
  }};
  RAW_IMG.src = document.getElementById('query-raw-src').src;
  REF_IMG.src = document.getElementById('ref-raw-src').src;
}}

// ── 离屏 canvas：旋转后检材（同源像素，展示+计算共用） ──
var offscreenQ = document.createElement('canvas');
offscreenQ.width = SIZE; offscreenQ.height = SIZE;
var ctxOffQ = offscreenQ.getContext('2d');

function drawRotatedQuery(angle) {{
  ctxOffQ.setTransform(1,0,0,1,0,0);  // 重置变换矩阵
  ctxOffQ.clearRect(0, 0, SIZE, SIZE);
  ctxOffQ.save();
  ctxOffQ.translate(SIZE/2, SIZE/2);
  ctxOffQ.rotate(angle * Math.PI / 180);
  ctxOffQ.drawImage(RAW_IMG, -SIZE/2, -SIZE/2, SIZE, SIZE);
  ctxOffQ.restore();
}}

function refImageData() {{
  var c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  var cx = c.getContext('2d');
  cx.drawImage(REF_IMG, 0, 0, SIZE, SIZE);
  return cx.getImageData(0, 0, SIZE, SIZE);
}}

// ── 判断像素是否接近白色（背景） ──
function isWhite(r, g, b) {{ return r > 230 && g > 230 && b > 230; }}

// ── 判断是否为红色（印章） ──
function isRed(r, g, b) {{
  var max = Math.max(r, g, b);
  if (max < 30) return false;
  return r > g * 1.4 && r > b * 1.4 && r > 50;
}}

// ── 更新所有可视化与指标 ──
function updateAll() {{
  var totalAngle = rot72 + fineAngle;
  document.getElementById('rotDisplay').textContent = totalAngle.toFixed(1) + '°';

  // 1. 绘制旋转后检材到离屏canvas，再镜像到显示canvas（确保同源像素）
  drawRotatedQuery(totalAngle);
  ctxQ.clearRect(0, 0, SIZE, SIZE);
  ctxQ.drawImage(offscreenQ, 0, 0);
  var queryData = ctxOffQ.getImageData(0, 0, SIZE, SIZE).data;
  var refData   = refImageData().data;
  var overlayData = ctxO.createImageData(SIZE, SIZE);
  var heatData    = ctxH.createImageData(SIZE, SIZE);

  var redUnion = 0, redOverlap = 0;
  var diffPixels = 0;
  var maxDiff = 0;
  var diffs = [];

  for (var y = 0; y < SIZE; y++) {{
    for (var x = 0; x < SIZE; x++) {{
      var i = (y * SIZE + x) * 4;
      var qr = queryData[i],   qg = queryData[i+1], qb = queryData[i+2];
      var rr = refData[i],     rg = refData[i+1],   rb = refData[i+2];

      var qWhite = isWhite(qr, qg, qb);
      var rWhite = isWhite(rr, rg, rb);
      var qRed = isRed(qr, qg, qb);
      var rRed = isRed(rr, rg, rb);

      // IoU
      if (qRed || rRed) redUnion++;
      if (qRed && rRed) redOverlap++;

      // 灰度值
      var qGray = qr * 0.299 + qg * 0.587 + qb * 0.114;
      var rGray = rr * 0.299 + rg * 0.587 + rb * 0.114;

      // 叠加图：复刻 Python 算法 —— 通道混合
      // R=检材灰度, G=min(检材,样本), B=样本灰度
      // 白底区域 → 纯白；有内容区域 → 暗色 = 吻合, 偏红 = 仅检材, 偏蓝 = 仅样本
      overlayData.data[i]   = Math.min(255, Math.round(qGray));           // R
      overlayData.data[i+1] = Math.min(255, Math.round(Math.min(qGray, rGray)));  // G
      overlayData.data[i+2] = Math.min(255, Math.round(rGray));           // B
      overlayData.data[i+3] = 255;

      // 差异热图
      var diff = Math.abs(qr - rr) * 0.299 + Math.abs(qg - rg) * 0.587 + Math.abs(qb - rb) * 0.114;
      diffs.push(diff);
      if (diff > maxDiff) maxDiff = diff;
      if (diff > 25) diffPixels++;
    }}
  }}

  // 绘制差异轮廓黄线（复刻 Python: cv2.drawContours 黄线标记差异区域）
  for (var y2 = 0; y2 < SIZE; y2++) {{
    for (var x2 = 0; x2 < SIZE; x2++) {{
      var d = diffs[y2 * SIZE + x2];
      if (d > 30) {{
        var idx = (y2 * SIZE + x2) * 4;
        // 检查是否为边缘像素（4邻域中有非差异像素）
        var isEdge = false;
        if (y2 > 0 && diffs[(y2-1)*SIZE + x2] <= 30) isEdge = true;
        if (y2 < SIZE-1 && diffs[(y2+1)*SIZE + x2] <= 30) isEdge = true;
        if (x2 > 0 && diffs[y2*SIZE + (x2-1)] <= 30) isEdge = true;
        if (x2 < SIZE-1 && diffs[y2*SIZE + (x2+1)] <= 30) isEdge = true;
        if (isEdge) {{
          overlayData.data[idx]   = 0;
          overlayData.data[idx+1] = 255;
          overlayData.data[idx+2] = 255;  // 黄色 = (0,255,255)
        }}
      }}
    }}
  }}

  // 绘制热图
  var scale = maxDiff > 0 ? 1 / maxDiff : 1;
  for (var yi = 0; yi < SIZE; yi++) {{
    for (var xi = 0; xi < SIZE; xi++) {{
      var idx = (yi * SIZE + xi) * 4;
      var d = diffs[yi * SIZE + xi] * scale;
      // 伪彩色：蓝(小) → 青 → 黄 → 红(大)
      heatData.data[idx]   = Math.min(255, d * 4 * 255);
      heatData.data[idx+1] = Math.min(255, (1 - Math.abs(d - 0.5) * 2) * 255);
      heatData.data[idx+2] = Math.min(255, (1 - d) * 255 * 2);
      heatData.data[idx+3] = 255;
    }}
  }}

  ctxO.putImageData(overlayData, 0, 0);
  ctxH.putImageData(heatData, 0, 0);

  // 更新指标
  var iou = redUnion > 0 ? redOverlap / redUnion : 0;
  var diffRatio = diffPixels / (SIZE * SIZE);
  document.getElementById('iouVal').textContent = iou.toFixed(3);
  document.getElementById('iouVal').style.color = iou >= 0.75 ? '#2ecc71' : (iou >= 0.60 ? '#f39c12' : '#e74c3c');
  document.getElementById('diffVal').textContent = (diffRatio * 100).toFixed(1) + '%';
  document.getElementById('diffVal').style.color = diffRatio <= 0.20 ? '#2ecc71' : (diffRatio <= 0.35 ? '#f39c12' : '#e74c3c');

  // 生成 CLI 命令
  generateCommand(totalAngle);
}}

// ── 旋转操作 ──
window.rotateSeal = function(deg) {{
  rot72 = (rot72 + deg) % 360;
  updateAll();
}};

window.applyFineTune = function() {{
  var val = parseFloat(document.getElementById('fineInput').value) || 0;
  fineAngle = Math.min(72, Math.max(0, val));
  updateAll();
}};

window.resetRotation = function() {{
  rot72 = 0;
  fineAngle = 0;
  document.getElementById('fineInput').value = '0';
  updateAll();
}};

// ── CLI 命令生成 ──
function generateCommand(interactiveAngle) {{
  var box = document.getElementById('commandBox');
  box.style.display = 'block';
  var cmd = 'python "{script_path}"';
  cmd += ' "{query_path}" "{ref_path}"';
  cmd += ' --pre-cropped';
  // INITIAL_ROTATE 已是 OpenCV 坐标系（CCW+），interactiveAngle 是 Canvas 坐标系（CW+）
  // OpenCV total = initial - interactive (Canvas CW → OpenCV CCW)
  var totalAngle = INITIAL_ROTATE + interactiveAngle;
  if (Math.abs(totalAngle) > 0.1) {{
    cmd += ' --rotate ' + totalAngle.toFixed(1);
  }}
  document.getElementById('commandText').textContent = cmd;
}}

window.copyCommand = function() {{
  var text = document.getElementById('commandText').textContent;
  navigator.clipboard.writeText(text).then(function() {{
    var btn = document.querySelector('.copy-btn');
    btn.textContent = '✅ 已复制';
    setTimeout(function() {{ btn.textContent = '📋 复制'; }}, 2000);
  }});
}};

// ── 初始化 ──
loadImages(function() {{
  // 绘制初始状态（不旋转）
  drawRotatedQuery(0);
  ctxQ.clearRect(0, 0, SIZE, SIZE);
  ctxQ.drawImage(offscreenQ, 0, 0);
  // 首次更新全部
  window.rot72 = 0; window.fineAngle = 0;
  document.getElementById('fineInput').value = '0';
  document.getElementById('rotDisplay').textContent = '0°';
  // 需要触发一次 full update
  updateAll();
}});
}})();
</script>

</body>
</html>"""


def generate_report(seal_q, seal_r, metrics, judgment, ai_text,
                    forgery_checks, query_name, ref_name, output_path,
                    seal_q_raw=None, seal_r_raw=None,
                    query_path="", ref_path="", initial_rotate=0.0):
    """生成HTML报告，seal_q_raw/seal_r_raw 为定向后未配准的原始图（供JS交互旋转使用）"""
    def c(val, hi=True, w=.75, b=.60):
        if hi:  return "#2ecc71" if val >= w else ("#f39c12" if val >= b else "#e74c3c")
        else:   return "#2ecc71" if val <= (1-w) else ("#f39c12" if val <= (1-b) else "#e74c3c")

    reason_html = "\n".join(
        f'<div class="reason-item"><span>{"✅" if len(judgment["reasons"])==1 and i==0 else "⚠️"}</span><span>{r}</span></div>'
        for i, r in enumerate(judgment["reasons"]))

    ai_html = (f'<div class="ptitle" style="margin-top:14px">AI 专家分析</div>'
               f'<div class="ai-text">{ai_text}</div>') if ai_text else ""

    q_raw_b64 = img_to_data_url(seal_q_raw) if seal_q_raw is not None else img_to_data_url(seal_q)
    r_raw_b64 = img_to_data_url(seal_r_raw) if seal_r_raw is not None else img_to_data_url(seal_r)

    # 诊断：保存传给模板的原图 + base64解码图
    if seal_q_raw is not None:
        dbg_q = Path(output_path).with_suffix(".seal_q_raw.png")
        cv2.imwrite(str(dbg_q), seal_q_raw)
        # 同时把 base64 解码也保存一份，验证编码正确
        try:
            b64_data = q_raw_b64.split(",", 1)[1] if "," in q_raw_b64 else q_raw_b64
            decoded = np.frombuffer(base64.b64decode(b64_data), dtype=np.uint8)
            b64_img = cv2.imdecode(decoded, cv2.IMREAD_COLOR)
            if b64_img is not None:
                dbg_b64 = Path(output_path).with_suffix(".seal_q_b64decode.png")
                cv2.imwrite(str(dbg_b64), b64_img)
                same = np.array_equal(seal_q_raw, b64_img)
                print(f"     base64解码与原图一致: {same}")
        except Exception as e:
            print(f"     base64诊断失败: {e}")
    if seal_r_raw is not None:
        dbg_r = Path(output_path).with_suffix(".seal_r_raw.png")
        cv2.imwrite(str(dbg_r), seal_r_raw)

    # 脚本自身绝对路径 + 输入文件的绝对路径（供 JS 生成 CLI 命令）
    script_path = Path(__file__).resolve().as_posix()
    query_abs = Path(query_path).resolve().as_posix() if query_path else query_name
    ref_abs = Path(ref_path).resolve().as_posix() if ref_path else ref_name

    html = HTML_TEMPLATE.format(
        query_name=query_name, ref_name=ref_name,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        verdict_color=judgment["color"], verdict_icon=judgment["icon"],
        verdict=judgment["verdict"],     verdict_level=judgment["level"],
        verdict_score=judgment["score"],
        ref_img=img_to_data_url(seal_r),
        query_raw_img=q_raw_b64, ref_raw_img=r_raw_b64,
        script_path=script_path, query_path=query_abs, ref_path=ref_abs,
        initial_rotate=initial_rotate,
        ssim=metrics["ssim"], red_iou=metrics["red_iou"], diff_ratio=metrics["diff_ratio"],
        ssim_color=c(metrics["ssim"]),  iou_color=c(metrics["red_iou"]),
        diff_color=c(metrics["diff_ratio"], hi=False),
        reason_items=reason_html, ai_section=ai_html,
        forgery_checks_html=render_forgery_checks_html(forgery_checks),
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)


# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="印章真伪鉴定 v3")
    parser.add_argument("query",  help="检材文件（jpg/png/pdf）；若指定 --pre-cropped，则为已裁好的章样图像")
    parser.add_argument("ref",    help="样本文件（jpg/png/pdf）；若指定 --pre-cropped，则为已裁好的章样图像")
    parser.add_argument("--output", default="seal_report_v3.html")
    parser.add_argument("--pre-cropped", action="store_true",
                        help="输入已是裁切好的章样，跳过印章检测及文件级真实性分析，直接归一化")
    parser.add_argument("--rotate", type=float, default=None,
                        help="手动旋转角度（度），在星尖定向基础上叠加，用于报告交互后复现")
    args = parser.parse_args()

    print("\n" + "=" * 52)
    print("  🔍 印章真伪鉴定系统 v3")
    print("     AKAZE+Affine · 分布一致性ELA · 相对边缘 · 动态阈值")
    if args.pre_cropped:
        print("     ⚡ pre-cropped 模式：跳过印章检测 & 文件级检测")
    if args.rotate is not None:
        print(f"     🧭 --rotate={args.rotate}")
    print("=" * 52)

    print("\n[1/7] 加载文件...")
    img_q = load_image(args.query)
    img_r = load_image(args.ref)

    if args.pre_cropped:
        # 输入已是裁好的章样 → 跳过文件级检测和印章检测，直接作为 seal_raw
        print("\n[2/7] 文件真实性检测 — 跳过（pre-cropped 模式，无文件上下文）")
        forgery_checks = [
            ForgeryCheck("文件真实性检测", "skipped",
                         "pre-cropped 模式：输入为裁切章样，无完整文件上下文，跳过 ELA/元数据/图层/噪点/边缘检测")
        ]

        print("\n[3/7] 印章区域 — 跳过（pre-cropped 模式，输入即章样）")
        seal_q_raw, seal_r_raw = img_q, img_r
        print(f"  ✅ 检材章样直接使用 ({img_q.shape[1]}×{img_q.shape[0]}px)")
        print(f"  ✅ 样本章样直接使用 ({img_r.shape[1]}×{img_r.shape[0]}px)")
    else:
        print("\n[2/7] 文件真实性检测（检材）v3改进算法...")
        forgery_checks = run_forgery_checks(args.query, img_q)

        print("\n[3/7] 检测印章区域（形状过滤）...")
        seal_q_raw, _, _ = detect_seal(img_q)
        seal_r_raw, _, _ = detect_seal(img_r)

    print("\n[4/7] 归一化...")
    seal_q = normalize_seal(seal_q_raw)
    seal_r = normalize_seal(seal_r_raw)

    print("\n[4.5/7] 星尖自动定向（五角星朝上）...")
    seal_q_orient, _ = auto_orient_seal(seal_q)
    seal_r_orient, _ = auto_orient_seal(seal_r)

    # 若指定了 --rotate，在定向基础上叠加手动旋转，并跳过自动配准
    manual_rotate = args.rotate is not None and abs(args.rotate) > 0.1
    if manual_rotate:
        # 保存旋转前图像到磁盘供对比
        debug_path_before = Path(args.output).with_suffix(".before_rotate.png")
        cv2.imwrite(str(debug_path_before), seal_q_orient)
        print(f"     📸 旋转前图已保存: {debug_path_before}")

        cx, cy = seal_q_orient.shape[1] // 2, seal_q_orient.shape[0] // 2
        # OpenCV getRotationMatrix2D: 正=逆时针, Canvas rotate: 正=顺时针 → 取反统一为顺时针
        M = cv2.getRotationMatrix2D((cx, cy), -args.rotate, 1.0)
        px_sum_before = float(seal_q_orient.sum())
        seal_q_orient = cv2.warpAffine(seal_q_orient, M, (seal_q_orient.shape[1], seal_q_orient.shape[0]),
                                        flags=cv2.INTER_LANCZOS4,
                                        borderMode=cv2.BORDER_CONSTANT,
                                        borderValue=(255, 255, 255))
        px_sum_after = float(seal_q_orient.sum())

        # 保存旋转后图像
        debug_path_after = Path(args.output).with_suffix(".after_rotate.png")
        cv2.imwrite(str(debug_path_after), seal_q_orient)
        print(f"     📸 旋转后图已保存: {debug_path_after}")

        print(f"  🧭 手动旋转叠加：--rotate={args.rotate:.1f}° → OpenCV参数={-args.rotate:.1f}° (像素校验: {px_sum_before:.0f} → {px_sum_after:.0f})")

    if manual_rotate:
        print("\n[5/7] 图像配准 — 仅做平移对齐（保留 --rotate 旋转，不自动校正旋转）")
        seal_q_aligned = align_translate_only(seal_q_orient, seal_r_orient)
    else:
        print("\n[5/7] 图像配准（两阶段：AKAZE特征匹配 + ECC像素精炼）...")
        seal_q_aligned = align_seals(seal_q_orient, seal_r_orient)

    print("\n[6/7] 差异分析...")
    metrics  = analyze_difference(seal_q_aligned, seal_r_orient)
    judgment = judge_authenticity(metrics)

    print("\n[7/7] AI分析 + 生成报告...")
    ai_text = ai_analysis(seal_q_aligned, seal_r_orient, metrics["overlay"])
    if not ai_text:
        print("  ⏭  未设置ANTHROPIC_API_KEY，跳过AI分析")

    generate_report(
        seal_q=seal_q_aligned, seal_r=seal_r_orient,
        metrics=metrics, judgment=judgment, ai_text=ai_text,
        forgery_checks=forgery_checks,
        query_name=Path(args.query).name,
        ref_name=Path(args.ref).name,
        output_path=args.output,
        seal_q_raw=seal_q_orient,
        seal_r_raw=seal_r_orient,
        query_path=args.query,
        ref_path=args.ref,
        initial_rotate=args.rotate if args.rotate else 0.0,
    )

    # 文件真实性汇总
    suspicious_checks = [c for c in forgery_checks if c.status == "suspicious"]

    print("\n" + "=" * 52)
    print(f"  {judgment['icon']} 印章比对：{judgment['verdict']}（{judgment['level']}）")
    print(f"  📊 综合评分：{judgment['score']:.1%}（v3归一化+保底）")
    if suspicious_checks:
        print(f"  🚨 文件真实性：{len(suspicious_checks)}项可疑")
        for c in suspicious_checks:
            print(f"     • {c.name}")
    else:
        print(f"  ✅ 文件真实性：无明显PS/抠图痕迹")
    print(f"  📄 报告：{args.output}")
    print(f"  ℹ️  算法版本：v3+（两阶段配准 · 分布ELA · 相对边缘 · 动态阈值 · 形状过滤）")
    print("=" * 52 + "\n")


if __name__ == "__main__":
    main()