"""Public read endpoints for the map, area pages and home page. Aggregated data only."""

import h3
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..selectors import approved_videos, cached, has_demo_data, load_rows, news_sources, report_cells_for
from ..services import aggregation

ALLOWED_RES = {8, 9, 10}


def _parse_hour(raw: str | None) -> int | None:
    if raw in (None, "", "all"):
        return None
    hour = int(raw)
    if not 0 <= hour <= 23:
        raise ValueError
    return hour


class MapCellsView(APIView):
    """GET /api/v1/map/cells?res=8|9|10&hour=0-23|all"""

    def get(self, request: Request) -> Response:
        try:
            res = int(request.query_params.get("res", "9"))
            hour = _parse_hour(request.query_params.get("hour"))
        except ValueError:
            return Response({"error": "invalid_params"}, status=400)
        if res not in ALLOWED_RES:
            return Response({"error": "invalid_params"}, status=400)

        def compute():
            now = timezone.now()
            groups = aggregation.group_by_cell(load_rows(), res)
            return [
                aggregation.cell_summary(cell, rows, now, hour)
                for cell, rows in groups.items()
                if aggregation.is_public(rows)
            ]

        return Response({"cells": cached(f"cells:{res}:{hour}", compute), "demo": has_demo_data()})


class TimeProfileView(APIView):
    """GET /api/v1/map/time-profile — city-wide activity per hour (24 values)."""

    def get(self, request: Request) -> Response:
        profile = cached("profile", lambda: aggregation.city_time_profile(load_rows(), timezone.now()))
        return Response({"hours": profile})


class AreaView(APIView):
    """GET /api/v1/areas/<h3> — details for one cell (resolution 8–10)."""

    def get(self, request: Request, cell: str) -> Response:
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in ALLOWED_RES:
            return Response({"error": "not_found"}, status=404)

        def compute():
            rows = load_rows(report_cells_for(cell))
            return aggregation.area_detail(cell, rows, timezone.now(), is_demo=has_demo_data())

        return Response(cached(f"area:{cell}", compute))


class AreaVideosView(APIView):
    """GET /api/v1/areas/<h3>/videos — moderator-approved footage from this area, newest first."""

    def get(self, request: Request, cell: str) -> Response:
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in ALLOWED_RES:
            return Response({"error": "not_found"}, status=404)
        return Response({"videos": cached(f"videos:{cell}", lambda: approved_videos(report_cells_for(cell)))})


class AreaNewsView(APIView):
    """GET /api/v1/areas/<h3>/news — published news reports counted in this area, with links."""

    def get(self, request: Request, cell: str) -> Response:
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in ALLOWED_RES:
            return Response({"error": "not_found"}, status=404)
        return Response({"news": cached(f"news:{cell}", lambda: news_sources(report_cells_for(cell)))})


class TopAreasView(APIView):
    """GET /api/v1/areas?limit=N — most active neighbourhood-size areas (resolution 9)."""

    def get(self, request: Request) -> Response:
        try:
            limit = max(1, min(20, int(request.query_params.get("limit", "5"))))
        except ValueError:
            return Response({"error": "invalid_params"}, status=400)

        def compute():
            now = timezone.now()
            groups = aggregation.group_by_cell(load_rows(), 9)
            demo = has_demo_data()
            areas = [
                aggregation.area_detail(cell, rows, now, is_demo=demo)
                for cell, rows in groups.items()
                if aggregation.is_public(rows)
            ]
            return sorted(areas, key=lambda a: -a["score"])[:20]

        return Response({"areas": cached("top", compute)[:limit]})
