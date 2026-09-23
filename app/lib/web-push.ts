"use client";

import { apiFetch, basePath } from "./client";

/**
 * Browser push: registers the service worker and subscribes it with the
 * instance's VAPID key, so mentions, DMs and calls arrive with no tab open.
 * Everything here is best-effort — an instance without VAPID keys, a browser
 * without push, or a denied permission just means no background pings.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${basePath}/sw.js`, {
      scope: `${basePath}/`,
    });
  } catch {
    return null;
  }
}

/**
 * Subscribes (or refreshes the existing subscription) and stores it on the
 * server. Only prompts for permission when `prompt` is true, i.e. from a click
 * — browsers block or penalise permission prompts that appear on page load.
 */
export async function enableWebPush(prompt = false): Promise<boolean> {
  if (typeof window === "undefined" || !("PushManager" in window)) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "default" && prompt) {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return false;

  const registration = (await registerServiceWorker()) && (await navigator.serviceWorker.ready);
  if (!registration) return false;

  const { configured, publicKey } = await apiFetch<{
    configured: boolean;
    publicKey?: string;
  }>("/api/push/subscribe").catch(() => ({ configured: false, publicKey: undefined }));
  if (!configured || !publicKey) return false;

  let subscription = await registration.pushManager.getSubscription();
  // A subscription made under a different VAPID key (keys rotated on the
  // server) is rejected by the push service, so replace it.
  const currentKey = subscription?.options.applicationServerKey;
  if (subscription && currentKey && toBase64Url(currentKey) !== publicKey.replace(/=+$/, "")) {
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) })
      .catch(() => null);
  }
  if (!subscription) return false;

  const json = subscription.toJSON();
  await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    }),
  });
  return true;
}

export async function disableWebPush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(`${basePath}/`);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await apiFetch(
    `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
    { method: "DELETE" },
  ).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

/**
 * Shows a notification from the page. Goes through the service worker when
 * there is one: Android Chrome throws on `new Notification()`, and a shared
 * tag lets a push for the same message replace this one instead of doubling.
 */
export async function showPageNotification(
  title: string,
  body: string,
  tag?: string,
): Promise<void> {
  const registration =
    "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration(`${basePath}/`)
      : undefined;
  const options: NotificationOptions = {
    body,
    icon: `${basePath}/favicon.svg`,
    ...(tag ? { tag } : {}),
  };
  if (registration) {
    await registration.showNotification(title, options);
    return;
  }
  const notification = new Notification(title, options);
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

function fromBase64Url(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
