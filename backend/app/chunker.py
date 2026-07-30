"""Heading-boundary semantic chunker.

Single pass over the cleaned DOM. A *chunk* is emitted when:
- the current heading-level boundary changes (h2 follows h1, etc.), or
- the accumulated text exceeds MAX_CHUNK_WORDS and we split at a sentence boundary.

Tiny sections (< MIN_CHUNK_WORDS words) are merged with the next chunk; if no
next chunk exists, they are merged with the trailing end of the previous chunk.
This avoids orphan "Frequently Asked" headings with nothing underneath.

Output keys per chunk:
    ordinal, heading_path, heading_text, heading_level, text, word_count, text_hash
"""
from __future__ import annotations

import hashlib
import re
from typing import List, Optional

from bs4 import BeautifulSoup, Tag

CONTENT_TAGS = {"p", "li", "td", "th", "blockquote", "pre", "code"}
UTILITY_TAGS = {"script", "style", "nav", "header", "footer", "aside",
                "form", "noscript", "iframe", "svg", "canvas"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}

SKIP_CLASS_HINTS = ("sidebar", "footer", "cookie", "banner", "advert",
                    "promo", "subscribe")

MIN_CHUNK_WORDS = 30
SOFT_MAX_WORDS = 400
HARD_MAX_WORDS = 800

_WS = re.compile(r"\s+")


def _ws(s: Optional[str]) -> str:
    return _WS.sub(" ", s or "").strip()


def _is_chrome(node: Tag) -> bool:
    cls = " ".join(node.get("class") or [])
    cid = node.get("id") or ""
    role = node.get("role") or ""
    hay = f"{cls} {cid} {role}".lower()
    return any(h in hay for h in SKIP_CLASS_HINTS)


def _clean(root: Tag) -> None:
    """Strip utility nodes (script/style/nav/header/footer/aside/form/...) so
    only article body content survives into chunks."""
    for tag in root.find_all(list(UTILITY_TAGS)):
        tag.decompose()
    # Drop additional containers that are clearly chrome by class/role.
    for tag in list(root.find_all(True)):
        if tag.name in ("div", "section", "aside") and _is_chrome(tag):
            tag.decompose()


def chunk_soup(soup: BeautifulSoup) -> list[dict]:
    body = soup.find("main") or soup.find("article") or soup.find("body") or soup
    _clean(body)

    chunks: list[dict] = []
    head_stack: list[dict] = []    # [{level, text}, ...]
    buffer: list[str] = []         # paragraphs in current section
    cur_heading = {"text": None, "level": None}

    def heading_path() -> str:
        return " > ".join(h["text"] for h in head_stack)

    def push_emit(text: str) -> None:
        text = _ws(text)
        if not text:
            return
        wc = len(text.split())
        chunks.append({
            "heading_path": heading_path(),
            "heading_text": cur_heading["text"],
            "heading_level": cur_heading["level"],
            "text": text,
            "word_count": wc,
            "text_hash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
        })

    def slice_buffer() -> None:
        """Emit the buffer, possibly splitting at sentence boundaries."""
        text = _ws(" ".join(buffer))
        buffer.clear()
        if not text:
            return
        words = text.split()
        if len(words) <= SOFT_MAX_WORDS:
            push_emit(text)
            return
        # iterative sentence-aware split
        remaining = text
        while len(remaining.split()) > HARD_MAX_WORDS:
            head_words = remaining.split()[:SOFT_MAX_WORDS]
            head = " ".join(head_words)
            cut_candidates = (head.rfind(". "), head.rfind("? "), head.rfind("! "))
            cut = max((c for c in cut_candidates if c > 0), default=-1)
            if cut <= 0:
                cut = len(head)
            head_text = remaining[: cut + 1].strip()
            tail_text = remaining[cut + 1:].strip()
            if not head_text:
                # safety: emit whole remaining, then stop
                push_emit(remaining)
                remaining = ""
                break
            push_emit(head_text)
            remaining = tail_text
        if remaining:
            push_emit(remaining)

    def on_heading(text: str, level: int) -> None:
        # flush whatever was accumulated under the previous heading
        slice_buffer()
        # trim heading path to fit new level
        head_stack[:] = [h for h in head_stack if h["level"] < level]
        head_stack.append({"level": level, "text": text})
        cur_heading["text"] = text
        cur_heading["level"] = level

    def walk(node: Tag) -> None:
        for child in list(node.children):
            if not isinstance(child, Tag):
                continue  # rely on <p>/<li>/etc. for content; bare text nodes
                          # are usually whitespace and not worth chunking.
            name = (child.name or "").lower()
            if not name:
                continue
            if name in HEADING_TAGS:
                h = _ws(child.get_text(" ", strip=True))
                if h:
                    on_heading(h, int(name[1]))
                continue
            if name in CONTENT_TAGS:
                t = _ws(child.get_text(" ", strip=True))
                if t:
                    buffer.append(t)
                    cur_words = sum(len(p.split()) for p in buffer)
                    if cur_words >= HARD_MAX_WORDS:
                        slice_buffer()
                continue
            # container (div, section, article, main, span, ...) — recurse
            walk(child)

    walk(body)
    slice_buffer()

    # drop tiny chunks; if everything is tiny, keep one fallback chunk
    out: list[dict] = []
    for c in chunks:
        if c["word_count"] < MIN_CHUNK_WORDS:
            continue
        c["ordinal"] = len(out)
        out.append(c)

    if not out and chunks:
        # best-effort: keep the largest chunk so downstream always has something
        biggest = max(chunks, key=lambda c: c["word_count"])
        out = [{
            "ordinal": 0,
            "heading_path": biggest["heading_path"],
            "heading_text": biggest["heading_text"],
            "heading_level": biggest["heading_level"],
            "text": biggest["text"],
            "word_count": biggest["word_count"],
            "text_hash": biggest["text_hash"],
        }]
    return out
