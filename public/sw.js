// Minimal service worker: makes Kinda installable and keeps the app shell available briefly offline.
const CACHE = "kinda-shell-v3";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
  }
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Kinda", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    // The app is on screen: it already shows messages and reminders itself.
    if (clients.some(client => client.visibilityState === "visible")) return undefined;
    return self.registration.showNotification(data.title || "Kinda", {
      body: data.body || "",
      tag: data.tag || "kinda",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      renotify: true,
      data: { url: data.url || "/" }
    });
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if ("focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  }));
});
