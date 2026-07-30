"""SQLite persistence for Phase 1 of nayana.ai.

Stores scans, pages, and chunks produced by the crawler. Schema is intentionally
narrow for Phase 1 â€” questions/answers/gaps/fixes land in later phases.

Design notes:
- WAL journal for safe concurrent reads from the FastAPI threadpool
- One connection per thread (sqlite3 is not safe across threads when shared)
- Schema-tiny URL normalization + content hashing helpers live here too
  because they are colocated with dedupe / change-detection logic.
- Existing `db.json` (the v1 control-plane persistence) is untouched.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterable, Iterator, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

DB_PATH = os.path.join(os.path.dirname(__file__), "nayana.db")

_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    root_url TEXT NOT NULL,
    root_url_normalized TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,                       -- running | completed | failed
    pages_found INTEGER NOT NULL DEFAULT 0,
    pages_crawled INTEGER NOT NULL DEFAULT 0,
    chunks_count INTEGER NOT NULL DEFAULT 0,
    config_json TEXT,                           -- JSON-encoded crawl config
    error TEXT
);

CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    url_normalized TEXT NOT NULL,
    title TEXT,
    description TEXT,
    page_type TEXT,                             -- landing | docs | faq | pricing | changelog | integration | blog | other
    http_status INTEGER,
    word_count INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT,
    content_hash TEXT,
    json_ld_count INTEGER NOT NULL DEFAULT 0,
    outlinks_count INTEGER NOT NULL DEFAULT 0,
    raw_html_path TEXT,
    UNIQUE(scan_id, url_normalized)
);

CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL,                   -- position within page
    heading_path TEXT,                          -- e.g. "Docs > Authentication > OAuth"
    heading_text TEXT,
    heading_level INTEGER,                      -- 1..6
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    UNIQUE(page_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_pages_scan_id    ON pages(scan_id);
CREATE INDEX IF NOT EXISTS idx_chunks_scan_id   ON chunks(scan_id);
CREATE INDEX IF NOT EXISTS idx_chunks_page_id   ON chunks(page_id);

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    chunk_id INTEGER REFERENCES chunks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    intent_category TEXT,                       -- informational | comparative | integration | pricing | how-to | technical
    ground_truth TEXT NOT NULL,                 -- short reference snippet the answer should match
    created_at TEXT NOT NULL,
    UNIQUE(scan_id, text)
);

CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,                     -- gemini | openai | claude | perplexity | deepseek
    model TEXT,                                 -- model id actually called
    answer_text TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    citations_json TEXT,                        -- JSON-encoded list[str] of citations
    error TEXT,                                 -- null on success; populated if call failed
    created_at TEXT NOT NULL,
    UNIQUE(question_id, provider)
);

CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    confidence REAL NOT NULL,                   -- 0..1, lower for refusal/hedges
    accuracy REAL,                              -- 0..1 cosine sim vs ground_truth; NULL if embedding unavailable
    attribution REAL NOT NULL,                  -- 0..1 brand+domain cited, no competitor mentioned
    is_refusal INTEGER NOT NULL,                -- 0/1
    hedge_rate REAL NOT NULL,                   -- 0..1 hedge words per 100 tokens
    has_brand_mention INTEGER NOT NULL,         -- 0/1
    has_competitor_mention INTEGER NOT NULL,    -- 0/1
    has_domain_citation INTEGER NOT NULL,       -- 0/1
    UNIQUE(answer_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_scan_id    ON questions(scan_id);
CREATE INDEX IF NOT EXISTS idx_questions_chunk_id   ON questions(chunk_id);
CREATE INDEX IF NOT EXISTS idx_answers_scan_id      ON answers(scan_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id  ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_provider     ON answers(provider);

CREATE TABLE IF NOT EXISTS fixes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
    gap_id TEXT NOT NULL,
    gap_type TEXT NOT NULL,
    severity TEXT,
    fix_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    title TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    language TEXT,
    file_hint TEXT,
    created_at TEXT NOT NULL,
    applied_at TEXT,
    UNIQUE(scan_id, gap_id)
);

CREATE TABLE IF NOT EXISTS score_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    gap_count INTEGER NOT NULL DEFAULT 0,
    high_severity_gaps INTEGER NOT NULL DEFAULT 0,
    medium_severity_gaps INTEGER NOT NULL DEFAULT 0,
    low_severity_gaps INTEGER NOT NULL DEFAULT 0,
    fix_count INTEGER NOT NULL DEFAULT 0,
    applied_fix_count INTEGER NOT NULL DEFAULT 0,
    avg_confidence REAL,
    avg_attribution REAL,
    avg_accuracy REAL,
    ai_coverage_score REAL,
    UNIQUE(scan_id)
);

CREATE INDEX IF NOT EXISTS idx_fixes_scan_id           ON fixes(scan_id);
CREATE INDEX IF NOT EXISTS idx_score_history_domain    ON score_history(domain);

CREATE TABLE IF NOT EXISTS competitor_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    competitor_scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    competitor_url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(parent_scan_id, competitor_scan_id)
);
"""


