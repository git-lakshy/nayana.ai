"""Local-fixture smoke test for the Phase 1 crawler.

Spins up an HTTP server on 127.0.0.1, serves a small synthetic site, and crawls
it. Does NOT need internet access. Verifies:
- chunker emits multiple chunks on real HTML
- page_type classifies landing/docs/faq/blog/pricing/changelog/integration
- BFS discovers same-origin outlinks and persists them
- page rows include type/title/word_count/json_ld_count
- chunks persist under scan with heading_path populated

Usage (from project root):
    PYTHONPATH=. python -m backend.scripts.smoke_local
"""
from __future__ import annotations

import http.server
import socketserver
import sys
import threading
import time
from typing import Dict

sys.path.insert(0, ".")

from backend.app import chunker, crawler as crawler_mod, db as sqlite_db
from backend.app.page_type import classify
from bs4 import BeautifulSoup


PAGES: Dict[str, str] = {
    "/": """<!doctype html>
<html>
  <head><title>Nayana Test Root</title>
    <meta name="description" content="Synthetic fixture for Phase 1 crawler.">
 </head>
  <body>
    <nav><a href="/about">About</a> <a href="/docs">Docs</a>
         <a href="/blog/post-1">Blog</a> <a href="/faq">FAQ</a</nav>
    <main>
      <h1>Welcome to Nayana Test</h1>
      <p>This page exists solely to exercise the Phase 1 crawler end to end.
         It contains multiple paragraph sections so we can verify heading-boundary
         chunking produces more than one chunk per page. Lorem ipsum dolor sit
         amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut
         labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
         exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat</p>
      <h2>Subhead</h2>
      <p>Another paragraph block for chunker to slice on. Duis aute irure dolor
         in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
         pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa
         qui officia deserunt mollit anim id est laborum</p>
   </main>
    <footer>ignore me</footer>
 </body>
</html>""",
    "/about": """<!doctype html>
<html><head><title>About</title</head>
  <body><main>
    <h1>About Us</h1>
    <p>Company overview and team description. Lorem ipsum dolor sit amet,
       consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore
       et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
       exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat</p>
 </main</body</html>""",
    "/docs": """<!doctype html>
<html><head><title>Docs</title</head>
  <body><main>
    <h1>Documentation</h1>
    <p>Getting started guide intro. Lorem ipsum dolor sit amet, consectetur
       adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore
       magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation</p>
    <h2>API Reference</h2>
    <p>API endpoints listed here. Duis aute irure dolor in reprehenderit in
       voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur
       sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt</p>
 </main</body</html>""",
    "/blog/post-1": """<!doctype html>
<html><head><title>Post 1</title</head>
  <body><main>
    <h1>Hello World</h1>
    <p>First blog post ever. Lorem ipsum dolor sit amet, consectetur
       adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore
       magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation</p>
 </main</body</html>""",
    "/faq": """<!doctype html>
<html><head><title>FAQ</title>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","name":"FAQ"}
 </script>
</head>
  <body><main>
    <h1>Frequently Asked Questions</h1>
    <h2>What is nayana</h2>
    <p>Nayana is an AI visibility engine. It measures how well AI assistants
       can answer questions about your product from your website content.
       Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
       eiusmod tempor incididunt</p>
 </main</body</html>""",
}


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0]
        body = PAGES.get(path)
        if body is None:
            body = "<html><body><h1>404</h1><p>missing</p</body</html>"
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *_args, **_kwargs):  # silence access log
        pass


def _serve(port: int = 0) -> tuple[socketserver.TCPServer | None, int]:
    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    actual_port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, actual_port


def _print(label: str) -> None:
    print(f"\n--- {label} ---")


def unit_chunker_real_html() -> None:
    _print("unit: chunker on synthetic real-looking HTML")
    soup = BeautifulSoup(PAGES["/"], "html.parser")
    chunks = chunker.chunk_soup(soup)
    assert len(chunks) >= 2, f"expected >=2 chunks, got {len(chunks)}"
    for c in chunks:
        for key in ("heading_path", "text", "word_count", "text_hash"):
            assert key in c
        # nav and footer must not leak into chunk text
        assert "<nav" not in c["text"]
        assert "ignore me" not in c["text"]  # footer
    print(f"chunker -> {len(chunks)} chunks:")
    for c in chunks:
        print(f"  - [{c['heading_path']!r}] {c['word_count']}w "
              f"hash={c['text_hash']} ordinal={c['ordinal']}")


def unit_classify_paths() -> None:
    _print("unit: page_type on URL paths")
    cases = {
        "/":               "landing",
        "/docs":           "docs",
        "/blog/post-1":    "blog",
        "/pricing":        "pricing",
        "/faq":            "faq",   # JSON-LD wins (see PAGES["/faq"])
        "/changelog":      "changelog",
        "/integrations":   "integration",
    }
    soup_blank = BeautifulSoup("<html</html>", "html.parser")
    for path, expected in cases.items():
        # for /faq: pass FAQPage types to mimic real classification
        ld_types = ["FAQPage"] if path == "/faq" else []
        got = classify(f"http://h{path}", soup_blank, ld_types)
        ok = got == expected
        flag = "ok " if ok else "FAIL"
        print(f"  [{flag}] {path:18s} -> {got:12s} (expected {expected})")
        assert ok, f"mismatch on {path}: got {got}, expected {expected}"


def smoke_crawl() -> None:
    _print("smoke: BFS crawl of local fixture")
    httpd, port = _serve()
    try:
        time.sleep(0.2)
        cfg = {"max_pages": 20, "max_depth": 3, "per_host_delay_ms": 0}
        scan = crawler_mod.run_crawl(f"http://127.0.0.1:{port}/", cfg)
        sid = scan["id"]
        s = sqlite_db.get_scan(sid)
        assert s and s["status"] == "completed", f"scan status={s and s['status']}, err={s and s.get('error')}"

        pages = sqlite_db.list_pages(sid)
        chunks = sqlite_db.list_chunks(sid)

        print(f"scan #{sid}: status={s['status']} "
              f"found={s['pages_found']} crawled={s['pages_crawled']} "
              f"chunks={s['chunks_count']} pages={len(pages)} chunks_listed={len(chunks)}")

        assert s["pages_crawled"] >= 4, f"expected >=4 pages crawled, got {s['pages_crawled']}"
        assert s["chunks_count"] >= 3, f"expected >=3 chunks, got {s['chunks_count']}"

        print("--- crawl result ---")
        for p in pages:
            print(f"  [{p['page_type']:11s}] {p['title']!r}  "
                  f"words={p['word_count']:3d} jld={p['json_ld_count']}  {p['url']}")
        print("--- chunks ---")
        for c in chunks:
            print(f"  ch={c['id']}  '{c['heading_path']}'  w={c['word_count']:3d}  "
                  f"preview={c['preview'][:90]!r}")

        # Distinct page types prove classifier works
        types = {p["page_type"] for p in pages}
        for must_have in ("landing", "docs", "blog", "faq"):
            assert must_have in types, f"missing page_type {must_have}, got {sorted(types)}"
        print(f"\n[ok] page types present: {sorted(types)}")

        # Each chunk should reference content, headings, and respect ordering
        for c in chunks:
            assert c["heading_text"] is not None
            assert len(c["preview"]) > 0
        print("[ok] all chunks have heading + preview")

        # Page-type breakdown endpoint contract
        breakdown = sqlite_db.page_type_breakdown(sid)
        print(f"[ok] page_type_breakdown: {breakdown}")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    unit_chunker_real_html()
    unit_classify_paths()
    smoke_crawl()
    print("\n[ok] Phase 1 smoke passed")
