"""
Turns stored reports into what the map and area pages show. Pure functions over plain
`Row`s (no ORM), so the scoring is easy to test. Mirrors the frontend types in
frontend/src/lib/safety/types.ts.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime

import h3

from .. import policy

BANDS = (("very_low", 15), ("low", 30), ("moderate", 50), ("elevated", 65), ("high", 80), ("very_high", 100))
# Weight that gives score ≈ 63 at each resolution, so a score reflects density, not cell size.
# Calibrated (Oct 2026) on ~130 verified news reports: the densest hotspots read high/very high,
# a single fresh report on one street stays at "moderate". Raise again as community reports grow.
SCORE_SCALE = {8: 8.8, 9: 2.8, 10: 1.6}
HALF_LIFE_DAYS = 30.0
# Local-knowledge reports describe patterns; they shape the time-of-day profile more than the level.
KNOWLEDGE_FACTOR = 0.5


@dataclass(frozen=True)
class Row:
    id: str
    kind: str
    category: str
    h3: str  # resolution 10
    block: int
    hour: int | None
    days: str
    status: str
    weight: float  # already includes status, reporter trust and corroboration
    corroborations: int
    confirmations: int
    device_id: str
    created_at: datetime
    source: str = "community"


def band_for(score: float) -> str:
    s = max(0, min(100, round(score)))
    return next(name for name, upper in BANDS if s <= upper)


def confidence_for(report_count: int, verified_pct: int) -> str:
    if report_count < policy.K_ANONYMITY_REPORTS or verified_pct < 20:
        return "low"
    if report_count > 15 and verified_pct > 50:
        return "high"
    return "moderate"


def score_from(weight: float, res: int) -> int:
    return round(100 * (1 - math.exp(-weight / SCORE_SCALE[res])))


def decay(row: Row, now: datetime) -> float:
    days = max(0.0, (now - row.created_at).total_seconds() / 86400)
    half_life = policy.HISTORY_HALF_LIFE_DAYS if row.source in ("media", "official") else HALF_LIFE_DAYS
    return 0.5 ** (days / half_life)


def effective_weight(row: Row, now: datetime) -> float:
    if row.kind == "positive":
        return 0.0
    factor = KNOWLEDGE_FACTOR if row.kind == "knowledge" else 1.0
    return row.weight * factor * decay(row, now)


def hour_weights(rows: list[Row], now: datetime) -> list[float]:
    """Weight per hour of day. Reports with only a 3-hour block spread evenly across it."""
    w = [0.0] * 24
    for r in rows:
        ew = effective_weight(r, now)
        if r.hour is not None:
            w[r.hour] += ew
        else:
            for h in range(r.block * 3, r.block * 3 + 3):
                w[h] += ew / 3
    return w


def smooth(w: list[float]) -> list[float]:
    """Reported times are approximate: blend each hour with its neighbours (circular)."""
    return [0.25 * w[(h - 1) % 24] + 0.5 * w[h] + 0.25 * w[(h + 1) % 24] for h in range(24)]


def to_res(cell: str, res: int) -> str:
    return cell if h3.get_resolution(cell) == res else h3.cell_to_parent(cell, res)


def group_by_cell(rows: list[Row], res: int) -> dict[str, list[Row]]:
    groups: dict[str, list[Row]] = defaultdict(list)
    for r in rows:
        groups[to_res(r.h3, res)].append(r)
    return groups


def is_public(rows: list[Row]) -> bool:
    """
    k-anonymity: enough community reports from enough different devices before anything is shown,
    so a lone report can't point at the person who sent it. A verified news or official report is
    already public, so it can show an area by itself.
    """
    counted = [r for r in rows if r.kind != "positive"]
    if any(r.source in ("media", "official") and r.status == "verified" for r in counted):
        return True
    return (
        len(counted) >= policy.K_ANONYMITY_REPORTS
        and len({r.device_id for r in counted}) >= policy.K_ANONYMITY_DEVICES
    )


def _within(rows: list[Row], now: datetime, start_days: float, end_days: float) -> list[Row]:
    return [r for r in rows if start_days <= (now - r.created_at).total_seconds() / 86400 < end_days]


def _cap_sparse(scores: list[int], incidents: list[Row], now: datetime, res: int) -> list[int]:
    """Too few reports to show a real time-of-day pattern: no hour rates above the overall level."""
    if len(incidents) >= policy.MIN_PATTERN_REPORTS:
        return scores
    overall = score_from(sum(effective_weight(r, now) for r in incidents), res)
    return [min(s, overall) for s in scores]


def hour_scores(incidents: list[Row], now: datetime, res: int) -> list[int]:
    hourly = smooth(hour_weights(incidents, now))
    return _cap_sparse([score_from(w * 24, res) for w in hourly], incidents, now, res)


def block_scores(incidents: list[Row], now: datetime, res: int) -> list[int]:
    hourly = smooth(hour_weights(incidents, now))
    return _cap_sparse([score_from(sum(hourly[b * 3 : b * 3 + 3]) * 8, res) for b in range(8)], incidents, now, res)


def block_shares(incidents: list[Row], now: datetime) -> list[int]:
    """
    Share of reports (%) in each 3-hour block. Unlike block_scores, which saturate at busy spots
    (every block of a very-high area reads "very high"), this shows when reports cluster.
    """
    hourly = smooth(hour_weights(incidents, now))
    total = sum(hourly)
    if total <= 0:
        return [0] * 8
    return [round(100 * sum(hourly[b * 3 : b * 3 + 3]) / total) for b in range(8)]


def _street_score(incidents: list[Row], now: datetime, hour: int | None) -> int:
    """Level of one street-level (resolution 10) cell, overall or at `hour`."""
    if hour is None:
        return score_from(sum(effective_weight(r, now) for r in incidents), 10)
    return hour_scores(incidents, now, 10)[hour]


def cell_summary(cell: str, rows: list[Row], now: datetime, hour: int | None) -> dict:
    res = h3.get_resolution(cell)
    incidents = [r for r in rows if r.kind != "positive"]
    # A zoomed-out cell takes the level of its busiest street. Adding up a whole neighbourhood
    # coloured areas red that had no red street in them (and hid a lone hotspot among quiet
    # streets), so zooming in showed something different. Now red means "a red street is in here".
    streets = group_by_cell(incidents, 10)
    score = max((_street_score(street, now, hour) for street in streets.values()), default=0)
    verified_pct = _verified_pct(incidents)
    top = Counter(r.category for r in incidents).most_common(1)
    return {
        "h3": cell,
        "score": score,
        "band": band_for(score),
        "confidence": confidence_for(len(incidents), verified_pct),
        "reports30": len(_within(incidents, now, 0, 30)),
        "topCategory": top[0][0] if top else None,
        "insufficient": False,
    }


def busiest_street(rows: list[Row], now: datetime) -> tuple[str, list[Row]] | None:
    """The street-level cell (with its rows) that sets a neighbourhood's level: its busiest street
    that is itself public, so its own page can be shown. None when no street is public on its own."""
    streets = [
        (cell, street_rows)
        for cell, street_rows in group_by_cell(rows, 10).items()
        if is_public(street_rows)
    ]
    if not streets:
        return None
    return max(
        streets,
        key=lambda s: _street_score([r for r in s[1] if r.kind != "positive"], now, None),
    )


def street_day(cell: str, rows: list[Row], now: datetime) -> dict:
    """One street-level cell's level for the whole day (`day`) and for each hour (`hours`, 24 values)."""
    incidents = [r for r in rows if r.kind != "positive"]
    return {"h3": cell, "day": _street_score(incidents, now, None), "hours": hour_scores(incidents, now, 10)}


