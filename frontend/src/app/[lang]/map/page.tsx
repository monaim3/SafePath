import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MapScreen } from "@/features/map/MapScreen";

export async function generateMetadata({ params }: PageProps<"/[lang]/map">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).nav.map } : {};
}

export default async function MapPage({ params }: PageProps<"/[lang]/map">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <main>
      <MapScreen locale={lang} dict={dict} header={<SiteHeader locale={lang} dict={dict} floating />} />
    </main>
  );
}
