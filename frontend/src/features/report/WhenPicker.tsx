"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { fill, formatHour, type Dictionary, type Locale } from "@/i18n";
import { TIME_BLOCKS, type TimeBlock } from "@/lib/safety/types";
import { cn } from "@/components/ui/cn";

export type WhenChoice = "just_now" | "today" | "yesterday" | "other";

export interface WhenValue {
  when?: WhenChoice;
  date?: string;
  block?: number;
  hour?: number;
}

/** Local calendar date (Dhaka users' own clock), YYYY-MM-DD. */
function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysAgo(n: number, now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}

function Chip({
  selected,
  onClick,
  disabled,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-2xl border px-3 py-3 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-35",
        selected
          ? "border-accent bg-accent text-accent-ink shadow-soft"
          : "border-line bg-surface enabled:hover:-translate-y-0.5 enabled:hover:border-ink-3",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Quick choices that always resolve to a real date (+ approximate or exact time):
 * "Just now" records the current date and hour automatically; older incidents get a day row
 * or a calendar limited to the past year.
 */
export function WhenPicker({
  locale,
  dict,
  value,
  onChange,
  errors,
}: {
  locale: Locale;
  dict: Dictionary;
  value: WhenValue;
  onChange: (next: WhenValue) => void;
  errors: { when?: string; date?: string; block?: string };
}) {
  const t = dict.report;
  const [exact, setExact] = useState(value.hour !== undefined && value.when !== "just_now");
  const now = new Date();
  const today = isoDate(now);
  const dayFmt = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  function choose(when: WhenChoice) {
    if (when === "just_now") {
      const h = now.getHours();
      onChange({ when, date: today, hour: h, block: Math.floor(h / 3) });
      return;
    }
    const date = when === "today" ? today : when === "yesterday" ? isoDate(daysAgo(1)) : undefined;
    onChange({ when, date, block: value.when === "just_now" ? undefined : value.block, hour: undefined });
    setExact(false);
  }

  // Blocks/hours later than now are impossible for an incident that happened today.
  const isToday = value.date === today;
  const blockDisabled = (b: number) => isToday && b * 3 > now.getHours();
  const hourDisabled = (h: number) => isToday && h > now.getHours();

  const error = (key?: string) =>
    key ? (
      <p role="alert" className="mt-3 text-sm font-medium text-ral-4">
        {dict.report.errors[key as keyof Dictionary["report"]["errors"]] ?? key}
      </p>
    ) : null;

  return (
    <div className="space-y-8">
      {/* ---------- day ---------- */}
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">{t.whenQ}</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["just_now", "today", "yesterday", "other"] as const).map((w) => (
            <Chip key={w} selected={value.when === w} onClick={() => choose(w)}>
              {t.when[w]}
            </Chip>
          ))}
        </div>
        {error(errors.when)}

        {value.when === "just_now" && value.hour !== undefined && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-positive-soft px-3 py-1.5 text-sm text-positive">
            <Clock className="size-4" aria-hidden />
            {fill(locale, t.autoTime, { time: `${t.when.today}, ${formatHour(locale, dict, value.hour)}` })}
          </p>
        )}

        {value.when === "other" && (
          <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold">{t.pickDay}</p>
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              {[2, 3, 4, 5, 6, 7].map((n) => {
                const iso = isoDate(daysAgo(n));
                return (
                  <Chip
                    key={iso}
                    selected={value.date === iso}
                    onClick={() => onChange({ ...value, date: iso })}
                    className="shrink-0 px-3.5 py-2.5"
                  >
                    {dayFmt.format(daysAgo(n))}
                  </Chip>
                );
              })}
            </div>
            <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-2">
              <CalendarDays className="size-4 text-ink-3" aria-hidden />
              {t.olderDate}
              <input
                type="date"
                min={isoDate(daysAgo(365))}
                max={today}
                value={value.date ?? ""}
                onChange={(e) => onChange({ ...value, date: e.target.value || undefined })}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
          </div>
        )}
        {value.when && error(errors.date)}
      </div>

      {/* ---------- time (skipped for "just now") ---------- */}
      {value.when !== "just_now" && (
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">{t.blockQ}</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIME_BLOCKS.map((b: TimeBlock) => (
              <Chip
                key={b}
                selected={value.block === b && !exact}
                disabled={blockDisabled(b)}
                onClick={() => {
                  setExact(false);
                  onChange({ ...value, block: b, hour: undefined });
                }}
              >
                {dict.timeBlocks[b]}
              </Chip>
            ))}
          </div>

          <div className="mt-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                checked={exact}
                onChange={(e) => {
                  setExact(e.target.checked);
                  if (!e.target.checked) onChange({ ...value, hour: undefined });
                }}
                className="size-4 accent-accent"
              />
              {t.exactTime}
            </label>
            {exact && (
              <label className="mt-3 flex items-center gap-3 text-sm text-ink-2">
                <Clock className="size-4 text-ink-3" aria-hidden />
                {t.exactTimeLabel}
                <select
                  value={value.hour ?? ""}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    onChange({ ...value, hour: h, block: Math.floor(h / 3) });
                  }}
                  className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h} disabled={hourDisabled(h)}>
                      {formatHour(locale, dict, h)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error(errors.block)}
        </div>
      )}
    </div>
  );
}
