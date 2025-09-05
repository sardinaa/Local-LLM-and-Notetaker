from typing import Any, Dict, Optional
from urllib.parse import urlparse
import re

try:
    import requests  # type: ignore
except Exception:
    requests = None  # type: ignore

SUPPORTED_DOMAINS = {
    'boards.greenhouse.io': 'greenhouse',
    'greenhouse.io': 'greenhouse',
    'jobs.lever.co': 'lever',
    'lever.co': 'lever',
    'smartrecruiters.com': 'smartrecruiters',
    'myworkdayjobs.com': 'workday',
    'workday.com': 'workday',
    'indeed.com': 'indeed',
    'linkedin.com': 'linkedin',
}


def is_supported(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ''
        # match subdomains
        return any(host == d or host.endswith('.' + d) for d in SUPPORTED_DOMAINS)
    except Exception:
        return False


def _normalize(job: Dict[str, Any]) -> Dict[str, Any]:
    # Map common keys from potential JobSpy outputs to our prefill
    def g(*keys, default=None):
        for k in keys:
            v = job.get(k)
            if v not in (None, ''):
                return v
        return default

    salary_min = g('salary_min', 'min_salary', 'salary_from')
    salary_max = g('salary_max', 'max_salary', 'salary_to')
    currency = g('salary_currency', 'currency')
    try:
        salary_min = int(float(salary_min)) if salary_min is not None else None
    except Exception:
        pass
    try:
        salary_max = int(float(salary_max)) if salary_max is not None else None
    except Exception:
        pass
    prefill = {
        'position': g('title', 'job_title', 'position'),
        'company': g('company', 'company_name', 'employer'),
        'location': g('location', 'job_location', 'city'),
        'salary_min': salary_min,
        'salary_max': salary_max,
        'salary_currency': currency,
        'job_type': g('employment_type', 'job_type'),
        'deadline': g('valid_through', 'deadline'),
        'description': g('description', 'job_description', 'html_description', 'plain_description'),
        'source_url': g('url', 'job_url'),
        'state': 'draft',
    }
    prov = {}
    for k, v in prefill.items():
        if v not in (None, ''):
            prov[k] = { 'value': v, 'score': 0.9, 'source': 'jobspy' }
    return { 'prefill': prefill, 'provenance': prov }


def extract(url: str) -> Optional[Dict[str, Any]]:
    """Attempt to use JobSpy to extract details for a single job URL.
    Returns None if JobSpy is not installed or cannot parse this URL.
    """
    try:
        # Try common import patterns
        try:
            import jobspy  # type: ignore
        except Exception:
            jobspy = None  # type: ignore
        if jobspy is None:
            try:
                from JobSpy import jobspy as jobspy  # type: ignore
            except Exception:
                jobspy = None  # type: ignore
        if jobspy is None:
            # Fall back to site-specific extractor for LinkedIn only
            host = (urlparse(url).hostname or '').lower()
            if 'linkedin.com' in host:
                return _extract_linkedin_direct(url)
            return None

        # Try to find a per-URL scraping entry point in JobSpy
        job_data = None
        # Pattern 1: jobspy.scrape_job_from_url(url)
        fn = getattr(jobspy, 'scrape_job_from_url', None)
        if callable(fn):
            try:
                job_data = fn(url)
            except Exception:
                job_data = None
        # Pattern 2: jobspy.scrape(url=url)
        if job_data is None:
            fn = getattr(jobspy, 'scrape', None)
            if callable(fn):
                try:
                    job_data = fn(url=url)
                except Exception:
                    job_data = None
        # Pattern 3: jobspy.api.get_job(url)
        if job_data is None:
            api = getattr(jobspy, 'api', None)
            if api is not None:
                g = getattr(api, 'get_job', None)
                if callable(g):
                    try:
                        job_data = g(url)
                    except Exception:
                        job_data = None

        if isinstance(job_data, dict):
            return _normalize(job_data)
        # Some APIs may return list/tuple of dicts
        if isinstance(job_data, (list, tuple)) and job_data:
            if isinstance(job_data[0], dict):
                return _normalize(job_data[0])
        # If JobSpy didn't return and it's LinkedIn, try direct extraction
        host = (urlparse(url).hostname or '').lower()
        if job_data is None and 'linkedin.com' in host:
            return _extract_linkedin_direct(url)
        return None
    except Exception:
        return None


# -----------------------------
# LinkedIn direct extractor
# -----------------------------

def _title_case(s: str) -> str:
    if not s:
        return s
    t = s.strip()
    if t.islower() or (t.isupper() and len(t) > 2):
        t = t.title()
    return t


def _clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or '').strip())


def _clean_company_text(s: str) -> str:
    t = (s or '').strip()
    # remove gender markers
    t = re.sub(r"\((?:m\s*/\s*f\s*/\s*d|f\s*/\s*m\s*/\s*d|w\s*/\s*m\s*/\s*d|gn|all\s*genders)\)", "", t, flags=re.I)
    # cut after separators
    t = re.split(r"\s[\-|–|—|\|]\s", t)[0]
    # remove ' in <location>' tails
    t = re.sub(r"\s+in\s+.+$", "", t, flags=re.I)
    return _title_case(_clean_text(t)).strip(' -|–—')


