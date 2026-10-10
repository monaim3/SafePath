/**
 * Route risk: walk along a route, look up the reported-activity level of every cell it
 * passes through, and summarise. Pure functions — no UI, no network.
 */
import { latLngToCell } from "h3-js";
import { scoreToBand, type Band } from "./bands";
import { REPORT_RES } from "./grid";

export type TravelMode = "drive" | "walk";
type LngLat = [lng: number, lat: number];

export interface RouteStep {
  name: string;
  distance: number;
  coordinates: LngLat[];
}

export interface RouteOption {
  id: string;
  /** metres */
  distance: number;
  /** seconds */
  duration: number;
  coordinates: LngLat[];
  steps: RouteStep[];
}

export interface RouteSegment {
  coordinates: LngLat[];
  /** null = no reports here (not "safe" — just no data). */
  band: Band | null;
  /** metres */
  length: number;
}

export interface RoadRisk {
  name: string;
  score: number;
  band: Band | null;
  /** metres */
  distance: number;
}

export interface RouteAnalysis {
  segments: RouteSegment[];
  /** Share of the route (0–100) through Elevated or higher cells. */
  exposurePct: number;
  /** Length-weighted average level (0–100), counting no-report stretches as 0. */
  riskIndex: number;
  peakScore: number;
  peakBand: Band | null;
  roads: RoadRisk[];
}

/** Score lookup for a cell at REPORT_RES; undefined when the cell has too few reports to show. */
export type CellLookup = (h3: string) => number | undefined;

const STEP_M = 30;
const ELEVATED = 51;

export function metres(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

interface Piece {
  from: LngLat;
  to: LngLat;
  length: number;
  score: number | undefined;
}

/** Cuts a polyline into ~30 m pieces and scores each by the cell under its midpoint. */
function pieces(coords: readonly LngLat[], lookup: CellLookup): Piece[] {
  const out: Piece[] = [];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = metres(a, b);
    const n = Math.max(1, Math.ceil(len / STEP_M));
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const from: LngLat = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
      const to: LngLat = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const mid: LngLat = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      out.push({ from, to, length: len / n, score: lookup(latLngToCell(mid[1], mid[0], REPORT_RES)) });
    }
  }
  return out;
}

export function analyzeRoute(route: RouteOption, lookup: CellLookup): RouteAnalysis {
  const all = pieces(route.coordinates, lookup);
  const total = all.reduce((s, p) => s + p.length, 0) || 1;

  // Group consecutive pieces with the same band into drawable segments.
  const segments: RouteSegment[] = [];
  for (const p of all) {
    const band = p.score === undefined ? null : scoreToBand(p.score);
    const last = segments[segments.length - 1];
    if (last && last.band === band) {
      last.coordinates.push(p.to);
      last.length += p.length;
    } else {
      segments.push({ band, coordinates: [p.from, p.to], length: p.length });
    }
  }

  const exposed = all.filter((p) => (p.score ?? 0) >= ELEVATED).reduce((s, p) => s + p.length, 0);
  const weighted = all.reduce((s, p) => s + (p.score ?? 0) * p.length, 0);
  const peakScore = Math.max(0, ...all.map((p) => p.score ?? 0));

  // Per named road, in travel order; consecutive steps on the same road are merged.
  const roads: RoadRisk[] = [];
  for (const step of route.steps) {
    if (!step.name || step.coordinates.length < 2) continue;
    const stepPieces = pieces(step.coordinates, lookup);
    const scored = stepPieces.filter((p) => p.score !== undefined);
    const score = scored.length ? Math.max(...scored.map((p) => p.score ?? 0)) : 0;
    const last = roads[roads.length - 1];
    if (last && last.name === step.name) {
      last.distance += step.distance;
      if (score > last.score) {
        last.score = score;
        last.band = scoreToBand(score);
      }
    } else {
      roads.push({ name: step.name, distance: step.distance, score, band: scored.length ? scoreToBand(score) : null });
    }
  }

  return {
    segments,
    exposurePct: Math.round((exposed / total) * 100),
    riskIndex: Math.round(weighted / total),
    peakScore,
    peakBand: peakScore > 0 ? scoreToBand(peakScore) : null,
    roads: roads.filter((r) => r.distance >= 60),
  };
}

/** Index of the route with the least reported activity along it. */
/** A suggested route may take at most this much longer than the fastest one (both limits apply). */
const MAX_EXTRA_SHARE = 0.2;
const MAX_EXTRA_SECONDS = 8 * 60;

/**
 * Index of the route to suggest: the lowest-risk one among routes that aren't a big detour.
 * Without the limit, a route through side lanes far from the main road could win just because
 * nobody has reported anything there yet.
 */
export function lowestRiskIndex(analyses: readonly RouteAnalysis[], routes: readonly RouteOption[]): number {
  const fastest = Math.min(...routes.map((r) => r.duration));
  const limit = Math.min(fastest * (1 + MAX_EXTRA_SHARE), fastest + MAX_EXTRA_SECONDS);
  let best = routes.findIndex((r) => r.duration === fastest);
  analyses.forEach((a, i) => {
    if (routes[i].duration <= limit && a.riskIndex < analyses[best].riskIndex) best = i;
  });
  return best;
}
