"""Authentication and identity for nayana.ai.

Covers password hashing, JWT access tokens, opaque refresh tokens,
guest sessions, API keys, feature gating, and FastAPI dependency helpers.
"""
from __future__ import annotations

import hashlib
import os
import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

try:
    import bcrypt
    _BCRYPT_OK = True
except ImportError:
    _BCRYPT_OK = False

try:
    import jwt as pyjwt
    _JWT_OK = True
except ImportError:
    _JWT_OK = False

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app import auth_db

# ---------------------------------------------------------------------------
# Config (override via environment)
# ---------------------------------------------------------------------------

import logging

logger = logging.getLogger(__name__)

_DEFAULT_JWT_SECRET = "nayana-dev-secret-CHANGE-IN-PROD"
JWT_SECRET = os.getenv("JWT_SECRET", _DEFAULT_JWT_SECRET)
if JWT_SECRET == _DEFAULT_JWT_SECRET:
    logger.warning(
        "JWT_SECRET is the built-in dev default — set the JWT_SECRET "
        "environment variable before deploying to production."
    )
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
GUEST_TOKEN_EXPIRE_DAYS = int(os.getenv("GUEST_TOKEN_EXPIRE_DAYS", "30"))
GUEST_SCAN_LIMIT = int(os.getenv("GUEST_SCAN_LIMIT", "5"))
GUEST_COOKIE = "nayana_guest"
API_KEY_PREFIX = "nai_"
# Set COOKIE_SECURE=1 in production (HTTPS) so auth cookies are marked Secure.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0").strip() == "1"

# ---------------------------------------------------------------------------
# Feature sets — what each plan/tier can do
# ---------------------------------------------------------------------------

# Feature strings used in require_feature() and Identity.has_feature()
# These are internal gate names — frontend maps UI states to these.
GUEST_FEATURES: Set[str] = {
    "crawl",         # start a new scan
    "scan_read",     # read own scan results (pages, chunks)
    "gaps",          # view gap analysis
    "basic_score",   # view the single aggregate AEO score
    "llm_test",      # run the multi-LLM test (the core "comparison")
}

FREE_FEATURES: Set[str] = GUEST_FEATURES | {
    "fixes",         # view fix suggestions
    "fix_generate",  # generate fixes via LLM
    "history",       # score history for their own domains
    "domains",       # domain list + trend
}

PRO_FEATURES: Set[str] = FREE_FEATURES | {
    "sov",           # share-of-voice competitor comparison
    "fix_apply",     # mark fixes applied / dismissed
    "export",        # export reports
    "api_access",    # use API keys for programmatic access
    "multi_domain",  # unlimited domains
}

ADMIN_FEATURES: Set[str] = PRO_FEATURES | {"admin"}

PLAN_FEATURES = {
    "guest": GUEST_FEATURES,
    "free":  FREE_FEATURES,
    "pro":   PRO_FEATURES,
    "team":  PRO_FEATURES,
    "enterprise": ADMIN_FEATURES,
    "admin": ADMIN_FEATURES,
}

# Scan limits per plan (-1 = unlimited)
PLAN_SCAN_LIMIT = {
    "free": 50,
    "pro": -1,
    "team": -1,
    "enterprise": -1,
    "admin": -1,
}


# ---------------------------------------------------------------------------
# Identity — the resolved caller for every request
# ---------------------------------------------------------------------------

