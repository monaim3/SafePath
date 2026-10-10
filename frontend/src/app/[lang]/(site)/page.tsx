import Link from "next/link";
import { ArrowRight, MousePointerClick } from "lucide-react";
import { notFound } from "next/navigation";
import { formatHour, getDictionary, hasLocale } from "@/i18n";
import { fetchTopAreas } from "@/lib/api/safety";
import { demoTopAreas } from "@/lib/safety/demo-data";
import { areaPlaceName } from "@/lib/place-name";
import { ButtonLink } from "@/components/ui/Button";
import { Hero3DMapLazy } from "@/components/home/Hero3DMapLazy";
import { HERO_HOURS, type Hotspot } from "@/components/home/hero-hours";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Principles } from "@/components/home/Principles";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const top = await fetchTopAreas(3);
  const topArea = top[0];
  // No reports yet (fresh server): illustrate with a synthetic area, labelled as a demo, not linked.
  const preview = topArea ?? demoTopAreas(1)[0];
  const names = await Promise.all(top.map((a) => (a.isDemo ? null : areaPlaceName(a.h3, lang))));
  // Name tags on the 3D map for the busiest areas.
  const hotspots: Hotspot[] = top.map((a, i) => ({
    h3: a.h3,
    name: names[i] ?? `${a.isDemo ? dict.home.heroCardDemoArea : dict.home.heroCardArea} ${a.code}`,
    score: a.score,
    band: a.band,
  }));

  return (
    <>
      {/* ---------- Hero: text over a slowly turning 3D map of Dhaka ---------- */}
      <section className="relative isolate flex flex-col overflow-x-clip lg:block">
        {/* soft brand glow (clipped sideways so it can't widen the page on phones) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-x-clip">
          <div className="absolute -left-40 -top-40 size-[34rem] rounded-full bg-brand-green/15 blur-3xl" />
        </div>

        {/*
          Phones: the map is a rounded tile under the text.
          lg+: it fills the right side of the hero and fades into the page on the left and bottom.
        */}
        <div className="relative mx-4 mt-2 h-[22rem] overflow-hidden rounded-[2rem] ring-1 ring-line sm:mx-6 sm:h-[26rem] lg:absolute lg:inset-y-0 lg:right-0 lg:m-0 lg:h-auto lg:w-[62%] lg:rounded-none lg:ring-0 lg:[mask-composite:intersect] lg:[mask-image:linear-gradient(to_right,transparent,#000_30%),linear-gradient(to_bottom,#000_78%,transparent)] max-lg:order-last">
          <Hero3DMapLazy
            locale={lang}
            hotspots={hotspots}
            hourLabels={HERO_HOURS.map((h) => formatHour(lang, dict, h))}
            timeTitle={dict.home.hero3dTime}
            ariaLabel={dict.home.hero3dLabel}
            className="absolute inset-0"
          />
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-8 pt-10 sm:px-6 md:pt-14 lg:pointer-events-none lg:min-h-[36rem] lg:grid-cols-[1fr_1fr] lg:pb-16 max-lg:-order-1 [&>*]:pointer-events-auto">
          <div className="rise relative z-10">
            <h1 className="font-display text-[40px] font-extrabold leading-[1.08] tracking-tight sm:text-6xl lg:text-[64px]">
              <span className="block text-balance">{dict.home.titleA}</span>
              <span className="block text-balance text-brand">{dict.home.titleB}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-2">{dict.home.subtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={`/${lang}/map`} size="lg">
                {dict.home.ctaMap}
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href={`/${lang}/report`} size="lg" variant="outline">
                {dict.home.ctaReport}
              </ButtonLink>
            </div>
            <p className="mt-8 hidden items-center gap-2 text-sm text-ink-3 lg:flex">
              <MousePointerClick className="size-4" aria-hidden />
              {dict.home.hero3dHint}
            </p>
          </div>
        </div>
      </section>

      <HowItWorks area={preview} locale={lang} dict={dict} />

      <Principles dict={dict} />

      {/* ---------- Awareness teaser ---------- */}
      {/* no own top/bottom padding: the section above and the footer's margin already space it */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <Link
          href={`/${lang}/safety`}
          className="group flex flex-col justify-between gap-6 rounded-[2rem] border border-line bg-[linear-gradient(115deg,var(--positive-soft),var(--accent-soft))] p-6 sm:flex-row sm:items-center sm:p-10"
        >
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight">{dict.home.awareTitle}</h2>
            <p className="mt-3 leading-relaxed text-ink-2">{dict.home.awareBody}</p>
          </div>
          <span className="inline-flex items-center gap-2 font-medium text-accent">
            {dict.home.awareCta}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>
      </section>
    </>
  );
}
