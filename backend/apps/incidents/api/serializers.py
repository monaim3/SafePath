import re

import h3
from rest_framework import serializers

from ..models import Report

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

    # Not stored: used only for checks.
    device_id = serializers.CharField(min_length=16, max_length=64)
    turnstile_token = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_h3(self, value: str) -> str:
        if not h3.is_valid_cell(value) or h3.get_resolution(value) != REPORT_RES:
            raise serializers.ValidationError("invalid location")
        return value

    def validate_description(self, value: str) -> str:
        return redact(value.strip())

    def validate(self, attrs):
        positive = attrs["category"] in Report.POSITIVE_CATEGORIES
        if positive != (attrs["kind"] == Report.Kind.POSITIVE):
            raise serializers.ValidationError({"category": "does not match kind"})
        if attrs["kind"] == Report.Kind.INCIDENT and (not attrs.get("when") or not attrs.get("date")):
            raise serializers.ValidationError({"date": "required for incidents"})
        if "hour" in attrs and attrs["hour"] // 3 != attrs["block"]:
            raise serializers.ValidationError({"hour": "does not match block"})
        return attrs


class ConfirmSerializer(serializers.Serializer):
    device_id = serializers.CharField(min_length=16, max_length=64)
