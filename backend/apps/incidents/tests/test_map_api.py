"""Public map / area endpoints: aggregation, privacy threshold, filters."""

from datetime import timedelta

import h3
import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.incidents.models import Device, Report
from apps.incidents.services import aggregation

pytestmark = pytest.mark.django_db

CELL = h3.latlng_to_cell(23.7612, 90.4256, 10)  # demo location


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()


def make(n_devices: int, per_device: int, *, cell=CELL, block=7, status="verified", kind="incident",
         category="motorbike", days_ago=2) -> None:
    for d in range(n_devices):
        device = Device.objects.create(device_hash=f"dev-{cell}-{kind}-{category}-{d}-{Device.objects.count()}")
        for _ in range(per_device):
            Report.objects.create(
                kind=kind, category=category, h3=cell, block=block, status=status, weight=1.0,
                device=device, ip_hash=f"ip-{d}", created_at=timezone.now() - timedelta(days=days_ago),
            )


def cells(client, res=10, hour="all"):
    return client.get(f"/api/v1/map/cells?res={res}&hour={hour}").json()["cells"]


def test_cell_hidden_until_three_reports_from_two_devices():
    client = APIClient()
    make(1, 5)  # 5 reports, but all from one device
    assert cells(client) == []
    cache.clear()
    make(1, 1)  # a second, independent device
    assert [c["h3"] for c in cells(client)] == [CELL]


def test_rejected_and_positive_reports_do_not_count_toward_visibility():
    client = APIClient()
    make(3, 1, status="rejected")
    make(3, 1, kind="positive", category="well_lit")
    assert cells(client) == []


def test_aggregates_to_coarser_resolutions():
    client = APIClient()
    make(3, 2)
    for res in (8, 9):
        result = cells(client, res=res)
        assert [c["h3"] for c in result] == [h3.cell_to_parent(CELL, res)]


def test_hour_filter_changes_score():
    client = APIClient()
    make(4, 2, block=7)  # all at 21:00–24:00
    night = cells(client, hour=22)[0]["score"]
    cache.clear()
    morning = cells(client, hour=9)[0]["score"]
    assert night > morning


def test_area_detail_shape_and_privacy():
    client = APIClient()
    make(1, 2)
    hidden = client.get(f"/api/v1/areas/{CELL}").json()
    assert hidden["insufficient"] is True and hidden["categories"] == [] and hidden["knowledge"] == []

    cache.clear()
    make(3, 2)
    make(1, 1, kind="knowledge", status="pending")
    make(1, 1, kind="positive", category="cctv")
    area = client.get(f"/api/v1/areas/{CELL}").json()
    assert area["insufficient"] is False
    assert len(area["hours"]) == 24 and len(area["timeBlocks"]) == 8
    assert area["categories"][0]["key"] == "motorbike"
    assert area["positives"] == [{"key": "cctv", "count": 1}]
    assert len(area["knowledge"]) == 1
    assert area["counts"]["d7"] >= 8


def test_old_reports_fade():
    now = timezone.now()
    row = lambda days: aggregation.Row(  # noqa: E731
        id="x", kind="incident", category="bus", h3=CELL, block=7, hour=None, days="", status="verified",
        weight=1.0, corroborations=0, confirmations=0, device_id="d", created_at=now - timedelta(days=days),
    )
    assert aggregation.effective_weight(row(0), now) > aggregation.effective_weight(row(60), now) * 3


def test_bad_params():
    client = APIClient()
    assert client.get("/api/v1/map/cells?res=7").status_code == 400
    assert client.get("/api/v1/map/cells?hour=25").status_code == 400
    assert client.get("/api/v1/areas/not-a-cell").status_code == 404


def test_new_report_invalidates_cache(django_capture_on_commit_callbacks):
    client = APIClient()
    make(3, 1)
    before = cells(client)[0]["reports30"]
    payload = {"kind": "incident", "category": "motorbike", "h3": CELL, "when": "yesterday",
               "date": (timezone.localdate() - timedelta(days=1)).isoformat(), "block": 7,
               "device_id": "install-cache-test-0001"}
    with django_capture_on_commit_callbacks(execute=True):
        res = client.post("/api/v1/reports", payload, format="json", REMOTE_ADDR="203.0.113.77")
    assert res.status_code == 201
    assert cells(client)[0]["reports30"] == before + 1
