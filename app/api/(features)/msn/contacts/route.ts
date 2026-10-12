import { currentUser, unauthorized } from "@/lib/auth";
import { cleanContacts, emptyContacts } from "@/lib/msn-contacts";
import { WRITE_RATE_LIMITS, limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Your MSN contact groups, placements and quiet list. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ contacts: emptyContacts() });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT data FROM msn_contacts WHERE user_id = ?")
    .bind(user.id)
    .first<{ data: string }>();
  let stored: unknown = {};
  try {
    stored = row ? JSON.parse(row.data) : {};
  } catch {
    stored = {};
  }
  return Response.json({ contacts: cleanContacts(stored) });
}

/** Replaces the whole blob; the client sends its full, edited copy. */
export async function PUT(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { contacts?: unknown };
  const contacts = cleanContacts(body.contacts);
  await db
    .prepare(
      `INSERT INTO msn_contacts (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(user.id, JSON.stringify(contacts), new Date().toISOString())
    .run();
  return Response.json({ contacts });
}
