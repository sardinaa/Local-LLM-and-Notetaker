# You are GitHub Copilot. Implement a helper module (Python) that:
# 1) Takes a search query string.
# 2) Searches the web using DuckDuckGo (library: `ddgs`).
# 3) Fetches each result's HTML (async, httpx, follow_redirects=True, timeout, retries).
# 4) Extracts readable text using `trafilatura.extract(..., favor_precision=True)`.
# 5) Returns a list of cleaned documents: [{"url": str, "title": str, "text": str}].
#
# This helper will be imported into an existing chat app that already:
# - Uses Ollama to generate answers.
# - Has its own prompt building and conversation flow.
#
# Constraints:
# - Python 3.10+
# - Libraries: ddgs, trafilatura, httpx, tenacity
# - Respect robots.txt if possible (skip disallowed URLs).
# - Limit: configurable max_results (default 5).
# - Minimum content length: configurable min_words (default 120) — skip if shorter.
# - Concurrency: fetch multiple URLs in parallel with asyncio.gather().
# - Clean text truncation: cap each doc to ~8000 chars without cutting mid-sentence.
# - Provide clear docstrings and type hints for all functions.
#
# Functions to implement:
# - async search_and_scrape(query: str, max_results: int = 5, min_words: int = 120) -> list[dict]
# - async fetch_html(url: str) -> str
# - extract_text(html: str, url: str) -> str | None
#
# Usage example (in my chat loop):
#   docs = await search_and_scrape("latest research on photogrammetry 2025")
#   # Then pass docs to my Ollama prompt builder
#
# Keep this module self-contained, minimal, and ready to drop into my project.
