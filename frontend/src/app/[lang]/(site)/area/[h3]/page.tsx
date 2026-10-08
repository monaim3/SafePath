import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Minus,
  Phone,
  Plus,
} from "lucide-react";
import { fill, formatNumber, getDictionary, hasLocale } from "@/i18n";
import { fetchArea, fetchAreaNews, fetchAreaVideos } from "@/lib/api/safety";
import type { CategoryKey } from "@/lib/safety/categories";
import { CategoryIcon } from "@/components/safety/CategoryIcon";
import { explainArea } from "@/lib/safety/explain";
import { formatReason } from "@/lib/safety/reason-text";
import { PERIODS, type Period, type SourceKey } from "@/lib/safety/types";
import { PeriodSwitch } from "@/features/map/PeriodSwitch";
import { BandBadge, ConfidenceMeter } from "@/components/safety/BandBadge";
import { ScoreRing } from "@/components/safety/ScoreRing";
import { TimeStrip } from "@/components/safety/TimeStrip";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardHint, CardTitle } from "@/components/ui/Card";
import { KnowledgeList } from "@/features/area/KnowledgeList";
import { FollowAreaButton } from "@/features/watch/FollowAreaButton";
import { areaPlaceName } from "@/lib/place-name";

export async function generateMetadata({ params }: PageProps<"/[lang]/area/[h3]">): Promise<Metadata> {
  const { lang, h3 } = await params;
  if (!hasLocale(lang)) return {};
  const [area, place] = await Promise.all([fetchArea(h3), areaPlaceName(h3, lang)]);
  const home = getDictionary(lang).home;
  if (!area) return {};
  return { title: area.isDemo || !place ? `${area.isDemo ? home.heroCardDemoArea : home.heroCardArea} ${area.code}` : place };
}

/** Which awareness section fits the way chhintai most often happens in an area. */
function tipsSectionFor(category: CategoryKey | null): string {
  if (category === "rickshaw_cng" || category === "bus") return "transport";
  if (category === "on_foot" || category === "weapon") return "night";
  return "snatching";
}

const SOURCE_STYLES: Record<SourceKey, string> = {
  verified: "var(--accent)",
  community: "var(--ral-2)",
  media: "var(--ink-3)",
  official: "var(--ink)",
};

