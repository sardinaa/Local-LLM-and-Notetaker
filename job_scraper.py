import json
import re
import time
import hashlib
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    import requests  # type: ignore
except Exception:  # pragma: no cover
    requests = None  # type: ignore


UA_LIST = [
    # A few common desktop UAs to reduce blocks
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
]


def _pick_ua(i: int = 0) -> str:
    return UA_LIST[i % len(UA_LIST)]


def _hash_html(html: str) -> str:
    return hashlib.sha256(html.encode("utf-8", errors="ignore")).hexdigest()


def _strip_tags_keep_bullets(html: str) -> str:
    # Convert simple lists and headings to lightweight Markdown; then strip other tags
    s = html
    # List items to lines starting with "- "
    s = re.sub(r"(?is)<li[^>]*>\s*", "\n- ", s)
    s = re.sub(r"(?is)</li>", "", s)
    # Headings -> blank line + text
    s = re.sub(r"(?is)<h[1-6][^>]*>(.*?)</h[1-6]>", lambda m: "\n\n" + _clean_text(m.group(1)) + "\n\n", s)
    # Paragraphs -> ensure breaks
    s = re.sub(r"(?is)<p[^>]*>", "\n\n", s)
    s = re.sub(r"(?is)</p>", "\n\n", s)
    # Breaks
    s = re.sub(r"(?is)<br\s*/?>", "\n", s)
    # Remove all remaining tags
    s = re.sub(r"(?is)<[^>]+>", "", s)
    # Normalize whitespace
    s = re.sub(r"\n{3,}", "\n\n", s)
    return _clean_text(s)


def _clean_text(s: str) -> str:
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _title_case(s: str) -> str:
    if not s:
        return s
    if s.isupper() and len(s) > 3:
        s = s.title()  # simple fallback
    return s.strip()


def _currency_iso(token: str) -> Optional[str]:
    if not token:
        return None
    t = token.upper().strip()
    return {
        "$": "USD",
        "USD": "USD",
        "€": "EUR",
        "EUR": "EUR",
        "£": "GBP",
        "GBP": "GBP",
        "CAD": "CAD",
        "AUD": "AUD",
        "JPY": "JPY",
    }.get(t)


def _parse_number(s: str) -> Optional[int]:
    if not s:
        return None
    t = re.sub(r"[^0-9.,]", "", s)
    if not t:
        return None
    # Remove thousands separators
    t = t.replace(",", "").replace(" ", "")
    try:
        return int(float(t))
    except Exception:
        return None


def _extract_scripts_jsonld(html: str) -> List[Any]:
    blocks = []
    for m in re.finditer(r"(?is)<script[^>]+type=\"application/ld\+json\"[^>]*>(.*?)</script>", html):
        raw = m.group(1).strip()
        try:
            j = json.loads(raw)
            blocks.append(j)
        except Exception:
            # Some pages have invalid JSON with trailing commas; try to fix lightly
            try:
                fixed = re.sub(r",\s*([}\]])", r"\1", raw)
                j = json.loads(fixed)
                blocks.append(j)
            except Exception:
                continue
    return blocks


