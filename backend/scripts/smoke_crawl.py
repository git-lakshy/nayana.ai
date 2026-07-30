"""Smoke-test the Phase 1 crawler stack.

Run from the project root:
    PYTHONPATH=. python -m backend.scripts.smoke_crawl

What it exercises:
    - chunker.chunk_soup on synthetic HTML
    - page_type.classify on URL-only signals
    - full BFS crawl against https://example.com with conservative caps

The script asserts a minimum page/chunk count from the crawl and prints a
summary of what landed in SQLite.
"""
from __future__ import annotations

import os
import sys

# Allow running as a script without the package being installed.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from bs4 import BeautifulSoup

from backend.app import chunker, db as sqlite_db, crawler as crawler_mod
from backend.app.page_type import classify


def _print_section(label: str) -> None:
    print(f"\n--- {label} ---")


def unit_chunker() -> None:
    _print_section("unit: chunker")
    html = """
    <html>
      <head><title>t</title</head>
      <body>
        <h1>The Title</h1>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
           eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
           enim ad minim veniam, quis nostrud exercitation ullamco laboris
           nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
           reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
           pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
           culpa qui officia deserunt mollit anim id est laborum</p>
        <h2>Subhead</h2>
        <p>Curabitur pretium tincidunt lacus. Nulla gravida orci a odio.
           Nullam varius, turpis et commodo pharetra, est eros bibendum elit,
           nec luctus magna felis sollicitudin mauris. Integer in mauris eu
           nibh euismod gravida. Duis ac tellus et risus vulputate vehicula.
           Donec placerat mauris eu nisl hendrerit id blandit arcu mollis</p>
        <script>window.__noop</script>
        <nav><a href="/x">x</a</nav>
     </body>
   </html>
    """
    soup = BeautifulSoup(html, "html.parser")
    chunks = chunker.chunk_soup(soup)
    assert len(chunks) >= 1, f"chunker returned {len(chunks)} chunks"
    for c in chunks:
        for key in ("heading_path", "text", "word_count", "text_hash"):
            assert key in c, f"missing {key} in chunk {c.keys()}"
        # script + nav must NOT appear in any chunk text
        assert "<script" not in c["text"], "script tag leaked into chunk"
        assert "<nav" not in c["text"], "nav tag leaked into chunk"

    print(f"chunker -> {len(chunks)} chunks")
    for c in chunks:
        print(f"  - [{c['heading_path']!r}] {c['word_count']}w "
              f"hash={c['text_hash']} ordinal={c['ordinal']}")


def unit_page_type() -> None:
    _print_section("unit: page_type")
    cases = [
        ("https://example.com/",             "landing"),
        ("https://example.com/docs/intro",   "docs"),
        ("https://example.com/blog/post-1",  "blog"),
        ("https://example.com/pricing",      "pricing"),
        ("https://example.com/faq",          "faq"),
        ("https://example.com/changelog",    "changelog"),
        ("https://example.com/integrations", "integration"),
    ]
    soup_blank = BeautifulSoup("<html><body</body</html>", "html.parser")
    for url, expected in cases:
        got = classify(url, soup_blank, [])
        marker = "ok " if got == expected else "FAIL"
        print(f"  [{marker}] {url:42s} -> {got:12s} (expected {expected})")
        assert got == expected, f"mismatch on {url}"


def smoke_crawl_example() -> None:
    _print_section("smoke: crawl https://example.com")
    scan = crawler_mod.run_crawl("https://example.com/", {
        "max_pages": 3,
        "max_depth": 1,
        "per_host_delay_ms": 0,
    })
    sid = scan["id"]
    s = sqlite_db.get_scan(sid)
    assert s is not None, "scan row missing"
    assert s["status"] == "completed", f"scan status = {s['status']!r}, err={s.get('error')}"
    assert s["pages_crawled"] >= 1, "no pages crawled"
    assert s["chunks_count"] >= 1, "no chunks recorded"

    pages = sqlite_db.list_pages(sid)
    chunks = sqlite_db.list_chunks(sid)

    print(f"scan #{sid}: status={s['status']} found={s['pages_found']} "
          f"crawled={s['pages_crawled']} chunks={s['chunks_count']}")
    print(f"pages: {len(pages)}, chunks: {len(chunks)}")
    for p in pages:
        print(f"  page [{p['page_type']}] {p['title']!r}  "
              f"({p['word_count']} words, {p['json_ld_count']} JSON-LD)  {p['url']}")
    for c in chunks[:5]:
        print(f"    chunk #{c['id']} {c['heading_path']!r}  {c['word_count']}w  "
              f"preview={c['preview']!r}")


if __name__ == "__main__":
    unit_chunker()
    unit_page_type()
    smoke_crawl_example()
    print("\n[ok] Phase 1 smoke passed")
