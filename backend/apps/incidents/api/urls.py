from django.urls import path

from .map_views import AreaNewsView, AreaVideosView, AreaView, MapCellsView, StreetDayView, TimeProfileView, TopAreasView
from .views import ConfirmView, ReportCreateView, TrackView, VideoAttachView, WithdrawView

urlpatterns = [
    path("reports", ReportCreateView.as_view(), name="report-create"),
    path("track", TrackView.as_view(), name="track"),
    path("track/withdraw", WithdrawView.as_view(), name="track-withdraw"),
    path("reports/<uuid:report_id>/video", VideoAttachView.as_view(), name="report-video"),
    path("knowledge/<uuid:report_id>/confirm", ConfirmView.as_view(), name="knowledge-confirm"),
    path("map/cells", MapCellsView.as_view(), name="map-cells"),
    path("map/time-profile", TimeProfileView.as_view(), name="map-time-profile"),
    path("map/street-day", StreetDayView.as_view(), name="map-street-day"),
    path("areas", TopAreasView.as_view(), name="areas-top"),
    path("areas/<str:cell>/videos", AreaVideosView.as_view(), name="area-videos"),
    path("areas/<str:cell>/news", AreaNewsView.as_view(), name="area-news"),
    path("areas/<str:cell>", AreaView.as_view(), name="area-detail"),
]
