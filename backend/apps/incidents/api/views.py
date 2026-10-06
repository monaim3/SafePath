from django.conf import settings
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..services import turnstile
from ..services.submission import SubmissionRejected, confirm_knowledge, submit_report
from .serializers import ConfirmSerializer, ReportInputSerializer

REJECTION_STATUS = {
    "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
    "captcha": status.HTTP_400_BAD_REQUEST,
    "invalid_time": status.HTTP_400_BAD_REQUEST,
    "not_found": status.HTTP_404_NOT_FOUND,
}


def client_ip(request: Request) -> str:
    """Remote address, honouring X-Forwarded-For only from configured trusted proxies."""
    hops = settings.TRUSTED_PROXY_COUNT
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if hops and forwarded:
        chain = [p.strip() for p in forwarded.split(",") if p.strip()]
        if len(chain) >= hops:
            return chain[-hops]
    return request.META.get("REMOTE_ADDR", "")


def rejected(code: str) -> Response:
    return Response({"error": code}, status=REJECTION_STATUS.get(code, status.HTTP_400_BAD_REQUEST))


class ReportCreateView(APIView):
    """POST /api/v1/reports — anonymous; every check runs here, never only in the browser."""

    def post(self, request: Request) -> Response:
        serializer = ReportInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        ip = client_ip(request)

        if not turnstile.verify(data.pop("turnstile_token", ""), ip):
            return rejected("captcha")
        device_id = data.pop("device_id")
        try:
            report = submit_report(data=data, device_id=device_id, ip=ip)
        except SubmissionRejected as exc:
            return rejected(exc.code)
        # Deliberately minimal: never reveal flags, weight or trust.
        return Response({"id": str(report.id), "status": "received"}, status=status.HTTP_201_CREATED)


class ConfirmView(APIView):
    """POST /api/v1/knowledge/<id>/confirm — 'I've seen this too'."""

    def post(self, request: Request, report_id) -> Response:
        serializer = ConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            confirm_knowledge(report_id=report_id, device_id=serializer.validated_data["device_id"], ip=client_ip(request))
        except SubmissionRejected as exc:
            return rejected(exc.code)
        # Same answer whether or not it counted, so it can't be probed.
        return Response({"ok": True})
