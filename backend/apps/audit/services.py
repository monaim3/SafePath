from typing import Any

from .models import AuditLog


def record(
    *,
    action: str,
    entity_type: str,
    entity_id: Any,
    before: dict | None = None,
    after: dict | None = None,
    actor=None,
) -> AuditLog:
    return AuditLog.objects.create(
        actor=actor if actor is not None and actor.is_authenticated else None,
        actor_label=actor.get_username() if actor is not None and actor.is_authenticated else "system",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        before=before,
        after=after,
    )
