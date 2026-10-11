/**
 * Anonymous visitor counting for the moderator dashboard: a page view on each navigation and a
 * "still here" ping every 90 s while the tab is visible. No cookies or IDs are sent — the server
 * derives a daily-changing hash itself and stores nothing identifying.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const PING_EVERY_MS = 90_000;

// The same page view reported twice in a row (React may run effects twice) counts once.
let lastView = { path: "", at: 0 };

export function sendHit(path: string, kind: "view" | "ping") {
  if (!API_URL) return;
  if (kind === "view") {
    const now = Date.now();
    if (lastView.path === path && now - lastView.at < 2000) return;
    lastView = { path, at: now };
  }
  const app = window.matchMedia("(display-mode: standalone)").matches;
  void fetch(`${API_URL}/api/v1/hit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, kind, app }),
    keepalive: true,
  }).catch(() => undefined);
}
