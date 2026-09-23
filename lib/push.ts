import webPush from "web-push";
import { bindings } from "./storage";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Calls ring through Do Not Disturb-style filtering on ntfy. */
  urgent?: boolean;
}

interface PushSubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  kind: string | null;
}

/**
 * Dispatch push notifications to target user IDs.
 *
 * Two transports, both self-hostable and neither needing a vendor account:
 *  - "webpush": RFC 8030/8291 Web Push, used by browsers and by UnifiedPush
 *    distributors that accept encrypted payloads. VAPID keys are only needed
 *    for browser push services; without them only non-browser endpoints work.
 *  - "ntfy": a plain HTTP POST to an ntfy topic (ntfy.sh or your own server),
 *    which the ntfy app on Android/iOS shows as a notification.
 *
 * Errors are swallowed: a dead subscription must never break sending a message.
 */
export async function sendPushNotifications(
  db: D1Database,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!userIds.length) return;

  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT endpoint, user_id, p256dh, auth, kind FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    )
    .bind(...userIds)
    .all<PushSubscriptionRow>()
    .catch(() => ({ results: [] as PushSubscriptionRow[] }));

  const subs = rows.results || [];
  if (!subs.length) return;

  const b = bindings() as {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  };
  const publicKey = b.VAPID_PUBLIC_KEY?.trim();
  const privateKey = b.VAPID_PRIVATE_KEY?.trim();
  const subject = b.VAPID_SUBJECT?.trim() || "mailto:admin@hoffle.local";
  const vapid =
    publicKey && privateKey ? { subject, publicKey, privateKey } : undefined;

  const jsonPayload = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      let gone = false;
      try {
        if (sub.kind === "ntfy") {
          const response = await sendNtfy(sub.endpoint, sub.auth, payload);
          gone = response.status === 404 || response.status === 410;
        } else {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            jsonPayload,
            {
              ...(vapid ? { vapidDetails: vapid } : {}),
              urgency: payload.urgent ? "high" : "normal",
              TTL: payload.urgent ? 60 : 3600,
            },
          );
        }
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        gone = statusCode === 404 || statusCode === 410;
      }
      if (gone) {
        await db
          .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
          .bind(sub.endpoint)
          .run()
          .catch(() => {});
      }
    }),
  );
}

/** Publishes to an ntfy topic using its header API. `token` may be empty. */
export function sendNtfy(
  endpoint: string,
  token: string,
  payload: PushPayload,
): Promise<Response> {
  const headers: Record<string, string> = {
    // Header values must be Latin-1; RFC 2047 keeps emoji and accents intact.
    Title: `=?UTF-8?B?${base64(payload.title)}?=`,
    Priority: payload.urgent ? "5" : "3",
    Tags: payload.urgent ? "telephone_receiver" : "speech_balloon",
  };
  if (payload.url && /^https?:\/\//.test(payload.url)) headers.Click = payload.url;
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(endpoint, { method: "POST", headers, body: payload.body });
}

function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Checks a user-supplied topic URL before the server starts POSTing to it.
 * The server is making the request, so private and loopback addresses are
 * refused unless the admin opts in (HUDDLE_PUSH_ALLOW_PRIVATE=1, for an ntfy
 * container on the same LAN or compose network).
 */
export function validatePushEndpoint(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const allowPrivate =
    (bindings() as { HUDDLE_PUSH_ALLOW_PRIVATE?: string }).HUDDLE_PUSH_ALLOW_PRIVATE === "1";
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    return null;
  }
  if (url.username || url.password) return null;
  if (!allowPrivate && isPrivateHost(url.hostname)) return null;
  if (url.pathname.length < 2) return null; // a topic is required
  return url.toString();
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    !host.includes(".") && !host.includes(":")
  ) {
    return true;
  }
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (host.includes(":")) {
    return (
      host === "::1" || host === "::" ||
      host.startsWith("fc") || host.startsWith("fd") ||
      host.startsWith("fe80") || host.startsWith("::ffff:")
    );
  }
  return false;
}
