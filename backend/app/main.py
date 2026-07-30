import os
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from backend.app.registry import AgentRegistry, AgentCard
from backend.app import db as sqlite_db
from backend.app import crawler as crawler_mod
from backend.app import test_runner as test_runner_mod
from backend.app import llm as llm_mod
from backend.app import gap_analyzer as gap_analyzer_mod
from backend.app import fix_generator as fix_generator_mod
from backend.app import sov as sov_mod
from backend.app import scoring_engine as scoring_engine_mod
from backend.app import auth, auth_db
from backend.app.auth_routes import auth_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Nayana.ai API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup: initialise SQLite schema (idempotent)
# ---------------------------------------------------------------------------

@app.on_event("startup")
def on_startup():
    sqlite_db.init_db()
    auth_db.init_auth_db()
    logger.info("DB initialised (core + auth tables)")


# ---------------------------------------------------------------------------
# Guest cookie middleware
# Sets the nayana_guest cookie whenever get_optional_identity creates a new
# guest session (it stashes the token in request.state.new_guest_token).
# ---------------------------------------------------------------------------

class GuestCookieMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        new_token = getattr(request.state, "new_guest_token", None)
        if new_token:
            response.set_cookie(
                auth.GUEST_COOKIE,
                new_token,
                httponly=True,
                samesite="lax",
                max_age=auth.GUEST_TOKEN_EXPIRE_DAYS * 86400,
            )
        return response


app.add_middleware(GuestCookieMiddleware)

# Include auth + org routes
app.include_router(auth_router)

# Registry instance
registry = AgentRegistry()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class CrawlRequest(BaseModel):
    root_url: str
    max_pages: Optional[int] = 25
    max_depth: Optional[int] = 2
    per_host_delay_ms: Optional[int] = 200


# ---------------------------------------------------------------------------
# Agent registry endpoints
# ---------------------------------------------------------------------------

@app.get("/api/agents", response_model=List[AgentCard])
def list_registered_agents():
    return registry.list_agents()

@app.get("/api/agents/{agent_id}", response_model=AgentCard)
def get_agent(agent_id: str):
    card = registry.get_agent_card(agent_id)
    if not card:
        raise HTTPException(status_code=404, detail="Agent Card not found")
    return card


# ---------------------------------------------------------------------------
# Phase 1: Crawler endpoints
# ---------------------------------------------------------------------------

@app.post("/api/crawl")
def start_crawl(req: CrawlRequest,
                identity: auth.Identity = Depends(auth.get_optional_identity)):
    """Kick off a synchronous crawl of `root_url`.

    Guest users get GUEST_SCAN_LIMIT free scans (default 5). Once exhausted,
    a 402 is returned with a 'register' CTA. Authenticated users are scoped
    to their org.
    """
    # Gate: check guest scan limit BEFORE starting the crawl
    auth.check_guest_scan_limit(identity)

    logger.info("crawl request: %s (max_pages=%s, max_depth=%s) [%s]",
                req.root_url, req.max_pages, req.max_depth, identity.kind)
    cfg = {
        "max_pages": req.max_pages,
        "max_depth": req.max_depth,
        "per_host_delay_ms": req.per_host_delay_ms,
    }
    scan = crawler_mod.run_crawl(req.root_url, cfg)

    # Tag scan with owner (user/org or guest session)
    scan_id = scan.get("id")
    if scan_id:
        if identity.is_guest and identity.guest_session_id:
            auth_db.tag_scan_owner(scan_id, guest_session_id=identity.guest_session_id)
        elif identity.is_authenticated:
            auth_db.tag_scan_owner(scan_id, user_id=identity.user_id, org_id=identity.org_id)

    result = {"status": scan.get("status", "unknown"), "scan": _serialize_scan(scan)}

    # Include quota info in response so frontend can update the counter
    if identity.is_guest:
        used = auth_db.count_guest_scans_for_session(identity.guest_session_id) if identity.guest_session_id else 0
        result["guest_quota"] = {
            "scans_used": used,
            "scan_limit": identity.guest_scan_limit,
            "scans_remaining": max(0, identity.guest_scan_limit - used),
        }

    return JSONResponse(content=result)


