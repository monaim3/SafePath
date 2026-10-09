import type { AreaDetail, Reason, TimeBlock } from "./types";

/** Builds the "Why this level?" list from area data. Order = most important first. */
export function explainArea(area: AreaDetail): Reason[] {
  if (area.insufficient) return [];

  const reasons: Reason[] = [
    area.counts.d30 > 0 ? { kind: "recent", n: area.counts.d30 } : { kind: "earlier", n: area.reportCount },
  ];

  // Shares, not levels: at a busy spot every block's level is near the top, hiding the real peak.
  const peak = peakBlock(area.blockShares ?? area.timeBlocks);
  if (peak !== null) reasons.push({ kind: "time", block: peak });

  const total = area.categories.reduce((sum, c) => sum + c.count, 0);
  const top = area.categories[0];
  if (top && total > 0) {
    reasons.push({ kind: "category", pct: Math.round((top.count / total) * 100), category: top.key });
  }

  if (area.trend.direction === "up") reasons.push({ kind: "up" });
  if (area.trend.direction === "down") reasons.push({ kind: "down" });

  reasons.push({ kind: "verified", pct: area.verifiedPct });
  return reasons;
}

/** Block with the highest activity, or null when the day is flat. */
export function peakBlock(blocks: readonly number[]): TimeBlock | null {
  if (blocks.length === 0) return null;
  const max = Math.max(...blocks);
  const min = Math.min(...blocks);
  if (max - min < 10) return null;
  return blocks.indexOf(max) as TimeBlock;
}
