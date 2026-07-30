"""Auth DB layer for nayana.ai P9 - tables, migrations, repo functions."""
from __future__ import annotations
from typing import Optional
from backend.app.db import get_conn, transaction, now_iso

AUTH_SCHEMA = """
CREATE TABLE IF NOT EXISTS guest_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    ip_address TEXT, user_agent TEXT,
    scans_used INTEGER NOT NULL DEFAULT 0,
    claimed_by_user INTEGER,
    created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE, name TEXT, password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    is_verified INTEGER NOT NULL DEFAULT 0,
    email_verify_token TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    scan_limit INTEGER NOT NULL DEFAULT 50,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    UNIQUE(user_id, org_id)
);
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL, key_prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE,
    last_used_at TEXT, expires_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    ip_address TEXT, user_agent TEXT,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_token ON guest_sessions(token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_mem_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_mem_org ON memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_apikey_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_sess_hash ON user_sessions(refresh_token_hash);
"""

_SCAN_COLS = [
    "ALTER TABLE scans ADD COLUMN user_id INTEGER",
    "ALTER TABLE scans ADD COLUMN org_id INTEGER",
    "ALTER TABLE scans ADD COLUMN guest_session_id INTEGER",
]


def init_auth_db() -> None:
    """Idempotent: create auth tables + migrate scans. Safe to call on every startup."""
    conn = get_conn()
    conn.executescript(AUTH_SCHEMA)
    for sql in _SCAN_COLS:
        try:
            conn.execute(sql)
        except Exception:
            pass  # column already exists
    for sql in [
        "CREATE INDEX IF NOT EXISTS idx_scans_org ON scans(org_id)",
        "CREATE INDEX IF NOT EXISTS idx_scans_guest ON scans(guest_session_id)",
    ]:
        try:
            conn.execute(sql)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Guest sessions
# ---------------------------------------------------------------------------

def create_guest_session(token: str, ip: Optional[str], ua: Optional[str], expires_at: str) -> int:
    with transaction() as c:
        r = c.execute(
            "INSERT INTO guest_sessions(token,ip_address,user_agent,scans_used,"
            "created_at,last_seen_at,expires_at) VALUES(?,?,?,0,?,?,?)",
            (token, ip, ua, now_iso(), now_iso(), expires_at),
        )
        return r.lastrowid


def get_guest_session(token: str) -> Optional[dict]:
    r = get_conn().execute("SELECT * FROM guest_sessions WHERE token=?", (token,)).fetchone()
    return dict(r) if r else None


def count_guest_scans_for_session(sid: int) -> int:
    r = get_conn().execute(
        "SELECT COUNT(*) n FROM scans WHERE guest_session_id=? AND status!='failed'", (sid,)
    ).fetchone()
    return r["n"]


def claim_guest_session(sid: int, user_id: int) -> None:
    get_conn().execute("UPDATE guest_sessions SET claimed_by_user=? WHERE id=?", (user_id, sid))


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def create_user(email: str, name: Optional[str], password_hash: Optional[str]) -> dict:
    with transaction() as c:
        r = c.execute(
            "INSERT INTO users(email,name,password_hash,role,is_verified,created_at,updated_at)"
            " VALUES(?,?,?,'user',0,?,?)",
            (email.lower().strip(), name, password_hash, now_iso(), now_iso()),
        )
        uid = r.lastrowid
    return get_user_by_id(uid)


def get_user_by_id(uid: int) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,email,name,password_hash,role,is_verified,created_at FROM users WHERE id=?", (uid,)
    ).fetchone()
    return dict(r) if r else None


def get_user_by_email(email: str) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,email,name,password_hash,role,is_verified,created_at FROM users WHERE email=?",
        (email.lower().strip(),),
    ).fetchone()
    return dict(r) if r else None


def set_user_verified(uid: int) -> None:
    get_conn().execute(
        "UPDATE users SET is_verified=1,email_verify_token=NULL,updated_at=? WHERE id=?",
        (now_iso(), uid),
    )


def set_verify_token(uid: int, token: str) -> None:
    get_conn().execute(
        "UPDATE users SET email_verify_token=?,updated_at=? WHERE id=?", (token, now_iso(), uid)
    )


def get_user_by_verify_token(token: str) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,email FROM users WHERE email_verify_token=?", (token,)
    ).fetchone()
    return dict(r) if r else None


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------

def create_org(name: str, slug: str, plan: str = "free") -> dict:
    with transaction() as c:
        r = c.execute(
            "INSERT INTO organizations(name,slug,plan,scan_limit,created_at,updated_at)"
            " VALUES(?,?,?,50,?,?)",
            (name, slug, plan, now_iso(), now_iso()),
        )
        oid = r.lastrowid
    return get_org_by_id(oid)


def get_org_by_id(oid: int) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,name,slug,plan,scan_limit,created_at FROM organizations WHERE id=?", (oid,)
    ).fetchone()
    return dict(r) if r else None


def get_org_by_slug(slug: str) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,name,slug,plan,scan_limit FROM organizations WHERE slug=?", (slug,)
    ).fetchone()
    return dict(r) if r else None


# ---------------------------------------------------------------------------
# Memberships
# ---------------------------------------------------------------------------

def create_membership(user_id: int, org_id: int, role: str = "owner") -> dict:
    with transaction() as c:
        c.execute(
            "INSERT OR IGNORE INTO memberships(user_id,org_id,role,joined_at) VALUES(?,?,?,?)",
            (user_id, org_id, role, now_iso()),
        )
    r = get_conn().execute(
        "SELECT id,user_id,org_id,role,joined_at FROM memberships WHERE user_id=? AND org_id=?",
        (user_id, org_id),
    ).fetchone()
    return dict(r)


