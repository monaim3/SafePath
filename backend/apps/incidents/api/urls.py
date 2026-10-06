from django.urls import path

from .map_views import AreaView, MapCellsView, TimeProfileView, TopAreasView
from .views import ConfirmView, ReportCreateView

urlpatterns = [
    path("reports", ReportCreateView.as_view(), name="report-create"),
    path("knowledge/<uuid:report_id>/confirm", ConfirmView.as_view(), name="knowledge-confirm"),
    path("map/cells", MapCellsView.as_view(), name="map-cells"),
    path("map/time-profile", TimeProfileView.as_view(), name="map-time-profile"),
    path("areas", TopAreasView.as_view(), name="areas-top"),
    path("areas/<str:cell>", AreaView.as_view(), name="area-detail"),
]
