# nayana.ai Dev Tasks

Current status: **Phase 1 crawler is complete** and passes the local smoke test.  
**Phase 3 multi-LLM tester** is scaffolded (tables, adapters, scoring, endpoints) but requires LLM API keys to run live.

## Active / Next

1. **P3 — Dry-run / mock adapter**
   - Add a `mock` provider adapter in `backend/app/llm.py` that returns deterministic answers.
   - Allow `test_runner.run_test` to run when no real keys are configured, using only the mock adapter.
   - Add a CLI command `aeo test <scan_id>` that hits `POST /api/test/run`.
   - Goal: the full question → answer → score pipeline can be exercised locally without API keys.

2. **P4 — Heuristic Gap Analyzer**
   - Build `backend/app/gap_analyzer.py` that scans a completed crawl and returns:
     - thin pages (`word_count < 100`)
     - pages missing `description`
     - pages without JSON-LD / structured data
     - missing page types in the scan (e.g., no `faq`, no `pricing`)
     - orphan headings with very little text (content buried)
   - Add `GET /api/scans/{scan_id}/gaps` in `main.py`.
   - Add `aeo gaps <scan_id>` to the CLI.

3. **P5 — Fix Generator**
   - From a gap list, generate a remediation queue in `backend/app/fix_generator.py`:
     - suggested FAQ block for thin/missing FAQ pages
     - suggested JSON-LD snippet for pages without schema
     - suggested paragraph rewrite for thin pages
   - Add `GET /api/scans/{scan_id}/fixes` and `POST /api/scans/{scan_id}/fixes/{fix_id}/apply`.
   - Add `aeo fixes <scan_id>` and `aeo apply-fix <scan_id> <fix_id>` to the CLI.

4. **P8 — Frontend Refresh**
   - Replace the legacy v1 dashboard (`frontend/src/app/page.tsx`) with a crawler-first view:
     - Scan form → `/api/crawl`
     - Scans list → `/api/scans`
     - Scan detail → pages, chunks, page-type breakdown, gaps, fixes
     - Optional: multi-LLM test panel when keys are present
   - Rebuild and copy output to `backend/static`.

5. **P6 — Competitor SOV**
   - Accept competitor URLs in crawl/test config.
   - Compare brand mention and domain citation rates across target + competitors.
   - Surface share-of-voice in test summary.

6. **P7 — Monitoring**
   - Add scheduled re-evaluation (cron/background task or script).
   - Track AI visibility score over time per domain.
   - Add regression alerts (basic threshold checks).

7. **P9 — Cleanup**
   - Migrate or remove legacy v1 `/api/scan` and `agents.py` heuristic logic.
   - Add real pytest tests.
   - Update `docs/api-guide.md` and `docs/integrations.md`.

## Blocked

- Live multi-LLM testing is blocked until at least one of these environment variables is set:
  - `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `PERPLEXITY_API_KEY`
  - `DEEPSEEK_API_KEY`

## Done

- [x] v1 scaffold audit
- [x] P0 SQLite storage + WAL
- [x] P1 real BFS crawler + page extract + chunker + page type classifier
- [x] P1 API endpoints (`/api/crawl`, `/api/scans`, `/api/scans/{id}/pages`, `/api/scans/{id}/chunks`, `/api/pages/{id}`, `/api/chunks/{id}`)
- [x] P1 CLI commands (`crawl`, `scans`, `scan-show`, `pages`, `chunks`)
- [x] P1 local smoke test passed
- [x] P3 SQLite tables for questions, answers, scores
- [x] P3 LLM adapters and scoring layer
- [x] P3 API endpoints for test run, summary, questions, answers, keys
- [x] Root `AGENTS.md` and `TASKS.md`
