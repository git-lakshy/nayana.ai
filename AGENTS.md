# nayana.ai — Agent Guide

AI Visibility & Perception Engine (AEO platform). Scans a website, measures how well AI answer engines can answer real user questions from its content, finds content gaps, generates developer-ready fixes, and tracks share-of-voice vs competitors.

## Stack
- **Backend**: Python 3.11 · FastAPI · SQLite (WAL) · uvicorn — `backend/app/`
- **Frontend**: Next.js 16 (App Router, `output: "export"`, trailingSlash) · React 19 · Tailwind v4 · framer-motion · recharts · lucide-react — `frontend/`
- Backend serves the exported frontend from `backend/static/` at `/` on port 8000.

## Run
```
nayana.bat                                          # both: backend :8000 + frontend dev :3000
python -m uvicorn backend.app.main:app --port 8000  # backend only (run from repo root)
cd frontend && npm run dev                          # frontend dev only
```
Health check: `GET http://127.0.0.1:8000/api/health` → `{"status":"ok"}`

## Build & deploy frontend into backend
```
cd frontend && npm run build              # static export to frontend/out
robocopy frontend\out backend\static /MIR # NOTE: robocopy exit codes 0-3 are success
```

## Layout
- `backend/app/` — `main.py` (all API routes), `db.py`, `auth.py` / `auth_db.py` / `auth_routes.py`, `crawler.py`, `page_extract.py`, `chunker.py`, `page_type.py`, `gap_analyzer.py`, `scorer.py` + `scoring_engine.py`, `embeddings.py`, `llm.py`, `browser_adapter.py`, `test_runner.py`, `fix_generator.py`, `sov.py`, `agents.py`, `registry.py`
- `frontend/src/app/` — routes: `/` (landing), `/login`, `/dashboard`, `/scan` (`?id=N`), `/domains`, `/settings`, `/admin` (admin console; `admin.<domain>` redirects here via backend middleware)
- `frontend/src/components/` — `nav/` (AppShell, PillNav), `ui/` (GlassCard, BadgeChip, Logo, ScoreGauge, ScorePill, Sparkline, StatCard, TerminalPanel), `bg/DotMatrix`, `dashboard/`, `scan/` (tabs: Overview, Pages, TestLab, Gaps, Fixes, Sov)
- `frontend/src/lib/` — `api.ts` (`api.get/post/delete<T>`, `ApiError.status`), `auth.tsx` (`useAuth()`: identity, isGuest, isAuthenticated, hasFeature, login/register/logout), `types.ts`
- `cli/aeo.py` — CLI entry · `docs/` — api-guide.md, integrations.md · `Dockerfile`

## API surface (defined in backend/app/main.py + auth_routes.py)
- auth: `/api/auth/{register,login,refresh,logout,me}` · `/api/guest/status`
- scan: `POST /api/crawl` · `/api/scans`, `/{id}`, `/{id}/{pages,chunks,gaps,score}`
- fixes: `/api/scans/{id}/fixes` · `POST .../fixes/generate` · `/api/scans/{id}/fixes/{fid}/{apply,dismiss}`
- test lab: `POST /api/test/run` · `/api/test/{id}/{summary,questions,answers}` · `/api/test/keys` · `DELETE /api/test/{id}`
- domains: `/api/domains` · `/api/domains/{domain}/history?limit=`
- sov (PRO): `POST /api/sov/link` · `/api/sov/{id}` · `/api/sov/{id}/competitors`
- admin: `/api/admin/llm-auth/{status,start/{provider},test/{provider}}` · `DELETE /api/admin/llm-auth/{provider}`
- There are **no API-key CRUD endpoints** — provider keys are environment variables only.

