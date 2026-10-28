import { channelAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { getWidget, widgetHasComponent, widgetMessageId } from "@/lib/bot-widgets";
import { runBotCommand } from "@/lib/discord/interactions";
import { InteractionType } from "@/lib/discord/protocol";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * A button or select on a bot widget, sent to the bot as a MESSAGE_COMPONENT
 * interaction "on" the widget, so the bot's UpdateMessage answer changes the
 * widget. The interaction happens in a channel: the widget's own room, or the
 * channel the person has open in that server.
 */
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false, reason: "unavailable" });
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    botId?: string;
    name?: string;
    /** The widget's room, when it belongs to one. */
    channelId?: string | null;
    /** The channel the person has open, for a server-wide widget. */
    contextChannelId?: string | null;
    customId?: string;
    componentType?: number;
    values?: unknown;
  };
  const customId = String(body.customId || "").slice(0, 100);
  if (!body.serverId || !body.botId || !body.name || !customId) {
    return Response.json({ error: "Missing widget or component" }, { status: 400 });
  }

  const widget = await getWidget(db, body.serverId, body.botId, body.name, body.channelId || null);
  if (!widget || !widgetHasComponent(widget, customId)) {
    return Response.json({ ok: false, reason: "unknown" });
  }

  const channelId = widget.channelId || body.contextChannelId || "";
  const access = channelId ? await channelAccess(db, channelId, user) : null;
  if (!access?.ok || access.channel.serverId !== widget.serverId) {
    return Response.json({ ok: false, reason: "unknown" });
  }

  const values = Array.isArray(body.values)
    ? body.values.filter((value): value is string => typeof value === "string").slice(0, 25)
    : undefined;

  const result = await runBotCommand({
    channelId: access.channel.id,
    userId: user.id,
    commandName: "",
    type: InteractionType.MessageComponent,
    customId,
    componentType: body.componentType === 3 ? 3 : 2,
    values,
    messageId: widgetMessageId(widget.serverId, widget.botId, widget.name, widget.channelId),
    botId: widget.botId,
  });

  return Response.json({
    ok: result.status === "dispatched",
    reason: result.status === "dispatched" ? null : result.status,
  });
}
