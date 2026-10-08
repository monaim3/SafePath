import Link from "next/link";
import { CalendarDays } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { PERIODS, type Period } from "@/lib/safety/types";
import { cn } from "@/components/ui/cn";

const ITEM = "flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-center text-xs font-medium transition-colors";
const ON = "bg-surface text-ink shadow-sm";
const OFF = "text-ink-3 hover:text-ink";

/**
 * "Last 30 days / 90 days / All time". Buttons on the map (onChange), links on area pages (hrefFor),
 * so a filtered area page has its own shareable URL.
 */
export function PeriodSwitch({
  dict,
  value,
  onChange,
  hrefFor,
  className,
}: {
  dict: Dictionary;
  value: Period;
  onChange?: (period: Period) => void;
  hrefFor?: (period: Period) => string;
  className?: string;
}) {
  const t = dict.map.period;
  return (
    <div
      role="group"
      aria-label={t.label}
      className={cn(
        "flex items-center gap-1 self-start rounded-full border border-line bg-glass p-1 shadow-soft backdrop-blur-xl",
        className,
      )}
    >
      <CalendarDays className="ml-2 mr-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
      {PERIODS.map((p) =>
        hrefFor ? (
          <Link key={p} href={hrefFor(p)} scroll={false} aria-current={value === p} className={cn(ITEM, value === p ? ON : OFF)}>
            {t[p]}
          </Link>
        ) : (
          <button
            key={p}
            type="button"
            aria-pressed={value === p}
            onClick={() => onChange?.(p)}
            className={cn(ITEM, value === p ? ON : OFF)}
          >
            {t[p]}
          </button>
        ),
      )}
    </div>
  );
}
