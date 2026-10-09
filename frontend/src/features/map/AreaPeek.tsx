"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, X } from "lucide-react";
import { fill, formatNumber, type Dictionary, type Locale } from "@/i18n";
import { fetchArea } from "@/lib/api/safety";
import { scoreToBand } from "@/lib/safety/bands";
import type { Period } from "@/lib/safety/types";
import { CategoryIcon } from "@/components/safety/CategoryIcon";
import { BandBadge, ConfidenceMeter } from "@/components/safety/BandBadge";
import { buttonClass } from "@/components/ui/Button";
import { hereAtLabel } from "./TimeDock";
import { usePlaceName } from "@/lib/use-place-name";

export function AreaPeek({
  h3,
  hour,
  period = "all",
  locale,
  dict,
  onClose,
}: {
  h3: string;
  /** Selected hour on the map; the headline level follows it. */
  hour: number | "all";
  period?: Period;
  locale: Locale;
  dict: Dictionary;
  onClose: () => void;
}) {
  const { data: area } = useQuery({ queryKey: ["area", h3, period], queryFn: () => fetchArea(h3, period) });
  const place = usePlaceName(h3, locale);
  const placeName = area?.isDemo ? null : place;
  const n = (v: number) => formatNumber(locale, v);
  const score = area ? (hour === "all" ? area.score : area.hours[hour]) : 0;
  const band = scoreToBand(score);

  return (
    <div className="rise rounded-3xl border border-line bg-glass p-5 shadow-soft backdrop-blur-xl">
      {!area ? (
        <p className="py-6 text-center text-sm text-ink-3">{dict.common.loading}</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-ink-3">{placeName ? area.code : dict.home.heroCardArea}</p>
              <h2 className="font-display text-xl font-bold">{placeName ?? area.code}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
              <span className="sr-only">{dict.common.close}</span>
            </button>
          </div>

          <div className="mt-4 flex items-end gap-3">
            <span className="font-display text-5xl font-bold leading-none tabular-nums">{n(score)}</span>
            <div className="pb-1">
              <BandBadge band={band} label={dict.bands[band]} />
            </div>
          </div>
          <p className="mt-2 text-xs font-medium text-ink-2">{hereAtLabel(locale, dict, hour)}</p>

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              {/* Same period as the map, so the count matches the colours. */}
              <dt className="text-xs text-ink-3">{fill(locale, dict.map.reportsIn, { p: dict.map.period[period] })}</dt>
              <dd className="font-semibold tabular-nums">{n(area.reportCount)}</dd>
            </div>
            {area.topCategory && (
              <div>
                <dt className="text-xs text-ink-3">{dict.map.topCategory}</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  <CategoryIcon category={area.topCategory} size="sm" />
                  <span className="truncate">{dict.categories[area.topCategory]}</span>
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex items-center justify-between gap-3">
            <ConfidenceMeter
              level={area.confidence}
              label={dict.confidence.label}
              valueLabel={dict.confidence[area.confidence]}
            />
          </div>

          <Link
            href={`/${locale}/area/${area.h3}${period === "all" ? "" : `?period=${period}`}`}
            className={buttonClass({ className: "mt-5 w-full" })}
          >
            {dict.map.openArea}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </div>
  );
}