class Identity:
    """
    Represents the authenticated (or anonymous) caller of any API request.

    Attach via:
        identity = Depends(get_optional_identity)    # never raises
        identity = Depends(require_user)             # raises 401 for guests
    """

    def __init__(
        self,
        *,
        kind: str,                           # "guest" | "user" | "api_key"
        user_id: Optional[int] = None,
        org_id: Optional[int] = None,
        role: str = "viewer",                # owner | admin | member | viewer | guest
        plan: str = "free",                  # free | pro | team | enterprise | guest
        guest_session_id: Optional[int] = None,
        guest_scans_used: int = 0,
        guest_scan_limit: int = GUEST_SCAN_LIMIT,
    ):
        self.kind = kind
        self.user_id = user_id
        self.org_id = org_id
        self.role = role
        self.plan = plan
        self.guest_session_id = guest_session_id
        self.guest_scans_used = guest_scans_used
        self.guest_scan_limit = guest_scan_limit
        self.features: Set[str] = PLAN_FEATURES.get(plan, GUEST_FEATURES)

    # -- convenience ---

    @property
    def is_guest(self) -> bool:
        return self.kind == "guest"

    @property
    def is_authenticated(self) -> bool:
        return self.kind in ("user", "api_key")

    @property
    def guest_scans_remaining(self) -> int:
        if not self.is_guest:
            return -1
        return max(0, self.guest_scan_limit - self.guest_scans_used)

    def has_feature(self, feature: str) -> bool:
        return feature in self.features

    def require_feature(self, feature: str) -> None:
        """Raise 403 with a structured payload if feature is not available."""
        if not self.has_feature(feature):
            if self.is_guest:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "feature_requires_account",
                        "feature": feature,
                        "message": "Create a free account to unlock this feature.",
                        "cta": "register",
                    },
                )
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "feature_requires_upgrade",
                    "feature": feature,
                    "current_plan": self.plan,
                    "message": f"This feature requires a higher plan.",
                    "cta": "upgrade",
                },
            )

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "user_id": self.user_id,
            "org_id": self.org_id,
            "role": self.role,
            "plan": self.plan,
            "is_guest": self.is_guest,
            "features": sorted(self.features),
            "guest_scans_used": self.guest_scans_used,
            "guest_scan_limit": self.guest_scan_limit,
            "guest_scans_remaining": self.guest_scans_remaining,
        }


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(plain: str) -> str:
    if not _BCRYPT_OK:
        raise RuntimeError("bcrypt not installed. Run: pip install bcrypt")
    hashed = bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12))
    return hashed.decode()


