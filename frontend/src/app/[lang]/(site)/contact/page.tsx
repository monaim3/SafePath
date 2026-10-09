import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Mail, Phone, ShieldCheck } from "lucide-react";
import { getDictionary, hasLocale } from "@/i18n";
import { CopyEmail } from "@/features/contact/CopyEmail";

const EMAIL = "monaimmukul75@gmail.com";

export async function generateMetadata({ params }: PageProps<"/[lang]/contact">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).contact.title } : {};
}

export default async function ContactPage({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getDictionary(lang).contact;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <div className="rise max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{t.subtitle}</p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-[1.3fr_1fr]">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Mail className="size-6" aria-hidden />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-3">{t.emailLabel}</p>
          <a href={`mailto:${EMAIL}`} className="mt-1 block font-display text-xl font-bold [overflow-wrap:anywhere] hover:text-accent sm:text-2xl">
            {EMAIL}
          </a>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`mailto:${EMAIL}?subject=SafePath`}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-soft"
            >
              <Mail className="size-4" aria-hidden />
              {t.write}
            </a>
            <CopyEmail email={EMAIL} label={t.copy} doneLabel={t.copied} />
          </div>

          <h2 className="mt-8 text-sm font-semibold">{t.topicsTitle}</h2>
          <ul className="mt-3 space-y-2.5">
            {t.topics.map((topic) => (
              <li key={topic} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {topic}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-5">
          <section className="rounded-3xl bg-brand-navy p-6 text-white">
            <h2 className="font-display text-xl font-bold">{t.emergencyTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/80">{t.emergencyBody}</p>
            <a
              href="tel:999"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-display text-lg font-bold text-brand-navy"
            >
              <Phone className="size-4" aria-hidden />
              {lang === "bn" ? "৯৯৯" : "999"}
            </a>
          </section>
          <p className="flex gap-2.5 rounded-3xl bg-surface-2 p-5 text-sm leading-relaxed text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {t.privacyNote}
          </p>
        </div>
      </div>
    </div>
  );
}
