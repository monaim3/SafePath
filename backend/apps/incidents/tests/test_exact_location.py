"""The reporter's exact pin: kept for moderators only, checked against the cell, wiped after 90 days."""

import json
from datetime import timedelta

import h3
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from apps.incidents import policy
from apps.incidents.models import Report
from apps.incidents.services.submission import purge_exact_locations

from .test_submission import client, payload, post  # noqa: F401  (fixture re-used)

pytestmark = pytest.mark.django_db

LAT, LNG = 23.76351, 90.43242  # Banasree, C Block side of Rampura–Banasree Road
CELL = h3.latlng_to_cell(LAT, LNG, 10)


def test_exact_pin_and_label_are_kept_when_inside_the_cell(client):  # noqa: F811
    res = post(client, payload(h3=CELL, lat=LAT, lng=LNG, place_label="C Block, Banasree  "))
    assert res.status_code == 201
    report = Report.objects.get()
    assert (report.exact_lat, report.exact_lng) == (LAT, LNG)
    assert report.place_label == "C Block, Banasree"


def test_pin_outside_the_cell_is_dropped_but_report_accepted(client):  # noqa: F811
    res = post(client, payload(h3=CELL, lat=23.80, lng=90.36, place_label="Mirpur"))
    assert res.status_code == 201
    report = Report.objects.get()
    assert report.exact_lat is None and report.exact_lng is None and report.place_label == ""


def test_label_is_redacted(client):  # noqa: F811
    post(client, payload(h3=CELL, lat=LAT, lng=LNG, place_label="Rahim 01712345678 house"))
    assert "01712345678" not in Report.objects.get().place_label


def test_exact_location_never_appears_in_public_responses(client):  # noqa: F811
    for i in range(3):
        post(client, payload(h3=CELL, lat=LAT, lng=LNG, place_label="C Block, Banasree"), ip=f"203.0.113.{i + 10}")
    public = json.dumps([
        client.get(f"/api/v1/areas/{CELL}").json(),
        client.get("/api/v1/map/cells?res=10&hour=all&period=all").json(),
    ])
    assert CELL in public  # the area itself is public
    assert "C Block" not in public and str(LAT) not in public and "exact" not in public


def test_moderators_see_the_exact_location(client):  # noqa: F811
    post(client, payload(h3=CELL, lat=LAT, lng=LNG, place_label="C Block, Banasree"))
    mod = get_user_model().objects.create_user("mod", password="pw-for-tests-only", is_staff=True)
    api = APIClient()
    api.force_authenticate(mod)
    item = api.get("/api/v1/mod/queue").json()["pending"][0]
    assert (item["exact_lat"], item["exact_lng"], item["place_label"]) == (LAT, LNG, "C Block, Banasree")


def test_old_exact_locations_are_wiped_but_cells_stay(client):  # noqa: F811
    post(client, payload(h3=CELL, lat=LAT, lng=LNG, place_label="C Block, Banasree"))
    report = Report.objects.get()
    Report.objects.filter(pk=report.pk).update(
        created_at=timezone.now() - timedelta(days=policy.EXACT_LOCATION_DAYS + 1)
    )
    assert purge_exact_locations() == 1
    report.refresh_from_db()
    assert report.exact_lat is None and report.place_label == "" and report.h3 == CELL
