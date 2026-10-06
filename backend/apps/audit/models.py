import uuid

from django.conf import settings
from django.db import models


class ImmutableError(Exception):
    """Raised when code tries to change or delete an audit entry."""


class AuditLogQuerySet(models.QuerySet):
    def update(self, **kwargs):  # noqa: ARG002
        raise ImmutableError("Audit log entries cannot be updated")

    def delete(self):
        raise ImmutableError("Audit log entries cannot be deleted")


class AuditLog(models.Model):
    """Append-only record of important actions (moderation, config changes, flags)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    # "system" for automatic actions (e.g. burst detection).
    actor_label = models.CharField(max_length=64, default="system")
    action = models.CharField(max_length=64)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ImmutableError("Audit log entries cannot be updated")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableError("Audit log entries cannot be deleted")