def get_primary_org(user_id: int) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT o.id,o.name,o.slug,o.plan,o.scan_limit,m.role"
        " FROM organizations o JOIN memberships m ON m.org_id=o.id"
        " WHERE m.user_id=? AND m.role='owner' ORDER BY o.id LIMIT 1",
        (user_id,),
    ).fetchone()
    return dict(r) if r else None


def get_user_orgs(user_id: int) -> list:
    rows = get_conn().execute(
        "SELECT o.id,o.name,o.slug,o.plan,m.role FROM organizations o"
        " JOIN memberships m ON m.org_id=o.id WHERE m.user_id=? ORDER BY o.id",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_membership(user_id: int, org_id: int) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,user_id,org_id,role FROM memberships WHERE user_id=? AND org_id=?",
        (user_id, org_id),
    ).fetchone()
    return dict(r) if r else None


def list_org_members(org_id: int) -> list:
    rows = get_conn().execute(
        "SELECT u.id,u.email,u.name,m.role,m.joined_at FROM users u"
        " JOIN memberships m ON m.user_id=u.id WHERE m.org_id=? ORDER BY m.joined_at",
        (org_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------

def create_api_key(org_id: int, user_id: int, name: str, key_prefix: str,
                   key_hash: str, expires_at: Optional[str] = None) -> dict:
    with transaction() as c:
        r = c.execute(
            "INSERT INTO api_keys(org_id,user_id,name,key_prefix,key_hash,expires_at,created_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (org_id, user_id, name, key_prefix, key_hash, expires_at, now_iso()),
        )
        kid = r.lastrowid
    r2 = get_conn().execute(
        "SELECT id,org_id,user_id,name,key_prefix,expires_at,created_at FROM api_keys WHERE id=?",
        (kid,),
    ).fetchone()
    return dict(r2)


def get_api_key_by_hash(key_hash: str) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT ak.id,ak.org_id,ak.user_id,ak.name,ak.expires_at,m.role,o.plan"
        " FROM api_keys ak"
        " JOIN organizations o ON o.id=ak.org_id"
        " JOIN memberships m ON m.user_id=ak.user_id AND m.org_id=ak.org_id"
        " WHERE ak.key_hash=?",
        (key_hash,),
    ).fetchone()
    return dict(r) if r else None


def touch_api_key(kid: int) -> None:
    get_conn().execute("UPDATE api_keys SET last_used_at=? WHERE id=?", (now_iso(), kid))


def list_api_keys(org_id: int) -> list:
    rows = get_conn().execute(
        "SELECT id,name,key_prefix,user_id,expires_at,last_used_at,created_at"
        " FROM api_keys WHERE org_id=? ORDER BY created_at DESC",
        (org_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def delete_api_key(kid: int, org_id: int) -> bool:
    r = get_conn().execute("DELETE FROM api_keys WHERE id=? AND org_id=?", (kid, org_id))
    return r.rowcount > 0


# ---------------------------------------------------------------------------
# User sessions (refresh tokens)
# ---------------------------------------------------------------------------

def create_user_session(user_id: int, token_hash: str, ip: Optional[str],
                        ua: Optional[str], expires_at: str) -> int:
    with transaction() as c:
        r = c.execute(
            "INSERT INTO user_sessions(user_id,refresh_token_hash,ip_address,"
            "user_agent,created_at,expires_at) VALUES(?,?,?,?,?,?)",
            (user_id, token_hash, ip, ua, now_iso(), expires_at),
        )
        return r.lastrowid


def get_user_session(token_hash: str) -> Optional[dict]:
    r = get_conn().execute(
        "SELECT id,user_id,expires_at FROM user_sessions WHERE refresh_token_hash=?",
        (token_hash,),
    ).fetchone()
    return dict(r) if r else None


def delete_user_session(token_hash: str) -> None:
    get_conn().execute("DELETE FROM user_sessions WHERE refresh_token_hash=?", (token_hash,))


def delete_all_user_sessions(user_id: int) -> None:
    get_conn().execute("DELETE FROM user_sessions WHERE user_id=?", (user_id,))


# ---------------------------------------------------------------------------
# Scan ownership
# ---------------------------------------------------------------------------

def tag_scan_owner(scan_id: int, *, user_id: Optional[int] = None,
                   org_id: Optional[int] = None,
                   guest_session_id: Optional[int] = None) -> None:
    parts, params = [], []
    if user_id is not None:
        parts.append("user_id=?"); params.append(user_id)
    if org_id is not None:
        parts.append("org_id=?"); params.append(org_id)
    if guest_session_id is not None:
        parts.append("guest_session_id=?"); params.append(guest_session_id)
    if not parts:
        return
    params.append(scan_id)
    get_conn().execute(f"UPDATE scans SET {','.join(parts)} WHERE id=?", params)


def list_scans_for_org(org_id: int, limit: int = 50) -> list:
    rows = get_conn().execute(
        "SELECT id,root_url,started_at,finished_at,status,pages_crawled,chunks_count"
        " FROM scans WHERE org_id=? ORDER BY id DESC LIMIT ?",
        (org_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def list_scans_for_guest(gsid: int) -> list:
    rows = get_conn().execute(
        "SELECT id,root_url,started_at,finished_at,status,pages_crawled,chunks_count"
        " FROM scans WHERE guest_session_id=? ORDER BY id DESC",
        (gsid,),
    ).fetchall()
    return [dict(r) for r in rows]
