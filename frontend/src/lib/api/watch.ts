/**
 * Area watch (free Web Push). The browser's push address and the followed area codes are
 * the only things sent — no account, phone number or location.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type PushSupport = "ok" | "unsupported" | "ios-install" | "denied";

export interface WatchConfig {
  enabled: boolean;
  publicKey: string;
  maxAreas: number;
}

export class WatchError extends Error {
  constructor(public code: "unsupported" | "denied" | "limit" | "unavailable" | "failed") {
    super(code);
  }
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** What this browser can do right now. iPhones only allow push for apps added to the home screen. */
export function pushSupport(): PushSupport {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new WatchError("failed");
  if (res.status === 503) throw new WatchError("unavailable");
  if (!res.ok) throw new WatchError("failed");
  return (await res.json()) as T;
}

export async function fetchWatchConfig(): Promise<WatchConfig> {
  const res = await fetch(`${API_URL}/api/v1/watch/config`);
  if (!res.ok) throw new WatchError("unavailable");
  return (await res.json()) as WatchConfig;
}

/** The existing push subscription, without asking for permission. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Areas this browser follows (empty when it never subscribed). */
export async function fetchMyAreas(): Promise<string[]> {
  const sub = await currentSubscription();
  if (!sub) return [];
  return (await post<{ areas: string[] }>("/watch/lookup", { endpoint: sub.endpoint })).areas;
}

/** Asks for notification permission if needed. Must be called from a tap. */
async function ensureSubscription(config: WatchConfig): Promise<PushSubscription> {
  const support = pushSupport();
  if (support === "denied") throw new WatchError("denied");
  if (support !== "ok") throw new WatchError("unsupported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new WatchError("denied");
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  await navigator.serviceWorker.ready;
  return (
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) }))
  );
}

/** Saves the full list of followed areas. An empty list unsubscribes this browser completely. */
export async function saveMyAreas(areas: string[], locale: string): Promise<string[]> {
  const config = await fetchWatchConfig();
  if (!config.enabled) throw new WatchError("unavailable");
  if (areas.length > config.maxAreas) throw new WatchError("limit");
  if (areas.length === 0) {
    const sub = await currentSubscription();
    if (!sub) return [];
    const res = await post<{ areas: string[] }>("/watch", { subscription: sub.toJSON(), areas: [], locale });
    await sub.unsubscribe();
    return res.areas;
  }
  const sub = await ensureSubscription(config);
  return (await post<{ areas: string[] }>("/watch", { subscription: sub.toJSON(), areas, locale })).areas;
}
