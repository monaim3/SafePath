from django.http import HttpResponse


class HealthCheckMiddleware:
    """Answers /healthz before host validation and the HTTPS redirect.

    Platform health checks (e.g. Render) call the container over plain HTTP with an internal
    Host header, which ALLOWED_HOSTS and SECURE_SSL_REDIRECT would otherwise reject.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/healthz":
            return HttpResponse("ok", content_type="text/plain")
        return self.get_response(request)
