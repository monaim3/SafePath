import { CheckCircle2, Clock, Search } from "lucide-react";
import { formatNumber, type Dictionary, type Locale } from "@/i18n";
import { explainArea } from "@/lib/safety/explain";
import { formatReason } from "@/lib/safety/reason-text";
import type { AreaDetail } from "@/lib/safety/types";
import { BandBadge } from "@/components/safety/BandBadge";
import { cn } from "@/components/ui/cn";

/** Step 1 preview: search + time-of-day picker. */
function SearchPreview({ dict }: { dict: Dictionary }) {
  const blocks = [5, 6, 7] as const;
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink-3 shadow-sm">
        <Search className="size-4" />
        <span className="truncate">{dict.map.searchPlaceholder}</span>
        <span className="h-4 w-px animate-pulse bg-accent" />
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
          <Clock className="size-3.5" />
          {dict.map.timeLabel}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {blocks.map((b) => (
            <span
              key={b}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                b === 7 ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink-2",
              )}
            >
              {dict.timeBlocks[b]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Step 2 preview: the plain-language reasons behind a level. */
function ReasonsPreview({ area, locale, dict }: { area: AreaDetail; locale: Locale; dict: Dictionary }) {
  const reasons = explainArea(area).slice(0, 3);
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold">{dict.area.whyTitle}</span>
        <span className="flex items-center gap-1.5">
          <span className="font-display text-lg font-extrabold tabular-nums">{formatNumber(locale, area.score)}</span>
          <BandBadge band={area.band} label={dict.bands[area.band]} />
        </span>
      </div>
      <ul className="space-y-2">
        {reasons.map((reason, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-snug text-ink-2">
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-positive" />
            {formatReason(reason, locale, dict)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step 3 preview: comparing a lower-activity route with the fastest one. */
function RoutePreview({ dict }: { dict: Dictionary }) {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex items-center gap-3 rounded-xl border-2 border-accent bg-surface p-3 shadow-sm">
        <span className="h-1.5 w-6 shrink-0 rounded-full bg-brand" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{dict.home.heroRoute}</span>
        <span className="text-[11px] text-ink-3">{dict.home.heroRouteExtra}</span>
        <BandBadge band="low" label={dict.bands.low} />
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/60 p-3">
        <span className="w-6 shrink-0 border-t-2 border-dotted border-ink-3" />
        <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{dict.home.heroFastest}</span>
        <BandBadge band="high" label={dict.bands.high} />
      </div>
      <span className="mt-1 self-start rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white">
        + {dict.home.ctaReport}
      </span>
    </div>
  );
}

export function HowItWorks({
  area,
  locale,
  dict,
}: {
  area: AreaDetail | undefined;
  locale: Locale;
  dict: Dictionary;
}) {
  const previews = [
    <SearchPreview key="search" dict={dict} />,
    area ? <ReasonsPreview key="reasons" area={area} locale={locale} dict={dict} /> : null,
    <RoutePreview key="route" dict={dict} />,
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid items-end gap-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-sm font-semibold text-brand">{dict.home.howEyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-[42px] sm:leading-[1.1]">
            {dict.home.howTitle}
          </h2>
        </div>
        <p className="text-lg leading-relaxed text-ink-2 md:pb-1">{dict.home.howSubtitle}</p>
      </div>

      <ol className="mt-8 grid gap-5 md:grid-cols-3 md:gap-6">
        {dict.home.how.map((step, i) => (
          <li
            key={step.title}
            className="group flex flex-col rounded-[1.75rem] border border-line bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft"
          >
            <div aria-hidden className="h-44 rounded-2xl bg-surface-2 p-4">
              {previews[i]}
            </div>
            <h3 className="mt-6 font-display text-xl font-bold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
