import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { TrackReports } from "@/features/track/TrackReports";

export async function generateMetadata({ params }: PageProps<"/[lang]/track">): Promise<Metadata> {
  const { lang } = await params;
  // Codes may arrive in the URL (?code=); keep these pages out of search engines.
  return hasLocale(lang) ? { title: getDictionary(lang).track.title, robots: { index: false } } : {};
}

export default async function TrackPage({ params, searchParams }: PageProps<"/[lang]/track">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const { code } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <div className="rise mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{dict.track.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{dict.track.subtitle}</p>
      </div>
      <TrackReports locale={lang} dict={dict} initialCode={typeof code === "string" ? code.slice(0, 20) : ""} />
    </div>
  );
}
