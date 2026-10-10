import Link from "next/link";
import { BellRing } from "lucide-react";
import { fill, formatYear, type Dictionary, type Locale } from "@/i18n";
import { Logo } from "@/components/ui/Logo";

/*
 * Map credits (© OpenStreetMap, OpenFreeMap, Esri) are shown inside every map, as their licences
 * require wherever the map appears — so they aren't repeated here.
 */
export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const f = dict.footer;
  const columns = [
    {
      title: f.explore,
      links: [
        { href: "/map", label: dict.nav.map },
        { href: "/safety", label: dict.nav.safety },
        { href: "/report", label: dict.home.ctaReport },
      ],
    },
    {
      title: f.about,
      links: [
        { href: "/rules", label: f.rules },
        { href: "/watch", label: dict.watch.footerLink },
        { href: "/contact", label: f.contact },
      ],
    },
  ];

  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-sm text-sm leading-relaxed text-ink-2">{f.tagline}</p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={`/${locale}${l.href}`}
                      className="inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
                    >
                      {l.href === "/watch" && <BellRing className="size-3.5 text-accent" aria-hidden />}
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-xs leading-relaxed text-ink-3 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl space-y-1">
            <p>{dict.common.disclaimer}</p>
            <p className="font-medium text-ink-2">{f.notOfficial}</p>
          </div>
          <p className="shrink-0">{fill(locale, f.rights, { year: formatYear(locale, new Date().getFullYear()) })}</p>
        </div>
      </div>
    </footer>
  );
}
