"""Reports are accepted anywhere in Bangladesh, and nowhere else."""

import h3
import pytest

from apps.incidents.models import Report
from apps.incidents.services.geo import cell_in_bangladesh, point_in_bangladesh

from .test_submission import client, payload, post  # noqa: F401  (fixture re-used)

pytestmark = pytest.mark.django_db

INSIDE = {
    "Dhaka (Mohammadpur)": (23.7625, 90.3605),
    "Bogura": (24.8465, 89.3773),
    "Chattogram": (22.3569, 91.7832),
    "Sylhet": (24.8949, 91.8687),
    "Khulna": (22.8456, 89.5403),
    "Rangpur": (25.7439, 89.2752),
    "Cox's Bazar": (21.4272, 92.0058),
    "Barishal": (22.7010, 90.3535),
}
OUTSIDE = {
    "Kolkata, India": (22.5726, 88.3639),
    "Agartala, India": (23.8315, 91.2868),
    "Shillong, India": (25.5788, 91.8933),
    "Sittwe, Myanmar": (20.1528, 92.8677),
    "Bay of Bengal": (20.0, 90.0),
    "London": (51.5072, -0.1276),
}


@pytest.mark.parametrize("name", INSIDE)
def test_bangladesh_places_are_inside(name):
    lat, lng = INSIDE[name]
    assert point_in_bangladesh(lat, lng)
    assert cell_in_bangladesh(h3.latlng_to_cell(lat, lng, 10))


@pytest.mark.parametrize("name", OUTSIDE)
def test_places_abroad_are_outside(name):
    lat, lng = OUTSIDE[name]
    assert not cell_in_bangladesh(h3.latlng_to_cell(lat, lng, 10))


def test_report_from_bogura_is_accepted(client):  # noqa: F811
    res = post(client, payload(h3=h3.latlng_to_cell(*INSIDE["Bogura"], 10)))
    assert res.status_code == 201


def test_report_outside_bangladesh_is_refused(client):  # noqa: F811
    res = post(client, payload(h3=h3.latlng_to_cell(*OUTSIDE["Kolkata, India"], 10)))
    assert res.status_code == 400
    assert res.json() == {"error": "outside_bangladesh"}
    assert not Report.objects.exists()
