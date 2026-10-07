/**
 * Data access for the public safety API.
 * Currently backed by synthetic demo data; each function documents the endpoint it will call.
 */
import { demoArea, demoCityTimeProfile, demoMapCells, demoTopAreas } from "@/lib/safety/demo-data";
import type { AreaDetail, AreaVideo, CellSummary, MapCellsQuery, UploadTicket } from "@/lib/safety/types";
import type { ReportInput } from "@/lib/validation/report";

/** Django API base, e.g. http://localhost:8000. Unset = demo mode: synthetic data, nothing leaves the browser. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const REPORTS_GO_TO_SERVER = API_URL !== "";

/**
 * Show the "demo data" notice. On while the backend only holds `seed_demo` data;
 * set NEXT_PUBLIC_DEMO_NOTICE=off once real reports are live.
 */
export const USING_DEMO_DATA = process.env.NEXT_PUBLIC_DEMO_NOTICE !== "off";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`API ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

/** GET /api/v1/map/cells?hour=&res= */
export async function fetchMapCells(query: MapCellsQuery): Promise<CellSummary[]> {
  if (!REPORTS_GO_TO_SERVER) return demoMapCells(query);
  const data = await getJson<{ cells: CellSummary[] }>(`/map/cells?res=${query.res}&hour=${query.hour}`);
  return data.cells;
}

/** GET /api/v1/map/time-profile — city-wide activity per hour of day (24 values). */
export async function fetchCityTimeProfile(): Promise<number[]> {
  if (!REPORTS_GO_TO_SERVER) return demoCityTimeProfile();
  return (await getJson<{ hours: number[] }>("/map/time-profile")).hours;
}

/** GET /api/v1/areas/{h3} */
export async function fetchArea(h3: string): Promise<AreaDetail | null> {
  if (!REPORTS_GO_TO_SERVER) return demoArea(h3);
  try {
    return await getJson<AreaDetail>(`/areas/${encodeURIComponent(h3)}`);
  } catch {
    return null;
  }
}

/** GET /api/v1/areas/{h3}/videos — approved footage; empty in demo mode or on any error. */
export async function fetchAreaVideos(h3: string): Promise<AreaVideo[]> {
  if (!REPORTS_GO_TO_SERVER) return [];
  try {
    return (await getJson<{ videos: AreaVideo[] }>(`/areas/${encodeURIComponent(h3)}/videos`)).videos;
  } catch {
    return [];
  }
}

/** GET /api/v1/areas?limit= — most active areas */
export async function fetchTopAreas(limit: number): Promise<AreaDetail[]> {
  if (!REPORTS_GO_TO_SERVER) return demoTopAreas(limit);
  try {
    return (await getJson<{ areas: AreaDetail[] }>(`/areas?limit=${limit}`)).areas;
  } catch {
    return []; // home page still renders without the preview card
  }
}

/** Error code from the API: "rate_limited" | "captcha" | "invalid_time" | "invalid" | "network". */
export class ReportError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** POST /api/v1/reports. With `hasVideo`, the answer carries a signed upload ticket (when the server has video on). */
export async function submitReport(
  input: ReportInput,
  extra: { deviceId: string; turnstileToken?: string; hasVideo?: boolean },
): Promise<{ id: string; upload?: UploadTicket }> {
  if (!REPORTS_GO_TO_SERVER) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { id: `demo-${input.h3}-${Date.now()}` };
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        device_id: extra.deviceId,
        turnstile_token: extra.turnstileToken ?? "",
        has_video: Boolean(extra.hasVideo),
      }),
    });
  } catch {
    throw new ReportError("network");
  }
  if (res.ok) return (await res.json()) as { id: string; upload?: UploadTicket };
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new ReportError(body.error ?? (res.status === 429 ? "rate_limited" : "invalid"));
}

/**
 * Uploads the footage straight to Cloudinary (never through our server), then tells the API it's there.
 * XHR rather than fetch: it reports upload progress.
 */
export async function uploadVideo(
  reportId: string,
  ticket: UploadTicket,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  if (file.size > ticket.maxBytes) throw new ReportError("too_large");
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) form.append(k, String(v));
  form.append("file", file);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new ReportError("upload")));
    xhr.onerror = () => reject(new ReportError("network"));
    xhr.send(form);
  });

  const res = await fetch(`${API_URL}/api/v1/reports/${encodeURIComponent(reportId)}/video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: ticket.attachToken }),
  }).catch(() => null);
  if (!res?.ok) throw new ReportError("upload");
}

/** POST /api/v1/knowledge/{id}/confirm — "I've seen this too". */
export async function confirmKnowledge(id: string, deviceId: string): Promise<{ ok: true }> {
  if (!REPORTS_GO_TO_SERVER) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { ok: true };
  }
  const res = await fetch(`${API_URL}/api/v1/knowledge/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!res.ok) throw new ReportError(res.status === 429 ? "rate_limited" : "invalid");
  return { ok: true };
}

export interface PlaceResult {
  id: string;
  name: string;
  context: string;
  center: [lng: number, lat: number];
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id: number;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    locality?: string;
  };
}

/** Reverse geocode (Photon): a short human-readable name for a point, or null. */
export async function reversePlace(
  [lng, lat]: [number, number],
  signal?: AbortSignal,
): Promise<{ name: string; context: string } | null> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { features: PhotonFeature[] };
  const p = data.features[0]?.properties;
  if (!p) return null;
  const name = p.name ?? p.street ?? p.locality ?? p.district;
  if (!name) return null;
  const context = [p.street !== name ? p.street : undefined, p.locality ?? p.district, p.city]
    .filter((v): v is string => Boolean(v) && v !== name)
    .slice(0, 2)
    .join(", ");
  return { name, context };
}

/** Free OSM geocoder (Photon), limited to Bangladesh. Swap for self-hosted Photon in prod. */
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("bbox", "88.0,20.5,92.7,26.7");
  url.searchParams.set("lat", "23.7808");
  url.searchParams.set("lon", "90.4093");
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as { features: PhotonFeature[] };
  return data.features
    .filter((f) => f.properties.name)
    .map((f, i) => ({
      id: `${f.properties.osm_id}-${i}`,
      name: f.properties.name ?? "",
      context: [f.properties.locality ?? f.properties.district, f.properties.city]
        .filter(Boolean)
        .join(", "),
      center: f.geometry.coordinates,
    }));
}
