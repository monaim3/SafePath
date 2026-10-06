import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Geist, Hind_Siliguri, Montserrat } from "next/font/google";
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

/** Runs before paint so there is no light→dark flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})()`;

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
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${bangla.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
