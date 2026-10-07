"""
Import incidents from published news reports (source = media), after a human has checked them.

    python manage.py import_media_reports data/media_reports.json --dry-run
    python manage.py import_media_reports data/media_reports.json

Each item needs: outlet, url, incident_date (YYYY-MM-DD), hour (0-23 or null), category,
lat, lng (already geocoded and reviewed — this command never guesses locations).
Optional: headline, evidence. Re-running is safe: an article URL is imported only once.

No personal details are stored: only the ~150 m cell, date, time, method and the article link.
Each article counts as its own independent source (one "device" per URL), dated to when the
incident happened so older news fades like any other report.
"""

import hashlib
import json
from datetime import datetime, time, timedelta
from pathlib import Path

import h3
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.incidents import policy
from apps.incidents.models import Device, Report
from apps.incidents.selectors import bump_data_version
from apps.incidents.services import abuse

# Greater Dhaka; anything outside is almost certainly a geocoding mistake.
DHAKA_BOUNDS = {"lat": (23.62, 23.96), "lng": (90.28, 90.56)}
METHODS = {"motorbike", "rickshaw_cng", "on_foot", "bus", "weapon"}


def _check(item: dict, today) -> list[str]:
    problems = []
    for key in ("outlet", "url", "incident_date", "category", "lat", "lng"):
        if item.get(key) in (None, ""):
            problems.append(f"missing {key}")
    if problems:
        return problems
    if not str(item["url"]).startswith("https://"):
        problems.append("url must be https")
    if item["category"] not in METHODS:
        problems.append(f"unknown category {item['category']}")
    try:
        day = datetime.strptime(item["incident_date"], "%Y-%m-%d").date()
        if not abuse.date_is_plausible(day, today):
            problems.append(f"date {day} outside the last {policy.MAX_REPORT_AGE_DAYS} days")
    except ValueError:
        problems.append("bad incident_date")
    hour = item.get("hour")
    if hour is not None and not (isinstance(hour, int) and 0 <= hour <= 23):
        problems.append("hour must be 0-23 or null")
    lat, lng = float(item["lat"]), float(item["lng"])
    if not (DHAKA_BOUNDS["lat"][0] <= lat <= DHAKA_BOUNDS["lat"][1] and DHAKA_BOUNDS["lng"][0] <= lng <= DHAKA_BOUNDS["lng"][1]):
        problems.append(f"location {lat},{lng} is outside Dhaka")
    return problems


class Command(BaseCommand):
    help = "Import reviewed news-report incidents as verified media reports."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--dry-run", action="store_true", help="Validate and show what would be imported.")

    def handle(self, *args, path: str, dry_run: bool, **opts):
        items = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(items, list):
            raise CommandError("Expected a JSON array")
        today = timezone.localdate()
        tz = timezone.get_current_timezone()

        new, skipped, bad = [], 0, 0
        for i, item in enumerate(items, 1):
            problems = _check(item, today)
            if problems:
                bad += 1
                self.stderr.write(f"#{i} {item.get('url', '?')}: {'; '.join(problems)}")
                continue
            if Report.objects.filter(source_url=item["url"]).exists():
                skipped += 1
                continue
            new.append(item)

        self.stdout.write(f"{len(new)} new, {skipped} already imported, {bad} invalid")
        if dry_run or not new:
            for item in new:
                self.stdout.write(f"  + {item['incident_date']} {item.get('hour')}h {item['category']:<12} {item['outlet']}")
            return
        if bad:
            raise CommandError("Fix the invalid items first (nothing was imported).")

        with transaction.atomic():
            for item in new:
                day = datetime.strptime(item["incident_date"], "%Y-%m-%d").date()
                hour = item.get("hour")
                block = (hour if hour is not None else 18) // 3  # unknown time: evening block
                happened = timezone.make_aware(datetime.combine(day, time(hour if hour is not None else 18)), tz)
                # Dated when it happened (not today), never in the future.
                created = min(happened, timezone.now() - timedelta(minutes=1))
                device, _ = Device.objects.get_or_create(
                    device_hash="media:" + hashlib.sha256(item["url"].encode()).hexdigest()[:48],
                    defaults={"trust": 1.0},
                )
                Report.objects.create(
                    kind=Report.Kind.INCIDENT,
                    category=item["category"],
                    h3=h3.latlng_to_cell(float(item["lat"]), float(item["lng"]), 10),
                    date=day,
                    block=block,
                    hour=hour,
                    relation="witnessed",
                    description=(item.get("headline") or "")[:500],
                    status=Report.Status.VERIFIED,
                    weight=abuse.report_weight(Report.Status.VERIFIED, 1.0, 0),
                    device=device,
                    ip_hash="media-import",
                    source=Report.Source.MEDIA,
                    source_name=item["outlet"][:80],
                    source_url=item["url"],
                    created_at=created,
                )
            transaction.on_commit(bump_data_version)
        self.stdout.write(self.style.SUCCESS(f"Imported {len(new)} news reports."))
