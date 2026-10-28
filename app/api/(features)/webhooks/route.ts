import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { postableChannelKindsSql, voiceChannelKindsSql } from "@/lib/channel-kinds";
import { can, Permission } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  cleanWebhookAvatar,
  cleanWebhookName,
  createWebhook,
  getWebhook,
  listWebhooks,
  MAX_WEBHOOKS_PER_SERVER,
  newWebhookToken,
  publicWebhook,
  webhookChannel,
} from "@/lib/webhooks";

export const dynamic = "force-dynamic";

const MANAGE_LIMIT = { action: "webhook-manage", limit: 30, windowSeconds: 60 };

/** Webhooks take Manage Channels, as on Discord (Manage Webhooks). */
async function manager(request: Request, serverId: string) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  if (!serverId) return { error: Response.json({ error: "Which server?" }, { status: 400 }) };
  const allowed =
    isInstanceAdmin(user) || (await can(db, user.id, serverId, Permission.MANAGE_CHANNELS).catch(() => false));
  if (!allowed) return { error: Response.json({ error: "Webhooks take Manage Channels." }, { status: 403 }) };
  return { db, user };
}

/** ?serverId= → the server's webhooks, URLs included (managers only). */
export async function GET(request: Request) {
  const serverId = new URL(request.url).searchParams.get("serverId")?.slice(0, 64) || "";
  const auth = await manager(request, serverId);
  if ("error" in auth) return auth.error;
  const rows = await listWebhooks(auth.db, serverId);
  // The channels one may point at, so the panel needs no second request.
  const channels = await auth.db
    .prepare(
      `SELECT id, name FROM channels WHERE server_id = ? AND kind IN (${postableChannelKindsSql()}) AND kind != 'dm'
        ORDER BY CASE WHEN kind IN (${voiceChannelKindsSql()}) THEN 1 ELSE 0 END, position, name`,
    )
    .bind(serverId)
    .all<{ id: string; name: string }>();
  return Response.json({
    webhooks: rows.map(publicWebhook),
    channels: channels.results || [],
    max: MAX_WEBHOOKS_PER_SERVER,
  });
}

/** { serverId, channelId, name, avatar } → a new webhook. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serverId = String(body.serverId || "").slice(0, 64);
  const auth = await manager(request, serverId);
  if ("error" in auth) return auth.error;
  const limited = await limitUser(auth.db, MANAGE_LIMIT, auth.user.id);
  if (limited) return limited;

  const name = cleanWebhookName(body.name);
  if (!name) return Response.json({ error: "Give the webhook a name." }, { status: 400 });
  const channel = await webhookChannel(auth.db, serverId, String(body.channelId || "").slice(0, 64));
  if (!channel) return Response.json({ error: "Pick a text channel on this server." }, { status: 400 });
  const existing = await listWebhooks(auth.db, serverId);
  if (existing.length >= MAX_WEBHOOKS_PER_SERVER) {
    return Response.json({ error: `A server can have ${MAX_WEBHOOKS_PER_SERVER} webhooks.` }, { status: 400 });
  }
  const row = await createWebhook(auth.db, {
    serverId,
    channelId: channel.id,
    name,
    avatar: cleanWebhookAvatar(body.avatar),
    createdBy: auth.user.id,
  });
  await recordAudit(auth.db, { serverId, actor: auth.user, action: "webhook.create", targetId: row.id, targetName: `${name} → #${channel.name}` });
  return Response.json({ webhook: publicWebhook(row) });
}

/** { id, name?, avatar?, channelId?, rotate? } → the updated webhook. `rotate` issues a new URL. */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  await ensureSchema(db);
  const hook = await getWebhook(db, String(body.id || "").slice(0, 32));
  if (!hook) return Response.json({ error: "That webhook is gone." }, { status: 404 });
  const auth = await manager(request, hook.server_id);
  if ("error" in auth) return auth.error;

  const name = body.name === undefined ? hook.name : cleanWebhookName(body.name);
  if (!name) return Response.json({ error: "Give the webhook a name." }, { status: 400 });
  const avatar = body.avatar === undefined ? hook.avatar : cleanWebhookAvatar(body.avatar);
  let channelId = hook.channel_id;
  if (body.channelId !== undefined) {
    const channel = await webhookChannel(db, hook.server_id, String(body.channelId).slice(0, 64));
    if (!channel) return Response.json({ error: "Pick a text channel on this server." }, { status: 400 });
    channelId = channel.id;
  }
  const token = body.rotate === true ? newWebhookToken() : hook.token;
  await db
    .prepare("UPDATE channel_webhooks SET name = ?, avatar = ?, channel_id = ?, token = ? WHERE id = ?")
    .bind(name, avatar, channelId, token, hook.id)
    .run();
  if (body.rotate === true) {
    await recordAudit(db, { serverId: hook.server_id, actor: auth.user, action: "webhook.rotate", targetId: hook.id, targetName: name });
  }
  return Response.json({ webhook: publicWebhook({ ...hook, name, avatar, channel_id: channelId, token }) });
}

/** ?id= → deleted; its URL stops working at once. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  await ensureSchema(db);
  const hook = await getWebhook(db, new URL(request.url).searchParams.get("id")?.slice(0, 32) || "");
  if (!hook) return Response.json({ ok: true });
  const auth = await manager(request, hook.server_id);
  if ("error" in auth) return auth.error;
  await db.prepare("DELETE FROM channel_webhooks WHERE id = ?").bind(hook.id).run();
  await recordAudit(db, { serverId: hook.server_id, actor: auth.user, action: "webhook.delete", targetId: hook.id, targetName: hook.name });
  return Response.json({ ok: true });
}
