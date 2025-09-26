#!/usr/bin/env python3
"""
Download representative images for a list of recipe names and save them with clean filenames.

By default this script uses DuckDuckGo's public image JSON endpoint (no API key) to fetch
image URLs, then downloads the first reasonably-sized image per recipe.

Usage:
  python download_recipe_images.py \
    --out images \
    --per-query 1 \
    --min-width 600 --min-height 400

Notes:
- DuckDuckGo's endpoint is unofficial and rate-limited. The script backs off and retries.
- If you prefer a formal API, plug in Bing Image Search or Google CSE in `search_image_urls`.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

import requests
import random

# ------------------------ Configurable Recipe List ------------------------ #
RECIPES: List[str] = [
    "Paella Valenciana",
    "Tortilla Española",
    "Gazpacho Andaluz",
    "Pisto Manchego",
    "Churros con Chocolate",
    "Spaghetti Carbonara",
    "Pizza Margherita",
    "Risotto ai Funghi",
    "Tiramisu",
    "Coq au Vin",
    "Ratatouille",
    "French Onion Soup",
    "Pad Thai",
    "Fried Rice",
    "Miso Soup",
    "Tacos al Pastor",
    "Guacamole",
    "Butter Chicken",
]

# ------------------------------- Utilities ------------------------------- #

def slugify(text: str) -> str:
    """Turn text into a safe lowercase filename slug.

    - Removes accents
    - Replaces non alphanumerics with '-'
    - Squashes multiple dashes and trims
    """
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "image"

@dataclass
class ImageCandidate:
    url: str
    width: Optional[int] = None
    height: Optional[int] = None

# -------------------------- Image Search (DDG) --------------------------- #

def ddg_image_search(query: str, max_results: int = 10, safe: str = "moderate") -> List[ImageCandidate]:
    """Query DuckDuckGo's image endpoint. No API key needed.
    Returns a list of ImageCandidate.
    """
    # Seed request to get a token (vqd)
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"}
    seed = requests.get("https://duckduckgo.com/", params={"q": query}, headers=headers, timeout=15)
    m = re.search(r'vqd\s*=\s*"([\d-]+)"', seed.text)
    if not m:
        # Fallback to lightweight JS endpoint (works in many regions)
        return ddg_image_search_js(query, max_results=max_results)
    vqd = m.group(1)

    params = {
        "l": "us-en",
        "o": "json",
        "q": query,
        "vqd": vqd,
        "f": ",,,",  # filters; empty = default
        "p": "1" if safe.lower() != "off" else "-1",
        "s": "0",
    }

    url = "https://duckduckgo.com/i.js"
    results: List[ImageCandidate] = []
    while len(results) < max_results:
        r = requests.get(url, params=params, headers=headers, timeout=20)
        if r.status_code != 200:
            break
        data = r.json()
        for item in data.get("results", []):
            results.append(
                ImageCandidate(
                    url=item.get("image") or item.get("thumbnail") or item.get("url"),
                    width=int(item.get("width") or 0) or None,
                    height=int(item.get("height") or 0) or None,
                )
            )
            if len(results) >= max_results:
                break
        nxt = data.get("next")
        if not nxt:
            break
        # The API expects `s` to be incremented by 100 for the next page.
        try:
            params["s"] = str(int(params.get("s", "0")) + 100)
        except Exception:
            break
        time.sleep(0.8)  # polite pause
    return results


def ddg_image_search_js(query: str, max_results: int = 10) -> List[ImageCandidate]:
    """Fallback to the JS JSON endpoint that doesn't require vqd in HTML."""
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"}
    params = {"l": "us-en", "o": "json", "q": query}
    url = "https://duckduckgo.com/i.js"
    r = requests.get(url, params=params, headers=headers, timeout=20)
    r.raise_for_status()
    data = r.json()
    results: List[ImageCandidate] = []
    for item in data.get("results", [])[:max_results]:
        results.append(
            ImageCandidate(
                url=item.get("image") or item.get("thumbnail") or item.get("url"),
                width=int(item.get("width") or 0) or None,
                height=int(item.get("height") or 0) or None,
            )
        )
    return results

# --------------------------- Wikimedia Fallback --------------------------- #

