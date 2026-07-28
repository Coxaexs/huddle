import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { moveVoiceUser } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Move a member from whatever voice channel they are in into another one.
 * Gated by MODERATE on the destination channel's server, the same permission
 * that can server-mute people. The actual join happens on the target's tab.
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
    userId?: string;
    channelId?: string;
  };
  const targetId = body.userId?.slice(0, 64);
  const channelId = body.channelId?.slice(0, 64);
  if (!targetId || !channelId) {
    return Response.json({ error: "Who, and to where?" }, { status: 400 });
  }

  const channel = await findChannel(db, channelId);
  if (!channel || channel.kind !== "voice") {
    return Response.json(
      { error: "That is not a voice channel." },
      { status: 400 },
    );
  }
  if (!(await can(db, user.id, channel.server_id, Permission.MODERATE))) {
    return Response.json(
      { error: "You do not have permission to move people." },
      { status: 403 },
    );
  }

  const moved = await moveVoiceUser(targetId, channelId);
  if (!moved) {
    return Response.json(
      { error: "They are not in a voice channel right now." },
      { status: 409 },
    );
  }

  const target = await db
    .prepare("SELECT display_name FROM users WHERE id = ?")
    .bind(targetId)
    .first<{ display_name: string }>();
  await recordAudit(db, {
    serverId: channel.server_id,
    actor: user,
    action: "member.move",
    targetId,
    targetName: target?.display_name || "a member",
    detail: `to ${channel.name}`,
  });

  return Response.json({ ok: true });
}
