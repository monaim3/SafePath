import { fill, type Dictionary, type Locale } from "@/i18n";
import type { Reason } from "./types";

/** Localized sentence for one "Why this level?" reason. */
export function formatReason(reason: Reason, locale: Locale, dict: Dictionary): string {
  const r = dict.area.reasons;
  switch (reason.kind) {
    case "recent":
      return fill(locale, r.recent, { n: reason.n });
    case "earlier":
      return fill(locale, r.earlier, { n: reason.n });
    case "time":
      return fill(locale, r.time, { block: dict.timeBlocks[reason.block] });
    case "category":
      return fill(locale, r.category, { p: reason.pct, cat: dict.categories[reason.category] });
    case "up":
      return r.up;
    case "down":
      return r.down;
    case "verified":
      return fill(locale, r.verified, { p: reason.pct });
  }
}
