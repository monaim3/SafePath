"use client";

import { useEffect, useRef } from "react";
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import { cellToBoundary } from "h3-js";
import "maplibre-gl/dist/maplibre-gl.css";
import { BAND_COLORS } from "@/lib/safety/bands";
import { DHAKA_CENTER } from "@/lib/safety/demo-data";
import type { CellSummary } from "@/lib/safety/types";

export type Basemap = "map" | "satellite";
type Theme = "light" | "dark";

const VECTOR_STYLES: Record<Theme, string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/** First overlay layer of the satellite style — hexagons are inserted below it. */
const SATELLITE_OVERLAY_START = "roads-minor";

const LABEL_FONT = ["Noto Sans Regular"];
const LABEL_FONT_BOLD = ["Noto Sans Bold"];
const WHITE_LABEL = { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.75)", "text-halo-width": 1.4 };

/**
 * Google-Maps-like hybrid: muted satellite imagery with vector roads, bilingual labels and
 * support-point icons drawn on top (OpenFreeMap / OpenMapTiles schema).
 * Esri World Imagery is free with attribution for light use; production traffic needs an
 * ArcGIS developer account (free tier) — see docs/SAFEPATH_MASTER_PROMPT.md.
 */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
  sources: {
    imagery: {
      type: "raster",
      tiles: [ESRI_IMAGERY],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  },
  layers: [
    {
      id: "imagery",
      type: "raster",
      source: "imagery",
      // Google's hybrid imagery is bright and slightly warm/faded, not darkened.
      paint: { "raster-saturation": -0.12, "raster-brightness-min": 0.05, "raster-brightness-max": 1, "raster-contrast": -0.05 },
    },
    // ---------- roads (Google hybrid palette): faint white lanes, pale-yellow streets, yellow main roads ----------
    {
      id: "roads-minor",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["in", ["get", "class"], ["literal", ["minor", "service"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-opacity": 0.5,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 4],
      },
    },
    {
      id: "roads-mid",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 11,
      filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#fbe5a2",
        "line-opacity": 0.85,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 18, 7],
      },
    },
    {
      id: "roads-major-casing",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#b58a2e",
        "line-opacity": 0.45,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 18, 13],
      },
    },
    {
      id: "roads-major",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#f8d16c",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 18, 10],
      },
    },
    // ---------- labels ----------
    {
      id: "road-names",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      minzoom: 13,
      layout: {
        "symbol-placement": "line",
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-font": LABEL_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 18, 14],
      },
      paint: WHITE_LABEL,
    },
    {
      id: "poi-support",
      type: "symbol",
      source: "omt",
      "source-layer": "poi",
      minzoom: 14,
      filter: ["in", ["get", "class"], ["literal", ["hospital", "police", "pharmacy", "fuel"]]],
      layout: {
        "icon-image": ["get", "class"],
        "icon-size": 1.1,
        "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
        "text-font": LABEL_FONT,
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": ["match", ["get", "class"], "hospital", "#ffb4b4", "police", "#b9d7ff", "#ffffff"],
        "text-halo-color": "rgba(0,0,0,0.8)",
        "text-halo-width": 1.3,
      },
    },
    {
      id: "place-neighbourhood",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 12,
      filter: ["in", ["get", "class"], ["literal", ["suburb", "quarter", "neighbourhood"]]],
      layout: {
        // Google-style bilingual label: UPPERCASE English over Bangla.
        "text-field": [
          "format",
          ["upcase", ["coalesce", ["get", "name:latin"], ["get", "name"]]],
          { "font-scale": 1 },
          "\n",
          {},
          ["coalesce", ["get", "name:bn"], ["get", "name:nonlatin"], ""],
          { "font-scale": 0.95 },
        ],
        "text-font": LABEL_FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
        "text-letter-spacing": 0.06,
      },
      paint: WHITE_LABEL,
    },
    {
      id: "place-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      maxzoom: 14,
      filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      layout: {
        "text-field": [
          "format",
          ["coalesce", ["get", "name:latin"], ["get", "name"]],
          {},
          "\n",
          {},
          ["coalesce", ["get", "name:bn"], ["get", "name:nonlatin"], ""],
          { "font-scale": 0.9 },
        ],
        "text-font": LABEL_FONT_BOLD,
        "text-size": ["interpolate", ["linear"], ["zoom"], 9, 13, 13, 18],
      },
      paint: WHITE_LABEL,
    },
  ],
};

function styleFor(basemap: Basemap, theme: Theme): string | StyleSpecification {
  return basemap === "satellite" ? SATELLITE_STYLE : VECTOR_STYLES[theme];
}

