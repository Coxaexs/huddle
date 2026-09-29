import { currentUser, unauthorized } from "@/lib/auth";
import { fcmConfigured } from "@/lib/fcm";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Device tokens from the native Android app (Firebase Cloud Messaging).
 * Stored alongside web push subscriptions as kind "fcm", endpoint "fcm:<token>".
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  if (!fcmConfigured()) {
    return Response.json({ configured: false });
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const token = String(body.token || "").trim();
  if (!token || token.length > 4096 || /\s/.test(token)) {
    return Response.json({ error: "Invalid device token." }, { status: 400 });
  }

  // A reinstall or another account on the same phone reuses the token, so it
  // always belongs to whoever registered it last.
  await db
    .prepare(
      `INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at, kind)
       VALUES (?, ?, '', '', ?, 'fcm')`,
    )
    .bind(`fcm:${token}`, user.id, new Date().toISOString())
    .run();
  return Response.json({ configured: true, ok: true });
}

/** Called on log out so the phone stops getting this account's notifications. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: true });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const token = new URL(request.url).searchParams.get("token")?.slice(0, 4096);
  if (token) {
    await db
      .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
      .bind(`fcm:${token}`, user.id)
      .run();
  }
  return Response.json({ ok: true });
}
