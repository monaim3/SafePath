import type { GridRes } from "./grid";
import type { Band, ConfidenceLevel } from "./bands";
import type { CategoryKey } from "./categories";

/** Index into the 8 three-hour blocks of a day (0 = 12–3 AM … 7 = 9 PM–12 AM). */
export type TimeBlock = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const TIME_BLOCKS: readonly TimeBlock[] = [0, 1, 2, 3, 4, 5, 6, 7];

export function currentTimeBlock(date = new Date()): TimeBlock {
  return Math.floor(date.getHours() / 3) as TimeBlock;
}

export type SourceKey = "community" | "verified" | "media" | "official";

/** Response item of GET /api/v1/map/cells */
export interface CellSummary {
  h3: string;
  score: number;
  band: Band;
  confidence: ConfidenceLevel;
  reports30: number;
  topCategory: CategoryKey | null;
  insufficient: boolean;
}

export interface CategoryCount {
  key: CategoryKey;
  count: number;
}

export interface KnowledgeEntry {
  id: string;
  category: CategoryKey;
  fromBlock: TimeBlock;
  toBlock: TimeBlock;
  days: "every_day" | "weekdays" | "weekends";
  /** Public count is bucketed (3, 10, 25, 50) so it cannot be gamed precisely. */
  confirmationsBucket: number;
  status: "unverified" | "corroborated";
}

/** Response of GET /api/v1/areas/{h3} */
export interface AreaDetail extends CellSummary {
  code: string;
  center: [lng: number, lat: number];
  reportCount: number;
  verifiedPct: number;
  counts: { d7: number; d30: number; d90: number };
  categories: CategoryCount[];
  /** Reported Activity Level per time block. */
  timeBlocks: number[];
  /** Share of reports (%) per time block, adds up to ~100. Older API responses may lack it. */
  blockShares?: number[];
  /** Reported Activity Level per hour of day (24 values, lightly smoothed). */
  hours: number[];
  trend: { prev: number; curr: number; direction: "up" | "down" | "flat" };
  knowledge: KnowledgeEntry[];
  positives: CategoryCount[];
  sources: Record<SourceKey, number>;
  busyArea: boolean;
  isDemo: boolean;
}

/** Response item of GET /api/v1/areas/{h3}/videos — moderator-approved footage, sound removed. */
export interface AreaVideo {
  id: string;
  url: string;
  poster: string;
  category: CategoryKey;
  date: string | null;
}

/** Response item of GET /api/v1/areas/{h3}/news — a published news report counted in this area. */
export interface AreaNews {
  outlet: string;
  url: string;
  date: string | null;
  category: CategoryKey;
}

/** Signed, single-file Cloudinary upload, returned with a report that has footage. */
export interface UploadTicket {
  url: string;
  fields: Record<string, string | number>;
  maxBytes: number;
  attachToken: string;
}

/** Time window the map counts: last 30 / 90 days, or everything still counted (default). */
export type Period = "30" | "90" | "all";
export const PERIODS: readonly Period[] = ["30", "90", "all"];

export interface MapCellsQuery {
  /** Hour of day 0–23, or the whole day. */
  hour: number | "all";
  /** H3 resolution, chosen from the map zoom (see grid.ts). */
  res: GridRes;
  period?: Period;
}

/** Structured explanation item; the UI turns it into localized text. */
export type Reason =
  | { kind: "recent"; n: number }
  /** Nothing in the last 30 days: the level comes from older reports (e.g. news history). */
  | { kind: "earlier"; n: number }
  | { kind: "time"; block: TimeBlock }
  | { kind: "category"; pct: number; category: CategoryKey }
  | { kind: "up" }
  | { kind: "down" }
  | { kind: "verified"; pct: number };
