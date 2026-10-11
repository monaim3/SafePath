from unittest import mock

import pytest
from django.core import mail
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.contact.models import ContactMessage

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _fresh(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.CONTACT_TO = "owner@example.com"
    cache.clear()  # throttle counters


def form(**over):
    data = {
        "name": "Rahim",
        "email": "rahim@example.com",
        "topic": "wrong_info",
        "subject": "Wrong colour in Banasree",
        "message": "The C Block area looks red but nothing happened there recently.",
    }
    data.update(over)
    return data


def post(data, ip="203.0.113.4"):
    return APIClient().post("/api/v1/contact", data, format="json", REMOTE_ADDR=ip)


def test_message_is_saved_and_emailed_with_reply_to_the_sender():
    res = post(form())
    assert res.status_code == 201
    assert len(mail.outbox) == 1
    sent = mail.outbox[0]
    assert sent.to == ["owner@example.com"]
    assert sent.reply_to == ["Rahim <rahim@example.com>"]
    assert sent.subject == "[SafePath] Wrong information on the map: Wrong colour in Banasree"
    assert "C Block area" in sent.body and "rahim@example.com" in sent.body
    assert ContactMessage.objects.get().emailed is True


def test_kept_even_if_email_fails():
    with mock.patch("apps.contact.api.EmailMessage.send", side_effect=OSError("smtp down")):
        assert post(form()).status_code == 201
    assert ContactMessage.objects.get().emailed is False


def test_line_breaks_cannot_inject_email_headers():
    post(form(subject="Hi\r\nBcc: victim@example.com", name="A\nB"))
    sent = mail.outbox[0]
    assert "\n" not in sent.subject and "Bcc" not in str(sent.bcc)
    assert ContactMessage.objects.get().name == "A B"


def test_bots_filling_the_hidden_field_get_nothing():
    assert post(form(website="http://spam.example")).status_code == 200
    assert not ContactMessage.objects.exists() and not mail.outbox


def test_invalid_input_is_refused():
    assert post(form(email="not-an-email")).status_code == 400
    assert post(form(topic="nonsense")).status_code == 400
    assert post(form(message="short")).status_code == 400
    assert not mail.outbox


def test_captcha_required_when_configured(settings):
    settings.TURNSTILE_SECRET = "secret"
    assert post(form()).status_code == 400
    assert not ContactMessage.objects.exists()


def test_rate_limited_per_network():
    codes = [post(form(), ip="198.51.100.9").status_code for _ in range(6)]
    assert codes[:5] == [201] * 5 and codes[5] == 429
