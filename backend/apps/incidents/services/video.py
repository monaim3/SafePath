"""
Optional video evidence (e.g. CCTV), hosted on Cloudinary so it never touches our server or database.

Flow: a report is accepted first (CAPTCHA + rate limits) → the response carries a signed upload
ticket that only allows one file, named after that report → the browser uploads straight to
Cloudinary → it calls attach(), and we confirm with Cloudinary that the file exists before a
moderator sees it. Rejected videos are deleted from Cloudinary.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from urllib import error, parse, request

from django.conf import settings

log = logging.getLogger(__name__)

API = "https://api.cloudinary.com/v1_1"
CDN = "https://res.cloudinary.com"
# Cloudinary's free plan caps a video at 100 MB; keep a margin.
MAX_BYTES = 95 * 1024 * 1024
ALLOWED_FORMATS = "3gp,avi,m4v,mkv,mov,mp4,webm"
TICKET_SECONDS = 60 * 60


def enabled() -> bool:
    return settings.CLOUDINARY is not None


def _cfg() -> dict:
    return settings.CLOUDINARY


def public_id_for(report_id) -> str:
    return f"safepath/reports/{report_id}"


def sign(params: dict, secret: str) -> str:
    """Cloudinary's request signature: sorted key=value pairs joined by '&', then SHA-1 with the secret."""
    payload = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hashlib.sha1((payload + secret).encode()).hexdigest()


# ---------- attach tokens (prove the caller is the one who just submitted the report) ----------
def _token_mac(report_id, expires: int) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"video:{report_id}:{expires}".encode(), hashlib.sha256).hexdigest()


def attach_token(report_id, now: float | None = None) -> str:
    expires = int((time.time() if now is None else now) + TICKET_SECONDS)
    return f"{expires}.{_token_mac(report_id, expires)}"


def token_valid(report_id, token: str, now: float | None = None) -> bool:
    expires_raw, _, mac = token.partition(".")
    if not expires_raw.isdigit() or int(expires_raw) < (time.time() if now is None else now):
        return False
    return hmac.compare_digest(mac, _token_mac(report_id, int(expires_raw)))


def upload_ticket(report_id) -> dict:
    """Everything the browser needs for one signed upload of this report's video."""
    cfg = _cfg()
    params = {"allowed_formats": ALLOWED_FORMATS, "public_id": public_id_for(report_id), "timestamp": int(time.time())}
    return {
        "url": f"{API}/{cfg['cloud']}/video/upload",
        "fields": {**params, "api_key": cfg["key"], "signature": sign(params, cfg["secret"])},
        "maxBytes": MAX_BYTES,
        "attachToken": attach_token(report_id),
    }


# ---------- Cloudinary calls ----------
def fetch_asset(public_id: str) -> dict | None:
    """The uploaded video's metadata, or None if it isn't there."""
    cfg = _cfg()
    url = f"{API}/{cfg['cloud']}/resources/video/upload/{parse.quote(public_id, safe='/')}"
    auth = base64.b64encode(f"{cfg['key']}:{cfg['secret']}".encode()).decode()
    try:
        with request.urlopen(request.Request(url, headers={"Authorization": f"Basic {auth}"}), timeout=10) as res:
            return json.load(res)
    except error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def destroy(public_id: str) -> None:
    """Delete a video. Best effort: a failure is logged, never raised into a moderator's action."""
    if not enabled() or not public_id:
        return
    cfg = _cfg()
    params = {"invalidate": "true", "public_id": public_id, "timestamp": int(time.time())}
    body = parse.urlencode({**params, "api_key": cfg["key"], "signature": sign(params, cfg["secret"])}).encode()
    try:
        with request.urlopen(request.Request(f"{API}/{cfg['cloud']}/video/destroy", data=body), timeout=10):
            pass
    except OSError:
        log.warning("Could not delete video %s from Cloudinary", public_id)


# ---------- delivery URLs ----------
def public_url(public_id: str) -> str:
    """What visitors see: audio removed (voices can carry names), compressed, as MP4."""
    return f"{CDN}/{_cfg()['cloud']}/video/upload/ac_none,q_auto/{public_id}.mp4"


def poster_url(public_id: str) -> str:
    return f"{CDN}/{_cfg()['cloud']}/video/upload/so_1,q_auto/{public_id}.jpg"


def moderator_url(public_id: str) -> str:
    """Moderators review the original, with sound."""
    return f"{CDN}/{_cfg()['cloud']}/video/upload/q_auto/{public_id}.mp4"
