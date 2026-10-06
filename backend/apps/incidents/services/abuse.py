"""
Pure anti-abuse rules: no database, no Django request objects — easy to unit test.
Orchestration (queries, saving) lives in submission.py.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import h3

from .. import policy


# ---------- identifiers ----------
def hash_identifier(value: str, salt: str) -> str:
    """Salted, keyed hash of a device ID or IP. Raw values are never stored."""
    return hmac.new(salt.encode(), value.encode(), hashlib.sha256).hexdigest()


# ---------- text ----------
_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def text_fingerprint(text: str) -> str:
    """Hash of normalised text, so trivial edits (case, spaces, punctuation) still match."""
    norm = unicodedata.normalize("NFKC", text).lower()
    norm = _WS.sub(" ", _PUNCT.sub(" ", norm)).strip()
    if len(norm) < 12:  # too short to mean anything ("ok", "help")
        return ""
    return hashlib.sha256(norm.encode()).hexdigest()


# ---------- plausibility ----------
def date_is_plausible(day: date | None, today: date) -> bool:
    if day is None:
        return True
    age = (today - day).days
    return 0 <= age <= policy.MAX_REPORT_AGE_DAYS


def hour_is_plausible(day: date | None, hour: int | None, block: int, now: datetime) -> bool:
    """An incident today cannot be later than the current hour."""
    if day != now.date():
        return True
    latest = hour if hour is not None else block * 3
    return latest <= now.hour


# ---------- weighting & trust ----------
def clamp_trust(value: float) -> float:
    return max(policy.TRUST_MIN, min(policy.TRUST_MAX, value))


def report_weight(status: str, trust: float, corroborations: int) -> float:
    """
    How much one report counts toward an area's level.
    Pending community reports start low; independent corroboration and the reporter's
    history move it up or down. Rejected/duplicate reports count for nothing.
    """
    base = policy.STATUS_WEIGHT.get(status, 0.0)
    if base == 0:
        return 0.0
    if status == "pending":
        # Corroboration only matters before a moderator has decided.
        base = min(1.0, base + min(policy.CORROBORATION_CAP, corroborations * policy.CORROBORATION_STEP))
    return round(base * clamp_trust(trust), 4)


# ---------- corroboration ----------
@dataclass(frozen=True)
class ReportSignature:
    h3: str
    category: str
    date: date | None
    hour: int | None
    block: int
    device_hash: str
    ip_hash: str


def _approx_hour(sig: ReportSignature) -> int:
    return sig.hour if sig.hour is not None else sig.block * 3 + 1


def corroborates(a: ReportSignature, b: ReportSignature) -> bool:
    """
    Two reports support each other only if they are *independent* (different device AND
    different IP) and describe the same kind of event, nearby, around the same time.
    """
    if a.device_hash == b.device_hash or a.ip_hash == b.ip_hash:
        return False
    if a.category != b.category:
        return False
    if b.h3 not in h3.grid_disk(a.h3, policy.CORROBORATE_RING):
        return False
    if a.date and b.date and abs((a.date - b.date).days) > policy.CORROBORATE_DAYS:
        return False
    diff = abs(_approx_hour(a) - _approx_hour(b))
    return min(diff, 24 - diff) <= policy.CORROBORATE_HOURS


# ---------- bursts ----------
def is_burst(report_count: int, distinct_devices: int) -> bool:
    """Many reports in one area in a short window, from very few devices."""
    return report_count >= policy.BURST_MIN_REPORTS and distinct_devices <= policy.BURST_MAX_DEVICES


def window_start(now: datetime, window: timedelta) -> datetime:
    return now - window
