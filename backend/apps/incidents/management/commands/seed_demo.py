"""
Fill the database with SYNTHETIC demo reports (is_demo=True) so the app can run end-to-end
before real reports exist. Never run in production. Hotspots are arbitrary offsets around
the city centre and are not tied to real neighbourhoods.

    python manage.py seed_demo            # add demo data (replaces previous demo data)
    python manage.py seed_demo --clear    # remove demo data only
"""

import math
import random
from datetime import timedelta

import h3
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.incidents.models import Confirmation, Device, Report
from apps.incidents.selectors import bump_data_version
from apps.incidents.services import abuse

CENTER = (23.7808, 90.4093)  # lat, lng
METHODS = ["motorbike", "rickshaw_cng", "on_foot", "bus", "weapon"]
POSITIVES = ["well_lit", "busy_late", "patrol_seen", "cctv"]
PROFILES = {
    "night": [0.9, 0.5, 0.2, 0.3, 0.35, 0.45, 0.75, 1],
    "evening": [0.5, 0.2, 0.25, 0.4, 0.5, 0.7, 1, 0.9],
    "commute": [0.2, 0.1, 0.8, 0.6, 0.5, 0.7, 1, 0.5],
}
HOTSPOTS = [
    (-0.018, 0.02, 1.0, 1.2, "night"),
    (-0.024, -0.019, 0.7, 1.0, "commute"),
    (0.026, -0.04, 0.8, 1.3, "evening"),
    (-0.056, 0.004, 0.9, 1.1, "commute"),
    (0.04, 0.012, 0.85, 0.9, "night"),
    (-0.06, 0.03, 0.6, 1.0, "night"),
    (0.002, 0.045, 0.55, 1.2, "evening"),
]
KM_LAT = 1 / 111
KM_LNG = 1 / (111 * math.cos(math.radians(CENTER[0])))


class Command(BaseCommand):
    help = "Seed synthetic demo reports (clearly marked is_demo)."

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Only delete existing demo data.")
        parser.add_argument("--seed", type=int, default=7)

    @transaction.atomic
    def handle(self, *args, clear: bool, seed: int, **opts):
        demo_devices = Device.objects.filter(device_hash__startswith="demo-")
        Report.objects.filter(is_demo=True).delete()
        Confirmation.objects.filter(device__in=demo_devices).delete()
        demo_devices.delete()
        if clear:
            transaction.on_commit(bump_data_version)
            self.stdout.write(self.style.SUCCESS("Demo data removed."))
            return

        rng = random.Random(seed)
        now = timezone.now()
        devices = Device.objects.bulk_create(
            [Device(device_hash=f"demo-{i:05d}", trust=round(rng.uniform(0.7, 1.2), 2)) for i in range(400)]
        )

        reports: list[Report] = []

        def add(kind, category, lat, lng, block, *, days_ago, verified, days=""):
            device = rng.choice(devices)
            status = Report.Status.VERIFIED if verified else Report.Status.PENDING
            hour = block * 3 + rng.randrange(3) if rng.random() < 0.4 else None
            reports.append(
                Report(
                    kind=kind, category=category, h3=h3.latlng_to_cell(lat, lng, 10),
                    date=(now - timedelta(days=days_ago)).date() if kind == "incident" else None,
                    block=block, hour=hour, days=days, relation="witnessed",
                    status=status, weight=abuse.report_weight(status, device.trust, 0),
                    device=device, ip_hash=f"demo-ip-{rng.randrange(10_000)}",
                    created_at=now - timedelta(days=days_ago, hours=rng.random() * 12),
                    is_demo=True,
                )
            )

        for d_lat, d_lng, strength, radius_km, profile in HOTSPOTS:
            weights = PROFILES[profile]
            for _ in range(round(10 * strength) + 4):  # micro-clusters along a "road"
                c_lat = CENTER[0] + d_lat + rng.gauss(0, radius_km * 0.6) * KM_LAT
                c_lng = CENTER[1] + d_lng + rng.gauss(0, radius_km * 0.6) * KM_LNG
                spread = 0.04 + rng.random() * 0.09
                angle = rng.random() * math.pi
                method_w = [0.3 + rng.random() * 2 for _ in METHODS]
                for _ in range(round((6 + rng.random() * 34) * strength)):
                    along, across = rng.gauss(0, spread * 2.2), rng.gauss(0, spread * 0.5)
                    lat = c_lat + (along * math.sin(angle) + across * math.cos(angle)) * KM_LAT
                    lng = c_lng + (along * math.cos(angle) - across * math.sin(angle)) * KM_LNG
                    add("incident", rng.choices(METHODS, method_w)[0], lat, lng,
                        rng.choices(range(8), weights)[0],
                        days_ago=int(rng.random() ** 1.4 * 90), verified=rng.random() < 0.55)
                if rng.random() < 0.6:  # what locals say about this stretch
                    add("knowledge", rng.choices(METHODS, method_w)[0], c_lat, c_lng,
                        max(range(8), key=lambda b: weights[b]), days_ago=rng.randrange(60),
                        verified=rng.random() < 0.4, days=rng.choice(["every_day", "weekends"]))
                for category in rng.sample(POSITIVES, k=rng.randrange(0, 3)):
                    add("positive", category, c_lat, c_lng, rng.randrange(8),
                        days_ago=rng.randrange(60), verified=True)

        for _ in range(450):  # scattered one-off reports
            r = math.sqrt(rng.random()) * 11
            a = rng.random() * 2 * math.pi
            add("incident", rng.choice(METHODS), CENTER[0] + r * math.sin(a) * KM_LAT,
                CENTER[1] + r * math.cos(a) * KM_LNG, rng.randrange(8),
                days_ago=rng.randrange(90), verified=rng.random() < 0.4)

        Report.objects.bulk_create(reports, batch_size=1000)

        confirmations = []
        for k in (r for r in reports if r.kind == "knowledge"):
            for device in rng.sample(devices, k=rng.randrange(2, 30)):
                if device.pk != k.device_id:
                    confirmations.append(Confirmation(report=k, device=device, ip_hash=f"demo-ip-{rng.randrange(10_000)}"))
        Confirmation.objects.bulk_create(confirmations, batch_size=1000, ignore_conflicts=True)

        transaction.on_commit(bump_data_version)
        self.stdout.write(self.style.SUCCESS(
            f"Seeded {len(reports)} demo reports and {len(confirmations)} confirmations (is_demo=True)."
        ))