def _verified_pct(rows: list[Row]) -> int:
    return round(100 * sum(r.status == "verified" for r in rows) / len(rows)) if rows else 0


def _bucket(n: int) -> int:
    """Public confirmation counts are bucketed so they can't be gamed precisely."""
    for b in (50, 25, 10, 3):
        if n >= b:
            return b
    return n


def area_detail(cell: str, rows: list[Row], now: datetime, *, is_demo: bool) -> dict:
    res = h3.get_resolution(cell)
    lat, lng = h3.cell_to_latlng(cell)
    base = {"h3": cell, "code": cell[4:9].upper(), "center": [lng, lat], "isDemo": is_demo}
    if not is_public(rows):
        return {
            **base, "score": 0, "band": "very_low", "confidence": "low", "reports30": 0, "topCategory": None,
            "insufficient": True, "reportCount": 0, "verifiedPct": 0, "counts": {"d7": 0, "d30": 0, "d90": 0},
            "categories": [], "timeBlocks": [0] * 8, "blockShares": [0] * 8, "hours": [0] * 24,
            "trend": {"prev": 0, "curr": 0, "direction": "flat"}, "knowledge": [], "positives": [],
            "sources": {"community": 0, "verified": 0, "media": 0, "official": 0}, "busyArea": False,
        }

    incidents = [r for r in rows if r.kind != "positive"]
    positives = [r for r in rows if r.kind == "positive"]
    summary = cell_summary(cell, rows, now, None)

    hours = hour_scores(incidents, now, res)
    blocks = block_scores(incidents, now, res)

    d30 = len(_within(incidents, now, 0, 30))
    prev = len(_within(incidents, now, 30, 60))
    direction = "up" if d30 > prev * 1.15 else "down" if d30 < prev * 0.85 else "flat"

    knowledge = [
        {
            "id": r.id,
            "category": r.category,
            "fromBlock": r.block,
            "toBlock": min(7, r.block + 1),
            "days": r.days or "every_day",
            "confirmationsBucket": _bucket(r.confirmations),
            "status": "corroborated" if r.status == "verified" or r.corroborations >= 3 else "unverified",
        }
        for r in sorted((r for r in rows if r.kind == "knowledge"), key=lambda r: -r.confirmations)[:5]
    ]

    community = [r for r in incidents if r.source == "community"]
    verified = sum(r.status == "verified" for r in community)
    return {
        **base,
        **summary,
        # Every report still counted here, including older news kept as history.
        "reportCount": len(incidents),
        "verifiedPct": _verified_pct(incidents),
        "counts": {
            "d7": len(_within(incidents, now, 0, 7)),
            "d30": d30,
            "d90": len(_within(incidents, now, 0, 90)),
        },
        "categories": [{"key": k, "count": n} for k, n in Counter(r.category for r in incidents).most_common()],
        "timeBlocks": blocks,
        "blockShares": block_shares(incidents, now),
        "hours": hours,
        "trend": {"prev": prev, "curr": d30, "direction": direction},
        "knowledge": knowledge,
        "positives": [{"key": k, "count": n} for k, n in Counter(r.category for r in positives).most_common()],
        "sources": {
            "community": len(community) - verified,
            "verified": verified,
            "media": sum(r.source == "media" for r in incidents),
            "official": sum(r.source == "official" for r in incidents),
        },
        # No footfall data yet; the "busy area" note stays off rather than guessing.
        "busyArea": False,
    }


def city_time_profile(rows: list[Row], now: datetime) -> list[int]:
    """Activity per hour across the city, relative to the busiest hour (0–90)."""
    w = smooth(hour_weights([r for r in rows if r.kind != "positive"], now))
    top = max(w) or 1.0
    return [round(v / top * 90) for v in w]
