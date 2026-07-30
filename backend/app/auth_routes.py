"""Auth and org routes for nayana.ai.

Mounts register, login, refresh, logout, me, email-verify,
org management, API key management, and guest quota status.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.app import auth, auth_db

auth_router = APIRouter()

# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None
    guest_token: Optional[str] = None  # if set, claim their existing guest scans


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    # Optional: the refresh endpoint also accepts the 'nayana_refresh' cookie.
    refresh_token: Optional[str] = None


class CreateApiKeyRequest(BaseModel):
    name: str
    expires_days: Optional[int] = None  # None = never expires


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_COOKIE = auth.GUEST_COOKIE


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        "nayana_refresh", token,
        httponly=True, samesite="lax",
        secure=auth.COOKIE_SECURE,
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie("nayana_refresh")


def _token_pair(user_id: int, org_id: int, role: str, plan: str,
               ip: Optional[str], ua: Optional[str]) -> dict:
    """Create access + refresh tokens and persist the session."""
    access = auth.create_access_token(user_id, org_id, role, plan)
    refresh = auth.generate_refresh_token()
    auth.create_refresh_session(user_id, refresh, ip, ua)
    return {"access_token": access, "refresh_token": refresh, "token_type": "Bearer"}


def _get_ip_ua(request: Request):
    ip = request.client.host if request.client else None
    ua = request.headers.get("User-Agent")
    return ip, ua


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@auth_router.post("/api/auth/register", status_code=201)
def register(req: RegisterRequest, request: Request, response: Response):
    """
    Register a new account.
    - Creates a personal organization (slug derived from email).
    - If guest_token is provided, claims that guest session so prior scans become theirs.
    - Returns JWT access + refresh tokens.
    """
    email = auth.validate_email(req.email)
    auth.validate_password(req.password)

    if auth_db.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    pw_hash = auth.hash_password(req.password)
    user = auth_db.create_user(email, req.name, pw_hash)
    uid = user["id"]

    # Create personal org
    base_slug = auth.email_to_slug(email)
    slug = auth.unique_slug(base_slug)
    org = auth_db.create_org(req.name or email.split("@")[0], slug)
    auth_db.create_membership(uid, org["id"], role="owner")

    # Claim guest session if provided
    if req.guest_token:
        gs = auth_db.get_guest_session(req.guest_token)
        if gs:
            auth_db.claim_guest_session(gs["id"], uid)
            # Transfer guest scans to this org
            from backend.app.db import get_conn
            get_conn().execute(
                "UPDATE scans SET user_id=?, org_id=? WHERE guest_session_id=?",
                (uid, org["id"], gs["id"]),
            )

    ip, ua = _get_ip_ua(request)
    tokens = _token_pair(uid, org["id"], "owner", org["plan"], ip, ua)

    # NOTE: cookies must be set on the Response object that is actually
    # returned — mutations to the injected `response` param are dropped by
    # FastAPI when a Response instance is returned directly.
    resp = JSONResponse(
        status_code=201,
        content={
            "user": {"id": uid, "email": email, "name": user["name"]},
            "org": {"id": org["id"], "slug": org["slug"], "plan": org["plan"]},
            **tokens,
        },
    )
    # Clear guest cookie now that they're registered, and set the refresh cookie.
    resp.delete_cookie(_COOKIE)
    _set_refresh_cookie(resp, tokens["refresh_token"])
    return resp


@auth_router.post("/api/auth/login")
def login(req: LoginRequest, request: Request):
    """Email + password login. Returns JWT access + refresh tokens."""
    email = auth.validate_email(req.email)
    user = auth_db.get_user_by_email(email)
    if not user or not auth.verify_password(req.password, user["password_hash"] or ""):
        raise HTTPException(
            status_code=401,
            detail={"code": "invalid_credentials", "message": "Invalid email or password."},
        )

    org = auth_db.get_primary_org(user["id"])
    if not org:
        raise HTTPException(status_code=500, detail="No organization found for user.")

    ip, ua = _get_ip_ua(request)
    tokens = _token_pair(user["id"], org["id"], org["role"], org["plan"], ip, ua)

    # Cookies must be set on the Response instance that is actually returned;
    # mutations to an injected `response` param are dropped when a Response
    # object is returned directly.
    resp = JSONResponse({
        "user": {"id": user["id"], "email": user["email"], "name": user["name"]},
        "org": {"id": org["id"], "slug": org["slug"], "plan": org["plan"]},
        **tokens,
    })
    _set_refresh_cookie(resp, tokens["refresh_token"])
    return resp


@auth_router.post("/api/auth/refresh")
def refresh_token(req: RefreshRequest, request: Request):
    """
    Rotate a refresh token. Old token is invalidated; new pair is issued.
    Accepts token in body or 'nayana_refresh' cookie.
    """
    token = req.refresh_token or request.cookies.get("nayana_refresh")
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"code": "no_refresh_token", "message": "No refresh token provided."},
        )
    ip, ua = _get_ip_ua(request)
    new_access, new_refresh = auth.rotate_refresh_token(token, ip, ua)
    resp = JSONResponse({"access_token": new_access, "refresh_token": new_refresh, "token_type": "Bearer"})
    _set_refresh_cookie(resp, new_refresh)
    return resp


@auth_router.post("/api/auth/logout")
def logout(request: Request):
    """Invalidate the current refresh token (cookie-based)."""
    token = request.cookies.get("nayana_refresh")
    if token:
        auth.invalidate_refresh_token(token)
    resp = JSONResponse({"ok": True})
    _clear_refresh_cookie(resp)
    return resp


@auth_router.get("/api/auth/me")
def me(identity: auth.Identity = Depends(auth.get_optional_identity)):
    """
    Returns the current identity (guest or user) with feature list and quota.
    Frontend uses this to decide which UI elements to show/gate.
    """
    return JSONResponse(identity.to_dict())


@auth_router.get("/api/auth/verify/{token}")
def verify_email(token: str):
    """Verify email address via token sent in verification email."""
    user = auth_db.get_user_by_verify_token(token)
    if not user:
        raise HTTPException(status_code=404, detail="Invalid or expired verification token.")
    auth_db.set_user_verified(user["id"])
    return JSONResponse({"ok": True, "email": user["email"]})


# ---------------------------------------------------------------------------
# Guest status
# ---------------------------------------------------------------------------

@auth_router.get("/api/guest/status")
def guest_status(identity: auth.Identity = Depends(auth.get_optional_identity)):
    """
    Returns guest quota status and available features.
    Frontend polls this to show the scan counter (e.g. '3 / 5 free scans used').
    """
    return JSONResponse({
        "is_guest": identity.is_guest,
        "scans_used": identity.guest_scans_used,
        "scan_limit": identity.guest_scan_limit,
        "scans_remaining": identity.guest_scans_remaining,
        "features": sorted(identity.features),
        "plan": identity.plan,
        "cta": "register" if identity.is_guest and identity.guest_scans_remaining <= 1 else None,
    })


# ---------------------------------------------------------------------------
# Org endpoints
# ---------------------------------------------------------------------------

@auth_router.get("/api/orgs/{slug}")
def get_org(slug: str, identity: auth.Identity = Depends(auth.require_user)):
    """Get org details. User must be a member."""
    org = auth_db.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    membership = auth_db.get_membership(identity.user_id, org["id"])
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this organization.")
    return JSONResponse({"org": dict(org), "role": membership["role"]})


@auth_router.get("/api/orgs/{slug}/scans")
def org_scans(slug: str, identity: auth.Identity = Depends(auth.require_user)):
    """List scans owned by this org. User must be a member."""
    org = auth_db.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    if not auth_db.get_membership(identity.user_id, org["id"]):
        raise HTTPException(status_code=403, detail="Not a member.")
    scans = auth_db.list_scans_for_org(org["id"])
    return JSONResponse({"org_slug": slug, "scans": scans})


@auth_router.get("/api/orgs/{slug}/members")
def org_members(slug: str, identity: auth.Identity = Depends(auth.require_user)):
    """List org members. User must be owner or admin."""
    org = auth_db.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    m = auth_db.get_membership(identity.user_id, org["id"])
    if not m or m["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Owner or admin access required.")
    return JSONResponse({"members": auth_db.list_org_members(org["id"])})


@auth_router.post("/api/orgs/{slug}/api-keys", status_code=201)
def create_api_key(slug: str, req: CreateApiKeyRequest,
                   identity: auth.Identity = Depends(auth.require_feature("api_access"))):
    """
    Create an API key for the org. Requires pro plan.
    The full key is returned ONCE and never stored. Store it securely.
    """
    org = auth_db.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    if identity.org_id != org["id"]:
        raise HTTPException(status_code=403, detail="Not your organization.")

    expires_at = None
    if req.expires_days:
        from datetime import datetime, timedelta, timezone
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=req.expires_days)
        ).isoformat(timespec="seconds")

    full_key, prefix, key_hash = auth.generate_api_key()
    key_record = auth_db.create_api_key(
        org["id"], identity.user_id, req.name, prefix, key_hash, expires_at
    )
    return JSONResponse(
        status_code=201,
        content={
            "key": full_key,          # shown ONCE
            "prefix": prefix,
            "id": key_record["id"],
            "name": req.name,
            "expires_at": expires_at,
            "warning": "Save this key now. It will not be shown again.",
        },
    )


@auth_router.get("/api/orgs/{slug}/api-keys")
def list_api_keys(slug: str,
                  identity: auth.Identity = Depends(auth.require_user)):
    """List API keys for the org (prefix only, never the full key)."""
    org = auth_db.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    if identity.org_id != org["id"]:
        raise HTTPException(status_code=403, detail="Not your organization.")
    return JSONResponse({"keys": auth_db.list_api_keys(org["id"])})


@auth_router.delete("/api/orgs/{slug}/api-keys/{key_id}")
def delete_api_key(slug: str, key_id: int,
                   identity: auth.Identity = Depends(auth.require_user)):
    """Revoke an API key."""
    org = auth_db.get_org_by_slug(slug)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    m = auth_db.get_membership(identity.user_id, org["id"])
    if not m or m["role"] not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Owner or admin access required.")
    deleted = auth_db.delete_api_key(key_id, org["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Key not found.")
    return JSONResponse({"ok": True})
