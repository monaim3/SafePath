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


def test_street_day_matches_the_hourly_map():
    # The one-download day data (kept on the phone for trips) must agree with the per-hour map.
    client = APIClient()
    make(3, 2, block=7)
    make(2, 1, block=2, category="on_foot")
    [day] = client.get("/api/v1/map/street-day").json()["cells"]
    assert day["h3"] == CELL and len(day["hours"]) == 24
    assert day["day"] == cells(client, res=10)[0]["score"]
    for hour in (2, 7, 22):
        assert day["hours"][hour] == cells(client, res=10, hour=hour)[0]["score"]
    make(1, 1, cell=h3.cell_to_children(h3.cell_to_parent(CELL, 8), 10)[0])  # below the privacy threshold
    cache.clear()
    assert [c["h3"] for c in client.get("/api/v1/map/street-day").json()["cells"]] == [CELL]


def test_zoomed_out_cell_reads_as_its_busiest_street():
    # One hotspot street plus many quiet streets in the same neighbourhood.
    client = APIClient()
    make(3, 2)  # the hotspot: 6 reports on CELL
    parent = h3.cell_to_parent(CELL, 8)
    quiet = [c for c in h3.cell_to_children(parent, 10) if c != CELL][:12]
    for c in quiet:
        make(1, 1, cell=c)  # one report each: no quiet street is busy on its own
    street = {c["h3"]: c["score"] for c in cells(client, res=10)}
    for res in (8, 9):
        [big] = [c for c in cells(client, res=res) if c["h3"] == h3.cell_to_parent(CELL, res)]
        # Not the whole neighbourhood added up (which read redder than any street),
        # and not diluted either: exactly the level zooming in shows at the hotspot.
        assert big["score"] == street[CELL]


def test_hour_filter_changes_score():
    client = APIClient()
    make(4, 2, block=7)  # all at 21:00–24:00
    night = cells(client, hour=22)[0]["score"]
    cache.clear()
    morning = cells(client, hour=9)[0]["score"]
    assert night > morning


def test_block_shares_show_when_reports_cluster():
    client = APIClient()
    make(6, 3, block=7)  # all at 21:00–24:00
    area = client.get(f"/api/v1/areas/{CELL}").json()
    shares = area["blockShares"]
    assert len(shares) == 8 and 98 <= sum(shares) <= 102
    assert shares.index(max(shares)) == 7 and shares[7] > 50
    assert shares[3] == 0  # 9 AM–12 PM: nothing reported


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
