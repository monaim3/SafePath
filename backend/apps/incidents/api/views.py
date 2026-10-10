import logging

from django.conf import settings
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import Report
from ..services import geo, turnstile, video
from ..services.submission import SubmissionRejected, confirm_knowledge, submit_report
from .serializers import ConfirmSerializer, ReportInputSerializer, VideoAttachSerializer

log = logging.getLogger(__name__)

REJECTION_STATUS = {
    "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
    "captcha": status.HTTP_400_BAD_REQUEST,
    "invalid_time": status.HTTP_400_BAD_REQUEST,
    "not_found": status.HTTP_404_NOT_FOUND,
    "not_uploaded": status.HTTP_409_CONFLICT,
    "too_large": status.HTTP_400_BAD_REQUEST,
    "unavailable": status.HTTP_503_SERVICE_UNAVAILABLE,
}


def client_ip(request: Request) -> str:
    """Remote address, honouring X-Forwarded-For only from configured trusted proxies."""
    if settings.CLIENT_IP_HEADER:
        # Set by an edge proxy that overwrites any client-sent value (e.g. Cloudflare on Render).
        ip = request.META.get(settings.CLIENT_IP_HEADER, "").strip()
        if ip:
            return ip
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

        # Checked before the CAPTCHA so an out-of-country spot doesn't cost a Turnstile call.
        if not geo.cell_in_bangladesh(data["h3"]):
            return rejected("outside_bangladesh")
        if not turnstile.verify(data.pop("turnstile_token", ""), ip):
            return rejected("captcha")
        device_id = data.pop("device_id")
        wants_video = data.pop("has_video", False)
        try:
            report = submit_report(data=data, device_id=device_id, ip=ip)
        except SubmissionRejected as exc:
            return rejected(exc.code)
        # Deliberately minimal: never reveal flags, weight or trust.
        body = {"id": str(report.id), "status": "received"}
        if wants_video and report.kind == Report.Kind.INCIDENT and video.enabled():
            # One upload per accepted report, so the report rate limits also cap uploads.
            report.video_status = Report.VideoStatus.AWAITING
            report.video_public_id = video.public_id_for(report.id)
            report.save(update_fields=["video_status", "video_public_id"])
            body["upload"] = video.upload_ticket(report.id)
        return Response(body, status=status.HTTP_201_CREATED)


class VideoAttachView(APIView):
    """POST /api/v1/reports/<id>/video {token} — the browser finished uploading to Cloudinary."""

    def post(self, request: Request, report_id) -> Response:
        serializer = VideoAttachSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not video.enabled() or not video.token_valid(report_id, serializer.validated_data["token"]):
            return rejected("not_found")
        report = Report.objects.filter(pk=report_id, video_status=Report.VideoStatus.AWAITING).first()
        if report is None:
            return rejected("not_found")
        try:
            asset = video.fetch_asset(report.video_public_id)
        except OSError:
            log.warning("Cloudinary unreachable while attaching video for %s", report_id)
            return rejected("unavailable")
        if asset is None:
            return rejected("not_uploaded")
        if int(asset.get("bytes", 0)) > video.MAX_BYTES:
            video.destroy(report.video_public_id)
            report.video_status = Report.VideoStatus.REJECTED
            report.save(update_fields=["video_status"])
            return rejected("too_large")
        report.video_status = Report.VideoStatus.PENDING
        report.save(update_fields=["video_status"])
        return Response({"ok": True})


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
