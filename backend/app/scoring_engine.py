"""AI Visibility Scoring Engine.

Composite score (0-100) from gap penalties and LLM signal bonus:
  base = 100
  - 15 per HIGH gap (max -45), - 8 per MEDIUM (max -40), - 2 per LOW (max -15)
  + avg_confidence * 15 + avg_attribution * 10
  Clamped to [0, 100]. Stored in score_history for trend tracking.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlsplit
from collections import defaultdict

from backend.app import db as sqlite_db
from backend.app import gap_analyzer


PENALTY = {"high": 15, "medium": 8, "low": 2}
MAX_PENALTY = {"high": 45, "medium": 40, "low": 15}


def _domain_from_url(url: str) -> str:
    try:
        return urlsplit(url).netloc or url
    except Exception:
        return url


def _llm_signal(scan_id: int) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """Return (avg_confidence, avg_attribution, avg_accuracy) or None if no test data."""
    rows = sqlite_db.scores_for_scan(scan_id)
    if not rows:
        return None, None, None
    conf_vals = [r["confidence"] for r in rows if r.get("confidence") is not None]
    attr_vals = [r["attribution"] for r in rows if r.get("attribution") is not None]
    acc_vals  = [r["accuracy"]    for r in rows if r.get("accuracy") is not None]
    avg_conf = sum(conf_vals) / len(conf_vals) if conf_vals else None
    avg_attr = sum(attr_vals) / len(attr_vals) if attr_vals else None
    avg_acc  = sum(acc_vals)  / len(acc_vals)  if acc_vals  else None
    return avg_conf, avg_attr, avg_acc


def compute(scan_id: int, save: bool = True) -> dict:
    """Compute and (optionally) persist the AI visibility score for a scan."""
    scan = sqlite_db.get_scan(scan_id)
    if not scan:
        return {"error": "scan not found"}

    gaps = gap_analyzer.analyze(scan_id)
    domain = _domain_from_url(scan.get("root_url", ""))

    # Count gaps by severity
    counts = {"high": 0, "medium": 0, "low": 0}
    for g in gaps:
        sev = g.get("severity", "low")
        counts[sev] = counts.get(sev, 0) + 1

    # Gap penalty (capped per severity band)
    penalty_high   = min(counts["high"]   * PENALTY["high"],   MAX_PENALTY["high"])
    penalty_medium = min(counts["medium"] * PENALTY["medium"], MAX_PENALTY["medium"])
    penalty_low    = min(counts["low"]    * PENALTY["low"],    MAX_PENALTY["low"])
    total_penalty  = penalty_high + penalty_medium + penalty_low

    base = 100 - total_penalty

    # LLM signal bonus
    avg_conf, avg_attr, avg_acc = _llm_signal(scan_id)
    bonus_confidence  = round((avg_conf or 0.0) * 15, 2)
    bonus_attribution = round((avg_attr or 0.0) * 10, 2)
    total_bonus = bonus_confidence + bonus_attribution

    final_score = max(0.0, min(100.0, base + total_bonus))

    # Fix counts
    fixes = sqlite_db.list_fixes(scan_id)
    fix_count = len(fixes)
    applied_count = sum(1 for f in fixes if f.get("status") == "applied")

    result = {
        "scan_id": scan_id,
        "domain": domain,
        "ai_coverage_score": round(final_score, 2),
        "breakdown": {
            "base_score": 100,
            "penalty_high_gaps": penalty_high,
            "penalty_medium_gaps": penalty_medium,
            "penalty_low_gaps": penalty_low,
            "total_penalty": total_penalty,
            "bonus_confidence": bonus_confidence,
            "bonus_attribution": bonus_attribution,
            "total_bonus": round(total_bonus, 2),
        },
        "gap_summary": {
            "total": len(gaps),
            "high": counts["high"],
            "medium": counts["medium"],
            "low": counts["low"],
        },
        "llm_signal": {
            "avg_confidence": round(avg_conf, 4) if avg_conf is not None else None,
            "avg_attribution": round(avg_attr, 4) if avg_attr is not None else None,
            "avg_accuracy": round(avg_acc, 4) if avg_acc is not None else None,
            "has_test_data": avg_conf is not None,
        },
        "fixes": {
            "total": fix_count,
            "applied": applied_count,
            "pending": fix_count - applied_count,
        },
    }

    if save:
        sqlite_db.upsert_score_history(
            scan_id=scan_id,
            domain=domain,
            gap_count=len(gaps),
            high_severity_gaps=counts["high"],
            medium_severity_gaps=counts["medium"],
            low_severity_gaps=counts["low"],
            fix_count=fix_count,
            applied_fix_count=applied_count,
            avg_confidence=avg_conf,
            avg_attribution=avg_attr,
            avg_accuracy=avg_acc,
            ai_coverage_score=final_score,
        )

    return result


def history(domain: str, limit: int = 50) -> list[dict]:
    """Return score history for a domain, oldest-first."""
    return sqlite_db.get_score_history(domain=domain, limit=limit)


def latest(domain: str) -> Optional[dict]:
    rows = history(domain, limit=1)
    return rows[0] if rows else None
