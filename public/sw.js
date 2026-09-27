// public/sw.js - Service Worker PWA & Web Push
const APP_NAME = "MozaPlay";
const APP_ICON = "/icons/icon-192.png";
const APP_URL = "/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: APP_NAME,
    body: "Tens uma nova notificação na tua conta!",
    url: APP_URL,
  };

  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || APP_NAME, {
      body: data.body,
      icon: APP_ICON,
      badge: APP_ICON,
      tag: data.tag || "mozaplay-notification",
      renotify: true,
      vibrate: [100, 50, 100],
      data: { url: data.url || APP_URL },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || APP_URL,
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
