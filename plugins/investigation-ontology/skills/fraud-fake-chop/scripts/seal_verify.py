#!/usr/bin/env python3
"""
印章真伪鉴定脚本
用法: python seal_verify.py <检材文件> <样本文件> [--output report.html]
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
    os.execv(str(python), [str(python)] + sys.argv)

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
    img = cv2.imread(file_path)
    if img is None:
        raise ValueError(f"无法读取图像: {file_path}")
    return img


# ─────────────────────────────────────────────────────────────
# ★ 新增：文件真实性检测（PS/抠图痕迹）
# ─────────────────────────────────────────────────────────────

class ForgeryCheck:
    """单项检测结果"""
    def __init__(self, name, status, detail, image=None):
        # status: "ok" | "suspicious" | "skipped"
        self.name   = name
        self.status = status   # ok=绿 suspicious=红 skipped=灰
        self.detail = detail
        self.image  = image    # 可选：可视化图（PIL Image）


def check_ela(file_path: str, quality=75) -> ForgeryCheck:
    """
    ELA（错误级别分析）
    原理：以低质量重新JPEG压缩，粘贴区域因有不同压缩历史而误差更大
    适用：JPG / PDF内嵌JPG提取后
    不适用：PNG（无损格式，ELA无效）
    """
    suffix = Path(file_path).suffix.lower()
    is_pdf = suffix == ".pdf"
    is_jpg = suffix in (".jpg", ".jpeg")
    is_png = suffix == ".png"

    if is_png:
        return ForgeryCheck("ELA错误级别分析", "skipped",
                            "PNG为无损格式，ELA对其无效（无压缩历史差异可检测）")

    # 提取图像
    if is_pdf:
        import fitz
        doc = fitz.open(file_path)
        page = doc[0]
        # 尝试提取页面内嵌图像
        img_list = page.get_images(full=True)
        if not img_list:
            doc.close()
            return ForgeryCheck("ELA错误级别分析", "skipped",
                                "PDF中未找到嵌入图像对象，无法做ELA分析")
        # 取最大的嵌入图像
        best = max(img_list, key=lambda x: x[2] * x[3] if len(x) > 3 else 0)
        xref = best[0]
        base_img = doc.extract_image(xref)
        doc.close()
        if base_img["ext"] not in ("jpeg", "jpg"):
            return ForgeryCheck("ELA错误级别分析", "skipped",
                                f"PDF内嵌图像为{base_img['ext'].upper()}格式（非JPEG），ELA无效")
        orig = Image.open(io.BytesIO(base_img["image"])).convert("RGB")
    else:
        orig = Image.open(file_path).convert("RGB")

    # 重新以低质量保存再读回
    buf = io.BytesIO()
    orig.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    recompressed = Image.open(buf).convert("RGB")

    # 计算误差，放大10倍可视化
    ela_arr = np.abs(np.array(orig, dtype=int) - np.array(recompressed, dtype=int))
    ela_arr = np.clip(ela_arr * 10, 0, 255).astype(np.uint8)
    ela_img = Image.fromarray(ela_arr)

    # 判断：印章区域（红色）的ELA值是否显著高于背景
    # 转HSV找红色区域
    orig_cv = pil_to_cv2(orig)
    hsv = cv2.cvtColor(orig_cv, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, np.array([0,70,70]),   np.array([10,255,255]))
    m2 = cv2.inRange(hsv, np.array([160,70,70]), np.array([180,255,255]))
    red_mask = cv2.bitwise_or(m1, m2)

    ela_gray = np.array(ela_img.convert("L"))
    seal_ela  = ela_gray[red_mask > 0].mean() if red_mask.sum() > 0 else 0
    bg_ela    = ela_gray[red_mask == 0].mean()
    ratio     = seal_ela / (bg_ela + 1e-6)

    if red_mask.sum() == 0:
        status = "skipped"
        detail = "未在图像中检测到红色印章区域，无法定向ELA分析"
    elif ratio > 2.5:
        status = "suspicious"
        detail = (f"印章区域ELA误差均值({seal_ela:.1f})显著高于背景({bg_ela:.1f})，"
                  f"比值{ratio:.1f}x（阈值2.5x）→ 疑似后期粘贴")
    else:
        status = "ok"
        detail = (f"印章区域ELA误差({seal_ela:.1f})与背景({bg_ela:.1f})比值{ratio:.1f}x，"
                  f"在正常范围内")

    return ForgeryCheck("ELA错误级别分析", status, detail, ela_img)


def check_pdf_metadata(file_path: str) -> ForgeryCheck:
    """检查PDF元数据：创建工具、修改历史、可疑软件痕迹"""
    if Path(file_path).suffix.lower() != ".pdf":
        return ForgeryCheck("PDF元数据分析", "skipped",
                            "非PDF文件，跳过元数据检查")
    import fitz
    doc = fitz.open(file_path)
    meta = doc.metadata
    doc.close()

    suspicious_tools = ["photoshop", "gimp", "illustrator", "inkscape",
                        "acrobat", "nitro", "foxit", "pdfedit"]
    findings = []
    creator  = (meta.get("creator",  "") or "").lower()
    producer = (meta.get("producer", "") or "").lower()

    for tool in suspicious_tools:
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
    检查PDF图层结构：
    真实盖章 → 印章油墨与文字在同一内容流中
    PS合成   → 印章通常是独立的图像对象（XObject），浮于文字之上
    """
    if Path(file_path).suffix.lower() != ".pdf":
        return ForgeryCheck("PDF图层结构分析", "skipped", "非PDF文件")

    import fitz
    doc  = fitz.open(file_path)
    page = doc[0]

    # 获取页面中所有图像对象
    img_list = page.get_images(full=True)
    # 获取页面文字块
    text_blocks = page.get_text("blocks")
    doc.close()

    n_imgs = len(img_list)
    n_text = len(text_blocks)

    if n_imgs == 0:
        return ForgeryCheck("PDF图层结构分析", "ok",
                            f"页面无独立图像对象，文字块{n_text}个 → 印章为原生内容流（正常）")

    # 如果图像数量异常多，可疑
    if n_imgs >= 3:
        return ForgeryCheck("PDF图层结构分析", "suspicious",
                            f"页面含{n_imgs}个独立图像对象（阈值3）→ 疑似合成文件，"
                            f"印章可能为后期插入的图像层")

    return ForgeryCheck("PDF图层结构分析", "ok",
                        f"页面含{n_imgs}个图像对象，{n_text}个文字块，结构正常")


