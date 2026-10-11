import re

import h3
from rest_framework import serializers

from ..models import Report
from ..services import video

PHONE = re.compile(r"(?:\+?88)?0?1[3-9]\d{2}[\s-]?\d{6}")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
LONG_DIGITS = re.compile(r"\b\d{10,17}\b")
REPORT_RES = 10


def redact(text: str) -> str:
    """Server-side redaction — never trust the client to have done it."""
    return LONG_DIGITS.sub("[removed]", PHONE.sub("[removed]", EMAIL.sub("[removed]", text)))


class ReportInputSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Report.Kind.choices)
    category = serializers.ChoiceField(choices=Report.CATEGORY_CHOICES)
    h3 = serializers.CharField(max_length=16)
    when = serializers.ChoiceField(choices=["just_now", "today", "yesterday", "other"], required=False)
    date = serializers.DateField(required=False)
    block = serializers.IntegerField(min_value=0, max_value=7)
    hour = serializers.IntegerField(min_value=0, max_value=23, required=False)
    days = serializers.ChoiceField(choices=["every_day", "weekdays", "weekends"], required=False)
    relation = serializers.ChoiceField(choices=["experienced", "witnessed", "heard"], required=False)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    # The exact pin and the place name shown under it. Optional; for moderators only.
    lat = serializers.FloatField(required=False, min_value=-90, max_value=90)
    lng = serializers.FloatField(required=False, min_value=-180, max_value=180)
    place_label = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    # The reporter has footage to upload; the response then carries a signed upload ticket.
    has_video = serializers.BooleanField(required=False, default=False)
    # Or a link to footage hosted elsewhere (too large to upload). Reviewed the same way.
    video_link = serializers.URLField(max_length=500, required=False, allow_blank=True, default="")

    # Not stored: used only for checks.
    device_id = serializers.CharField(min_length=16, max_length=64)
    turnstile_token = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_h3(self, value: str) -> str:
        if not h3.is_valid_cell(value) or h3.get_resolution(value) != REPORT_RES:
            raise serializers.ValidationError("invalid location")
        return value

    def validate_description(self, value: str) -> str:
        return redact(value.strip())

    def validate_place_label(self, value: str) -> str:
        return redact(" ".join(value.split()))

    def validate_video_link(self, value: str) -> str:
        value = value.strip()
        if value and video.link_host(value) is None:
            raise serializers.ValidationError("unsupported host")
        return value

    def validate(self, attrs):
        positive = attrs["category"] in Report.POSITIVE_CATEGORIES
        if positive != (attrs["kind"] == Report.Kind.POSITIVE):
            raise serializers.ValidationError({"category": "does not match kind"})
        if attrs["kind"] == Report.Kind.INCIDENT and (not attrs.get("when") or not attrs.get("date")):
            raise serializers.ValidationError({"date": "required for incidents"})
        if "hour" in attrs and attrs["hour"] // 3 != attrs["block"]:
            raise serializers.ValidationError({"hour": "does not match block"})
        if attrs.get("has_video") and attrs.get("video_link"):
            raise serializers.ValidationError({"video_link": "upload a file or give a link, not both"})
        # The exact pin is kept only if it really lies in the reported cell; otherwise it's dropped
        # (with its label), and the report still goes through on the cell alone.
        lat, lng = attrs.pop("lat", None), attrs.pop("lng", None)
        if lat is not None and lng is not None and h3.latlng_to_cell(lat, lng, REPORT_RES) == attrs["h3"]:
            attrs["exact_lat"], attrs["exact_lng"] = round(lat, 6), round(lng, 6)
        else:
            attrs["place_label"] = ""
        return attrs


class ConfirmSerializer(serializers.Serializer):
    device_id = serializers.CharField(min_length=16, max_length=64)


class VideoAttachSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=128)
