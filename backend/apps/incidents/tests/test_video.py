"""Optional video evidence: signed upload tickets, attach checks, moderation and public listing."""

from datetime import timedelta

import h3
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.incidents.models import Device, Report
from apps.incidents.services import video

pytestmark = pytest.mark.django_db
CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)


@pytest.fixture(autouse=True)
def cloudinary(settings, monkeypatch):
    cache.clear()
    settings.CLOUDINARY = {"cloud": "demo-cloud", "key": "k123", "secret": "s3cret"}
    calls = {"destroyed": [], "assets": {}}
    monkeypatch.setattr(video, "fetch_asset", lambda pid: calls["assets"].get(pid))
    monkeypatch.setattr(video, "destroy", lambda pid: calls["destroyed"].append(pid))
    return calls


def payload(**extra) -> dict:
    return {
        "kind": "incident", "category": "motorbike", "h3": CELL, "when": "yesterday",
        "date": (timezone.localdate() - timedelta(days=1)).isoformat(), "block": 6,
        "device_id": f"device-{Report.objects.count():012d}", **extra,
    }


def submit(client, **extra):
    return client.post("/api/v1/reports", payload(**extra), format="json")


def test_sign_matches_cloudinary_algorithm():
    # Example from Cloudinary's docs: eager=w_400,h_300,c_pad|w_260,h_200,c_crop, public_id=sample_image, timestamp
    params = {"eager": "w_400,h_300,c_pad|w_260,h_200,c_crop", "public_id": "sample_image", "timestamp": 1315060510}
    assert video.sign(params, "abcd") == "bfd09f95f331f558cbd1320e67aa8d488770583e"


def test_ticket_only_when_asked_and_enabled(settings):
    client = APIClient()
    assert "upload" not in submit(client).json()

    body = submit(client, has_video=True).json()
    ticket = body["upload"]
    assert ticket["url"] == "https://api.cloudinary.com/v1_1/demo-cloud/video/upload"
    assert ticket["fields"]["public_id"] == f"safepath/reports/{body['id']}"
    assert "secret" not in str(ticket) and "s3cret" not in str(ticket)
    report = Report.objects.get(pk=body["id"])
    assert report.video_status == "awaiting"

    settings.CLOUDINARY = None
    assert "upload" not in submit(client, has_video=True).json()


def test_attach_requires_valid_token_and_existing_file(cloudinary):
    client = APIClient()
    body = submit(client, has_video=True).json()
    rid, token = body["id"], body["upload"]["attachToken"]
    url = f"/api/v1/reports/{rid}/video"

    assert client.post(url, {"token": "123.bad"}, format="json").status_code == 404
    assert client.post(url, {"token": token}, format="json").status_code == 409  # not uploaded yet

    cloudinary["assets"][f"safepath/reports/{rid}"] = {"bytes": 5_000_000}
    assert client.post(url, {"token": token}, format="json").status_code == 200
    assert Report.objects.get(pk=rid).video_status == "pending"
    assert client.post(url, {"token": token}, format="json").status_code == 404  # only once


def test_oversized_upload_is_deleted(cloudinary):
    client = APIClient()
    body = submit(client, has_video=True).json()
    pid = f"safepath/reports/{body['id']}"
    cloudinary["assets"][pid] = {"bytes": video.MAX_BYTES + 1}
    res = client.post(f"/api/v1/reports/{body['id']}/video", {"token": body["upload"]["attachToken"]}, format="json")
    assert res.status_code == 400
    assert cloudinary["destroyed"] == [pid]


def test_expired_token_rejected():
    assert not video.token_valid("abc", video.attach_token("abc", now=0))
    assert video.token_valid("abc", video.attach_token("abc"))
    assert not video.token_valid("other", video.attach_token("abc"))


# ---------- moderation + public listing ----------
def pending_video_report(status="pending") -> Report:
    device = Device.objects.create(device_hash=f"d-{Device.objects.count()}")
    r = Report.objects.create(
        kind="incident", category="bus", h3=CELL, block=6, weight=0.3, device=device, ip_hash="ip",
        date=timezone.localdate() - timedelta(days=1), status=status,
    )
    r.video_status, r.video_public_id = "pending", video.public_id_for(r.id)
    r.save()
    return r


def mod_client() -> APIClient:
    client = APIClient()
    get_user_model().objects.create_user("mod", password="pw-123456", is_staff=True)
    token = client.post("/api/v1/mod/login", {"username": "mod", "password": "pw-123456"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def public_videos(client) -> list:
    cache.clear()
    return client.get(f"/api/v1/areas/{CELL}/videos").json()["videos"]


def test_video_is_public_only_after_approval_without_audio():
    r = pending_video_report()
    mod, public = mod_client(), APIClient()

    queue = mod.get("/api/v1/mod/queue").json()
    assert [v["id"] for v in queue["videos"]] == [str(r.id)]
    assert queue["videos"][0]["video_url"].endswith(f"/q_auto/{r.video_public_id}.mp4")  # moderators get sound
    assert public_videos(public) == []

    assert mod.post(f"/api/v1/mod/reports/{r.id}/video/approve").status_code == 200
    [shown] = public_videos(public)
    assert "/ac_none," in shown["url"]  # audio stripped for the public
    assert mod.post(f"/api/v1/mod/reports/{r.id}/video/approve").status_code == 409


def test_rejecting_video_deletes_it_but_keeps_report(django_capture_on_commit_callbacks, cloudinary):
    r = pending_video_report()
    with django_capture_on_commit_callbacks(execute=True):
        assert mod_client().post(f"/api/v1/mod/reports/{r.id}/video/reject").status_code == 200
    r.refresh_from_db()
    assert (r.status, r.video_status) == ("pending", "rejected")
    assert cloudinary["destroyed"] == [r.video_public_id]


def test_rejecting_report_also_deletes_its_video(django_capture_on_commit_callbacks, cloudinary):
    r = pending_video_report()
    with django_capture_on_commit_callbacks(execute=True):
        res = mod_client().post(f"/api/v1/mod/reports/{r.id}/reject", {"reason": "fake"}, format="json")
    assert res.status_code == 200
    r.refresh_from_db()
    assert r.video_status == "rejected"
    assert cloudinary["destroyed"] == [r.video_public_id]
