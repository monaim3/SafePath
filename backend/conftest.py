import pytest


@pytest.fixture(autouse=True)
def _no_turnstile(settings):
    """Tests never call Cloudflare; test_turnstile.py re-enables it explicitly."""
    settings.TURNSTILE_SECRET = ""
    settings.CLOUDINARY = None  # video tests switch it on with a fake account
    settings.VAPID_PUBLIC_KEY = settings.VAPID_PRIVATE_KEY = ""  # watch tests switch push on
