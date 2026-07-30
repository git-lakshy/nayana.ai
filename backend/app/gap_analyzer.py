"""Phase 4 heuristic gap analyzer.

Given a completed scan, inspect its pages and chunks and return a list of
content gaps that hurt AI visibility:

- thin_content     — pages with < 100 words
- missing_meta     — pages with empty title or description
- missing_schema   — pages with no JSON-LD / structured data
- missing_page_type— scan lacks an expected page type (faq, pricing, docs, etc.)
- buried_content   — chunks with very few words after heading-boundary split

Output is JSON-serializable and consumed by GET /api/scans/{scan_id}/gaps.
"""
from __future__ import annotations

from typing import Optional

from backend.app import db as sqlite_db

# Page-type coverage that matters for AI answerability.
EXPECTED_PAGE_TYPES = ("landing", "docs", "faq", "pricing", "changelog", "integration", "blog")

THIN_WORDS_THRESHOLD = 100
BURIED_WORDS_THRESHOLD = 40


def _gap_id(prefix: str, scan_id: int, suffix: str | int) -> str:
    return f"{prefix}-{scan_id}-{suffix}"


def analyze(scan_id: int) -> list[dict]:
    """Return all heuristic gaps for a scan."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        return []

    pages = sqlite_db.list_pages(scan_id, limit=10000)
    chunks = sqlite_db.list_chunks(scan_id, limit=10000)

    gaps: list[dict] = []
    seen_types: set[str] = set()

    for page in pages:
        page_type = page.get("page_type") or "other"
        seen_types.add(page_type)
        page_id = page.get("id")
        url = page.get("url") or ""
        title = page.get("title") or ""
        description = page.get("description") or ""
        word_count = page.get("word_count") or 0
        json_ld_count = page.get("json_ld_count") or 0

        # Thin content
        if word_count < THIN_WORDS_THRESHOLD:
            gaps.append({
                "id": _gap_id("thin", scan_id, page_id),
                "type": "thin_content",
                "severity": "high" if word_count < 50 else "medium",
                "page_id": page_id,
                "url": url,
                "title": title,
                "fix_category": "content",
                "description": f"Page has only {word_count} words; AI engines need more context to answer confidently.",
                "suggested_fix": "Expand the page with a clear value proposition, FAQ, or structured explanation.",
            })

        # Missing metadata
        if not title.strip() or not description.strip():
            gaps.append({
                "id": _gap_id("meta", scan_id, page_id),
                "type": "missing_meta",
                "severity": "medium",
                "page_id": page_id,
                "url": url,
                "title": title,
                "fix_category": "metadata",
                "description": "Missing or empty title/description makes the page harder to cite.",
                "suggested_fix": "Add a descriptive <title> and <meta name=\"description\"> tag.",
            })

        # Missing structured data
        if json_ld_count == 0:
            gaps.append({
                "id": _gap_id("schema", scan_id, page_id),
                "type": "missing_schema",
                "severity": "medium",
                "page_id": page_id,
                "url": url,
                "title": title,
                "fix_category": "schema",
                "description": "No JSON-LD / schema.org markup found; AI engines rely on structured data for precise answers.",
                "suggested_fix": "Add JSON-LD (Product, FAQPage, TechArticle, or Organization) to the page.",
            })

    # Buried content: tiny chunks indicate headings with almost no body text.
    for chunk in chunks:
        wc = chunk.get("word_count") or 0
        if wc < BURIED_WORDS_THRESHOLD:
            page_id = chunk.get("page_id")
            gaps.append({
                "id": _gap_id("buried", scan_id, chunk.get("id")),
                "type": "buried_content",
                "severity": "low",
                "page_id": page_id,
                "chunk_id": chunk.get("id"),
                "url": None,
                "title": chunk.get("heading_text") or "",
                "fix_category": "content",
                "description": f"Section has only {wc} words under its heading; it may not fully answer a related question.",
                "suggested_fix": "Flesh out the section with a concrete answer or example.",
            })

    # Missing page-type coverage across the whole scan.
    for expected in EXPECTED_PAGE_TYPES:
        if expected not in seen_types:
            gaps.append({
                "id": _gap_id("missing-type", scan_id, expected),
                "type": "missing_page_type",
                "severity": "low" if expected in ("changelog", "blog") else "medium",
                "page_id": None,
                "url": scan.get("root_url"),
                "title": scan.get("root_url"),
                "fix_category": "coverage",
                "description": f"No {expected} page was discovered in the scan.",
                "suggested_fix": f"Consider adding a dedicated {expected} page if it fits the product surface.",
            })

    # Sort by severity so high-impact gaps appear first.
    severity_order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: severity_order.get(g.get("severity"), 99))
    return gaps
