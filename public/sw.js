/* Huddle service worker: web push for mentions, DMs, event reminders and
 * incoming calls while no tab is open. The server sends a small JSON payload
 * ({ title, body, url, tag, urgent }) and the notification is drawn here. */

const APP_URL = "/hangout";
const ICON = "/hangout/favicon.svg";

// A new worker takes over straight away rather than waiting for every tab to
// close, so fixes to push handling reach people on their next page load.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const { title, body, url, tag, urgent } = data;
  const options = {
    body: body || "",
    icon: ICON,
    badge: ICON,
    tag: tag || "huddle",
    renotify: Boolean(tag),
    // A ringing call stays up until it is answered or dismissed.
    requireInteraction: Boolean(urgent),
    vibrate: urgent ? [300, 200, 300, 200, 300] : [100],
    data: { url: url || APP_URL },
  };
  event.waitUntil(self.registration.showNotification(title || "Huddle", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || APP_URL,
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Prefer an already-open app tab: focusing it keeps the call/voice state
      // that navigating (a full reload) would throw away.
      const open = list.find((client) => new URL(client.url).pathname.startsWith(APP_URL));
      if (open) return open.focus();
      return self.clients.openWindow(target);
    }),
  );
});

// Push services rotate subscriptions now and then; re-register the new one so
// notifications don't silently stop.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const keyResponse = await fetch(`${APP_URL}/api/push/subscribe`, { credentials: "include" });
      const { publicKey } = await keyResponse.json();
      if (!publicKey) return;
      const subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await saveSubscription(subscription);
      if (event.oldSubscription) {
        await fetch(
          `${APP_URL}/api/push/subscribe?endpoint=${encodeURIComponent(event.oldSubscription.endpoint)}`,
          { method: "DELETE", credentials: "include" },
        );
      }
    })().catch(() => undefined),
  );
});

function saveSubscription(subscription) {
  const json = subscription.toJSON();
  return fetch(`${APP_URL}/api/push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys && json.keys.p256dh,
      auth: json.keys && json.keys.auth,
    }),
  });
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
