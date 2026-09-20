import { currentUser, unauthorized } from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Persist a drag-and-drop reorder of the server rail. Each member has their
 * own ordering, so positions are stored per (server, user) in
 * `server_member_positions` and merged over the global `servers.position`.
 */
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
    servers?: Array<{ id: string; position: number }>;
  };
  const items = (body.servers || []).filter(
    (item) => item && typeof item.id === "string" && item.id,
  );
  if (!items.length) {
    return Response.json({ error: "Nothing to reorder." }, { status: 400 });
  }

  // Only reorder servers the caller actually belongs to.
  const membership = await db
    .prepare(
      `SELECT server_id FROM server_members WHERE user_id = ? AND server_id IN (${items
        .map(() => "?")
        .join(",")})`,
    )
    .bind(user.id, ...items.map((item) => item.id))
    .all<{ server_id: string }>();
  const allowed = new Set(
    ((membership.results || []) as Array<{ server_id: string }>).map(
      (row) => row.server_id,
    ),
  );

  const statements = [];
  for (const item of items) {
    if (!allowed.has(item.id)) continue;
    statements.push(
      db
        .prepare(
          `INSERT INTO server_member_positions (server_id, user_id, position)
           VALUES (?, ?, ?)
           ON CONFLICT(server_id, user_id) DO UPDATE SET position = excluded.position`,
        )
        .bind(item.id, user.id, Number(item.position) || 0),
    );
  }
  if (statements.length) await db.batch(statements);

  await publishStructureChange();
  return Response.json({ servers: await listServers(db, user.id) });
}
