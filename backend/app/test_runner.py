"""Phase 3 test orchestration: question generation + multi-LLM evaluation.

Flow:
1. For a given scan, fetch all chunks (grounding context).
2. Use an LLM to generate 3-5 questions per chunk (deduped across chunks).
3. Run each question through every configured LLM adapter.
4. Score every answer with scorer.full_score.
5. Persist everything through db.py repos.

Strict-preflight: if no adapter key is configured the request is refused.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import logging
from dataclasses import dataclass, field
from typing import Optional

from backend.app import db as sqlite_db
from backend.app import llm
from backend.app import scorer
from backend.app import embeddings
from backend.app.agents import is_api_configured

logger = logging.getLogger(__name__)

_QUESTION_SYSTEM = """
You are an AI visibility testing bot. Given a chunk of website content,
generate 3 to 5 realistic questions a user might ask an AI assistant
about the product/domain described in the content.

Rules:
- Output exactly one question per line. No numbering, no preamble.
- Questions should be diverse: informational, how-to, integration, pricing, technical.
- Do not answer the questions. Do not output anything else.
"""

_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=5)


@dataclass
class TestArtifacts:
    scan_id: int
    adapters_used: list[str]
    questions_generated: int = 0
    answers_generated: int = 0
    errors: list[str] = field(default_factory=list)


async def _gen_qs_for_chunk(chunk_text: str) -> list[str]:
    """
    Generate questions from a single chunk.
    Primary: Gemini ADK (when GOOGLE_API_KEY / GEMINI_API_KEY is set).
    Fallback: any available adapter (API-key or browser) via direct complete().
    """
    prompt = f"Chunk content:\n\n{chunk_text[:1500]}"

    # --- primary: Gemini ADK ---
    if is_api_configured():
        try:
            from google.adk import Agent, Runner
            from google.adk.sessions import InMemorySessionService
            from google.genai import types

            agent = Agent(
                name="QuestionGen",
                model="gemini-2.5-flash",
                instruction=_QUESTION_SYSTEM,
            )
            sess = InMemorySessionService()
            runner = Runner(agent=agent, session_service=sess,
                            app_name="nayana-p3", auto_create_session=True)

            events = runner.run(
                user_id="gen",
                session_id="gen-sess",
                new_message=types.Content(role="user",
                                          parts=[types.Part(text=prompt)]),
            )

            text_parts = []
            for ev in events:
                if ev.error_message:
                    logger.warning("question-gen error: %s", ev.error_message)
                    break
                if ev.message and ev.message.parts:
                    text_parts.extend([p.text for p in ev.message.parts if p.text])
                elif ev.content and hasattr(ev.content, "parts"):
                    text_parts.extend([p.text for p in ev.content.parts if p.text])

            qs = [l.strip() for l in "\n".join(text_parts).splitlines() if l.strip()][:5]
            if qs:
                return qs
        except Exception:
            logger.exception("question-gen: Gemini ADK failed, trying adapter fallback")

    # --- fallback: any available adapter (API key or browser) ---
    try:
        adapters = llm.available_adapters_all()
        if adapters:
            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(
                _thread_pool,
                lambda: adapters[0].complete(prompt, system=_QUESTION_SYSTEM),
            )
            if result.answer_text:
                return [
                    l.strip()
                    for l in result.answer_text.splitlines()
                    if l.strip() and len(l.strip()) > 8
                ][:5]
    except Exception:
        logger.exception("question-gen: adapter fallback also failed")

    return []


async def generate_questions(scan_id: int,
                             max_per_chunk: int = 4,
                             max_total: int = 50) -> list[str]:
    """
    Generate domain-specific questions from the actual crawled chunks of a scan.

    Raises ValueError if there are no chunks to analyse — there is no generic
    fallback; questions must be grounded in the real crawled content.
    """
    chunks = sqlite_db.list_chunks(scan_id, limit=500)
    if not chunks:
        raise ValueError(
            f"Scan {scan_id} has no chunks. Run a crawl first (aeo crawl <url>) "
            "so there is real content to generate questions from."
        )

    qset: dict[str, bool] = {}
    for ch in chunks:
        txt = ch.get("text") or ""
        if len(txt) < 60:
            continue
        try:
            qs = await _gen_qs_for_chunk(txt)
            for q in qs[:max_per_chunk]:
                nq = q.strip()
                if nq and len(nq) > 8:
                    qset[nq] = True
        except Exception:
            logger.exception("skipped chunk %s", ch["id"])
        if len(qset) >= max_total:
            break

    if not qset:
        raise ValueError(
            f"Scan {scan_id}: Question generation returned no results. "
            "Ensure at least one LLM is available: set an API key "
            "(GEMINI_API_KEY, OPENAI_API_KEY, etc.) or install browser adapters "
            "(cd backend/browser && npm install && npm run install-browsers)."
        )

    return list(qset.keys())[:max_total]


async def _call_adapter(adapter, prompt: str) -> llm.ProviderResult:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _thread_pool,
        lambda: adapter.complete(prompt),
    )


async def run_test(scan_id: int, *,
                   brand: str = "",
                   domain: str = "",
                   competitors: list[str] | None = None,
                   ) -> TestArtifacts:
    """Full multi-LLM testing pipeline for one scan."""
    adapters = llm.available_adapters_all()
    if not adapters:
        raise ValueError(
            "No LLM configured. Options:\n"
            "  1. Set an API key: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "PERPLEXITY_API_KEY, or DEEPSEEK_API_KEY\n"
            "  2. Use browser adapters: install Puppeteer (cd backend/browser && npm install && "
            "npm run install-browsers) then optionally authenticate providers via "
            "POST /api/admin/llm-auth/start/{provider}"
        )

    art = TestArtifacts(
        scan_id=scan_id,
        adapters_used=[a.name for a in adapters],
    )

    logger.info("Phase3 test: scan=%d %s", scan_id, art.adapters_used)

    # 1 -- generate questions
    questions = await generate_questions(scan_id)

    persisted: list[tuple[int, str]] = []
    for q_text in questions:
        qid = sqlite_db.insert_question(
            scan_id=scan_id,
            page_id=None,
            chunk_id=None,
            text=q_text,
            intent_category=None,
            ground_truth=q_text,
        )
        if qid is not None:
            persisted.append((qid, q_text))

    art.questions_generated = len(persisted)
    logger.info("%d questions persisted (scan=%d)", len(persisted), scan_id)

    # 2 -- call each adapter per question
    for qid, q_text in persisted:
        gt_embed = embeddings.embed(q_text) if embeddings.is_configured() else None

        for adapter in adapters:
            prompt = (
                f"Answer the following user question accurately "
                f"based on your best knowledge.\n\n"
                f"Question: {q_text}\n\n"
                f"- Be direct and cite what you know.\n"
                f"- If unsure, say so clearly.\n"
                f"- Do NOT fabricate information."
            )

            res = await _call_adapter(adapter, prompt)

            ans_embed = None
            if embeddings.is_configured() and res.answer_text.strip():
                ans_embed = embeddings.embed(res.answer_text)

            aid = sqlite_db.persist_answer(
                scan_id=scan_id,
                question_id=qid,
                provider=adapter.name,
                model=getattr(adapter, "model", None),
                answer_text=res.answer_text,
                latency_ms=res.latency_ms,
                citations=getattr(res, "citations", None),
                error=res.error,
            )

            if res.error:
                art.errors.append(f"[{adapter.name}] Q{qid}: {res.error}")
            else:
                art.answers_generated += 1

            signals = scorer.full_score(
                res.answer_text,
                ground_truth=q_text,
                brand=brand,
                domain=domain,
                competitors=competitors or [],
                embed_tuple=(gt_embed, ans_embed),
            )
            sqlite_db.persist_scores(answer_id=aid, **signals)

    logger.info("test complete: answers=%d errors=%d",
                art.answers_generated, len(art.errors))
    return art
