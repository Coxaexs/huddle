import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * /ttsstop: an administrator cuts off every /tts being read in a text channel
 * and every /say playing in a voice channel, for everyone at once. Each tab
 * stops its own playback (and its own /say) when the event arrives.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { channelIds?: unknown };
  const channelIds = Array.isArray(body.channelIds)
    ? [...new Set(body.channelIds.filter((id): id is string => typeof id === "string").map((id) => id.slice(0, 64)))].slice(0, 2)
    : [];
  if (!channelIds.length) {
    return Response.json({ error: "Which channel?" }, { status: 400 });
  }

  let stopped = 0;
  for (const channelId of channelIds) {
    const channel = await findChannel(db, channelId);
    // Server channels only: a DM has no administrators to ask.
    if (!channel?.server_id) continue;
    if (!(await can(db, user.id, channel.server_id, Permission.ADMINISTRATOR))) {
      return Response.json(
        { error: "Only administrators can force-stop text-to-speech." },
        { status: 403 },
      );
    }
    await publishMessageEvent(channelId, { t: "tts-stop", by: user.display_name });
    await recordAudit(db, {
      serverId: channel.server_id,
      actor: user,
      action: "tts.stop",
      targetId: channelId,
      targetName: channel.name,
      detail: "stopped all /tts and /say",
    });
    stopped++;
  }
  if (!stopped) {
    return Response.json({ error: "Text-to-speech can only be force-stopped in a server channel." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
