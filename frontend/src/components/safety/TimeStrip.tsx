import { BAND_COLORS, scoreToBand } from "@/lib/safety/bands";
import { cn } from "@/components/ui/cn";

/** Eight 3-hour bars, colored by band. Peak block is emphasized. */
export function TimeStrip({
  values,
  labels,
  bandLabels,
}: {
  values: readonly number[];
  labels: readonly string[];
  bandLabels: Record<string, string>;
}) {
  const max = Math.max(...values, 1);
  const peak = values.indexOf(max);

  return (
    <ol className="grid grid-cols-8 items-end gap-1.5 sm:gap-2">
      {values.map((v, i) => {
        const band = scoreToBand(v);
        return (
          <li key={i} className="flex flex-col items-center gap-2">
            <div className="relative flex h-32 w-full items-end overflow-hidden rounded-xl bg-surface-2">
              <div
                className={cn("w-full rounded-xl transition-all", i === peak && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
                style={{ height: `${Math.max(6, (v / max) * 100)}%`, background: BAND_COLORS[band] }}
                title={`${labels[i]} — ${bandLabels[band]}`}
              />
            </div>
            <span
              className={cn(
                "text-center text-[10px] leading-tight sm:text-[11px]",
                i === peak ? "font-semibold text-ink" : "text-ink-3",
              )}
            >
              {labels[i]}
            </span>
            <span className="sr-only">{bandLabels[band]}</span>
          </li>
        );
      })}
    </ol>
  );
}
