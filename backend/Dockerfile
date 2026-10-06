FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn==23.0.0

COPY . .
RUN useradd --create-home app && mkdir -p /app/staticfiles && chown -R app /app
USER app

EXPOSE 8000
# Migrations + static files on start, so a fresh server comes up ready.
# PORT and WEB_CONCURRENCY are set by hosts like Render; defaults suit the Oracle/Caddy stack.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-3} --timeout 60 --access-logfile -"]
