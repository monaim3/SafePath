import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Mail, Phone, Send } from "lucide-react";
import { getDictionary, hasLocale } from "@/i18n";
import { ContactForm } from "@/features/contact/ContactForm";
import { CopyEmail } from "@/features/contact/CopyEmail";

const EMAIL = "monaimmukul75@gmail.com";

export async function generateMetadata({ params }: PageProps<"/[lang]/contact">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).contact.title } : {};
}

export default async function ContactPage({ params }: PageProps<"/[lang]/contact">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const t = dict.contact;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <div className="rise max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{t.subtitle}</p>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-[1.3fr_1fr]">
        {/* the form: messages arrive in the owner's inbox */}
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8" aria-labelledby="contact-form-title">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <Send className="size-6" aria-hidden />
          </span>
          <h2 id="contact-form-title" className="mt-5 font-display text-2xl font-bold">
            {t.form.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.form.intro}</p>
          <div className="mt-6">
            <ContactForm locale={lang} dict={dict} />
          </div>
        </section>

        <div className="space-y-5">
          {/* or email directly */}
          <section className="rounded-3xl border border-line bg-surface p-6">
            <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Mail className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-3">{t.form.orEmail}</p>
            <a href={`mailto:${EMAIL}`} className="mt-1 block font-display text-lg font-bold [overflow-wrap:anywhere] hover:text-accent">
              {EMAIL}
            </a>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`mailto:${EMAIL}?subject=SafePath`}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-soft"
              >
                <Mail className="size-4" aria-hidden />
                {t.write}
              </a>
              <CopyEmail email={EMAIL} label={t.copy} doneLabel={t.copied} />
            </div>
            <h3 className="mt-6 text-sm font-semibold">{t.topicsTitle}</h3>
            <ul className="mt-2.5 space-y-2">
              {t.topics.map((topic) => (
                <li key={topic} className="flex gap-2.5 text-sm leading-relaxed text-ink-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {topic}
                </li>
              ))}
            </ul>
          </section>
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
        </div>
      </div>
    </div>
  );
}
