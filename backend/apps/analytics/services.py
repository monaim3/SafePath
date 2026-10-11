"""Count page views, daily visitors and who's online — without storing anything that identifies anyone."""

from __future__ import annotations

import hashlib
import random
import re
from datetime import date, datetime, timedelta

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Sum
from django.utils import timezone

from .models import DailyStat, Presence, VisitorDay

#: Someone counts as online if the site heard from them within this window (pages ping every 90 s).
ONLINE_WINDOW = timedelta(minutes=3)
KEEP_VISITOR_DAYS = 2
KEEP_PRESENCE = timedelta(hours=1)

# Site sections, so area pages etc. are grouped ("/bn/area/8a3c…" → "/area").
SECTIONS = ("map", "report", "safety", "area", "watch", "rules", "contact")
BOT = re.compile(r"bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|curl|wget|python|httpx", re.I)
PHONE = re.compile(r"mobi|android|iphone|ipad|ipod", re.I)


def section(path: str) -> str | None:
    """'/bn/area/8a3c…' → '/area'; '/en' → '/'. None for pages we don't count (moderator screens)."""
    parts = [p for p in path.split("?")[0].split("/") if p]
    if parts and parts[0] in ("bn", "en"):
        parts = parts[1:]
    if not parts:
        return "/"
    if parts[0] == "mod":
        return None
    return f"/{parts[0]}" if parts[0] in SECTIONS else "/other"


def is_bot(user_agent: str) -> bool:
    return not user_agent or bool(BOT.search(user_agent))


def visitor_id(ip: str, user_agent: str, day: date) -> str:
    """Same person on the same day → same id; a new day → a different, unlinkable id."""
    raw = f"{settings.SAFEPATH_HASH_SALT}|{day.isoformat()}|{ip}|{user_agent}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _bump(day: date, metric: str, key: str = "") -> None:
    updated = DailyStat.objects.filter(date=day, metric=metric, key=key).update(count=F("count") + 1)
    if updated:
        return
    try:
        with transaction.atomic():
            DailyStat.objects.create(date=day, metric=metric, key=key, count=1)
    except IntegrityError:  # created by a parallel request in between
        DailyStat.objects.filter(date=day, metric=metric, key=key).update(count=F("count") + 1)


def record(*, path: str, kind: str, installed: bool, ip: str, user_agent: str, now: datetime | None = None) -> None:
    """A page view ("view") or a still-here signal ("ping")."""
    if is_bot(user_agent):
        return
    where = section(path)
    if where is None:
        return
    now = now or timezone.now()
    day = timezone.localdate(now)
    visitor = visitor_id(ip, user_agent, day)

    Presence.objects.update_or_create(visitor=visitor, defaults={"path": where, "last_seen": now})
    if kind != "view":
        return

    _bump(day, "views")
    _bump(day, "page", where)
    _, first_today = VisitorDay.objects.get_or_create(date=day, visitor=visitor)
    if first_today:
        _bump(day, "visitors")
        _bump(day, "device", "app" if installed else ("phone" if PHONE.search(user_agent) else "computer"))

    if random.random() < 0.02:  # tidy up now and then; no scheduler needed
        VisitorDay.objects.filter(date__lt=day - timedelta(days=KEEP_VISITOR_DAYS)).delete()
        Presence.objects.filter(last_seen__lt=now - KEEP_PRESENCE).delete()


def summary(*, days: int = 30, now: datetime | None = None) -> dict:
    """Everything the moderator screen shows."""
    now = now or timezone.now()
    today = timezone.localdate(now)
    first = today - timedelta(days=days - 1)

    online = Presence.objects.filter(last_seen__gte=now - ONLINE_WINDOW)
    stats = DailyStat.objects.filter(date__gte=first)

    def series(metric: str) -> dict[date, int]:
        return {r["date"]: r["n"] for r in stats.filter(metric=metric).values("date").annotate(n=Sum("count"))}

    visitors, views = series("visitors"), series("views")
    day_rows = [
        {"date": (first + timedelta(days=i)).isoformat(),
         "visitors": visitors.get(first + timedelta(days=i), 0),
         "views": views.get(first + timedelta(days=i), 0)}
        for i in range(days)
    ]
    week = day_rows[-7:]

    def keyed(metric: str, day_from: date) -> list[dict]:
        rows = (
            stats.filter(metric=metric, date__gte=day_from)
            .values("key").annotate(n=Sum("count")).order_by("-n")
        )
        return [{"key": r["key"], "count": r["n"]} for r in rows]

    return {
        "online": online.count(),
        "onlinePages": [
            {"key": r["path"], "count": r["n"]}
            for r in online.values("path").annotate(n=Count("id")).order_by("-n")
        ],
        "today": {"visitors": visitors.get(today, 0), "views": views.get(today, 0)},
        "week": {"visitors": sum(d["visitors"] for d in week), "views": sum(d["views"] for d in week)},
        "month": {"visitors": sum(d["visitors"] for d in day_rows), "views": sum(d["views"] for d in day_rows)},
        "devicesToday": keyed("device", today),
        "pagesToday": keyed("page", today),
        "pagesWeek": keyed("page", today - timedelta(days=6)),
        "days": day_rows,
    }
