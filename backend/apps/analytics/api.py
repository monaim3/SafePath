from rest_framework import serializers, status
from rest_framework.permissions import IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.incidents.api.views import client_ip

from . import services


class HitSerializer(serializers.Serializer):
    path = serializers.CharField(max_length=200)
    kind = serializers.ChoiceField(choices=["view", "ping"])
    app = serializers.BooleanField(required=False, default=False)  # opened as the installed app


class HitView(APIView):
    """POST /api/v1/hit — anonymous page view / still-here ping. Always 204, stores no identifiers."""

    authentication_classes: list = []
    permission_classes: list = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "hit"

    def post(self, request: Request) -> Response:
        data = HitSerializer(data=request.data)
        if data.is_valid():
            services.record(
                path=data.validated_data["path"],
                kind=data.validated_data["kind"],
                installed=data.validated_data["app"],
                ip=client_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:400],
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrafficView(APIView):
    """GET /api/v1/mod/traffic — visitors, page views and who's online, for moderators."""

    permission_classes = [IsAdminUser]

    def get(self, request: Request) -> Response:
        return Response(services.summary())
