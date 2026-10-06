"""
Report intake: identity hashing, rate limits, plausibility, corroboration and burst
detection. Views call these functions; they never contain the rules themselves.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import h3
from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.audit.services import record
from apps.moderation.models import Flag

from .. import policy
from ..models import Confirmation, Device, Report
from ..selectors import bump_data_version
from . import abuse


class SubmissionRejected(Exception):
    """The request is refused. `code` is safe to return; it never reveals detection details."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Identity:
    device_hash: str
    ip_hash: str


def identify(device_id: str, ip: str) -> Identity:
    salt = settings.SAFEPATH_HASH_SALT
    return Identity(abuse.hash_identifier(device_id, salt), abuse.hash_identifier(ip, salt))


def _device(identity: Identity) -> Device:
    device, _ = Device.objects.get_or_create(device_hash=identity.device_hash)
    return device


def _check_rate_limits(device: Device, ip_hash: str, now: datetime) -> None:
    for window, limit in policy.RATE_LIMITS:
        recent = Report.objects.filter(Q(device=device) | Q(ip_hash=ip_hash), created_at__gte=now - window)
        if recent.count() >= limit:
            raise SubmissionRejected("rate_limited")


def refresh_weight(report: Report) -> None:
    report.weight = abuse.report_weight(report.status, report.device.trust, report.corroborations)


def _signature(r: Report) -> abuse.ReportSignature:
    return abuse.ReportSignature(
        h3=r.h3, category=r.category, date=r.date, hour=r.hour, block=r.block,
        device_hash=r.device.device_hash, ip_hash=r.ip_hash,
    )


def _corroborate(report: Report, now: datetime) -> None:
    """Link the new report to independent reports of the same kind nearby and around the same time."""
    if report.kind == Report.Kind.POSITIVE:
        return
    candidates = (
        Report.objects.select_related("device")
        .filter(
            h3__in=h3.grid_disk(report.h3, policy.CORROBORATE_RING),
            category=report.category,
            status__in=[Report.Status.PENDING, Report.Status.VERIFIED],
            created_at__gte=now - timedelta(days=60),
        )
        .exclude(pk=report.pk)
        .exclude(device=report.device)
        .exclude(ip_hash=report.ip_hash)
    )
    new_sig = _signature(report)
    matched: list[Report] = [c for c in candidates if abuse.corroborates(new_sig, _signature(c))]
    if not matched:
        return

    # Count one corroboration per independent device, however many reports it sent.
    devices = {m.device_id for m in matched}
    report.corroborations += len(devices)
    for other in {m.device_id: m for m in matched}.values():
        Report.objects.filter(pk=other.pk).update(corroborations=F("corroborations") + 1)
        other.refresh_from_db()
        other.device.trust = abuse.clamp_trust(other.device.trust + policy.TRUST_ON_CORROBORATED)
        other.device.save(update_fields=["trust"])
        refresh_weight(other)
        other.save(update_fields=["weight"])


def _detect_burst(report: Report, now: datetime) -> None:
    area = h3.grid_disk(report.h3, 1)
    recent = Report.objects.filter(h3__in=area, created_at__gte=now - policy.BURST_WINDOW)
    count = recent.count()
    devices = recent.values("device").distinct().count()
    if not abuse.is_burst(count, devices):
        return
    if Flag.objects.filter(reason=Flag.Reason.BURST, h3=report.h3, status=Flag.Status.OPEN).exists():
        return
    flag = Flag.objects.create(
        reason=Flag.Reason.BURST, h3=report.h3, details={"reports": count, "devices": devices}
    )
    record(action="flag.burst", entity_type="cell", entity_id=report.h3, after={"flag": str(flag.id), **flag.details})


@transaction.atomic
def submit_report(
    *,
    data: dict,
    device_id: str,
    ip: str,
    now: datetime | None = None,
) -> Report:
    """
    `data` is already validated by the serializer (shape, enums, redaction).
    Raises SubmissionRejected for rate limits, restrictions and impossible dates.
    """
    now = now or timezone.now()
    local_now = timezone.localtime(now)
    identity = identify(device_id, ip)
    device = _device(identity)

    if device.restricted_until and device.restricted_until > now:
        raise SubmissionRejected("rate_limited")  # same answer as a rate limit — don't reveal restriction
    _check_rate_limits(device, identity.ip_hash, now)

    day: date | None = data.get("date")
    if not abuse.date_is_plausible(day, local_now.date()) or not abuse.hour_is_plausible(
        day, data.get("hour"), data["block"], local_now
    ):
        raise SubmissionRejected("invalid_time")

    flags: list[str] = []
    fingerprint = abuse.text_fingerprint(data.get("description", ""))
    if fingerprint and Report.objects.filter(text_fingerprint=fingerprint, created_at__gte=now - timedelta(days=30)).exists():
        flags.append(Flag.Reason.TEXT_DUPLICATE)
    if device.trust <= policy.TRUST_MIN + 0.1:
        flags.append(Flag.Reason.LOW_TRUST)

    report = Report(
        kind=data["kind"],
        category=data["category"],
        h3=data["h3"],
        date=day,
        block=data["block"],
        hour=data.get("hour"),
        days=data.get("days", ""),
        relation=data.get("relation", ""),
        description=data.get("description", ""),
        flags=[str(f) for f in flags],
        device=device,
        ip_hash=identity.ip_hash,
        text_fingerprint=fingerprint,
        created_at=now,
    )
    report.save()
    _corroborate(report, now)
    refresh_weight(report)
    report.save(update_fields=["corroborations", "weight"])

    Device.objects.filter(pk=device.pk).update(reports_count=F("reports_count") + 1)
    for reason in flags:
        Flag.objects.create(reason=reason, report=report, h3=report.h3)
    if flags:
        record(action="report.flagged", entity_type="report", entity_id=report.id, after={"flags": report.flags})

    _detect_burst(report, now)
    transaction.on_commit(bump_data_version)
    return report


@transaction.atomic
def confirm_knowledge(*, report_id, device_id: str, ip: str, now: datetime | None = None) -> bool:
    """
    'I've seen this too'. Idempotent per device. Returns True when it counted as an
    independent confirmation (raising the report's weight).
    """
    now = now or timezone.now()
    identity = identify(device_id, ip)
    report = (
        Report.objects.select_for_update()
        .select_related("device")
        .filter(pk=report_id, kind=Report.Kind.KNOWLEDGE)
        .exclude(status__in=[Report.Status.REJECTED, Report.Status.DUPLICATE])
        .first()
    )
    if report is None:
        raise SubmissionRejected("not_found")
    device = _device(identity)
    if device.restricted_until and device.restricted_until > now:
        raise SubmissionRejected("rate_limited")
    if device.pk == report.device_id:
        return False  # confirming your own report doesn't count
    if Confirmation.objects.filter(report=report, device=device).exists():
        return False
    if Confirmation.objects.filter(device=device, created_at__gte=now - timedelta(days=1)).count() >= policy.CONFIRM_LIMIT_PER_DAY:
        raise SubmissionRejected("rate_limited")

    independent = identity.ip_hash != report.ip_hash and not Confirmation.objects.filter(
        report=report, ip_hash=identity.ip_hash
    ).exists()
    Confirmation.objects.create(
        report=report, device=device, ip_hash=identity.ip_hash, independent=independent, created_at=now
    )
    if independent:
        report.corroborations += 1
        refresh_weight(report)
        report.save(update_fields=["corroborations", "weight"])
    transaction.on_commit(bump_data_version)
    return independent