@app.get("/api/scans")
def list_scans(limit: int = 50):
    return JSONResponse(content={"scans": sqlite_db.list_scans(limit=limit)})


@app.get("/api/scans/{scan_id}")
def get_scan(scan_id: int):
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    payload = _serialize_scan(scan)
    payload["page_type_breakdown"] = sqlite_db.page_type_breakdown(scan_id)
    return JSONResponse(content=payload)


@app.get("/api/scans/{scan_id}/pages")
def list_scan_pages(scan_id: int, page_type: Optional[str] = None, limit: int = 500):
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    rows = sqlite_db.list_pages(scan_id, page_type=page_type, limit=limit)
    return JSONResponse(content={"scan_id": scan_id, "pages": rows})


@app.get("/api/scans/{scan_id}/chunks")
def list_scan_chunks(scan_id: int, page_id: Optional[int] = None, limit: int = 500):
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    rows = sqlite_db.list_chunks(scan_id, page_id=page_id, limit=limit)
    return JSONResponse(content={"scan_id": scan_id, "chunks": rows})


@app.get("/api/pages/{page_id}")
def get_page_detail(page_id: int):
    page = sqlite_db.get_page(page_id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    chunks = sqlite_db.list_chunks(page["scan_id"], page_id=page_id, limit=2000)
    return JSONResponse(content={"page": page, "chunks": chunks})


@app.get("/api/chunks/{chunk_id}")
def get_chunk_detail(chunk_id: int):
    chunk = sqlite_db.get_chunk(chunk_id)
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")
    return JSONResponse(content={"chunk": chunk})


@app.get("/api/scans/{scan_id}/gaps")
def list_scan_gaps(scan_id: int):
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    gaps = gap_analyzer_mod.analyze(scan_id)
    return JSONResponse(content={"scan_id": scan_id, "gaps": gaps})


def _serialize_scan(scan: dict) -> dict:
    """Parse JSON-encoded config_json back into a dict for the response."""
    import json as _json
    out = dict(scan)
    cfg = out.pop("config_json", None)
    if cfg:
        try:
            out["config"] = _json.loads(cfg)
        except Exception:
            out["config"] = None
    else:
        out["config"] = None
    return out


# ---------------------------------------------------------------------------
# Phase 3: Multi-LLM test endpoints
# ---------------------------------------------------------------------------

class TestRunRequest(BaseModel):
    scan_id: int
    brand: Optional[str] = None
    domain: Optional[str] = None
    competitors: Optional[List[str]] = None

@app.post("/api/test/run")
async def test_run(req: TestRunRequest):
    """Run the full multi-LLM test pipeline for a scan."""
    scan = sqlite_db.get_scan(req.scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Clear previous answers for this scan so runs are idempotent
    sqlite_db.delete_answers_for_scan(req.scan_id)

    try:
        art = await test_runner_mod.run_test(
            req.scan_id,
            brand=req.brand or "",
            domain=req.domain or "",
            competitors=req.competitors or [],
        )
        status = "success" if not art.errors else "partial"
        return JSONResponse(content={
            "status": status,
            "scan_id": art.scan_id,
            "providers": art.adapters_used,
            "questions_generated": art.questions_generated,
            "answers_generated": art.answers_generated,
            "errors": art.errors,
        })
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.get("/api/test/{scan_id}/summary")
def test_summary(scan_id: int):
    """Aggregated multi-LLM scores for a scan."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    from collections import defaultdict

    questions = sqlite_db.list_questions(scan_id)
    scores = sqlite_db.scores_for_scan(scan_id)

    # per-provider aggregates
    agg: dict[str, dict] = defaultdict(lambda: {
        "total": 0, "errors": 0,
        "conf_sum": 0.0, "attr_sum": 0.0, "hedge_sum": 0.0,
        "brand_hits": 0, "domain_citations": 0, "competitor_hits": 0,
        "refusal_count": 0, "accuracy_sum": 0.0, "accuracy_count": 0,
    })
    for row in scores:
        p = row["provider"]
        d = agg[p]
        d["total"] += 1
        if row.get("error"):
            d["errors"] += 1
        d["conf_sum"] += row.get("confidence", 0) or 0
        d["attr_sum"] += row.get("attribution", 0) or 0
        d["hedge_sum"] += row.get("hedge_rate", 0) or 0
        d["brand_hits"] += row.get("has_brand_mention", 0) or 0
        d["domain_citations"] += row.get("has_domain_citation", 0) or 0
        d["competitor_hits"] += row.get("has_competitor_mention", 0) or 0
        d["refusal_count"] += row.get("is_refusal", 0) or 0
        if row.get("accuracy") is not None:
            d["accuracy_sum"] += row["accuracy"]
            d["accuracy_count"] += 1

    per_provider = {}
    for provider, d in agg.items():
        n = d["total"] or 1
        per_provider[provider] = {
            "total_answers": d["total"],
            "errors": d["errors"],
            "avg_confidence": round(d["conf_sum"] / n, 3),
            "avg_attribution": round(d["attr_sum"] / n, 3),
            "avg_hedge_rate": round(d["hedge_sum"] / n, 3),
            "brand_mention_rate": round(d["brand_hits"] / n, 3),
            "domain_citation_rate": round(d["domain_citations"] / n, 3),
            "competitor_mention_rate": round(d["competitor_hits"] / n, 3),
            "refusal_rate": round(d["refusal_count"] / n, 3),
        }
        if d["accuracy_count"]:
            per_provider[provider]["avg_accuracy"] = round(
                d["accuracy_sum"] / d["accuracy_count"], 3)

    return JSONResponse({
        "scan_id": scan_id,
        "question_count": len(questions),
        "per_provider": per_provider,
    })


@app.get("/api/test/{scan_id}/questions")
def test_questions(scan_id: int):
    """Return questions generated for a test run."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    qs = sqlite_db.list_questions(scan_id)
    return JSONResponse({"scan_id": scan_id, "questions": qs})


@app.get("/api/test/{scan_id}/answers")
def test_answers(scan_id: int, provider: Optional[str] = None, limit: int = 500):
    """Return answers (with scores) for a test run."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    answers = sqlite_db.list_answers(scan_id, provider=provider, limit=limit)
    return JSONResponse({"scan_id": scan_id, "answers": answers})


@app.delete("/api/test/{scan_id}")
def test_delete(scan_id: int):
    """Delete all test results for a scan (cascades to answers + scores)."""
    count = sqlite_db.delete_answers_for_scan(scan_id)
    return JSONResponse({"scan_id": scan_id, "deleted_answers": count})


@app.get("/api/test/keys")
def test_keys():
    """Diagnostics: which LLM provider keys are currently configured."""
    from backend.app.llm import key_status
    return JSONResponse(key_status())


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return JSONResponse({"status": "ok", "version": "2.0.0"})


# ---------------------------------------------------------------------------
# Phase 5: Fix Generator
# ---------------------------------------------------------------------------

class FixStatusUpdate(BaseModel):
    status: str  # applied | dismissed | pending


@app.get("/api/scans/{scan_id}/fixes")
def list_fixes(scan_id: int, status: Optional[str] = None):
    """List all generated fixes for a scan, optionally filtered by status."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    fixes = sqlite_db.list_fixes(scan_id, status=status)
    return JSONResponse({"scan_id": scan_id, "fixes": fixes, "total": len(fixes)})


@app.post("/api/scans/{scan_id}/fixes/generate")
def generate_fixes(scan_id: int, force: bool = False,
                   identity: auth.Identity = Depends(auth.require_feature("fix_generate"))):
    """Generate (or regenerate) LLM-powered fixes for all gaps in a scan.
    Requires a free account. Guests are prompted to register.
    """
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    try:
        fixes = fix_generator_mod.generate(scan_id, force=force)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JSONResponse({
        "scan_id": scan_id,
        "generated": len(fixes),
        "fixes": fixes,
    })


@app.get("/api/scans/{scan_id}/fixes/{fix_id}")
def get_fix(scan_id: int, fix_id: int):
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    fix = sqlite_db.get_fix(fix_id, scan_id)
    if not fix:
        raise HTTPException(status_code=404, detail="Fix not found")
    return JSONResponse({"fix": fix})


@app.post("/api/scans/{scan_id}/fixes/{fix_id}/apply")
def apply_fix(scan_id: int, fix_id: int):
    """Mark a fix as applied (content must be applied manually or via PR)."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    fix = sqlite_db.get_fix(fix_id, scan_id)
    if not fix:
        raise HTTPException(status_code=404, detail="Fix not found")
    sqlite_db.update_fix_status(fix_id, "applied")
    updated = sqlite_db.get_fix(fix_id, scan_id)
    return JSONResponse({"status": "applied", "fix": updated})


@app.post("/api/scans/{scan_id}/fixes/{fix_id}/dismiss")
def dismiss_fix(scan_id: int, fix_id: int):
    """Mark a fix as dismissed (won't show in pending list)."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    fix = sqlite_db.get_fix(fix_id, scan_id)
    if not fix:
        raise HTTPException(status_code=404, detail="Fix not found")
    sqlite_db.update_fix_status(fix_id, "dismissed")
    updated = sqlite_db.get_fix(fix_id, scan_id)
    return JSONResponse({"status": "dismissed", "fix": updated})


# ---------------------------------------------------------------------------
# Phase 7: AI Visibility Score & History
# ---------------------------------------------------------------------------

@app.get("/api/scans/{scan_id}/score")
def get_scan_score(scan_id: int, save: bool = True):
    """Compute the AI visibility score for a scan."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    result = scoring_engine_mod.compute(scan_id, save=save)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return JSONResponse(result)


@app.get("/api/domains/{domain}/history")
def get_domain_history(domain: str, limit: int = 50,
                       identity: auth.Identity = Depends(auth.require_feature("history"))):
    """Return score history trend for a domain. Requires a free account."""
    rows = sqlite_db.get_score_history(domain=domain, limit=limit)
    return JSONResponse({"domain": domain, "history": rows})


@app.get("/api/domains")
def list_domains():
    """List all domains that have score history."""
    domains = sqlite_db.list_all_domains()
    return JSONResponse({"domains": domains})


# ---------------------------------------------------------------------------
# Phase 6: Competitor SOV
# ---------------------------------------------------------------------------

class SovLinkRequest(BaseModel):
    parent_scan_id: int
    competitor_scan_id: int
    competitor_url: str


@app.post("/api/sov/link")
def link_competitor(req: SovLinkRequest,
                    identity: auth.Identity = Depends(auth.require_feature("sov"))):
    """Link a competitor scan to a target scan for SOV comparison. Requires pro plan."""
    parent = sqlite_db.get_scan(req.parent_scan_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent scan not found")
    comp = sqlite_db.get_scan(req.competitor_scan_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor scan not found")
    result = sov_mod.link_competitor(
        req.parent_scan_id, req.competitor_scan_id, req.competitor_url
    )
    return JSONResponse(result)


@app.get("/api/sov/{scan_id}")
def get_sov(scan_id: int):
    """Return share-of-voice comparison for target scan vs linked competitors."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    result = sov_mod.compare(scan_id)
    return JSONResponse(result)


@app.get("/api/sov/{scan_id}/competitors")
def list_sov_competitors(scan_id: int):
    """List competitor scans linked to this target scan."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    competitors = sov_mod.list_competitor_links(scan_id)
    return JSONResponse({"scan_id": scan_id, "competitors": competitors})


# ---------------------------------------------------------------------------
# Admin: Browser LLM auth management
# ---------------------------------------------------------------------------
# These routes let you authenticate browser-based LLM providers (Claude, Gemini,
# Grok) by opening a real visible browser window. ChatGPT and Perplexity work
# without authentication. All sessions are stored as cookies in backend/browser/sessions/
# ---------------------------------------------------------------------------

@app.get("/api/admin/llm-auth/status")
def llm_auth_status():
    """
    Returns authentication status for all browser LLM providers.
    Also shows whether Puppeteer is installed and ready.
    """
    try:
        from backend.app.browser_adapter import all_session_status, is_browser_ready, _puppeteer_installed
        return JSONResponse({
            "puppeteer_installed": _puppeteer_installed(),
            "browser_ready": is_browser_ready(),
            "providers": all_session_status(),
            "note": {
                "chatgpt": "Works without auth (unauthenticated). Auth optional for higher limits.",
                "perplexity": "Works without auth. Auth optional.",
                "claude": "Requires auth via POST /api/admin/llm-auth/start/claude",
                "gemini": "Requires auth via POST /api/admin/llm-auth/start/gemini",
                "grok": "Requires auth via POST /api/admin/llm-auth/start/grok",
            }
        })
    except Exception as e:
        return JSONResponse({"error": str(e), "puppeteer_installed": False}, status_code=500)


@app.post("/api/admin/llm-auth/start/{provider}")
def llm_auth_start(provider: str, timeout: int = 300):
    """
    Opens a VISIBLE browser window so you can log in to the specified provider.
    Blocks until login is detected (up to `timeout` seconds) then saves the session.

    Providers: chatgpt, perplexity, claude, gemini, grok
    Example: POST /api/admin/llm-auth/start/claude?timeout=300

    WARNING: This opens a real browser on the server machine. Only use on local dev.
    """
    valid_providers = {"chatgpt", "perplexity", "claude", "gemini", "grok"}
    if provider not in valid_providers:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{provider}'. Valid: {', '.join(sorted(valid_providers))}"
        )
    try:
        from backend.app.browser_adapter import start_auth
        result = start_auth(provider, timeout_s=timeout)
        if result.get("ok"):
            return JSONResponse({
                "ok": True,
                "provider": provider,
                "savedAt": result.get("savedAt"),
                "message": f"Session saved for {provider}. You can now run tests and generate fixes.",
            })
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Auth failed"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/llm-auth/{provider}")
def llm_auth_clear(provider: str):
    """
    Clears the saved session for a provider, effectively logging out.
    The next test run will use other available providers.
    """
    try:
        from backend.app.browser_adapter import clear_auth
        result = clear_auth(provider)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/llm-auth/test/{provider}")
def llm_auth_test(provider: str, question: str = "What is 2 + 2? Answer in one sentence."):
    """
    Quick smoke-test: ask a simple question through the specified browser provider
    and return the answer. Useful for verifying a session works before a full test run.
    """
    valid_providers = {"chatgpt", "perplexity", "claude", "gemini", "grok"}
    if provider not in valid_providers:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{provider}'. Valid: {', '.join(sorted(valid_providers))}"
        )
    try:
        from backend.app.browser_adapter import BrowserAdapter, is_browser_ready
        if not is_browser_ready():
            raise HTTPException(
                status_code=409,
                detail="Puppeteer not installed. Run: cd backend/browser && npm install && npm run install-browsers"
            )
        adapter = BrowserAdapter(provider, timeout_s=60)
        result = adapter.complete(question)
        return JSONResponse({
            "provider": provider,
            "question": question,
            "answer": result.answer_text,
            "latency_ms": result.latency_ms,
            "error": result.error,
            "ok": result.ok,
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Serving Next.js static build files
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    logger.info(f"Serving static frontend files from: {static_dir}")
else:
    logger.warning(f"Static directory not found at: {static_dir}. Serving standalone API mode.")
