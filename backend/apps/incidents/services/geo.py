"""
Is a report location inside Bangladesh?

The outline is geoBoundaries' simplified Bangladesh border (CC0, public domain), stored in
data/bangladesh_outline.json. The frontend keeps a copy of the same file to warn early; this
server check is the one that counts.
"""

import json
from functools import lru_cache
from pathlib import Path

import h3

OUTLINE = Path(__file__).resolve().parents[3] / "data" / "bangladesh_outline.json"


@lru_cache(maxsize=1)
def _polygons() -> list[list[tuple[float, float]]]:
    data = json.loads(OUTLINE.read_text(encoding="utf-8"))
    return [[(lng, lat) for lng, lat in ring] for ring in data["polygons"]]


def _inside_ring(lng: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    """Ray casting: count how many edges a ray going east from the point crosses."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_bangladesh(lat: float, lng: float) -> bool:
    return any(_inside_ring(lng, lat, ring) for ring in _polygons())


def cell_in_bangladesh(cell: str) -> bool:
    """
    The cell's centre or any corner inside the border. The corners give ~70 m of slack, so a spot
    right on the border (or a river bank the simplified outline cuts off) is still accepted.
    """
    points = [h3.cell_to_latlng(cell), *h3.cell_to_boundary(cell)]
    return any(point_in_bangladesh(lat, lng) for lat, lng in points)
