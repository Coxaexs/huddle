import { currentUser, unauthorized } from "@/lib/auth";
import {
  payloadHasComponent,
  payloadOwner,
} from "@/lib/discord/bot-messages";
import { runBotCommand } from "@/lib/discord/interactions";
import { InteractionType } from "@/lib/discord/protocol";
import { isDmMember } from "@/lib/dms";
import { DM_SERVER_ID, ensureSchema } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * A button press or select on a bot's message, sent to that bot as a
 * MESSAGE_COMPONENT interaction.
 *
 * The owning bot comes from the message itself (its payload records who sent
 * it) or, for an ephemeral message that was never stored, from the
 * interaction that produced it, which also proves the presser is the one
 * person who could see it.
 */
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const db = bindings().DB;
  if (!db) return Response.json({ ok: false, reason: "unavailable" });
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    messageId?: string;
    customId?: string;
    componentType?: number;
    values?: unknown;
  };
  const customId = String(body.customId || "").slice(0, 100);
  if (!body.channelId || !body.messageId || !customId) {
    return Response.json({ error: "Missing channel, message or component" }, { status: 400 });
  }

  const channel = await findChannel(db, body.channelId);
  if (!channel) return Response.json({ error: "Channel not found" }, { status: 404 });
  const allowed =
    channel.server_id === DM_SERVER_ID || channel.kind === "dm"
      ? await isDmMember(db, channel.id, user.id)
      : await isServerMember(db, channel.server_id, user.id);
  if (!allowed) return Response.json({ error: "Not allowed" }, { status: 403 });

  const stored = await db
    .prepare(
      "SELECT payload FROM messages WHERE id = ? AND channel_id = ? AND deleted_at IS NULL",
    )
    .bind(body.messageId, channel.id)
    .first<{ payload: string | null }>();

  let botId: string | null = null;
  if (stored) {
    if (!payloadHasComponent(stored.payload, customId)) {
      return Response.json({ ok: false, reason: "unknown" });
    }
    botId = payloadOwner(stored.payload);
  } else {
    const origin = await db
      .prepare(
        `SELECT bot_id FROM discord_interactions
         WHERE response_message_id = ? AND channel_id = ? AND user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(body.messageId, channel.id, user.id)
      .first<{ bot_id: string }>();
    botId = origin?.bot_id ?? null;
  }
  if (!botId) return Response.json({ ok: false, reason: "unknown" });

  const values = Array.isArray(body.values)
    ? body.values.filter((value): value is string => typeof value === "string").slice(0, 25)
    : undefined;

  const result = await runBotCommand({
    channelId: channel.id,
    userId: user.id,
    commandName: "",
    type: InteractionType.MessageComponent,
    customId,
    componentType: body.componentType === 3 ? 3 : 2,
    values,
    messageId: body.messageId,
    botId,
  });

  return Response.json({
    ok: result.status === "dispatched",
    reason: result.status === "dispatched" ? null : result.status,
  });
}
