"""LLM-powered fix generator.

For each gap found by gap_analyzer, fetches actual crawled content from the DB
and calls a real LLM to generate domain-specific, ready-to-apply fixes.
Raises RuntimeError if no LLM is configured — no generic fallbacks.
"""
from __future__ import annotations

import logging
from typing import Optional
from urllib.parse import urlsplit

from backend.app import db as sqlite_db
from backend.app import gap_analyzer
from backend.app import llm as llm_mod

logger = logging.getLogger(__name__)


def _domain_from_url(url: str) -> str:
    try:
        return urlsplit(url).netloc or url
    except Exception:
        return url


def _page_context(scan_id: int, page_id: Optional[int], page_url: str) -> str:
    """
    Fetch real crawled text for a page by concatenating its stored chunks.
    Falls back to loading the page's stored metadata if no chunks.
    """
    if page_id:
        all_chunks = sqlite_db.list_chunks(scan_id, limit=2000)
        page_chunks = [c for c in all_chunks if c.get("page_id") == page_id]
        texts = []
        for ch in page_chunks[:15]:  # cap at 15 chunks ~= 2000-3000 words
            t = (ch.get("text") or "").strip()
            heading = (ch.get("heading_text") or "").strip()
            if heading:
                texts.append(f"## {heading}")
            if t:
                texts.append(t)
        if texts:
            return "\n\n".join(texts)[:4000]

    # No chunks — return URL and whatever page record has
    if page_id:
        page = sqlite_db.get_page(page_id)
        if page:
            title = page.get("title") or ""
            desc = page.get("description") or ""
            return f"Title: {title}\nDescription: {desc}\nURL: {page_url}"

    return f"URL: {page_url}"


def _scan_context_summary(scan_id: int) -> str:
    """Short summary of the overall site from the scan — used for missing-page-type fixes."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        return ""
    pages = sqlite_db.list_pages(scan_id, limit=100)
    titles = [p.get("title") or p.get("url") or "" for p in pages[:10]]
    root = scan.get("root_url", "")
    domain = _domain_from_url(root)
    return (
        f"Domain: {domain}\n"
        f"Root URL: {root}\n"
        f"Pages crawled: {scan.get('pages_crawled', 0)}\n"
        f"Sample page titles: {', '.join(t for t in titles if t)}"
    )


_FIX_SYSTEM = (
    "You are an AEO (Answer Engine Optimization) expert. "
    "You write developer-ready HTML and JSON-LD fixes that make websites "
    "more citable by AI engines like ChatGPT, Perplexity, Gemini, and Claude. "
    "Your output is always specific to the domain provided — never generic, "
    "never use placeholder text like [Product] or [Your Company]. "
    "Base every sentence on the actual content given to you."
)


def _call_llm(prompt: str) -> Optional[str]:
    """Call first available real LLM adapter (API key or browser). Returns None on failure."""
    adapters = llm_mod.available_adapters_all()
    if not adapters:
        raise RuntimeError(
            "No LLM configured. Options:\n"
            "  1. Set an API key env var: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "PERPLEXITY_API_KEY, or DEEPSEEK_API_KEY\n"
            "  2. Install browser adapters: cd backend/browser && npm install && "
            "npm run install-browsers (then optionally authenticate via admin routes)"
        )
    adapter = adapters[0]
    logger.info("fix_generator: calling %s", adapter.name)
    result = adapter.complete(prompt, system=_FIX_SYSTEM)
    if result.error:
        logger.warning("fix_generator LLM error (%s): %s", adapter.name, result.error)
        return None
    text = result.answer_text.strip()
    return text if text else None


def _build_thin_content_fix(gap: dict, scan_id: int, root_url: str) -> Optional[dict]:
    url = gap.get("url") or ""
    title = gap.get("title") or url
    word_count = gap.get("word_count") or 0
    content_ctx = _page_context(scan_id, gap.get("page_id"), url)

    prompt = f"""This page has only {word_count} words and is too thin for AI engines to cite.

Page URL: {url}
Page title: {title}

Existing page content:
---
{content_ctx}
---

Write a complete HTML <section> block that:
1. Opens with an <h2> that introduces what this specific page is about (infer from the content above).
2. Writes 2-3 substantive paragraphs explaining the topic in the context of this domain — use real details from the content, not generic filler.
3. Adds a <h3>Key Points</h3> with a <ul> of 4-5 concrete, factual bullet points about this specific page's topic.
4. Adds a <h3>Frequently Asked Questions</h3> with 3 <dl>/<dt>/<dd> pairs — questions should be ones a real user would ask an AI about this specific page's topic, and the answers should be concrete and citable.

