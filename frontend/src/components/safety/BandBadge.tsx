import { BAND_COLORS, DARK_BANDS, type Band, type ConfidenceLevel } from "@/lib/safety/bands";
import { cn } from "@/components/ui/cn";

export function BandBadge({ band, label, className }: { band: Band; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        DARK_BANDS.has(band) ? "text-white" : "text-[#3a2a12]",
        className,
      )}
      style={{ backgroundColor: BAND_COLORS[band] }}
    >
      {label}
    </span>
  );
}

const CONFIDENCE_BARS: Record<ConfidenceLevel, number> = { low: 1, moderate: 2, high: 3 };

/** Three-bar signal meter, like phone reception. */
export function ConfidenceMeter({
  level,
  label,
  valueLabel,
}: {
  level: ConfidenceLevel;
  label: string;
  valueLabel: string;
}) {
  const filled = CONFIDENCE_BARS[level];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-2">
      <span className="flex items-end gap-[3px]" aria-hidden>
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={cn("w-[4px] rounded-full", bar <= filled ? "bg-ink" : "bg-line")}
            style={{ height: 4 + bar * 3 }}
          />
        ))}
      </span>
      <span>
        {label}: <span className="font-semibold text-ink">{valueLabel}</span>
      </span>
    </span>
  );
}
