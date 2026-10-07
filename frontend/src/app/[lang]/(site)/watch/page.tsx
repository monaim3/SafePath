import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { WatchManager } from "@/features/watch/WatchManager";

export async function generateMetadata({ params }: PageProps<"/[lang]/watch">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).watch.title } : {};
}

export default async function WatchPage({ params }: PageProps<"/[lang]/watch">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
      <div className="rise mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{dict.watch.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">{dict.watch.subtitle}</p>
      </div>
      <WatchManager locale={lang} dict={dict} />
    </div>
  );
}
