import { bn } from "./bn";
import { en, type Dictionary } from "./en";

export type { Dictionary };

export const locales = ["bn", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "bn";

const dictionaries: Record<Locale, Dictionary> = { bn, en };

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

const numberFormatters: Record<Locale, Intl.NumberFormat> = {
  bn: new Intl.NumberFormat("bn-BD"),
  en: new Intl.NumberFormat("en-US"),
};

/** Formats a number with locale digits (Bangla digits for `bn`). */
export function formatNumber(locale: Locale, value: number): string {
  return numberFormatters[locale].format(value);
}

type Period = keyof Dictionary["clock"]["periods"];

function periodOf(hour: number): Period {
  if (hour < 4) return "lateNight";
  if (hour < 6) return "dawn";
  if (hour < 12) return "morning";
  if (hour < 15) return "noon";
  if (hour < 18) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

/**
 * Friendly hour label: bn "রাত ১০টা" (or "রাত ১০টায়" with `at`), en "10 PM" ("at 10 PM").
 */
export function formatHour(locale: Locale, dict: Dictionary, hour: number, at = false): string {
  const h12 = hour % 12 || 12;
  if (locale === "bn") {
    return `${dict.clock.periods[periodOf(hour)]} ${formatNumber(locale, h12)}${at ? "টায়" : "টা"}`;
  }
  const label = `${h12} ${hour < 12 ? "AM" : "PM"}`;
  return at ? `at ${label}` : label;
}

/** Replaces `{key}` placeholders. Numbers are formatted with locale digits. */
/** A year in locale digits, without the thousands separator ("২০২৬", not "২,০২৬"). */
export function formatYear(locale: Locale, year: number): string {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", { useGrouping: false }).format(year);
}

export function fill(
  locale: Locale,
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    if (value === undefined) return match;
    return typeof value === "number" ? formatNumber(locale, value) : value;
  });
}
