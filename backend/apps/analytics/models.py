"""
Privacy-first visitor counts for moderators. No cookies, no IPs, no third parties: a visitor is a
hash of (daily salt, IP, browser) that changes every day, so nobody can be followed across days.
"""

from django.db import models


class DailyStat(models.Model):
    """One counter per day: e.g. ("visitors", ""), ("views", "/map"), ("device", "phone")."""

    date = models.DateField()
    metric = models.CharField(max_length=16)
    key = models.CharField(max_length=32, blank=True, default="")
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["date", "metric", "key"], name="uniq_daily_stat")]
        indexes = [models.Index(fields=["metric", "date"])]


class VisitorDay(models.Model):
    """Who was already counted today (so a returning visitor isn't counted twice). Kept 2 days."""

    date = models.DateField()
    visitor = models.CharField(max_length=32)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["date", "visitor"], name="uniq_visitor_day")]


class Presence(models.Model):
    """Last sign of life per visitor, for "online now". Kept 1 hour."""

    visitor = models.CharField(max_length=32, unique=True)
    path = models.CharField(max_length=32)
    last_seen = models.DateTimeField(db_index=True)
