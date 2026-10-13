import { currentUser, unauthorized } from "@/lib/auth";
import { enforceAutomod } from "@/lib/automod";
import { channelKindInfo, textChannelKindsSql } from "@/lib/channel-kinds";
import { canSeeServer, channelAccess } from "@/lib/access";
import { channelAudience, isDmMember } from "@/lib/dms";
import { publishMessage } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { blockIfTimedOut } from "@/lib/timeouts";
import { ensureSchema } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";
import { publicMessage } from "../messages/route";

export const dynamic = "force-dynamic";

/**
 * Creates a poll and the message that renders it. The message carries the poll
 * in its payload (kind "poll"), so it flows through the existing realtime path.
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
    channelId?: string;
    question?: string;
    options?: string[];
    multi?: boolean;
    isPrivate?: boolean;
  };
  const channelId = body.channelId?.slice(0, 64);
  const question = body.question?.trim().slice(0, 200);
  const options = (Array.isArray(body.options) ? body.options : [])
    .map((option) => String(option).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 10);

  if (!channelId || !question || options.length < 2) {
    return Response.json(
      { error: "A poll needs a question and at least two options." },
      { status: 400 },
    );
  }

  const channel = await db
    .prepare(
      `SELECT name, kind, server_id FROM channels WHERE id = ? AND kind IN (${textChannelKindsSql()})`,
    )
    .bind(channelId)
    .first<{ name: string; kind: string; server_id: string }>();
  if (!channel) {
    return Response.json({ error: "That channel is gone." }, { status: 404 });
  }
  // A poll is a message, so it gets the same gates as one: DM membership,
  // bans, timeouts, read-only announcement channels and automod.
  if (channel.kind === "dm") {
    if (!(await isDmMember(db, channelId, user.id))) return unauthorized();
  } else {
    if (!(await canSeeServer(db, channel.server_id, user))) {
      return Response.json({ error: "You are not a member of this server." }, { status: 403 });
    }
    const timedOut = await blockIfTimedOut(db, channelId, user.id);
    if (timedOut) return timedOut;
    if (
      channelKindInfo(channel.kind).moderatorOnlyPosting &&
      !(await can(db, user.id, channel.server_id, Permission.MANAGE_MESSAGES))
    ) {
      return Response.json(
        { error: "Only moderators can post announcements here." },
        { status: 403 },
      );
    }
    const refused = await enforceAutomod(db, {
      serverId: channel.server_id,
      channelId,
      userId: user.id,
      text: [question, ...options].join("\n"),
      checkRepeat: false,
      mayModerate: () => can(db, user.id, channel.server_id, Permission.MODERATE),
    });
    if (refused) return refused;
  }

  const pollId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const isPrivate = Boolean(body.isPrivate);

  await db
    .prepare(
      `INSERT INTO polls (id, message_id, channel_id, question, options, multi, is_private, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      pollId,
      messageId,
      channelId,
      question,
      JSON.stringify(options),
      body.multi ? 1 : 0,
      isPrivate ? 1 : 0,
      user.id,
      now,
    )
    .run();

  const stored: StoredMessage = {
    id: messageId,
    channel: channel.name,
    channel_id: channelId,
    user_id: user.id,
    author: user.display_name,
    avatar: user.avatar,
    color: user.color,
    content: question,
    attachment_key: null,
    is_bot: 0,
    created_at: now,
    kind: "poll",
    payload: JSON.stringify({
      pollId,
      question,
      options,
      multi: Boolean(body.multi),
      isPrivate,
    }),
  };

  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, kind, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.user_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.attachment_key,
      stored.is_bot,
      stored.created_at,
      stored.kind,
      stored.payload,
    )
    .run();

  const message = publicMessage(stored);
  await publishMessage(
    channelId,
    message,
    channel.kind === "dm" ? await channelAudience(db, channelId) : null,
  );
  return Response.json({ pollId, message }, { status: 201 });
}

/** Current tallies for a poll, voters, and user votes. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ counts: [], mine: [], isPrivate: false, voters: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const pollId = new URL(request.url).searchParams.get("pollId") || "";
  const poll = await db
    .prepare("SELECT options, is_private, channel_id FROM polls WHERE id = ?")
    .bind(pollId)
    .first<{ options: string; is_private?: number; channel_id: string }>();
  if (!poll) return Response.json({ error: "No such poll." }, { status: 404 });
  const access = await channelAccess(db, poll.channel_id, user);
  if (!access.ok) return access.response;

  const size = (JSON.parse(poll.options) as string[]).length;
  const isPrivate = Boolean(poll.is_private);

  const rows = await db
    .prepare(
      `SELECT v.user_id, v.choice, u.display_name, u.username
         FROM poll_votes v
         LEFT JOIN users u ON u.id = v.user_id
        WHERE v.poll_id = ?`,
    )
    .bind(pollId)
    .all();

  const counts = new Array(size).fill(0) as number[];
  const mine: number[] = [];
  const voters: Array<Array<{ id: string; name: string }>> = Array.from(
    { length: size },
    () => [],
  );

  for (const row of (rows.results || []) as Array<{
    user_id: string;
    choice: number;
    display_name?: string;
    username?: string;
  }>) {
    if (row.choice >= 0 && row.choice < size) {
      counts[row.choice] += 1;
      if (!isPrivate) {
        voters[row.choice].push({
          id: row.user_id,
          name: row.display_name || row.username || "Anonymous",
        });
      }
    }
    if (row.user_id === user.id) mine.push(row.choice);
  }
  return Response.json({ counts, mine, isPrivate, voters });
}
