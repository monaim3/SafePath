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
