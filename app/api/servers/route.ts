import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  limitUser,
  MAX_OWNED_SERVERS,
  MAX_OWNED_SERVERS_RESTRICTED,
  SOCIAL_RATE_LIMITS,
} from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { addServerMember, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import { isRestrictedAccount } from "@/lib/trust";

export const dynamic = "force-dynamic";

/**
 * Every Huddle member belongs to every server, so there is nothing to filter:
 * the list is the same for everyone.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ servers: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);
  return Response.json({ servers: await listServers(db, user.id) });
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
    name?: string;
    icon?: string;
    color?: string;
    isPublic?: boolean;
    description?: string;
  };
  const name = body.name?.trim().slice(0, 50);
  if (!name) {
    return Response.json({ error: "Give the server a name." }, { status: 400 });
  }

  // Servers are free to make, so without a cap one account fills the list.
  if (!isInstanceAdmin(user)) {
    const limited = await limitUser(db, SOCIAL_RATE_LIMITS.createServer, user.id);
    if (limited) return limited;
    const owned = await db
      .prepare("SELECT COUNT(*) AS count FROM servers WHERE created_by = ?")
      .bind(user.id)
      .first<{ count: number }>();
    const cap = isRestrictedAccount(user) ? MAX_OWNED_SERVERS_RESTRICTED : MAX_OWNED_SERVERS;
    if ((owned?.count ?? 0) >= cap) {
      return Response.json(
        {
          error:
            cap === MAX_OWNED_SERVERS_RESTRICTED
              ? "New accounts can make one server for now. Try again tomorrow."
              : `You can own up to ${cap} servers. Delete one you no longer use first.`,
        },
        { status: 403 },
      );
    }
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const icon =
    body.icon?.trim().slice(0, 2).toUpperCase() ||
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.slice(0, 1))
      .join("")
      .toUpperCase();

  const position = await db
    .prepare("SELECT COUNT(*) AS count FROM servers")
    .first<{ count: number }>();

  const isPublic = body.isPublic ? 1 : 0;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 240) : "";
  await db
    .prepare(
      "INSERT INTO servers (id, name, icon, color, created_by, created_at, position, is_public, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      name,
      icon || "H",
      body.color?.trim().slice(0, 24) || "#7b63e6",
      user.id,
      now,
      position?.count ?? 0,
      isPublic,
      description,
    )
    .run();

  // The creator is the first (and, at first, only) member — new servers no
  // longer sweep in every account automatically.
  await addServerMember(db, id, user.id);
  await recordAudit(db, {
    serverId: id,
    actor: user,
    action: "server.create",
    targetName: name,
  });

  // A brand new server is useless without somewhere to talk.
  await db.batch([
    db
      .prepare(
        "INSERT INTO channels (id, server_id, name, kind, topic, position, created_at) VALUES (?, ?, 'general', 'text', '', 0, ?)",
      )
      .bind(crypto.randomUUID(), id, now),
    db
      .prepare(
        "INSERT INTO channels (id, server_id, name, kind, topic, position, created_at) VALUES (?, ?, 'General Voice', 'voice', '', 0, ?)",
      )
      .bind(crypto.randomUUID(), id, now),
  ]);

  const servers = await listServers(db, user.id);
  return Response.json(
    { server: servers.find((server) => server.id === id), servers },
    { status: 201 },
  );
}
