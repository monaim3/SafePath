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
