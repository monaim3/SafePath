import io
import json
from datetime import timedelta
from unittest import mock

import h3
import pytest
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db
CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)


def payload(token: str = "") -> dict:
    return {
        "kind": "incident", "category": "bus", "h3": CELL, "when": "yesterday",
        "date": (timezone.localdate() - timedelta(days=1)).isoformat(), "block": 6,
        "device_id": "install-turnstile-test-1", "turnstile_token": token,
    }


def fake_cloudflare(success: bool):
    # a fresh response per call (a BytesIO can only be read once)
    return mock.patch(
        "apps.incidents.services.turnstile.request.urlopen",
        side_effect=lambda *a, **k: io.BytesIO(json.dumps({"success": success}).encode()),
    )


def test_captcha_required_when_secret_configured(settings):
    settings.TURNSTILE_SECRET = "secret"
    client = APIClient()
    assert client.post("/api/v1/reports", payload(""), format="json").json() == {"error": "captcha"}
    with fake_cloudflare(False):
        assert client.post("/api/v1/reports", payload("bad"), format="json").status_code == 400
    with fake_cloudflare(True):
        assert client.post("/api/v1/reports", payload("good"), format="json").status_code == 201


def test_captcha_fails_closed_when_cloudflare_unreachable(settings):
    settings.TURNSTILE_SECRET = "secret"
    with mock.patch("apps.incidents.services.turnstile.request.urlopen", side_effect=OSError):
        res = APIClient().post("/api/v1/reports", payload("token"), format="json")
    assert res.status_code == 400


def test_over_the_limit_hears_the_limit_with_wait_not_captcha(settings):
    """1 report per 30 min: the 2nd is told to wait (with how long), before any CAPTCHA call."""
    settings.TURNSTILE_SECRET = "secret"
    client = APIClient()
    with fake_cloudflare(True):
        assert client.post("/api/v1/reports", payload("t1"), format="json").status_code == 201
    with mock.patch("apps.incidents.services.turnstile.request.urlopen") as cloudflare:
        res = client.post("/api/v1/reports", payload("t2"), format="json")
    assert res.status_code == 429
    body = res.json()
    assert body["error"] == "rate_limited"
    assert 0 < body["retry_after"] <= 1800
    assert res["Retry-After"] == str(body["retry_after"])
    cloudflare.assert_not_called()  # no Turnstile verification spent on a refused request


@pytest.mark.skipif(connection.vendor != "postgresql", reason="database trigger exists on PostgreSQL only")
def test_database_blocks_raw_sql_changes_to_audit_log():
    entry = AuditLog.objects.create(action="test", entity_type="x", entity_id="1")
    with pytest.raises(Exception, match="immutable"), connection.cursor() as cur:
        cur.execute("UPDATE audit_auditlog SET action = 'tampered' WHERE id = %s", [entry.id])
