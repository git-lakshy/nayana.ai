"""AI-aware AEO gap analyzer.

The analyzer is intentionally deterministic and safe to run from GET
/api/scans/{scan_id}/gaps. It does not require a configured LLM. Instead it
uses all data the backend already has:

1. Crawl hygiene: thin pages, missing metadata, missing schema, weak sections.
2. Site coverage: expected page types and answer-intent coverage.
3. Question coverage: expected customer/AI questions mapped to crawled pages.
4. Test Lab signals: provider answers, scores, brand/citation/competitor/refusal
   metrics produced by the multi-LLM test runner.
5. Prioritisation: every gap gets impact_score, effort, target_page, target_section,
   and fix_type so the UI and fix generator can act on it.
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from statistics import mean
from typing import Optional
from urllib.parse import urlsplit

from backend.app import db as sqlite_db

# Page-type coverage that generally matters for answerability. These are no
# longer treated equally: commercial / answer-critical types rank higher.
EXPECTED_PAGE_TYPES = ("landing", "docs", "faq", "pricing", "integration", "blog", "changelog")

THIN_WORDS_THRESHOLD = 100
BURIED_WORDS_THRESHOLD = 40
LOW_CONFIDENCE_THRESHOLD = 0.55
LOW_ATTRIBUTION_THRESHOLD = 0.50
LOW_ACCURACY_THRESHOLD = 0.62
HIGH_HEDGE_THRESHOLD = 0.18

COMMERCIAL_INTENTS = {"pricing", "comparative", "integration", "technical"}

QUESTION_TEMPLATES: list[dict] = [
    {
        "key": "what_is_product",
        "intent": "informational",
        "question": "What is {brand} and what does it do?",
        "page_types": ["landing", "docs"],
        "terms": ["what is", "overview", "platform", "product", "solution", "features"],
        "severity": "high",
        "fix_type": "answer_block",
        "target_section": "Product overview",
    },
    {
        "key": "how_it_works",
        "intent": "how-to",
        "question": "How does {brand} work?",
        "page_types": ["docs", "landing"],
        "terms": ["how it works", "workflow", "process", "setup", "getting started"],
        "severity": "high",
        "fix_type": "how_it_works_section",
        "target_section": "How it works",
    },
    {
        "key": "pricing",
        "intent": "pricing",
        "question": "How much does {brand} cost and what is included?",
        "page_types": ["pricing", "faq"],
        "terms": ["pricing", "price", "plan", "billing", "tier", "included"],
        "severity": "high",
        "fix_type": "pricing_faq",
        "target_section": "Pricing FAQ",
    },
    {
        "key": "integrations",
        "intent": "integration",
        "question": "What tools and platforms does {brand} integrate with?",
        "page_types": ["integration", "docs"],
        "terms": ["integration", "api", "webhook", "connect", "slack", "github", "notion", "crm"],
        "severity": "medium",
        "fix_type": "integration_section",
        "target_section": "Integrations",
    },
    {
        "key": "comparison",
        "intent": "comparative",
        "question": "How is {brand} different from alternatives?",
        "page_types": ["landing", "blog", "docs"],
        "terms": ["compare", "alternative", "versus", "vs", "different", "competitor"],
        "severity": "high",
        "fix_type": "comparison_section",
        "target_section": "Comparison",
    },
    {
        "key": "use_cases",
        "intent": "informational",
        "question": "Who should use {brand} and for what use cases?",
        "page_types": ["landing", "blog", "docs"],
        "terms": ["use case", "customer", "team", "agency", "enterprise", "for"],
        "severity": "medium",
        "fix_type": "use_case_section",
        "target_section": "Use cases",
    },
    {
        "key": "trust_security",
        "intent": "technical",
        "question": "Is {brand} secure and how does it handle data?",
        "page_types": ["docs", "faq"],
        "terms": ["security", "privacy", "data", "compliance", "gdpr", "soc", "encryption"],
        "severity": "medium",
        "fix_type": "trust_section",
        "target_section": "Security and data handling",
    },
    {
        "key": "faq",
        "intent": "informational",
        "question": "What are the most common questions about {brand}?",
        "page_types": ["faq", "landing"],
        "terms": ["faq", "frequently asked", "questions", "answers"],
        "severity": "medium",
        "fix_type": "faq_section",
        "target_section": "FAQ",
    },
]


def _gap_id(prefix: str, scan_id: int, suffix: str | int) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_.-]+", "-", str(suffix)).strip("-")[:80]
    return f"{prefix}-{scan_id}-{safe}"


def _domain_from_url(url: str) -> str:
    try:
        host = urlsplit(url or "").netloc or url
        return host.replace("www.", "")
    except Exception:
        return url or "site"


def _brand_from_scan(scan: dict, pages: list[dict]) -> str:
    root = scan.get("root_url") or ""
    domain = _domain_from_url(root)
    for p in pages:
        title = (p.get("title") or "").strip()
        if title:
            # Use the first title segment when it looks brand-like.
            first = re.split(r"[|—–-]", title)[0].strip()
            if 2 <= len(first) <= 40:
                return first
    return domain


def _page_text(page: dict, chunks_by_page: dict[int, list[dict]]) -> str:
    parts = [
        page.get("title") or "",
        page.get("description") or "",
        page.get("url") or "",
        page.get("page_type") or "",
    ]
    for ch in chunks_by_page.get(page.get("id"), [])[:12]:
        parts.extend([ch.get("heading_path") or "", ch.get("heading_text") or "", ch.get("preview") or ""])
    return " ".join(parts).lower()


def _best_page_for(page_types: list[str], pages: list[dict], chunks_by_page: dict[int, list[dict]], terms: list[str] | None = None) -> Optional[dict]:
    terms = [t.lower() for t in (terms or [])]
    ranked: list[tuple[int, int, dict]] = []
    for p in pages:
        score = 0
        if (p.get("page_type") or "") in page_types:
            score += 40
        text = _page_text(p, chunks_by_page)
        for term in terms:
            if term in text:
                score += 8
        # Prefer substantive pages, but do not overfit to giant pages.
        score += min(int((p.get("word_count") or 0) / 80), 12)
        # Prefer pages with schema for facts that AI can cite.
        score += min(p.get("json_ld_count") or 0, 3)
        if score > 0:
            ranked.append((score, p.get("word_count") or 0, p))
    if not ranked:
        return pages[0] if pages else None
    ranked.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return ranked[0][2]


def _severity_from_impact(score: int) -> str:
    if score >= 78:
        return "high"
    if score >= 48:
        return "medium"
    return "low"


def _impact(base: int, *, provider_failures: int = 0, commercial: bool = False, pages_affected: int = 1, easy: bool = False) -> int:
    score = base + provider_failures * 8 + min(pages_affected, 8) * 2
    if commercial:
        score += 12
    if easy:
        score += 4
    return max(1, min(100, score))


def _gap(
    *,
    scan_id: int,
    prefix: str,
    suffix: str | int,
    gap_type: str,
    severity: str,
    description: str,
    suggested_fix: str,
    fix_category: str,
    fix_type: str,
    impact_score: int,
    effort: str = "medium",
    page: Optional[dict] = None,
    title: Optional[str] = None,
    question: Optional[str] = None,
    target_section: Optional[str] = None,
    pages_affected: int = 1,
    providers: Optional[list[str]] = None,
    evidence: Optional[dict] = None,
) -> dict:
    url = (page or {}).get("url")
    page_id = (page or {}).get("id")
    return {
        "id": _gap_id(prefix, scan_id, suffix),
        "type": gap_type,
        "kind": gap_type,
        "severity": severity,
        "impact_score": impact_score,
        "effort": effort,
        "page_id": page_id,
        "url": url,
        "target_page": url,
        "target_section": target_section,
        "title": title or (page or {}).get("title") or url or question or gap_type.replace("_", " ").title(),
        "question": question,
        "pages_affected": pages_affected,
        "providers": providers or [],
        "fix_category": fix_category,
        "fix_type": fix_type,
        "description": description,
        "suggested_fix": suggested_fix,
        "evidence": evidence or {},
    }


def _load_page_details(scan_id: int) -> list[dict]:
    # list_pages intentionally omits descriptions for lighter API responses; gap
    # analysis needs descriptions, so hydrate each page record.
    light = sqlite_db.list_pages(scan_id, limit=10000)
    pages: list[dict] = []
    for p in light:
        full = sqlite_db.get_page(p["id"]) or p
        pages.append(full)
    return pages


def _test_rows(scan_id: int) -> list[dict]:
    questions = {q["id"]: q for q in sqlite_db.list_questions(scan_id)}
    answers = {a["id"]: a for a in sqlite_db.list_answers(scan_id, limit=10000)}
    rows: list[dict] = []
    for score in sqlite_db.scores_for_scan(scan_id):
        ans = answers.get(score.get("answer_id"), {})
        q = questions.get(score.get("question_id"), {})
        row = {**score, **{
            "answer_text": ans.get("answer_text") or "",
            "citations_json": ans.get("citations_json") or "[]",
            "question": q.get("text") or "",
            "intent_category": q.get("intent_category") or "",
            "ground_truth": q.get("ground_truth") or "",
            "page_id": q.get("page_id"),
            "chunk_id": q.get("chunk_id"),
        }}
        try:
            row["citations"] = json.loads(row["citations_json"] or "[]")
        except Exception:
            row["citations"] = []
        rows.append(row)
    return rows


def _technical_gaps(scan_id: int, scan: dict, pages: list[dict], chunks: list[dict], chunks_by_page: dict[int, list[dict]]) -> list[dict]:
    gaps: list[dict] = []

    for page in pages:
        word_count = page.get("word_count") or 0
        title = page.get("title") or ""
        description = page.get("description") or ""
        json_ld_count = page.get("json_ld_count") or 0

        if word_count < THIN_WORDS_THRESHOLD:
            impact = _impact(54 if word_count < 50 else 38, easy=True)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="thin",
                suffix=page.get("id"),
                gap_type="thin_content",
                severity=_severity_from_impact(impact),
                page=page,
                title=title,
                impact_score=impact,
                effort="medium",
                fix_category="content",
                fix_type="thin_content",
                description=f"Page has only {word_count} words; AI engines need more context to answer confidently and cite it.",
                suggested_fix="Expand the page with a concise answer block, supporting details, FAQ entries, and schema-friendly copy.",
                evidence={"word_count": word_count, "threshold": THIN_WORDS_THRESHOLD},
            ))

        if not title.strip() or not description.strip():
            impact = _impact(46, easy=True)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="meta",
                suffix=page.get("id"),
                gap_type="missing_meta",
                severity=_severity_from_impact(impact),
                page=page,
                title=title or page.get("url"),
                impact_score=impact,
                effort="low",
                fix_category="metadata",
                fix_type="missing_meta",
                description="Missing or empty title/description makes the page harder for search and AI engines to identify, summarize, and cite.",
                suggested_fix="Add a descriptive <title>, meta description, canonical URL, and OpenGraph tags based on the page's actual content.",
                evidence={"has_title": bool(title.strip()), "has_description": bool(description.strip())},
            ))

        if json_ld_count == 0:
            impact = _impact(48, easy=True)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="schema",
                suffix=page.get("id"),
                gap_type="missing_schema",
                severity=_severity_from_impact(impact),
                page=page,
                title=title or page.get("url"),
                impact_score=impact,
                effort="low",
                fix_category="schema",
                fix_type="missing_schema",
                description="No JSON-LD / schema.org markup found; AI engines rely on structured data for precise entity understanding and citations.",
                suggested_fix="Add the most appropriate JSON-LD type for this page, such as Product, FAQPage, SoftwareApplication, TechArticle, Organization, or WebPage.",
                evidence={"json_ld_count": json_ld_count},
            ))

    page_by_id = {p.get("id"): p for p in pages}
    for chunk in chunks:
        wc = chunk.get("word_count") or 0
        if wc < BURIED_WORDS_THRESHOLD:
            page = page_by_id.get(chunk.get("page_id"))
            heading = chunk.get("heading_text") or chunk.get("heading_path") or "section"
            impact = _impact(28, easy=True)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="buried",
                suffix=chunk.get("id"),
                gap_type="buried_content",
                severity=_severity_from_impact(impact),
                page=page,
                title=heading,
                target_section=heading,
                impact_score=impact,
                effort="low",
                fix_category="content",
                fix_type="buried_content",
                description=f"Section has only {wc} words under its heading; it may not fully answer a related AI/user question.",
                suggested_fix="Flesh out the section with a direct answer, concrete details, and examples that can be quoted verbatim.",
                evidence={"chunk_id": chunk.get("id"), "word_count": wc, "threshold": BURIED_WORDS_THRESHOLD},
            ))

    return gaps


def _page_type_gaps(scan_id: int, scan: dict, pages: list[dict], chunks_by_page: dict[int, list[dict]]) -> list[dict]:
    gaps: list[dict] = []
    seen = {p.get("page_type") or "other" for p in pages}
    root_page = _best_page_for(["landing"], pages, chunks_by_page)

    for expected in EXPECTED_PAGE_TYPES:
        if expected in seen:
            continue
        commercial = expected in {"pricing", "docs", "integration", "faq"}
        base = {"pricing": 66, "faq": 58, "docs": 62, "integration": 50, "landing": 55, "blog": 30, "changelog": 24}.get(expected, 36)
        impact = _impact(base, commercial=commercial, easy=False)
        gaps.append(_gap(
            scan_id=scan_id,
            prefix="missing-type",
            suffix=expected,
            gap_type="missing_page_type",
            severity=_severity_from_impact(impact),
            page=root_page,
            title=f"Missing {expected} page",
            target_section=f"New {expected} page",
            impact_score=impact,
            effort="high" if expected in {"docs", "pricing", "integration"} else "medium",
            fix_category="coverage",
            fix_type="missing_page_type",
            pages_affected=1,
            description=f"No {expected} page was discovered in the scan, leaving an expected answer surface uncovered.",
            suggested_fix=f"Create or expose a dedicated {expected} page if it fits the product, with clear headings, direct answers, and structured data.",
            evidence={"seen_page_types": sorted(seen)},
        ))
    return gaps


def _question_coverage_gaps(scan_id: int, scan: dict, pages: list[dict], chunks_by_page: dict[int, list[dict]]) -> list[dict]:
    gaps: list[dict] = []
    brand = _brand_from_scan(scan, pages)

    # Build searchable corpus by page. This catches cases where a page exists but
    # does not clearly answer the question cluster.
    page_corpus = {p.get("id"): _page_text(p, chunks_by_page) for p in pages}

    for tmpl in QUESTION_TEMPLATES:
        candidates = [p for p in pages if (p.get("page_type") or "") in tmpl["page_types"]]
        candidate_ids = {p.get("id") for p in candidates}
        all_terms = [t.lower() for t in tmpl["terms"]]

        has_answer = False
        best_page = _best_page_for(tmpl["page_types"], pages, chunks_by_page, all_terms)
        for page_id, text in page_corpus.items():
            if candidate_ids and page_id not in candidate_ids:
                continue
            matches = sum(1 for term in all_terms if term in text)
            words = len(text.split())
            if matches >= 2 and words >= 80:
                has_answer = True
                break

        if has_answer:
            continue

        question = tmpl["question"].format(brand=brand)
        commercial = tmpl["intent"] in COMMERCIAL_INTENTS
        base = 60 if tmpl["severity"] == "high" else 44
        impact = _impact(base, commercial=commercial, pages_affected=max(1, len(candidates)))
        gaps.append(_gap(
            scan_id=scan_id,
            prefix="missing-answer",
            suffix=tmpl["key"],
            gap_type="missing_answer",
            severity=_severity_from_impact(impact),
            page=best_page,
            title=f"Missing answer: {question}",
            question=question,
            target_section=tmpl["target_section"],
            pages_affected=max(1, len(candidates)),
            impact_score=impact,
            effort="medium",
            fix_category="answerability",
            fix_type=tmpl["fix_type"],
            description="The crawl did not find a clear, direct answer to an expected customer/AI question cluster.",
            suggested_fix=f"Add a dedicated '{tmpl['target_section']}' section that directly answers: {question}",
            evidence={"intent": tmpl["intent"], "expected_page_types": tmpl["page_types"], "matched_terms": all_terms},
        ))

    return gaps


def _test_lab_gaps(scan_id: int, pages: list[dict], chunks_by_page: dict[int, list[dict]]) -> list[dict]:
    rows = [r for r in _test_rows(scan_id) if r.get("question")]
    if not rows:
        return []

    gaps: list[dict] = []
    page_by_id = {p.get("id"): p for p in pages}
    by_question: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        by_question[r.get("question_id")].append(r)

    for question_id, qrows in by_question.items():
        question = qrows[0].get("question") or ""
        intent = qrows[0].get("intent_category") or "informational"
        target_page = page_by_id.get(qrows[0].get("page_id")) or _best_page_for([intent, "docs", "faq", "landing"], pages, chunks_by_page)
        providers = sorted({r.get("provider") for r in qrows if r.get("provider")})
        n = len(qrows) or 1

        brand_misses = [r for r in qrows if not (r.get("has_brand_mention") or 0) and not r.get("error")]
        citation_misses = [r for r in qrows if not (r.get("has_domain_citation") or 0) and not r.get("error")]
        competitor_hits = [r for r in qrows if (r.get("has_competitor_mention") or 0) and not r.get("error")]
        refusals = [r for r in qrows if (r.get("is_refusal") or 0) or r.get("error")]
        low_conf = [r for r in qrows if (r.get("confidence") is not None and r.get("confidence") < LOW_CONFIDENCE_THRESHOLD)]
        low_attr = [r for r in qrows if (r.get("attribution") is not None and r.get("attribution") < LOW_ATTRIBUTION_THRESHOLD)]
        low_acc = [r for r in qrows if (r.get("accuracy") is not None and r.get("accuracy") < LOW_ACCURACY_THRESHOLD)]
        high_hedge = [r for r in qrows if (r.get("hedge_rate") is not None and r.get("hedge_rate") > HIGH_HEDGE_THRESHOLD)]

        commercial = intent in COMMERCIAL_INTENTS

        if len(brand_misses) / n >= 0.5:
            impact = _impact(66, provider_failures=len(brand_misses), commercial=commercial)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="llm-brand",
                suffix=question_id,
                gap_type="llm_visibility_gap",
                severity=_severity_from_impact(impact),
                page=target_page,
                title="Brand missing from AI answers",
                question=question,
                target_section="Answer-optimized brand mention",
                providers=[r["provider"] for r in brand_misses if r.get("provider")],
                impact_score=impact,
                effort="medium",
                fix_category="llm_visibility",
                fix_type="answer_block",
                description="Most tested AI providers answered this question without mentioning the scanned brand/domain.",
                suggested_fix="Add a concise answer block that names the brand/domain, defines the category, and states why it is relevant to this question.",
                evidence={"failed_providers": len(brand_misses), "tested_providers": n, "intent": intent},
            ))

        if len(citation_misses) / n >= 0.5:
            impact = _impact(58, provider_failures=len(citation_misses), commercial=commercial)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="llm-citation",
                suffix=question_id,
                gap_type="citation_gap",
                severity=_severity_from_impact(impact),
                page=target_page,
                title="Domain not cited by AI answers",
                question=question,
                target_section="Citation-ready source block",
                providers=[r["provider"] for r in citation_misses if r.get("provider")],
                impact_score=impact,
                effort="low",
                fix_category="attribution",
                fix_type="citation_block",
                description="Most tested AI providers did not cite the scanned domain for this question.",
                suggested_fix="Add citation-ready factual copy, stronger metadata, canonical URLs, and structured data on the target page.",
                evidence={"failed_providers": len(citation_misses), "tested_providers": n, "intent": intent},
            ))

        if competitor_hits:
            impact = _impact(70, provider_failures=len(competitor_hits), commercial=True)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="llm-competitor",
                suffix=question_id,
                gap_type="competitor_gap",
                severity=_severity_from_impact(impact),
                page=target_page,
                title="Competitors appear in AI answers",
                question=question,
                target_section="Comparison / positioning",
                providers=[r["provider"] for r in competitor_hits if r.get("provider")],
                impact_score=impact,
                effort="medium",
                fix_category="competitive_visibility",
                fix_type="comparison_section",
                description="At least one tested AI provider mentioned a competitor for this question, indicating weak positioning or insufficient comparison content.",
                suggested_fix="Add an objective comparison/positioning section that explains the scanned brand's category, differentiators, ideal users, and alternatives.",
                evidence={"failed_providers": len(competitor_hits), "tested_providers": n, "intent": intent},
            ))

        if low_acc:
            avg_acc = round(mean([r.get("accuracy") for r in low_acc if r.get("accuracy") is not None]), 3)
            impact = _impact(64, provider_failures=len(low_acc), commercial=commercial)
            gaps.append(_gap(
                scan_id=scan_id,
                prefix="llm-accuracy",
                suffix=question_id,
                gap_type="accuracy_gap",
                severity=_severity_from_impact(impact),
                page=target_page,
                title="AI answers may be inaccurate",
                question=question,
                target_section="Canonical answer / fact source",
                providers=[r["provider"] for r in low_acc if r.get("provider")],
                impact_score=impact,
                effort="medium",
                fix_category="accuracy",
                fix_type="canonical_answer",
                description="AI answers scored low against the generated ground truth, suggesting the site lacks a clear canonical answer or models are inferring incorrectly.",
                suggested_fix="Add a direct canonical answer with exact facts, constraints, and examples; update stale or ambiguous wording on the target page.",
                evidence={"avg_accuracy": avg_acc, "threshold": LOW_ACCURACY_THRESHOLD, "intent": intent},
            ))

        if low_conf or high_hedge or refusals or low_attr:
            failed = {r.get("provider") for r in (low_conf + high_hedge + refusals + low_attr) if r.get("provider")}
            if len(failed) / n >= 0.5:
                impact = _impact(52, provider_failures=len(failed), commercial=commercial)
                gaps.append(_gap(
                    scan_id=scan_id,
                    prefix="llm-confidence",
                    suffix=question_id,
                    gap_type="confidence_gap",
                    severity=_severity_from_impact(impact),
                    page=target_page,
                    title="AI answers are vague, hedged, or low-confidence",
                    question=question,
                    target_section="Clear answer block",
                    providers=sorted(failed),
                    impact_score=impact,
                    effort="low",
                    fix_category="confidence",
                    fix_type="answer_block",
                    description="Multiple tested AI providers produced low-confidence, hedged, low-attribution, refused, or error responses for this question.",
                    suggested_fix="Add a short, unambiguous answer block with definitions, concrete facts, and schema so models can answer confidently.",
                    evidence={
                        "low_confidence": len(low_conf),
                        "low_attribution": len(low_attr),
                        "high_hedge": len(high_hedge),
                        "refusals_or_errors": len(refusals),
                        "tested_providers": n,
                    },
                ))

    return gaps


def _dedupe(gaps: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for g in gaps:
        key = (g.get("type"), g.get("page_id"), g.get("question"), g.get("target_section"))
        if key in seen:
            continue
        seen.add(key)
        out.append(g)
    return out


def analyze(scan_id: int) -> list[dict]:
    """Return prioritized AI-aware gaps for a scan."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        return []

    pages = _load_page_details(scan_id)
    chunks = sqlite_db.list_chunks(scan_id, limit=10000)
    chunks_by_page: dict[int, list[dict]] = defaultdict(list)
    for c in chunks:
        chunks_by_page[c.get("page_id")].append(c)

    gaps: list[dict] = []
    gaps.extend(_technical_gaps(scan_id, scan, pages, chunks, chunks_by_page))
    gaps.extend(_page_type_gaps(scan_id, scan, pages, chunks_by_page))
    gaps.extend(_question_coverage_gaps(scan_id, scan, pages, chunks_by_page))
    gaps.extend(_test_lab_gaps(scan_id, pages, chunks_by_page))

    gaps = _dedupe(gaps)

    severity_order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: (severity_order.get(g.get("severity"), 99), -(g.get("impact_score") or 0), g.get("type") or ""))

    # Attach compact summary metadata to every row so downstream UI can show why
    # the analyzer prioritised it without needing a second endpoint.
    counts = Counter(g.get("type") for g in gaps)
    for g in gaps:
        g["analysis_version"] = "aeo_gap_analyzer_v2"
        g["summary"] = {
            "total_gaps": len(gaps),
            "same_type_count": counts.get(g.get("type"), 0),
        }
    return gaps
