import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { fetchTopAreas } from "@/lib/api/safety";
import { demoTopAreas } from "@/lib/safety/demo-data";
import { areaPlaceName } from "@/lib/place-name";
import { ButtonLink } from "@/components/ui/Button";
import { HeroVisual } from "@/components/home/HeroVisual";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Principles } from "@/components/home/Principles";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const [topArea] = await fetchTopAreas(1);
  // No reports yet (fresh server): illustrate with a synthetic area, labelled as a demo, not linked.
  const preview = topArea ?? demoTopAreas(1)[0];
  const topPlace = topArea && !topArea.isDemo ? await areaPlaceName(topArea.h3, lang) : null;

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative isolate">
        {/* soft brand glow (clipped sideways so it can't widen the page on phones) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-x-clip">
          <div className="absolute -left-40 -top-40 size-[34rem] rounded-full bg-brand-green/15 blur-3xl" />
          <div className="absolute -right-32 top-10 size-[30rem] rounded-full bg-brand-blue/15 blur-3xl" />
        </div>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-8 pt-10 lg:items-start sm:px-6 md:pt-14 lg:grid-cols-[1.05fr_1fr]">
          <div className="rise">
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
          </div>

          <div className="rise [animation-delay:150ms]">
            {topArea ? (
              <Link
                href={`/${lang}/area/${topArea.h3}`}
                aria-label={topPlace ?? `${dict.home.heroCardArea} ${topArea.code}`}
                className="block transition-transform duration-300 hover:-translate-y-1"
              >
                <HeroVisual area={topArea} locale={lang} dict={dict} placeName={topPlace} />
              </Link>
            ) : (
              preview && <HeroVisual area={preview} locale={lang} dict={dict} />
            )}
          </div>
        </div>
      </section>

      <HowItWorks area={preview} locale={lang} dict={dict} />

      <Principles dict={dict} />

      {/* ---------- Awareness teaser ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
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
