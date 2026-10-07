import uuid

from django.db import models
from django.utils import timezone

from . import policy


class Device(models.Model):
    """
    An anonymous reporter, identified only by a salted hash of the install ID the app generates.
    The trust score is internal and never exposed.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_hash = models.CharField(max_length=64, unique=True)
    trust = models.FloatField(default=policy.TRUST_START)
    reports_count = models.PositiveIntegerField(default=0)
    verified_count = models.PositiveIntegerField(default=0)
    rejected_count = models.PositiveIntegerField(default=0)
    restricted_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Device {self.device_hash[:8]}"


class Report(models.Model):
    class Kind(models.TextChoices):
        INCIDENT = "incident"
        KNOWLEDGE = "knowledge"
        POSITIVE = "positive"

    class Status(models.TextChoices):
        PENDING = "pending"
        VERIFIED = "verified"
        REJECTED = "rejected"
        DUPLICATE = "duplicate"

    CATEGORY_CHOICES = [
        (c, c)
        for c in (
            "motorbike", "rickshaw_cng", "on_foot", "bus", "weapon",
            "well_lit", "busy_late", "patrol_seen", "cctv",
        )
    ]
    POSITIVE_CATEGORIES = {"well_lit", "busy_late", "patrol_seen", "cctv"}

    class VideoStatus(models.TextChoices):
        NONE = ""
        AWAITING = "awaiting"  # upload ticket issued, file not confirmed yet
        PENDING = "pending"  # on Cloudinary, waiting for a moderator
        APPROVED = "approved"  # shown publicly (audio removed)
        REJECTED = "rejected"  # deleted from Cloudinary

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    category = models.CharField(max_length=24, choices=CATEGORY_CHOICES)
    # Public location: H3 cell (~150 m). Exact coordinates are never stored.
    h3 = models.CharField(max_length=16, db_index=True)
    date = models.DateField(null=True, blank=True)
    block = models.PositiveSmallIntegerField()  # 0–7 (3-hour blocks)
    hour = models.PositiveSmallIntegerField(null=True, blank=True)
    days = models.CharField(max_length=16, blank=True)
    relation = models.CharField(max_length=16, blank=True)
    description = models.TextField(blank=True)  # already redacted

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    # Internal reasons for review, e.g. ["text_duplicate", "low_trust"]. Never shown to reporters.
    flags = models.JSONField(default=list, blank=True)
    corroborations = models.PositiveIntegerField(default=0)
    weight = models.FloatField(default=0)

    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name="reports")
    ip_hash = models.CharField(max_length=64, db_index=True)
    text_fingerprint = models.CharField(max_length=64, blank=True, db_index=True)
    duplicate_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL)
    # Optional video evidence. The file lives on Cloudinary; only its id is kept here.
    video_status = models.CharField(max_length=16, choices=VideoStatus.choices, default=VideoStatus.NONE, blank=True, db_index=True)
    video_public_id = models.CharField(max_length=128, blank=True)
    # Synthetic rows from `manage.py seed_demo`. The UI labels any area containing them.
    is_demo = models.BooleanField(default=False, db_index=True)
    # Set by the intake service from the same clock its rate-limit and burst checks use.
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["h3", "created_at"])]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.kind}:{self.category}@{self.h3}"


class Confirmation(models.Model):
    """'I've seen this too' on a local-knowledge report. One per device."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="confirmations")
    device = models.ForeignKey(Device, on_delete=models.PROTECT)
    ip_hash = models.CharField(max_length=64)
    # False when it came from the same IP as the report or another confirmation — counted, not weighted.
    independent = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["report", "device"], name="one_confirmation_per_device")]
