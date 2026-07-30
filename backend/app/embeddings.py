"""Embeddings and cosine similarity for answer accuracy scoring.

Uses OpenAI text-embedding-3-small. Returns None on any failure so scoring
can complete without crashing (accuracy column becomes NULL).
"""
from __future__ import annotations

import math
import os
from typing import List, Optional

EMBED_MODEL = "text-embedding-3-small"


def is_configured() -> bool:
    """Cheap pre-flight that doesn't hit the network."""
    return bool(os.environ.get("OPENAI_API_KEY"))


def embed(text: str) -> Optional[List[float]]:
    """Embed a single string. Returns None on any failure."""
    text = (text or "").strip()
    if not text or not is_configured():
        return None
    try:
        # lazy import so the module loads even if openai isn't installed yet
        from openai import OpenAI
        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=20)
        resp = client.embeddings.create(model=EMBED_MODEL, input=text)
        return list(resp.data[0].embedding)
    except Exception:
        return None


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Standard cosine sim. Returns 0.0 on mismatched lengths or zero vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def normalized_similarity(a: Optional[List[float]],
                          b: Optional[List[float]]) -> Optional[float]:
    """Cosine mapped from [-1, 1] to [0, 1]; None in -> None out."""
    if a is None or b is None:
        return None
    sim = cosine_similarity(a, b)
    return max(0.0, min(1.0, (sim + 1.0) / 2.0))
