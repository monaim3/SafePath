"""Moderator decisions. Every decision updates the reporter's hidden trust and is audit-logged."""

import logging

from django.db import transaction
from django.utils import timezone

from apps.audit.services import record
from apps.incidents import policy
from apps.incidents.models import Device, Report
from apps.incidents.selectors import bump_data_version
from apps.incidents.services import abuse, video
from apps.incidents.services.submission import refresh_weight

from .models import Flag


def _resolve_flags(report: Report) -> None:
    Flag.objects.filter(report=report, status=Flag.Status.OPEN).update(status=Flag.Status.RESOLVED)


def _notify_watchers(h3_cell: str) -> None:
    from apps.watch.services import notify_verified

    try:
        notify_verified(h3_cell)
    except Exception:  # a push failure must never undo or block a moderator's decision
        logging.getLogger(__name__).exception("Area-watch notification failed")


def _drop_video(report: Report) -> None:
    """Mark the report's video rejected and delete the file from Cloudinary after the commit."""
    if report.video_status in ("", Report.VideoStatus.REJECTED):
        return
    report.video_status = Report.VideoStatus.REJECTED
    report.save(update_fields=["video_status"])
    public_id = report.video_public_id
    transaction.on_commit(lambda: video.destroy(public_id))


@transaction.atomic
def verify_report(report: Report, *, actor) -> Report:
    before = {"status": report.status, "weight": report.weight}
    device: Device = report.device
    report.status = Report.Status.VERIFIED
    device.trust = abuse.clamp_trust(device.trust + policy.TRUST_ON_VERIFIED)
    device.verified_count += 1
    device.save(update_fields=["trust", "verified_count"])
    refresh_weight(report)
    report.save(update_fields=["status", "weight"])
    _resolve_flags(report)
    transaction.on_commit(bump_data_version)
    if not report.is_demo and report.kind != Report.Kind.POSITIVE:
        # People following this area get a push notification (verified reports only).
        transaction.on_commit(lambda: _notify_watchers(report.h3))
    record(
        action="report.verify", entity_type="report", entity_id=report.id, actor=actor,
        before=before, after={"status": report.status, "weight": report.weight},
    )
    return report


@transaction.atomic
def reject_report(report: Report, *, actor, reason: str = "") -> Report:
    """Rejected reports stop counting; repeated rejections temporarily restrict the device."""
    before = {"status": report.status, "weight": report.weight}
    device: Device = report.device
    now = timezone.now()
    report.status = Report.Status.REJECTED
    device.trust = abuse.clamp_trust(device.trust + policy.TRUST_ON_REJECTED)
    device.rejected_count += 1

    recent_rejections = (
        Report.objects.filter(device=device, status=Report.Status.REJECTED, created_at__gte=now - policy.RESTRICT_WINDOW)
        .exclude(pk=report.pk)
        .count()
        + 1
    )
    if recent_rejections >= policy.RESTRICT_AFTER_REJECTIONS:
        device.restricted_until = now + policy.RESTRICTION_PERIOD
    device.save(update_fields=["trust", "rejected_count", "restricted_until"])

    refresh_weight(report)
    report.save(update_fields=["status", "weight"])
    _resolve_flags(report)
    _drop_video(report)  # a rejected report's footage is not kept either
    transaction.on_commit(bump_data_version)
    record(
        action="report.reject", entity_type="report", entity_id=report.id, actor=actor,
        before=before, after={"status": report.status, "reason": reason},
    )
    return report


@transaction.atomic
def approve_video(report: Report, *, actor) -> Report:
    """Footage becomes public on the area page (audio removed)."""
    report.video_status = Report.VideoStatus.APPROVED
    report.save(update_fields=["video_status"])
    transaction.on_commit(bump_data_version)
    record(action="video.approve", entity_type="report", entity_id=report.id, actor=actor)
    return report


@transaction.atomic
def reject_video(report: Report, *, actor) -> Report:
    """The report stands on its own; only the footage is removed (and deleted from Cloudinary)."""
    _drop_video(report)
    transaction.on_commit(bump_data_version)
    record(action="video.reject", entity_type="report", entity_id=report.id, actor=actor)
    return report


@transaction.atomic
def mark_duplicate(report: Report, *, actor) -> Report:
    """Same incident reported twice. Stops counting, but is not the reporter's fault — no trust penalty."""
    before = {"status": report.status, "weight": report.weight}
    report.status = Report.Status.DUPLICATE
    refresh_weight(report)
    report.save(update_fields=["status", "weight"])
    _resolve_flags(report)
    transaction.on_commit(bump_data_version)
    record(
        action="report.duplicate", entity_type="report", entity_id=report.id, actor=actor,
        before=before, after={"status": report.status},
    )
    return report


def resolve_flag(flag: Flag, *, actor) -> Flag:
    flag.status = Flag.Status.RESOLVED
    flag.save(update_fields=["status"])
    record(action="flag.resolve", entity_type="flag", entity_id=flag.id, actor=actor)
    return flag
