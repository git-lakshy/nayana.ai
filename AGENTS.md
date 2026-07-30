# nayana.ai — Agent Instructions

This repo implements the **AI Search Console** spec described in `what.md`.

## Project Layout

- `backend/app/main.py` — FastAPI entry point. Routes live here.
- `backend/app/db.py` — SQLite schema and repository functions (source of truth for storage).
- `backend/app/crawler.py` — Phase 1 BFS crawler.
- `backend/app/page_extract.py` — Fetch + parse a page into chunks, title, description, outlinks, JSON-LD.
- `backend/app/chunker.py` — Heading-boundary semantic chunker.
- `backend/app/page_type.py` — Heuristic page-type classifier.
- `backend/app/llm.py` — Phase 3 LLM provider adapters (Gemini, OpenAI, Claude, Perplexity, DeepSeek).
- `backend/app/test_runner.py` — Phase 3 multi-LLM test orchestration.
- `backend/app/scorer.py` — Phase 3 scoring signals (confidence, attribution, hedge, refusal).
- `backend/app/embeddings.py` — OpenAI embeddings for semantic accuracy.
- `backend/app/agents.py` — v1 Google ADK agents + heuristic evaluator (legacy, still used for question-gen when a Gemini key is present).
- `backend/app/registry.py` — A2A-style agent registry (legacy).
- `cli/aeo.py` — CLI client for the backend.
- `frontend/` — Next.js 16 dashboard. Currently targets the legacy v1 endpoints.
- `backend/scripts/` — Smoke tests and fixtures.
- `docs/` — API and integration docs.

## Phase Plan

- **P0** — SQLite storage ✅
- **P1** — Real crawler ✅
- **P2** — Question bank (skipped per user choice)
- **P3** — Multi-LLM tester (scaffolding in place, needs API keys to run live)
- **P4** — Gap analyzer (heuristic, next up)
- **P5** — Fix generation
- **P6** — Competitor SOV
- **P7** — Monitoring / scheduled re-evaluation
- **P8** — Frontend refresh to show real crawler data + gaps + fixes
- **P9** — Cleanup, tests, docs

## How to Run

From the repo root:

```powershell
# Backend
uvicorn backend.app.main:app --port 8000

# CLI
python cli/aeo.py crawl https://example.com
python cli/aeo.py scans

# Smoke test
python -m backend.scripts.smoke_local
```

## Conventions

- Python 3.11+. Use type hints and `from __future__ import annotations`.
- FastAPI request models use Pydantic.
- DB layer is `aiosqlite` in WAL mode. All DB access goes through `db.py` repo functions.
- New API endpoints live in `main.py` and return `JSONResponse`.
- Keep heavy I/O off the event loop (thread pools or async backends).
- After edits, run `python -m backend.scripts.smoke_local` before considering a task done.
- Avoid writing to `.remember/` manually; it is managed by the Remember plugin.

## Common Pitfalls

- `test_runner.run_test` refuses to run if no LLM keys are configured. For local testing, a `mock` adapter or dry-run mode should be added.
- The frontend currently calls legacy endpoints (`/api/scan`, `/api/metrics`). The crawler data is available via `/api/crawl`, `/api/scans`, etc.
- `backend/static` is an old Next.js build. Rebuild the frontend and copy output here to refresh the dashboard.
