/*
 * SafePath service worker: shows area-watch notifications and opens the area when tapped.
 * No offline caching — the site always loads fresh data.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