## Auth & plans
- Cookies: `nayana_refresh`, `nayana_guest`; access token kept in memory (15 min), refresh flow in `lib/auth.tsx`.
- Plans: GUEST (crawl, scan_read, gaps, basic_score, llm_test) → FREE (+fixes, fix_generate, history, domains) → PRO (+sov, fix_apply, export, api_access, multi_domain) → ADMIN.
- Gating is enforced server-side (`require_feature` → 403 with structured payload) and mirrored client-side (`hasFeature` → lock card with /login CTA).

## Admin access (owner/deployer only)
- Admin endpoints (`/api/admin/llm-auth/*`, `/api/test/keys`) are gated by `require_admin` in `backend/app/main.py`. It allows only:
  1. identities whose plan grants the `admin` feature,
  2. authenticated users whose email is in `NAYANA_ADMIN_EMAILS` (deployer allowlist — the only production path),
  3. dev mode only (`NAYANA_ENV` ≠ `prod`): requests from 127.0.0.1/::1, so the deployer can configure providers locally without registering.
- There is **no self-serve path to admin** — registering creates an org "owner", which does NOT grant admin.
- ⚠️ Tunnels (ngrok etc.) forward as 127.0.0.1 and would satisfy the dev bypass — always set `NAYANA_ENV=prod` before exposing the server.
- Admin UI: `/admin` route; requests on an `admin.*` host are redirected there by middleware in `main.py`.

## Environment variables (all optional in dev; read via os.getenv — no .env loader)
- LLM keys: `OPENAI_API_KEY` (also powers embeddings), `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `DEEPSEEK_API_KEY`
- Admin: `NAYANA_ADMIN_EMAILS` — comma-separated allowlist of emails; accounts with these emails pass `require_admin`. **The only way to grant admin in production** — set by the owner/deployer at launch.
- Production: `JWT_SECRET` (**required in prod**), `NAYANA_ENV=prod` (strict SSRF protection + disables the localhost admin bypass), `COOKIE_SECURE=1`, `CORS_ORIGINS` (comma-separated)
- Tunables: `ACCESS_TOKEN_EXPIRE_MINUTES` (15), `REFRESH_TOKEN_EXPIRE_DAYS` (30), `GUEST_TOKEN_EXPIRE_DAYS` (30), `GUEST_SCAN_LIMIT` (5), `NAYANA_ALLOW_PRIVATE_HOSTS=1`

## What works without any LLM configured
- Crawl (BFS HTTP crawler), extraction, chunking, page-type classification, gap analysis, and scoring are **fully heuristic — no AI involved**. They always work.
- Test Lab, fix generation, and SOV **require at least one LLM adapter**: an API key, or a browser session logged in via Settings → AI Providers (admin). They fail fast with a clear error rather than fabricating content.
- Answer accuracy scoring uses OpenAI embeddings; stored as NULL when unavailable.

## Design system (frontend)
- Colors: pine `#0E1A16` (bg), frame `#0A1411`, ink `#F5F4EF`, ink-dim `#B9BDB4`, mint `#A9E5C5`, mint-bright `#C8F5DD`, sage `#8FBCA9`, red `#E5533C`, amber `#E3B341`
- Utility classes: `glass`, `glass-strong`, `paper`, `glow-mint`, `text-glow` · Fonts: `font-display`, `font-body`, `font-mono`
- Conventions: GlassCard for panels; BadgeChip tones mint/sage/red/amber/dim/outline (+pulse); locked feature = centered 🔒 card; scan links use `/scan/?id=N` (trailing slash matters in static export).

## Gotchas
- Static export: no Next server features (no API routes, SSR, or middleware). All data comes from FastAPI.
- CORS is credentialed — never use wildcard origins.
- Never commit: `backend/app/nayana.db*`, `backend/browser/sessions/`, `.env` (all gitignored).
- Mirror any new feature gate in both backend (`require_feature`) and frontend (`hasFeature`).
- recharts Tooltip `formatter`: leave params untyped and null-coalesce values, or the strict TS build fails.
- After frontend changes, rebuild + robocopy into `backend/static/` or the served site at :8000 stays stale.
