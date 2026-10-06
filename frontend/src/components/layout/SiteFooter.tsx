import type { Dictionary } from "@/i18n";
import { Logo } from "@/components/ui/Logo";

export function SiteFooter({ dict }: { dict: Dictionary }) {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <Logo />
          <p className="text-sm text-ink-2">{dict.footer.tagline}</p>
        </div>
        <div className="space-y-2 text-xs leading-relaxed text-ink-3">
          <p>{dict.common.disclaimer}</p>
          <p className="font-medium text-ink-2">{dict.footer.notOfficial}</p>
          <p>
            Map data ©{" "}
            <a className="underline" href="https://www.openstreetmap.org/copyright">
              OpenStreetMap
            </a>{" "}
            contributors · Tiles{" "}
            <a className="underline" href="https://openfreemap.org">
              OpenFreeMap
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

