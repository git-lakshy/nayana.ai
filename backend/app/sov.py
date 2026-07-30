"""Phase 6 — Competitor Share-of-Voice (SOV).

Compares AI-test results between a target scan and one or more competitor
scans. Produces per-provider metrics:

  brand_mention_rate     : fraction of answers mentioning the brand/domain
  domain_citation_rate   : fraction of answers citing the domain URL
  avg_confidence         : average confidence score (0-1)
  avg_attribution        : average attribution score (0-1)
  competitor_mention_rate: fraction of answers mentioning a competitor
  refusal_rate           : fraction of refused answers

Share-of-voice (sov) per provider = target_brand_mention_rate /
    (target_brand_mention_rate + sum(competitor brand mention rates))

Endpoints:
  POST /api/sov/link          link a competitor scan to a target scan
  GET  /api/sov/{scan_id}     compare target vs all linked competitor scans
"""
from __future__ import annotations

from collections import defaultdict
from typing import Optional

from backend.app import db as sqlite_db


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _aggregate_scores(scan_id: int) -> dict[str, dict]:
    """Return per-provider aggregated metrics for a scan."""
    rows = sqlite_db.scores_for_scan(scan_id)
    agg: dict[str, dict] = defaultdict(lambda: {
        "total": 0, "errors": 0,
        "conf_sum": 0.0, "attr_sum": 0.0, "hedge_sum": 0.0,
        "brand_hits": 0, "domain_cites": 0,
        "competitor_hits": 0, "refusals": 0,
    })
    for row in rows:
        p = row["provider"]
        d = agg[p]
        d["total"] += 1
        if row.get("error"):
            d["errors"] += 1
        d["conf_sum"] += row.get("confidence") or 0
        d["attr_sum"] += row.get("attribution") or 0
        d["hedge_sum"] += row.get("hedge_rate") or 0
        d["brand_hits"] += row.get("has_brand_mention") or 0
        d["domain_cites"] += row.get("has_domain_citation") or 0
        d["competitor_hits"] += row.get("has_competitor_mention") or 0
        d["refusals"] += row.get("is_refusal") or 0

    result: dict[str, dict] = {}
    for provider, d in agg.items():
        n = d["total"] or 1
        result[provider] = {
            "total_answers": d["total"],
            "errors": d["errors"],
            "avg_confidence": round(d["conf_sum"] / n, 4),
            "avg_attribution": round(d["attr_sum"] / n, 4),
            "brand_mention_rate": round(d["brand_hits"] / n, 4),
            "domain_citation_rate": round(d["domain_cites"] / n, 4),
            "competitor_mention_rate": round(d["competitor_hits"] / n, 4),
            "refusal_rate": round(d["refusals"] / n, 4),
        }
    return result


def _compute_sov(target_rate: float, competitor_rates: list[float]) -> float:
    """Simple share-of-voice: target / (target + sum(competitors))."""
    total = target_rate + sum(competitor_rates)
    if total == 0:
        return 0.0
    return round(target_rate / total, 4)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def link_competitor(parent_scan_id: int, competitor_scan_id: int,
                    competitor_url: str) -> dict:
    """Record that competitor_scan_id is a competitor of parent_scan_id."""
    conn = sqlite_db.get_conn()
    conn.execute(
        """INSERT OR IGNORE INTO competitor_scans
               (parent_scan_id, competitor_scan_id, competitor_url, created_at)
           VALUES (?, ?, ?, ?)""",
        (parent_scan_id, competitor_scan_id, competitor_url,
         sqlite_db.now_iso()),
    )
    return {
        "parent_scan_id": parent_scan_id,
        "competitor_scan_id": competitor_scan_id,
        "competitor_url": competitor_url,
    }


def list_competitor_links(scan_id: int) -> list[dict]:
    cur = sqlite_db.get_conn().execute(
        """SELECT cs.competitor_scan_id, cs.competitor_url,
                  s.root_url, s.status, s.pages_crawled, s.chunks_count
           FROM competitor_scans cs
           JOIN scans s ON s.id = cs.competitor_scan_id
           WHERE cs.parent_scan_id = ?""",
        (scan_id,),
    )
    return [sqlite_db._row_to_dict(r) for r in cur.fetchall()]


def compare(scan_id: int) -> dict:
    """Return SOV comparison for target scan vs all linked competitors."""
    target_scan = sqlite_db.get_scan(scan_id)
    if not target_scan:
        return {"error": "scan not found"}

    competitors = list_competitor_links(scan_id)
    target_metrics = _aggregate_scores(scan_id)

    competitor_results: list[dict] = []
    for comp in competitors:
        cscan_id = comp["competitor_scan_id"]
        metrics = _aggregate_scores(cscan_id)
        competitor_results.append({
            "scan_id": cscan_id,
            "url": comp["competitor_url"],
            "root_url": comp["root_url"],
            "per_provider": metrics,
        })

    # Compute SOV per provider
    all_providers: set[str] = set(target_metrics.keys())
    for cr in competitor_results:
        all_providers.update(cr["per_provider"].keys())

    sov_by_provider: dict[str, dict] = {}
    for provider in sorted(all_providers):
        t = target_metrics.get(provider, {})
        target_brand = t.get("brand_mention_rate", 0.0)
        comp_brands = [
            cr["per_provider"].get(provider, {}).get("brand_mention_rate", 0.0)
            for cr in competitor_results
        ]
        sov_by_provider[provider] = {
            "target_brand_mention_rate": target_brand,
            "competitor_brand_mention_rates": [
                {"url": competitor_results[i]["url"], "rate": comp_brands[i]}
                for i in range(len(comp_brands))
            ],
            "target_sov": _compute_sov(target_brand, comp_brands),
        }

    # Overall SOV across all providers
    all_target_brand = [
        m.get("brand_mention_rate", 0.0)
        for m in target_metrics.values()
    ]
    overall_target_brand = (
        sum(all_target_brand) / len(all_target_brand)
        if all_target_brand else 0.0
    )
    all_comp_brands: list[float] = []
    for cr in competitor_results:
        rates = [m.get("brand_mention_rate", 0.0) for m in cr["per_provider"].values()]
        all_comp_brands.append(sum(rates) / len(rates) if rates else 0.0)

    return {
        "scan_id": scan_id,
        "target_url": target_scan["root_url"],
        "competitor_count": len(competitors),
        "overall_target_sov": _compute_sov(overall_target_brand, all_comp_brands),
        "overall_target_brand_mention_rate": round(overall_target_brand, 4),
        "sov_by_provider": sov_by_provider,
        "target_per_provider": target_metrics,
        "competitors": competitor_results,
    }
