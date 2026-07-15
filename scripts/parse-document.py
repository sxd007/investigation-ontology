#!/usr/bin/env python3
# ⚠️ DEPRECATED — 此脚本已废弃，由 document-parsing SKILL.md 替代。不再维护。
# 替代方案：document-parsing skill 直接调用 OCR MCP (pp_structurev3) 或 AI 直接读取。
# 详见 docs/document-parsing-design.md 第 8-9 节。
"""
parse-document.py — 文档结构化解析 Pipeline（已废弃）
=============================================

定位：可选加速器。当 OCR 服务已配置时自动运行；未配置时正常退出，由 document-parsing skill 的 AI 接手。

架构：
  parse-document.py (编排)
       │
       ├── ocr_client.py (OCR 调用 + 路由感知 + 后处理校验)
       │       └── 内部 OCR 服务 (10.40.86.102:8086)
       │
       ├── 文档类型 schema (schemas/document-types/*.yaml)
       ├── 版本管理 (raw/parsed/*_v{N}.json)
       └── team-profile.md (OCR 配置)

依赖：
  - Python 3.8+
  - PyYAML（读取 schema）
  - requests（调用 OCR 服务，由 ocr_client.py 管理）

用法：
  python parse-document.py raw/ev-010_invoice.pdf
  python parse-document.py raw/ev-011_contract.pdf --type CONTRACT
  python parse-document.py raw/ev-012_receipt.jpg --output-dir raw/parsed/

输出：
  raw/parsed/{TYPE}-{raw_id}_v{version}.json
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Windows 控制台 UTF-8 输出
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── 插件根目录 ──
_SCRIPT_DIR = Path(__file__).resolve().parent


def find_plugin_root() -> Path:
    """从脚本位置向上查找插件根目录"""
    for parent in [_SCRIPT_DIR] + list(_SCRIPT_DIR.parents):
        if (parent / "skills" / "document-parsing" / "SKILL.md").exists():
            return parent
    return _SCRIPT_DIR.parent


# ── 集成现有 OCR 客户端 ──
# ocr_client.py 在工作区根目录，比插件根目录高一级
sys.path.insert(0, str(find_plugin_root().parent))
try:
    from ocr_client import (
        ocr_and_validate,
        preflight_check,
        parse_route_summary,
        infer_doc_type as ocr_infer_doc_type,
        mock_ocr_result,
        Config as OCRConfig,
    )
    HAS_OCR_CLIENT = True
except ImportError:
    HAS_OCR_CLIENT = False


def load_ocr_config(plugin_root: Path) -> dict:
    """
    从 team-profile.md 读取 OCR 配置。
    ocr_client.py 已通过环境变量 OCR_HOST/OCR_PORT/OCR_API_KEY 配置，
    本函数检查环境变量是否已设置，以及 team-profile.md 中有无覆盖值。
    """
    config = {
        "configured": False,
        "source": "none",
        "host": None,
        "port": None,
        "api_key": None,
    }

    # 方式 1: 环境变量（最优先）
    if os.environ.get("OCR_HOST") and os.environ.get("OCR_PORT"):
        config["configured"] = True
        config["source"] = "env"
        config["host"] = os.environ.get("OCR_HOST")
        config["port"] = int(os.environ.get("OCR_PORT"))
        config["api_key"] = os.environ.get("OCR_API_KEY", "")
        return config

    # 方式 2: team-profile.md
    config_candidates = [
        Path.home() / ".claude" / "plugins" / "config" / "cc-investigation" / "team-profile.md",
        Path.home() / ".codebuddy" / "plugins" / "config" / "efio" / "team-profile.md",
        Path.home() / ".codex" / "plugins" / "config" / "efio" / "team-profile.md",
        Path.home() / ".investigation-ontology" / "config" / "team-profile.md",
    ]

    for profile_path in config_candidates:
        if profile_path.exists():
            text = profile_path.read_text(encoding="utf-8")
            section_match = re.search(
                r"## 文档解析服务.*?(?=## |\Z)", text, re.DOTALL
            )
            if section_match:
                section = section_match.group()
                # 检查是否配置了 HTTP API
                ep_match = re.search(r"\|\s*ocr_http_endpoint\s*\|\s*(\S+)\s*\|", section)
                key_match = re.search(r"\|\s*ocr_http_key\s*\|\s*(\S+)\s*\|", section)
                if ep_match and ep_match.group(1) not in ("[PLACEHOLDER]", ""):
                    config["configured"] = True
                    config["source"] = "team-profile"
                    config["endpoint"] = ep_match.group(1)
                    config["api_key"] = key_match.group(1) if key_match else ""
                    return config

    # 方式 3: ocr_client.py 内置默认配置（HOST=10.40.86.102, PORT=8086）
    if HAS_OCR_CLIENT:
        config["configured"] = True
        config["source"] = "ocr_client_default"
        config["host"] = OCRConfig.HOST
        config["port"] = OCRConfig.PORT
        config["api_key"] = OCRConfig.API_KEY
        return config

    return config


# =============================================================================
# 文档类型识别
# =============================================================================

# 文档类型 enum → 中文类型映射（用于 ocr_client.py）
DOC_TYPE_MAP = {
    "INVOICE": "发票",
    "CONTRACT": "合同",
    "BANK_RECEIPT": "银行回单",
    "DELIVERY_NOTE": "签收单",
    "PURCHASE_ORDER": "采购订单",
}

# 文件名关键词 → 文档类型 enum
DOC_TYPE_KEYWORDS = {
    "INVOICE": ["发票", "invoice", "INV", "fapiao"],
    "CONTRACT": ["合同", "contract", "协议", "agreement", "HT"],
    "BANK_RECEIPT": ["回单", "流水", "付款凭证", "转账", "bank", "receipt"],
    "DELIVERY_NOTE": ["签收", "送货", "发货", "收货", "运单", "waybill", "delivery"],
    "PURCHASE_ORDER": ["订单", "采购", "PO", "purchase", "请购", "申购"],
}


def resolve_document_type(raw_path: str, type_hint: Optional[str] = None) -> str:
    """确定文档类型。优先级：指定类型 > 文件名关键词 > AI 推断 > GENERIC"""
    if type_hint and type_hint.upper() in DOC_TYPE_MAP:
        return type_hint.upper()

    filename = Path(raw_path).name
    for doc_type, keywords in DOC_TYPE_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in filename.lower():
                return doc_type

    # 尝试用 ocr_client 的推断（基于文件名）
    if HAS_OCR_CLIENT:
        cn_type = ocr_infer_doc_type(raw_path)
        if cn_type:
            reverse_map = {v: k for k, v in DOC_TYPE_MAP.items()}
            if cn_type in reverse_map:
                return reverse_map[cn_type]

    return "GENERIC"


# =============================================================================
# Schema 加载与校验
# =============================================================================

def load_schema(plugin_root: Path, doc_type: str) -> Optional[dict]:
    """加载文档类型的 schema 定义"""
    schema_filename = f"{doc_type.lower()}.yaml"
    schema_path = plugin_root / "schemas" / "document-types" / schema_filename
    if not schema_path.exists():
        schema_path = plugin_root / "schemas" / "document-types" / "generic.yaml"

    try:
        import yaml
        with open(schema_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except ImportError:
        print("  ⚠ PyYAML 未安装，跳过 schema 校验", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  ⚠ 读取 schema 失败: {e}", file=sys.stderr)
        return None


def get_required_field_names(schema: dict) -> list:
    """从 schema 提取必填字段名列表"""
    required = []
    for field in schema.get("fields", []):
        if field.get("required"):
            required.append(field["name"])
    # parties 和 sections 是顶层结构
    if "parties" in schema:
        required.append("parties")
    return required


def validate_parsed(parsed: dict, schema: Optional[dict]) -> list:
    """校验 parsed 数据是否符合 schema。返回非阻断警告列表。"""
    warnings = []
    if not schema:
        return warnings

    required_fields = get_required_field_names(schema)
    for field_name in required_fields:
        value = parsed.get("fields", {}).get(field_name, {}).get("value")
        if value is None or value == "" or value == []:
            warnings.append(f"必填字段缺失: {field_name}")

    return warnings


# =============================================================================
# 版本管理
# =============================================================================

def compute_raw_id(raw_path: str) -> str:
    """从 raw 路径提取文件 ID（不含扩展名）"""
    return Path(raw_path).stem


def get_existing_versions(output_dir: str, doc_type: str, raw_id: str) -> list:
    """列出已有的 parsed 版本"""
    output_path = Path(output_dir)
    if not output_path.exists():
        return []
    pattern = re.compile(rf"{re.escape(doc_type)}-{re.escape(raw_id)}_v(\d+)\.json$")
    versions = []
    for f in output_path.iterdir():
        m = pattern.match(f.name)
        if m:
            versions.append((int(m.group(1)), f.name))
    return [v[1] for v in sorted(versions)]


def get_next_version(output_dir: str, doc_type: str, raw_id: str) -> int:
    """确定下一个版本号"""
    existing = get_existing_versions(output_dir, doc_type, raw_id)
    if not existing:
        return 1
    latest = existing[-1]
    m = re.search(r"_v(\d+)\.json$", latest)
    return int(m.group(1)) + 1 if m else 1


def get_supersedes_id(output_dir: str, doc_type: str, raw_id: str, version: int) -> Optional[str]:
    """如果存在旧版本，返回被替代的版本 ID"""
    if version > 1:
        return f"PARSE-{doc_type}-{raw_id}-v{version - 1}"
    return None


# =============================================================================
# OCR 后端
# =============================================================================

def run_ocr(raw_path: str, doc_type: str, config: dict) -> dict:
    """
    调用 ocr_client.py 执行 OCR + 后处理校验。

    返回：
    {
        "pages": [...],          # 逐页 OCR 结果
        "route_info": {...},     # 路由摘要（VLM 风险页）
        "validation": {...},     # 文档类型后处理校验
        "raw_text": "...",       # 全文拼接
    }
    """
    if not HAS_OCR_CLIENT:
        print("  ⚠ ocr_client.py 不可用（未找到或 import 失败）")
        print("  → 将由 document-parsing skill 的 AI 视觉能力完成解析")
        return {"pages": [], "raw_text": "", "route_info": {}, "validation": None}

    # 确定中文文档类型（传给 ocr_client 的后处理）
    cn_type = DOC_TYPE_MAP.get(doc_type, "发票")  # 默认发票
    print(f"  [OCR] 调用服务端: {OCRConfig.BASE_URL}")
    print(f"  [OCR] 文档类型: {cn_type}")

    # 一站式 OCR + 路由感知 + 后处理校验
    result = ocr_and_validate(
        file_path=raw_path,
        force_vlm=False,      # 让服务端自动路由分流
        doc_type=cn_type,
        show_progress=True,
    )

    # 从 pages 提取全文和结构化数据
    pages = result.get("ocr_result", {}).get("data", {}).get("pages", [])

    # 提取全文（优先用 markdown，有更丰富的结构信息；fallback 到 text）
    raw_text = "\n".join(
        p.get("markdown") or p.get("text", "") for p in pages
    )

    # 收集 elements（结构化表格等）
    all_elements = []
    for p in pages:
        elems = p.get("elements")
        if elems:
            for e in elems:
                e["_page"] = p.get("page", 0)
                all_elements.append(e)

    # 收集 layout_blocks（版面分析结果）
    all_layout_blocks = []
    for p in pages:
        lbs = p.get("layout_blocks")
        if lbs:
            page_num = p.get("page", 0)
            for lb in lbs:
                lb["_page"] = page_num
                all_layout_blocks.append(lb)

    # 解析 HTML 表格为结构化数据
    tables = []
    for e in all_elements:
        if e.get("type") == "table":
            parsed_table = _parse_html_table(e)
            if parsed_table:
                tables.append(parsed_table)

    # 保存原始 OCR 响应到 companion 文件
    original_output_path = Path(raw_path).parent / "parsed" / f"{Path(raw_path).stem}.original.json"
    try:
        original_output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(original_output_path, "w", encoding="utf-8") as f:
            json.dump(result.get("ocr_result", {}), f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"  ⚠ 保存原始OCR响应失败: {e}", file=sys.stderr)

    return {
        "pages": pages,
        "original_path": str(original_output_path),
        "route_info": result.get("route_info", {}),
        "validation": result.get("validation", {}),
        "raw_text": raw_text,
        "elements": all_elements,
        "layout_blocks": all_layout_blocks,
        "tables": tables,
    }


# =============================================================================
# HTML 表格解析
# =============================================================================

def _parse_html_table(element: dict) -> Optional[dict]:
    """
    从 elements 的 content.html 中解析表格数据。
    返回结构化 { headers, rows, bbox, page }。
    """
    import html.parser

    html_content = element.get("content", {}).get("html", "")
    if not html_content:
        return None

    class TableParser(html.parser.HTMLParser):
        def __init__(self):
            super().__init__()
            self.in_td = False
            self.in_th = False
            self.current_row = []
            self.current_cell = ""
            self.rows = []
            self.headers = []
            self.in_header = False

        def handle_starttag(self, tag, attrs):
            if tag == "tr":
                self.current_row = []
            elif tag == "td":
                self.in_td = True
                self.current_cell = ""
            elif tag == "th":
                self.in_th = True
                self.in_header = True
                self.current_cell = ""

        def handle_endtag(self, tag):
            if tag == "td":
                self.in_td = False
                self.current_row.append(self.current_cell.strip())
            elif tag == "th":
                self.in_th = False
                self.current_row.append(self.current_cell.strip())
            elif tag == "tr":
                if self.current_row:
                    if self.in_header and not self.headers:
                        self.headers = self.current_row
                        self.in_header = False
                    else:
                        self.rows.append(self.current_row)
                    self.current_row = []

        def handle_data(self, data):
            if self.in_td or self.in_th:
                self.current_cell += data

    parser = TableParser()
    try:
        parser.feed(html_content)
    except Exception:
        return None

    # 如果第一行看起来像表头（所有单元格无数字特征），作为 headers
    rows = parser.rows
    headers = parser.headers

    # 没有显式 th 时，尝试从第一行推断表头
    if not headers and rows:
        first_row = rows[0]
        # 如果第一行至少有一个非数字单元格，视为表头行
        has_text = any(not cell.replace(".", "").replace(",", "").isdigit()
                       for cell in first_row if cell)
        if has_text:
            headers = first_row
            rows = rows[1:]

    bbox = element.get("bbox", [])
    return {
        "table_id": element.get("id", ""),
        "page": element.get("_page", 0),
        "bbox": [round(b, 2) for b in bbox] if bbox else None,
        "headers": headers,
        "rows": rows,
        "row_count": len(rows),
    }


# =============================================================================
# 字段提取（按文档类型）
# =============================================================================

# =============================================================================
# Schema-aware 字段提取（取代旧的 regex 提取函数）
# =============================================================================

CONTRACT_SECTION_KEYWORDS = {
    "subject": ["合同标的", "项目内容", "服务范围", "采购内容"],
    "price_payment": ["价格及支付", "付款方式", "费用与支付", "合同价款"],
    "delivery_acceptance": ["交付", "验收", "交货", "安装调试", "运输"],
    "quality": ["质量标准", "质保", "售后", "质量保证"],
    "penalty": ["违约", "违约责任", "赔偿"],
    "dispute": ["争议", "管辖", "仲裁", "诉讼"],
    "confidentiality": ["保密", "商业秘密", "机密"],
    "term": ["期限", "有效期", "生效", "合同期限"],
    "termination": ["解除", "终止", "提前终止"],
    "force_majeure": ["不可抗力"],
    "intellectual_property": ["知识产权", "版权"],
    "non_compete": ["竞业限制", "排他"],
    "signature": ["签署", "签章", "签字", "盖章"],
    "notices": ["通知", "送达"],
}


def _extract_contract(text: str, validation: dict) -> dict:
    """从 OCR 全文按 CONTRACT schema 提取"""
    fields = {}
    parties = []
    sections = []
    missing_warnings = []

    # 合同编号
    m = re.search(r"合同编号[：:\s]*(\S+)", text)
    if m:
        fields["contract_no"] = {"value": m.group(1), "confidence": 0.90, "raw_text": m.group(0)}

    # 合同标题
    m = re.search(r"^(购销合同|采购合同|销售合同|买卖合同|服务合同|租赁合同|工程合同|施工合同|代理合同|经销合同|合作协议|劳务合同)", text, re.MULTILINE)
    if m:
        fields["contract_title"] = {"value": m.group(1), "confidence": 0.85, "raw_text": m.group(0)}

    # 合同类型
    title = fields.get("contract_title", {}).get("value", "")
    ct_map = {"购销":"purchase","采购":"purchase","销售":"sales","服务":"service",
              "租赁":"lease","工程":"construction","施工":"construction","代理":"agency","劳务":"labor"}
    for kw, ct in ct_map.items():
        if kw in title:
            fields["contract_type"] = {"value": ct, "confidence": 0.90, "raw_text": title}
            break

    # 金额
    m = re.search(r"合同总价[^，。]*?人民币\s*([\d,]+\.\d{2})", text)
    if not m:
        m = re.search(r"(?:合同金额|合同价款|总价)[^，。]*?([\d,]+\.\d{2})", text)
    if m:
        raw = m.group(1).replace(",", "")
        fields["contract_amount"] = {"value": float(raw), "confidence": 0.90, "raw_text": m.group(0)}
        fields["currency"] = {"value": "CNY", "confidence": 1.0}

    # 日期
    for kw, fname in [("签订日期","signing_date"),("生效日期","effective_date"),
                       ("有效期[至到]","expiry_date"),("合同期限","expiry_date")]:
        m = re.search(rf"{kw}[：:\s]*(\d{{4}}[年-]\d{{1,2}}[月-]\d{{1,2}})", text)
        if m:
            raw = m.group(1).replace("年","-").replace("月","-").replace("日","")
            fields[fname] = {"value": raw, "confidence": 0.85, "raw_text": m.group(0)}

    # 签约主体
    def extract_party(label, role_key):
        party = {"party_role": role_key}
        m = re.search(rf"(?:{label})[：:]\s*(\S+)", text)
        if m:
            party["name"] = m.group(1)
            fields[f"{role_key}_name"] = {"value": m.group(1), "confidence": 0.90, "raw_text": m.group(0)}
        elif validation and validation.get(f"party_{'a' if role_key=='party_a' else 'b'}"):
            party["name"] = validation[f"party_{'a' if role_key=='party_a' else 'b'}"]
        if role_key == "party_a":
            m = re.search(r"统一社会信用代码[：:]\s*(\w+)", text)
            if m: party["unified_social_credit_code"] = m.group(1)
            m = re.search(r"法定代表人[：:]\s*([\u4e00-\u9fff]{2,4})", text)
            if m: party["legal_representative"] = m.group(1)
            m = re.search(r"地址[：:]\s*([^\n]{5,60})", text)
            if m: party["address"] = m.group(1).strip()
            si = {}
            m = re.search(r"账号[：:]\s*(\d+)", text)
            if m: si["bank_account"] = m.group(1)
            m = re.search(r"开户行[：:]\s*(\S+)", text)
            if m: si["bank_name"] = m.group(1)
            if si: party["signing_info"] = si
        if "name" in party:
            parties.append(party)

    extract_party("买方|甲方|采购方", "party_a")
    extract_party("卖方|乙方|供应方", "party_b")

    # 正文条款
    sec_pat = re.compile(r"(第[一二三四五六七八九十]+条\s+\S+)")
    matches = list(sec_pat.finditer(text))
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        body = text[start:end].strip()
        section_id = "other_clause"
        for sid, kws in CONTRACT_SECTION_KEYWORDS.items():
            if any(kw in title for kw in kws):
                section_id = sid
                break
        sections.append({"section_id": section_id, "section_title": title, "content": body[:2000]})

    # 节缺失检测
    present = {s["section_id"] for s in sections}
    for sid, warning, severity in [
        ("subject","合同标的条款缺失","high"), ("price_payment","价格及支付条款缺失","high"),
        ("delivery_acceptance","交付验收条款缺失","medium"), ("penalty","违约责任条款缺失","high"),
        ("dispute","争议解决条款缺失","medium"), ("signature","签署页信息缺失","high")]:
        if sid not in present:
            missing_warnings.append({"missing_section_id": sid, "warning": warning, "severity": severity})

    return {"fields": fields, "parties": parties, "sections": sections,
            "missing_sections_warnings": missing_warnings}


def _extract_invoice(text: str, validation: dict) -> dict:
    """从 OCR 全文按 INVOICE schema 提取"""
    fields = {}
    m = re.search(r"(?:发票号码|发票代码|发票号)[：:\s]*(\w+)", text)
    if m: fields["invoice_no"] = {"value": m.group(1), "confidence": 0.90, "raw_text": m.group(0)}
    m = re.search(r"开票日期[：:\s]*(\d{4}年\d{1,2}月\d{1,2}日)", text)
    if m: fields["invoice_date"] = {"value": m.group(1).replace("年","-").replace("月","-").replace("日",""),
                                      "confidence": 0.90, "raw_text": m.group(0)}
    m = re.search(r"(?:价税合计|合计)[^\\d]*?([\d,]+\.\d{2})", text)
    if m: fields["total_amount"] = {"value": float(m.group(1).replace(",","")), "confidence": 0.85, "raw_text": m.group(0)}
    for prefix, fk in [("购买方|购方|买方","payer"),("销售方|销方|卖方","payee")]:
        m = re.search(rf"(?:{prefix})(?:名称|单位)[：:\s]*([^\n，,。；;]{{2,60}})", text)
        if m: fields[f"{fk}_name"] = {"value": m.group(1).strip(), "confidence": 0.85, "raw_text": m.group(0)}
        m2 = re.search(rf"(?:{prefix}).*?纳税人识别号[：:\s]*(\w+)", text, re.DOTALL)
        if m2: fields[f"{fk}_tax_id"] = {"value": m2.group(1), "confidence": 0.85}
    return {"fields": fields, "parties": [], "sections": [], "missing_sections_warnings": []}


def _extract_bank_receipt(text: str, validation: dict) -> dict:
    """从 OCR 全文按 BANK_RECEIPT schema 提取"""
    fields = {}
    m = re.search(r"(?:交易流水|流水号|凭证号)[：:\s]*(\w+)", text)
    if m: fields["transaction_no"] = {"value": m.group(1), "confidence": 0.90, "raw_text": m.group(0)}
    m = re.search(r"(?:交易金额|金额|合计)[：:\s]*[¥￥]?\s*([\d,]+\.?\d*)", text)
    if m: fields["amount"] = {"value": float(m.group(1).replace(",","")), "confidence": 0.90, "raw_text": m.group(0)}
    for label, key in [("付款人|付款方|汇款人","payer"),("收款人|收款方|收款","payee")]:
        m = re.search(rf"(?:{label})(?:名称|户名)[：:\s]*([^\n，,。；;]{{2,60}})", text)
        if m: fields[f"{key}_name"] = {"value": m.group(1).strip(), "confidence": 0.85, "raw_text": m.group(0)}
    m = re.search(r"(?:摘要|用途|附言)[：:\s]*([^\n]{1,200})", text)
    if m: fields["purpose"] = {"value": m.group(1).strip(), "confidence": 0.80, "raw_text": m.group(0)}
    return {"fields": fields, "parties": [], "sections": [], "missing_sections_warnings": []}


def _extract_delivery_note(text: str, validation: dict) -> dict:
    """从 OCR 全文按 DELIVERY_NOTE schema 提取"""
    fields = {}
    m = re.search(r"(?:收货[单位方]|收货人|签收[单位])[：:\s]*([^\n，,。；;]{2,60})", text)
    if m: fields["receiver_name"] = {"value": m.group(1).strip(), "confidence": 0.80, "raw_text": m.group(0)}
    m = re.search(r"(?:发货[单位方]|发货人|供应商)[：:\s]*([^\n，,。；;]{2,60})", text)
    if m: fields["shipper_name"] = {"value": m.group(1).strip(), "confidence": 0.80, "raw_text": m.group(0)}
    m = re.search(r"(?:签收日期|收货日期|日期)[：:\s]*(\d{4}年?\d{1,2}月?\d{1,2}日?)", text)
    if m: fields["receipt_date"] = {"value": m.group(1).replace("年","-").replace("月","-").replace("日",""),
                                      "confidence": 0.85, "raw_text": m.group(0)}
    m = re.search(r"(?:收货地址|交货地址|送达地址)[：:\s]*([^\n]{5,100})", text)
    if m: fields["delivery_address"] = {"value": m.group(1).strip(), "confidence": 0.75, "raw_text": m.group(0)}
    return {"fields": fields, "parties": [], "sections": [], "missing_sections_warnings": []}


SCHEMA_EXTRACTORS = {
    "CONTRACT": _extract_contract,
    "INVOICE": _extract_invoice,
    "BANK_RECEIPT": _extract_bank_receipt,
    "DELIVERY_NOTE": _extract_delivery_note,
}


def extract_by_schema(doc_type: str, text: str, validation: dict) -> dict:
    """按文档类型 schema 从 OCR 全文提取结构化数据"""
    extractor = SCHEMA_EXTRACTORS.get(doc_type)
    if not extractor or not text:
        return {"fields": {}, "parties": [], "sections": [], "missing_sections_warnings": []}
    return extractor(text, validation)


# =============================================================================
# Parsed 文件构建
# =============================================================================

def build_parsed_file(
    raw_path: str,
    doc_type: str,
    version: int,
    ocr_output: dict,
    config: dict,
    supersedes: Optional[str] = None,
) -> dict:
    """构建 parsed JSON 文件"""
    raw_id = compute_raw_id(raw_path)
    parsed_id = f"PARSE-{doc_type}-{raw_id}-v{version}"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # ── 按 Schema 提取结构化字段 ──
    # 废除旧的 regex 提取函数，改为统一的 schema-aware 提取
    full_text = ocr_output.get("raw_text", "")
    extraction = extract_by_schema(doc_type, full_text, ocr_output.get("validation"))
    fields = extraction.get("fields", {})
    parties = extraction.get("parties", [])
    contract_sections = extraction.get("sections", [])
    missing_warnings = extraction.get("missing_sections_warnings", [])

    # 路由信息（记录哪些页走了 VLM，有幻觉风险）
    route_info = ocr_output.get("route_info", {})
    vlm_pages = route_info.get("vlm_page_numbers", [])
    needs_review = route_info.get("has_vlm_risk", False) or (
        ocr_output.get("validation", {}) or {}
    ).get("needs_review", False)

    # 结构化表格（从 elements 解析）
    tables = ocr_output.get("tables", [])

    # 版面分析统计
    layout_blocks = ocr_output.get("layout_blocks", [])
    page_table_count = len([lb for lb in layout_blocks if lb.get("label") == "table"])
    page_seal_count = len([lb for lb in layout_blocks if lb.get("label") == "seal"])

    parsed = {
        "parsed_id": parsed_id,
        "document_type": doc_type,
        "source_raw": str(raw_path),
        "parsed_by": "pipeline",
        "parsed_status": "human_review_required" if needs_review else "full",
        "parsed_at": now,
        "parsed_from": config.get("source", "unknown"),
        "supersedes": supersedes,
        "superseded_by": None,
        "fields": fields,
        "parties": parties,
        "tables": tables,                   # ★ 结构化表格数据
        "ocr_full_text": ocr_output.get("raw_text", ""),
        "sections": contract_sections,
        "missing_sections_warnings": missing_warnings,
        "human_review": None,
        "meta": {
            "file_name": Path(raw_path).name,
            "ocr_route": route_info,
            "layout": {
                "total_blocks": len(layout_blocks),
                "table_blocks": page_table_count,
                "seal_blocks": page_seal_count,
            },
        },
    }

    return parsed


def write_parsed_file(parsed: dict, output_dir: str) -> Path:
    """写入 parsed JSON 到输出目录"""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    parsed_id = parsed["parsed_id"]
    filename = parsed_id.replace("PARSE-", "", 1) + ".json"
    filepath = output_path / filename

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)

    print(f"  → 已写入: {filepath}")
    return filepath


# =============================================================================
# 主流程
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="文档结构化解析 Pipeline — 将原始文档解析为结构化 parsed JSON"
    )
    parser.add_argument("raw_path", help="原始文档路径（PDF/图片）")
    parser.add_argument("--type", "-t", help="文档类型（INVOICE/CONTRACT/...），不指定则自动识别")
    parser.add_argument("--output-dir", "-o", default=None, help="输出目录（默认 raw/parsed/）")
    parser.add_argument("--force", "-f", action="store_true", help="强制重新解析（即使已有 parsed 文件）")
    parser.add_argument("--mock", action="store_true", help="使用 mock 数据测试（无需 OCR 服务端）")
    parser.add_argument("--review", "-r", action="store_true", help="解析完成后自动打开复核工具")

    args = parser.parse_args()

    # ── 前置检查 ──
    raw_path = Path(args.raw_path)
    if not raw_path.exists() and not args.mock:
        print(f"错误: 文件不存在: {raw_path}", file=sys.stderr)
        sys.exit(1)

    plugin_root = find_plugin_root()
    print(f"插件根目录: {plugin_root}")

    # ── 1. 加载 OCR 配置 ──
    print("\n[1/5] 加载 OCR 配置...")
    config = load_ocr_config(plugin_root)
    if not config.get("configured") and not args.mock:
        print("  ⚠ 未检测到可用的 OCR 服务。")
        print("  → 将由 document-parsing skill 的 AI 视觉能力完成解析。")
        print("  → 提示: 设置 OCR_HOST/OCR_PORT 环境变量，或配置 team-profile.md 中 ocr_* 项。")
        sys.exit(0)

    print(f"  配置来源: {config.get('source', 'unknown')}")

    # ── 2. 确定文档类型 ──
    print("\n[2/5] 确定文档类型...")
    doc_type = resolve_document_type(str(raw_path), args.type)
    print(f"  类型: {doc_type}")

    # ── 3. 加载 schema ──
    print("\n[3/5] 加载 schema...")
    schema = load_schema(plugin_root, doc_type)
    if schema:
        print(f"  Schema: {schema.get('description', doc_type)}")
    else:
        print("  Schema: 未加载（跳过校验）")

    # ── 4. 版本管理 ──
    print("\n[4/5] 版本管理...")
    raw_id = compute_raw_id(str(raw_path))

    output_dir = args.output_dir
    if not output_dir:
        output_dir = str(raw_path.parent / "parsed")

    existing_versions = get_existing_versions(output_dir, doc_type, raw_id)
    if existing_versions and not args.force:
        print(f"  已有 {len(existing_versions)} 个版本，跳过（使用 --force 强制重解析）")
        print(f"  最新: {existing_versions[-1]}")
        sys.exit(0)

    version = get_next_version(output_dir, doc_type, raw_id)
    supersedes = get_supersedes_id(output_dir, doc_type, raw_id, version)
    print(f"  版本: v{version}" + (f" (替代: {supersedes})" if supersedes else ""))

    # ── 5. 执行 OCR ──
    print(f"\n[5/5] 执行 OCR: {raw_path.name}...")

    if args.mock:
        print("  [Mock] 使用 mock OCR 数据...")
        mock = mock_ocr_result()
        ocr_output = {
            "pages": mock.get("data", {}).get("pages", []),
            "route_info": parse_route_summary(mock),
            "validation": None,
            "raw_text": "",
        }
        parsed_by = "mock"
    else:
        ocr_output = run_ocr(str(raw_path), doc_type, config)
        parsed_by = "pipeline"

    # ── 构建 parsed ──
    parsed = build_parsed_file(
        raw_path=str(raw_path),
        doc_type=doc_type,
        version=version,
        ocr_output=ocr_output,
        config=config,
        supersedes=supersedes,
    )

    # ── Schema 校验 ──
    warnings = validate_parsed(parsed, schema)
    if warnings:
        print(f"\n  ⚠ Schema 校验警告 ({len(warnings)} 项):")
        for w in warnings:
            print(f"    - {w}")

    # ── 写入 ──
    output_path = write_parsed_file(parsed, output_dir)
    print(f"\n✅ 解析完成: {output_path}")

    # ── 可选：启动复核工具 ──
    if args.review:
        print(f"\n📄 启动复核工具...")
        try:
            import subprocess
            review_script = plugin_root / "scripts" / "parsed-review.py"
            if review_script.exists():
                flags = 0
                if sys.platform == "win32":
                    flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
                subprocess.Popen(
                    [sys.executable, str(review_script), str(output_path), str(raw_path)],
                    creationflags=flags,
                )
            else:
                print(f"  ⚠ 复核脚本不存在: {review_script}")
        except Exception as e:
            print(f"  ⚠ 启动复核工具失败: {e}")


if __name__ == "__main__":
    main()