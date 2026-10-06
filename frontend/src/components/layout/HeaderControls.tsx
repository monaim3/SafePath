"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import type { Locale } from "@/i18n";
import { cn } from "@/components/ui/cn";

export function NavLinks({
  locale,
  items,
  className,
}: {
  locale: Locale;
  items: { href: string; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex items-center gap-1", className)}>
      {items.map((item) => {
        const href = `/${locale}${item.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-2 text-sm transition-colors",
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const target: Locale = locale === "bn" ? "en" : "bn";
  const href = pathname.replace(/^\/(bn|en)(?=\/|$)/, `/${target}`);
  return (
    <Link
      href={href}
      hrefLang={target}
      onClick={() => {
        document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
    >
      {label}
    </Link>
  );
}

export function ThemeToggle({ lightLabel, darkLabel }: { lightLabel: string; darkLabel: string }) {
  function toggle() {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // storage unavailable — theme still applies for this visit
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Moon className="size-[18px] dark:hidden" aria-hidden />
      <Sun className="hidden size-[18px] dark:block" aria-hidden />
      <span className="sr-only dark:hidden">{darkLabel}</span>
      <span className="sr-only hidden dark:inline">{lightLabel}</span>
    </button>
  );
}
