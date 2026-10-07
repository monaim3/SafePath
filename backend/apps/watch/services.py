"""
Area watch: browsers follow up to MAX_AREAS neighbourhoods and get a Web Push notification
when a moderator verifies a report there. Free (VAPID web push), no accounts.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from urllib.parse import urlparse

import h3
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import PushSubscription, WatchedArea

log = logging.getLogger(__name__)

WATCH_RES = 9
MAX_AREAS = 3
# At most one notification per browser in this window, however many reports get verified.
COOLDOWN = timedelta(hours=3)

# We POST to the browser-supplied endpoint, so only known push services are accepted (no SSRF).
PUSH_HOSTS = (
    "fcm.googleapis.com",  # Chrome, Edge, most Android browsers
    "updates.push.services.mozilla.com",  # Firefox
    "push.apple.com",  # Safari / iPhone home-screen apps (web.push.apple.com)
    "notify.windows.com",  # older Edge on Windows
)

TEXT = {
    "bn": {
        "title": "SafePath · এলাকা সতর্কবার্তা",
        "body": "আপনার অনুসরণ করা এলাকা {code}-এ ছিনতাইয়ের নতুন একটি রিপোর্ট যাচাই করা হয়েছে।",
    },
    "en": {
        "title": "SafePath · Area alert",
        "body": "A new chhintai report was verified in an area you follow ({code}).",
    },
}


def enabled() -> bool:
    return bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)


def endpoint_allowed(endpoint: str) -> bool:
    url = urlparse(endpoint)
    host = (url.hostname or "").lower()
    return url.scheme == "https" and any(host == h or host.endswith("." + h) for h in PUSH_HOSTS)


def area_code(cell: str) -> str:
    """Same short code the website shows for an area."""
    return cell[4:9].upper()


def watch_cell_for(cell: str) -> str:
    """Normalise any map cell (resolution 8–10) to the resolution-9 area that is followed."""
    res = h3.get_resolution(cell)
    if res == WATCH_RES:
        return cell
    return h3.cell_to_parent(cell, WATCH_RES) if res > WATCH_RES else h3.cell_to_center_child(cell, WATCH_RES)


@transaction.atomic
def save_watch(*, endpoint: str, p256dh: str, auth: str, areas: list[str], locale: str) -> list[str]:
    """Replace this browser's followed areas. An empty list removes the browser entirely."""
    if not areas:
        PushSubscription.objects.filter(endpoint=endpoint).delete()
        return []
    sub, _ = PushSubscription.objects.update_or_create(
        endpoint=endpoint, defaults={"p256dh": p256dh, "auth": auth, "locale": locale}
    )
    sub.areas.exclude(h3__in=areas).delete()
    for cell in areas:
        WatchedArea.objects.get_or_create(subscription=sub, h3=cell)
    return sorted(sub.areas.values_list("h3", flat=True))


def areas_for(endpoint: str) -> list[str]:
    return sorted(WatchedArea.objects.filter(subscription__endpoint=endpoint).values_list("h3", flat=True))


def _send(sub: PushSubscription, payload: dict) -> bool:
    """True when delivered. Removes subscriptions the push service reports as gone."""
    from pywebpush import WebPushException, webpush  # heavy import; only when sending

    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=12 * 60 * 60,
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            sub.delete()  # browser unsubscribed or was reset
        else:
            log.warning("Web push failed (%s) for %s", status, sub.id)
        return False


def notify_verified(report_h3: str, now=None) -> int:
    """Called after a moderator verifies a report. Returns how many browsers were notified."""
    if not enabled():
        return 0
    now = now or timezone.now()
    cell = watch_cell_for(report_h3)
    subs = PushSubscription.objects.filter(areas__h3=cell).distinct()
    sent = 0
    for sub in subs:
        if sub.last_notified_at and now - sub.last_notified_at < COOLDOWN:
            continue
        text = TEXT.get(sub.locale, TEXT["bn"])
        payload = {
            "title": text["title"],
            "body": text["body"].format(code=area_code(cell)),
            "url": f"/{sub.locale}/area/{cell}",
            "tag": f"area-{cell}",
        }
        if _send(sub, payload):
            PushSubscription.objects.filter(pk=sub.pk).update(last_notified_at=now)
            sent += 1
    return sent
