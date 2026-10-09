import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { Geist, Hind_Siliguri, Montserrat } from "next/font/google";
import localFont from "next/font/local";
import { getDictionary, hasLocale, locales } from "@/i18n";
import { Providers } from "@/components/layout/Providers";
import "../globals.css";

// Geometric heavy sans, matching the logo wordmark.
const display = Montserrat({
  variable: "--font-display-latin",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

const bangla = Hind_Siliguri({
  variable: "--font-bangla",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
});

// Hind Siliguri draws ১ with an unusual hook, so Bangla digits (০–৯) come from a tiny
// Noto Sans Bengali subset instead. unicode-range keeps it to digits only.
const banglaDigits = localFont({
  src: "../fonts/bangla-digits.woff2",
  variable: "--font-bangla-digits",
  weight: "400 800",
  display: "swap",
  declarations: [{ prop: "unicode-range", value: "U+09E6-09EF" }],
});

/** Runs before paint so there is no flash. Dark is the default until the visitor picks a theme. */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const dict = getDictionary(lang);
  return {
    title: { default: dict.meta.title, template: "%s · SafePath" },
    description: dict.meta.description,
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#06101e" },
  ],
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return (
    <html
      lang={lang}
      // Server default; the script below (first load) and ThemeSync (language switch) apply the saved choice.
      data-theme="dark"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${bangla.variable} ${banglaDigits.variable} h-full`}
    >
      <head>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
