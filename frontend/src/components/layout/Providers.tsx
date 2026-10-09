"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { startPwa } from "@/lib/pwa";

/** The visitor's saved theme; dark unless they picked light. */
export function savedTheme(): "dark" | "light" {
  try {
    return localStorage.getItem("theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } } }),
  );
  // Switching language swaps the root layout, which re-renders <html> without the inline theme
  // script running again — re-apply the saved theme before paint so it never flips.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = savedTheme();
  }, []);
  // Service worker (area-watch notifications) + catch the browser's install offer early.
  useEffect(() => startPwa(), []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
