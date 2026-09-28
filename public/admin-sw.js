const VERSION = "privadinhos-admin-v9";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("privadinhos-admin-"))
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: "PWA_UPDATED", version: VERSION }));
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || "Venda Aprovada!";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "Modelo por R$ 0,00",
        icon: "/assets/pwa/privadinhos-admin-192.png",
        badge: "/assets/pwa/privadinhos-admin-badge.png",
        tag: data.tag || VERSION,
        renotify: false,
        silent: false,
        requireInteraction: false,
        data: { url: data.url || "/admin", orderId: data.orderId },
      }),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
        clients.forEach((client) => client.postMessage({ type: "ADMIN_PUSH_RECEIVED", payload: data })),
      ),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const dashboard = clients.find((client) => new URL(client.url).pathname.startsWith("/admin"));
      if (!dashboard) return self.clients.openWindow(url);
      return dashboard.focus().then(() => "navigate" in dashboard ? dashboard.navigate(url) : dashboard);
    }),
  );
});
