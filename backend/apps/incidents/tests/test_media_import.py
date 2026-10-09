"""News-report import: validation, idempotency, dating, and public source links."""

import json
from datetime import timedelta

import h3
import pytest
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.incidents.models import Report

pytestmark = pytest.mark.django_db
LAT, LNG = 23.7577, 90.3604  # Mohammadpur


def item(n: int, **extra) -> dict:
    return {
        "outlet": "The Daily Star", "url": f"https://www.thedailystar.net/news/{n}",
        "headline": "Snatching near bus stand", "incident_date": (timezone.localdate() - timedelta(days=n)).isoformat(),
        "hour": 22, "category": "motorbike", "lat": LAT, "lng": LNG, **extra,
    }


def run(tmp_path, items, *args):
    path = tmp_path / "news.json"
    path.write_text(json.dumps(items), encoding="utf-8")
    call_command("import_media_reports", str(path), *args)


def test_import_creates_verified_media_reports_dated_when_it_happened(tmp_path):
    run(tmp_path, [item(2), item(5), item(9)])
    reports = Report.objects.order_by("-created_at")
    assert reports.count() == 3
    r = reports.first()
    assert (r.source, r.status, r.kind, r.hour, r.block) == ("media", "verified", "incident", 22, 7)
    assert r.created_at.date() == timezone.localdate() - timedelta(days=2)
    assert len({x.device_id for x in reports}) == 3  # each article is an independent source

    run(tmp_path, [item(2), item(5), item(9)])  # idempotent
    assert Report.objects.count() == 3


def test_dry_run_writes_nothing(tmp_path):
    run(tmp_path, [item(1)], "--dry-run")
    assert not Report.objects.exists()


@pytest.mark.parametrize(
    "bad",
    [
        {"lat": 22.33, "lng": 91.83},  # Chattogram: outside Dhaka
        {"incident_date": "2020-01-01"},  # too old
        {"category": "pickpocket"},
        {"url": "http://insecure.example"},
        {"hour": 25},
    ],
)
def test_invalid_items_block_the_whole_import(tmp_path, bad):
    with pytest.raises(CommandError):
        run(tmp_path, [item(1), item(2, **bad)])
    assert not Report.objects.exists()


def test_one_verified_news_report_makes_an_area_visible(tmp_path):
    cache.clear()
    run(tmp_path, [item(1)])
    cells = APIClient().get("/api/v1/map/cells?res=10&hour=all").json()["cells"]
    assert [c["h3"] for c in cells] == [h3.latlng_to_cell(LAT, LNG, 10)]


def test_older_news_kept_as_history_and_fades_slower(tmp_path):
    from apps.incidents.services import aggregation as ag

    cache.clear()
    run(tmp_path, [item(500)])  # ~16 months old: allowed for news (up to 2 years)
    assert Report.objects.count() == 1
    cells = APIClient().get("/api/v1/map/cells?res=10&hour=all").json()["cells"]
    assert len(cells) == 1  # still on the map as history

    now = timezone.now()
    row = dict(id="x", kind="incident", category="bus", h3="x", block=6, hour=None, days="", status="verified",
               weight=1.0, corroborations=0, confirmations=0, device_id="d", created_at=now - timedelta(days=180))
    assert round(ag.decay(ag.Row(**row, source="media"), now), 2) == 0.5  # six-month half-life
    assert ag.decay(ag.Row(**row, source="community"), now) < 0.02  # community keeps the 30-day half-life


def test_old_community_reports_still_drop_after_a_year():
    from apps.incidents.models import Device

    cache.clear()
    devices = [Device.objects.create(device_hash=f"d-old-{i}") for i in range(2)]

    def add(days):
        for i in range(4):
            Report.objects.create(kind="incident", category="bus", h3=h3.latlng_to_cell(LAT, LNG, 10), block=6,
                                  status="verified", weight=1.0, device=devices[i % 2], ip_hash=f"ip{i}",
                                  created_at=timezone.now() - timedelta(days=days))

    add(400)  # older than a year: not counted
    assert APIClient().get("/api/v1/map/cells?res=10&hour=all").json()["cells"] == []
    cache.clear()
    add(10)  # the same pattern recently is shown (proves the empty result above was the age limit)
    assert len(APIClient().get("/api/v1/map/cells?res=10&hour=all").json()["cells"]) == 1


def test_period_filter_limits_map_area_and_news(tmp_path):
    cache.clear()
    run(tmp_path, [item(5), item(60), item(200)])  # 5, 60 and 200 days ago, same spot
    client = APIClient()
    cell9 = h3.cell_to_parent(h3.latlng_to_cell(LAT, LNG, 10), 9)

    def area(period):
        return client.get(f"/api/v1/areas/{cell9}?period={period}").json()["reportCount"]

    assert (area("30"), area("90"), area("all")) == (1, 2, 3)
    assert client.get(f"/api/v1/areas/{cell9}").json()["reportCount"] == 3  # default = all time
    assert len(client.get(f"/api/v1/areas/{cell9}/news?period=90").json()["news"]) == 2

    run(tmp_path, [item(150, url="https://www.thedailystar.net/news/far", lat=23.86, lng=90.40)])  # Uttara, 150 days
    cache.clear()
    cells_30 = client.get("/api/v1/map/cells?res=9&hour=all&period=30").json()["cells"]
    cells_all = client.get("/api/v1/map/cells?res=9&hour=all&period=all").json()["cells"]
    assert len(cells_30) == 1 and len(cells_all) == 2

    assert client.get("/api/v1/map/cells?res=9&period=7").status_code == 400
    assert client.get("/api/v1/map/time-profile?period=bogus").status_code == 400


def test_single_report_cannot_make_one_hour_high(tmp_path):
    cache.clear()
    run(tmp_path, [item(2, hour=6)])  # one recent report at 6 am
    client = APIClient()
    cell10 = h3.latlng_to_cell(LAT, LNG, 10)
    area = client.get(f"/api/v1/areas/{cell10}").json()
    assert max(area["hours"]) <= area["score"] and max(area["timeBlocks"]) <= area["score"]
    at6 = client.get("/api/v1/map/cells?res=10&hour=6").json()["cells"][0]["score"]
    assert at6 <= area["score"]  # the map's 6 am view agrees

    cache.clear()
    run(tmp_path, [item(3, hour=6, url="https://x.test/a"), item(4, hour=6, url="https://x.test/b")])
    area = client.get(f"/api/v1/areas/{cell10}").json()
    assert area["hours"][6] > area["score"]  # with 3 reports the 6 am peak shows


def test_area_shows_media_count_and_source_links(tmp_path):
    cache.clear()
    run(tmp_path, [item(1), item(3), item(4)])
    cell9 = h3.cell_to_parent(h3.latlng_to_cell(LAT, LNG, 10), 9)
    client = APIClient()
    area = client.get(f"/api/v1/areas/{cell9}").json()
    assert area["insufficient"] is False and area["sources"]["media"] == 3 and area["sources"]["community"] == 0
    news = client.get(f"/api/v1/areas/{cell9}/news").json()["news"]
    assert [n["url"] for n in news] == [item(1)["url"], item(3)["url"], item(4)["url"]]
    assert news[0]["outlet"] == "The Daily Star"
