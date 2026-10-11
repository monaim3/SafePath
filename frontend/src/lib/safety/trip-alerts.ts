/**
 * Trip alerts: while someone travels, find higher-report areas just ahead of them.
 * Pure functions — no GPS, no audio, no network. Location never leaves the device.
 */
import { gridDisk, latLngToCell } from "h3-js";
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
const SAMPLE_M = 30;

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

export interface TripAlert {
  cell: string;
  score: number;
  band: Band;
}

function cellAt([lng, lat]: LngLat): string {
  return latLngToCell(lat, lng, REPORT_RES);
}

/** Cells the person will reach soon: along the route ahead, or a ~150 m ring when off-route. */
export function cellsAhead(position: LngLat, route: readonly LngLat[] | null, aheadM = LOOKAHEAD_M): string[] {
  const here = cellAt(position);
  if (route && route.length > 1) {
    let nearest = 0;
    let best = Infinity;
    route.forEach((p, i) => {
      const d = metres(position, p);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (best <= OFF_ROUTE_M) {
      const cells = new Set([here]);
      let travelled = 0;
      for (let i = nearest; i < route.length - 1 && travelled < aheadM; i++) {
        const [a, b] = [route[i], route[i + 1]];
        const len = metres(a, b);
        const n = Math.max(1, Math.ceil(len / SAMPLE_M));
        for (let k = 1; k <= n && travelled + (len * k) / n <= aheadM; k++) {
          const t = k / n;
          cells.add(cellAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
        }
        travelled += len;
      }
      return [...cells];
    }
  }
  return gridDisk(here, 1);
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

/** Cells to stay quiet about after an alert, so one hotspot isn't announced cell by cell. */
export function quietZone(cell: string): string[] {
  return gridDisk(cell, 2);
}
