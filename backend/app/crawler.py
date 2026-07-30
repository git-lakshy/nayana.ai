"""BFS web crawler — Phase 1 implementation.

Scope:
    - Same-origin crawl from a single root URL
    - Depth-limited BFS (default 2, configurable)
    - Per-host politeness delay
    - URL normalization + dedupe at the (scan_id, url_normalized) DB level
    - Persistent scan record visible via /api/scans

Out of scope (recorded for later phases):
    - robots.txt parsing — Phase 2, when politeness rules formalize
    - sitemap.xml ingestion — Phase 2, useful for coverage on docs-heavy sites
    - BackgroundTasks/queue — Phase 5+ with a real worker; for now Phase 1 runs
      the crawl synchronously inside the POST request with conservative caps
      (default 25 pages, 2 levels deep) to stay under ~30s.
"""
from __future__ import annotations

import logging
import time
from collections import deque
from typing import Optional

from backend.app import db, page_extract

logger = logging.getLogger(__name__)

DEFAULT_CONFIG = {
    "max_pages": 25,
    "max_depth": 2,
    "per_host_delay_ms": 200,
    "request_timeout_ms": 15000,
}


def run_crawl(root_url: str, config: Optional[dict] = None) -> dict:
    """Run a crawl synchronously and return the scan row.

    Errors are recorded on the scan row but do not raise from this function —
    it is safe to call from a FastAPI handler without try/except.
    """
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    root_norm = db.normalize_url(root_url)
    if root_norm != root_url:
        logger.info("normalizing root_url %s -> %s", root_url, root_norm)

    scan_id = db.create_scan(root_url, root_norm, cfg)

    try:
        _crawl_loop(scan_id, root_norm, cfg)
        db.finish_scan(scan_id, "completed")
    except Exception as e:
        logger.exception("crawl failed for scan %d", scan_id)
        db.finish_scan(scan_id, "failed", error=str(e))

    return db.get_scan(scan_id) or {"id": scan_id}


def _crawl_loop(scan_id: int, root_norm: str, cfg: dict) -> None:
    frontier: deque[tuple[str, int]] = deque()
    visited: set[str] = set()
    seen_norm: set[str] = set()
    frontier.append((root_norm, 0))
    seen_norm.add(root_norm)

    per_host_delay = cfg["per_host_delay_ms"] / 1000.0
    pages_found = 0
    pages_crawled = 0
    total_chunks = 0

    while frontier and pages_crawled < cfg["max_pages"]:
        url, depth = frontier.popleft()
        if url in visited:
            continue
        visited.add(url)
        pages_found += 1
        db.update_scan_counts(scan_id, pages_found=pages_found)

        logger.info("[scan %d] GET depth=%d url=%s", scan_id, depth, url)

        fetched = page_extract.fetch(url)
        if fetched is None:
            continue
        html, final_url = fetched
        # If a redirect landed us elsewhere, dedupe by final_url next time.
        if final_url and final_url != url:
            final_norm = db.normalize_url(final_url)
            if final_norm in visited:
                continue
            url = final_norm
            visited.add(url)

        pages_crawled += 1
        db.update_scan_counts(scan_id, pages_crawled=pages_crawled)

        try:
            parsed = page_extract.parse_page(url, html)
        except Exception as e:
            logger.exception("parse failed for %s: %s", url, e)
            continue

        page_id = db.upsert_page(
            scan_id,
            url=parsed["url"],
            url_normalized=url,
            title=parsed["title"],
            description=parsed["description"],
            page_type=parsed["page_type"],
            http_status=200,
            word_count=parsed["word_count"],
            content_hash_value=parsed["content_hash"],
            json_ld_count=parsed["json_ld_count"],
            outlinks_count=len(parsed["outlinks"]),
        )
        n = db.insert_chunks(page_id, scan_id, parsed["chunks"])
        total_chunks += n
        db.update_scan_counts(scan_id, chunks_count=total_chunks)

        if depth < cfg["max_depth"]:
            for outlink in parsed["outlinks"]:
                norm = db.normalize_url(outlink)
                if norm in seen_norm:
                    continue
                seen_norm.add(norm)
                frontier.append((norm, depth + 1))

        if per_host_delay > 0:
            time.sleep(per_host_delay)

    logger.info("[scan %d] complete: %d crawled, %d chunks",
                scan_id, pages_crawled, total_chunks)
