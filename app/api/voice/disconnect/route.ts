import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { evictFromVoice } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Disconnect someone from a voice channel. Anyone may disconnect their own
 * seat (say, one left open on another device); disconnecting someone else is
 * gated by MODERATE on the channel's server, like moving them.
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
    return Response.json({ error: "Who, and from where?" }, { status: 400 });
  }

  const channel = await findChannel(db, channelId);
  if (!channel) {
    return Response.json({ error: "That channel is gone." }, { status: 404 });
  }
  const self = targetId === user.id;
  if (!self && !(await can(db, user.id, channel.server_id, Permission.MODERATE))) {
    return Response.json(
      { error: "You do not have permission to disconnect people." },
      { status: 403 },
    );
  }

  const evicted = await evictFromVoice(targetId, [channelId], self ? "self" : "moderator");
  if (!evicted) {
    return Response.json(
      { error: "They are not in that voice channel right now." },
      { status: 409 },
    );
  }

  if (!self) {
    const target = await db
      .prepare("SELECT display_name FROM users WHERE id = ?")
      .bind(targetId)
      .first<{ display_name: string }>();
    await recordAudit(db, {
      serverId: channel.server_id,
      actor: user,
      action: "member.disconnect",
      targetId,
      targetName: target?.display_name || "a member",
      detail: `from ${channel.name}`,
    });
  }

  return Response.json({ ok: true });
}
