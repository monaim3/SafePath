import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CreditCard,
  FileText,
  MapPin,
  Megaphone,
  Phone,
  PhoneCall,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { formatNumber, getDictionary, hasLocale } from "@/i18n";
import { FluentIcon, type IconName } from "@/components/safety/CategoryIcon";
import { ButtonLink } from "@/components/ui/Button";

/** Fluent 3D icon + accent colour per tip topic. */
const TOPICS: Record<string, { icon: IconName; tint: string }> = {
  snatching: { icon: "motorbike", tint: "#e53935" },
  transport: { icon: "rickshaw_cng", tint: "#2cb468" },
  night: { icon: "well_lit", tint: "#f9a825" },
};
const FALLBACK_TOPIC = { icon: "kind_incident" as IconName, tint: "#1a73e8" };

/** One icon per "if something happens" step, in order. */
const STEP_ICONS: LucideIcon[] = [MapPin, PhoneCall, Smartphone, CreditCard, FileText, Megaphone];

/** Frosted glass on the dark brand panel (same recipe as the home page's principles). */
const GLASS =
  "bg-white/[0.12] backdrop-blur-2xl ring-1 ring-white/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_24px_48px_-24px_rgb(2_12_40/0.55)]";

function BrandMesh() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="absolute -left-24 -bottom-40 size-[28rem] rounded-full bg-[#4cbb3f] opacity-60 blur-[110px]" />
      <div className="absolute left-[35%] top-[15%] size-[24rem] rounded-full bg-[#00b8b0] opacity-60 blur-[110px]" />
      <div className="absolute -right-24 -top-40 size-[28rem] rounded-full bg-[#12b5ea] opacity-60 blur-[110px]" />
      <div className="absolute -bottom-24 right-[10%] size-[22rem] rounded-full bg-[#0a6fd6] opacity-80 blur-[100px]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/[lang]/safety">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).nav.safety } : {};
}

export default async function SafetyPage({ params }: PageProps<"/[lang]/safety">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const s = dict.safety;
  const [primary, ...others] = s.numbers;
  const n = (v: number) => formatNumber(lang, v);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      {/* ---------- Header + emergency panel ---------- */}
      <section className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-40 -top-40 size-[30rem] rounded-full bg-brand-green/15 blur-3xl" />
        </div>
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          <div className="rise">
            <span className="inline-flex rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-brand">
              {s.eyebrow}
            </span>
            <h1 className="mt-4 text-balance font-display text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
              {s.title}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-2">{s.subtitle}</p>

            {/* jump to a topic */}
            <nav aria-label={s.eyebrow} className="mt-8 flex flex-wrap gap-2">
              {[...s.sections.map((sec) => ({ id: sec.key, title: sec.title })), { id: "after", title: s.afterTitle }].map(
                (topic) => (
                  <a
                    key={topic.id}
                    href={`#${topic.id}`}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
                  >
                    {topic.title}
                  </a>
                ),
              )}
            </nav>
          </div>

          <section
            aria-labelledby="emergency"
            className="rise relative isolate overflow-hidden rounded-[2rem] bg-[#062a5e] p-5 text-white shadow-[0_30px_80px_-30px_rgb(10_47_115/0.55)] [animation-delay:120ms] sm:p-7"
          >
            <BrandMesh />
            <h2 id="emergency" className="text-xs font-semibold uppercase tracking-wider text-white/75">
              {s.emergencyTitle}
            </h2>

            <a
              href={`tel:${primary.dial}`}
              className={`group mt-4 flex items-center gap-5 rounded-3xl p-5 transition-transform hover:-translate-y-0.5 ${GLASS}`}
            >
              <span className="relative grid size-16 shrink-0 place-items-center rounded-2xl bg-white text-[#062a5e]">
                <span aria-hidden className="absolute inset-0 animate-ping rounded-2xl bg-white/50 [animation-duration:2s]" />
                <Phone className="relative size-7 transition-transform group-hover:rotate-12" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-6xl font-extrabold leading-none tracking-tight">
                  {primary.number}
                </span>
                <span className="mt-2 block text-sm text-white/85">{primary.label}</span>
              </span>
              <span className="ml-auto hidden shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#062a5e] sm:inline">
                {s.tapToCall}
              </span>
            </a>

            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {others.map((num) => (
                <li key={num.dial}>
                  <a
                    href={`tel:${num.dial}`}
                    className={`group flex h-full items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/20 ${GLASS}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
                      <Phone className="size-4 transition-transform group-hover:rotate-12" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-display text-2xl font-bold leading-none">{num.number}</span>
                      <span className="mt-1 block text-xs leading-snug text-white/80">{num.label}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-white/65">{s.verifyNote}</p>
          </section>
        </div>
      </section>

      {/* ---------- Tips ---------- */}
      <section className="mt-12 grid gap-5 md:grid-cols-3">
        {s.sections.map((section) => {
          const topic = TOPICS[section.key] ?? FALLBACK_TOPIC;
          return (
            <article
              key={section.key}
              id={section.key}
              className="group relative scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-line bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-soft"
            >
              <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: topic.tint }} />
              <FluentIcon name={topic.icon} tint={topic.tint} size="lg" />
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">{section.title}</h2>
              <ol className="mt-5 divide-y divide-line">
                {section.tips.map((tip, i) => (
                  <li key={tip} className="flex gap-3 py-3 text-[15px] leading-relaxed text-ink-2 first:pt-0 last:pb-0">
                    <span
                      className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold"
                      style={{ background: `${topic.tint}1f`, color: topic.tint }}
                    >
                      {n(i + 1)}
                    </span>
                    {tip}
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
      </section>

      {/* ---------- If something happens: step by step ---------- */}
      <section
        id="after"
        className="relative isolate mt-12 scroll-mt-24 overflow-hidden rounded-[2rem] bg-[#062a5e] p-6 text-white sm:p-10 lg:p-12"
      >
        <BrandMesh />
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-[40px] sm:leading-[1.1]">
            {s.afterTitle}
          </h2>
          <p className="mt-3 text-lg text-white/85">{s.afterBody}</p>
        </div>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {s.after.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? FileText;
            const last = i === s.after.length - 1;
            return (
              <li key={step} className={`flex flex-col rounded-3xl p-5 ${GLASS}`}>
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-white text-[#062a5e]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-display text-3xl font-extrabold text-white/30">{n(i + 1)}</span>
                </div>
                <p className="mt-4 leading-relaxed">{step}</p>
                {last && (
                  <Link
                    href={`/${lang}/report`}
                    className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#062a5e] transition-transform hover:translate-x-0.5"
                  >
                    {dict.home.ctaReport}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-8 flex justify-center">
        <ButtonLink href={`/${lang}/map`} variant="outline" size="lg">
          {dict.home.ctaMap}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
