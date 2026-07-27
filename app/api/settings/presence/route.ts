import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
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
  };

  const status = STATUSES.has(body.status || "") ? body.status! : undefined;
  const custom =
    body.customStatus === undefined
      ? undefined
      : (body.customStatus || "").trim().slice(0, 80) || null;

  if (status === undefined && custom === undefined) {
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
  } else {
    await db
      .prepare("UPDATE users SET custom_status = ? WHERE id = ?")
      .bind(custom, user.id)
      .run();
  }

  // Everyone's member list refreshes off the structure event.
  await publishStructureChange();
  return Response.json({ ok: true, status, customStatus: custom });
}
