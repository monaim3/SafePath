"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PING_EVERY_MS, sendHit } from "@/lib/api/analytics";

/** Counts page views and keeps "online now" fresh while this tab is visible. Renders nothing. */
export function VisitTracker() {
  const path = usePathname();

  useEffect(() => {
    if (path) sendHit(path, "view");
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const ping = () => {
      if (document.visibilityState === "visible") sendHit(path, "ping");
    };
    const id = window.setInterval(ping, PING_EVERY_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [path]);

  return null;
}
