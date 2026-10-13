"use client";

/**
 * Street-level levels for every hour of the day, downloaded once and kept on the phone (the query
 * is saved to the device, see components/layout/Providers). Route checks and trip warnings read
 * from it, so they keep working on a weak connection or with none at all.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchStreetDay } from "@/lib/api/safety";
import type { CellLookup } from "./route-risk";
import type { Period, StreetDay } from "./types";

const TEN_MINUTES = 10 * 60_000;

export function useStreetDay(period: Period = "all", enabled = true) {
  return useQuery({
    queryKey: ["street-day", period],
    queryFn: () => fetchStreetDay(period),
    enabled,
    staleTime: TEN_MINUTES,
    // New reports change the levels slowly: refresh now and then; a failure keeps the saved copy.
    refetchInterval: TEN_MINUTES,
  });
}

/** Level of each street area at `hour` ("all" = the whole day), or null before any data. */
export function streetLookup(days: StreetDay[] | undefined, hour: number | "all"): CellLookup | null {
  if (!days) return null;
  const scores = new Map(days.map((d) => [d.h3, hour === "all" ? d.day : (d.hours[hour] ?? 0)]));
  return (h3: string) => scores.get(h3);
}
