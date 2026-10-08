"use client";

import { useQuery } from "@tanstack/react-query";

/** Place name for an area in client components (null while loading or when none is known). */
export function usePlaceName(h3: string | null | undefined, locale: string): string | null {
  const { data } = useQuery({
    queryKey: ["place-name", h3, locale],
    queryFn: async () => {
      const res = await fetch(`/api/place?h3=${encodeURIComponent(h3!)}&lang=${locale}`);
      return res.ok ? ((await res.json()) as { name: string | null }).name : null;
    },
    enabled: Boolean(h3),
    staleTime: Infinity,
  });
  return data ?? null;
}
