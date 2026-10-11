from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics import services
from apps.analytics.models import DailyStat, Presence, VisitorDay

pytestmark = pytest.mark.django_db

PHONE_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36"
LAPTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"


def hit(client, path="/bn/map", kind="view", ua=PHONE_UA, ip="203.0.113.5", app=False):
    return client.post("/api/v1/hit", {"path": path, "kind": kind, "app": app}, format="json",
                       HTTP_USER_AGENT=ua, REMOTE_ADDR=ip)


def summary():
    mod = get_user_model().objects.create_user(f"mod{get_user_model().objects.count()}", password="x", is_staff=True)
    api = APIClient()
    api.force_authenticate(mod)
    return api.get("/api/v1/mod/traffic").json()


def test_sections_group_pages_and_skip_moderator_screens():
    assert services.section("/bn") == "/"
    assert services.section("/en/area/8a3cf1396367fff?period=all") == "/area"
    assert services.section("/bn/map") == "/map"
    assert services.section("/bn/something-else") == "/other"
    assert services.section("/bn/mod") is None


def test_views_visitors_and_devices_are_counted_once_per_person_per_day():
    c = APIClient()
    assert hit(c).status_code == 204
    hit(c, path="/bn/area/8a3cf1396367fff")  # same person, another page
    hit(c, ua=LAPTOP_UA, ip="198.51.100.7")  # someone else, on a laptop
    hit(c, ua=PHONE_UA, ip="198.51.100.8", app=True)  # someone in the installed app
    s = summary()
    assert s["today"] == {"visitors": 3, "views": 4}
    assert {d["key"]: d["count"] for d in s["devicesToday"]} == {"phone": 1, "computer": 1, "app": 1}
    assert {p["key"]: p["count"] for p in s["pagesToday"]} == {"/map": 3, "/area": 1}


def test_online_now_uses_recent_signs_of_life():
    c = APIClient()
    hit(c, ip="203.0.113.1")
    hit(c, ip="203.0.113.2", kind="ping", path="/bn/report")
    hit(c, ip="203.0.113.3")
    # the first visitor went quiet 10 minutes ago
    first = Presence.objects.order_by("id").first()
    Presence.objects.filter(pk=first.pk).update(last_seen=timezone.now() - timedelta(minutes=10))
    s = summary()
    assert s["online"] == 2
    assert {p["key"] for p in s["onlinePages"]} == {"/report", "/map"}


def test_ping_does_not_count_as_a_view():
    hit(APIClient(), kind="ping")
    assert not DailyStat.objects.filter(metric="views").exists()
    assert Presence.objects.count() == 1


def test_bots_and_moderator_pages_are_ignored():
    c = APIClient()
    hit(c, ua="Googlebot/2.1 (+http://www.google.com/bot.html)")
    hit(c, ua="")
    hit(c, path="/bn/mod")
    assert not DailyStat.objects.exists() and not Presence.objects.exists()


def test_nothing_identifying_is_stored():
    hit(APIClient(), ip="203.0.113.99")
    stored = [*VisitorDay.objects.values_list("visitor", flat=True), *Presence.objects.values_list("visitor", flat=True)]
    assert stored and all("203.0.113.99" not in v and "Android" not in v for v in stored)


def test_visitor_id_changes_every_day():
    today = timezone.localdate()
    assert services.visitor_id("1.2.3.4", PHONE_UA, today) != services.visitor_id("1.2.3.4", PHONE_UA, today + timedelta(days=1))


def test_traffic_is_for_moderators_only():
    assert APIClient().get("/api/v1/mod/traffic").status_code in (401, 403)


def test_bad_input_is_ignored_quietly():
    res = APIClient().post("/api/v1/hit", {"path": "/bn", "kind": "nonsense"}, format="json", HTTP_USER_AGENT=PHONE_UA)
    assert res.status_code == 204 and not DailyStat.objects.exists()