Output ONLY the raw HTML. No markdown code fences. No explanation."""

    content = _call_llm(prompt)
    if not content:
        return None
    return {
        "fix_type": "thin_content",
        "file_hint": url,
        "title": f"Expand thin content: {title[:80]}",
        "description": (
            f"Page has only {word_count} words. Generated domain-specific content "
            f"using real page context to make it citable by AI engines."
        ),
        "content": content,
        "language": "html",
    }


def _build_missing_meta_fix(gap: dict, scan_id: int, root_url: str) -> Optional[dict]:
    url = gap.get("url") or ""
    title = gap.get("title") or url
    content_ctx = _page_context(scan_id, gap.get("page_id"), url)
    domain = _domain_from_url(root_url)

    prompt = f"""This page is missing proper HTML meta tags, preventing AI engines from correctly identifying and citing it.

Site domain: {domain}
Page URL: {url}
Page title (if any): {title}

Actual page content:
---
{content_ctx}
---

Based on the content above, write exactly these HTML tags ready to paste into <head>:
- A <title> tag: max 60 chars, specific to this page's actual topic
- A <meta name="description"> tag: 120-155 chars, factual one-sentence summary of what this page is actually about — written so an AI can cite it verbatim
- A <meta property="og:title"> tag
- A <meta property="og:description"> tag
- A <meta property="og:url"> tag with the real URL
- A <link rel="canonical"> tag

All values must be based on the actual page content provided. Never use placeholder text.
Output ONLY the raw HTML tags. No markdown. No explanation."""

    content = _call_llm(prompt)
    if not content:
        return None
    return {
        "fix_type": "missing_meta",
        "file_hint": url,
        "title": f"Add meta tags: {title[:80]}",
        "description": (
            "Generated accurate <title>, <meta description>, and OpenGraph tags "
            "based on real page content so AI engines can correctly cite this page."
        ),
        "content": content,
        "language": "html",
    }


def _build_missing_schema_fix(gap: dict, scan_id: int, root_url: str) -> Optional[dict]:
    url = gap.get("url") or ""
    title = gap.get("title") or url
    domain = _domain_from_url(root_url)
    content_ctx = _page_context(scan_id, gap.get("page_id"), url)

    # Infer best schema type from URL + page content — LLM decides
    prompt = f"""This page has no JSON-LD structured data. Add the most appropriate schema.org markup.

Site domain: {domain}
Page URL: {url}
Page title: {title}

Actual page content:
---
{content_ctx}
---

Based on the content:
1. Choose the most appropriate schema.org @type for this page (FAQPage, Product, TechArticle, Article, HowTo, Organization, WebPage, etc.)
2. Write a complete, valid JSON-LD <script type="application/ld+json"> block.
3. Fill in ALL fields with real values inferred from the content — never leave placeholders or empty strings.
4. For FAQPage: include at least 3 real Q&A pairs from the content.
5. For Product: include real name, description, and offers if pricing is visible.
6. For TechArticle/Article: include real headline, description, and author (organization).

Output ONLY the complete <script type="application/ld+json">...</script> block. No markdown. No explanation."""

    content = _call_llm(prompt)
    if not content:
        return None

    # Extract schema type from content for the title
    schema_type = "Schema"
    for t in ["FAQPage", "Product", "TechArticle", "Article", "HowTo", "Organization", "WebPage"]:
        if t in (content or ""):
            schema_type = t
            break

    return {
        "fix_type": "missing_schema",
        "file_hint": url,
        "title": f"Add {schema_type} JSON-LD: {title[:60]}",
        "description": (
            f"Generated a {schema_type} JSON-LD block with real values from the crawled "
            "page content. Structured data is the primary signal AI engines use for precise citation."
        ),
        "content": content,
        "language": "html",
    }


def _build_buried_content_fix(gap: dict, scan_id: int, root_url: str) -> Optional[dict]:
    heading = gap.get("title") or ""
    page_id = gap.get("page_id")
    content_ctx = _page_context(scan_id, page_id, "")
    domain = _domain_from_url(root_url)

    prompt = f"""This section on a page has fewer than 40 words under its heading, making it too thin for AI engines to answer questions about it.

Site domain: {domain}
Section heading: {heading}

Surrounding page content for context:
---
{content_ctx[:2000]}
---

Write an expanded HTML section that replaces the thin section:
1. Keep the heading as-is: <h3>{heading}</h3>
2. Write 2-3 paragraphs (80-150 words total) that directly, factually answer what a user would want to know about "{heading}" in the context of this domain.
3. Every sentence must be independently meaningful so an AI engine can quote it verbatim.
4. Add a <ul> with 3-4 specific supporting details or examples.
5. Do NOT invent facts — base everything on the surrounding content provided.

