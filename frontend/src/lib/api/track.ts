/** Report tracking by code. The server returns only what a code holder may see. */
import type { CategoryKey } from "@/lib/safety/categories";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type TrackStatus = "pending" | "verified" | "rejected" | "duplicate" | "withdrawn";
export type TrackReason = "unconfirmed" | "wrong_place" | "not_chhintai" | "rules" | "other";
export type TrackVideo = "" | "not_received" | "pending" | "approved" | "rejected";

export interface TrackedReport {
  code: string;
  kind: "incident" | "knowledge" | "positive";
  category: CategoryKey;
  /** Incident date (YYYY-MM-DD), when it has one. */
  date: string | null;
  submitted_at: string;
  status: TrackStatus;
  reason: TrackReason | null;
  reviewed_at: string | null;
  video: TrackVideo;
}

/** "rate_limited" | "not_found" | "already_decided" | "network" | "invalid" */
export class TrackError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new TrackError("network");
  }
  if (res.ok) return (await res.json()) as T;
  if (res.status === 429) throw new TrackError("rate_limited");
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new TrackError(data.error ?? "invalid");
}

/** POST /api/v1/track — statuses for the codes that exist; unknown codes are simply missing. */
export async function trackReports(codes: string[]): Promise<TrackedReport[]> {
  if (!API_URL || codes.length === 0) return [];
  return (await post<{ reports: TrackedReport[] }>("/track", { codes })).reports;
}

/** POST /api/v1/track/withdraw — works only from the phone that sent the report. */
export async function withdrawReport(code: string, deviceId: string): Promise<TrackedReport> {
  return post<TrackedReport>("/track/withdraw", { code, device_id: deviceId });
}
