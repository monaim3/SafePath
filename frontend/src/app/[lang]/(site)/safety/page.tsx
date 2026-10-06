import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bus, Moon, Phone, ShieldAlert, Smartphone } from "lucide-react";
import { formatNumber, getDictionary, hasLocale } from "@/i18n";

const SECTION_ICONS = { snatching: ShieldAlert, transport: Bus, night: Moon, fraud: Smartphone } as const;
const SECTION_TINTS = { snatching: "rgb(251 192 45 / 0.3)", transport: "var(--accent-soft)", night: "var(--surface-2)", fraud: "var(--positive-soft)" } as const;

export async function generateMetadata({ params }: PageProps<"/[lang]/safety">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).nav.safety } : {};
}

export default async function SafetyPage({ params }: PageProps<"/[lang]/safety">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const s = dict.safety;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <div className="rise max-w-3xl">
        <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{s.title}</h1>
        <p className="mt-4 text-lg text-ink-2">{s.subtitle}</p>
      </div>

      {/* ---------- Emergency ---------- */}
      <section className="mt-8" aria-labelledby="emergency">
        <h2 id="emergency" className="text-sm font-semibold uppercase tracking-wider text-ink-3">
          {s.emergencyTitle}
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {s.numbers.map((num, i) => (
            <li key={num.dial}>
              <a
                href={`tel:${num.dial}`}
                className={
                  i === 0
                    ? "group flex h-full flex-col justify-between gap-6 rounded-3xl bg-brand-navy p-6 text-white"
                    : "group flex h-full flex-col justify-between gap-6 rounded-3xl border border-line bg-surface p-6"
                }
              >
                <Phone className="size-5 opacity-60 transition-transform group-hover:rotate-12" aria-hidden />
                <div>
                  <span className="block font-display text-5xl font-bold tracking-tight">{num.number}</span>
                  <span className="mt-2 block text-sm opacity-70">{num.label}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">{s.verifyNote}</p>
      </section>

      {/* ---------- Tips ---------- */}
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {s.sections.map((section) => {
          const key = section.key as keyof typeof SECTION_ICONS;
          const Icon = SECTION_ICONS[key] ?? ShieldAlert;
          return (
            <article key={section.key} className="rounded-[2rem] border border-line bg-surface p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span
                  className="grid size-12 place-items-center rounded-2xl text-ink"
                  style={{ background: SECTION_TINTS[key] ?? "var(--surface-2)" }}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="font-display text-2xl font-bold tracking-tight">{section.title}</h2>
              </div>
              <ul className="mt-6 space-y-4">
                {section.tips.map((tip) => (
                  <li key={tip} className="flex gap-3 leading-relaxed text-ink-2">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                    {tip}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      {/* ---------- After an incident ---------- */}
      <section className="mt-10 rounded-[2rem] bg-accent-soft p-6 sm:p-10">
        <h2 className="font-display text-3xl font-bold tracking-tight">{s.afterTitle}</h2>
        <ol className="mt-8 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {s.after.map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent font-display font-bold text-accent-ink">
                {formatNumber(lang, i + 1)}
              </span>
              <p className="pt-1.5 leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
