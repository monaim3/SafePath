from datetime import timedelta

import h3
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.incidents.models import Device, Report

pytestmark = pytest.mark.django_db
CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()  # login throttle counters


def report() -> Report:
    device = Device.objects.create(device_hash=f"d-{Device.objects.count()}")
    return Report.objects.create(
        kind="incident", category="bus", h3=CELL, block=6, weight=0.3, device=device, ip_hash="ip",
        date=timezone.localdate() - timedelta(days=1),
    )


def login(client: APIClient, username="mod", password="pw-123456", staff=True) -> APIClient:
    get_user_model().objects.create_user(username, password=password, is_staff=staff)
    res = client.post("/api/v1/mod/login", {"username": username, "password": password}, format="json")
    if res.status_code == 200:
        client.credentials(HTTP_AUTHORIZATION=f"Token {res.json()['token']}")
    return client


def test_login_requires_staff_and_hides_reason():
    client = APIClient()
    get_user_model().objects.create_user("user", password="pw-123456", is_staff=False)
    for creds in ({"username": "user", "password": "pw-123456"}, {"username": "nobody", "password": "x"}):
        res = client.post("/api/v1/mod/login", creds, format="json")
        assert res.status_code == 400 and res.json() == {"error": "invalid_credentials"}


def test_login_is_rate_limited():
    client = APIClient()
    codes = [
        client.post("/api/v1/mod/login", {"username": "x", "password": "y"}, format="json").status_code
        for _ in range(7)
    ]
    assert codes[-1] == 429


def test_queue_and_decisions_with_token():
    client = login(APIClient())
    r1, r2, r3 = report(), report(), report()
    queue = client.get("/api/v1/mod/queue").json()
    assert len(queue["pending"]) == 3

    assert client.post(f"/api/v1/mod/reports/{r1.id}/verify").status_code == 200
    assert client.post(f"/api/v1/mod/reports/{r2.id}/reject", {"reason": "nonsense"}, format="json").status_code == 400
    assert client.post(f"/api/v1/mod/reports/{r2.id}/reject", {"reason": "fake"}, format="json").status_code == 200
    assert client.post(f"/api/v1/mod/reports/{r3.id}/duplicate").status_code == 200
    # a decided report can't be decided again
    assert client.post(f"/api/v1/mod/reports/{r1.id}/reject", {"reason": "fake"}, format="json").status_code == 409

    r3.refresh_from_db()
    r3.device.refresh_from_db()
    assert r3.status == "duplicate" and r3.weight == 0
    assert r3.device.rejected_count == 0  # duplicates don't hurt trust
    assert AuditLog.objects.filter(action__in=["report.verify", "report.reject", "report.duplicate"]).count() == 3
    assert client.get("/api/v1/mod/stats").json()["pending"] == 0


def test_logout_revokes_token():
    client = login(APIClient())
    assert client.post("/api/v1/mod/logout").status_code == 200
    assert client.get("/api/v1/mod/me").status_code == 401