# ----- connection management -----

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(
        DB_PATH,
        detect_types=sqlite3.PARSE_DECLTYPES,
        isolation_level=None,           # autocommit; we manage explicit txns
        check_same_thread=False,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _connect()
        _local.conn = conn
    return conn


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    conn.execute("BEGIN")
    try:
        yield conn
    except Exception:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def init_db() -> None:
    get_conn().executescript(SCHEMA)


# ----- small helpers -----

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


_WS = re.compile(r"\s+")


def normalize_url(url: str) -> str:
    """Make URLs comparable across the crawl frontier: lowercased scheme/host,
    default-port stripped, trailing-slash trimmed, common tracking params dropped,
    fragment removed.
    """
    if not url:
        return url
    s = urlsplit(url.strip())
    if not s.scheme or not s.netloc:
        return url.strip()
    scheme = s.scheme.lower()
    netloc = s.netloc.lower()
    if netloc.endswith(":80") and scheme == "http":
        netloc = netloc[:-3]
    if netloc.endswith(":443") and scheme == "https":
        netloc = netloc[:-4]
    path = s.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/") or "/"
    drop = {"utm_source", "utm_medium", "utm_campaign", "utm_term",
            "utm_content", "gclid", "fbclid", "ref", "mc_cid", "mc_eid"}
    qs = [(k, v) for k, v in parse_qsl(s.query, keep_blank_values=True)
          if k.lower() not in drop]
    query = urlencode(qs)
    return urlunsplit((scheme, netloc, path, query, ""))


def collapse_ws(s: str) -> str:
    return _WS.sub(" ", s or "").strip()


# ----- write repository -----

def create_scan(root_url: str, root_url_normalized: str, config: dict) -> int:
    with transaction() as conn:
        cur = conn.execute(
            "INSERT INTO scans (root_url, root_url_normalized, started_at, status, config_json) "
            "VALUES (?, ?, ?, 'running', ?)",
            (root_url, root_url_normalized, now_iso(), json.dumps(config)),
        )
        return cur.lastrowid


def finish_scan(scan_id: int, status: str, error: Optional[str] = None) -> None:
    get_conn().execute(
        "UPDATE scans SET finished_at = ?, status = ?, error = ? WHERE id = ?",
        (now_iso(), status, error, scan_id),
    )


def update_scan_counts(scan_id: int, *, pages_found: Optional[int] = None,
                       pages_crawled: Optional[int] = None,
                       chunks_count: Optional[int] = None) -> None:
    sets, params = [], []
    if pages_found is not None:
        sets.append("pages_found = ?"); params.append(pages_found)
    if pages_crawled is not None:
        sets.append("pages_crawled = ?"); params.append(pages_crawled)
    if chunks_count is not None:
        sets.append("chunks_count = ?"); params.append(chunks_count)
    if not sets:
        return
    params.append(scan_id)
    get_conn().execute(f"UPDATE scans SET {', '.join(sets)} WHERE id = ?", params)


def upsert_page(scan_id: int, *, url: str, url_normalized: str, title: Optional[str],
                description: Optional[str], page_type: Optional[str],
                http_status: Optional[int], word_count: int, content_hash_value: Optional[str],
                json_ld_count: int, outlinks_count: int,
                raw_html_path: Optional[str] = None) -> int:
    """Insert or fetch existing page; returns page id."""
    conn = get_conn()
    cur = conn.execute(
        "SELECT id FROM pages WHERE scan_id = ? AND url_normalized = ?",
        (scan_id, url_normalized),
    )
    row = cur.fetchone()
    if row is not None:
        return row["id"]
    cur = conn.execute(
        """INSERT INTO pages (scan_id, url, url_normalized, title, description, page_type,
                              http_status, word_count, fetched_at, content_hash,
                              json_ld_count, outlinks_count, raw_html_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (scan_id, url, url_normalized, title, description, page_type, http_status,
         word_count, now_iso(), content_hash_value, json_ld_count, outlinks_count,
         raw_html_path),
    )
    return cur.lastrowid


def insert_chunks(page_id: int, scan_id: int, chunks: Iterable[dict]) -> int:
    rows = [
        (scan_id, page_id, c["ordinal"], c.get("heading_path"), c.get("heading_text"),
         c.get("heading_level"), c["text"], c["text_hash"], c["word_count"])
        for c in chunks
    ]
    if not rows:
        return 0
    conn = get_conn()
    conn.executemany(
        """INSERT OR IGNORE INTO chunks (scan_id, page_id, ordinal, heading_path,
                                        heading_text, heading_level, text, text_hash,
                                        word_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        rows,
    )
    return len(rows)


# ----- read repository (API surface) -----

def list_scans(limit: int = 50) -> list[dict]:
    cur = get_conn().execute(
        "SELECT id, root_url, root_url_normalized, started_at, finished_at, status, "
        "pages_found, pages_crawled, chunks_count "
        "FROM scans ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]


def get_scan(scan_id: int) -> Optional[dict]:
    cur = get_conn().execute("SELECT * FROM scans WHERE id = ?", (scan_id,))
    row = cur.fetchone()
    return _row_to_dict(row) if row else None


def list_pages(scan_id: int, *, page_type: Optional[str] = None,
               limit: int = 500) -> list[dict]:
    if page_type:
        cur = get_conn().execute(
            "SELECT id, url, title, page_type, http_status, word_count, json_ld_count, "
            "outlinks_count FROM pages WHERE scan_id = ? AND page_type = ? "
            "ORDER BY id LIMIT ?",
            (scan_id, page_type, limit),
        )
    else:
        cur = get_conn().execute(
            "SELECT id, url, title, page_type, http_status, word_count, json_ld_count, "
            "outlinks_count FROM pages WHERE scan_id = ? ORDER BY id LIMIT ?",
            (scan_id, limit),
        )
    return [_row_to_dict(r) for r in cur.fetchall()]


def get_page(page_id: int) -> Optional[dict]:
    cur = get_conn().execute(
        "SELECT id, scan_id, url, url_normalized, title, description, page_type, "
        "http_status, word_count, fetched_at, content_hash, json_ld_count, "
        "outlinks_count FROM pages WHERE id = ?",
        (page_id,),
    )
    row = cur.fetchone()
    return _row_to_dict(row) if row else None


def list_chunks(scan_id: int, *, page_id: Optional[int] = None,
                limit: int = 500) -> list[dict]:
    if page_id is not None:
        cur = get_conn().execute(
            "SELECT id, page_id, ordinal, heading_path, heading_text, heading_level, "
            "word_count, substr(text, 1, 240) AS preview "
            "FROM chunks WHERE scan_id = ? AND page_id = ? "
            "ORDER BY page_id, ordinal LIMIT ?",
            (scan_id, page_id, limit),
        )
    else:
        cur = get_conn().execute(
            "SELECT id, page_id, ordinal, heading_path, heading_text, heading_level, "
            "word_count, substr(text, 1, 240) AS preview "
            "FROM chunks WHERE scan_id = ? "
            "ORDER BY page_id, ordinal LIMIT ?",
            (scan_id, limit),
        )
    return [_row_to_dict(r) for r in cur.fetchall()]


def get_chunk(chunk_id: int) -> Optional[dict]:
    cur = get_conn().execute("SELECT * FROM chunks WHERE id = ?", (chunk_id,))
    row = cur.fetchone()
    return _row_to_dict(row) if row else None


def page_type_breakdown(scan_id: int) -> list[dict]:
    cur = get_conn().execute(
        "SELECT COALESCE(page_type, 'unknown') AS page_type, COUNT(*) AS n "
        "FROM pages WHERE scan_id = ? GROUP BY page_type ORDER BY n DESC",
        (scan_id,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]


# ----- questions / answers / scores (Phase 3) -----

def insert_question(scan_id: int, page_id: Optional[int], chunk_id: Optional[int],
                    text: str, intent_category: Optional[str],
                    ground_truth: str) -> Optional[int]:
    """Insert a question, ignoring duplicates (same scan + same text)."""
    conn = get_conn()
    cur = conn.execute(
        "SELECT id FROM questions WHERE scan_id = ? AND text = ?",
        (scan_id, text),
    )
    row = cur.fetchone()
    if row is not None:
        return row["id"]
    cur = conn.execute(
        """INSERT INTO questions (scan_id, page_id, chunk_id, text, intent_category,
                                  ground_truth, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (scan_id, page_id, chunk_id, text, intent_category,
         ground_truth, now_iso()),
    )
    return cur.lastrowid


def list_questions(scan_id: int) -> list[dict]:
    cur = get_conn().execute(
        "SELECT id, scan_id, page_id, chunk_id, text, intent_category, ground_truth, "
        "created_at FROM questions WHERE scan_id = ? ORDER BY id",
        (scan_id,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]


def count_questions(scan_id: int) -> int:
    cur = get_conn().execute(
        "SELECT COUNT(*) AS n FROM questions WHERE scan_id = ?",
        (scan_id,),
    )
    return cur.fetchone()["n"]


def persist_answer(scan_id: int, question_id: int, provider: str,
                   model: Optional[str], answer_text: str, latency_ms: int,
                   citations: Optional[list[str]],
                   error: Optional[str] = None) -> int:
    """Insert (or replace) an answer for (question, provider). Idempotent re-runs."""
    conn = get_conn()
    cur = conn.execute(
        """INSERT OR REPLACE INTO answers (scan_id, question_id, provider, model, answer_text,
                                latency_ms, citations_json, error, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (scan_id, question_id, provider, model, answer_text, latency_ms,
         json.dumps(citations or []), error, now_iso()),
    )
    return cur.lastrowid


def persist_scores(answer_id: int, *, confidence: float, accuracy: Optional[float],
                   attribution: float, is_refusal: int, hedge_rate: float,
                   has_brand_mention: int, has_competitor_mention: int,
                   has_domain_citation: int) -> None:
    """Insert (or replace) the score row for an answer. Idempotent re-runs."""
    get_conn().execute(
        """INSERT OR REPLACE INTO scores (answer_id, confidence, accuracy, attribution,
                               is_refusal, hedge_rate, has_brand_mention,
                               has_competitor_mention, has_domain_citation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (answer_id, confidence, accuracy, attribution, is_refusal, hedge_rate,
         has_brand_mention, has_competitor_mention, has_domain_citation),
    )


def list_answers(scan_id: int, *, provider: Optional[str] = None,
                 limit: int = 500) -> list[dict]:
    sql = ("SELECT id, scan_id, question_id, provider, model, answer_text, latency_ms, "
           "citations_json, error, created_at FROM answers "
           "WHERE scan_id = ?")
    params: list = [scan_id]
    if provider:
        sql += " AND provider = ?"
        params.append(provider)
    sql += " ORDER BY question_id, provider LIMIT ?"
    params.append(limit)
    cur = get_conn().execute(sql, params)
    return [_row_to_dict(r) for r in cur.fetchall()]


def scores_for_scan(scan_id: int) -> list[dict]:
    """Joined (answer, score) per provider â€” drives the aggregate dashboard."""
    cur = get_conn().execute(
        """SELECT a.id AS answer_id, a.provider, a.question_id, a.latency_ms,
                  a.error,
                  s.confidence, s.accuracy, s.attribution, s.is_refusal,
                  s.hedge_rate, s.has_brand_mention, s.has_competitor_mention,
                  s.has_domain_citation
           FROM answers a
           LEFT JOIN scores s ON s.answer_id = a.id
           WHERE a.scan_id = ?
           ORDER BY a.question_id, a.provider""",
        (scan_id,),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]


def delete_answers_for_scan(scan_id: int) -> int:
    """Used so a re-run of /api/test/run starts fresh. Cascades to scores."""
    cur = get_conn().execute("DELETE FROM answers WHERE scan_id = ?", (scan_id,))
    return cur.rowcount


# ----- fixes (Phase 5) -----

def upsert_fixes(scan_id: int, fixes: list[dict], force: bool = False) -> None:
    """Insert fixes; if force=True, delete existing first."""
    if force:
        get_conn().execute("DELETE FROM fixes WHERE scan_id = ?", (scan_id,))
    with transaction() as conn:
        for f in fixes:
            conn.execute(
                """INSERT OR IGNORE INTO fixes
                       (scan_id, page_id, gap_id, gap_type, severity, fix_type,
                        status, title, description, content, language, file_hint, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)""",
                (
                    scan_id, f.get("page_id"), f["gap_id"],
                    f["gap_type"], f.get("severity"),
                    f["fix_type"], f["title"],
                    f.get("description"), f["content"],
                    f.get("language"), f.get("file_hint"),
                    now_iso(),
                ),
            )


def list_fixes(scan_id: int, status: Optional[str] = None) -> list[dict]:
    sql = ("SELECT id, scan_id, page_id, gap_id, gap_type, severity, fix_type, "
           "status, title, description, content, language, file_hint, "
           "created_at, applied_at FROM fixes WHERE scan_id = ?")
    params: list = [scan_id]
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY id"
    cur = get_conn().execute(sql, params)
    return [_row_to_dict(r) for r in cur.fetchall()]


def get_fix(fix_id: int, scan_id: int) -> Optional[dict]:
    cur = get_conn().execute(
        "SELECT * FROM fixes WHERE id = ? AND scan_id = ?",
        (fix_id, scan_id),
    )
    row = cur.fetchone()
    return _row_to_dict(row) if row else None


def update_fix_status(fix_id: int, status: str) -> None:
    applied_at = now_iso() if status == "applied" else None
    get_conn().execute(
        "UPDATE fixes SET status = ?, applied_at = ? WHERE id = ?",
        (status, applied_at, fix_id),
    )


# ----- score history (Phase 7) -----

def upsert_score_history(
    scan_id: int, domain: str,
    gap_count: int, high_severity_gaps: int,
    medium_severity_gaps: int, low_severity_gaps: int,
    fix_count: int, applied_fix_count: int,
    avg_confidence: Optional[float], avg_attribution: Optional[float],
    avg_accuracy: Optional[float], ai_coverage_score: float,
) -> None:
    get_conn().execute(
        """INSERT OR REPLACE INTO score_history
               (scan_id, domain, recorded_at, gap_count, high_severity_gaps,
                medium_severity_gaps, low_severity_gaps, fix_count,
                applied_fix_count, avg_confidence, avg_attribution,
                avg_accuracy, ai_coverage_score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (scan_id, domain, now_iso(), gap_count, high_severity_gaps,
         medium_severity_gaps, low_severity_gaps, fix_count,
         applied_fix_count, avg_confidence, avg_attribution,
         avg_accuracy, ai_coverage_score),
    )


def get_score_history(domain: str, limit: int = 50) -> list[dict]:
    cur = get_conn().execute(
        """SELECT sh.*, s.root_url, s.started_at AS scan_started_at
           FROM score_history sh
           JOIN scans s ON s.id = sh.scan_id
           WHERE sh.domain = ?
           ORDER BY sh.recorded_at ASC
           LIMIT ?""",
        (domain, limit),
    )
    return [_row_to_dict(r) for r in cur.fetchall()]


def list_all_domains() -> list[str]:
    cur = get_conn().execute(
        "SELECT DISTINCT domain FROM score_history ORDER BY domain"
    )
    return [r["domain"] for r in cur.fetchall()]


# ----- internal -----

def _row_to_dict(row) -> dict:
    return {k: row[k] for k in row.keys()}


# Initialize schema on import so the FastAPI app is ready to serve immediately.
init_db()