def _flatten_jsonld(j: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    def visit(x: Any):
        if isinstance(x, dict):
            out.append(x)
            for v in x.values():
                visit(v)
        elif isinstance(x, list):
            for v in x:
                visit(v)
    visit(j)
    return out


def _first_jobposting(blocks: List[Any]) -> Optional[Dict[str, Any]]:
    for b in blocks:
        for obj in ([b] if isinstance(b, dict) else (b if isinstance(b, list) else [])):
            try:
                types = obj.get("@type")
                if isinstance(types, list):
                    if any(t.lower() == "jobposting" for t in types if isinstance(t, str)):
                        return obj
                elif isinstance(types, str) and types.lower() == "jobposting":
                    return obj
            except Exception:
                continue
        # Sometimes JobPosting is nested
        for obj in _flatten_jsonld(b):
            t = obj.get("@type")
            if isinstance(t, list) and any(str(x).lower() == "jobposting" for x in t):
                return obj
            if isinstance(t, str) and t.lower() == "jobposting":
                return obj
    return None


def _canonical_url(html: str, url: str) -> str:
    m = re.search(r"(?is)<link[^>]+rel=\"canonical\"[^>]+href=\"([^\"]+)\"", html)
    if m:
        href = m.group(1)
        if href.startswith("http"):
            return href
        # Resolve relative
        try:
            from urllib.parse import urljoin
            return urljoin(url, href)
        except Exception:
            return url
    return url


def _extract_meta(html: str) -> Dict[str, Tuple[str, float, str]]:
    res: Dict[str, Tuple[str, float, str]] = {}
    def meta_property(prop: str) -> Optional[str]:
        m = re.search(rf"(?is)<meta[^>]+property=\"{re.escape(prop)}\"[^>]+content=\"([^\"]+)\"", html)
        return m.group(1).strip() if m else None
    def meta_name(name: str) -> Optional[str]:
        m = re.search(rf"(?is)<meta[^>]+name=\"{re.escape(name)}\"[^>]+content=\"([^\"]+)\"", html)
        return m.group(1).strip() if m else None
    title = meta_property("og:title") or meta_name("title")
    if not title:
        m = re.search(r"(?is)<title[^>]*>([^<]+)</title>", html)
        if m:
            title = m.group(1).strip()
    if title:
        res["position"] = (_title_case(title), 0.72, "meta")
    site = meta_property("og:site_name") or meta_name("application-name")
    if site:
        res["company"] = (_title_case(site), 0.7, "meta")
    desc = meta_name("description") or meta_property("og:description")
    if desc:
        res["description"] = (desc.strip(), 0.6, "meta")
    return res


def _extract_jsonld(html: str) -> Dict[str, Tuple[Union[str, int], float, str]]:
    out: Dict[str, Tuple[Union[str, int], float, str]] = {}
    blocks = _extract_scripts_jsonld(html)
    jp = _first_jobposting(blocks)
    if not jp:
        return out
    # Title
    t = jp.get("title") or jp.get("name")
    if isinstance(t, str) and t.strip():
        out["position"] = (_title_case(t.strip()), 0.95, "jsonld")
    # Company
    org = jp.get("hiringOrganization") or {}
    if isinstance(org, dict):
        name = org.get("name")
        if isinstance(name, str) and name.strip():
            out["company"] = (_title_case(name.strip()), 0.95, "jsonld")
    # Location
    loc = jp.get("jobLocation")
    def fmt_loc(obj: Any) -> Optional[str]:
        if isinstance(obj, dict):
            addr = obj.get("address") or {}
            if isinstance(addr, dict):
                parts = [addr.get("addressLocality"), addr.get("addressRegion"), addr.get("addressCountry")]
                parts = [p for p in parts if isinstance(p, str) and p.strip()]
                if parts:
                    return ", ".join(parts)
        if isinstance(obj, str):
            return obj
        return None
    if isinstance(loc, list) and loc:
        f = fmt_loc(loc[0])
        if f:
            out["location"] = (f, 0.9, "jsonld")
    else:
        f = fmt_loc(loc)
        if f:
            out["location"] = (f, 0.9, "jsonld")
    # Employment type
    et = jp.get("employmentType")
    if isinstance(et, list) and et:
        et = et[0]
    if isinstance(et, str) and et:
        mapv = {
            "FULL_TIME": "Full-time",
            "PART_TIME": "Part-time",
            "CONTRACTOR": "Contract",
            "CONTRACT": "Contract",
            "INTERN": "Internship",
            "TEMPORARY": "Temporary",
        }
        key = et.upper().replace("-", "_").replace(" ", "_")
        out["job_type"] = (mapv.get(key, et.title()), 0.85, "jsonld")
    # Salary
    sal = jp.get("baseSalary") or {}
    if isinstance(sal, dict):
        val = sal.get("value") or {}
        if isinstance(val, dict):
            cur = sal.get("currency") or val.get("currency")
            currency = _currency_iso(str(cur)) if cur else None
            minv = val.get("minValue"); maxv = val.get("maxValue"); amount = val.get("value")
            if minv is not None:
                out["salary_min"] = (int(float(minv)), 0.9, "jsonld")
            if maxv is not None:
                out["salary_max"] = (int(float(maxv)), 0.9, "jsonld")
            if amount is not None and "salary_min" not in out:
                out["salary_min"] = (int(float(amount)), 0.8, "jsonld")
            if currency:
                out["salary_currency"] = (currency, 0.9, "jsonld")
    # Dates
    vt = jp.get("validThrough")
    if isinstance(vt, str) and vt:
        out["deadline"] = (vt[:10], 0.8, "jsonld")
    # Description (JSON-LD may be HTML)
    desc = jp.get("description")
    if isinstance(desc, str) and desc.strip():
        out["description"] = (_strip_tags_keep_bullets(desc), 0.85, "jsonld")
    return out


def _extract_dom_heuristics(html: str) -> Dict[str, Tuple[str, float, str]]:
    res: Dict[str, Tuple[str, float, str]] = {}
    # Title from h1 variants
    m = re.search(r"(?is)<h1[^>]*>([^<]{3,140})</h1>", html)
    if m:
        res["position"] = (_title_case(m.group(1).strip()), 0.75, "dom:h1")
    else:
        m = re.search(r"(?is)<(h1|h2)[^>]*class=\"[^\"]*(job-title|posting-headline)[^\"]*\"[^>]*>([^<]{3,140})</\1>", html)
        if m:
            res["position"] = (_title_case(m.group(3).strip()), 0.78, "dom:title-class")
    # Known containers for description
    for sel_name, pattern in (
        ("greenhouse", r"(?is)<div[^>]*class=\"[^\"]*opening[^\"]*\"[^>]*>(.*?)</div>"),
        ("lever", r"(?is)<div[^>]*class=\"[^\"]*section-wrapper[^\"]*\"[^>]*>(.*?)</div>"),
        ("smartrecruiters", r"(?is)<div[^>]*id=\"job-description\"[^>]*>(.*?)</div>"),
    ):
        m = re.search(pattern, html)
        if m:
            text = _strip_tags_keep_bullets(m.group(1))
            if text and len(text) > 200:
                res["description"] = (text, 0.82, f"dom:{sel_name}")
                break
    # Location hints
    loc_match = re.search(r"(?is)(remote|hybrid|on[- ]?site)", html)
    if loc_match and "location" not in res:
        res["location"] = (loc_match.group(1).title(), 0.65, "dom:keywords")
    return res


def _extract_salary_regex(text: str) -> Dict[str, Tuple[Union[str, int], float, str]]:
    out: Dict[str, Tuple[Union[str, int], float, str]] = {}
    body = re.sub(r"(?is)<[^>]+>", " ", text)
    # Range with currency
    m = re.search(r"(?is)(\$|€|£|USD|EUR|GBP)\s*([\d,.\s]{2,})\s*[-–]\s*(\$|€|£|USD|EUR|GBP)?\s*([\d,.\s]{2,})", body)
    if m:
        cur = _currency_iso(m.group(1)) or _currency_iso(m.group(3) or "")
        lo = _parse_number(m.group(2)); hi = _parse_number(m.group(4))
        if lo: out["salary_min"] = (lo, 0.75, "regex")
        if hi: out["salary_max"] = (hi, 0.75, "regex")
        if cur: out["salary_currency"] = (cur, 0.75, "regex")
        return out
    # Single amount + currency
    m = re.search(r"(?is)(\$|€|£|USD|EUR|GBP)\s*([\d,.\s]{2,})", body)
    if m:
        cur = _currency_iso(m.group(1))
        val = _parse_number(m.group(2))
        if val:
            out["salary_min"] = (val, 0.65, "regex")
        if cur:
            out["salary_currency"] = (cur, 0.65, "regex")
    return out


class JobScraper:
    def __init__(self, enable_headless: bool = True):
        self.enable_headless = enable_headless

    def fetch(self, url: str) -> Tuple[str, str]:
        """Return (final_url, html). Tries requests first, optional headless fallback.
        Headless requires Playwright; if not available or blocked, silently skip.
        """
        html = ""
        final_url = url
        if requests is not None:
            try:
                # Small randomized delay (anti-bot hygiene)
                time.sleep(0.05)
                headers = {
                    "User-Agent": _pick_ua(hash(url)),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate",
                    "Connection": "keep-alive",
                }
                resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
                if resp.ok and (resp.text or "").strip():
                    html = resp.text
                    final_url = resp.url or url
            except Exception:
                pass
        # Canonical URL resolution will be done in extract()
        # Headless fallback (optional)
        if not html and self.enable_headless:
            try:
                from playwright.sync_api import sync_playwright  # type: ignore
                with sync_playwright() as p:  # pragma: no cover
                    browser = p.chromium.launch(headless=True)
                    context = browser.new_context(user_agent=_pick_ua(hash(url)))
                    page = context.new_page()
                    page.goto(url, wait_until="networkidle", timeout=15000)
                    time.sleep(0.15)
                    html = page.content()
                    final_url = page.url or url
                    browser.close()
            except Exception:
                pass
        return final_url, html or ""

    def extract(self, url: str) -> Dict[str, Any]:
        final_url, html = self.fetch(url)
        result: Dict[str, Dict[str, Any]] = {}
        provenance: Dict[str, Dict[str, Any]] = {}
        if not html:
            # Return minimal stub
            return {
                "prefill": {"source_url": url},
                "provenance": {},
                "canonical_url": url,
                "raw_html_hash": None,
            }
        canonical = _canonical_url(html, final_url)
        html_hash = _hash_html(html)

        # Layered extraction
        layers: List[Dict[str, Tuple[Union[str, int], float, str]]] = []
        layers.append(_extract_jsonld(html))
        layers.append(_extract_meta(html))
        layers.append(_extract_dom_heuristics(html))
        layers.append(_extract_salary_regex(html))

        # Merge with scoring: pick highest score per field
        best: Dict[str, Tuple[Union[str, int], float, str]] = {}
        for layer in layers:
            for k, v in layer.items():
                val, score, src = v
                if k not in best or score > best[k][1]:
                    best[k] = (val, score, src)

        # Normalization & confidence threshold
        def set_field(key: str, val: Union[str, int], score: float, src: str, thr: float = 0.7):
            provenance[key] = {"value": val, "score": score, "source": src}
            if score >= thr and (val is not None and str(val).strip() != ""):
                result[key] = {"value": val, "score": score, "source": src}

        for k, (v, sc, src) in best.items():
            if k in ("position", "company") and isinstance(v, str):
                v = _title_case(v)
            if k in ("salary_min", "salary_max") and isinstance(v, (str,)):
                v = _parse_number(v) or v
            if k == "salary_currency" and isinstance(v, str):
                v = _currency_iso(v) or v
            if k == "description" and isinstance(v, str):
                v = v.strip()
            set_field(k, v, sc, src)

        # Compose prefill payload
        prefill: Dict[str, Any] = {
            "position": (result.get("position") or {}).get("value"),
            "company": (result.get("company") or {}).get("value"),
            "location": (result.get("location") or {}).get("value"),
            "salary_min": (result.get("salary_min") or {}).get("value"),
            "salary_max": (result.get("salary_max") or {}).get("value"),
            "salary_currency": (result.get("salary_currency") or {}).get("value"),
            "job_type": (result.get("job_type") or {}).get("value"),
            "deadline": (result.get("deadline") or {}).get("value"),
            "description": (result.get("description") or {}).get("value"),
            "source_url": canonical or final_url or url,
            "state": "draft",
        }

        return {
            "prefill": prefill,
            "provenance": provenance,
            "canonical_url": canonical,
            "raw_html_hash": html_hash,
        }