Output ONLY raw HTML. No markdown. No explanation."""

    content = _call_llm(prompt)
    if not content:
        return None
    return {
        "fix_type": "buried_content",
        "file_hint": "",
        "title": f"Expand buried section: {heading[:80]}",
        "description": (
            f'Section "{heading}" has fewer than 40 words. '
            "Generated domain-specific expansion so AI engines can quote it accurately."
        ),
        "content": content,
        "language": "html",
    }


def _build_missing_page_type_fix(gap: dict, scan_id: int, root_url: str) -> Optional[dict]:
    gap_id = gap.get("id", "")
    page_type = gap_id.split("-")[-1] if "-" in gap_id else "faq"
    domain = _domain_from_url(root_url)
    site_ctx = _scan_context_summary(scan_id)

    page_type_instructions = {
        "faq": (
            "an FAQ page with at least 8 real questions and direct answers inferred from the site's content. "
            "Include FAQPage JSON-LD with every Q&A."
        ),
        "pricing": (
            "a Pricing page with tier names, descriptions, and feature lists inferred from the site's content. "
            "Include Product JSON-LD with real Offer data."
        ),
        "docs": (
            "a Documentation landing page with sections for Getting Started, Core Concepts, and API Reference "
            "based on what this domain appears to offer."
        ),
        "changelog": (
            "a Changelog page with a realistic first entry dated today showing an 'Added', 'Changed', and 'Fixed' "
            "section based on what this product appears to do."
        ),
        "integration": (
            "an Integrations page listing the tools and platforms this product likely integrates with, "
            "based on the site's content. Include realistic integration descriptions."
        ),
        "blog": (
            "a Blog index page with 3 sample post previews whose topics are directly relevant to this domain's product area."
        ),
        "landing": (
            "a product landing page with a hero section, value proposition, feature list, and CTA, "
            "all based on this domain's actual product."
        ),
    }

    instructions = page_type_instructions.get(
        page_type,
        f"a {page_type} page appropriate for this domain."
    )

    prompt = f"""This website is missing a {page_type} page, which hurts AI engine answerability.

Site information:
---
{site_ctx}
---

Write a complete, production-ready HTML page for {instructions}

Requirements:
- Use the actual domain name and inferred product/service throughout.
- All content must be specific to what this site appears to offer — do NOT use placeholders like [Product] or [Company].
- Include proper <head> with <title> and <meta description> filled in for this domain.
- Include appropriate JSON-LD structured data filled with real values.
- Write at least 400 words of body content.
- Structure with clear headings so AI engines can navigate the content.

Output ONLY the complete HTML document. No markdown. No explanation."""

    content = _call_llm(prompt)
    if not content:
        return None
    return {
        "fix_type": "missing_page_type",
        "file_hint": f"/{page_type}.html",
        "title": f"Create {page_type} page for {domain}",
        "description": (
            f"No {page_type} page was found during the crawl of {domain}. "
            f"Generated a complete, domain-specific {page_type} page using real site context."
        ),
        "content": content,
        "language": "html",
    }


def _build_answerability_fix(gap: dict, scan_id: int, root_url: str) -> Optional[dict]:
    """Generic LLM fix builder for AI-aware gap types.

    Handles gaps created from expected question coverage and Test Lab signals:
    missing_answer, llm_visibility_gap, citation_gap, competitor_gap,
    accuracy_gap, and confidence_gap.
    """
    question = gap.get("question") or ""
    target_section = gap.get("target_section") or "Answer block"
    url = gap.get("target_page") or gap.get("url") or root_url
    title = gap.get("title") or question or "AI visibility gap"
    gap_type = gap.get("type") or "missing_answer"
    fix_type = gap.get("fix_type") or "answer_block"
    providers = ", ".join(gap.get("providers") or []) or "not provider-specific"
    impact = gap.get("impact_score")
    evidence = gap.get("evidence") or {}
    domain = _domain_from_url(root_url)
    content_ctx = _page_context(scan_id, gap.get("page_id"), url)
    site_ctx = _scan_context_summary(scan_id)

    prompt = f"""This website has an AEO / AI visibility gap detected by an analyzer.

Site domain: {domain}
Root URL: {root_url}
Target page: {url}
Gap type: {gap_type}
Fix type: {fix_type}
Impact score: {impact}
Affected providers: {providers}
Question to answer: {question}
Target section: {target_section}
Gap description: {gap.get('description') or ''}
Suggested fix: {gap.get('suggested_fix') or ''}
Analyzer evidence: {evidence}

Site summary:
---
{site_ctx}
---

Current target page context:
---
{content_ctx[:4500]}
---

Write a production-ready HTML fix that improves answerability for AI engines.

