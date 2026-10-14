/**
 * Trip alerts: while someone travels, find higher-report areas just ahead of them.
 * Pure functions — no GPS, no audio, no network. Location never leaves the device.
 */
import { cellToLatLng, gridDisk, latLngToCell } from "h3-js";
import { scoreToBand, type Band } from "./bands";
import { REPORT_RES } from "./grid";
import { metres, type CellLookup } from "./route-risk";

type LngLat = [lng: number, lat: number];

/** Only these levels are announced; anything lower stays quiet. */
export const ALERT_BANDS: ReadonlySet<Band> = new Set<Band>(["high", "very_high"]);

/** How far ahead along the route to look (metres) — enough time to put a phone away. */
export const LOOKAHEAD_M = 200;
/** Farther than this from the route = off-route: look around the person instead. */
const OFF_ROUTE_M = 80;
/** Route checked every this many metres: coarser steps noticed an area's edge late (a 200 m warning came at 180 m). */
const SAMPLE_M = 10;

/** Within this distance of the route's end (metres, allowing for GPS drift) the trip is over. */
export const ARRIVE_M = 60;
/** Arrival only counts after the person has been at least this far from the end, so a trip
 *  started right at the destination doesn't end at once. */
const DEPART_M = 150;

/**
 * Tracks one trip's progress toward its destination. Feed it every GPS fix; it returns true
 * once the person has set off and then come within ARRIVE_M of the route's last point.
 */
export function arrivalWatcher(route: readonly LngLat[]) {
  const end = route[route.length - 1];
  let departed = false;
  return (position: LngLat): boolean => {
    const d = metres(position, end);
    if (d > DEPART_M) departed = true;
    return departed && d <= ARRIVE_M;
  };
}

/** Compass direction from a to b, in degrees (0 = north, 90 = east). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180;
  const [lat1, lat2] = [a[1] * toRad, b[1] * toRad];
  const dLng = (b[0] - a[0]) * toRad;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) / toRad) + 360) % 360;
}

/**
 * The part of the route already travelled: from the start up to the point on the route nearest
 * the person. Null when they are off the route (then nothing is greyed out).
 */
export function travelledPart(position: LngLat, route: readonly LngLat[]): LngLat[] | null {
  if (route.length < 2) return null;
  let nearest = 0;
  let best = Infinity;
  route.forEach((p, i) => {
    const d = metres(position, p);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  if (best > OFF_ROUTE_M || nearest === 0) return null;
  return route.slice(0, nearest + 1);
}

/** Farther than this from the route, the trip says "you're off the route" and shows the way back. */
const APPROACH_M = 120;

/**
 * When the person is clearly off the route (e.g. the trip started away from its first point),
 * the nearest point of the route to head for; null while they're on it.
 */
export function routeJoinPoint(position: LngLat, route: readonly LngLat[]): LngLat | null {
  if (route.length < 2) return null;
  let nearest = route[0];
  let best = Infinity;
  for (const p of route) {
    const d = metres(position, p);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return best > APPROACH_M ? nearest : null;
}

export interface TripAlert {
  cell: string;
  score: number;
  band: Band;
}

export function cellAt([lng, lat]: LngLat): string {
  return latLngToCell(lat, lng, REPORT_RES);
}

/**
 * The alert-level area the person is standing in right now, or null. Takes the higher of the
 * scores given (e.g. this hour and the whole day), so it agrees with whichever the map shows.
 */
export function insideAlert(position: LngLat, lookups: readonly (CellLookup | null)[]): TripAlert | null {
  const cell = cellAt(position);
  const scores = lookups.map((l) => l?.(cell)).filter((s): s is number => s !== undefined);
  if (scores.length === 0) return null;
  const score = Math.max(...scores);
  const band = scoreToBand(score);
  return ALERT_BANDS.has(band) ? { cell, score, band } : null;
}

/**
 * Cells the person will reach soon: along the route ahead, or when off-route a ring of about 250 m
 * (or ~130 m for the closer warning). GPS in a moving vehicle often drifts off the line.
 */
export function cellsAhead(position: LngLat, route: readonly LngLat[] | null, aheadM = LOOKAHEAD_M): string[] {
  // One step extra: check points don't fall exactly on the limit, so without it an area starting at
  // 200 m could first be noticed a step later.
  const samples = samplesAhead(position, route, aheadM + SAMPLE_M);
  if (samples) return [...new Set([cellAt(position), ...samples.map((s) => s.cell)])];
  return gridDisk(cellAt(position), aheadM > 150 ? 2 : 1);
}

/**
 * Points every SAMPLE_M along the route ahead, up to `aheadM`, with their cell and distance from
 * the person along the route; null when the person is off the route.
 */
function samplesAhead(position: LngLat, route: readonly LngLat[] | null, aheadM: number): { cell: string; at: number }[] | null {
  if (!route || route.length < 2) return null;
  let nearest = 0;
  let best = Infinity;
  route.forEach((p, i) => {
    const d = metres(position, p);
    if (d < best) {
      best = d;
      nearest = i;
    }
  });
  if (best > OFF_ROUTE_M) return null;
  // Distances count from the person, not from the nearest route point (which may be ~10 m behind
  // or ahead): how far along the next stretch they already are, negative if before its start.
  const passed = nearest < route.length - 1 ? alongSegment(position, route[nearest], route[nearest + 1]) : 0;
  const samples: { cell: string; at: number }[] = [];
  let travelled = 0;
  for (let i = nearest; i < route.length - 1 && travelled - passed < aheadM; i++) {
    const [a, b] = [route[i], route[i + 1]];
    const len = metres(a, b);
    const n = Math.max(1, Math.ceil(len / SAMPLE_M));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const at = travelled + len * t - passed;
      if (at > aheadM) break;
      if (at > 0) samples.push({ cell: cellAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), at });
    }
    travelled += len;
  }
  return samples;
}

/** Metres from `a` to where `p` falls on the line a→b (negative when before `a`); flat-earth, fine at street scale. */
function alongSegment(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  const ky = 110_574;
  const [bx, by] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * ky];
  const [px, py] = [(p[0] - a[0]) * kx, (p[1] - a[1]) * ky];
  const len = Math.hypot(bx, by);
  return len === 0 ? 0 : (px * bx + py * by) / len;
}

