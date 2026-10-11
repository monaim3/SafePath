/*
 * SafePath service worker: shows area-watch notifications and opens the area when tapped.
 * Pages and data always load fresh from the network; the only thing cached is a small
 * "you're offline" page, shown instead of the browser's error when a page can't load.
 */

const CACHE = "safepath-offline-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_URL, "/icons/app-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Page loads only: network as usual; if that fails (no internet), the offline page.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // the offline page's own logo
  if (req.method === "GET" && new URL(req.url).pathname === "/icons/app-192.png") {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "SafePath", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "SafePath", {
      body: data.body || "",
      icon: "/icons/app-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag, // one notification per area; a newer one replaces it
      renotify: Boolean(data.tag),
      vibrate: [100, 50, 100],
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
