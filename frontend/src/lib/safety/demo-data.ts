/**
 * DEMO DATA — synthetic, NOT real reports.
 * Generates individual chhintai incidents clustered at specific spots (junctions, road
 * stretches) around a few hotspots, then aggregates them into H3 cells at any resolution —
 * the same incidents → cells model the backend will use. Hotspots are arbitrary offsets,
 * deliberately not tied to real neighbourhoods. Replace with the /api/v1 endpoints.
 */
import { cellToLatLng, getResolution, isValidCell, latLngToCell } from "h3-js";
import { confidenceFor, K_ANONYMITY, scoreToBand } from "./bands";
import { CHHINTAI_METHODS, type CategoryKey } from "./categories";
import { OVERVIEW_RES, type GridRes } from "./grid";
import type {
  AreaDetail,
  CategoryCount,
  CellSummary,
  KnowledgeEntry,
  MapCellsQuery,
  TimeBlock,
} from "./types";

export const DHAKA_CENTER: [lng: number, lat: number] = [90.4093, 23.7808];

const PROFILES = {
  night: [0.9, 0.5, 0.2, 0.3, 0.35, 0.45, 0.75, 1],
  evening: [0.5, 0.2, 0.25, 0.4, 0.5, 0.7, 1, 0.9],
  commute: [0.2, 0.1, 0.8, 0.6, 0.5, 0.7, 1, 0.5],
} as const;
type ProfileKey = keyof typeof PROFILES;

interface Hotspot {
  dLat: number;
  dLng: number;
  strength: number;
  radiusKm: number;
  profile: ProfileKey;
}

const HOTSPOTS: readonly Hotspot[] = [
  { dLat: -0.018, dLng: 0.02, strength: 1, radiusKm: 1.2, profile: "night" },
  { dLat: -0.024, dLng: -0.019, strength: 0.7, radiusKm: 1, profile: "commute" },
  { dLat: 0.026, dLng: -0.04, strength: 0.8, radiusKm: 1.3, profile: "evening" },
  { dLat: -0.056, dLng: 0.004, strength: 0.9, radiusKm: 1.1, profile: "commute" },
  { dLat: 0.04, dLng: 0.012, strength: 0.85, radiusKm: 0.9, profile: "night" },
  { dLat: -0.06, dLng: 0.03, strength: 0.6, radiusKm: 1, profile: "night" },
  { dLat: 0.002, dLng: 0.045, strength: 0.55, radiusKm: 1.2, profile: "evening" },
];

/** Scale per resolution so a cell's score reflects density, not cell size. */
const SCORE_SCALE: Record<GridRes, number> = { 8: 22, 9: 7, 10: 2.6 };

interface Incident {
  lat: number;
  lng: number;
  method: CategoryKey;
  block: TimeBlock;
  hour: number;
  daysAgo: number;
  verified: boolean;
  media: boolean;
}

