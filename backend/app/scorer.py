"""Phase 3 scoring: extracts confidence, hedge_rate, attribution, and
semantic-accuracy signals from a provider answer.

All functions are pure (no I/O) so they can be called in a tight loop
across many questions * providers.
"""
from __future__ import annotations

import re
from typing import Optional, Tuple, List

# ----- refusal patterns -----
_REFUSAL = re.compile(
    r"\b("
    r"(I('m| am)\s+)?(sorry|unable|cannot|can't|not able)"
    r"|no\s+information"
    r"|no\s+(specific|relevant)\s+(data|details|information|content|context)"
    r"|I don't?\s+(know|have|have\s+enough)\b"
    r"|as an AI"
    r"|(as an?\s+)+(language model|AI chatbot)"
    r"|I\s+cannot\s+(answer|provide|help|assist|generate)"
    r"|unable to"
    r"|does not provide"
    r"|not\s+specified"
    r"|no\s+public"
    r")",
    re.IGNORECASE,
)

# ----- Hedge words (singletons and short phrases) -----
HEDGE_WORDS: set[str] = {
    "maybe", "perhaps", "possibly", "might", "could", "may",
    "seem", "seems", "appears", "appear", "probably",
    "likely", "unlikely", "i think", "i believe",
    "it is possible", "unclear", "speculative",
}


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9_]+", text.lower())


def detect_refusal(text: str) -> bool:
    """True when the answer starts or is dominated by a refusal/hedge preamble."""
    if not text.strip():
        return True
    head = text[:200]
    return bool(_REFUSAL.search(head))


def compute_hedge_rate(text: str) -> float:
    """Hedge-word hits per 100 tokens. Returns 0..1 (clamped)."""
    if not text.strip():
        return 0.0
    lower = text.lower()
    tokens = _tokenize(lower)
    if not tokens:
        return 0.0
    hedge_hits = 0
    for hedge in HEDGE_WORDS:
        # count non-overlapping occurrences in the raw lowercased text
        hedge_hits += lower.count(hedge)
    rate = (hedge_hits * 100) / len(tokens)
    return min(1.0, rate)


def detect_brand_mention(text: str, brand: str) -> bool:
    """Case-insensitive brand name mention."""
    if not brand or not text:
        return False
    return brand.lower() in text.lower()


def detect_competitor_mention(text: str, competitors: list[str]) -> bool:
    """True when any competitor name appears in the answer."""
    if not text or not competitors:
        return False
    lower = text.lower()
    return any(c.lower() in lower for c in competitors if c)


def detect_domain_citation(text: str, domain: str) -> bool:
    """Check if the target domain/hostname appears in the answer."""
    if not domain or not text:
        return False
    host = domain.lower().replace("www.", "").replace("http://", "")\
                 .replace("https://", "").rstrip("/")
    return host in text.lower()


def compute_attribution(brand_mentioned: bool, domain_cited: bool,
                        competitor_mentioned: bool) -> float:
    if competitor_mentioned:
        return 0.3
    score = 0.0
    if brand_mentioned:
        score += 0.5
    if domain_cited:
        score += 0.5
    return min(0.95, score)


def compute_confidence(is_refusal: bool, hedge_rate: float) -> float:
    if is_refusal:
        return max(0.0, 0.1 - hedge_rate * 0.2)
    return max(0.2, 0.95 - hedge_rate * 0.5)


def full_score(answer_text: str, ground_truth: str, *,
               brand: str = "", domain: str = "",
               competitors: list[str] | None = None,
               embed_tuple: Tuple | None = None,
               ) -> dict:
    """Run every Phase 3 signal and return a dict ready for persist_scores."""
    txt = (answer_text or "").strip()
    if not txt:
        return {
            "confidence": 0.0, "accuracy": None, "attribution": 0.0,
            "is_refusal": 1, "hedge_rate": 0.0,
            "has_brand_mention": 0, "has_competitor_mention": 0,
            "has_domain_citation": 0,
        }

    comps = competitors or []

    refusal = detect_refusal(txt)
    hedge = compute_hedge_rate(txt)
    confidence = compute_confidence(refusal, hedge)

    brand_mention = 1 if detect_brand_mention(txt, brand) else 0
    competitor_mention = 1 if detect_competitor_mention(txt, comps) else 0
    domain_citation = 1 if detect_domain_citation(txt, domain) else 0
    attribution = compute_attribution(bool(brand_mention), bool(domain_citation),
                                      bool(competitor_mention))

    accuracy: float | None = None
    if embed_tuple is not None:
        from backend.app.embeddings import normalized_similarity
        accuracy = normalized_similarity(embed_tuple[0], embed_tuple[1])

    return {
        "confidence": round(confidence, 3),
        "accuracy": round(accuracy, 3) if accuracy is not None else None,
        "attribution": round(attribution, 3),
        "is_refusal": int(refusal),
        "hedge_rate": round(hedge, 3),
        "has_brand_mention": brand_mention,
        "has_competitor_mention": competitor_mention,
        "has_domain_citation": domain_citation,
    }