export default async function AreaPage({ params, searchParams }: PageProps<"/[lang]/area/[h3]">) {
  const { lang, h3 } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const raw = (await searchParams).period;
  const period: Period = PERIODS.includes(raw as Period) ? (raw as Period) : "all";
  const [area, videos, news, place] = await Promise.all([
    fetchArea(h3, period),
    fetchAreaVideos(h3),
    fetchAreaNews(h3, period),
    areaPlaceName(h3, lang),
  ]);
  if (!area) notFound();
  // Demo areas sit on synthetic points, so a real place name would mislead.
  const placeName = area.isDemo ? null : place;
  const videoDate = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  const n = (v: number) => formatNumber(lang, v);
  const reasons = explainArea(area);
  const catTotal = area.categories.reduce((s, c) => s + c.count, 0);
  const sourceTotal = Object.values(area.sources).reduce((s, v) => s + v, 0);
  const tips = dict.safety.sections.find((s) => s.key === tipsSectionFor(area.topCategory));
  const TrendIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus }[area.trend.direction];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/${lang}/map`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {dict.nav.map}
        </Link>
        <PeriodSwitch
          dict={dict}
          value={period}
          hrefFor={(p) => `/${lang}/area/${h3}${p === "all" ? "" : `?period=${p}`}`}
        />
      </div>

      {/* ---------- Header ---------- */}
      <header className="rise mt-6 flex flex-col gap-8 rounded-[2rem] border border-line bg-surface p-6 sm:p-8 md:flex-row md:items-center">
        <ScoreRing
          score={area.insufficient ? 0 : area.score}
          display={area.insufficient ? "—" : n(area.score)}
          caption={dict.common.of100}
        />
        <div className="flex-1">
          <p className="text-sm text-ink-3">{dict.area.ralLabel}</p>
          <h1 className="mt-1 text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {placeName ?? `${area.isDemo ? dict.home.heroCardDemoArea : dict.home.heroCardArea} ${area.code}`}
          </h1>
          {placeName && <p className="mt-1 text-sm text-ink-3">{fill(lang, dict.area.codeLabel, { code: area.code })}</p>}
          {area.insufficient ? (
            <p className="mt-3 text-ink-2">
              {dict.common.insufficient}. {dict.common.insufficientHint}
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <BandBadge band={area.band} label={dict.bands[area.band]} className="px-3 py-1 text-sm" />
              <ConfidenceMeter
                level={area.confidence}
                label={dict.confidence.label}
                valueLabel={dict.confidence[area.confidence]}
              />
              <span className="text-sm text-ink-3">
                {fill(lang, dict.area.basis, { n: area.reportCount, p: area.verifiedPct })}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 self-start md:self-center">
          <ButtonLink href={`/${lang}/report?h3=${area.h3}`} variant="outline">
            <Plus className="size-4" aria-hidden />
            {dict.area.reportHere}
          </ButtonLink>
          <FollowAreaButton h3={area.h3} locale={lang} dict={dict} />
        </div>
      </header>

      {area.busyArea && (
        <p className="mt-4 flex gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {dict.area.busyNote}
        </p>
      )}

      {!area.insufficient && (
        <div className="mt-4 grid gap-4 md:grid-cols-6">
          {/* Why */}
          <Card className="md:col-span-3">
            <CardTitle>{dict.area.whyTitle}</CardTitle>
            <ul className="mt-4 space-y-3">
              {reasons.map((reason, i) => (
                <li key={i} className="flex gap-3 text-[15px]">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
                  {formatReason(reason, lang, dict)}
                </li>
              ))}
            </ul>
          </Card>

          {/* Recent + trend */}
          <Card className="md:col-span-3">
            <CardTitle>{dict.area.recentTitle}</CardTitle>
            <dl className="mt-4 grid grid-cols-3 gap-3">
              {(["d7", "d30", "d90"] as const).map((k) => (
                <div key={k} className="rounded-2xl bg-surface-2 p-3">
                  <dd className="font-display text-3xl font-bold tabular-nums">{n(area.counts[k])}</dd>
                  <dt className="mt-1 text-xs text-ink-3">{dict.area[k]}</dt>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
              <span className="grid size-9 place-items-center rounded-full bg-surface-2">
                <TrendIcon className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  {dict.area.trendTitle}: {dict.area.trend[area.trend.direction]}
                </p>
                <p className="text-xs text-ink-3">
                  {fill(lang, dict.area.trendLine, { curr: area.trend.curr, prev: area.trend.prev })}
                </p>
              </div>
            </div>
          </Card>

          {/* When */}
          <Card className="md:col-span-4">
            <CardTitle>{dict.area.whenTitle}</CardTitle>
            <CardHint>{dict.area.whenHint}</CardHint>
            <div className="mt-5">
              <TimeStrip values={area.timeBlocks} labels={dict.timeBlocks} bandLabels={dict.bands} />
            </div>
          </Card>

          {/* Most reported */}
          <Card className="md:col-span-2">
            <CardTitle>{dict.area.mostReported}</CardTitle>
            <ul className="mt-4 space-y-3">
              {area.categories.map((c) => (
                <li key={c.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <CategoryIcon category={c.key} size="sm" />
                      <span className="truncate">{dict.categories[c.key]}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{n(c.count)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${catTotal ? (c.count / catTotal) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {/* Locals */}
          {area.knowledge.length > 0 && (
            <Card className="md:col-span-4">
              <CardTitle>{dict.area.localsTitle}</CardTitle>
              <CardHint>{dict.area.localsHint}</CardHint>
              <div className="mt-4">
                <KnowledgeList entries={area.knowledge} locale={lang} dict={dict} />
              </div>
            </Card>
          )}

          {/* Sources */}
          <Card className={area.knowledge.length > 0 ? "md:col-span-2" : "md:col-span-3"}>
            <CardTitle>{dict.area.sourceTitle}</CardTitle>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-2">
              {(Object.keys(area.sources) as SourceKey[]).map((k) =>
                area.sources[k] > 0 ? (
                  <span
                    key={k}
                    style={{ width: `${(area.sources[k] / sourceTotal) * 100}%`, background: SOURCE_STYLES[k] }}
                  />
                ) : null,
              )}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {(Object.keys(area.sources) as SourceKey[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: SOURCE_STYLES[k] }} />
                  <span className="text-ink-2">{dict.sources[k]}</span>
                  <span className="ml-auto font-semibold tabular-nums">{n(area.sources[k])}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Good signs */}
          {area.positives.length > 0 && (
            <Card className={area.knowledge.length > 0 ? "md:col-span-6" : "md:col-span-3"}>
              <CardTitle>{dict.area.positivesTitle}</CardTitle>
              <ul className="mt-3 flex flex-wrap gap-2">
                {area.positives.map((p) => (
                  <li key={p.key} className="inline-flex items-center gap-2 rounded-full bg-positive-soft py-1 pl-1 pr-3 text-sm text-positive">
                    <CategoryIcon category={p.key} size="sm" className="rounded-full" />
                    {dict.categories[p.key]} · {n(p.count)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* ---------- Published news reports behind this area ---------- */}
      {news.length > 0 && (
        <Card className="mt-4">
          <CardTitle>{dict.area.newsTitle}</CardTitle>
          <CardHint>{dict.area.newsHint}</CardHint>
          <ul className="mt-4 divide-y divide-line">
            {news.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <CategoryIcon category={item.category} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold group-hover:text-accent">{item.outlet}</span>
                    <span className="block text-xs text-ink-3">
                      {dict.categories[item.category]}
                      {item.date && ` · ${videoDate.format(new Date(item.date))}`}
                    </span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-ink-3 group-hover:text-accent" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---------- Footage (moderator-approved, sound removed) ---------- */}
      {videos.length > 0 && (
        <Card className="mt-4">
          <CardTitle>{dict.area.videosTitle}</CardTitle>
          <p className="mt-1 flex items-start gap-2 text-sm text-ink-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {dict.area.videosHint}
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <li key={v.id}>
                <video
                  src={v.url}
                  poster={v.poster}
                  controls
                  muted
                  preload="none"
                  playsInline
                  className="aspect-video w-full rounded-2xl bg-black"
                />
                <p className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                  <CategoryIcon category={v.category} size="sm" />
                  <span className="truncate">{dict.categories[v.category]}</span>
                  {v.date && <span className="ml-auto shrink-0 text-xs text-ink-3">{videoDate.format(new Date(v.date))}</span>}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ---------- Awareness ---------- */}
      <div className="mt-4 grid gap-4 md:grid-cols-5">
        {tips && (
          <Card className="md:col-span-3">
            <CardTitle>
              {dict.area.tipsTitle} — {tips.title}
            </CardTitle>
            <ul className="mt-4 space-y-3">
              {tips.tips.map((tip) => (
                <li key={tip} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <section className="relative overflow-hidden rounded-3xl bg-brand-navy p-5 text-white sm:p-6 md:col-span-2">
          <h2 className="text-sm font-semibold tracking-tight">{dict.area.ifHappensTitle}</h2>
          <p className="mt-2 text-sm opacity-70">{dict.area.ifHappensBody}</p>
          <ul className="mt-4 space-y-2">
            {dict.safety.numbers.map((num) => (
              <li key={num.dial}>
                <a
                  href={`tel:${num.dial}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/15 p-3 transition-colors hover:bg-white/10"
                >
                  <Phone className="size-4 shrink-0 text-brand-cyan" aria-hidden />
                  <span className="font-display text-xl font-bold">{num.number}</span>
                  <span className="text-xs opacity-70">{num.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <Link href={`/${lang}/safety`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-cyan">
            {dict.home.awareCta}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-ink-3">{dict.common.disclaimer}</p>
    </div>
  );
}
