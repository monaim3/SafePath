export const BANDS = ["very_low", "low", "moderate", "elevated", "high", "very_high"] as const;
export type Band = (typeof BANDS)[number];

/** Upper bound (inclusive) of each band on the 0–100 Reported Activity Level scale. */
const BAND_UPPER: Record<Band, number> = {
  very_low: 15,
  low: 30,
  moderate: 50,
  elevated: 65,
  high: 80,
  very_high: 100,
};

/**
 * Google-traffic-style scale: green → yellow → orange → red.
 * Green means *fewer reports*, never "safe" — UI copy must keep saying "lower reported activity".
 * Hex values mirror the --ral-* CSS tokens; MapLibre paint needs literal colors.
 */
export const BAND_COLORS: Record<Band, string> = {
  very_low: "#1e9e4a",
  low: "#8bc34a",
  moderate: "#fbc02d",
  elevated: "#fb8c00",
  high: "#e53935",
  very_high: "#9b1c1c",
};

/** Bands dark enough that text on them must be light. */
export const DARK_BANDS: ReadonlySet<Band> = new Set<Band>(["very_low", "elevated", "high", "very_high"]);

export function scoreToBand(score: number): Band {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return BANDS.find((band) => clamped <= BAND_UPPER[band]) ?? "very_high";
}

export const CONFIDENCE_LEVELS = ["low", "moderate", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** Minimum non-rejected reports before a cell shows anything publicly (k-anonymity). */
export const K_ANONYMITY = 3;

export function confidenceFor(reportCount: number, verifiedPct: number): ConfidenceLevel {
  if (reportCount < K_ANONYMITY || verifiedPct < 20) return "low";
  if (reportCount > 15 && verifiedPct > 50) return "high";
  return "moderate";
}
