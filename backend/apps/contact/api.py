import logging

from django.conf import settings
from django.core.mail import EmailMessage
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.incidents.api.views import client_ip
from apps.incidents.services import turnstile

from .models import ContactMessage

log = logging.getLogger(__name__)


def one_line(text: str) -> str:
    """Collapse whitespace (an email header can't contain line breaks)."""
    return " ".join(text.split())


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    email = serializers.EmailField(max_length=254)
    topic = serializers.ChoiceField(choices=ContactMessage.Topic.choices)
    subject = serializers.CharField(max_length=120)
    message = serializers.CharField(min_length=10, max_length=3000)
    turnstile_token = serializers.CharField(required=False, allow_blank=True, default="")
    # Hidden field people never see; bots fill it in.
    website = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_name(self, value: str) -> str:
        return one_line(value)

    def validate_subject(self, value: str) -> str:
        return one_line(value)


def send(msg: ContactMessage) -> bool:
    body = (
        f"{msg.message}\n\n"
        f"---\n"
        f"From: {msg.name} <{msg.email}>\n"
        f"Topic: {msg.get_topic_display()}\n"
        f"Sent from the SafePath contact form. Reply to this email to answer {msg.name}."
    )
    email = EmailMessage(
        subject=f"[SafePath] {msg.get_topic_display()}: {msg.subject}",
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[settings.CONTACT_TO],
        reply_to=[f"{msg.name} <{msg.email}>"],
    )
    try:
        email.send()
        return True
    except Exception:  # noqa: BLE001 — the message is saved either way
        log.exception("Contact email could not be sent (message %s kept in the database)", msg.pk)
        return False


class ContactView(APIView):
    """POST /api/v1/contact — the contact form. Saved, then emailed to the owner (Reply-To = sender)."""

    authentication_classes: list = []
    permission_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "contact"

    def post(self, request: Request) -> Response:
        data = ContactSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if v["website"]:
            return Response({"ok": True})  # a bot: look successful, keep nothing
        if not turnstile.verify(v["turnstile_token"], client_ip(request)):
            return Response({"error": "captcha"}, status=status.HTTP_400_BAD_REQUEST)
        msg = ContactMessage.objects.create(
            name=v["name"], email=v["email"], topic=v["topic"], subject=v["subject"], message=v["message"].strip()
        )
        msg.emailed = send(msg)
        msg.save(update_fields=["emailed"])
        return Response({"ok": True}, status=status.HTTP_201_CREATED)
