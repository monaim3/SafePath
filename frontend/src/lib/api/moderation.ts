/**
 * Moderator API client. The token lives in sessionStorage: it is gone when the tab closes,
 * and is never sent anywhere except the API's Authorization header.
 */
import type { CategoryKey } from "@/lib/safety/categories";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TOKEN_KEY = "sp_mod_token";

export type Decision = "verify" | "reject" | "duplicate";
export type RejectReason = "fake" | "wrong_place" | "spam" | "offensive" | "other";

export interface QueueReport {
  id: string;
  kind: "incident" | "knowledge" | "positive";
  category: CategoryKey;
  h3: string;
  date: string | null;
  block: number;
  hour: number | null;
  days: string;
  relation: string;
  description: string;
  status: string;
  flags: string[];
  corroborations: number;
  weight: number;
  is_demo: boolean;
  created_at: string;
  reporter_trust: number;
  reporter_reports: number;
  reporter_rejected: number;
}

export interface AreaFlag {
  id: string;
  reason: string;
  h3: string;
  details: { reports?: number; devices?: number };
  created_at: string;
}

export interface Queue {
  flags: AreaFlag[];
  flagged: QueueReport[];
  pending: QueueReport[];
}

export interface ModStats {
  pending: number;
  flagged: number;
  areaAlerts: number;
  today: number;
  verified: number;
  rejected: number;
}

export class ModError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: the session simply won't survive a reload
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/mod${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 || res.status === 403) setToken(null);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ModError(body.error ?? (res.status === 429 ? "rate_limited" : "failed"), res.status);
  }
  return (await res.json()) as T;
}

export async function login(username: string, password: string): Promise<string> {
  const data = await call<{ token: string; username: string }>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data.username;
}

export async function logout(): Promise<void> {
  try {
    await call("/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export const fetchMe = () => call<{ username: string }>("/me");
export const fetchQueue = () => call<Queue>("/queue");
export const fetchStats = () => call<ModStats>("/stats");

export const decide = (id: string, decision: Decision, reason?: RejectReason) =>
  call<QueueReport>(`/reports/${id}/${decision}`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) });

export const resolveFlag = (id: string) => call<AreaFlag>(`/flags/${id}/resolve`, { method: "POST" });
