import { currentUser, unauthorized } from "@/lib/auth";
import { publishEventsChanged, publishMemberUpdate, publishPresenceStatus } from "@/lib/hub-client";
import { MAX_STATUS_LIFETIME_MS } from "@/lib/status-expiry";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["online", "idle", "dnd", "invisible"]);

/** Set your presence status and/or custom status text. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    status?: string;
    customStatus?: string | null;
    /** Clear the custom status this long from now; null keeps it until changed. */
    clearAfterMs?: number | null;
  };

  const status = STATUSES.has(body.status || "") ? body.status! : undefined;
  const custom =
    body.customStatus === undefined
      ? undefined
      : (body.customStatus || "").trim().slice(0, 80) || null;

  const clearAfter =
    body.clearAfterMs === undefined
      ? undefined
      : typeof body.clearAfterMs === "number" && body.clearAfterMs > 0
        ? Math.min(Math.round(body.clearAfterMs), MAX_STATUS_LIFETIME_MS)
        : null;
  // A new status takes the clear time sent with it (none: it stays); no status, no clear time.
  const expiresAt =
    custom === undefined
      ? clearAfter === undefined
        ? undefined
        : clearAfter && Date.now() + clearAfter
      : custom && clearAfter
        ? Date.now() + clearAfter
        : null;

  if (status === undefined && custom === undefined && expiresAt === undefined) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  if (status !== undefined && custom !== undefined) {
    await db
      .prepare("UPDATE users SET status = ?, custom_status = ? WHERE id = ?")
      .bind(status, custom, user.id)
      .run();
  } else if (status !== undefined) {
    await db
      .prepare("UPDATE users SET status = ? WHERE id = ?")
      .bind(status, user.id)
      .run();
  } else if (custom !== undefined) {
    await db
      .prepare("UPDATE users SET custom_status = ? WHERE id = ?")
      .bind(custom, user.id)
      .run();
  }
  if (expiresAt !== undefined) {
    // Only a status that is there can clear itself.
    await db
      .prepare("UPDATE users SET custom_status_expires_at = CASE WHEN custom_status IS NULL THEN NULL ELSE ? END WHERE id = ?")
      .bind(expiresAt || null, user.id)
      .run();
    // The hub's alarm is what clears it; make sure it is set early enough.
    if (expiresAt) await publishEventsChanged();
  }

  if (status !== undefined) await publishPresenceStatus(user.id, status === "invisible");
  // Everyone's member list refreshes off the structure event.
  await publishMemberUpdate(user.id);
  const row = await db
    .prepare("SELECT custom_status_expires_at AS expires FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ expires: number | null }>();
  return Response.json({ ok: true, status, customStatus: custom, customStatusExpiresAt: row?.expires ?? null });
}
