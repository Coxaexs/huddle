import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Serves the VAPID public key the browser needs to subscribe, and stores/removes
 * push subscriptions per user. The private key and subject live in
 * .dev.vars (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT); when they
 * are absent, the endpoints report that push is not configured.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ configured: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const publicKey = (bindings() as { VAPID_PUBLIC_KEY?: string }).VAPID_PUBLIC_KEY;
  return Response.json({
    configured: Boolean(publicKey),
    publicKey,
  });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    p256dh?: string;
    auth?: string;
  };
  const endpoint = body.endpoint?.slice(0, 1000);
  const p256dh = body.p256dh?.slice(0, 500);
  const auth = body.auth?.slice(0, 500);
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "Incomplete subscription." }, { status: 400 });
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(endpoint, user.id, p256dh, auth, new Date().toISOString())
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: true });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint")?.slice(0, 1000);
  if (endpoint) {
    await db
      .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
      .bind(endpoint, user.id)
      .run();
  }
  return Response.json({ ok: true });
}