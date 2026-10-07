"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { startPwa } from "@/lib/pwa";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } } }),
  );
  // Service worker (area-watch notifications) + catch the browser's install offer early.
  useEffect(() => startPwa(), []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
