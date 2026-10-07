"""Django settings for the SafePath API. All secrets come from environment variables."""

import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env reader for local development. Real environment variables always win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BASE_DIR / ".env")


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    return env(name, str(default)).lower() in {"1", "true", "yes"}


DEBUG = env_bool("DJANGO_DEBUG", True)
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key" if DEBUG else "")
if not SECRET_KEY:
    raise RuntimeError("DJANGO_SECRET_KEY must be set when DEBUG is off")

ALLOWED_HOSTS = [h for h in env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "apps.audit",
    "apps.incidents",
    "apps.moderation",
]

MIDDLEWARE = [
    "config.health.HealthCheckMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serves admin static files when no Caddy is in front
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]


def database_from_url(url: str) -> dict:
    """sqlite (default, local dev) or postgres://user:pass@host:port/name?sslmode=require."""
    if not url:
        return {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    parts = urlparse(url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parts.path.lstrip("/"),
        "USER": unquote(parts.username or ""),
        "PASSWORD": unquote(parts.password or ""),
        "HOST": parts.hostname or "",
        "PORT": str(parts.port or 5432),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        # Query-string options (sslmode, channel_binding, ...) go straight to libpq — Neon needs them.
        "OPTIONS": dict(parse_qsl(parts.query)),
    }


DATABASES = {"default": database_from_url(env("DATABASE_URL"))}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Map cache and login throttle. Serverless hosts (Vercel) run many short-lived instances, so they
# need a shared cache: DJANGO_CACHE=database (then run `manage.py createcachetable` once).
if env("DJANGO_CACHE") == "database":
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "django_cache"}}

LANGUAGE_CODE = "en"
TIME_ZONE = "Asia/Dhaka"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # filled by collectstatic, served by Caddy or WhiteNoise
# Hosts that never run collectstatic (Vercel): WhiteNoise serves admin files straight from the apps.
WHITENOISE_USE_FINDERS = not STATIC_ROOT.is_dir()

REST_FRAMEWORK = {
    # Moderators (Next.js dashboard, other origin) use tokens; the Django admin uses sessions.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_THROTTLE_RATES": {"mod_login": "5/min"},
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

CORS_ALLOWED_ORIGINS = [
    o for o in env("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3100").split(",") if o
]

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    if not env("SAFEPATH_HASH_SALT"):
        raise RuntimeError("SAFEPATH_HASH_SALT must be set in production")

# ---------- SafePath ----------
# Salt for hashing device IDs and IPs. Rotating it unlinks all existing hashes.
SAFEPATH_HASH_SALT = env("SAFEPATH_HASH_SALT", "dev-only-salt")
# Cloudflare Turnstile secret. Empty = verification skipped (local development only).
TURNSTILE_SECRET = env("TURNSTILE_SECRET")
# Proxies whose X-Forwarded-For we trust (e.g. Caddy/Nginx in front of the app).
TRUSTED_PROXY_COUNT = int(env("TRUSTED_PROXY_COUNT", "0"))
# Header carrying the real client IP, set by an edge proxy that clients cannot spoof through.
# On Render: HTTP_CF_CONNECTING_IP (Render appends to, never resets, X-Forwarded-For).
# On Vercel: HTTP_X_REAL_IP (set by Vercel's edge, client values are overwritten).
CLIENT_IP_HEADER = env("CLIENT_IP_HEADER")
