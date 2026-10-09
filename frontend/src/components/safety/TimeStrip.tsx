import { BAND_COLORS, scoreToBand } from "@/lib/safety/bands";
import { cn } from "@/components/ui/cn";

/**
 * Eight 3-hour bars. Peak block is emphasized.
 * With `shares` the bars show what part of the reports fell in each block (with a % label),
 * which still shows a pattern at busy spots where every block's level is near the top.
 * Without it they fall back to the level per block, coloured by band.
 */
export function TimeStrip({
  values,
  shares,
  labels,
  bandLabels,
  locale,
  peakLabel,
}: {
  values: readonly number[];
  shares?: readonly number[];
  labels: readonly string[];
  bandLabels: Record<string, string>;
  locale: string;
  peakLabel: string;
}) {
  const bars = shares ?? values;
  const max = Math.max(...bars, 1);
  const peak = bars.indexOf(max);
  const pct = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US");

  return (
    // Top-aligned: labels under the bars wrap to different heights, which would push bars around.
    <ol className="grid grid-cols-8 items-start gap-1.5 sm:gap-2">
      {bars.map((v, i) => {
        const band = scoreToBand(values[i] ?? 0);
        const isPeak = i === peak && v > 0;
        const color = shares ? (isPeak ? "var(--ral-4)" : "var(--accent)") : BAND_COLORS[band];
        return (
          <li key={i} className="flex flex-col items-center gap-2">
            {shares && (
              <span className={cn("text-[11px] tabular-nums", isPeak ? "font-semibold text-ink" : "text-ink-3")}>
                {pct.format(v)}%
              </span>
            )}
            <div className="relative flex h-32 w-full items-end overflow-hidden rounded-xl bg-surface-2">
              <div
                className={cn(
                  "w-full rounded-xl transition-all",
                  shares && !isPeak && "opacity-60",
                  isPeak && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                )}
                style={{ height: `${Math.max(v > 0 ? 6 : 3, (v / max) * 100)}%`, background: color }}
                title={shares ? `${labels[i]}: ${pct.format(v)}%` : `${labels[i]} — ${bandLabels[band]}`}
              />
            </div>
            <span
              className={cn("text-center text-[10px] leading-tight sm:text-[11px]", isPeak ? "font-semibold text-ink" : "text-ink-3")}
            >
              {labels[i]}
            </span>
            {isPeak && shares && (
              <span className="rounded-full bg-ral-4/15 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight text-ral-4">
                {peakLabel}
              </span>
            )}
            {!shares && <span className="sr-only">{bandLabels[band]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