/** Half the width of a street-level area: its centre is about this far inside its edge. */
const CELL_HALF_M = 60;

/**
 * The nearest alert-level area ahead within `aheadM`, and roughly how many metres until it starts
 * (along the route; straight-line when off the route). For the live "area ahead" status line —
 * unlike the spoken warnings it is not limited to once per area.
 */
export function dangerAhead(
  position: LngLat,
  route: readonly LngLat[] | null,
  lookup: CellLookup,
  // A little past the spoken warning's 200 m, so the line already shows when that warning plays.
  aheadM = LOOKAHEAD_M + 30,
): (TripAlert & { metres: number }) | null {
  const here = cellAt(position);
  const level = (cell: string) => {
    const score = lookup(cell);
    if (score === undefined) return null;
    const band = scoreToBand(score);
    return ALERT_BANDS.has(band) ? { cell, score, band } : null;
  };
  const samples = samplesAhead(position, route, aheadM);
  if (samples) {
    for (const s of samples) {
      if (s.cell === here) continue; // standing in it: that's the "inside" message
      const hit = level(s.cell);
      if (hit) return { ...hit, metres: Math.max(0, Math.round(s.at)) };
    }
    return null;
  }
  let found: (TripAlert & { metres: number }) | null = null;
  for (const cell of gridDisk(here, aheadM > 150 ? 2 : 1)) {
    if (cell === here) continue;
    const hit = level(cell);
    if (!hit) continue;
    const [lat, lng] = cellToLatLng(cell);
    const d = Math.max(0, Math.round(metres(position, [lng, lat]) - CELL_HALF_M));
    if (d <= aheadM && (!found || d < found.metres)) found = { ...hit, metres: d };
  }
  return found;
}

/** The highest-level alert among `cells` not yet announced, or null when nothing needs saying. */
export function nextAlert(cells: readonly string[], lookup: CellLookup, announced: ReadonlySet<string>): TripAlert | null {
  let found: TripAlert | null = null;
  for (const cell of cells) {
    if (announced.has(cell)) continue;
    const score = lookup(cell);
    if (score === undefined) continue;
    const band = scoreToBand(score);
    if (ALERT_BANDS.has(band) && (!found || score > found.score)) found = { cell, score, band };
  }
  return found;
}

/** The second, closer warning about an area ahead (the first comes at LOOKAHEAD_M, ~200 m). */
export const NEAR_M = 100;
/** The closer warning may follow the first this soon: long enough for the first to finish playing. */
export const NEAR_GAP_MS = 6_000;
/** Between warnings about different areas. */
export const COOLDOWN_MS = 30_000;

/**
 * Which warning to give now, if any. Each area ahead is announced twice: about 200 m before
 * ("far"), then again about 100 m before ("near"). The near one is checked first, since at driving
 * speed it may follow the far one within seconds; an area first noticed already that close
 * (trip started nearby, GPS jumped) is announced once, not twice. Updates the two sets.
 */
export function pickAheadAlert(
  position: LngLat,
  route: readonly LngLat[] | null,
  lookup: CellLookup,
  said: { far: Set<string>; near: Set<string> },
  msSinceLast: number,
): (TripAlert & { stage: "far" | "near" }) | null {
  const near = nextAlert(cellsAhead(position, route, NEAR_M), lookup, said.near);
  if (near && msSinceLast >= NEAR_GAP_MS) {
    for (const c of quietZone(near.cell)) {
      said.near.add(c);
      said.far.add(c);
    }
    return { ...near, stage: "near" };
  }
  const far = nextAlert(cellsAhead(position, route), lookup, said.far);
  if (!far || msSinceLast < COOLDOWN_MS) return null;
  for (const c of quietZone(far.cell)) said.far.add(c);
  return { ...far, stage: "far" };
}

/** Cells to stay quiet about after an alert, so one hotspot isn't announced cell by cell. */
export function quietZone(cell: string): string[] {
  return gridDisk(cell, 2);
}
