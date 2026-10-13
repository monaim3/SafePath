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

/**
 * "quarter, suburb" — e.g. "উলন, রামপুরা"; skips the suburb when the first part already contains it.
 * With `street`, small areas are named by their road instead ("রামপুরা-বনশ্রী রোড, বনশ্রী"):
 * OpenStreetMap's neighbourhood borders in Dhaka often spill over main roads (C Block Banasree
 * came out as "মেরুল বাড্ডা"), while the road a ~150 m area sits on is unambiguous.
 */
export function formatPlace(a: Address, street = false, locale = "bn"): string | null {
  const local = street && a.road ? a.road : (a.quarter ?? a.neighbourhood);
  const wide = a.suburb ?? a.city_district ?? a.town ?? a.village;
  // A street also gets its block when the map has one ("Road 1, সি ব্লক, বনশ্রী"): people in Dhaka
  // tell places apart by block. Only block/sector/section names — other neighbourhood names are
  // the ones that spill over main roads.
  const block = street && a.road ? blockName(a.quarter ?? a.neighbourhood, locale) : null;
  const parts = [local, block, wide].filter((p, i, all): p is string => !!p && !all.slice(0, i).some((q) => q?.includes(p)));
  return parts.length ? parts.join(", ") : (a.road ?? null);
}

const BLOCK = /^(?:block|sector|section)\s*([\w-]+)$|^([\w-]+)\s*(?:block)$/i;
/** Spoken Bangla names of block letters ("C" → "সি"). */
const BN_LETTERS: Record<string, string> = {
  A: "এ", B: "বি", C: "সি", D: "ডি", E: "ই", F: "এফ", G: "জি", H: "এইচ", I: "আই", J: "জে", K: "কে",
  L: "এল", M: "এম", N: "এন", O: "ও", P: "পি", Q: "কিউ", R: "আর", S: "এস", T: "টি", U: "ইউ", V: "ভি",
  W: "ডব্লিউ", X: "এক্স", Y: "ওয়াই", Z: "জেড",
};

/** "Block C" / "C Block" → "সি ব্লক" (bn) or "Block C" (en); null for anything that isn't a block. */
export function blockName(raw: string | undefined, locale: string): string | null {
  const name = raw?.trim();
  if (!name) return null;
  if (/ব্লক|সেক্টর|সেকশন/.test(name)) return name; // already in Bangla
  const m = BLOCK.exec(name);
  if (!m) return null;
  const id = (m[1] ?? m[2]).toUpperCase();
  const kind = /sector/i.test(name) ? "sector" : /section/i.test(name) ? "section" : "block";
  if (locale !== "bn") return `${kind[0].toUpperCase()}${kind.slice(1)} ${id}`;
  const bnId = BN_LETTERS[id] ?? id.replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
  return kind === "block" ? `${bnId} ব্লক` : `${kind === "sector" ? "সেক্টর" : "সেকশন"} ${bnId}`;
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
    // Street-level areas (resolution 10, the size of one report's area) are named by their road.
    return data.address ? formatPlace(data.address, getResolution(h3) >= 10, locale) : null;
  } catch {
    return null;
  }
}