def check_noise_consistency(img_cv: np.ndarray, file_path: str) -> ForgeryCheck:
    """
    噪点一致性检测：
    真实扫描件 → 全图噪点分布均匀
    PS粘贴章   → 印章区域噪点模式与背景不同（来自不同来源）
    """
    suffix = Path(file_path).suffix.lower()
    # PNG通常是数字生成，噪点分析意义不大
    if suffix == ".png":
        # 仍然做，但降低判断敏感度
        threshold = 3.0
        note = "（PNG数字文件，阈值宽松）"
    else:
        threshold = 1.8
        note = ""

    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY).astype(float)

    # 高通滤波提取噪点层
    blur   = cv2.GaussianBlur(gray, (5,5), 0)
    noise  = np.abs(gray - blur)

    # 找红色印章区域
    hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, np.array([0,70,70]),   np.array([10,255,255]))
    m2 = cv2.inRange(hsv, np.array([160,70,70]), np.array([180,255,255]))
    red_mask = cv2.bitwise_or(m1, m2)

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
    elif ratio < 1/threshold:
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
    边缘锐利度检测：
    真实盖章 → 油墨自然扩散，边缘有随机模糊（Laplacian方差较低）
    数字打印/PS → 边缘过于锐利（Laplacian方差高）
    """
    hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, np.array([0,70,70]),   np.array([10,255,255]))
    m2 = cv2.inRange(hsv, np.array([160,70,70]), np.array([180,255,255]))
    red_mask = cv2.bitwise_or(m1, m2)

    if red_mask.sum() < 500:
        return ForgeryCheck("印章边缘锐利度", "skipped",
                            "未检测到足够的红色印章区域")

    gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)

    # 只在印章边缘区域（膨胀-腐蚀=边缘带）计算
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9,9))
    dilated = cv2.dilate(red_mask, kernel)
    eroded  = cv2.erode(red_mask, kernel)
    edge_band = cv2.bitwise_xor(dilated, eroded)

    lap = cv2.Laplacian(gray, cv2.CV_64F)
    edge_sharpness = np.abs(lap)[edge_band > 0].mean()

    # 经验阈值：真实盖章<8，数字打印>15
    if edge_sharpness > 15:
        status = "suspicious"
        detail = (f"印章边缘锐利度{edge_sharpness:.1f}（阈值15）→ 边缘过于锐利，"
                  f"疑似数字打印或PS合成，缺乏真实盖章的油墨扩散特征")
    elif edge_sharpness < 2:
        status = "ok"
        detail = f"印章边缘锐利度{edge_sharpness:.1f}，边缘自然模糊，符合真实盖章特征"
    else:
        status = "ok"
        detail = f"印章边缘锐利度{edge_sharpness:.1f}，在正常范围内"

    return ForgeryCheck("印章边缘锐利度", status, detail)


def run_forgery_checks(file_path: str, img_cv: np.ndarray) -> list[ForgeryCheck]:
    """自动运行所有适用的检测，不适用的标注原因"""
    print("  🔎 运行文件真实性检测...")
    checks = []

    # 1. ELA
    c = check_ela(file_path)
    checks.append(c)
    print(f"    ELA: {c.status} — {c.detail[:60]}...")

    # 2. PDF元数据（仅PDF）
    c = check_pdf_metadata(file_path)
    checks.append(c)
    print(f"    元数据: {c.status} — {c.detail[:60]}...")

    # 3. PDF图层（仅PDF）
    c = check_pdf_layers(file_path)
    checks.append(c)
    print(f"    图层: {c.status} — {c.detail[:60]}...")

    # 4. 噪点一致性
    c = check_noise_consistency(img_cv, file_path)
    checks.append(c)
    print(f"    噪点: {c.status} — {c.detail[:60]}...")

    # 5. 边缘锐利度
    c = check_edge_sharpness(img_cv)
    checks.append(c)
    print(f"    边缘: {c.status} — {c.detail[:60]}...")

    return checks


# ─────────────────────────────────────────────────────────────
# 印章检测与比对（原有逻辑）
# ─────────────────────────────────────────────────────────────

def detect_seal(img: np.ndarray) -> tuple:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m1  = cv2.inRange(hsv, np.array([0,70,70]),   np.array([10,255,255]))
    m2  = cv2.inRange(hsv, np.array([160,70,70]), np.array([180,255,255]))
    red_mask = cv2.bitwise_or(m1, m2)
    kernel   = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15,15))
    red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_CLOSE, kernel)
    red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_OPEN,  kernel)

    contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        print("  ⚠️  未检测到红色印章，使用整图")
        return img, (0, 0, img.shape[1], img.shape[0]), False

    largest = max(contours, key=cv2.contourArea)
    area    = cv2.contourArea(largest)
    if area < 1000:
        print(f"  ⚠️  印章区域过小({area:.0f}px)，使用整图")
        return img, (0, 0, img.shape[1], img.shape[0]), False

    x, y, w, h = cv2.boundingRect(largest)
    pad = int(max(w, h) * 0.1)
    x   = max(0, x - pad);  y = max(0, y - pad)
    w   = min(img.shape[1] - x, w + 2*pad)
    h   = min(img.shape[0] - y, h + 2*pad)
    print(f"  ✅ 检测到印章 ({x},{y}) {w}×{h}px，面积{area:.0f}px²")
    return img[y:y+h, x:x+w], (x, y, w, h), True


def normalize_seal(seal_img: np.ndarray, size: int = 400) -> np.ndarray:
    h, w   = seal_img.shape[:2]
    scale  = size / max(h, w)
    new_w, new_h = int(w*scale), int(h*scale)
    resized = cv2.resize(seal_img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    canvas  = np.ones((size, size, 3), dtype=np.uint8) * 255
    y_off   = (size - new_h) // 2;  x_off = (size - new_w) // 2
    canvas[y_off:y_off+new_h, x_off:x_off+new_w] = resized
    return canvas


def align_seals(seal_q: np.ndarray, seal_r: np.ndarray) -> np.ndarray:
    gray_q = cv2.cvtColor(seal_q, cv2.COLOR_BGR2GRAY)
    gray_r = cv2.cvtColor(seal_r, cv2.COLOR_BGR2GRAY)
    orb    = cv2.ORB_create(1000)
    kp1, des1 = orb.detectAndCompute(gray_q, None)
    kp2, des2 = orb.detectAndCompute(gray_r, None)
    if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
        print("  ⚠️  特征点不足，跳过配准")
        return seal_q
    bf      = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = sorted(bf.match(des1, des2), key=lambda x: x.distance)[:50]
    if len(matches) < 4:
        print("  ⚠️  匹配点不足，跳过配准")
        return seal_q
    src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1,1,2)
    dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1,1,2)
    M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
    if M is None:
        return seal_q
    h, w = seal_r.shape[:2]
    aligned = cv2.warpPerspective(seal_q, M, (w, h),
                                  flags=cv2.INTER_LANCZOS4,
                                  borderMode=cv2.BORDER_CONSTANT,
                                  borderValue=(255,255,255))
    print(f"  ✅ 配准完成，使用{sum(mask.ravel())}个匹配点")
    return aligned


def analyze_difference(seal_q: np.ndarray, seal_r: np.ndarray) -> dict:
    gray_q = cv2.cvtColor(seal_q, cv2.COLOR_BGR2GRAY)
    gray_r = cv2.cvtColor(seal_r, cv2.COLOR_BGR2GRAY)
    score, diff = ssim(gray_r, gray_q, full=True)
    diff        = (diff * 255).astype(np.uint8)
    heatmap     = cv2.applyColorMap(255 - diff, cv2.COLORMAP_JET)

    overlay = np.zeros_like(seal_r)
    overlay[:,:,0] = gray_q
    overlay[:,:,2] = gray_r
    overlay[:,:,1] = np.minimum(gray_q, gray_r)

    _, diff_thresh  = cv2.threshold(255-diff, 50, 255, cv2.THRESH_BINARY)
    diff_contours,_ = cv2.findContours(diff_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    overlay_marked  = overlay.copy()
    cv2.drawContours(overlay_marked, diff_contours, -1, (0,255,255), 2)

    diff_ratio = np.sum(diff_thresh > 0) / diff_thresh.size

    def red_mask(hsv):
        return cv2.bitwise_or(
            cv2.inRange(hsv, np.array([0,70,70]),   np.array([10,255,255])),
            cv2.inRange(hsv, np.array([160,70,70]), np.array([180,255,255])))

    rq = red_mask(cv2.cvtColor(seal_q, cv2.COLOR_BGR2HSV))
    rr = red_mask(cv2.cvtColor(seal_r, cv2.COLOR_BGR2HSV))
    ov = np.sum((rq>0)&(rr>0));  un = np.sum((rq>0)|(rr>0))
    red_iou = ov/un if un > 0 else 0

    # 检测尺寸比差异（两章面积悬殊时警告）
    area_q = np.sum(rq > 0);  area_r = np.sum(rr > 0)
    area_ratio = max(area_q, area_r) / (min(area_q, area_r) + 1)
    if area_ratio > 3:
        print(f"  ⚠️  两章印章区域面积比{area_ratio:.1f}x（阈值3x），检测结果可能不可靠，请人工确认")

    print(f"  📊 SSIM={score:.4f}  差异像素={diff_ratio:.2%}  红色IoU={red_iou:.4f}")
    return dict(ssim=float(score), diff_ratio=float(diff_ratio),
                red_iou=float(red_iou), diff_img=diff,
                heatmap=heatmap, overlay=overlay_marked,
                area_ratio=float(area_ratio))


def judge_authenticity(metrics: dict) -> dict:
    s = metrics["ssim"] * 0.5 + metrics["red_iou"] * 0.3 + (1-metrics["diff_ratio"]) * 0.2
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
    if not reasons:
        reasons.append("各项指标均在正常范围内")

    return dict(score=s, verdict=verdict, level=level, color=color, icon=icon, reasons=reasons)


def ai_analysis(seal_q, seal_r, overlay) -> str:
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
            messages=[{"role":"user","content":[
                {"type":"text","text":"你是印章鉴定专家。对比三张图（检材章、样本章、叠加图），从字体笔画、边框粗细、颜色深浅、整体形状、伪造迹象五个维度分析，150字以内给出结论。"},
                {"type":"image","source":{"type":"base64","media_type":"image/png","data":b64(seal_q)}},
                {"type":"image","source":{"type":"base64","media_type":"image/png","data":b64(seal_r)}},
                {"type":"image","source":{"type":"base64","media_type":"image/png","data":b64(overlay)}},
            ]}]
        )
        return resp.content[0].text
    except Exception as e:
        return f"（AI分析失败: {e}）"


# ─────────────────────────────────────────────────────────────
# HTML 报告
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
<title>印章鉴定报告</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#f0f2f5;color:#2c3e50}}

.header{{background:linear-gradient(135deg,#1a1a2e,#0f3460);color:white;padding:28px 40px;
         display:flex;justify-content:space-between;align-items:center}}
.header h1{{font-size:22px;letter-spacing:2px}}
.header .meta{{font-size:12px;opacity:.7;text-align:right;line-height:1.8}}

.verdict{{background:{verdict_color};color:white;padding:14px 40px;
          display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700}}
.verdict-score{{margin-left:auto;font-size:14px;font-weight:400;
               background:rgba(255,255,255,.2);padding:4px 14px;border-radius:20px}}

.main{{display:grid;grid-template-columns:1fr 1.3fr;gap:20px;padding:20px 40px}}
.panel{{background:white;border-radius:10px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.07)}}
.ptitle{{font-size:12px;font-weight:700;color:#7f8c8d;text-transform:uppercase;
         letter-spacing:1.5px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #ecf0f1}}

.seal-label{{font-size:11px;font-weight:700;color:white;display:inline-block;
             padding:2px 8px;border-radius:3px;margin-bottom:6px}}
.seal-img{{width:100%;border-radius:6px;border:1px solid #ecf0f1;display:block;margin-bottom:12px}}

.metrics{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}}
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

/* 文件真实性检测区块 */
.check-row{{padding:10px 0;border-bottom:1px solid #f0f0f0}}
.check-row:last-child{{border-bottom:none}}
.check-header{{display:flex;align-items:center;gap:8px;margin-bottom:4px}}
.check-badge{{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;color:white}}
.check-name{{font-size:13px;font-weight:600}}
.check-detail{{font-size:12px;color:#666;line-height:1.6;padding-left:2px}}

.disclaimer{{text-align:center;padding:14px;font-size:11px;color:#bdc3c7}}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>🔍 印章真伪鉴定报告</h1>
    <div style="font-size:12px;opacity:.6;margin-top:4px">Seal Authenticity Verification</div>
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
  <!-- 左：印章对比 -->
  <div class="panel">
    <div class="ptitle">印章样本对比</div>
    <span class="seal-label" style="background:#e74c3c">检材（待鉴定）</span>
    <img class="seal-img" src="{query_img}">
    <span class="seal-label" style="background:#2980b9">样本（真实参考）</span>
    <img class="seal-img" src="{ref_img}">
    <div style="margin-top:14px">
      <div class="ptitle">量化指标</div>
      <div class="metrics">
        <div class="metric"><div class="mv" style="color:{ssim_color}">{ssim:.3f}</div><div class="ml">SSIM 结构相似度</div></div>
        <div class="metric"><div class="mv" style="color:{iou_color}">{red_iou:.3f}</div><div class="ml">红色区域 IoU</div></div>
        <div class="metric"><div class="mv" style="color:{diff_color}">{diff_ratio:.1%}</div><div class="ml">差异像素比例</div></div>
      </div>
    </div>
  </div>

  <!-- 右：叠加对比 -->
  <div class="panel">
    <div class="ptitle">叠加差异对比</div>
    <img class="seal-img" src="{overlay_img}">
    <div class="legend">
      <div class="ld"><div class="dot" style="background:#f44"></div><span>仅检材有</span></div>
      <div class="ld"><div class="dot" style="background:#44f"></div><span>仅样本有</span></div>
      <div class="ld"><div class="dot" style="background:#fff;border:1px solid #ddd"></div><span>吻合</span></div>
      <div class="ld"><div class="dot" style="background:#0ff"></div><span>差异轮廓</span></div>
    </div>
    <div style="margin-top:14px">
      <div class="ptitle">差异热图</div>
      <img class="seal-img" src="{heatmap_img}">
    </div>
  </div>
</div>

<div class="footer">

  <!-- 印章比对分析 -->
  <div class="abox">
    <div class="ptitle">比对分析</div>
    <div>{reason_items}</div>
    {ai_section}
  </div>

  <!-- 文件真实性检测 -->
  <div class="abox">
    <div class="ptitle">文件真实性检测（PS / 抠图痕迹）</div>
    {forgery_checks_html}
  </div>

</div>

<div class="disclaimer">本报告由自动化图像分析生成，仅供参考，法律鉴定须委托专业机构出具。</div>
</body>
</html>"""


