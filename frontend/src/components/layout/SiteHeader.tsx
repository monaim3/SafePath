import Link from "next/link";
import { Plus } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";
import { LanguageSwitch, NavLinks, ThemeToggle } from "./HeaderControls";

export function SiteHeader({
  locale,
  dict,
  floating = false,
}: {
  locale: Locale;
  dict: Dictionary;
  /** Map page: header floats over the map as a glass bar. */
  floating?: boolean;
}) {
  const items = [
    { href: "/map", label: dict.nav.map },
    { href: "/safety", label: dict.nav.safety },
  ];

  return (
    <header
      className={cn(
        "z-30",
        floating
          ? "pointer-events-none absolute inset-x-0 top-0 p-3"
          : "sticky top-0 border-b border-line/60 bg-bg/80 backdrop-blur-xl",
      )}
    >
      <div
        className={cn(
          "mx-auto flex h-14 items-center gap-3",
          floating
            ? "pointer-events-auto rounded-2xl border border-line bg-glass px-3 shadow-soft backdrop-blur-xl"
            : "max-w-6xl px-4 sm:px-6",
        )}
      >
        <Link href={`/${locale}`} className="mr-2 shrink-0" aria-label="SafePath home">
          <Logo />
        </Link>
        <NavLinks locale={locale} items={items} className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitch locale={locale} label={dict.common.language} />
          <ThemeToggle lightLabel={dict.common.themeLight} darkLabel={dict.common.themeDark} />
          {/* Wrapper carries the visibility: `hidden` would lose to the button's own `inline-flex`. */}
          <span className="ml-1 hidden sm:block">
            <ButtonLink href={`/${locale}/report`} variant="accent">
              <Plus className="size-4" aria-hidden />
              {dict.nav.reportCta}
            </ButtonLink>
          </span>
          <Link
            href={`/${locale}/report`}
            aria-label={dict.nav.reportCta}
            className="grid size-10 place-items-center rounded-full bg-brand text-white sm:hidden"
          >
            <Plus className="size-5" aria-hidden />
          </Link>
        </div>
      </div>
      {!floating && (
        <NavLinks
          locale={locale}
          items={[...items, { href: "/report", label: dict.nav.report }]}
          className="justify-center border-t border-line/60 py-1.5 md:hidden"
        />
      )}
    </header>
  );
}