def verify_password(plain: str, hashed: str) -> bool:
    if not _BCRYPT_OK:
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def create_access_token(user_id: int, org_id: int, role: str, plan: str) -> str:
    """Create a short-lived JWT access token."""
    if not _JWT_OK:
        raise RuntimeError("PyJWT not installed. Run: pip install PyJWT")
    now = _now_ts()
    payload = {
        "sub": f"user:{user_id}",
        "uid": user_id,
        "org": org_id,
        "role": role,
        "plan": plan,
        "iat": now,
        "exp": now + ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate JWT. Raises HTTPException on failure."""
    if not _JWT_OK:
        raise HTTPException(status_code=500, detail="JWT library not installed")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "token_expired", "message": "Access token expired."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "token_invalid", "message": str(e)},
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# Refresh token helpers (opaque random tokens, stored as sha256 hash)
# ---------------------------------------------------------------------------

def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def generate_refresh_token() -> str:
    return secrets.token_hex(32)  # 64-char hex string


def create_refresh_session(user_id: int, token: str,
                           ip: Optional[str], ua: Optional[str]) -> None:
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    ).isoformat(timespec="seconds")
    auth_db.create_user_session(user_id, _sha256(token), ip, ua, expires_at)


def rotate_refresh_token(old_token: str, ip: Optional[str],
                         ua: Optional[str]) -> tuple[str, str]:
    """
    Validate old refresh token, delete it, issue a new pair.
    Returns (new_access_token, new_refresh_token).
    Raises 401 if old token is invalid or expired.
    """
    session = auth_db.get_user_session(_sha256(old_token))
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "refresh_invalid", "message": "Refresh token not found or already used."},
        )
    expires_at = session["expires_at"]
    if expires_at and expires_at < datetime.now(timezone.utc).isoformat(timespec="seconds"):
        auth_db.delete_user_session(_sha256(old_token))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "refresh_expired", "message": "Refresh token expired. Please log in again."},
        )

    user_id = session["user_id"]
    user = auth_db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "user_not_found"})

    org = auth_db.get_primary_org(user_id)
    org_id = org["id"] if org else 0
    role = org["role"] if org else "member"
    plan = org["plan"] if org else "free"

    # Rotate: delete old session, create new one
    auth_db.delete_user_session(_sha256(old_token))
    new_refresh = generate_refresh_token()
    create_refresh_session(user_id, new_refresh, ip, ua)
    new_access = create_access_token(user_id, org_id, role, plan)
    return new_access, new_refresh


def invalidate_refresh_token(token: str) -> None:
    auth_db.delete_user_session(_sha256(token))


# ---------------------------------------------------------------------------
# API Key helpers
# ---------------------------------------------------------------------------

def generate_api_key() -> tuple[str, str, str]:
    """
    Returns (full_key, prefix, key_hash).
    full_key is shown once to the user and never stored.
    key_hash (sha256) is stored in the DB.
    prefix (first 12 chars) is shown in the key listing.
    """
    raw = secrets.token_hex(24)          # 48 hex chars
    full_key = f"{API_KEY_PREFIX}{raw}"  # nai_<48chars>
    prefix = full_key[:12]               # nai_<8chars>
    key_hash = _sha256(full_key)
    return full_key, prefix, key_hash


def verify_api_key(full_key: str) -> Optional[Identity]:
    """Look up and validate an API key. Returns Identity or None."""
    if not full_key.startswith(API_KEY_PREFIX):
        return None
    key_hash = _sha256(full_key)
    row = auth_db.get_api_key_by_hash(key_hash)
    if row is None:
        return None
    # Check expiry
    if row.get("expires_at"):
        if row["expires_at"] < datetime.now(timezone.utc).isoformat(timespec="seconds"):
            return None
    auth_db.touch_api_key(row["id"])
    return Identity(
        kind="api_key",
        user_id=row["user_id"],
        org_id=row["org_id"],
        role=row["role"],
        plan=row["plan"],
    )


# ---------------------------------------------------------------------------
# Guest session helpers
# ---------------------------------------------------------------------------

def create_guest_token(ip: Optional[str], ua: Optional[str]) -> tuple[str, int]:
    """
    Create a new guest session. Returns (token, session_id).
    Token is stored in a browser cookie.
    """
    token = secrets.token_hex(32)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=GUEST_TOKEN_EXPIRE_DAYS)
    ).isoformat(timespec="seconds")
    session_id = auth_db.create_guest_session(token, ip, ua, expires_at)
    return token, session_id


def resolve_guest(token: str) -> Optional[Identity]:
    """Resolve a guest token to an Identity. Returns None if invalid/expired."""
    session = auth_db.get_guest_session(token)
    if session is None:
        return None
    # Check expiry
    if session.get("expires_at") and session["expires_at"] < \
            datetime.now(timezone.utc).isoformat(timespec="seconds"):
        return None
    # Count actual scans linked to this session
    scans_used = auth_db.count_guest_scans_for_session(session["id"])
    return Identity(
        kind="guest",
        guest_session_id=session["id"],
        guest_scans_used=scans_used,
        guest_scan_limit=GUEST_SCAN_LIMIT,
        plan="guest",
        role="guest",
    )


def check_guest_scan_limit(identity: Identity) -> None:
    """
    Raise 402 with a structured payload if the guest has hit their scan limit.
    Call this inside any endpoint that creates a new scan.
    """
    if not identity.is_guest:
        return
    if identity.guest_scans_used >= identity.guest_scan_limit:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "guest_limit_reached",
                "scans_used": identity.guest_scans_used,
                "limit": identity.guest_scan_limit,
                "message": (
                    f"You've used all {identity.guest_scan_limit} free scans. "
                    "Create a free account to continue."
                ),
                "cta": "register",
            },
        )


# ---------------------------------------------------------------------------
# Email / slug validation helpers
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$")


def validate_email(email: str) -> str:
    email = email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Invalid email address.")
    return email


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")


def email_to_slug(email: str) -> str:
    """Derive a default org slug from an email. 'user@example.com' → 'user-example'."""
    local = email.split("@")[0]
    slug = re.sub(r"[^a-z0-9]+", "-", local.lower()).strip("-")[:40]
    if not slug:
        slug = "org"
    return slug


def unique_slug(base: str) -> str:
    """Ensure slug is unique in DB by appending a suffix."""
    slug = base
    i = 1
    while auth_db.get_org_by_slug(slug):
        slug = f"{base}-{i}"
        i += 1
    return slug


# ---------------------------------------------------------------------------
# FastAPI bearer extractor (does NOT raise on missing token)
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False)


async def get_optional_identity(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Identity:
    """
    Resolves the caller identity without ever raising 401.
    Priority:
      1. Authorization: Bearer <jwt>          → authenticated user (JWT)
      2. Authorization: ApiKey nai_<key>       → authenticated user (API key)
      3. X-Guest-Token: <token> header         → guest
      4. nayana_guest cookie                   → guest
      5. New guest session created + set cookie → guest (first visit)

    Attaches identity to request.state.identity for middleware use.
    Sets the guest cookie on the response if a new session was created.
    """
    # 1. JWT Bearer token
    if creds and creds.scheme == "Bearer":
        try:
            payload = decode_access_token(creds.credentials)
            user_id = payload.get("uid")
            org_id = payload.get("org", 0)
            role = payload.get("role", "member")
            plan = payload.get("plan", "free")
            identity = Identity(
                kind="user",
                user_id=user_id,
                org_id=org_id,
                role=role,
                plan=plan,
            )
            request.state.identity = identity
            return identity
        except HTTPException:
            pass  # Fall through to guest

    # 2. API key (Authorization: ApiKey nai_...)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("ApiKey "):
        full_key = auth_header.removeprefix("ApiKey ").strip()
        identity = verify_api_key(full_key)
        if identity:
            request.state.identity = identity
            return identity

    # 3. Guest token from header (for SPAs that prefer headers)
    guest_token = request.headers.get("X-Guest-Token")

    # 4. Guest token from cookie
    if not guest_token:
        guest_token = request.cookies.get(GUEST_COOKIE)

    if guest_token:
        identity = resolve_guest(guest_token)
        if identity:
            request.state.identity = identity
            return identity

    # 5. No valid identity found — create a new guest session.
    #    We need to set a cookie on the response, but FastAPI deps can't do that
    #    directly. We stash the new token in request.state for the route/middleware
    #    to pick up and set via a response cookie.
    ip = request.client.host if request.client else None
    ua = request.headers.get("User-Agent")
    token, session_id = create_guest_token(ip, ua)
    request.state.new_guest_token = token  # route handler reads this
    identity = Identity(
        kind="guest",
        guest_session_id=session_id,
        guest_scans_used=0,
        guest_scan_limit=GUEST_SCAN_LIMIT,
        plan="guest",
        role="guest",
    )
    request.state.identity = identity
    return identity


async def require_user(
    identity: Identity = Depends(get_optional_identity),
) -> Identity:
    """Raises 401 if the caller is a guest."""
    if identity.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "login_required",
                "message": "You must be logged in to access this resource.",
                "cta": "login",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    return identity


def require_feature(feature: str):
    """
    FastAPI dependency factory: injects identity and gates on a feature.

    Usage:
        @app.post("/api/scans/{id}/fixes/generate")
        def gen_fixes(identity=Depends(require_feature("fix_generate"))):
            ...
    """
    async def _dep(identity: Identity = Depends(get_optional_identity)) -> Identity:
        identity.require_feature(feature)
        return identity
    return _dep
