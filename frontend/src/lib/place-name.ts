/**
 * Human place names for map areas ("উলন, রামপুরা" instead of "F1396"), from OpenStreetMap's
 * free Nominatim service. Server-only: results are cached for 30 days, so each area is looked
 * up about once a month (Nominatim's fair-use policy asks for caching and an identifying agent).
 */
import { cellToLatLng, getResolution } from "h3-js";

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const MONTH = 60 * 60 * 24 * 30;

interface Address {
  road?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city_district?: string;
  town?: string;
  village?: string;
}

/** "quarter, suburb" — e.g. "উলন, রামপুরা"; skips the suburb when the first part already contains it. */
export function formatPlace(a: Address): string | null {
  const local = a.quarter ?? a.neighbourhood;
  const wide = a.suburb ?? a.city_district ?? a.town ?? a.village;
  if (local && wide) return local.includes(wide) ? local : `${local}, ${wide}`;
  return local ?? wide ?? a.road ?? null;
}

export async function areaPlaceName(h3: string, locale: string): Promise<string | null> {
  try {
    const [lat, lng] = cellToLatLng(h3);
    // Big map cells get a district-level name; small ones a neighbourhood.
    const zoom = getResolution(h3) <= 8 ? 14 : 16;
    const url = new URL(NOMINATIM);
    url.search = new URLSearchParams({
      lat: lat.toFixed(5),
      lon: lng.toFixed(5),
      format: "jsonv2",
      zoom: String(zoom),
      addressdetails: "1",
      "accept-language": locale === "bn" ? "bn" : "en",
    }).toString();
    const res = await fetch(url, {
      headers: { "User-Agent": "SafePath/1.0 (+https://chintai-bd.vercel.app)" },
      next: { revalidate: MONTH },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Address };
    return data.address ? formatPlace(data.address) : null;
  } catch {
    return null;
  }
}
