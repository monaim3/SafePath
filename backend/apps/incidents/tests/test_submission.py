"""End-to-end anti-abuse behaviour through the API and services (uses the test database)."""

import itertools
from datetime import timedelta

import h3
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog, ImmutableError
from apps.incidents import policy
from apps.incidents.models import Confirmation, Device, Report
from apps.incidents.services.submission import SubmissionRejected, submit_report
from apps.moderation.models import Flag
from apps.moderation.services import reject_report, verify_report

pytestmark = pytest.mark.django_db

CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)  # demo location
_ids = itertools.count(1)


def device_id() -> str:
    return f"install-{next(_ids):012d}"


def yesterday() -> str:
    return (timezone.localdate() - timedelta(days=1)).isoformat()


def payload(**overrides) -> dict:
    data = {
        "kind": "incident",
        "category": "motorbike",
        "h3": CELL,
        "when": "yesterday",
        "date": yesterday(),
        "block": 7,
        "relation": "experienced",
        "description": "",
        "device_id": device_id(),
    }
    data.update(overrides)
    return data


def post(client: APIClient, data: dict, ip: str = "203.0.113.1"):
    return client.post("/api/v1/reports", data, format="json", REMOTE_ADDR=ip)


@pytest.fixture
def client() -> APIClient:
    return APIClient()


# ---------- intake ----------
def test_accepts_valid_report_with_minimal_response(client):
    res = post(client, payload())
    assert res.status_code == 201
    assert set(res.json()) == {"id", "status"}  # never reveals flags, weight or trust
    report = Report.objects.get()
    assert report.status == "pending"
    assert report.weight == pytest.approx(policy.STATUS_WEIGHT["pending"] * policy.TRUST_START)


def test_stores_only_hashes(client):
    data = payload()
    post(client, data, ip="198.51.100.7")
    report = Report.objects.select_related("device").get()
    assert data["device_id"] not in report.device.device_hash
    assert "198.51.100.7" not in report.ip_hash


def test_server_redacts_personal_info(client):
    post(client, payload(description="call me 01712345678 or a@b.com"))
    assert "01712345678" not in Report.objects.get().description
    assert "a@b.com" not in Report.objects.get().description


@pytest.mark.parametrize(
    "overrides",
    [
        {"date": (timezone.localdate() + timedelta(days=1)).isoformat()},  # future
        {"date": (timezone.localdate() - timedelta(days=500)).isoformat()},  # too old
        {"category": "well_lit"},  # good sign sent as an incident
        {"h3": h3.latlng_to_cell(23.76, 90.42, 8)},  # too coarse
        {"hour": 10, "block": 7},  # hour outside its block
    ],
)
def test_rejects_impossible_reports(client, overrides):
    assert post(client, payload(**overrides)).status_code == 400


# ---------- rate limits ----------
def test_rate_limit_per_device(client):
    data = payload()
    for _ in range(2):
        assert post(client, {**data}, ip=f"203.0.113.{next(_ids)}").status_code == 201
    assert post(client, {**data}, ip="203.0.113.250").status_code == 429


def test_rate_limit_per_ip_catches_new_device_ids(client):
    for _ in range(2):
        assert post(client, payload(), ip="203.0.113.9").status_code == 201
    # a "fresh" device from the same network is still limited
    assert post(client, payload(), ip="203.0.113.9").status_code == 429


# ---------- corroboration ----------
def test_independent_reports_corroborate_each_other(client):
    post(client, payload(), ip="203.0.113.10")
    post(client, payload(), ip="203.0.113.11")
    first, second = Report.objects.order_by("created_at")
    assert first.corroborations == 1 and second.corroborations == 1
    assert second.weight > policy.STATUS_WEIGHT["pending"] * policy.TRUST_START


def test_same_network_does_not_corroborate(client):
    post(client, payload(), ip="203.0.113.12")
    post(client, payload(), ip="203.0.113.12")
    assert all(r.corroborations == 0 for r in Report.objects.all())


def test_different_event_does_not_corroborate(client):
    post(client, payload(), ip="203.0.113.13")
    post(client, payload(category="bus"), ip="203.0.113.14")
    assert all(r.corroborations == 0 for r in Report.objects.all())


# ---------- flags ----------
def test_copy_pasted_text_is_flagged_quietly(client):
    text = "Two men on a bike grabbed a phone near the bridge"
    post(client, payload(description=text), ip="203.0.113.15")
    res = post(client, payload(description=text.upper() + "!!"), ip="203.0.113.16")
    assert res.status_code == 201 and set(res.json()) == {"id", "status"}
    assert Flag.objects.filter(reason=Flag.Reason.TEXT_DUPLICATE).count() == 1


