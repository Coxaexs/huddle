import { currentUser, unauthorized } from "@/lib/auth";
import { channelAudience } from "@/lib/dms";
import { publishMessage, publishMessageEvent, publishPlay } from "@/lib/hub-client";
import {
  PLAY_GAMES,
  answerRequest,
  askToJoin,
  closeInvite,
  inviteExpired,
  isPlayGame,
  mayJoin,
  newPlayInvite,
  parsePlayInvite,
  planJoin,
  playSummary,
  type JoinPlan,
  type PlayGameId,
  type PlayInvite,
  type PlayResult,
} from "@/lib/play-together";
import { playableChannel } from "@/lib/playable-channel";
import { WRITE_RATE_LIMITS, limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { steamPresence } from "@/lib/steam";
import { bindings, type StoredMessage } from "@/lib/storage";
import { publicMessage } from "@/app/api/messages/route";

export const dynamic = "force-dynamic";

/** The host's linked Steam account, if any. */
async function steamIdOf(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT steam_id FROM steam_links WHERE user_id = ?")
    .bind(userId)
    .first<{ steam_id: string }>();
  return row?.steam_id ?? null;
}

/** How someone gets into this host's game right now (asks Steam each time). */
async function joinPlan(db: D1Database, game: PlayGameId, hostId: string): Promise<JoinPlan> {
  const key = bindings().STEAM_WEB_API_KEY?.trim();
  const hostSteamId = await steamIdOf(db, hostId);
  const presence = hostSteamId && key ? await steamPresence(hostSteamId, key) : null;
  return planJoin(game, hostSteamId, presence, Boolean(key));
}

/**
 * What the host sees about their own game: "friends can join in one click",
 * or why not. The join link itself is left out; it is the host's own lobby.
 */
async function hostCheck(db: D1Database, game: PlayGameId, hostId: string) {
  const plan = await joinPlan(db, game, hostId);
  return plan.how === "lobby" ? { oneClick: true as const } : { oneClick: false as const, reason: plan.reason };
}

interface InviteRow {
  channel_id: string;
  payload: string;
}

async function loadInvite(db: D1Database, messageId: string) {
  const row = await db
    .prepare(
      `SELECT m.channel_id, m.payload
         FROM messages m JOIN play_invites p ON p.message_id = m.id
        WHERE m.id = ? AND m.deleted_at IS NULL`,
    )
    .bind(messageId)
    .first<InviteRow>();
  if (!row) return null;
  try {
    const state = parsePlayInvite((JSON.parse(row.payload) as { play?: unknown }).play);
    return state ? { channelId: row.channel_id, state } : null;
  } catch {
    return null;
  }
}

/**
 * Saves a changed card and shows it to everyone as a message edit. The
 * version guard refuses the write if someone else changed it first.
 */
async function saveInvite(
  db: D1Database,
  messageId: string,
  channelId: string,
  before: PlayInvite,
  after: PlayInvite,
): Promise<boolean> {
  if (after === before) return true;
  const content = playSummary(after);
  const payload = { play: after };
  const saved = await db
    .prepare(
      `UPDATE messages SET payload = ?, content = ?
        WHERE id = ? AND json_extract(payload, '$.play.version') = ?`,
    )
    .bind(JSON.stringify(payload), content, messageId, before.version)
    .run();
  if (!saved.meta.changes) return false;
  await publishMessageEvent(
    channelId,
    { t: "message-edited", id: messageId, content, payload },
    await channelAudience(db, channelId),
  );
  return true;
}

/** A host has one live invite per game: posting a new one closes the old ones. */
async function closeOlderInvites(db: D1Database, hostId: string, game: PlayGameId): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT p.message_id FROM play_invites p JOIN messages m ON m.id = p.message_id
        WHERE p.host_id = ? AND p.game = ? AND m.deleted_at IS NULL
          AND json_extract(m.payload, '$.play.status') = 'open'
        ORDER BY p.created_at DESC LIMIT 10`,
    )
    .bind(hostId, game)
    .all<{ message_id: string }>();
  for (const { message_id } of results ?? []) {
    const loaded = await loadInvite(db, message_id);
    if (!loaded) continue;
    const closed = closeInvite(loaded.state, hostId);
    if ("state" in closed) await saveInvite(db, message_id, loaded.channelId, loaded.state, closed.state);
  }
}

/**
 * POST { action: "start", channelId, game, askFirst? } posts an invite card.
 * POST { action: "check", game } tells the host whether friends can join in one click.
 * POST { action: "ask" | "close" | "join", messageId }
 * POST { action: "answer", messageId, userId, accept }
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
    game?: unknown;
    askFirst?: boolean;
    messageId?: string;
    userId?: string;
    accept?: boolean;
  };

  if (body.action === "check") {
    if (!isPlayGame(body.game)) return Response.json({ error: "Unknown game." }, { status: 400 });
    const limited = await limitUser(db, { action: "play-steam", limit: 30, windowSeconds: 60 }, user.id);
    if (limited) return limited;
    return Response.json(await hostCheck(db, body.game, user.id));
  }

  if (body.action === "start") {
    const limited = await limitUser(db, { action: "play-start", limit: 6, windowSeconds: 60 }, user.id);
    if (limited) return limited;
    if (!isPlayGame(body.game)) return Response.json({ error: "Unknown game." }, { status: 400 });
    const channel = await playableChannel(db, String(body.channelId || "").slice(0, 64), user.id);
    if (channel instanceof Response) return channel;
    await closeOlderInvites(db, user.id, body.game);

    const state = newPlayInvite(body.game, { id: user.id, name: user.display_name }, body.askFirst !== false);
    const stored: StoredMessage = {
      id: crypto.randomUUID(),
      channel: channel.name,
      channel_id: channel.id,
      user_id: user.id,
      author: user.display_name,
      avatar: user.avatar,
      color: user.color,
      content: playSummary(state),
      attachment_key: null,
      is_bot: 0,
      created_at: new Date().toISOString(),
      kind: "play",
      payload: JSON.stringify({ play: state }),
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
        .prepare("INSERT INTO play_invites (message_id, host_id, game, created_at) VALUES (?, ?, ?, ?)")
        .bind(stored.id, user.id, body.game, stored.created_at),
    ]);
    const message = publicMessage(stored);
    await publishMessage(channel.id, message, await channelAudience(db, channel.id));
    return Response.json({ message, check: await hostCheck(db, body.game, user.id) }, { status: 201 });
  }

  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;
  const messageId = String(body.messageId || "").slice(0, 64);
  const loaded = await loadInvite(db, messageId);
  if (!loaded) return Response.json({ error: "That invite is gone." }, { status: 404 });
  const channel = await playableChannel(db, loaded.channelId, user.id);
  if (channel instanceof Response) return channel;
  const { state } = loaded;
  const me = { id: user.id, name: user.display_name };

  if (body.action === "join") {
    if (!mayJoin(state, user.id)) {
      const closed = state.status === "closed" || inviteExpired(state);
      return Response.json(
        { error: closed ? "This invite is closed." : "The host hasn't let you in yet." },
        { status: 403 },
      );
    }
    const steamLimited = await limitUser(db, { action: "play-steam", limit: 30, windowSeconds: 60 }, user.id);
    if (steamLimited) return steamLimited;
    return Response.json({
      plan: await joinPlan(db, state.game, state.host.id),
      game: state.game,
      host: state.host.name,
    });
  }

  let result: PlayResult;
  if (body.action === "ask") result = askToJoin(state, me);
  else if (body.action === "answer") {
    result = answerRequest(state, user.id, String(body.userId || "").slice(0, 64), Boolean(body.accept));
  } else if (body.action === "close") result = closeInvite(state, user.id);
  else return Response.json({ error: "Unknown action." }, { status: 400 });
  if ("error" in result) return Response.json({ error: result.error }, { status: 409 });

  if (!(await saveInvite(db, messageId, loaded.channelId, state, result.state))) {
    return Response.json({ error: "Someone else answered first; try again." }, { status: 409 });
  }

  const game = PLAY_GAMES[state.game].name;
  if (body.action === "ask" && result.state !== state) {
    const mine = result.state.requests.find((r) => r.id === user.id);
    if (mine?.status === "asked") {
      await publishPlay(state.host.id, {
        kind: "ask",
        messageId,
        channelId: loaded.channelId,
        game,
        from: me,
      });
    }
  }
  if (body.action === "answer" && result.state !== state) {
    const target = result.state.requests.find((r) => r.id === body.userId);
    if (target) {
      await publishPlay(target.id, {
        kind: "answer",
        messageId,
        channelId: loaded.channelId,
        game,
        host: state.host.name,
        accepted: target.status === "accepted",
      });
    }
  }
  return Response.json({ play: result.state });
}
