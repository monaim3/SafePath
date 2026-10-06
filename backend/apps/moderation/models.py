import uuid

from django.db import models


class Flag(models.Model):
    """Something that needs a human look: a suspicious report or a burst in one area."""

    class Reason(models.TextChoices):
        BURST = "burst", "Many reports from few devices in a short time"
        TEXT_DUPLICATE = "text_duplicate", "Same description as another report"
        LOW_TRUST = "low_trust", "Reporter has a low trust score"

    class Status(models.TextChoices):
        OPEN = "open"
        RESOLVED = "resolved"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reason = models.CharField(max_length=24, choices=Reason.choices)
    report = models.ForeignKey("incidents.Report", null=True, blank=True, on_delete=models.CASCADE, related_name="mod_flags")
    # For area-level flags (bursts): the H3 cell.
    h3 = models.CharField(max_length=16, blank=True, db_index=True)
    details = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
