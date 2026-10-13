"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { cn } from "@/components/ui/cn";

/** How long the green "back online" note stays after the connection returns. */
const BACK_ONLINE_MS = 3000;
/** On a moving bus the signal drops for a few seconds all the time: only say so if it lasts. */
const OFFLINE_GRACE_MS = 10_000;

/**
 * "No internet" banner once the phone has been offline for a while, and a short "back online" when
 * it returns. The app keeps running on saved data meanwhile (see Providers); requests reload on reconnect.
 */
export function NetworkStatus({ dict }: { dict: Dictionary }) {
  // "offline" → banner, "back" → brief green note, null → nothing.
  const [state, setState] = useState<"offline" | "back" | null>(null);

  useEffect(() => {
    let timer = 0;
    const onOffline = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setState("offline"), OFFLINE_GRACE_MS);
    };
    const onOnline = () => {
      window.clearTimeout(timer);
      // A short drop that never showed the banner needs no "back online" either.
      setState((s) => (s === "offline" ? "back" : s));
      timer = window.setTimeout(() => setState(null), BACK_ONLINE_MS);
    };
    // Already offline when the page opened (e.g. the app started from the home screen with no signal).
    if (!navigator.onLine) queueMicrotask(onOffline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!state) return null;
  const back = state === "back";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-3" role="status" aria-live="polite">
      <p
        className={cn(
          "flex max-w-md items-start gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium text-white shadow-soft",
          back ? "bg-positive" : "bg-[#b45309]",
        )}
      >
        {back ? <Wifi className="mt-0.5 size-4 shrink-0" aria-hidden /> : <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />}
        {back ? dict.net.online : dict.net.offline}
      </p>
    </div>
  );
}
