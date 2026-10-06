import type { Dictionary } from "@/i18n";

/**
 * SafePath currently focuses on chhintai (ছিনতাই / snatching) only.
 * Incident "categories" are therefore the ways a chhintai happens; positive signals are
 * kept as context so the map is not only about danger.
 */
export type CategoryKey = keyof Dictionary["categories"];
export type CategoryGroup = keyof Dictionary["categoryGroups"];

export interface CategoryDef {
  key: CategoryKey;
  group: CategoryGroup;
  /** Relative weight used by the risk engine. Positive signals have none. */
  severity: number;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { key: "motorbike", group: "chhintai", severity: 0.9 },
  { key: "rickshaw_cng", group: "chhintai", severity: 0.8 },
  { key: "on_foot", group: "chhintai", severity: 0.7 },
  { key: "bus", group: "chhintai", severity: 0.7 },
  { key: "weapon", group: "chhintai", severity: 1 },
  { key: "well_lit", group: "positive", severity: 0 },
  { key: "busy_late", group: "positive", severity: 0 },
  { key: "patrol_seen", group: "positive", severity: 0 },
  { key: "cctv", group: "positive", severity: 0 },
];

export const CATEGORY_BY_KEY = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, CategoryDef>;

export const CHHINTAI_METHODS = CATEGORIES.filter((c) => c.group === "chhintai");
export const POSITIVE_CATEGORIES = CATEGORIES.filter((c) => c.group === "positive");
