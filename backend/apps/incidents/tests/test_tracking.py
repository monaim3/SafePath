"""Report tracking: codes handed out once, status lookups, gentle reject reasons and withdrawing."""

from datetime import timedelta

import h3
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.incidents.models import Report
from apps.incidents.selectors import PUBLIC_STATUSES
from apps.incidents.services import tracking, video
from apps.moderation.services import reject_report, verify_report

pytestmark = pytest.mark.django_db
CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    cache.clear()  # throttle counters
    destroyed = []
    monkeypatch.setattr(video, "destroy", destroyed.append)
    return destroyed


def submit(client, device="device-000000000001", **extra):
    ip = f"198.51.100.{Report.objects.count() + 1}"
    payload = {
        "kind": "incident", "category": "motorbike", "h3": CELL, "when": "yesterday",
        "date": (timezone.localdate() - timedelta(days=1)).isoformat(), "block": 6,
        "device_id": device, "description": "Two men on a bike took my phone", **extra,
    }
    return client.post("/api/v1/reports", payload, format="json", REMOTE_ADDR=ip)


def track(client, *codes):
    return client.post("/api/v1/track", {"codes": list(codes)}, format="json")


def withdraw(client, code, device="device-000000000001"):
    return client.post("/api/v1/track/withdraw", {"code": code, "device_id": device}, format="json")


@pytest.fixture
def moderator():
    return get_user_model().objects.create_user("mod", password="x", is_staff=True)


def test_normalize_accepts_how_people_type_codes():
    assert tracking.normalize("SP-7K3M-9QX2") == "7K3M9QX2"
    assert tracking.normalize("sp 7k3m 9qx2") == "7K3M9QX2"
    assert tracking.normalize("7K3M9QX2") == "7K3M9QX2"
    assert tracking.normalize("SP-7K3M-9QXO") == "7K3M9QX0"  # letter O read as zero
    assert tracking.normalize("SP-1L1I-0000") == "11110000"
    assert tracking.normalize("SP-7K3M-9QX") is None
    assert tracking.normalize("SP-7K3M-9QXU") is None  # U is not in the alphabet
    assert tracking.normalize("") is None


def test_submit_returns_a_code_and_only_its_hash_is_stored():
    body = submit(APIClient()).json()
    code = body["code"]
    assert code.startswith("SP-") and len(code) == 12
    report = Report.objects.get(pk=body["id"])
    assert report.tracking_hash == tracking.code_hash(tracking.normalize(code))
    assert tracking.normalize(code) not in report.tracking_hash


def test_track_shows_status_without_private_details():
    client = APIClient()
    code = submit(client).json()["code"]
    res = track(client, code.lower(), "SP-0000-0000", "garbage")
    assert res.status_code == 200
    [item] = res.json()["reports"]  # unknown and malformed codes are just missing
    assert item["code"] == code
    assert item["status"] == "pending"
    assert item["category"] == "motorbike"
    assert item["reason"] is None and item["reviewed_at"] is None
    for private in ("h3", "description", "exact_lat", "place_label", "device", "flags", "weight", "id"):
        assert private not in item


def test_track_follows_moderator_decisions(moderator):
    client = APIClient()
    first = submit(client).json()
    second = submit(client, device="device-000000000002").json()
    verify_report(Report.objects.get(pk=first["id"]), actor=moderator)
    reject_report(Report.objects.get(pk=second["id"]), actor=moderator, reason="fake")

    items = {i["code"]: i for i in track(client, first["code"], second["code"]).json()["reports"]}
    assert items[first["code"]]["status"] == "verified"
    assert items[first["code"]]["reviewed_at"]
    assert items[second["code"]]["status"] == "rejected"
    assert items[second["code"]]["reason"] == "unconfirmed"  # never "fake"


def test_track_limits_codes_per_request():
    assert track(APIClient(), *[f"SP-0000-{i:04d}" for i in range(31)]).status_code == 400


def test_withdraw_needs_the_same_phone(clean):
    client = APIClient()
    body = submit(client, video_link="https://youtu.be/abc123").json()
    code = body["code"]

    assert withdraw(client, code, device="device-999999999999").status_code == 404  # someone else's phone
    assert withdraw(client, "SP-0000-0000").status_code == 404  # same answer as a wrong code

    res = withdraw(client, code)
    assert res.status_code == 200 and res.json()["status"] == "withdrawn"
    report = Report.objects.get(pk=body["id"])
    assert report.status == "withdrawn" and report.weight == 0
    assert report.description == "" and report.video_link == ""
    assert report.status not in PUBLIC_STATUSES
    assert track(client, code).json()["reports"][0]["status"] == "withdrawn"
    # still counts toward the rate limit, so withdraw-and-resend can't dodge it
    assert submit(client).status_code == 429


def test_withdraw_only_while_pending(moderator):
    client = APIClient()
    body = submit(client).json()
    verify_report(Report.objects.get(pk=body["id"]), actor=moderator)
    assert withdraw(client, body["code"]).status_code == 409


def test_withdraw_deletes_uploaded_footage(clean, django_capture_on_commit_callbacks):
    client = APIClient()
    body = submit(client).json()
    report = Report.objects.get(pk=body["id"])
    report.video_status, report.video_public_id = Report.VideoStatus.PENDING, "safepath/reports/x"
    report.save()
    with django_capture_on_commit_callbacks(execute=True):
        assert withdraw(client, body["code"]).status_code == 200
    assert clean == ["safepath/reports/x"]
    assert Report.objects.get(pk=body["id"]).video_status == "rejected"
