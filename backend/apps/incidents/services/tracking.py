"""
Report tracking codes. Reporting is anonymous, so the code is the only link between a person and
their report: whoever holds it may see the report's status (a bearer code, like a parcel number).
Withdrawing also needs the phone that sent the report.

Codes are 8 random Crockford base-32 characters (40 bits, ~1.1 trillion), shown as SP-XXXX-XXXX.
Only a keyed hash is stored, the same way device IDs and IPs are.
"""

from __future__ import annotations

import secrets

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audit.services import record
from apps.moderation.models import Flag

from ..models import Report
from ..selectors import bump_data_version
from . import abuse, video

# Crockford base 32: no I, L, O or U, so a code read aloud or copied by hand survives.
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
LENGTH = 8
PREFIX = "SP"
# Letters people type for digits that look the same.
_LOOKALIKES = str.maketrans({"O": "0", "I": "1", "L": "1"})

# What the reporter is told for each moderator reason ("fake" would read as an accusation).
PUBLIC_REJECT_REASON = {
    "fake": "unconfirmed",
    "wrong_place": "wrong_place",
    "spam": "not_chhintai",
    "offensive": "rules",
    "other": "other",
}


class TrackingError(Exception):
    """`code` is safe to return to the client."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def normalize(raw: str) -> str | None:
    """'sp-7k3m 9qx2' → '7K3M9QX2'; None when it can't be a code."""
    value = "".join(ch for ch in str(raw).upper() if ch.isalnum()).translate(_LOOKALIKES)
    if len(value) == LENGTH + len(PREFIX) and value.startswith(PREFIX):
        value = value[len(PREFIX):]
    if len(value) != LENGTH or any(ch not in ALPHABET for ch in value):
        return None
    return value


def display(code: str) -> str:
    return f"{PREFIX}-{code[:4]}-{code[4:]}"


def code_hash(code: str) -> str:
    # Own namespace, so a code's hash can never equal a device or IP hash.
    return abuse.hash_identifier(f"track:{code}", settings.SAFEPATH_HASH_SALT)


def issue(report: Report) -> str:
    """Give the report a fresh code; returns it for display (it is not stored)."""
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
        digest = code_hash(code)
        if not Report.objects.filter(tracking_hash=digest).exists():
            break
    report.tracking_hash = digest
    report.save(update_fields=["tracking_hash"])
    return display(code)


def _video_state(report: Report) -> str:
    if report.video_status == Report.VideoStatus.AWAITING:
        return "not_received"  # an upload ticket was issued but the file never arrived
    return report.video_status  # "", pending, approved, rejected


def public_status(report: Report, code: str) -> dict:
    """What a code holder may see: no place, no description, nothing about the reporter."""
    return {
        "code": display(code),
        "kind": report.kind,
        "category": report.category,
        "date": report.date.isoformat() if report.date else None,
        "submitted_at": report.created_at.isoformat(),
        "status": report.status,
        "reason": PUBLIC_REJECT_REASON.get(report.reject_reason, "other")
        if report.status == Report.Status.REJECTED
        else None,
        "reviewed_at": report.reviewed_at.isoformat() if report.reviewed_at else None,
        "video": _video_state(report),
    }


def lookup(raw_codes: list[str]) -> list[dict]:
    """Statuses for the codes that match a report; unknown or malformed codes are left out."""
    codes = {c for c in (normalize(r) for r in raw_codes) if c}
    by_hash = {code_hash(c): c for c in codes}
    reports = Report.objects.filter(tracking_hash__in=by_hash.keys())
    return sorted(
        (public_status(r, by_hash[r.tracking_hash]) for r in reports),
        key=lambda item: item["submitted_at"],
        reverse=True,
    )


@transaction.atomic
def withdraw(*, raw_code: str, device_hash: str) -> dict:
    """
    The reporter takes back a report a moderator hasn't decided yet. The row stays (it still
    counts toward rate limits, so withdraw-and-resend can't dodge them); what it said is wiped.
    A wrong code and someone else's phone get the same answer, so neither can be probed.
    """
    code = normalize(raw_code)
    report = (
        Report.objects.select_for_update()
        .select_related("device")
        .filter(tracking_hash=code_hash(code))
        .first()
        if code
        else None
    )
    if report is None or report.device.device_hash != device_hash:
        raise TrackingError("not_found")
    if report.status != Report.Status.PENDING:
        raise TrackingError("already_decided")

    report.status = Report.Status.WITHDRAWN
    report.weight = 0.0
    report.reviewed_at = timezone.now()
    report.description = ""
    report.exact_lat = report.exact_lng = None
    report.place_label = ""
    public_id = report.video_public_id
    if report.video_status:
        report.video_status = Report.VideoStatus.REJECTED
        report.video_link = ""
    report.save(
        update_fields=[
            "status", "weight", "reviewed_at", "description", "exact_lat", "exact_lng",
            "place_label", "video_status", "video_link",
        ]
    )
    if public_id:
        transaction.on_commit(lambda: video.destroy(public_id))
    # Its open review flags go too: nothing is left to review.
    Flag.objects.filter(report=report, status=Flag.Status.OPEN).update(status=Flag.Status.RESOLVED)
    transaction.on_commit(bump_data_version)
    record(action="report.withdraw", entity_type="report", entity_id=report.id, after={"status": report.status})
    return public_status(report, code)
