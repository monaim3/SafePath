from django.urls import path

from .views import (
    DecisionView,
    LoginView,
    LogoutView,
    MeView,
    QueueView,
    ResolveFlagView,
    StatsView,
    VideoDecisionView,
)

urlpatterns = [
    path("login", LoginView.as_view(), name="mod-login"),
    path("logout", LogoutView.as_view(), name="mod-logout"),
    path("me", MeView.as_view(), name="mod-me"),
    path("queue", QueueView.as_view(), name="mod-queue"),
    path("stats", StatsView.as_view(), name="mod-stats"),
    path("reports/<uuid:report_id>/video/<str:decision>", VideoDecisionView.as_view(), name="mod-video-decision"),
    path("reports/<uuid:report_id>/<str:decision>", DecisionView.as_view(), name="mod-decision"),
    path("flags/<uuid:flag_id>/resolve", ResolveFlagView.as_view(), name="mod-flag-resolve"),
]