// ---------- deterministic randomness ----------
function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFor(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function pickWeighted<T>(rand: () => number, items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const KM_LAT = 1 / 111;
const KM_LNG = 1 / (111 * Math.cos((DHAKA_CENTER[1] * Math.PI) / 180));
const BLOCKS: readonly TimeBlock[] = [0, 1, 2, 3, 4, 5, 6, 7];

// ---------- incident generation ----------
let incidentsCache: Incident[] | null = null;

function incidents(): Incident[] {
  if (incidentsCache) return incidentsCache;
  const rand = rngFor("safepath-demo-v2");
  const out: Incident[] = [];

  // Micro-clusters: a specific junction or stretch of road where chhintai keeps happening.
  for (const spot of HOTSPOTS) {
    const clusters = Math.round(10 * spot.strength) + 4;
    for (let c = 0; c < clusters; c++) {
      const cLat = DHAKA_CENTER[1] + spot.dLat + gaussian(rand) * spot.radiusKm * 0.6 * KM_LAT;
      const cLng = DHAKA_CENTER[0] + spot.dLng + gaussian(rand) * spot.radiusKm * 0.6 * KM_LNG;
      const spreadKm = 0.04 + rand() * 0.09;
      // Elongate along a random direction so clusters follow a "road".
      const angle = rand() * Math.PI;
      const count = Math.round((6 + rand() * 34) * spot.strength);
      const methodWeights = CHHINTAI_METHODS.map(() => 0.3 + rand() * 2);
      for (let i = 0; i < count; i++) {
        const along = gaussian(rand) * spreadKm * 2.2;
        const across = gaussian(rand) * spreadKm * 0.5;
        const block = pickWeighted(rand, BLOCKS, PROFILES[spot.profile]);
        out.push({
          lat: cLat + (along * Math.sin(angle) + across * Math.cos(angle)) * KM_LAT,
          lng: cLng + (along * Math.cos(angle) - across * Math.sin(angle)) * KM_LNG,
          method: pickWeighted(rand, CHHINTAI_METHODS, methodWeights).key,
          block,
          hour: block * 3 + Math.floor(rand() * 3),
          daysAgo: Math.floor(rand() ** 1.4 * 90),
          verified: rand() < 0.55,
          media: rand() < 0.06,
        });
      }
    }
  }

  // Scattered one-off reports across the city (mostly below the k-anonymity threshold).
  for (let i = 0; i < 450; i++) {
    const r = Math.sqrt(rand()) * 11;
    const a = rand() * Math.PI * 2;
    const hour = Math.floor(rand() * 24);
    out.push({
      lat: DHAKA_CENTER[1] + r * Math.sin(a) * KM_LAT,
      lng: DHAKA_CENTER[0] + r * Math.cos(a) * KM_LNG,
      method: CHHINTAI_METHODS[Math.floor(rand() * CHHINTAI_METHODS.length)].key,
      block: Math.floor(hour / 3) as TimeBlock,
      hour,
      daysAgo: Math.floor(rand() * 90),
      verified: rand() < 0.4,
      media: false,
    });
  }

  incidentsCache = out;
  return out;
}

// ---------- aggregation ----------
const indexCache = new Map<GridRes, Map<string, Incident[]>>();
const areaCache = new Map<string, AreaDetail>();

function cellIndex(res: GridRes): Map<string, Incident[]> {
  let index = indexCache.get(res);
  if (!index) {
    index = new Map();
    for (const inc of incidents()) {
      const h3 = latLngToCell(inc.lat, inc.lng, res);
      const list = index.get(h3);
      if (list) list.push(inc);
      else index.set(h3, [inc]);
    }
    indexCache.set(res, index);
  }
  return index;
}

/** Recency weight: recent reports count most, 30-day half-life. */
const decay = (daysAgo: number) => Math.pow(0.5, daysAgo / 30);
/** Unverified community reports count less than verified ones. */
const trust = (inc: Incident) => (inc.verified || inc.media ? 1 : 0.4);

/** Recency- and trust-weighted report count per hour of day. */
function hourWeights(list: readonly Incident[]): number[] {
  const w = new Array<number>(24).fill(0);
  for (const i of list) w[i.hour] += decay(i.daysAgo) * trust(i);
  return w;
}

/** Reported times are approximate, so blend each hour with its neighbours (circular). */
function smoothHours(w: readonly number[]): number[] {
  return w.map((v, h) => 0.25 * w[(h + 23) % 24] + 0.5 * v + 0.25 * w[(h + 1) % 24]);
}

function scoreFrom(weight: number, res: GridRes): number {
  return Math.round(100 * (1 - Math.exp(-weight / SCORE_SCALE[res])));
}

function aggregate(h3: string, list: Incident[]): AreaDetail {
  const res = getResolution(h3) as GridRes;
  const rand = rngFor(h3);
  const [lat, lng] = cellToLatLng(h3);

  const d7 = list.filter((i) => i.daysAgo < 7).length;
  const d30 = list.filter((i) => i.daysAgo < 30).length;
  const d90 = list.length;
  const prev = list.filter((i) => i.daysAgo >= 30 && i.daysAgo < 60).length;
  const verifiedCount = list.filter((i) => i.verified).length;
  const verifiedPct = d90 ? Math.round((verifiedCount / d90) * 100) : 0;

  const weight = list.reduce((s, i) => s + decay(i.daysAgo) * trust(i), 0);
  const score = scoreFrom(weight, res);

  const blockWeights = BLOCKS.map((b) =>
    list.filter((i) => i.block === b).reduce((s, i) => s + decay(i.daysAgo) * trust(i), 0),
  );
  // A block's level = how the area would score if every 3 hours looked like this one.
  const timeBlocks = blockWeights.map((w) => scoreFrom(w * 8, res));
  const hours = smoothHours(hourWeights(list)).map((w) => scoreFrom(w * 24, res));
  const weightTotal = blockWeights.reduce((s, w) => s + w, 0);
  const blockShares = blockWeights.map((w) => (weightTotal > 0 ? Math.round((100 * w) / weightTotal) : 0));

  const methodCounts = new Map<CategoryKey, number>();
  for (const i of list) methodCounts.set(i.method, (methodCounts.get(i.method) ?? 0) + 1);
  const categories: CategoryCount[] = [...methodCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const direction = d30 > prev * 1.15 ? "up" : d30 < prev * 0.85 ? "down" : "flat";
  const peak = blockWeights.indexOf(Math.max(...blockWeights)) as TimeBlock;

  const knowledge: KnowledgeEntry[] = [];
  if (score > 50 && categories[0]) {
    knowledge.push({
      id: `${h3}-k1`,
      category: categories[0].key,
      fromBlock: peak,
      toBlock: Math.min(7, peak + 1) as TimeBlock,
      days: rand() > 0.5 ? "every_day" : "weekends",
      confirmationsBucket: d90 > 30 ? 25 : d90 > 12 ? 10 : 3,
      status: verifiedPct > 50 ? "corroborated" : "unverified",
    });
  }

  const positives: CategoryCount[] = (["well_lit", "busy_late", "patrol_seen", "cctv"] as const)
    .map((key) => ({ key, count: rand() > 0.6 ? Math.round(1 + rand() * 4) : 0 }))
    .filter((p) => p.count > 0);

  const media = list.filter((i) => i.media).length;
  const verified = list.filter((i) => i.verified && !i.media).length;

  return {
    h3,
    code: h3.slice(4, 9).toUpperCase(),
    center: [lng, lat],
    score,
    band: scoreToBand(score),
    confidence: confidenceFor(d90, verifiedPct),
    reports30: d30,
    topCategory: categories[0]?.key ?? null,
    insufficient: d90 < K_ANONYMITY,
    reportCount: d90,
    verifiedPct,
    counts: { d7, d30, d90 },
    categories,
    timeBlocks,
    blockShares,
    hours,
    trend: { prev, curr: d30, direction },
    knowledge,
    positives,
    sources: { community: d90 - media - verified, verified, media, official: 0 },
    busyArea: score > 60 && rand() < 0.15,
    isDemo: true,
  };
}

function areaFor(h3: string, list: Incident[]): AreaDetail {
  let area = areaCache.get(h3);
  if (!area) {
    area = aggregate(h3, list);
    areaCache.set(h3, area);
  }
  return area;
}

// ---------- query helpers (shape mirrors the planned API) ----------
export function demoMapCells(query: MapCellsQuery): CellSummary[] {
  const result: CellSummary[] = [];
  for (const [h3, list] of cellIndex(query.res)) {
    const area = areaFor(h3, list);
    if (area.insufficient) continue;
    const score = query.hour === "all" ? area.score : area.hours[query.hour];
    result.push({
      h3,
      score,
      band: scoreToBand(score),
      confidence: area.confidence,
      reports30: area.reports30,
      topCategory: area.topCategory,
      insufficient: false,
    });
  }
  return result;
}

export function demoArea(h3: string): AreaDetail | null {
  if (!isValidCell(h3)) return null;
  const res = getResolution(h3);
  if (res !== 8 && res !== 9 && res !== 10) return null;
  const list = cellIndex(res).get(h3) ?? [];
  return areaFor(h3, list);
}

/** City-wide activity per hour of day, relative to the busiest hour (0–90). */
export function demoCityTimeProfile(): number[] {
  const weights = smoothHours(hourWeights(incidents()));
  const max = Math.max(...weights, 1);
  return weights.map((w) => Math.round((w / max) * 90));
}

/** Most active areas — used for the home page preview card. */
export function demoTopAreas(limit: number): AreaDetail[] {
  return [...cellIndex(OVERVIEW_RES)]
    .map(([h3, list]) => areaFor(h3, list))
    .filter((a) => !a.insufficient)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
