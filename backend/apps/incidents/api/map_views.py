"""Public read endpoints for the map, area pages and home page. Aggregated data only."""

import h3
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from ..selectors import approved_videos, cached, has_demo_data, load_rows, news_sources, report_cells_for
from ..services import aggregation

ALLOWED_RES = {8, 9, 10}
# ?period= on map endpoints: last 30 / 90 days, or everything still counted ("all", the default).
PERIODS = {"30": 30, "90": 90, "all": None}


def _parse_hour(raw: str | None) -> int | None:
    if raw in (None, "", "all"):
        return None
    hour = int(raw)
    if not 0 <= hour <= 23:
        raise ValueError
    return hour


def _parse_period(request: Request) -> int | None:
    raw = request.query_params.get("period", "all") or "all"
    if raw not in PERIODS:
        raise ValueError
    return PERIODS[raw]


class MapCellsView(APIView):
    """GET /api/v1/map/cells?res=8|9|10&hour=0-23|all&period=30|90|all"""

    def get(self, request: Request) -> Response:
        try:
            res = int(request.query_params.get("res", "9"))
            hour = _parse_hour(request.query_params.get("hour"))
            period = _parse_period(request)
        except ValueError:
            return Response({"error": "invalid_params"}, status=400)
        if res not in ALLOWED_RES:
            return Response({"error": "invalid_params"}, status=400)

        def compute():
            now = timezone.now()
            groups = aggregation.group_by_cell(load_rows(period_days=period), res)
            return [
                aggregation.cell_summary(cell, rows, now, hour)
                for cell, rows in groups.items()
                if aggregation.is_public(rows)
            ]

        return Response({"cells": cached(f"cells:{res}:{hour}:{period}", compute), "demo": has_demo_data()})


class TimeProfileView(APIView):
    """GET /api/v1/map/time-profile?period=30|90|all — city-wide activity per hour (24 values)."""

    def get(self, request: Request) -> Response:
        try:
            period = _parse_period(request)
        except ValueError:
            return Response({"error": "invalid_params"}, status=400)
        profile = cached(
            f"profile:{period}", lambda: aggregation.city_time_profile(load_rows(period_days=period), timezone.now())
        )
        return Response({"hours": profile})


class AreaView(APIView):
    """GET /api/v1/areas/<h3>?period=30|90|all — details for one cell (resolution 8–10)."""

    def get(self, request: Request, cell: str) -> Response:
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in ALLOWED_RES:
            return Response({"error": "not_found"}, status=404)
        try:
            period = _parse_period(request)
        except ValueError:
            return Response({"error": "invalid_params"}, status=400)

        def compute():
            rows = load_rows(report_cells_for(cell), period_days=period)
            return aggregation.area_detail(cell, rows, timezone.now(), is_demo=has_demo_data())

        return Response(cached(f"area:{cell}:{period}", compute))


class AreaVideosView(APIView):
    """GET /api/v1/areas/<h3>/videos — moderator-approved footage from this area, newest first."""

    def get(self, request: Request, cell: str) -> Response:
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in ALLOWED_RES:
            return Response({"error": "not_found"}, status=404)
        return Response({"videos": cached(f"videos:{cell}", lambda: approved_videos(report_cells_for(cell)))})


class AreaNewsView(APIView):
    """GET /api/v1/areas/<h3>/news?period=30|90|all — published news reports counted in this area, with links."""

    def get(self, request: Request, cell: str) -> Response:
        if not h3.is_valid_cell(cell) or h3.get_resolution(cell) not in ALLOWED_RES:
            return Response({"error": "not_found"}, status=404)
        try:
            period = _parse_period(request)
        except ValueError:
            return Response({"error": "invalid_params"}, status=400)
        return Response(
            {"news": cached(f"news:{cell}:{period}", lambda: news_sources(report_cells_for(cell), period_days=period))}
        )


class TopAreasView(APIView):
    """GET /api/v1/areas?limit=N — most active neighbourhood-size areas (resolution 9), all time."""

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
