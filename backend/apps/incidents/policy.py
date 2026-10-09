"""
Anti-abuse thresholds. Kept in one place so they can later move to an admin-editable
RiskConfig without touching the logic. See docs/SAFEPATH_MASTER_PROMPT.md §12.
"""

from datetime import timedelta

# ---------- rate limits (per device hash and per IP hash) ----------
RATE_LIMITS: tuple[tuple[timedelta, int], ...] = (
    (timedelta(minutes=10), 2),
    (timedelta(days=1), 5),
)
CONFIRM_LIMIT_PER_DAY = 30

# ---------- plausibility ----------
MAX_REPORT_AGE_DAYS = 366
# Verified news/official reports document longer-running hotspots, so they may be older
# and fade more slowly than community reports (which describe what is happening now).
HISTORY_MAX_AGE_DAYS = 730
HISTORY_HALF_LIFE_DAYS = 180.0
# The reporter's own location is never collected or compared with the incident location:
# victims often report later, from home or a borrowed phone, because their phone was taken.

# ---------- weighting ----------
STATUS_WEIGHT = {"pending": 0.3, "verified": 1.0, "rejected": 0.0, "duplicate": 0.0}
TRUST_MIN, TRUST_MAX, TRUST_START = 0.5, 1.5, 0.8
# Each independent corroboration adds this much, up to the cap.
CORROBORATION_STEP, CORROBORATION_CAP = 0.15, 0.6

# ---------- trust changes ----------
TRUST_ON_CORROBORATED = 0.05
TRUST_ON_VERIFIED = 0.15
TRUST_ON_REJECTED = -0.3
# This many rejections within the window restricts reporting for the restriction period.
RESTRICT_AFTER_REJECTIONS = 3
RESTRICT_WINDOW = timedelta(days=30)
RESTRICTION_PERIOD = timedelta(days=7)

# ---------- corroboration window ----------
CORROBORATE_RING = 1  # same H3 cell plus direct neighbours
CORROBORATE_DAYS = 3
CORROBORATE_HOURS = 3

# ---------- bursts (coordinated campaigns) ----------
BURST_WINDOW = timedelta(hours=6)
BURST_MIN_REPORTS = 6
# Flag when the reports come from this many devices or fewer.
BURST_MAX_DEVICES = 2

# ---------- time-of-day pattern ----------
# With fewer reports than this, one report at 6am would otherwise make 6am look "high":
# no single hour is then rated above the area's overall level.
MIN_PATTERN_REPORTS = 3

# ---------- public map ----------
K_ANONYMITY_REPORTS = 3
K_ANONYMITY_DEVICES = 2
