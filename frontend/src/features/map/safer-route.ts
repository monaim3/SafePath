import { fetchRoutes } from "@/lib/api/routing";
import { analyzeRoute, type CellLookup, type RouteOption, type TravelMode } from "@/lib/safety/route-risk";
import { detourVias, hotspotAhead, LOOK_AHEAD_M, pickSafer, type Hotspot, type SaferChoice } from "@/lib/safety/reroute";

type LngLat = [lng: number, lat: number];

export interface SaferRoute {
  choice: SaferChoice;
  /** The high-report spot the suggestion steers around. */
  hotspot: Hotspot;
}

/**
 * Looks for a clearly safer way from `from` to `to` than `current` (whose first point is `from`).
 * Only asks the router when a high-report area lies ahead on the current way: OSRM's alternatives
 * plus two detours forced past either side of that area. Null when nothing is worth suggesting.
 */
export async function findSaferRoute({
  from,
  to,
  mode,
  current,
  currentDuration,
  lookup,
  signal,
  aheadM = LOOK_AHEAD_M,
  alternatives = true,
}: {
  from: LngLat;
  to: LngLat;
  mode: TravelMode;
  current: LngLat[];
  currentDuration: number;
  lookup: CellLookup;
  signal?: AbortSignal;
  /** How far along the current way to look for a risky area. */
  aheadM?: number;
  /** Also ask for OSRM's own alternatives (skip when they're already known). */
  alternatives?: boolean;
}): Promise<SaferRoute | null> {
  const hotspot = hotspotAhead(current, lookup, aheadM);
  if (!hotspot) return null;
  const currentAnalysis = analyzeRoute(
    { id: "current", distance: 0, duration: currentDuration, coordinates: current, steps: [] },
    lookup,
  );
  const requests: Promise<RouteOption[]>[] = detourVias(from, hotspot.at).map((via) =>
    fetchRoutes(from, to, mode, signal, via),
  );
  if (alternatives) requests.push(fetchRoutes(from, to, mode, signal));
  const results = await Promise.allSettled(requests);
  const candidates = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const choice = pickSafer({ coordinates: current, analysis: currentAnalysis, duration: currentDuration }, candidates, lookup);
  return choice ? { choice, hotspot } : null;
}
