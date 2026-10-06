from datetime import timedelta

from django.contrib.auth import authenticate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.services import record
from apps.incidents.models import Report

from ..models import Flag
from ..services import mark_duplicate, reject_report, resolve_flag, verify_report

REJECT_REASONS = {"fake", "wrong_place", "spam", "offensive", "other"}


class QueueReportSerializer(serializers.ModelSerializer):
    reporter_trust = serializers.FloatField(source="device.trust")
    reporter_reports = serializers.IntegerField(source="device.reports_count")
    reporter_rejected = serializers.IntegerField(source="device.rejected_count")

    class Meta:
        model = Report
        fields = [
            "id", "kind", "category", "h3", "date", "block", "hour", "days", "relation", "description",
            "status", "flags", "corroborations", "weight", "is_demo", "created_at",
            "reporter_trust", "reporter_reports", "reporter_rejected",
        ]


class FlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flag
        fields = ["id", "reason", "report", "h3", "details", "status", "created_at"]


# ---------- auth ----------
class LoginView(APIView):
    """POST /api/v1/mod/login {username, password} → {token}. Staff only, 5 attempts/min per IP."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mod_login"

    def post(self, request: Request) -> Response:
        user = authenticate(
            request, username=str(request.data.get("username", "")), password=str(request.data.get("password", ""))
        )
        if user is None or not user.is_staff:
            # Same answer for "no such user", "wrong password" and "not a moderator".
            return Response({"error": "invalid_credentials"}, status=400)
        token, _ = Token.objects.get_or_create(user=user)
        record(action="mod.login", entity_type="user", entity_id=user.pk, actor=user)
        return Response({"token": token.key, "username": user.get_username()})


class LogoutView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request: Request) -> Response:
        Token.objects.filter(user=request.user).delete()
        return Response({"ok": True})


class MeView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request: Request) -> Response:
        return Response({"username": request.user.get_username()})


# ---------- queue & stats ----------
class QueueView(APIView):
    """GET /api/v1/mod/queue — flagged first, then other pending reports, plus open area alerts."""

    permission_classes = [IsAdminUser]

    def get(self, request: Request) -> Response:
        pending = Report.objects.select_related("device").filter(status=Report.Status.PENDING).order_by("-created_at")
        flagged = [r for r in pending if r.flags][:100]
        others = [r for r in pending if not r.flags][:100]
        return Response(
            {
                "flags": FlagSerializer(
                    Flag.objects.filter(status=Flag.Status.OPEN, report__isnull=True)[:100], many=True
                ).data,
                "flagged": QueueReportSerializer(flagged, many=True).data,
                "pending": QueueReportSerializer(others, many=True).data,
            }
        )


class StatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request: Request) -> Response:
        since = timezone.now() - timedelta(days=1)
        reports = Report.objects.all()
        return Response(
            {
                "pending": reports.filter(status=Report.Status.PENDING).count(),
                "flagged": reports.filter(status=Report.Status.PENDING).exclude(flags=[]).count(),
                "areaAlerts": Flag.objects.filter(status=Flag.Status.OPEN, report__isnull=True).count(),
                "today": reports.filter(created_at__gte=since).count(),
                "verified": reports.filter(status=Report.Status.VERIFIED).count(),
                "rejected": reports.filter(status=Report.Status.REJECTED).count(),
            }
        )


# ---------- decisions ----------
class DecisionView(APIView):
    """POST /api/v1/mod/reports/<id>/<verify|reject|duplicate>. Audit-logged."""

    permission_classes = [IsAdminUser]

    def post(self, request: Request, report_id, decision: str) -> Response:
        report = get_object_or_404(Report.objects.select_related("device"), pk=report_id)
        if report.status != Report.Status.PENDING:
            return Response({"error": "already_decided"}, status=409)
        if decision == "verify":
            verify_report(report, actor=request.user)
        elif decision == "reject":
            reason = str(request.data.get("reason", ""))
            if reason not in REJECT_REASONS:
                return Response({"error": "invalid_reason"}, status=400)
            reject_report(report, actor=request.user, reason=reason)
        elif decision == "duplicate":
            mark_duplicate(report, actor=request.user)
        else:
            return Response({"error": "unknown_decision"}, status=400)
        return Response(QueueReportSerializer(report).data)


class ResolveFlagView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request: Request, flag_id) -> Response:
        flag = resolve_flag(get_object_or_404(Flag, pk=flag_id), actor=request.user)
        return Response(FlagSerializer(flag).data)