def generate_report(seal_q, seal_r, metrics, judgment, ai_text,
                    forgery_checks, query_name, ref_name, output_path):
    def c(val, hi=True, w=.75, b=.60):
        if hi:  return "#2ecc71" if val>=w else ("#f39c12" if val>=b else "#e74c3c")
        else:   return "#2ecc71" if val<=(1-w) else ("#f39c12" if val<=(1-b) else "#e74c3c")

    reason_html = "\n".join(
        f'<div class="reason-item"><span>{"✅" if len(judgment["reasons"])==1 and i==0 else "⚠️"}</span><span>{r}</span></div>'
        for i,r in enumerate(judgment["reasons"]))

    ai_html = (f'<div class="ptitle" style="margin-top:14px">AI 专家分析</div>'
               f'<div class="ai-text">{ai_text}</div>') if ai_text else ""

    html = HTML_TEMPLATE.format(
        query_name=query_name, ref_name=ref_name,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        verdict_color=judgment["color"], verdict_icon=judgment["icon"],
        verdict=judgment["verdict"],     verdict_level=judgment["level"],
        verdict_score=judgment["score"],
        query_img=img_to_data_url(seal_q), ref_img=img_to_data_url(seal_r),
        overlay_img=img_to_data_url(metrics["overlay"]),
        heatmap_img=img_to_data_url(metrics["heatmap"]),
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
    parser = argparse.ArgumentParser(description="印章真伪鉴定")
    parser.add_argument("query",  help="检材文件（jpg/png/pdf）")
    parser.add_argument("ref",    help="样本文件（jpg/png/pdf）")
    parser.add_argument("--output", default="seal_report.html")
    args = parser.parse_args()

    print("\n" + "="*52)
    print("  🔍 印章真伪鉴定系统 v2")
    print("="*52)

    print("\n[1/7] 加载文件...")
    img_q = load_image(args.query)
    img_r = load_image(args.ref)

    print("\n[2/7] 文件真实性检测（检材）...")
    forgery_checks = run_forgery_checks(args.query, img_q)

    print("\n[3/7] 检测印章区域...")
    seal_q_raw, _, _ = detect_seal(img_q)
    seal_r_raw, _, _ = detect_seal(img_r)

    print("\n[4/7] 归一化...")
    seal_q = normalize_seal(seal_q_raw)
    seal_r = normalize_seal(seal_r_raw)

    print("\n[5/7] 图像配准...")
    seal_q_aligned = align_seals(seal_q, seal_r)

    print("\n[6/7] 差异分析...")
    metrics  = analyze_difference(seal_q_aligned, seal_r)
    judgment = judge_authenticity(metrics)

    print("\n[7/7] AI分析 + 生成报告...")
    ai_text = ai_analysis(seal_q_aligned, seal_r, metrics["overlay"])
    if not ai_text:
        print("  ⏭  未设置ANTHROPIC_API_KEY，跳过AI分析")

    generate_report(
        seal_q=seal_q_aligned, seal_r=seal_r,
        metrics=metrics, judgment=judgment, ai_text=ai_text,
        forgery_checks=forgery_checks,
        query_name=Path(args.query).name,
        ref_name=Path(args.ref).name,
        output_path=args.output,
    )

    # 文件真实性汇总
    suspicious_checks = [c for c in forgery_checks if c.status == "suspicious"]

    print("\n" + "="*52)
    print(f"  {judgment['icon']} 印章比对：{judgment['verdict']}（{judgment['level']}）")
    print(f"  📊 综合评分：{judgment['score']:.1%}")
    if suspicious_checks:
        print(f"  🚨 文件真实性：{len(suspicious_checks)}项可疑")
        for c in suspicious_checks:
            print(f"     • {c.name}")
    else:
        print(f"  ✅ 文件真实性：无明显PS/抠图痕迹")
    print(f"  📄 报告：{args.output}")
    print("="*52 + "\n")


if __name__ == "__main__":
    main()