"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Eye, Users } from "lucide-react";
import { fill, formatNumber, type Dictionary, type Locale } from "@/i18n";
import { fetchTraffic, type KeyCount, type Traffic } from "@/lib/api/moderation";
import { cn } from "@/components/ui/cn";
import { useState } from "react";

type T = Dictionary["mod"]["traffic"];

const shortDate = (locale: Locale, iso: string) =>
  new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Visitors, page views and who's online — refreshed every 30 s. */
export function TrafficPanel({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.mod.traffic;
  const traffic = useQuery({ queryKey: ["mod-traffic"], queryFn: fetchTraffic, refetchInterval: 30_000 });
  const d = traffic.data;
  const n = (v: number | undefined) => (v === undefined ? "—" : formatNumber(locale, v));

  return (
    <section className="mt-6 rounded-3xl border border-line bg-surface p-5" aria-labelledby="traffic-title">
      <h2 id="traffic-title" className="flex items-center gap-2 font-display text-lg font-bold">
        <Users className="size-5 text-accent" aria-hidden />
        {t.title}
      </h2>

      {/* headline numbers */}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 rounded-2xl bg-surface-2 p-4 sm:col-span-1">
          <dt className="flex items-center gap-1.5 text-xs text-ink-3">
            <span className="relative flex size-2.5" aria-hidden>
              {!!d?.online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-positive opacity-60" />}
              <span className={cn("relative inline-flex size-2.5 rounded-full", d?.online ? "bg-positive" : "bg-ink-3")} />
            </span>
            {t.online}
          </dt>
          <dd className="mt-1 font-display text-3xl font-extrabold tabular-nums">{n(d?.online)}</dd>
          <p className="mt-0.5 text-[11px] text-ink-3">{d && d.online === 0 ? t.noneOnline : t.onlineHint}</p>
        </div>
        {[
          { label: t.todayVisitors, value: d?.today.visitors },
          { label: t.todayViews, value: d?.today.views, icon: true },
          { label: t.weekVisitors, value: d?.week.visitors },
          { label: t.monthVisitors, value: d?.month.visitors },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-surface-2 p-4">
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              {s.icon ? <Eye className="size-3.5" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
              {s.label}
            </dt>
            <dd className="mt-1 font-display text-3xl font-extrabold tabular-nums">{n(s.value)}</dd>
          </div>
        ))}
      </dl>

      {d && (
        <>
          {d.onlinePages.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
              <Activity className="size-3.5 text-positive" aria-hidden />
              {d.onlinePages.map((p) => (
                <span key={p.key}>
                  {t.page[p.key as keyof T["page"]] ?? p.key}: <b className="tabular-nums">{n(p.count)}</b>
                </span>
              ))}
            </p>
          )}

          <DailyChart locale={locale} t={t} days={d.days} />

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Devices locale={locale} t={t} rows={d.devicesToday} />
            <TopPages locale={locale} t={t} today={d.pagesToday} week={d.pagesWeek} />
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-ink-3">{t.note}</p>
        </>
      )}
    </section>
  );
}

/** Single series → one hue, no legend (the title names it); hover/focus tooltip per day; table for screen readers. */
function DailyChart({ locale, t, days }: { locale: Locale; t: T; days: Traffic["days"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.visitors));
  const tip = (i: number) =>
    fill(locale, t.chartTip, { date: shortDate(locale, days[i].date), visitors: days[i].visitors, views: days[i].views });

  return (
    <figure className="mt-6">
      <figcaption className="text-sm font-semibold">{t.chartTitle}</figcaption>
      <div className="relative mt-3">
        {/* recessive top gridline with the max value */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
        <span className="absolute -top-2.5 right-0 bg-surface pl-1 text-[10px] tabular-nums text-ink-3" aria-hidden>
          {formatNumber(locale, max)}
        </span>
        <div className="flex h-36 items-end gap-[2px] border-b border-line pt-3" onMouseLeave={() => setActive(null)} aria-hidden>
          {days.map((d, i) => (
            <button
              key={d.date}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className="group relative flex h-full flex-1 items-end"
            >
              <span
                className={cn(
                  "w-full rounded-t-[4px] bg-accent transition-opacity",
                  active !== null && active !== i ? "opacity-40" : "opacity-100",
                )}
                style={{ height: `${d.visitors ? Math.max(3, (d.visitors / max) * 100) : 0}%` }}
              />
            </button>
          ))}
        </div>
        {active !== null && (
          <div
            className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-surface shadow-soft"
            style={{ left: `${((active + 0.5) / days.length) * 100}%` }}
          >
            {tip(active)}
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[10px] text-ink-3" aria-hidden>
          <span>{shortDate(locale, days[0].date)}</span>
          <span>{shortDate(locale, days[Math.floor(days.length / 2)].date)}</span>
          <span>{shortDate(locale, days[days.length - 1].date)}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>{t.chartTitle}</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d.date}>
              <td>{tip(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Devices({ locale, t, rows }: { locale: Locale; t: T; rows: KeyCount[] }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div>
      <h3 className="text-sm font-semibold">{t.devices}</h3>
      {total === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{t.empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {(["phone", "app", "computer"] as const).map((key) => {
            const count = rows.find((r) => r.key === key)?.count ?? 0;
            return (
              <li key={key}>
                <div className="flex justify-between text-sm">
                  <span className="text-ink-2">{t.device[key]}</span>
                  <span className="tabular-nums">
                    {formatNumber(locale, count)}{" "}
                    <span className="text-ink-3">({formatNumber(locale, Math.round((count / total) * 100))}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden>
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(count / total) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TopPages({ locale, t, today, week }: { locale: Locale; t: T; today: KeyCount[]; week: KeyCount[] }) {
  const [range, setRange] = useState<"today" | "week">("today");
  const rows = (range === "today" ? today : week).slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.pages}</h3>
        <div className="flex rounded-full bg-surface-2 p-0.5 text-xs" role="group">
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
              className={cn("rounded-full px-2.5 py-1", range === r ? "bg-surface font-semibold shadow-sm" : "text-ink-3")}
            >
              {r === "today" ? t.pagesToday : t.pagesWeek}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{t.empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex justify-between text-sm">
                <span className="text-ink-2">{t.page[r.key as keyof T["page"]] ?? r.key}</span>
                <span className="tabular-nums">{formatNumber(locale, r.count)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
