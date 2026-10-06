"""Cloudflare Turnstile (free CAPTCHA) server-side verification."""

import json
import logging
from urllib import parse, request

from django.conf import settings

log = logging.getLogger(__name__)
VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify(token: str, ip: str) -> bool:
    """True when the token is valid. With no secret configured (local dev) this always passes."""
    secret = settings.TURNSTILE_SECRET
    if not secret:
        return True
    if not token:
        return False
    body = parse.urlencode({"secret": secret, "response": token, "remoteip": ip}).encode()
    try:
        with request.urlopen(request.Request(VERIFY_URL, data=body), timeout=5) as res:
            return bool(json.load(res).get("success"))
    except OSError:
        # Fail closed: if Cloudflare is unreachable we don't accept anonymous submissions.
        log.warning("Turnstile verification unavailable")
        return False
