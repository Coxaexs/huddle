import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { postableChannelKindsSql, voiceChannelKindsSql } from "@/lib/channel-kinds";
import {
  cleanFeedTitle,
  createFeed,
  feedChannel,
  findFeed,
  getFeed,
  listFeeds,
  MAX_FEEDS_PER_SERVER,
  postFeedItems,
  publicFeed,
} from "@/lib/feeds";
import { publishEventsChanged, publishMessage } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MANAGE_LIMIT = { action: "feed-manage", limit: 20, windowSeconds: 60 };

/** Feeds take Manage Channels, like webhooks. */
async function manager(request: Request, serverId: string) {
  const db = bindings().DB;
  if (!db) return { error: Response.json({ error: "Storage is not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { error: unauthorized() };
  await ensureSchema(db);
  if (!serverId) return { error: Response.json({ error: "Which server?" }, { status: 400 }) };
  const allowed =
    isInstanceAdmin(user) || (await can(db, user.id, serverId, Permission.MANAGE_CHANNELS).catch(() => false));
  if (!allowed) return { error: Response.json({ error: "Feeds take Manage Channels." }, { status: 403 }) };
  return { db, user };
}

/** ?serverId= → the server's feeds and the channels they may post into (text first). */
export async function GET(request: Request) {
  const serverId = new URL(request.url).searchParams.get("serverId")?.slice(0, 64) || "";
  const auth = await manager(request, serverId);
  if ("error" in auth) return auth.error;
  const rows = await listFeeds(auth.db, serverId);
  const channels = await auth.db
    .prepare(
      `SELECT id, name FROM channels WHERE server_id = ? AND kind IN (${postableChannelKindsSql()}) AND kind != 'dm'
        ORDER BY CASE WHEN kind IN (${voiceChannelKindsSql()}) THEN 1 ELSE 0 END, position, name`,
    )
    .bind(serverId)
    .all<{ id: string; name: string }>();
  return Response.json({ feeds: rows.map(publicFeed), channels: channels.results || [], max: MAX_FEEDS_PER_SERVER });
}

/** { serverId, channelId, url, title? } → follows the feed and posts its latest entry. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serverId = String(body.serverId || "").slice(0, 64);
  const auth = await manager(request, serverId);
  if ("error" in auth) return auth.error;
  const limited = await limitUser(auth.db, MANAGE_LIMIT, auth.user.id);
  if (limited) return limited;

  const channel = await feedChannel(auth.db, serverId, String(body.channelId || "").slice(0, 64));
  if (!channel) return Response.json({ error: "Pick a text channel on this server." }, { status: 400 });
  const pasted = typeof body.url === "string" ? body.url.trim().slice(0, 2000) : "";
  if (!pasted) return Response.json({ error: "Paste a link to follow." }, { status: 400 });
  const existing = await listFeeds(auth.db, serverId);
  if (existing.length >= MAX_FEEDS_PER_SERVER) {
    return Response.json({ error: `A server can follow ${MAX_FEEDS_PER_SERVER} feeds.` }, { status: 400 });
  }

  const found = await findFeed(pasted);
  if (!found.ok) return Response.json({ error: found.error }, { status: 400 });
  if (existing.some((feed) => feed.url === found.url && feed.channel_id === channel.id)) {
    return Response.json({ error: `#${channel.name} already follows that.` }, { status: 400 });
  }
  const title = cleanFeedTitle(body.title) || cleanFeedTitle(found.feed.title) || "Feed";
  const row = await createFeed(auth.db, {
    serverId,
    channelId: channel.id,
    url: found.url,
    sourceUrl: pasted,
    kind: found.kind,
    title,
    seen: found.feed.items.map((item) => item.id),
    createdBy: auth.user.id,
  });
  // The newest entry goes up now, so everyone sees what the feed looks like.
  const posted = await postFeedItems(auth.db, row, found.feed.items.slice(0, 1), (channelId, message) =>
    publishMessage(channelId, message),
  ).catch(() => 0);
  await publishEventsChanged();
  await recordAudit(auth.db, { serverId, actor: auth.user, action: "feed.create", targetId: row.id, targetName: `${title} → #${channel.name}` });
  return Response.json({ feed: publicFeed({ ...row, posts: posted, last_post_at: posted ? row.created_at : null }) });
}

/** { id, channelId?, title? } → the updated feed. */
export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  const feed = await getFeed(db, String(body.id || "").slice(0, 64));
  if (!feed) return Response.json({ error: "That feed is gone." }, { status: 404 });
  const auth = await manager(request, feed.server_id);
  if ("error" in auth) return auth.error;

  const title = body.title === undefined ? feed.title : cleanFeedTitle(body.title);
  if (!title) return Response.json({ error: "Give the feed a name." }, { status: 400 });
  let channelId = feed.channel_id;
  if (body.channelId !== undefined) {
    const channel = await feedChannel(db, feed.server_id, String(body.channelId).slice(0, 64));
    if (!channel) return Response.json({ error: "Pick a text channel on this server." }, { status: 400 });
    channelId = channel.id;
  }
  await db.prepare("UPDATE server_feeds SET title = ?, channel_id = ? WHERE id = ?").bind(title, channelId, feed.id).run();
  return Response.json({ feed: publicFeed({ ...feed, title, channel_id: channelId }) });
}

/** ?id= → unfollowed; nothing more is posted. */
export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  const feed = await getFeed(db, new URL(request.url).searchParams.get("id")?.slice(0, 64) || "");
  if (!feed) return Response.json({ ok: true });
  const auth = await manager(request, feed.server_id);
  if ("error" in auth) return auth.error;
  await db.prepare("DELETE FROM server_feeds WHERE id = ?").bind(feed.id).run();
  await recordAudit(db, { serverId: feed.server_id, actor: auth.user, action: "feed.delete", targetId: feed.id, targetName: feed.title });
  return Response.json({ ok: true });
}
