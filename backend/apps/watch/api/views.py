import h3
from django.conf import settings
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .. import services


class KeysSerializer(serializers.Serializer):
    p256dh = serializers.CharField(max_length=200)
    auth = serializers.CharField(max_length=100)


class SubscriptionSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=1024)
    keys = KeysSerializer()

    def validate_endpoint(self, value: str) -> str:
        if not services.endpoint_allowed(value):
            raise serializers.ValidationError("unsupported push service")
        return value


class WatchSerializer(serializers.Serializer):
    subscription = SubscriptionSerializer()
    areas = serializers.ListField(child=serializers.CharField(max_length=16), max_length=services.MAX_AREAS)
    locale = serializers.ChoiceField(choices=["bn", "en"], default="bn")

    def validate_areas(self, value: list[str]) -> list[str]:
        cells = []
        for cell in value:
            if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in (8, 9, 10):
                raise serializers.ValidationError("invalid area")
            cells.append(services.watch_cell_for(cell))
        return list(dict.fromkeys(cells))  # de-duplicate, keep order


class LookupSerializer(serializers.Serializer):
    endpoint = serializers.CharField(max_length=1024)


class WatchConfigView(APIView):
    """GET /api/v1/watch/config — public VAPID key; `enabled` false when push isn't set up."""

    def get(self, request: Request) -> Response:
        return Response(
            {"enabled": services.enabled(), "publicKey": settings.VAPID_PUBLIC_KEY, "maxAreas": services.MAX_AREAS}
        )


class WatchView(APIView):
    """POST /api/v1/watch {subscription, areas, locale} — replaces this browser's followed areas."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "watch"

    def post(self, request: Request) -> Response:
        if not services.enabled():
            return Response({"error": "unavailable"}, status=503)
        s = WatchSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        sub = s.validated_data["subscription"]
        areas = services.save_watch(
            endpoint=sub["endpoint"],
            p256dh=sub["keys"]["p256dh"],
            auth=sub["keys"]["auth"],
            areas=s.validated_data["areas"],
            locale=s.validated_data["locale"],
        )
        return Response({"areas": areas})


class WatchLookupView(APIView):
    """POST /api/v1/watch/lookup {endpoint} — areas this browser follows (POST keeps the endpoint out of URLs/logs)."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "watch"

    def post(self, request: Request) -> Response:
        s = LookupSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response({"areas": services.areas_for(s.validated_data["endpoint"])})
