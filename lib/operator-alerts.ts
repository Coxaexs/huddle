/**
 * Urgent alerts to the phones of the people who run this Hoffle: new reports
 * and legal orders, which have short deadlines. They go out on every push
 * route those people set up (ntfy, the app, the browser) and ring through
 * Do Not Disturb on ntfy.
 */
import { sendPushNotifications, type PushPayload } from "./push";

/** The people who run this Hoffle, leaving out `exceptUserId`. */
export async function operatorIds(db: D1Database, exceptUserId?: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id FROM users WHERE is_admin = 1")
    .all<{ id: string }>();
  return (results || []).map((row) => row.id).filter((id) => id !== exceptUserId);
}

export async function alertOperators(
  db: D1Database,
  alert: Omit<PushPayload, "urgent">,
  exceptUserId?: string,
): Promise<void> {
  const ids = await operatorIds(db, exceptUserId);
  if (ids.length) await sendPushNotifications(db, ids, { url: "/kivi", ...alert, urgent: true });
}
