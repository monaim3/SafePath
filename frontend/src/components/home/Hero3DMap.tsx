"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import { cellToBoundary, cellToLatLng } from "h3-js";
import { Clock } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Locale } from "@/i18n";
import { fetchMapCells } from "@/lib/api/safety";
import { BAND_COLORS } from "@/lib/safety/bands";
import { DHAKA_CENTER } from "@/lib/safety/demo-data";
import type { CellSummary } from "@/lib/safety/types";
import { cn } from "@/components/ui/cn";
import { HERO_HOURS, type Hotspot } from "./hero-hours";

// Served from /public (see scripts/copy-maplibre-worker.mjs).
if (typeof window !== "undefined") setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type Theme = "light" | "dark";

/** Seconds each hour stays on screen. */
const HOUR_SECONDS = 4.5;

/** Night city (dark) or soft paper (light): only land, water, glowing roads and a few place names. */
const PALETTE: Record<Theme, { bg: string; water: string; park: string; minor: string; major: string; glow: string; label: string; halo: string }> = {
  dark: {
    bg: "#050d1a",
    water: "#0a2440",
    park: "#071a1f",
    minor: "#10294a",
    major: "#2a7fd4",
    glow: "#1a73e8",
    label: "#7f93ad",
    halo: "#050d1a",
  },
  light: {
    bg: "#eef3f8",
    water: "#cfe2f4",
    park: "#e1efe3",
    minor: "#dbe4ee",
    major: "#ffffff",
    glow: "#9cc3ec",
    label: "#6b7f99",
    halo: "#eef3f8",
  },
};

function styleFor(theme: Theme, locale: Locale): StyleSpecification {
  const c = PALETTE[theme];
  const name: ExpressionSpecification = ["coalesce", ["get", locale === "bn" ? "name:bn" : "name:latin"], ["get", "name"]];
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    // Light from the upper left gives the columns a lit face and a shaded face.
    light: { anchor: "viewport", color: "#ffffff", intensity: theme === "dark" ? 0.45 : 0.3, position: [1.4, 200, 35] },
    sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": c.bg } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": c.park } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": c.water } },
      {
        id: "roads-minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
        paint: { "line-color": c.minor, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 2] },
      },
      {
        // soft glow under the main roads
        id: "roads-glow",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: {
          "line-color": c.glow,
          "line-opacity": theme === "dark" ? 0.35 : 0.5,
          "line-blur": 4,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 10],
        },
      },
      {
        id: "roads-major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: { "line-color": c.major, "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 2.5] },
      },
      {
        id: "places",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["suburb", "quarter"]]],
        layout: {
          "text-field": name,
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-max-width": 8,
          "text-pitch-alignment": "viewport",
        },
        paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.2 },
      },
    ],
  };
}

const height = (score: number) => 120 + score * 24;

/** One area's column: its height and colour at each hero hour. */
interface Column {
  h3: string;
  heights: number[];
  colors: string[];
}

/** One hexagonal column per area that has reports at any of the hero hours. */
function columns(byHour: CellSummary[][]): { cols: Column[]; geojson: GeoJSON.FeatureCollection } {
  const byCell = new Map<string, Column>();
  byHour.forEach((cells, i) => {
    for (const c of cells) {
      if (c.insufficient) continue;
      const col = byCell.get(c.h3) ?? {
        h3: c.h3,
        heights: byHour.map(() => 0),
        colors: byHour.map(() => BAND_COLORS.very_low),
      };
      col.heights[i] = c.score > 0 ? height(c.score) : 0;
      col.colors[i] = BAND_COLORS[c.band];
      byCell.set(c.h3, col);
    }
  });
  const cols = [...byCell.values()];
  return {
    cols,
    geojson: {
      type: "FeatureCollection",
      features: cols.map(({ h3 }) => {
        const [lat, lng] = cellToLatLng(h3);
        // Shrunk a little so neighbours read as separate towers.
        const ring = cellToBoundary(h3, true).map(([x, y]) => [lng + (x - lng) * 0.8, lat + (y - lat) * 0.8]);
        return { type: "Feature", properties: { h3 }, geometry: { type: "Polygon", coordinates: [ring] } };
      }),
    },
  };
}

/*
 * Heights and colours live in feature-state, not in the paint expression. Changing a data-driven
 * paint expression makes MapLibre re-tile the source in its worker, which stutters when done every
 * frame; feature-state just updates the values already on the GPU.
 */
const HEIGHT: ExpressionSpecification = ["coalesce", ["feature-state", "h"], 0];
const COLOR: ExpressionSpecification = ["coalesce", ["feature-state", "c"], BAND_COLORS.very_low];

