import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default async function SiteLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDictionary(lang);

  return (
    <>
      <SiteHeader locale={lang} dict={dict} />
      <main>{children}</main>
      <SiteFooter dict={dict} />
    </>
  );
}
