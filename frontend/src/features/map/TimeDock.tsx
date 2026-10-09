"use client";

import {
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  ChevronUp,
  Clock,
  CloudSun,
  Moon,
  MoonStar,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { fill, formatHour, type Dictionary, type Locale } from "@/i18n";
import { BAND_COLORS, BANDS, scoreToBand } from "@/lib/safety/bands";
import { BandBadge } from "@/components/safety/BandBadge";
import { cn } from "@/components/ui/cn";

type PresetKey = keyof Dictionary["clock"]["presets"];

const PRESETS: {
  key: PresetKey;
  hour: number;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { key: "dawn", hour: 5, Icon: Sunrise },
  { key: "morning", hour: 8, Icon: CloudSun },
  { key: "noon", hour: 13, Icon: Sun },
  { key: "afternoon", hour: 16, Icon: Sun },
  { key: "evening", hour: 19, Icon: Sunset },
  { key: "night", hour: 22, Icon: Moon },
  { key: "lateNight", hour: 1, Icon: MoonStar },
];

const TICKS = [0, 6, 12, 18];
const isNight = (h: number) => h < 6 || h >= 18;

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-7 rounded-full px-3 text-xs font-medium transition-colors",
        active ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export interface TimeDockProps {
  locale: Locale;
  dict: Dictionary;
  hour: number | "all";
  isNow: boolean;
  onPick: (hour: number | "all", now?: boolean) => void;
  /** 24 values. In "area" mode they are real levels (0–100); in "city" mode, relative to the busiest hour. */
  values: readonly number[];
  mode: "city" | "area";
  areaName?: string;
  footer?: ReactNode;
  /** Phones only: fold to a one-line bar so another panel (directions, area card) has room. */
  compact?: boolean;
}

export function TimeDock({
  locale,
  dict,
  hour,
  isNow,
  onPick,
  values,
  mode,
  areaName,
  footer,
  compact = false,
}: TimeDockProps) {
  const [expanded, setExpanded] = useState(false);
  // Fold again each time compact mode starts (adjusting state during render, as React recommends).
  const [wasCompact, setWasCompact] = useState(compact);
  if (compact !== wasCompact) {
    setWasCompact(compact);
    if (compact) setExpanded(false);
  }
  const folded = compact && !expanded;
  const max = Math.max(...values, 1);
  const selectedValue = hour === "all" ? null : (values[hour] ?? 0);
  const label =
    hour === "all" ? dict.map.allDay : formatHour(locale, dict, hour);

  return (
    <section
      className={cn(
        "rounded-3xl border border-line bg-glass p-4 shadow-soft backdrop-blur-xl",
        folded && "max-lg:p-3",
      )}
      aria-label={dict.map.timeLabel}
    >
      {/* ---------- selected time + context ---------- */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Clock className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-ink-3">
            {mode === "area"
              ? `${dict.map.areaActivity}${areaName ? ` · ${areaName}` : ""}`
              : dict.map.cityActivity}
          </p>
          <p className="flex flex-wrap items-center gap-2" aria-live="polite">
            <span className="font-display text-lg font-bold leading-tight">
              {label}
            </span>
            {mode === "area" && selectedValue !== null && (
              <BandBadge
                band={scoreToBand(selectedValue)}
                label={dict.bands[scoreToBand(selectedValue)]}
              />
            )}
          </p>
        </div>
        <div className="flex shrink-0 rounded-full bg-surface-2 p-0.5">
          <Segment
            active={isNow}
            onClick={() => onPick(new Date().getHours(), true)}
          >
            {dict.map.now}
          </Segment>
          <Segment active={hour === "all"} onClick={() => onPick("all")}>
            {dict.map.allDay}
          </Segment>
        </div>
        {compact && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={!folded}
            title={folded ? dict.map.showChart : dict.map.hideChart}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 hover:text-ink lg:hidden"
          >
            <ChevronUp
              className={cn(
                "size-4 transition-transform",
                !folded && "rotate-180",
              )}
              aria-hidden
            />
            <span className="sr-only">
              {folded ? dict.map.showChart : dict.map.hideChart}
            </span>
          </button>
        )}
      </div>

      <div className={cn(folded && "max-lg:hidden")}>
        {/* ---------- 24-hour chart with a drag/tap scrubber ---------- */}
        <div className="relative mt-3 h-16">
          <div className="flex h-full items-end gap-[2px]" aria-hidden>
            {values.map((v, h) => {
              const active = hour === h;
              const dimmed = hour !== "all" && !active;
              const height = mode === "area" ? v : (v / max) * 100;
              const color =
                mode === "area"
                  ? BAND_COLORS[scoreToBand(v)]
                  : BAND_COLORS[scoreToBand(25 + (v / max) * 70)];
              return (
                <span
                  key={h}
                  className={cn(
                    "relative flex h-full flex-1 items-end rounded-[4px]",
                    isNight(h) ? "bg-ink/[0.07]" : "bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "w-full rounded-[4px] transition-all duration-200",
                      dimmed && "opacity-30",
                      active &&
                        "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                    )}
                    style={{
                      height: `${Math.max(6, height)}%`,
                      background: color,
                    }}
                  />
                </span>
              );
            })}
          </div>
          <input
            type="range"
            min={0}
            max={23}
            step={1}
            value={hour === "all" ? 12 : hour}
            onChange={(e) => onPick(Number(e.target.value))}
            aria-label={dict.map.dragHint}
            aria-valuetext={hour === "all" ? dict.map.allDay : label}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        {/* hour ticks with day / night cues */}
        <div
          className="mt-1.5 grid grid-cols-4 text-[10px] text-ink-3"
          aria-hidden
        >
          {TICKS.map((t) => (
            <span key={t} className="flex items-center gap-1">
              {isNight(t) ? (
                <Moon className="size-3" />
              ) : (
                <Sun className="size-3" />
              )}
              {formatHour(locale, dict, t)}
            </span>
          ))}
        </div>

        {/* ---------- presets ---------- */}
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {PRESETS.map(({ key, hour: h, Icon }) => {
            const active = hour === h;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPick(h)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {dict.clock.presets[key]}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-[11px] text-ink-3">{dict.map.dragHint}</span>
          {/* compact legend on mobile */}
          <div className="flex h-2 w-28 gap-0.5 lg:hidden" aria-hidden>
            {BANDS.map((b, i) => (
              <span
                key={b}
                className="flex-1 first:rounded-l-full last:rounded-r-full"
                style={{ background: `var(--ral-${i})` }}
              />
            ))}
          </div>
        </div>
        {footer}
      </div>
    </section>
  );
}

/** "রাত ১০টায় এখানে" / "Here at 10 PM" — or the all-day wording. */
export function hereAtLabel(
  locale: Locale,
  dict: Dictionary,
  hour: number | "all",
): string {
  if (hour === "all") return dict.area.ralLabel;
  return fill(locale, dict.map.hereAt, {
    time: formatHour(locale, dict, hour, true),
  });
}
