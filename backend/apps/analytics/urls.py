from django.urls import path

from .api import HitView, TrafficView

urlpatterns = [
    path("hit", HitView.as_view(), name="analytics-hit"),
    path("mod/traffic", TrafficView.as_view(), name="mod-traffic"),
]
