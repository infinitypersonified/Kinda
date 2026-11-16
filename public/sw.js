// Minimal service worker: makes Kinda installable and keeps the app shell available briefly offline.
const CACHE = "kinda-shell-v5";
const WIDGET_CACHE = "kinda-widget-data-v1";
const WIDGET_TAG = "kinda-streak";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([
    "/", "/manifest.webmanifest", "/icon-192.png",
    "/widgets/streak-template.json", "/widgets/streak-data.json",
    "/widgets/kindle-happy.svg", "/widgets/kindle-wave.svg", "/widgets/kindle-sleepy.svg",
  ])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE && key !== WIDGET_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()).then(updateInstalledWidget));
});
self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
  }
});

async function widgetAsset(path) {
  try {
    const response = await fetch(path);
    if (response.ok) return response;
  } catch {
    // Fall back to the app shell cache when Windows refreshes while offline.
  }
  const shell = await caches.open(CACHE);
  const cached = await shell.match(path);
  if (cached) return cached;
  throw new Error(`Missing widget asset: ${path}`);
}

async function fallbackWidgetData() {
  const data = await (await widgetAsset("/widgets/streak-data.json")).json();
  return { ...data, kindle: `${self.location.origin}/widgets/kindle-happy.svg` };
}

async function getWidgetData() {
  const cache = await caches.open(WIDGET_CACHE);
  const saved = await cache.match("/__kinda_widget_data__");
  if (!saved) return fallbackWidgetData();
  let data;
  try {
    data = await saved.json();
  } catch {
    await cache.delete("/__kinda_widget_data__");
    return fallbackWidgetData();
  }
  if (!data.signedIn) return data;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isToday = data.date === today;
  const doneToday = isToday && data.doneToday;
  const hour = now.getHours();
  const message = doneToday
    ? "You kept your flame alive."
    : hour < 10
      ? "A little progress starts the day."
      : hour < 15
        ? "I miss you already."
        : hour < 18
          ? "These tasks aren’t gonna do themselves."
          : hour < 21
            ? "There’s still time to keep your flame."
            : "Don’t let your streak die.";
  const pose = doneToday ? "happy" : hour < 10 ? "happy" : hour < 15 ? "wave" : hour < 18 ? "think" : hour < 21 ? "wave" : "sleepy";
  const done = isToday ? Number(data.done) || 0 : 0;
  const total = isToday ? Number(data.total) || 0 : 0;
  const needed = isToday
    ? Number(data.needed) || 0
    : Number(data.minTasks) || 5;
  const subline = doneToday
    ? "Today’s goal is complete. Come back tomorrow."
    : needed > 0
      ? `Finish ${needed} more ${needed === 1 ? "task" : "tasks"} to protect it.`
      : "One small win is enough.";
  return {
    ...data,
    done,
    total,
    needed,
    message,
    subline,
    kindle: `${self.location.origin}/widgets/kindle-${pose}.svg`,
  };
}

async function updateWidget(widget) {
  if (!self.widgets || !widget) return;
  const definition = widget.definition || {};
  const templateUrl = definition.msAcTemplate || "/widgets/streak-template.json";
  const response = await widgetAsset(templateUrl);
  if (!response.ok) throw new Error("Could not load the Kinda widget template.");
  const template = await response.text();
  const data = JSON.stringify(await getWidgetData());
  await self.widgets.updateByTag(definition.tag || WIDGET_TAG, { template, data });
}

async function updateInstalledWidget() {
  if (!self.widgets) return;
  const widget = await self.widgets.getByTag(WIDGET_TAG);
  if (widget) await updateWidget(widget);
}

self.addEventListener("widgetinstall", event => {
  event.waitUntil((async () => {
    if (self.registration.periodicSync) {
      const tags = await self.registration.periodicSync.getTags();
      if (!tags.includes(WIDGET_TAG)) {
        await self.registration.periodicSync.register(WIDGET_TAG, { minInterval: 60 * 60 * 1000 });
      }
    }
    await updateWidget(event.widget);
  })());
});

self.addEventListener("widgetresume", event => {
  event.waitUntil(updateWidget(event.widget));
});

self.addEventListener("widgetuninstall", event => {
  event.waitUntil((async () => {
    if (event.widget?.instances?.length === 1 && self.registration.periodicSync) {
      await self.registration.periodicSync.unregister(WIDGET_TAG);
    }
  })());
});

self.addEventListener("periodicsync", event => {
  if (event.tag !== WIDGET_TAG) return;
  event.waitUntil(updateInstalledWidget());
});

self.addEventListener("widgetclick", event => {
  if (event.action !== "open-tasks") return;
  event.waitUntil((async () => {
    const target = `${self.location.origin}/?page=tasks`;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find(client => {
      try { return new URL(client.url).origin === self.location.origin; }
      catch { return false; }
    });
    if (existing) {
      existing.postMessage({ type: "kinda-widget-open-tasks" });
      await existing.focus();
    } else {
      await self.clients.openWindow(target);
    }
  })());
});

self.addEventListener("message", event => {
  const { data, type } = event.data || {};
  if (type === "kinda-widget-update" && data && typeof data === "object") {
    event.waitUntil((async () => {
      const cache = await caches.open(WIDGET_CACHE);
      await cache.put("/__kinda_widget_data__", new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      }));
      await updateInstalledWidget();
    })());
  }
  if (type === "kinda-widget-clear") {
    event.waitUntil((async () => {
      const cache = await caches.open(WIDGET_CACHE);
      await cache.delete("/__kinda_widget_data__");
      await updateInstalledWidget();
    })());
  }
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Kinda", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const visibleClients = clients.filter(client => client.visibilityState === "visible");
    if (visibleClients.length) {
      visibleClients.forEach(client => client.postMessage({ type: "kinda-push", notification: data }));
      return undefined;
    }
    try { if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge(); } catch (error) { /* badge is optional */ }
    return self.registration.showNotification(data.title || "Kinda", {
      body: data.body || "",
      tag: data.tag || "kinda",
      icon: data.icon || "/icon-192.png",
      badge: data.badge || "/icon-192.png",
      renotify: false,
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