/** Columns part-way from hour `a` to hour `b` (t = 0…1); a = -1 grows them up from the ground. */
function setColumns(map: MapLibreMap, cols: Column[], a: number, b: number, t: number) {
  for (const col of cols) {
    const from = a < 0 ? 0 : col.heights[a];
    const h = from + (col.heights[b] - from) * t;
    // Colours switch halfway, while the columns are mid-move.
    const c = a < 0 || t >= 0.5 ? col.colors[b] : col.colors[a];
    map.setFeatureState({ source: "cols", id: col.h3 }, { h, c });
  }
}

const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Degrees per second the camera circles the city. */
const SPIN = 2.4;
const BASE = { zoom: 11.35, pitch: 58, bearing: -18 };

export function Hero3DMap({
  locale,
  hotspots,
  hourLabels,
  timeTitle,
  className,
  ariaLabel,
}: {
  locale: Locale;
  /** The busiest areas: tagged with their name and score, with a glow under them. */
  hotspots: Hotspot[];
  /** Labels for HERO_HOURS, e.g. "সকাল ৮টা". */
  hourLabels: string[];
  /** Text in the clock chip, e.g. "এই সময়ে". */
  timeTitle: string;
  className?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const shownRef = useRef(-1); // hour index the columns currently show (-1 = not grown yet)
  const colsRef = useRef<Column[]>([]);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [hour, setHour] = useState(0);
  // Auto-play the day unless the visitor asked for less motion (client-only component, so window exists).
  const [auto, setAuto] = useState(() => !prefersReducedMotion());

  // ---------- map, camera and data ----------
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduceMotion = prefersReducedMotion();
    let theme = currentTheme();
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: el,
        style: styleFor(theme, locale),
        center: DHAKA_CENTER,
        ...BASE,
        // Narrow tiles (phones) zoom out so the whole city still fits.
        zoom: Math.max(10.3, BASE.zoom + Math.log2(Math.min(1, el.clientWidth / 760))),
        interactive: false,
        attributionControl: { compact: true }, // OpenStreetMap / OpenFreeMap credit comes from the tile source
        pixelRatio: Math.min(window.devicePixelRatio, 1.5), // cheaper on phones, still sharp
        // Place names fade instead of popping in and out as the camera turns.
        fadeDuration: 400,
      });
    } catch {
      return; // no WebGL: the hero keeps its plain background
    }
    mapRef.current = map;
    const baseZoom = map.getZoom();

    let data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    colsRef.current = [];
    const glow: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: hotspots.map((s) => {
        const [lat, lng] = cellToLatLng(s.h3);
        return { type: "Feature", properties: { color: BAND_COLORS[s.band] }, geometry: { type: "Point", coordinates: [lng, lat] } };
      }),
    };

    const addLayers = () => {
      if (map.getSource("cols")) return;
      map.addSource("glow", { type: "geojson", data: glow });
      map.addSource("cols", { type: "geojson", data, promoteId: "h3" });
      map.addLayer({
        // red bloom on the ground under the worst areas
        id: "glow",
        type: "circle",
        source: "glow",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 40, 13, 120],
          "circle-blur": 1,
          "circle-opacity": theme === "dark" ? 0.55 : 0.35,
          "circle-pitch-alignment": "map",
        },
      });
      map.addLayer({
        id: "cols-base",
        type: "fill",
        source: "cols",
        paint: { "fill-color": COLOR, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "cols",
        type: "fill-extrusion",
        source: "cols",
        paint: {
          "fill-extrusion-color": COLOR,
          "fill-extrusion-height": HEIGHT,
          "fill-extrusion-opacity": 0.94,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      // After a theme switch the style is new, so the columns get their current hour back.
      if (shownRef.current >= 0) setColumns(map, colsRef.current, shownRef.current, shownRef.current, 1);
    };

    map.on("load", () => {
      addLayers();
      setReady(true);
    });
    // Theme switch rebuilds the style; put our layers back once it's loaded.
    map.on("style.load", addLayers);

    Promise.all(HERO_HOURS.map((h) => fetchMapCells({ hour: h, res: 9, period: "all" })))
      .then((byHour) => {
        const built = columns(byHour);
        data = built.geojson;
        colsRef.current = built.cols;
        map.getSource<GeoJSONSource>("cols")?.setData(data);
        setDataReady(true);
      })
      .catch(() => {}); // API down: the city still turns, just without columns

    // ---------- name tags on the busiest areas ----------
    // Phones have room for one tag; neighbouring tags would overlap.
    const tagged = el.clientWidth < 640 ? hotspots.slice(0, 1) : hotspots;
    const markers = tagged.map((s) => {
      const tag = document.createElement("div");
      tag.className = "hero-tag";
      const chip = document.createElement("span");
      chip.className = "hero-tag-chip";
      const dot = document.createElement("i");
      dot.style.background = BAND_COLORS[s.band];
      const label = document.createElement("b");
      label.textContent = s.name;
      const score = document.createElement("em");
      score.textContent = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US").format(s.score);
      chip.append(dot, label, score);
      const stem = document.createElement("span");
      stem.className = "hero-tag-stem";
      tag.append(chip, stem);
      tag.addEventListener("click", (e) => {
        e.stopPropagation();
        router.push(`/${locale}/area/${s.h3}`);
      });
      const [lat, lng] = cellToLatLng(s.h3);
      // Sub-pixel placement: tags glide with the turning camera instead of jumping pixel to pixel.
      return new Marker({ element: tag, anchor: "bottom", subpixelPositioning: true })
        .setLngLat([lng, lat])
        .addTo(map);
    });

    // ---------- camera: slow orbit, lean toward the pointer, tilt with scroll ----------
    let visible = true;
    let raf = 0;
    let last = performance.now();
    let bearing = BASE.bearing;
    const target = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      bearing += SPIN * dt;
      lean.x += (target.x - lean.x) * 0.06;
      lean.y += (target.y - lean.y) * 0.06;
      // 0 at the top of the page → 1 once the hero has scrolled away
      const scroll = Math.min(1, window.scrollY / Math.max(1, el.offsetHeight));
      map.jumpTo({
        bearing: bearing + lean.x * 14,
        pitch: Math.min(75, BASE.pitch - lean.y * 8 + scroll * 14),
        zoom: baseZoom - scroll * 0.5,
      });
      raf = requestAnimationFrame(tick);
    };
    const play = () => {
      if (reduceMotion || raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onPointer = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => Object.assign(target, { x: 0, y: 0 });

    // Clicking a column opens that area (the map itself doesn't pan or zoom).
    const hitAt = (e: MouseEvent) => {
      if (!map.getLayer("cols")) return undefined;
      const r = el.getBoundingClientRect();
      return map.queryRenderedFeatures([e.clientX - r.left, e.clientY - r.top], { layers: ["cols"] })[0];
    };
    const onClick = (e: MouseEvent) => {
      const h3 = hitAt(e)?.properties?.h3;
      if (typeof h3 === "string") router.push(`/${locale}/area/${h3}`);
    };
    const onMove = (e: MouseEvent) => {
      el.style.cursor = hitAt(e) ? "pointer" : "";
    };

    el.addEventListener("pointermove", onPointer);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);
    el.addEventListener("mousemove", onMove);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) play();
      else pause();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVisibility);
    map.once("load", play);

    // Follow the site's theme switch.
    const themeWatch = new MutationObserver(() => {
      const next = currentTheme();
      if (next === theme) return;
      theme = next;
      map.setStyle(styleFor(theme, locale));
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      pause();
      io.disconnect();
      themeWatch.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("pointermove", onPointer);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
      el.removeEventListener("mousemove", onMove);
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
      shownRef.current = -1;
    };
  }, [locale, hotspots, router]);

  // ---------- move the columns to the chosen hour ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !dataReady || !map.getLayer("cols")) return;
    const from = shownRef.current;
    const to = hour;
    if (from === to) return;
    const reduceMotion = prefersReducedMotion();
    let raf = 0;
    const start = performance.now();
    const duration = from < 0 ? 1600 : 1100;
    const step = (now: number) => {
      const t = reduceMotion ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (!map.getSource("cols")) return;
      setColumns(map, colsRef.current, from, to, eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else shownRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      // An interrupted move still ends on the target hour next time.
      shownRef.current = to;
    };
  }, [hour, ready, dataReady]);

  // ---------- cycle through the day until someone picks an hour ----------
  useEffect(() => {
    if (!auto || !dataReady) return;
    const id = window.setInterval(() => setHour((h) => (h + 1) % HERO_HOURS.length), HOUR_SECONDS * 1000);
    return () => window.clearInterval(id);
  }, [auto, dataReady]);

  return (
    <div className={cn(className, "transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
      {/* size, not inset: MapLibre's CSS makes its container position: relative */}
      <div ref={ref} role="img" aria-label={ariaLabel} className="h-full w-full" />

      {/* clock: which hour the columns show; tap to choose */}
      {dataReady && (
        <div className="absolute right-3 top-3 z-10 rounded-2xl border border-line bg-glass p-1.5 shadow-soft backdrop-blur-xl sm:right-4 sm:top-4 sm:p-2 lg:right-8 lg:top-6">
          <p className="hidden items-center gap-1.5 px-1.5 text-[11px] text-ink-3 sm:flex">
            <Clock className="size-3.5" aria-hidden />
            {timeTitle}
          </p>
          <div className="flex gap-1 sm:mt-1.5" role="group" aria-label={timeTitle}>
            {hourLabels.map((label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={hour === i}
                onClick={() => {
                  setAuto(false);
                  setHour(i);
                }}
                className={cn(
                  "relative overflow-hidden rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-xs",
                  hour === i ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2",
                )}
              >
                {label}
                {/* time left on this hour while auto-playing */}
                {auto && hour === i && (
                  <span
                    key={`${hour}-${auto}`}
                    className="hero-clock-bar absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent-ink/40"
                    style={{ animationDuration: `${HOUR_SECONDS}s` }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
