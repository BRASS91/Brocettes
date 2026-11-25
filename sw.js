/* Service worker: shows push notifications and opens the right page when one is tapped.
   It deliberately doesn't cache anything, so the site always shows the latest notes. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data && e.data.text() }; }
  const scope = self.registration.scope;
  e.waitUntil(self.registration.showNotification(m.title || "Brocettes Companion", {
    body: m.body || "",
    icon: scope + "assets/icons/icon-192.png",
    badge: scope + "assets/icons/icon-192.png",
    tag: m.tag || undefined, // a newer notification of the same kind replaces the older one
    renotify: !!m.tag,
    data: { url: scope + (m.url || "") },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || self.registration.scope;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = tabs.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); return open.navigate(url).catch(() => open.postMessage({ go: url })); }
    return self.clients.openWindow(url);
  })());
});
