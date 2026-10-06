import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { ModDashboard } from "@/features/mod/ModDashboard";

export async function generateMetadata({ params }: PageProps<"/[lang]/mod">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: hasLocale(lang) ? getDictionary(lang).mod.title : undefined,
    // Internal tool: keep it out of search engines.
    robots: { index: false, follow: false },
  };
}

export default async function ModPage({ params }: PageProps<"/[lang]/mod">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <h1 className="font-display text-4xl font-bold tracking-tight">{dict.mod.title}</h1>
      <p className="mt-2 text-ink-2">{dict.mod.subtitle}</p>
      <ModDashboard locale={lang} dict={dict} />
    </div>
  );
}
