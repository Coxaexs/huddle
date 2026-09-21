import webPush from "web-push";
import { bindings } from "./storage";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface PushSubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
}

/**
 * Dispatch web push notifications to target user IDs.
 * Silently ignores errors if VAPID keys are not configured or if user is offline/unsubscribed.
 */
export async function sendPushNotifications(
  db: D1Database,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!userIds.length) return;

  const b = bindings() as {
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
  };

  const publicKey = b.VAPID_PUBLIC_KEY?.trim();
  const privateKey = b.VAPID_PRIVATE_KEY?.trim();
  const subject = b.VAPID_SUBJECT?.trim() || "mailto:admin@hoffle.local";

  if (!publicKey || !privateKey) {
    // Web push is not configured on this instance.
    return;
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const placeholders = userIds.map(() => "?").join(",");
  const rows = await db
    .prepare(
      `SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    )
    .bind(...userIds)
    .all<PushSubscriptionRow>();

  const subs = rows.results || [];
  if (!subs.length) return;

  const jsonPayload = JSON.stringify(payload);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          jsonPayload,
        );
      } catch (err: unknown) {
        // If the subscription is expired or unsubscribed, remove it from SQLite
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
            .bind(sub.endpoint)
            .run()
            .catch(() => {});
        }
      }
    }),
  );
}
