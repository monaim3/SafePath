"use client";

import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";
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

/**
 * Public map data is kept on the device (IndexedDB), so on a weak or lost connection the map, routes
 * and trip warnings keep working from the last copy instead of failing. Only these queries are saved —
 * never report tracking codes or anything personal.
 */
const SAVED_QUERIES = new Set(["street-day", "map-cells", "city-time-profile", "area", "place-name", "places", "routes"]);
const SAVED_FOR_MS = 7 * 24 * 60 * 60_000;

// IndexedDB can be missing or blocked (private mode, full disk): then nothing is saved, nothing breaks.
const persister = createAsyncStoragePersister({
  key: "safepath-data",
  throttleTime: 3_000,
  storage: {
    getItem: (key: string) => idbGet<string>(key).catch(() => undefined),
    setItem: (key: string, value: string) => idbSet(key, value).catch(() => undefined),
    removeItem: (key: string) => idbDel(key).catch(() => undefined),
  },
});

/** Retry a failed request quietly, waiting longer each time (1 s, 2 s, 4 s, 8 s) before reporting it. */
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 15_000);
/** Only connection problems are worth retrying; an answer like "rate limited" or "not found" stands. */
const retry = (failures: number, error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  return failures < 4 && (typeof code !== "string" || code === "network");
};

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry,
            retryDelay,
            // Kept in memory as long as on the device, or the saved copy would be dropped early.
            gcTime: SAVED_FOR_MS,
          },
        },
      }),
  );
  // Switching language swaps the root layout, which re-renders <html> without the inline theme
  // script running again — re-apply the saved theme before paint so it never flips.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = savedTheme();
  }, []);
  // Service worker (area-watch notifications) + catch the browser's install offer early.
  useEffect(() => startPwa(), []);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: SAVED_FOR_MS,
        // Bump when the shape of saved data changes, so old copies are thrown away.
        buster: "1",
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success" && SAVED_QUERIES.has(String(q.queryKey[0])),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