def test_reporting_from_far_away_is_never_penalised(client):
    """A victim whose phone was snatched may report later from home, 10+ km away, on another device."""
    lat, lng = h3.cell_to_latlng(CELL)
    res = post(client, payload(when="just_now", date=timezone.localdate().isoformat(), block=0,
                               gps=[lng, lat + 0.1]))  # ~11 km away; the API ignores it entirely
    assert res.status_code == 201
    assert Report.objects.get().flags == []
    assert not Flag.objects.exists()


def test_burst_from_few_devices_is_flagged_once():
    devices = [device_id(), device_id()]
    start = timezone.now() - timedelta(hours=2)
    data = {"kind": "incident", "category": "motorbike", "h3": CELL, "when": "yesterday",
            "date": timezone.localdate() - timedelta(days=1), "block": 7}
    for i in range(policy.BURST_MIN_REPORTS + 2):
        submit_report(data=dict(data), device_id=devices[i % 2], ip=f"198.51.100.{i}",
                      now=start + timedelta(minutes=15 * i))
    flags = Flag.objects.filter(reason=Flag.Reason.BURST, h3=CELL)
    assert flags.count() == 1
    assert AuditLog.objects.filter(action="flag.burst").exists()


# ---------- confirmations ----------
def test_confirmations_count_once_per_device_and_need_independence(client):
    data = payload(kind="knowledge", days="every_day")
    del data["when"], data["date"]
    post(client, data, ip="203.0.113.20")
    knowledge = Report.objects.get()
    url = f"/api/v1/knowledge/{knowledge.id}/confirm"
    helper = device_id()

    client.post(url, {"device_id": helper}, format="json", REMOTE_ADDR="203.0.113.21")
    client.post(url, {"device_id": helper}, format="json", REMOTE_ADDR="203.0.113.22")  # repeat
    client.post(url, {"device_id": device_id()}, format="json", REMOTE_ADDR="203.0.113.20")  # reporter's network
    knowledge.refresh_from_db()
    assert Confirmation.objects.count() == 2
    assert knowledge.corroborations == 1


# ---------- moderation, trust & restriction ----------
def _admin():
    return get_user_model().objects.create_user("mod", password="x", is_staff=True)


def test_verify_raises_weight_and_trust_and_is_audited(client):
    post(client, payload())
    report = Report.objects.select_related("device").get()
    before = report.weight
    verify_report(report, actor=_admin())
    report.refresh_from_db()
    assert report.weight > before
    assert report.device.trust > policy.TRUST_START
    assert AuditLog.objects.filter(action="report.verify", entity_id=str(report.id)).exists()


def test_repeated_rejections_restrict_device():
    mod = _admin()
    bad = device_id()
    start = timezone.now() - timedelta(days=3)
    data = {"kind": "incident", "category": "motorbike", "h3": CELL, "when": "other",
            "date": timezone.localdate(start) - timedelta(days=1), "block": 7}
    for i in range(policy.RESTRICT_AFTER_REJECTIONS):
        report = submit_report(data=dict(data), device_id=bad, ip=f"192.0.2.{i}", now=start + timedelta(hours=i))
        reject_report(report, actor=mod, reason="fake")
    device = Device.objects.filter(reports__isnull=False).distinct().get()
    assert device.restricted_until and device.restricted_until > timezone.now()
    assert device.trust < policy.TRUST_START
    with pytest.raises(SubmissionRejected):
        submit_report(data=dict(data), device_id=bad, ip="192.0.2.200")


def test_rejected_report_stops_counting():
    report = submit_report(
        data={"kind": "incident", "category": "bus", "h3": CELL, "when": "yesterday",
              "date": timezone.localdate() - timedelta(days=1), "block": 6},
        device_id=device_id(), ip="192.0.2.50",
    )
    reject_report(report, actor=_admin())
    report.refresh_from_db()
    assert report.weight == 0


def test_moderation_api_is_staff_only(client):
    assert client.get("/api/v1/mod/queue").status_code in (401, 403)


# ---------- audit ----------
def test_audit_log_is_append_only():
    entry = AuditLog.objects.create(action="test", entity_type="x", entity_id="1")
    entry.action = "changed"
    with pytest.raises(ImmutableError):
        entry.save()
    with pytest.raises(ImmutableError):
        entry.delete()
    with pytest.raises(ImmutableError):
        AuditLog.objects.all().delete()
