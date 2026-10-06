import pytest


@pytest.fixture(autouse=True)
def _no_turnstile(settings):
    """Tests never call Cloudflare; test_turnstile.py re-enables it explicitly."""
    settings.TURNSTILE_SECRET = ""