export interface FitTarget {
  bounds: [[number, number], [number, number]];
  /** Changes when a new fit is wanted. */
  key: string;
  padding: { top: number; bottom: number; left: number; right: number };
}

export interface FlyTarget {
  center: [lng: number, lat: number];
  zoom: number;
  /** Changes on every request so the same place can be flown to twice. */
  key: number;
}

interface SafetyMapProps {
  cells?: CellSummary[];
  selected: string | null;
  onSelect?: (h3: string | null) => void;
  /** Free-pick mode (report form): any click reports its coordinates. */
  onPick?: (lngLat: [lng: number, lat: number]) => void;
  flyTo?: FlyTarget | null;
  /** Route lines and start/end points (features carry a `kind` property). */
  overlay?: GeoJSON.FeatureCollection | null;
  fitTo?: FitTarget | null;
  /** Called when the map stops moving (and once on load) with the centre point. */
  onCenterChange?: (lngLat: [lng: number, lat: number]) => void;
  /** Called after each zoom (and once on load) so the caller can pick a grid resolution. */
  onZoomChange?: (zoom: number) => void;
  basemap?: Basemap;
  initialZoom?: number;
  initialCenter?: [lng: number, lat: number];
  interactive?: boolean;
  className?: string;
  ariaLabel: string;
}

// Served from /public (see scripts/copy-maplibre-worker.mjs).
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function cellsToGeoJSON(cells: CellSummary[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells
      .filter((c) => !c.insufficient)
      .map((c) => ({
        type: "Feature",
        properties: { h3: c.h3, color: BAND_COLORS[c.band], lowConfidence: c.confidence === "low" },
        geometry: { type: "Polygon", coordinates: [cellToBoundary(c.h3, true)] },
      })),
  };
}

function selectedToGeoJSON(h3: string | null): GeoJSON.FeatureCollection {
  if (!h3) return EMPTY;
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [cellToBoundary(h3, true)] } },
    ],
  };
}

