import { currentUser, unauthorized } from "@/lib/auth";
import { channelKindInfo, textChannelKindsSql } from "@/lib/channel-kinds";
import { channelAudience, isDmMember } from "@/lib/dms";
import {
  GAME_INFO,
  SOLO_GAMES,
  declineGame,
  isGameKind,
  joinGame,
  newGame,
  playMove,
  resignGame,
  type GameResult,
  type GameSecret,
  type GameState,
} from "@/lib/games";
import { publishMessage, publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { WRITE_RATE_LIMITS, limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings, type StoredMessage } from "@/lib/storage";
import { stripTextStyle } from "@/lib/text-style";
import { blockIfTimedOut } from "@/lib/timeouts";
import { publicMessage } from "../messages/route";

export const dynamic = "force-dynamic";

interface Channel {
  id: string;
  name: string;
  kind: string;
  server_id: string;
}

/**
 * The same gates as sending a message there: DM membership, server
 * membership, bans, timeouts and read-only announcement channels. Returns the
 * channel, or the response refusing it.
 */
async function playableChannel(
  db: D1Database,
  channelId: string,
  userId: string,
): Promise<Channel | Response> {
  const channel = await db
    .prepare(`SELECT id, name, kind, server_id FROM channels WHERE id = ? AND kind IN (${textChannelKindsSql()})`)
    .bind(channelId)
    .first<Channel>();
  if (!channel) return Response.json({ error: "That conversation is gone." }, { status: 404 });
  if (channel.kind === "dm") {
    return (await isDmMember(db, channelId, userId)) ? channel : unauthorized();
  }
  if (!(await isServerMember(db, channel.server_id, userId))) return unauthorized();
  const banned = await db
    .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
    .bind(channel.server_id, userId)
    .first();
  if (banned) return Response.json({ error: "You are banned from this server." }, { status: 403 });
  const timedOut = await blockIfTimedOut(db, channelId, userId);
  if (timedOut) return timedOut;
  if (
    channelKindInfo(channel.kind).moderatorOnlyPosting &&
    !(await can(db, userId, channel.server_id, Permission.MANAGE_MESSAGES))
  ) {
    return Response.json({ error: "Only moderators can post here." }, { status: 403 });
  }
  return channel;
}

/** The one-line text a game message carries for search, previews and old clients. */
function summary(state: GameState): string {
  const info = GAME_INFO[state.kind];
  const a = stripTextStyle(state.players[0].name);
  const b = state.players[1] ? stripTextStyle(state.players[1].name) : null;
  switch (state.status) {
    case "waiting":
      return `wants to play ${info.name}!`;
    case "playing":
      return state.solo ? `is playing ${info.name}.` : `is playing ${info.name} with ${b ?? "someone"}.`;
    case "won":
      return `${info.name}: ${state.winner === 0 ? a : b} won!`;
    case "draw":
      return state.solo ? `${info.name}: ${a} ran out of guesses.` : `${info.name}: it's a draw.`;
    case "declined":
      return `${info.name}: invitation declined.`;
    default:
      return state.solo ? `${info.name}: ${a} gave up.` : `${info.name}: invitation cancelled.`;
  }
}

/**
 * POST { action: "start", channelId, kind } sends an invitation.
 * POST { action: "join" | "decline" | "resign" | "move", messageId, move? }
 * plays it; the updated card goes to everyone as a message edit.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    channelId?: string;
    kind?: unknown;
    solo?: boolean;
    messageId?: string;
    move?: unknown;
  };

  if (body.action === "start") {
    const limited = await limitUser(db, { action: "game-start", limit: 10, windowSeconds: 60 }, user.id);
    if (limited) return limited;
    if (!isGameKind(body.kind)) return Response.json({ error: "Unknown game." }, { status: 400 });
    const channel = await playableChannel(db, String(body.channelId || "").slice(0, 64), user.id);
    if (channel instanceof Response) return channel;
    // In a one-to-one DM the invitation is for the other person.
    const audience = channel.kind === "dm" ? await channelAudience(db, channel.id) : null;
    const others = audience?.filter((id) => id !== user.id) ?? [];
    const invitee = others.length === 1 ? others[0] : null;
    const solo = Boolean(body.solo) && SOLO_GAMES.includes(body.kind);
    const { state, secret } = newGame(
      body.kind,
      { id: user.id, name: user.display_name },
      solo ? null : invitee,
      Math.random,
      solo,
    );

    const stored: StoredMessage = {
      id: crypto.randomUUID(),
      channel: channel.name,
      channel_id: channel.id,
      user_id: user.id,
      author: user.display_name,
      avatar: user.avatar,
      color: user.color,
      content: summary(state),
      attachment_key: null,
      is_bot: 0,
      created_at: new Date().toISOString(),
      kind: "game",
      payload: JSON.stringify({ game: state }),
    };
    await db.batch([
      db
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
          null,
          0,
          stored.created_at,
          stored.kind,
          stored.payload,
        ),
      db
        .prepare("INSERT INTO conversation_games (message_id, secret) VALUES (?, ?)")
        .bind(stored.id, JSON.stringify(secret)),
    ]);
    const message = publicMessage(stored);
    await publishMessage(channel.id, message, audience);
    return Response.json({ message }, { status: 201 });
  }

  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;
  const messageId = String(body.messageId || "").slice(0, 64);
  const row = await db
    .prepare(
      `SELECT m.channel_id, m.payload, g.secret
         FROM messages m JOIN conversation_games g ON g.message_id = m.id
        WHERE m.id = ? AND m.deleted_at IS NULL`,
    )
    .bind(messageId)
    .first<{ channel_id: string; payload: string; secret: string }>();
  if (!row) return Response.json({ error: "That game is gone." }, { status: 404 });
  const channel = await playableChannel(db, row.channel_id, user.id);
  if (channel instanceof Response) return channel;

  let state: GameState;
  let secret: GameSecret;
  try {
    state = (JSON.parse(row.payload) as { game: GameState }).game;
    secret = JSON.parse(row.secret) as GameSecret;
  } catch {
    return Response.json({ error: "That game is broken." }, { status: 500 });
  }

  const me = { id: user.id, name: user.display_name };
  let result: GameResult;
  if (body.action === "join") result = joinGame(state, secret, me);
  else if (body.action === "decline") result = declineGame(state, secret, user.id);
  else if (body.action === "resign") result = resignGame(state, secret, user.id);
  else if (body.action === "move") result = playMove(state, secret, user.id, body.move);
  else return Response.json({ error: "Unknown action." }, { status: 400 });
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });

  const content = summary(result.state);
  const payload = { game: result.state };
  // `moves` guards the write: if someone else's move landed first, this one
  // is refused rather than overwriting it.
  const saved = await db
    .prepare(
      `UPDATE messages SET payload = ?, content = ?
        WHERE id = ? AND json_extract(payload, '$.game.moves') = ?`,
    )
    .bind(JSON.stringify(payload), content, messageId, state.moves)
    .run();
  if (!saved.meta.changes) {
    return Response.json({ error: "Someone moved first; try again." }, { status: 409 });
  }
  await db
    .prepare("UPDATE conversation_games SET secret = ? WHERE message_id = ?")
    .bind(JSON.stringify(result.secret), messageId)
    .run();
  await publishMessageEvent(
    row.channel_id,
    { t: "message-edited", id: messageId, content, payload },
    await channelAudience(db, row.channel_id),
  );
  return Response.json({ game: result.state });
}
