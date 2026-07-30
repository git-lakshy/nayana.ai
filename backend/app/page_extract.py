"""Per-page fetch and structured extraction.

Handles HTTP fetch (with size cap and HTML-only filter), same-origin outlink
discovery, JSON-LD extraction, title/description/word count, page-type
classification, and body chunking. Does not write to the DB.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
import socket
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from backend.app import chunker, page_type

logger = logging.getLogger(__name__)

DEFAULT_UA = "NayanaBot/1.0 (+https://nayana.ai) Python-httpx"
DEFAULT_TIMEOUT = 15.0
MAX_BYTES = 2_500_000      # ~2.5MB cap per page; protects from runaway docs

_WS = __import__("re").compile(r"\s+")


def _ws(s: Optional[str]) -> str:
    return _WS.sub(" ", s or "").strip()


# ----- fetch -----

def _allow_private_hosts() -> bool:
    """Private/loopback hosts are allowed in dev (fixture servers) but must be
    blocked in production. Set NAYANA_ENV=prod to enforce the SSRF guard, or
    NAYANA_ALLOW_PRIVATE_HOSTS=1 to explicitly allow private hosts anywhere."""
    if os.getenv("NAYANA_ALLOW_PRIVATE_HOSTS", "").strip() == "1":
        return True
    return os.getenv("NAYANA_ENV", "dev").strip().lower() != "prod"


def is_public_url(url: str) -> bool:
    """SSRF guard: accept only absolute http(s) URLs whose host resolves to
    globally routable IPs (no loopback/private/link-local/metadata ranges)."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    if _allow_private_hosts():
        return True
    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        infos = socket.getaddrinfo(parsed.hostname, port, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError, ValueError, OverflowError):
        return False
    if not infos:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if not ip.is_global:
            return False
    return True


def fetch(url: str) -> Optional[Tuple[str, str]]:
    """Fetch a URL. Returns (html, final_url) on success, None otherwise."""
    if not is_public_url(url):
        logger.info("blocked non-public or invalid URL: %s", url)
        return None
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=DEFAULT_TIMEOUT,
            headers={
                "User-Agent": DEFAULT_UA,
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            },
        ) as client:
            r = client.get(url)
        if r.status_code != 200:
            return None
        final_url = str(r.url)
        if final_url != url and not is_public_url(final_url):
            logger.info("blocked redirect to non-public URL: %s -> %s", url, final_url)
            return None
        ctype = (r.headers.get("content-type") or "").lower()
        if "text/html" not in ctype and "application/xhtml" not in ctype:
            return None
        if len(r.content) > MAX_BYTES:
            logger.info("skipping %s — body exceeds %d bytes", url, MAX_BYTES)
            return None
        return (r.text, final_url)
    except httpx.HTTPError as e:
        logger.debug("fetch error for %s: %s", url, e)
        return None


# ----- outlinks & JSON-LD -----

def _extract_outlinks(soup: BeautifulSoup, base_url: str) -> List[str]:
    base_netloc = urlparse(base_url).netloc.lower()
    seen: set[str] = set()
    out: list[str] = []
    for a in soup.find_all("a"):
        href = (a.get("href") or "").strip()
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            continue
        if parsed.netloc.lower() != base_netloc:
            continue
        absolute = absolute.split("#", 1)[0]
        if not absolute or absolute in seen:
            continue
        seen.add(absolute)
        out.append(absolute)
    return out


def _extract_jsonld(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    out: list[dict] = []
    for script in soup.find_all("script", type="application/ld+json"):
        if not script.string:
            continue
        try:
            data = json.loads(script.string.strip())
        except Exception:
            continue
        if isinstance(data, dict):
            out.append(data)
        elif isinstance(data, list):
            out.extend(d for d in data if isinstance(d, dict))
    return out


def _jsonld_types(schemas: List[Dict[str, Any]]) -> List[str]:
    types: list[str] = []
    for s in schemas:
        t = s.get("@type")
        if isinstance(t, list):
            types.extend(t)
        elif t:
            types.append(t)
        for gr in s.get("@graph", []) or []:
            if isinstance(gr, dict):
                gt = gr.get("@type")
                if isinstance(gt, list):
                    types.extend(gt)
                elif gt:
                    types.append(gt)
    return types


# ----- main entry -----

def parse_page(url: str, html: str) -> Dict[str, Any]:
    """Parse fetched HTML into the structured page dict the crawler persists."""
    soup = BeautifulSoup(html, "html.parser")

    title_tag = soup.find("title")
    title = _ws(title_tag.get_text(" ", strip=True)) if title_tag else None

    desc = None
    md = soup.find("meta", attrs={"name": "description"})
    if md and md.get("content"):
        desc = _ws(md.get("content"))
    else:
        og = soup.find("meta", attrs={"property": "og:description"})
        if og and og.get("content"):
            desc = _ws(og.get("content"))

    json_ld_schemas = _extract_jsonld(soup)
    json_ld_types_list = _jsonld_types(json_ld_schemas)

    ptype = page_type.classify(url, soup, json_ld_types_list)
    outlinks = _extract_outlinks(soup, url)
    chunks = chunker.chunk_soup(soup)

    body = soup.find("body")
    body_text = body.get_text(" ", strip=True) if body else ""
    word_count = len(body_text.split()) if body_text else 0

    return {
        "url": url,
        "page_type": ptype,
        "title": title,
        "description": desc,
        "word_count": word_count,
        "json_ld_count": len(json_ld_schemas),
        "json_ld_types": json_ld_types_list,
        "outlinks": outlinks,
        "chunks": chunks,
        "content_hash": hashlib.sha256(html.encode("utf-8")).hexdigest()[:16],
    }