/** Diagonal stripes drawn over low-confidence cells. */
function hatchImage(): { width: number; height: number; data: Uint8Array } {
  const size = 12;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size < 3) {
        const i = (y * size + x) * 4;
        data.set([255, 255, 255, 190], i);
      }
    }
  }
  return { width: size, height: size, data };
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function SafetyMap({
  cells,
  selected,
  onSelect,
  onPick,
  flyTo,
  overlay,
  fitTo,
  onZoomChange,
  onCenterChange,
  basemap = "map",
  initialZoom = 12,
  initialCenter = DHAKA_CENTER,
  interactive = true,
  className,
  ariaLabel,
}: SafetyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const cellsRef = useRef(cells);
  const selectedRef = useRef(selected);
  const overlayRef = useRef(overlay);
  const basemapRef = useRef(basemap);
  const themeRef = useRef<Theme>("light");
  const handlersRef = useRef({ onSelect, onPick, onZoomChange, onCenterChange });

  useEffect(() => {
    handlersRef.current = { onSelect, onPick, onZoomChange, onCenterChange };
  }, [onSelect, onPick, onZoomChange, onCenterChange]);

  // ---------- init ----------
  useEffect(() => {
    if (!containerRef.current) return;
    themeRef.current = currentTheme();
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleFor(basemapRef.current, themeRef.current),
      center: initialCenter,
      zoom: initialZoom,
      minZoom: 6, // all of Bangladesh fits, so long routes (Dhaka → Bogura) can be shown whole
      maxZoom: 18,
      attributionControl: { compact: true },
      interactive,
    });
    mapRef.current = map;

    if (interactive) {
      map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: false } }), "bottom-right");
    }

    const addLayers = () => {
      const satellite = basemapRef.current === "satellite";
      const dark = !satellite && themeRef.current === "dark";
      if (!map.hasImage("hatch")) map.addImage("hatch", hatchImage(), { pixelRatio: 2 });

      // Keep roads and labels readable above the hexagons.
      const layers = map.getStyle().layers ?? [];
      const beforeId = satellite ? SATELLITE_OVERLAY_START : layers.find((l) => l.type === "symbol")?.id;

      map.addSource("cells", { type: "geojson", data: cellsToGeoJSON(cellsRef.current ?? []) });
      map.addSource("selected", { type: "geojson", data: selectedToGeoJSON(selectedRef.current) });

      map.addLayer(
        {
          id: "cells-fill",
          type: "fill",
          source: "cells",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": satellite
              ? ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 0.5, 17, 0.35]
              : dark
                ? ["interpolate", ["linear"], ["zoom"], 10, 0.42, 14, 0.32, 17, 0.2]
                : ["interpolate", ["linear"], ["zoom"], 10, 0.55, 14, 0.45, 17, 0.3],
          },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: "cells-hatch",
          type: "fill",
          source: "cells",
          filter: ["==", ["get", "lowConfidence"], true],
          paint: { "fill-pattern": "hatch", "fill-opacity": 0.55 },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: "cells-line",
          type: "line",
          source: "cells",
          paint: {
            "line-color": dark ? "#0e0e12" : "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.3, 15, 1.2],
            "line-opacity": satellite ? 0.5 : 0.7,
          },
        },
        beforeId,
      );
      // ---------- route overlay (Google-style: grey alternatives, coloured chosen route) ----------
      map.addSource("route", { type: "geojson", data: overlayRef.current ?? EMPTY });
      const kind = (k: string) => ["==", ["get", "kind"], k] as ["==", ["get", string], string];
      map.addLayer({
        id: "route-alt",
        type: "line",
        source: "route",
        filter: kind("alt"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#9aa4b2", "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 7] },
      });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        filter: kind("casing"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 7, 16, 13] },
      });
      map.addLayer({
        id: "route-seg",
        type: "line",
        source: "route",
        filter: kind("seg"),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4.5, 16, 9] },
      });
      map.addLayer({
        id: "route-start",
        type: "circle",
        source: "route",
        filter: kind("start"),
        paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": "#1a73e8", "circle-stroke-width": 3 },
      });
      map.addLayer({
        id: "route-end",
        type: "circle",
        source: "route",
        filter: kind("end"),
        paint: { "circle-radius": 8, "circle-color": "#e53935", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });

      map.addLayer({
        id: "selected-line",
        type: "line",
        source: "selected",
        paint: {
          "line-color": satellite || dark ? "#ffffff" : "#15151b",
          "line-width": 3,
        },
      });
    };

    map.on("style.load", addLayers);
    map.on("load", () => handlersRef.current.onZoomChange?.(map.getZoom()));
    map.on("zoomend", () => handlersRef.current.onZoomChange?.(map.getZoom()));
    const reportCenter = () => {
      const c = map.getCenter();
      handlersRef.current.onCenterChange?.([c.lng, c.lat]);
    };
    map.on("load", reportCenter);
    map.on("moveend", reportCenter);

    map.on("click", (e) => {
      const { onSelect: select, onPick: pick } = handlersRef.current;
      if (pick) {
        pick([e.lngLat.lng, e.lngLat.lat]);
        return;
      }
      const hit = map.queryRenderedFeatures(e.point, { layers: ["cells-fill"] })[0];
      select?.(typeof hit?.properties?.h3 === "string" ? hit.properties.h3 : null);
    });
    map.on("mousemove", "cells-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "cells-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    // Follow the site theme toggle (only the vector map has light/dark variants).
    const observer = new MutationObserver(() => {
      const next = currentTheme();
      if (next === themeRef.current) return;
      themeRef.current = next;
      if (basemapRef.current === "map") map.setStyle(styleFor("map", next), { diff: false });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Map is created once; later prop changes are pushed via the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- prop updates ----------
  useEffect(() => {
    if (basemapRef.current === basemap) return;
    basemapRef.current = basemap;
    // diff:false forces a clean reload so "style.load" re-adds our layers.
    mapRef.current?.setStyle(styleFor(basemap, themeRef.current), { diff: false });
  }, [basemap]);

  useEffect(() => {
    cellsRef.current = cells;
    const source = mapRef.current?.getSource("cells") as GeoJSONSource | undefined;
    source?.setData(cellsToGeoJSON(cells ?? []));
  }, [cells]);

  useEffect(() => {
    selectedRef.current = selected;
    const source = mapRef.current?.getSource("selected") as GeoJSONSource | undefined;
    source?.setData(selectedToGeoJSON(selected));
  }, [selected]);

  useEffect(() => {
    if (flyTo) mapRef.current?.flyTo({ center: flyTo.center, zoom: flyTo.zoom, speed: 1.4 });
  }, [flyTo]);

  useEffect(() => {
    overlayRef.current = overlay;
    const source = mapRef.current?.getSource("route") as GeoJSONSource | undefined;
    source?.setData(overlay ?? EMPTY);
  }, [overlay]);

  useEffect(() => {
    if (fitTo) mapRef.current?.fitBounds(fitTo.bounds, { padding: fitTo.padding, maxZoom: 16, duration: 900 });
    // Only refit when a new route set arrives (key), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTo?.key]);

  // MapLibre's CSS sets `position: relative` on its container, so layout classes go on a wrapper.
  return (
    <div className={className} role="region" aria-label={ariaLabel}>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
