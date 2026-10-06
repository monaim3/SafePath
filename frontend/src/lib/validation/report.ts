import { z } from "zod";
import { CATEGORIES, type CategoryKey } from "@/lib/safety/categories";

const categoryKeys = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

/**
 * Error messages are dictionary keys under `report.errors`, translated by the form.
 * The backend re-validates everything; this schema only gives fast feedback.
 */
/** Reports are accepted for incidents in the past year, never the future. */
export function isRecentPastDate(iso: string, now = new Date()): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = (today.getTime() - date.getTime()) / 86_400_000;
  return days >= 0 && days <= 366;
}

export const reportSchema = z
  .object({
    kind: z.enum(["incident", "knowledge", "positive"]),
    category: z.enum(categoryKeys, { error: "category" }),
    h3: z.string({ error: "location" }).min(1, { error: "location" }),
    when: z.enum(["just_now", "today", "yesterday", "other"]).optional(),
    /** Local calendar date of the incident, YYYY-MM-DD. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    block: z.number({ error: "block" }).int().min(0).max(7),
    /** Exact hour when known; otherwise only the 3-hour block is stored. */
    hour: z.number().int().min(0).max(23).optional(),
    days: z.enum(["every_day", "weekdays", "weekends"]).optional(),
    relation: z.enum(["experienced", "witnessed", "heard"]).optional(),
    description: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    // The category must match what is being shared (a chhintai method vs. a good sign).
    const isPositive = CATEGORIES.find((c) => c.key === value.category)?.group === "positive";
    if (isPositive !== (value.kind === "positive")) {
      ctx.addIssue({ code: "custom", path: ["category"], message: "category" });
    }
    if (value.kind === "incident") {
      if (!value.when) ctx.addIssue({ code: "custom", path: ["when"], message: "when" });
      else if (!value.date || !isRecentPastDate(value.date)) {
        ctx.addIssue({ code: "custom", path: ["date"], message: "date" });
      }
    }
  });

export type ReportInput = z.infer<typeof reportSchema>;

const PHONE = /(?:\+?88)?0?1[3-9]\d{2}[\s-]?\d{6}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_DIGITS = /\b\d{10,17}\b/g; // NID-like numbers

/** Removes phone numbers, emails and ID-like numbers. Server applies the same rule. */
export function redactPersonalInfo(text: string): string {
  return text.replace(EMAIL, "[removed]").replace(PHONE, "[removed]").replace(LONG_DIGITS, "[removed]");
}
