"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { promptInstall } from "@/lib/pwa";
import { LogoMark } from "@/components/ui/Logo";
import { useInstallState, useIsPhone } from "./hooks";

/** First show this long after the visitor arrives… */
const SHOW_AFTER_MS = 12_000;
/** …close by itself after this long unless they interact… */
const AUTO_CLOSE_MS = 5_000;
/** …and offer it at most this often. */
const AGAIN_AFTER_MS = 24 * 60 * 60 * 1000;
const SEEN_KEY = "installPopupSeenAt";
/** Fired by the footer's "Install" link to open the popup on demand. */
export const OPEN_INSTALL_EVENT = "safepath:install";

export function openInstallPopup() {
  window.dispatchEvent(new Event(OPEN_INSTALL_EVENT));
}

function seenRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(SEEN_KEY) ?? 0) < AGAIN_AFTER_MS;
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // private mode: it may show again next visit, that's fine
  }
}

/**
 * Phones only: a small "Install the app" card that slides up ~12 s after arriving and closes itself
 * after 5 s (or with ✕). Never on laptops/desktops, never once installed, at most once a day.
 * Where the browser can't install by button (iPhone), it shows the Add-to-Home-Screen steps.
 */
export function InstallPopup({ dict }: { dict: Dictionary }) {
  const t = dict.watch;
  const phone = useIsPhone();
  const { offer, standalone, ios } = useInstallState();
  const installable = phone && !standalone && offer !== "installed";

  // "auto": timed offer that closes itself; "manual": opened from the footer, stays until closed.
  const [open, setOpen] = useState<"auto" | "manual" | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const close = useCallback(() => {
    setOpen(null);
    setShowSteps(false);
  }, []);

  useEffect(() => {
    if (!installable || seenRecently()) return;
    const id = window.setTimeout(() => {
      markSeen();
      setOpen((o) => o ?? "auto");
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [installable]);

  useEffect(() => {
    const onOpen = () => setOpen("manual");
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
  }, []);

  // Auto-close, unless the person is reading the steps.
  useEffect(() => {
    if (open !== "auto" || showSteps) return;
    const id = window.setTimeout(close, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [open, showSteps, close]);

  if (!open || !installable) return null;

  const install = async () => {
    if (offer === "prompt") {
      close();
      await promptInstall();
    } else {
      setShowSteps(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-popup-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md animate-[install-up_0.35s_ease-out] overflow-hidden rounded-3xl border border-line bg-surface shadow-soft"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white p-1.5">
          <LogoMark className="size-full" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="install-popup-title" className="font-display text-base font-bold leading-tight">
            {t.installPopupTitle}
          </p>
          <p className="mt-1 text-sm leading-snug text-ink-2">{t.installPopupBody}</p>
          {showSteps ? (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
              <Share className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {ios ? t.installIos : t.installManual}
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void install()}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-soft"
              >
                <Download className="size-4" aria-hidden />
                {t.installButton}
              </button>
              <button type="button" onClick={close} className="rounded-full px-3 py-2 text-sm font-medium text-ink-2">
                {t.installLater}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
          <span className="sr-only">{dict.common.close}</span>
        </button>
      </div>
      {open === "auto" && !showSteps && (
        // time left before it closes itself
        <span
          aria-hidden
          className="block h-1 origin-left animate-[install-countdown_linear_forwards] bg-accent"
          style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }}
        />
      )}
    </div>
  );
}