def _html_to_text(html: str) -> str:
    s = re.sub(r"(?is)</(p|div|br|li|h\d|section|article|header|footer)>", "\n", html)
    s = re.sub(r"(?is)<[^>]+>", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return re.sub(r"[ \t]{2,}", " ", s).strip()


def _clean_location_candidate(s: str, company_hint: Optional[str] = None) -> str:
    t = (s or '').strip()
    if company_hint:
        t = re.sub(re.escape(company_hint), '', t, flags=re.I)
    t = t.strip('•|–—- ')
    # drop tokens like '1 day ago', '104 applicants'
    t = re.sub(r"\b\d+\b.*$", "", t).strip()
    t = re.sub(r"\b(applicants?|ago|days?|hours?)\b.*", "", t, flags=re.I)
    t = re.sub(r"\s{2,}", " ", t).strip(' ,.-•')
    if any(ch.isdigit() for ch in t):
        return ''
    if len(t) > 80:
        t = t[:80].rstrip(' ,.-')
    return t


def _fetch_html(url: str) -> str:
    if not requests:
        return ''
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        r = requests.get(url, headers=headers, timeout=10)
        if r.ok:
            return r.text or ''
    except Exception:
        return ''
    return ''


def _extract_linkedin_direct(url: str) -> Optional[Dict[str, Any]]:
    """Minimal LinkedIn single-URL extractor to fill modal fields.
    Returns adapter-shaped dict or None on failure.
    """
    html = _fetch_html(url)
    if not html:
        return None
    prefill: Dict[str, Any] = {
        'state': 'draft',
        'source_url': url,
    }
    prov: Dict[str, Any] = {}

    # Canonical + company from '-at-<slug>-<id>'
    can = None
    m = re.search(r"(?is)<link[^>]+rel=\"canonical\"[^>]+href=\"([^\"]+)\"", html)
    if m:
        can = m.group(1).strip()
        prefill['source_url'] = can
    if can:
        m2 = re.search(r"-at-([a-z0-9\-]+)-\d+/?$", can)
        if m2:
            slug = m2.group(1)
            comp = _clean_company_text(slug.replace('-', ' '))
            if comp:
                prefill['company'] = comp
                prov['company'] = {'value': comp, 'score': 0.9, 'source': 'linkedin:canonical'}

    # Title -> position
    t = None
    mt = re.search(r"(?is)<title[^>]*>([^<]+)</title>", html)
    if mt:
        t = _clean_text(mt.group(1))
        # Heuristic split on ' - ' or ' at '
        if ' - ' in t:
            left = t.split(' - ', 1)[0].strip()
            prefill['position'] = _title_case(left)
            prov['position'] = {'value': prefill['position'], 'score': 0.75, 'source': 'title'}
        elif re.search(r"\sat\s", t, re.I):
            left = re.split(r"\sat\s", t, flags=re.I)[0].strip()
            prefill['position'] = _title_case(left)
            prov['position'] = {'value': prefill['position'], 'score': 0.75, 'source': 'title'}

    # H1 fallback for position
    if 'position' not in prefill:
        mh = re.search(r"(?is)<h1[^>]*>([^<]{3,140})</h1>", html)
        if mh:
            prefill['position'] = _title_case(_clean_text(mh.group(1)))
            prov['position'] = {'value': prefill['position'], 'score': 0.78, 'source': 'h1'}

    # Phrase-based company
    if 'company' not in prefill:
        txt = _html_to_text(html)
        m3 = re.search(r"See who\s+([^\n\r]+?)\s+has hired for this role", txt, re.I)
        if m3:
            comp2 = _clean_company_text(m3.group(1))
            if comp2:
                prefill['company'] = comp2
                prov['company'] = {'value': comp2, 'score': 0.85, 'source': 'linkedin:phrase'}

    # Location near phrase anchor
    txt = _html_to_text(html)
    m4 = re.search(r"See who\s+([^\n\r]+?)\s+has hired for this role", txt, re.I)
    if m4:
        start = m4.start()
        window = txt[max(0, start - 500): start]
        lines = [l.strip() for l in window.splitlines() if l.strip()]
        cand_lines = lines[-6:]
        cands = []
        for ln in cand_lines:
            cands.extend([p.strip() for p in re.split(r"[•\u2022\u00B7\|]", ln) if p.strip()])
        company_hint = prefill.get('company')
        for c in cands[::-1]:
            loc = _clean_location_candidate(c, company_hint)
            if loc and (',' in loc or len(loc.split()) <= 4):
                prefill['location'] = loc
                prov['location'] = {'value': loc, 'score': 0.88, 'source': 'linkedin:anchor-prev-line'}
                break

    # Meta description as description fallback
    md = re.search(r"(?is)<meta[^>]+name=\"description\"[^>]+content=\"([^\"]+)\"", html)
    if md and md.group(1).strip():
        desc = md.group(1).strip()
        prefill['description'] = desc
        prov['description'] = {'value': desc, 'score': 0.6, 'source': 'meta'}

    # Return only if we have something meaningful
    if any(prefill.get(k) for k in ('position','company','location','description')):
        return {'prefill': prefill, 'provenance': prov}
    return None
