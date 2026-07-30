"""Heuristic page-type classifier.

Pure function: (url, soup, json_ld_types) → label from
{landing, docs, faq, pricing, changelog, integration, blog, other}.

Signal priority: JSON-LD @type → URL path keywords → heading copy.
"""
from __future__ import annotations

import re
from typing import Iterable
from urllib.parse import urlparse
from bs4 import BeautifulSoup

FAQ_HINTS = ("faq", "frequently-asked", "frequently_asked", "help", "support")
DOCS_HINTS = ("docs", "documentation", "developer", "guide", "guides",
              "reference", "api-reference", "sdk", "manual", "tutorial",
              "tutorials")
PRICING_HINTS = ("pricing", "plans", "billing", "subscribe", "subscription")
INTEGRATION_HINTS = ("integration", "integrations", "connect", "connector",
                     "plugins", "extensions", "marketplace")
CHANGELOG_HINTS = ("changelog", "release", "release-notes", "what's new",
                   "whats-new", "news", "updates")
BLOG_HINTS = ("blog", "article", "articles", "post", "posts", "story",
              "stories", "newsroom")

FAQ_HEADING_RE = re.compile(r"^frequently asked", re.IGNORECASE)


def _has_any(path: str, segs: Iterable[str], hints: tuple[str, ...]) -> bool:
    seg_set = set(segs)
    return any(h in path for h in hints) or any(h in seg_set for h in hints)


def classify(url: str, soup: BeautifulSoup, json_ld_types: Iterable[str]) -> str:
    path = (urlparse(url).path or "/").lower()
    segs = [s for s in path.split("/") if s]
    ld_blob = " ".join(t or "" for t in json_ld_types).lower()

    # 1. JSON-LD is the strongest signal — trust it.
    if "faqpage" in ld_blob:
        return "faq"
    if "product" in ld_blob and any(t in ld_blob for t in ("offer", "price", "pricerange")):
        return "pricing"
    if "blogposting" in ld_blob:
        return "blog"
    if "techarticle" in ld_blob and ("docs" in path or "documentation" in path):
        return "docs"
    if "techarticle" in ld_blob:
        return "docs"
    if "article" in ld_blob and ("blog" in "/".join([path]) or "post" in path):
        return "blog"

    # 2. URL path hints.
    if _has_any(path, segs, FAQ_HINTS):
        return "faq"
    if _has_any(path, segs, PRICING_HINTS):
        return "pricing"
    if _has_any(path, segs, INTEGRATION_HINTS):
        return "integration"
    if _has_any(path, segs, CHANGELOG_HINTS):
        return "changelog"
    if _has_any(path, segs, BLOG_HINTS):
        return "blog"
    if _has_any(path, segs, DOCS_HINTS):
        return "docs"

    # 3. Heading copy (weakest).
    h1 = soup.find("h1")
    h1_text = (h1.get_text(" ", strip=True).lower() if h1 else "")
    if FAQ_HEADING_RE.match(h1_text):
        return "faq"
    if "pricing" in h1_text or "plans" in h1_text or "subscribe" in h1_text:
        return "pricing"

    # 4. Default: landing vs. other.
    if not segs or path.rstrip("/") in ("", "/", "/index", "/index.html",
                                        "/home", "/home.html"):
        return "landing"
    return "other"
