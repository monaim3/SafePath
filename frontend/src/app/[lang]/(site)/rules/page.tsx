import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Ban, Eye, Film, Lock, Map, ShieldCheck, Timer, type LucideIcon } from "lucide-react";
import { getDictionary, hasLocale } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";

/** One icon + accent per section key (text lives in the dictionary). */
const SECTIONS: Record<string, { icon: LucideIcon; tint: string }> = {
  limits: { icon: Timer, tint: "#1a73e8" },
  what: { icon: Eye, tint: "#2cb468" },
  privacy: { icon: Lock, tint: "#00a99d" },
  trust: { icon: ShieldCheck, tint: "#fb8c00" },
  map: { icon: Map, tint: "#0a6fd6" },
  video: { icon: Film, tint: "#8e44ad" },
  not: { icon: Ban, tint: "#e53935" },
};

export async function generateMetadata({ params }: PageProps<"/[lang]/rules">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).rules.title } : {};
}

export default async function RulesPage({ params }: PageProps<"/[lang]/rules">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.rules;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <div className="rise max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{t.subtitle}</p>
      </div>

      {/* jump links */}
      <nav aria-label={t.title} className="mt-6 flex flex-wrap gap-2">
        {t.sections.map((s) => (
          <a
            key={s.key}
            href={`#${s.key}`}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {t.sections.map((s) => {
          const meta = SECTIONS[s.key] ?? SECTIONS.limits;
          const Icon = meta.icon;
          return (
            <section
              key={s.key}
              id={s.key}
              className="scroll-mt-24 rounded-[1.75rem] border border-line bg-surface p-6"
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-2xl"
                  style={{ background: `${meta.tint}1f`, color: meta.tint }}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="font-display text-xl font-bold tracking-tight">{s.title}</h2>
              </div>
              <ul className="mt-4 space-y-3">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full" style={{ background: meta.tint }} />
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-3xl bg-surface-2 p-6 sm:flex-row sm:items-center">
        <p className="text-sm leading-relaxed text-ink-2">
          {t.contactLine}{" "}
          <Link href={`/${lang}/contact`} className="font-medium text-accent hover:underline">
            {dict.footer.contact}
          </Link>
        </p>
        <ButtonLink href={`/${lang}/report`} variant="accent">
          {dict.home.ctaReport}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </div>
  );
}
