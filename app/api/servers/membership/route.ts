import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import {
  addServerMember,
  isServerMember,
  listServers,
  removeServerMember,
} from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface Body {
  action?: "join" | "leave";
  serverId?: string;
  /** For "join": the invite code to redeem. */
  code?: string;
}

/**
 * Join a server by redeeming a server invite, or leave one you belong to.
 * Membership is real now, so these are the two ends of it a member controls.
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

  const body = (await request.json().catch(() => ({}))) as Body;

  // ---- join by invite code ------------------------------------------------
  if (body.action === "join") {
    const code = body.code?.trim().toUpperCase().slice(0, 40);
    if (!code) {
      return Response.json({ error: "Enter an invite code." }, { status: 400 });
    }
    const invite = await db
      .prepare(
        "SELECT code, server_id, max_uses, uses, revoked FROM invites WHERE code = ?",
      )
      .bind(code)
      .first<{
        code: string;
        server_id: string | null;
        max_uses: number;
        uses: number;
        revoked: number;
      }>();
    if (
      !invite ||
      invite.revoked ||
      (invite.max_uses > 0 && invite.uses >= invite.max_uses)
    ) {
      return Response.json(
        { error: "That invite code is not valid any more." },
        { status: 400 },
      );
    }
    if (!invite.server_id) {
      return Response.json(
        { error: "That code is for joining the Huddle, not a server." },
        { status: 400 },
      );
    }
    const server = await db
      .prepare("SELECT id, name FROM servers WHERE id = ?")
      .bind(invite.server_id)
      .first<{ id: string; name: string }>();
    if (!server) {
      return Response.json({ error: "That server is gone." }, { status: 404 });
    }
    if (await isServerMember(db, server.id, user.id)) {
      return Response.json({
        alreadyMember: true,
        serverId: server.id,
        servers: await listServers(db, user.id),
      });
    }
    // A banned user cannot invite themselves back in.
    const banned = await db
      .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
      .bind(server.id, user.id)
      .first();
    if (banned) {
      return Response.json(
        { error: "You are banned from that server." },
        { status: 403 },
      );
    }

    await addServerMember(db, server.id, user.id);
    await db
      .prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?")
      .bind(code)
      .run();
    await recordAudit(db, {
      serverId: server.id,
      actor: user,
      action: "member.join",
      targetId: user.id,
      targetName: user.display_name,
      detail: `via invite ${code}`,
    });
    await publishStructureChange();
    return Response.json({
      serverId: server.id,
      servers: await listServers(db, user.id),
    });
  }

  // ---- leave --------------------------------------------------------------
  if (body.action === "leave") {
    const serverId = body.serverId?.slice(0, 64);
    if (!serverId) {
      return Response.json({ error: "Which server?" }, { status: 400 });
    }
    const server = await db
      .prepare("SELECT id, name, created_by FROM servers WHERE id = ?")
      .bind(serverId)
      .first<{ id: string; name: string; created_by: string | null }>();
    if (!server) {
      return Response.json({ error: "That server is gone." }, { status: 404 });
    }
    // The owner can't walk out on their own server — they delete it instead.
    if (server.created_by && server.created_by === user.id) {
      return Response.json(
        { error: "You own this server. Delete it instead of leaving." },
        { status: 400 },
      );
    }
    await removeServerMember(db, serverId, user.id);
    await recordAudit(db, {
      serverId,
      actor: user,
      action: "member.leave",
      targetId: user.id,
      targetName: user.display_name,
    });
    await publishStructureChange();
    return Response.json({ servers: await listServers(db, user.id) });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