def wiki_primary_image(query: str, min_w: int = 0) -> Optional[str]:
    """Use Wikipedia/Wikimedia to fetch a high-quality lead image.
    This is stable and unauthenticated. Returns an image URL or None.
    """
    headers = {"User-Agent": "RecipeImageBot/1.0 (contact: example@example.com)"}
    # 1) Find the best matching page
    r = requests.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "list": "search",
            "srsearch": query,
            "format": "json",
            "srlimit": 1,
        },
        headers=headers,
        timeout=15,
    )
    if r.status_code != 200:
        return None
    data = r.json()
    hits = data.get("query", {}).get("search", [])
    if not hits:
        return None
    title = hits[0]["title"]
    # 2) Get the page image thumb
    r2 = requests.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "query",
            "prop": "pageimages",
            "titles": title,
            "pithumbsize": max(1200, min_w or 1200),
            "format": "json",
        },
        headers=headers,
        timeout=15,
    )
    if r2.status_code != 200:
        return None
    data2 = r2.json()
    pages = data2.get("query", {}).get("pages", {})
    for _, page in pages.items():
        thumb = page.get("thumbnail", {})
        src = thumb.get("source")
        if src:
            return src
    return None

# ------------------------- Downloader & Orchestration ------------------------- #

EXTS_FROM_CT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def pick_extension(content_type: Optional[str], url: str) -> str:
    if content_type in EXTS_FROM_CT:
        return EXTS_FROM_CT[content_type]
    # Try from URL
    m = re.search(r"\.(jpg|jpeg|png|webp|gif)(?:\?|$)", url, re.I)
    if m:
        ext = m.group(1).lower()
        return ".jpg" if ext == "jpeg" else f".{ext}"
    return ".jpg"


def download(url: str, dest: Path, min_width: int = 0, min_height: int = 0, attempts: int = 3) -> bool:
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"}
    for i in range(attempts):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code != 200 or not resp.content:
                raise RuntimeError(f"Bad response {resp.status_code}")
            # Optionally ensure dimensions via PIL if installed
            try:
                from PIL import Image
                from io import BytesIO

                im = Image.open(BytesIO(resp.content))
                w, h = im.size
                if (min_width and w < min_width) or (min_height and h < min_height):
                    raise RuntimeError(f"Image too small: {w}x{h}")
            except ImportError:
                # If Pillow isn't installed, we skip dimension checks
                pass
            ext = pick_extension(resp.headers.get("Content-Type"), url)
            dest = dest.with_suffix(ext)
            dest.write_bytes(resp.content)
            return True
        except Exception as e:
            wait = 1.5 * (i + 1)
            print(f"  Retry {i+1}/{attempts} for {url} after error: {e}. Waiting {wait:.1f}s", file=sys.stderr)
            time.sleep(wait)
    return False


def fetch_and_save(recipes: Iterable[str], out_dir: Path, per_query: int = 1, min_w: int = 0, min_h: int = 0, save_map: bool = True) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    mapping = {}
    for name in recipes:
        slug = slugify(name)
        query = f"{name} recipe"
        print(f"Searching: {query}")
        candidates = ddg_image_search(query, max_results=10)
        success = False
        for cand in candidates[:max(1, per_query)]:
            target = out_dir / slug
            if download(cand.url, target, min_width=min_w, min_height=min_h):
                print(f"  Saved: {target}")
                mapping[name] = str(next(target.parent.glob(f"{target.stem}.*")))
                success = True
                break
        if not success:
            # Wikimedia fallback if DDG didn't return a usable image
            wiki_url = wiki_primary_image(query, min_w=min_w)
            if wiki_url:
                target = out_dir / slug
                if download(wiki_url, target, min_width=min_w, min_height=min_h):
                    print(f"  Saved (WIKI): {target}")
                    mapping[name] = str(next(target.parent.glob(f"{target.stem}.*")))
                    success = True
        if not success:
            print(f"  ⚠️  No suitable image found for: {name}")
            mapping[name] = None
        time.sleep(random.uniform(1.2, 2.5))  # be polite with jitter

    if save_map:
        map_path = out_dir / "image_map.json"
        map_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2))
        print(f"\nWrote mapping to: {map_path}")


# ---------------------------------- CLI ---------------------------------- #

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Download images for recipe names and save with clean filenames.")
    p.add_argument("--out", dest="out", default="images", help="Output directory for downloaded images")
    p.add_argument("--per-query", dest="per_query", type=int, default=1, help="How many images to try per recipe (will save the first valid one)")
    p.add_argument("--min-width", dest="min_w", type=int, default=600, help="Minimum width pixels (requires Pillow installed)")
    p.add_argument("--min-height", dest="min_h", type=int, default=400, help="Minimum height pixels (requires Pillow installed)")
    p.add_argument("--recipes-json", dest="recipes_json", default=None, help="Optional path to a JSON file containing a list of recipe names to override the default list")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    recipes = RECIPES
    if args.recipes_json:
        with open(args.recipes_json, "r", encoding="utf-8") as f:
            recipes = json.load(f)
            if not isinstance(recipes, list):
                raise ValueError("recipes-json must be a JSON array of strings")
    fetch_and_save(recipes, Path(args.out), per_query=args.per_query, min_w=args.min_w, min_h=args.min_h)


if __name__ == "__main__":
    main()
