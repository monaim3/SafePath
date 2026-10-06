"""Pure rule tests — no database."""

from datetime import date, datetime, timedelta

import h3
import pytest

from apps.incidents import policy
from apps.incidents.services import abuse

CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)  # demo point, not a real report


def sig(**kw) -> abuse.ReportSignature:
    base = dict(h3=CELL, category="motorbike", date=date(2026, 10, 5), hour=None, block=7,
                device_hash="dev-a", ip_hash="ip-a")
    base.update(kw)
    return abuse.ReportSignature(**base)


def test_hash_is_salted_and_stable():
    assert abuse.hash_identifier("device-1", "salt") == abuse.hash_identifier("device-1", "salt")
    assert abuse.hash_identifier("device-1", "salt") != abuse.hash_identifier("device-1", "other-salt")
    assert "device-1" not in abuse.hash_identifier("device-1", "salt")


def test_text_fingerprint_ignores_case_spacing_punctuation():
    a = abuse.text_fingerprint("Bike riders grabbed my phone near the U-loop!")
    b = abuse.text_fingerprint("  bike riders grabbed my PHONE near the u loop ")
    assert a and a == b
    assert abuse.text_fingerprint("help") == ""  # too short to compare


def test_dates_must_be_past_and_within_a_year():
    today = date(2026, 10, 6)
    assert abuse.date_is_plausible(today, today)
    assert not abuse.date_is_plausible(today + timedelta(days=1), today)
    assert not abuse.date_is_plausible(today - timedelta(days=400), today)


def test_hour_cannot_be_in_the_future_today():
    now = datetime(2026, 10, 6, 14, 30)
    assert abuse.hour_is_plausible(now.date(), 13, 4, now)
    assert not abuse.hour_is_plausible(now.date(), 22, 7, now)
    assert not abuse.hour_is_plausible(now.date(), None, 7, now)  # block 21:00–24:00
    assert abuse.hour_is_plausible(date(2026, 10, 5), 22, 7, now)  # yesterday is fine


def test_weights():
    assert abuse.report_weight("rejected", 1.5, 10) == 0
    pending = abuse.report_weight("pending", 1.0, 0)
    assert pending == pytest.approx(policy.STATUS_WEIGHT["pending"])
    assert abuse.report_weight("pending", 1.0, 2) > pending
    # corroboration is capped and never beats a verified report from the same reporter
    assert abuse.report_weight("pending", 1.0, 50) <= abuse.report_weight("verified", 1.0, 0)
    # trust scales weight within bounds
    assert abuse.report_weight("verified", 99, 0) == pytest.approx(policy.TRUST_MAX)


def test_corroboration_requires_independence():
    a = sig()
    assert abuse.corroborates(a, sig(device_hash="dev-b", ip_hash="ip-b"))
    assert not abuse.corroborates(a, sig(device_hash="dev-a", ip_hash="ip-b"))  # same device
    assert not abuse.corroborates(a, sig(device_hash="dev-b", ip_hash="ip-a"))  # same network


def test_corroboration_requires_same_event_shape():
    a = sig()
    other = dict(device_hash="dev-b", ip_hash="ip-b")
    assert not abuse.corroborates(a, sig(category="bus", **other))
    assert not abuse.corroborates(a, sig(date=date(2026, 9, 1), **other))
    assert not abuse.corroborates(a, sig(block=3, **other))  # 10 AM vs 10 PM
    far = h3.grid_ring(CELL, 3)[0]
    assert not abuse.corroborates(a, sig(h3=far, **other))
    near = h3.grid_ring(CELL, 1)[0]
    assert abuse.corroborates(a, sig(h3=near, **other))
    # hours wrap around midnight: 23:00 and 01:00 are 2 hours apart
    assert abuse.corroborates(sig(hour=23, block=7), sig(hour=1, block=0, **other))


def test_burst():
    assert abuse.is_burst(policy.BURST_MIN_REPORTS, 1)
    assert not abuse.is_burst(policy.BURST_MIN_REPORTS, policy.BURST_MAX_DEVICES + 1)
    assert not abuse.is_burst(policy.BURST_MIN_REPORTS - 1, 1)
