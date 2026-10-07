from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.incidents.api.urls")),
    path("api/v1/mod/", include("apps.moderation.api.urls")),
    path("api/v1/", include("apps.watch.api.urls")),
]
