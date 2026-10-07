"""Area watch: following areas, endpoint safety, and notifications on verified reports."""

from datetime import timedelta

import h3
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.incidents.models import Device, Report
from apps.watch import services
from apps.watch.models import PushSubscription

pytestmark = pytest.mark.django_db
CELL10 = h3.latlng_to_cell(23.7612, 90.4256, 10)
AREA = h3.cell_to_parent(CELL10, 9)
FCM = "https://fcm.googleapis.com/fcm/send/abc123"


@pytest.fixture(autouse=True)
def push(settings, monkeypatch):
    cache.clear()
    settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
    sent = []
    monkeypatch.setattr(services, "_send", lambda sub, payload: sent.append((sub.endpoint, payload)) or True)
    return sent


def follow(client, areas, endpoint=FCM, locale="bn"):
    return client.post(
        "/api/v1/watch",
        {"subscription": {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}}, "areas": areas, "locale": locale},
        format="json",
    )


def test_config_reports_enabled_and_key():
    body = APIClient().get("/api/v1/watch/config").json()
    assert body == {"enabled": True, "publicKey": "pub", "maxAreas": 3}


def test_follow_normalises_to_neighbourhood_and_replaces_list():
    client = APIClient()
    res = follow(client, [CELL10, AREA])  # street cell + its own area -> one area
    assert res.status_code == 200 and res.json()["areas"] == [AREA]
    lookup = client.post("/api/v1/watch/lookup", {"endpoint": FCM}, format="json").json()
    assert lookup["areas"] == [AREA]
    assert follow(client, []).json()["areas"] == []
    assert not PushSubscription.objects.exists()  # unfollowing everything deletes the browser


def test_limits_and_validation():
    client = APIClient()
    four = [h3.cell_to_parent(c, 9) for c in h3.grid_disk(CELL10, 30)]
    four = list(dict.fromkeys(four))[:4]
    assert follow(client, four).status_code == 400
    assert follow(client, ["not-a-cell"]).status_code == 400


@pytest.mark.parametrize(
    "endpoint, ok",
    [
        (FCM, True),
        ("https://updates.push.services.mozilla.com/wpush/v2/x", True),
        ("https://web.push.apple.com/abc", True),
        ("http://fcm.googleapis.com/x", False),  # not https
        ("https://evil.example.com/fcm.googleapis.com", False),
        ("https://fcm.googleapis.com.evil.com/x", False),
        ("https://169.254.169.254/latest/meta-data", False),  # SSRF target
    ],
)
def test_only_known_push_services(endpoint, ok):
    assert services.endpoint_allowed(endpoint) is ok
    assert (follow(APIClient(), [AREA], endpoint=endpoint).status_code == 200) is ok


def test_disabled_without_keys(settings):
    settings.VAPID_PRIVATE_KEY = ""
    assert follow(APIClient(), [AREA]).status_code == 503


# ---------- notifications ----------
def verify_report_in(cell, client):
    device = Device.objects.create(device_hash=f"d-{Device.objects.count()}")
    r = Report.objects.create(
        kind="incident", category="bus", h3=cell, block=6, weight=0.3, device=device, ip_hash="ip",
        date=timezone.localdate() - timedelta(days=1),
    )
    return client.post(f"/api/v1/mod/reports/{r.id}/verify")


def mod_client():
    client = APIClient()
    get_user_model().objects.create_user("mod", password="pw-123456", is_staff=True)
    token = client.post("/api/v1/mod/login", {"username": "mod", "password": "pw-123456"}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
    return client


def test_verified_report_notifies_followers_once_per_cooldown(push, django_capture_on_commit_callbacks):
    follow(APIClient(), [AREA], locale="en")
    follow(APIClient(), [h3.cell_to_parent(h3.grid_disk(CELL10, 40)[-1], 9)], endpoint=FCM + "-other")
    mod = mod_client()

    with django_capture_on_commit_callbacks(execute=True):
        assert verify_report_in(CELL10, mod).status_code == 200
    assert len(push) == 1
    endpoint, payload = push[0]
    assert endpoint == FCM  # only the follower of this area
    assert payload["url"] == f"/en/area/{AREA}" and services.area_code(AREA) in payload["body"]

    with django_capture_on_commit_callbacks(execute=True):
        verify_report_in(CELL10, mod)
    assert len(push) == 1  # cooldown: no second notification within 3 hours


def test_pending_or_rejected_reports_never_notify(push, django_capture_on_commit_callbacks):
    follow(APIClient(), [AREA])
    device = Device.objects.create(device_hash="d-x")
    r = Report.objects.create(kind="incident", category="bus", h3=CELL10, block=6, device=device, ip_hash="ip")
    with django_capture_on_commit_callbacks(execute=True):
        mod_client().post(f"/api/v1/mod/reports/{r.id}/reject", {"reason": "fake"}, format="json")
    assert push == []


def test_gone_subscription_is_deleted(settings, monkeypatch):
    from pywebpush import WebPushException

    class Gone:
        status_code = 410

    def boom(**kwargs):
        raise WebPushException("gone", response=Gone())

    monkeypatch.setattr("pywebpush.webpush", boom)
    monkeypatch.undo()  # restore the real _send from the autouse fixture...
    monkeypatch.setattr("pywebpush.webpush", boom)  # ...but keep the network faked
    settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY = "pub", "priv"
    sub = PushSubscription.objects.create(endpoint=FCM, p256dh="k", auth="a")
    sub.areas.create(h3=AREA)
    assert services.notify_verified(CELL10) == 0
    assert not PushSubscription.objects.exists()