Requirements:
1. Start with a section heading matching the target section.
2. Directly answer the question in the first 1-2 sentences, using the domain/brand name explicitly.
3. Add concrete supporting details from the provided page/site context only. Do not invent unsupported claims.
4. If the gap is about citation/attribution, include citation-friendly factual wording and recommend metadata/schema signals inside the HTML comments or script where appropriate.
5. If the gap is about competitors/comparison, write objective positioning language without making unverifiable claims.
6. If the gap is about accuracy/confidence, create a canonical answer block with precise definitions, constraints, and examples.
7. Add 3-5 FAQ-style Q&A pairs when useful.
8. Include JSON-LD when appropriate, especially FAQPage, WebPage, Product, SoftwareApplication, or Organization.
9. Output only raw HTML / JSON-LD ready to paste. No markdown fences. No explanation.
"""

    content = _call_llm(prompt)
    if not content:
        return None

    labels = {
        "missing_answer": "Add missing answer block",
        "llm_visibility_gap": "Improve AI brand visibility",
        "citation_gap": "Add citation-ready source block",
        "competitor_gap": "Add comparison positioning",
        "accuracy_gap": "Add canonical answer",
        "confidence_gap": "Clarify low-confidence answer",
    }
    return {
        "fix_type": fix_type,
        "file_hint": url,
        "title": f"{labels.get(gap_type, 'Fix AI visibility gap')}: {title[:80]}",
        "description": (
            f"Generated a targeted {target_section} fix for {gap_type}. "
            "The content is based on the scanned page/site context and is written for AI answerability."
        ),
        "content": content,
        "language": "html",
    }


_BUILDERS = {
    "thin_content": _build_thin_content_fix,
    "missing_meta": _build_missing_meta_fix,
    "missing_schema": _build_missing_schema_fix,
    "buried_content": _build_buried_content_fix,
    "missing_page_type": _build_missing_page_type_fix,
    "missing_answer": _build_answerability_fix,
    "llm_visibility_gap": _build_answerability_fix,
    "citation_gap": _build_answerability_fix,
    "competitor_gap": _build_answerability_fix,
    "accuracy_gap": _build_answerability_fix,
    "confidence_gap": _build_answerability_fix,
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate(scan_id: int, force: bool = False) -> list[dict]:
    """
    Generate LLM-powered, domain-specific fixes for all gaps in a scan.

    Raises RuntimeError if no LLM adapter is configured.
    Returns existing fixes if they already exist and force=False.
    """
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        return []

    if not force:
        existing = sqlite_db.list_fixes(scan_id)
        if existing:
            return existing

    # Preflight: ensure LLM is available before doing any work
    adapters = llm_mod.available_adapters_all()
    if not adapters:
        raise RuntimeError(
            "No LLM configured. Fix generation requires a real LLM. Options:\n"
            "  1. Set an API key: GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "PERPLEXITY_API_KEY, or DEEPSEEK_API_KEY\n"
            "  2. Install Puppeteer browser adapters: cd backend/browser && npm install && "
            "npm run install-browsers"
        )

    gaps = gap_analyzer.analyze(scan_id)
    root_url = scan.get("root_url", "")
    logger.info(
        "fix_generator: generating fixes for %d gaps (scan=%d, llm=%s)",
        len(gaps), scan_id, adapters[0].name,
    )

    fixes: list[dict] = []
    for gap in gaps:
        gap_type = gap.get("type", "")
        builder = _BUILDERS.get(gap_type)
        if not builder:
            continue
        try:
            fix_data = builder(gap, scan_id, root_url)
        except RuntimeError:
            raise  # re-raise config errors
        except Exception:
            logger.exception("fix_generator: builder failed for gap %s", gap.get("id"))
            fix_data = None

        if not fix_data:
            logger.warning("fix_generator: no content generated for gap %s", gap.get("id"))
            continue

        fix = {
            "gap_id": gap["id"],
            "scan_id": scan_id,
            "page_id": gap.get("page_id"),
            "gap_type": gap_type,
            "severity": gap.get("severity"),
            "status": "pending",
            **fix_data,
        }
        fixes.append(fix)

    if fixes:
        sqlite_db.upsert_fixes(scan_id, fixes, force=force)

    logger.info("fix_generator: %d/%d fixes generated (scan=%d)", len(fixes), len(gaps), scan_id)
    return sqlite_db.list_fixes(scan_id)


def get_fix(scan_id: int, fix_id: int) -> Optional[dict]:
    return sqlite_db.get_fix(fix_id, scan_id)


def mark_applied(scan_id: int, fix_id: int) -> Optional[dict]:
    sqlite_db.update_fix_status(fix_id, "applied")
    return sqlite_db.get_fix(fix_id, scan_id)
