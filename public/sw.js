/* Hoffle service worker.
 *
 * 1. Web push for mentions, DMs, event reminders and incoming calls while no
 *    tab is open. The server sends a small JSON payload
 *    ({ title, body, url, tag, urgent }) and the notification is drawn here.
 * 2. Offline reading. The app shell, its built files, the main API reads
 *    (channels, messages, DMs, friends…) and images people looked at are kept,
 *    so with no network Hoffle still opens and shows what was loaded before.
 *    Live updates and sending wait for the network.
 *
 * The cached API answers belong to whoever was signed in: they are wiped on
 * sign-out, and when /api/auth/session reports a different account. */

// The API and built files always live under /hangout. The worker's own scope
// is where the app was opened: "/" on a host that serves Hoffle at its root
// (chat.hoffle.online, the phone app), "/hangout/" where /hangout is a part of
// a bigger site.
const APP_URL = "/hangout";
const ICON = "/hangout/favicon.svg";
const SCOPE_URL = self.registration.scope;
/** Paths that show the chat itself (the same page; the query picks what it shows). */
const SHELL_PATHS = new Set(["/", "/hangout", "/hangout/"]);

const SHELL_CACHE = "hoffle-shell-v1";
const ASSET_CACHE = "hoffle-assets-v1";
const API_CACHE = "hoffle-api-v1";
const MEDIA_CACHE = "hoffle-media-v1";
const CACHES = [SHELL_CACHE, ASSET_CACHE, API_CACHE, MEDIA_CACHE];
const LIMITS = { [ASSET_CACHE]: 400, [API_CACHE]: 200, [MEDIA_CACHE]: 250 };
const SHELL_KEY = `${APP_URL}/__offline-shell`;
const ACCOUNT_KEY = `${APP_URL}/__offline-account`;
const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
/** A navigation waits this long for the network before showing the saved shell. */
const NAVIGATION_TIMEOUT_MS = 4000;

/** API reads kept for offline use (GET only; the query string is part of the key). */
const OFFLINE_API =
  /^\/hangout\/api\/(auth\/session|servers|servers\/folders|servers\/[^/]+(\/(channels|welcome))?|messages|dms|dms\/groups|friends|members(\/[^/]+)?|features|emojis|stickers|channels\/reads|channels\/prefs|mentions|settings\/profile|categories|roles|reminders|scheduled)$/;

// A new worker takes over straight away rather than waiting for every tab to
// close, so fixes to push handling reach people on their next page load.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Caches from an older version of this file.
      for (const name of await caches.keys()) {
        if (name.startsWith("hoffle-") && !CACHES.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === "POST" && url.pathname === `${APP_URL}/api/auth/logout`) {
    event.respondWith(
      fetch(request).finally(() => forgetAccount()),
    );
    return;
  }
  if (request.method !== "GET" || request.headers.has("range")) return;

  if (request.mode === "navigate" && SHELL_PATHS.has(url.pathname)) {
    event.respondWith(navigation(request));
    return;
  }
  if (url.pathname.startsWith(`${APP_URL}/assets/`) || url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(ASSET_CACHE, request));
    return;
  }
  if (url.pathname.startsWith(`${APP_URL}/api/uploads/`) && !url.pathname.includes("/big")) {
    event.respondWith(media(request));
    return;
  }
  if (OFFLINE_API.test(url.pathname)) {
    event.respondWith(apiRead(request, url));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "hoffle-forget-account") event.waitUntil(forgetAccount());
});

async function navigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
      void cache.put(SHELL_KEY, response.clone());
    }
    return response;
  });
  const saved = await cache.match(SHELL_KEY);
  if (!saved) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
  try {
    return (await Promise.race([network, timeout])) || saved;
  } catch {
    return saved;
  }
}

async function cacheFirst(name, request) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(name);
  }
  return response;
}

async function media(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  const type = response.headers.get("content-type") || "";
  const size = Number(response.headers.get("content-length") || 0);
  if (response.status === 200 && type.startsWith("image/") && size > 0 && size <= MEDIA_MAX_BYTES) {
    await cache.put(request, response.clone());
    void trim(MEDIA_CACHE);
  }
  return response;
}

async function apiRead(request, url) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      if (url.pathname === `${APP_URL}/api/auth/session`) await noteAccount(response.clone());
      await cache.put(request, response.clone());
      void trim(API_CACHE);
    }
    return response;
  } catch (error) {
    const saved = await cache.match(request);
    if (!saved) throw error;
    // Marked, so the app can tell a saved answer from a live one.
    const headers = new Headers(saved.headers);
    headers.set("X-Hoffle-Offline", "1");
    return new Response(saved.body, { status: saved.status, headers });
  }
}

/** Wipes the saved answers when a different account (or nobody) is signed in. */
async function noteAccount(response) {
  let id = null;
  try {
    const data = await response.json();
    id = (data && data.user && data.user.id) || null;
  } catch {
    return;
  }
  const shell = await caches.open(SHELL_CACHE);
  const previous = await shell.match(ACCOUNT_KEY);
  const before = previous ? await previous.text() : null;
  if (before !== null && before !== (id || "")) await forgetAccount();
  await shell.put(ACCOUNT_KEY, new Response(id || ""));
}

async function forgetAccount() {
  await caches.delete(API_CACHE);
  await caches.delete(MEDIA_CACHE);
  const shell = await caches.open(SHELL_CACHE);
  await shell.delete(ACCOUNT_KEY);
}

/** Keeps a cache under its limit, dropping the oldest entries first. */
async function trim(name) {
  const limit = LIMITS[name];
  if (!limit) return;
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

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
    tag: tag || "hoffle",
    renotify: Boolean(tag),
    // A ringing call stays up until it is answered or dismissed.
    requireInteraction: Boolean(urgent),
    vibrate: urgent ? [300, 200, 300, 200, 300] : [100],
    data: { url: url || SCOPE_URL },
  };
  event.waitUntil(self.registration.showNotification(title || "Hoffle", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || SCOPE_URL,
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Prefer an already-open app tab: focusing it keeps the call/voice state
      // that navigating (a full reload) would throw away.
      const open = list.find((client) => client.url.startsWith(SCOPE_URL));
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
