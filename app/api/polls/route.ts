import { currentUser, unauthorized } from "@/lib/auth";
import { channelAudience } from "@/lib/dms";
import { publishMessage } from "@/lib/hub-client";
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
    .prepare("SELECT name, kind FROM channels WHERE id = ?")
    .bind(channelId)
    .first<{ name: string; kind: string }>();
  if (!channel) {
    return Response.json({ error: "That channel is gone." }, { status: 404 });
  }

  const pollId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO polls (id, message_id, channel_id, question, options, multi, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      pollId,
      messageId,
      channelId,
      question,
      JSON.stringify(options),
      body.multi ? 1 : 0,
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
    payload: JSON.stringify({ pollId, question, options, multi: Boolean(body.multi) }),
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

/** Current tallies for a poll, plus what the caller voted for. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ counts: [], mine: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const pollId = new URL(request.url).searchParams.get("pollId") || "";
  const poll = await db
    .prepare("SELECT options FROM polls WHERE id = ?")
    .bind(pollId)
    .first<{ options: string }>();
  if (!poll) return Response.json({ error: "No such poll." }, { status: 404 });

  const size = (JSON.parse(poll.options) as string[]).length;
  const rows = await db
    .prepare("SELECT user_id, choice FROM poll_votes WHERE poll_id = ?")
    .bind(pollId)
    .all();

  const counts = new Array(size).fill(0) as number[];
  const mine: number[] = [];
  for (const row of (rows.results || []) as Array<{
    user_id: string;
    choice: number;
  }>) {
    if (row.choice >= 0 && row.choice < size) counts[row.choice] += 1;
    if (row.user_id === user.id) mine.push(row.choice);
  }
  return Response.json({ counts, mine });
}
