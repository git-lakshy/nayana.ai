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

## Status

**nayana.ai** is an experimental AEO platform built as part of FragFest ’26.

The project explores how autonomous agents can evaluate AI visibility, identify content gaps, and generate practical fixes for the modern web.

---

<div align="center">

**nayana.ai**  
*Make your product legible to machines before they explain it to people.*

</div>
