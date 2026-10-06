/**
 * Free OSRM routing (FOSSGIS servers, fair-use). Self-host OSRM or GraphHopper with the
 * Bangladesh extract for production — see docs/SAFEPATH_MASTER_PROMPT.md §17.
 */
import type { RouteOption, TravelMode } from "@/lib/safety/route-risk";

const BASE: Record<TravelMode, string> = {
  drive: "https://routing.openstreetmap.de/routed-car",
  walk: "https://routing.openstreetmap.de/routed-foot",
};

interface OsrmStep {
  name: string;
  distance: number;
  geometry: { coordinates: [number, number][] };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs: { steps: OsrmStep[] }[];
}

export async function fetchRoutes(
  from: [lng: number, lat: number],
  to: [lng: number, lat: number],
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<RouteOption[]> {
  const url = new URL(`${BASE[mode]}/route/v1/driving/${from.join(",")};${to.join(",")}`);
  url.searchParams.set("alternatives", "3");
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("steps", "true");

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = (await res.json()) as { code: string; routes?: OsrmRoute[] };
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(`Routing failed (${data.code})`);

  return data.routes.map((r, i) => ({
    id: `${mode}-${i}`,
    distance: r.distance,
    duration: r.duration,
    coordinates: r.geometry.coordinates,
    steps: r.legs.flatMap((leg) =>
      leg.steps.map((s) => ({ name: s.name, distance: s.distance, coordinates: s.geometry.coordinates })),
    ),
  }));
}
