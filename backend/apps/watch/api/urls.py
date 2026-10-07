from django.urls import path

from .views import WatchConfigView, WatchLookupView, WatchView

urlpatterns = [
    path("watch", WatchView.as_view(), name="watch"),
    path("watch/config", WatchConfigView.as_view(), name="watch-config"),
    path("watch/lookup", WatchLookupView.as_view(), name="watch-lookup"),
]
