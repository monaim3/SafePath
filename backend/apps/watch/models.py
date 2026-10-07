import uuid

from django.db import models


class PushSubscription(models.Model):
    """
    A browser that follows areas. Anonymous: only the browser's push address and keys —
    no account, phone number or location. Deleted when it unfollows everything or the
    push service says the address is gone.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint = models.CharField(max_length=1024, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    locale = models.CharField(max_length=2, default="bn")
    created_at = models.DateTimeField(auto_now_add=True)
    last_notified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"PushSubscription {str(self.id)[:8]}"


class WatchedArea(models.Model):
    """One neighbourhood-size area (H3 resolution 9, ~0.5 km) a subscription follows."""

    subscription = models.ForeignKey(PushSubscription, on_delete=models.CASCADE, related_name="areas")
    h3 = models.CharField(max_length=16, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subscription", "h3"], name="one_watch_per_area")]
