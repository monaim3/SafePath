"""Read-side queries for the public map. Business rules live in services/aggregation.py."""

from datetime import timedelta

import h3
from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone

from .models import Report
from .services.aggregation import Row

PUBLIC_STATUSES = [Report.Status.PENDING, Report.Status.VERIFIED]
LOOKBACK = timedelta(days=365)
VERSION_KEY = "safepath:data-version"
CACHE_SECONDS = 120


def data_version() -> int:
    return cache.get_or_set(VERSION_KEY, 1, None)


def bump_data_version() -> None:
    """Call after any write that changes what the public map shows."""
    try:
        cache.incr(VERSION_KEY)
    except ValueError:
        cache.set(VERSION_KEY, 2, None)


def cached(key: str, compute):
    full = f"safepath:{data_version()}:{key}"
    value = cache.get(full)
    if value is None:
        value = compute()
        cache.set(full, value, CACHE_SECONDS)
    return value


def load_rows(cells: list[str] | None = None) -> list[Row]:
    qs = Report.objects.filter(status__in=PUBLIC_STATUSES, created_at__gte=timezone.now() - LOOKBACK)
    if cells is not None:
        qs = qs.filter(h3__in=cells)
    qs = qs.annotate(n_confirmations=Count("confirmations")).values(
        "id", "kind", "category", "h3", "block", "hour", "days", "status", "weight",
        "corroborations", "n_confirmations", "device_id", "created_at",
    )
    return [
        Row(
            id=str(v["id"]), kind=v["kind"], category=v["category"], h3=v["h3"], block=v["block"],
            hour=v["hour"], days=v["days"], status=v["status"], weight=v["weight"],
            corroborations=v["corroborations"], confirmations=v["n_confirmations"],
            device_id=str(v["device_id"]), created_at=v["created_at"],
        )
        for v in qs
    ]


def report_cells_for(cell: str) -> list[str]:
    """All resolution-10 cells inside `cell` (reports are stored at resolution 10)."""
    res = h3.get_resolution(cell)
    return [cell] if res == 10 else list(h3.cell_to_children(cell, 10))


def has_demo_data() -> bool:
    return Report.objects.filter(is_demo=True).exists()
