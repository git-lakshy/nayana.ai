<div align="center">

# Nayana.ai

### The search console AI-native web ERA.

</div>

---

## Overview

**nayana.ai** helps companies understand, measure, and improve how AI systems perceive their product, website, and documentation.

Traditional SEO shows how a site performs on search engines. **nayana.ai** focuses on the next layer: how answer engines, AI assistants, and LLM-powered discovery tools understand a company’s content.

It scans a target website, evaluates how confidently AI can answer real user questions from that content, compares visibility against competitors, and turns content gaps into developer-ready fixes.

---

## What it does

**nayana.ai** works like a search console for the AI era.

It analyzes a company’s web presence across three core signals:

- **AI visibility** — how well the product can be discovered and explained by AI systems
- **Answer confidence** — whether generated answers are grounded in the available source content
- **Documentation trust** — how structured, complete, and machine-readable the content is

When gaps are found, the platform does not stop at reporting. It generates concrete remediation items such as structured API tables, schema improvements, and documentation updates that can be applied directly to the codebase.

---

## Core system

The platform is built around a swarm of specialized agents:

- **Knowledge Ingestion Agent**  
  Crawls and structures website content, headings, metadata, documentation, and schema data.

- **User Intent Agent**  
  Generates realistic questions users may ask AI systems about the product.

- **AI Testing and Evaluation Agent**  
  Simulates answer generation and scores confidence, hallucination risk, and missing information.

- **Competitor Intelligence Agent**  
  Benchmarks the target against competing websites.

- **Content Gap Agent**  
  Identifies weak spots such as missing JSON-LD, thin documentation, unclear APIs, or poor structure.

- **Remediation Architect Agent**  
  Converts those findings into code and documentation fixes developers can review and apply.

---

## Product surface

**nayana.ai** includes three main interfaces:

### Web dashboard

A visual control plane for tracking:

- Overall AEO score
- Question success rate
- Documentation trust
- Competitor benchmarks
- Score history
- Pending remediation items
- GitHub-linked fixes and reports

### Backend control plane

A FastAPI service that powers scans, metrics, remediation queues, agent registry data, GitHub configuration, and report sharing.

### CLI

A terminal utility for running scans, checking system status, reviewing history, and applying remediation fixes from the local development environment.

---

## Tech stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** FastAPI, Python 3.11+
- **LLM layer:** Dual-mode — API keys (Gemini, OpenAI, Claude, Perplexity, DeepSeek) or headless browser scraping via Puppeteer + Node.js (no keys required)
- **Storage:** SQLite (WAL mode) → Postgres/Supabase (planned)
- **Agents:** Google ADK, multi-LLM test orchestration, heuristic gap analysis
- **Data flow:** BFS crawl → semantic chunking → gap detection → LLM fix generation → AEO scoring
- **Developer workflow:** CLI-driven scans, fix generation, and LLM auth via admin routes
- **Deployment target:** Google Cloud Run + GitHub Actions CI

---

## Why nayana.ai

AI systems increasingly decide what products are visible, how they are explained, and whether users trust the answers they receive.

Most teams still optimize for pages, keywords, and rankings.

**nayana.ai** optimizes for answers.

It helps teams see their product the way AI sees it — then gives them the fixes needed to make that perception more accurate, structured, and trustworthy.

---

## Built for

- Product teams improving AI discoverability
- Engineering teams maintaining public docs and APIs
- Marketing teams tracking AI-era visibility
- Developer relations teams improving documentation quality
- Companies preparing their content for LLM-powered search

---

## Repository structure

```yaml
├── backend/      # FastAPI control plane, agents, registry, scan and remediation APIs
├── cli/          # Terminal utility for scans, fixes, status, and history
├── docs/         # Product and API documentation samples
├── frontend/     # Next.js dashboard interface
├── prd.md        # Product requirements and system design
└── Dockerfile    # Container deployment entrypoint
```
---

## Setup & configuration

### Quick start (zero config)

There is **no `.env` file in this repo — and none is needed for local dev**. All settings are read as plain environment variables via `os.getenv`, and every one of them has a safe default.

```bat
:: one-time
cd frontend && npm install && cd ..
pip install -r backend/requirements.txt

:: run everything (backend :8000 + frontend dev :3000)
nayana.bat
```

Or backend only (serves the built frontend from `backend/static/`):

```bat
python -m uvicorn backend.app.main:app --port 8000
```

Health check: `GET http://127.0.0.1:8000/api/health`

### Environment variables

Set these in your shell, in `nayana.bat` (`set NAME=value` after `@echo off`), or permanently with `setx NAME "value"`. The app does **not** load a `.env` file.

| Variable | Default | Purpose |
|---|---|---|
| `NAYANA_ADMIN_EMAILS` | *(empty)* | **Admin allowlist.** Comma-separated emails; accounts with these emails get admin access (`/admin`, provider sessions). This is the only way to grant admin in production. |
| `JWT_SECRET` | dev fallback | **Required in production.** Long random string for signing tokens. |
| `NAYANA_ENV` | `dev` | Set `prod` when deployed/exposed. Enables strict SSRF protection and **disables the localhost admin bypass** (see below). |
| `COOKIE_SECURE` | off | Set `1` in production (HTTPS-only cookies). |
| `CORS_ORIGINS` | localhost:3000/8000 | Comma-separated allowed origins. |
| `OPENAI_API_KEY` | *(unset)* | ChatGPT answers + embeddings (answer accuracy). |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | *(unset)* | Gemini answers / ADK question generation. |
| `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `DEEPSEEK_API_KEY` | *(unset)* | Additional Test Lab providers. |
| `GUEST_SCAN_LIMIT` | `5` | Scans allowed per guest session. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` / `GUEST_TOKEN_EXPIRE_DAYS` | `15` / `30` / `30` | Token lifetimes. |
| `NAYANA_ALLOW_PRIVATE_HOSTS` | off | Set `1` to allow scanning private/localhost hosts. |

No LLM key set? Crawling, gap analysis, and scoring still work fully (they are heuristic). Only the Test Lab, AI fix generation, and SOV need an LLM (API key or an admin browser session).

### Admin access (owner/deployer only)

The admin console lives at **`/admin`** (in production, `admin.<domain>` redirects there automatically). Admin API endpoints are gated server-side and grant access only to:

1. Accounts whose email is listed in **`NAYANA_ADMIN_EMAILS`** — set by you at deploy time; there is no self-serve path to admin.
2. In dev mode only (`NAYANA_ENV` ≠ `prod`): requests from the local machine, so you can configure providers on your own box without registering.

Typical setup as the owner/deployer:

```bat
set NAYANA_ADMIN_EMAILS=you@yourdomain.com
set JWT_SECRET=<long random string>
set NAYANA_ENV=prod
nayana.bat
```

Then register/log in with that email and open `/admin`.

> ⚠️ **Tunnel warning:** ngrok and similar tunnels forward requests as `127.0.0.1`, which would satisfy the dev-mode localhost bypass. **Always set `NAYANA_ENV=prod` before exposing the server through a tunnel or to the internet.**

---

## Status

**nayana.ai** is an experimental AEO platform built as part of FragFest ’26.

The project explores how autonomous agents can evaluate AI visibility, identify content gaps, and generate practical fixes for the modern web.

---

<div align="center">

**nayana.ai**  
*Make your product legible to machines before they explain it to people.*

</div>
