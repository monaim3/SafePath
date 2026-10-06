import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidCell } from "h3-js";
import { getDictionary, hasLocale } from "@/i18n";
import { QuickReport } from "@/features/report/QuickReport";

export async function generateMetadata({ params }: PageProps<"/[lang]/report">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: getDictionary(lang).nav.report } : {};
}

export default async function ReportPage({ params, searchParams }: PageProps<"/[lang]/report">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);
  const { h3 } = await searchParams;
  const initialH3 = typeof h3 === "string" && isValidCell(h3) ? h3 : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      {/* The form renders its own heading so the success screen can hide it. */}
      <QuickReport locale={lang} dict={dict} initialH3={initialH3} />
    </div>
  );
}
