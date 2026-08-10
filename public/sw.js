/* Huddle service worker: web push notifications for @mentions when the tab
 * is closed. The push payload is minimal — the server sends the essentials and
 * we render the notification here. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Huddle", body: "Something happened." };
  }
  const { title, body, url, tag } = data;
  const options = {
    body,
    icon: "/hangout/favicon.svg",
    badge: "/hangout/favicon.svg",
    tag: tag || "huddle",
    renotify: Boolean(tag),
    data: { url: url || "/hangout" },
  };
  event.waitUntil(
    self.registration.showNotification(title || "Huddle", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/hangout";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});