/**
 * Safer-route suggestions: spot a high-report area coming up on a route, propose ways around it,
 * and decide whether an alternative is clearly safer without being a big detour.
 * Pure functions — the caller fetches the candidate routes.
 */
import { latLngToCell } from "h3-js";
import { REPORT_RES } from "./grid";
import {
  analyzeRoute,
  maxSuggestedDuration,
  metres,
  type CellLookup,
  type RouteAnalysis,
  type RouteOption,
} from "./route-risk";

type LngLat = [lng: number, lat: number];

/** "High" and above (bands.ts): worth steering around. */
export const AVOID_SCORE = 66;
/** "Very high" (bands.ts): avoiding it is worth up to 8 minutes extra, whatever the trip length. */
const VERY_HIGH_SCORE = 81;
const VERY_HIGH_EXTRA_SECONDS = 8 * 60;
/** How far ahead to look for an area worth avoiding (metres). */
export const LOOK_AHEAD_M = 2000;
/** How far to the side of the risky spot the detour points go (metres). */
const DETOUR_OFFSETS_M = [800, 1600];
const SAMPLE_M = 30;

export interface Hotspot {
  at: LngLat;
  score: number;
  cell: string;
}

/** Index of the route point nearest `position`. */
function nearestIndex(position: LngLat, route: readonly LngLat[]): number {
  let best = 0;
  let bestD = Infinity;
  route.forEach((p, i) => {
    const d = metres(position, p);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The rest of the route from the point nearest `position` (the whole route when position is null). */
export function remainingRoute(position: LngLat | null, route: readonly LngLat[]): LngLat[] {
  if (!position) return [...route];
  const i = nearestIndex(position, route);
  return [position, ...route.slice(i + 1)];
}

/** Length of a polyline, metres. */
export function lineLength(route: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) total += metres(route[i - 1], route[i]);
  return total;
}

/**
 * Areas no route can avoid: right around the destination, and right where the person already is.
 * They're left out when looking for something to steer around — otherwise a trip *to* a high-report
 * area (say Jatrabari) would rule out every alternative.
 */
const UNAVOIDABLE_END_M = 400;
const UNAVOIDABLE_START_M = 200;

/** Score lookups along the route, skipping the unavoidable start and end. */
function avoidableSamples(route: readonly LngLat[], lookup: CellLookup, aheadM: number) {
  const out: Hotspot[] = [];
  const end = route[route.length - 1];
  let travelled = 0;
  for (let i = 1; i < route.length && travelled < aheadM; i++) {
    const [a, b] = [route[i - 1], route[i]];
    const len = metres(a, b);
    const n = Math.max(1, Math.ceil(len / SAMPLE_M));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const p: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (travelled + len * t < UNAVOIDABLE_START_M || metres(p, end) < UNAVOIDABLE_END_M) continue;
      const cell = latLngToCell(p[1], p[0], REPORT_RES);
      const score = lookup(cell);
      if (score !== undefined) out.push({ at: p, score, cell });
    }
    travelled += len;
  }
  return out;
}

/** Highest level met along the way (unavoidable start and end left out); 0 when none. */
export function peakAlongWay(route: readonly LngLat[], lookup: CellLookup): number {
  return Math.max(0, ...avoidableSamples(route, lookup, Infinity).map((s) => s.score));
}

/** The worst high-report spot within `aheadM` along the route that could be avoided, or null. */
export function hotspotAhead(route: readonly LngLat[], lookup: CellLookup, aheadM = LOOK_AHEAD_M): Hotspot | null {
  let found: Hotspot | null = null;
  for (const s of avoidableSamples(route, lookup, aheadM)) {
    if (s.score >= AVOID_SCORE && (!found || s.score > found.score)) found = s;
  }
  return found;
}

/**
 * Points beside the hotspot (left and right of the way in, near and farther out), for detours
 * that skirt it. Main roads in Dhaka often funnel through one crossing, so one distance isn't enough.
 */
export function detourVias(from: LngLat, hot: LngLat, offsetsM: readonly number[] = DETOUR_OFFSETS_M): LngLat[] {
  const toRad = Math.PI / 180;
  const dx = (hot[0] - from[0]) * Math.cos(hot[1] * toRad);
  const dy = hot[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  // unit vector perpendicular to the approach, in metres-per-degree space
  const [px, py] = [-dy / len, dx / len];
  return offsetsM.flatMap((offsetM) => {
    const degLat = offsetM / 111_320;
    return [1, -1].map((side): LngLat => [
      hot[0] + (side * px * degLat) / Math.cos(hot[1] * toRad),
      hot[1] + side * py * degLat,
    ]);
  });
}

export interface SaferChoice {
  route: RouteOption;
  analysis: RouteAnalysis;
  /** Extra travel time versus the current route, seconds (can be ≤ 0). */
  extraSeconds: number;
}

/**
 * The best candidate that is clearly safer than the current way: along the way (ignoring the
 * unavoidable start and end) it stays out of high-report areas — or far below the current peak —
 * with less reported activity overall, and isn't a big detour. Null when nothing qualifies.
 */
export function pickSafer(
  current: { coordinates: readonly LngLat[]; analysis: RouteAnalysis; duration: number },
  candidates: readonly RouteOption[],
  lookup: CellLookup,
): SaferChoice | null {
  const currentPeak = peakAlongWay(current.coordinates, lookup);
  // The worse the area ahead, the longer a way round is worth offering (the person still decides).
  const limit = currentPeak >= VERY_HIGH_SCORE ? current.duration + VERY_HIGH_EXTRA_SECONDS : maxSuggestedDuration(current.duration);
  let best: SaferChoice | null = null;
  let bestPeak = Infinity;
  for (const route of candidates) {
    if (route.duration > limit) continue;
    const analysis = analyzeRoute(route, lookup);
    const peak = peakAlongWay(route.coordinates, lookup);
    const avoids = peak < AVOID_SCORE || peak <= currentPeak - 15;
    if (!avoids || analysis.riskIndex >= current.analysis.riskIndex) continue;
    if (!best || peak < bestPeak || (peak === bestPeak && route.duration < best.route.duration)) {
      best = { route, analysis, extraSeconds: route.duration - current.duration };
      bestPeak = peak;
    }
  }
  return best;
}
