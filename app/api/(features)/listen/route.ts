import { currentUser, unauthorized } from "@/lib/auth";
import { channelAudience } from "@/lib/dms";
import { publishMessage, publishPlay } from "@/lib/hub-client";
import { playableChannel } from "@/lib/playable-channel";
import { WRITE_RATE_LIMITS, limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";
import { publicMessage } from "@/app/api/messages/route";
import { liveSpotify, type SpotifyActivity } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Someone you share a server with or are friends with, and not blocked either way. */
async function canFollow(db: D1Database, me: string, them: string): Promise<boolean> {
  if (!them || them === me) return false;
  const row = await db
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM friendships WHERE status = 'blocked'
                  AND ((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))) AS blocked,
         EXISTS (SELECT 1 FROM friendships WHERE status = 'accepted'
                  AND ((user_id = ?1 AND friend_id = ?2) OR (user_id = ?2 AND friend_id = ?1))) AS friends,
         EXISTS (SELECT 1 FROM server_members mine
                  JOIN server_members theirs ON theirs.server_id = mine.server_id AND theirs.user_id = ?2
                 WHERE mine.user_id = ?1) AS shared`,
    )
    .bind(me, them)
    .first<{ blocked: number; friends: number; shared: number }>();
  return Boolean(row && !row.blocked && (row.friends || row.shared));
}

/**
 * GET ?host=<id>: what that person plays on Spotify right now, for following
 * them (null while nothing plays), with the server's clock.
 * GET (no host): who is listening along with you.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const hostId = (new URL(request.url).searchParams.get("host") || "").slice(0, 64);

  if (!hostId) {
    const { results } = await db
      .prepare(
        `SELECT u.id, u.display_name AS name FROM listen_along l JOIN users u ON u.id = l.listener_id
          WHERE l.host_id = ? ORDER BY l.since LIMIT 50`,
      )
      .bind(user.id)
      .all<{ id: string; name: string }>();
    return Response.json({ listeners: results ?? [] });
  }

  if (!(await canFollow(db, user.id, hostId))) return Response.json({ error: "You can't listen along with them." }, { status: 403 });
  const row = await db
    .prepare("SELECT display_name, spotify_activity FROM users WHERE id = ?")
    .bind(hostId)
    .first<{ display_name: string; spotify_activity: string | null }>();
  if (!row) return Response.json({ error: "They're gone." }, { status: 404 });
  let activity: SpotifyActivity | null = null;
  try {
    activity = row.spotify_activity ? liveSpotify(JSON.parse(row.spotify_activity) as SpotifyActivity) : null;
  } catch {
    activity = null;
  }
  return Response.json({ host: row.display_name, activity, serverNow: Date.now() });
}

/**
 * What a "Listen along" card shows: the song when it was posted. Following
 * always reads the host's live song from GET ?host=, not this.
 */
export interface ListenInvite {
  host: { id: string; name: string };
  song: string;
  artist: string;
  albumArt?: string;
  trackId: string;
}

/**
 * POST { hostId, on }: start or stop listening along; tells the host.
 * POST { action: "invite", channelId }: posts a card inviting the chat to
 * listen along with the song you're playing now.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as {
    hostId?: string;
    on?: boolean;
    action?: string;
    channelId?: string;
  };

  if (body.action === "invite") {
    const inviteLimited = await limitUser(db, { action: "listen-invite", limit: 6, windowSeconds: 60 }, user.id);
    if (inviteLimited) return inviteLimited;
    const channel = await playableChannel(db, String(body.channelId || "").slice(0, 64), user.id);
    if (channel instanceof Response) return channel;
    const row = await db
      .prepare("SELECT spotify_activity FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ spotify_activity: string | null }>();
    let song: SpotifyActivity | null = null;
    try {
      song = row?.spotify_activity ? liveSpotify(JSON.parse(row.spotify_activity) as SpotifyActivity) : null;
    } catch {
      song = null;
    }
    if (!song?.trackId) {
      return Response.json(
        { error: "Hoffle can't see a Spotify song it can follow right now. Play something in the Spotify app with the Hoffle desktop app open." },
        { status: 409 },
      );
    }
    const invite: ListenInvite = {
      host: { id: user.id, name: user.display_name },
      song: song.song,
      artist: song.artist,
      ...(song.albumArt ? { albumArt: song.albumArt } : {}),
      trackId: song.trackId,
    };
    const stored: StoredMessage = {
      id: crypto.randomUUID(),
      channel: channel.name,
      channel_id: channel.id,
      user_id: user.id,
      author: user.display_name,
      avatar: user.avatar,
      color: user.color,
      content: `is listening to ${song.song} by ${song.artist}. Listen along!`,
      attachment_key: null,
      is_bot: 0,
      created_at: new Date().toISOString(),
      kind: "listen",
      payload: JSON.stringify({ listen: invite }),
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
        null,
        0,
        stored.created_at,
        stored.kind,
        stored.payload,
      )
      .run();
    const message = publicMessage(stored);
    await publishMessage(channel.id, message, await channelAudience(db, channel.id));
    return Response.json({ message }, { status: 201 });
  }
  const hostId = String(body.hostId || "").slice(0, 64);
  const me = { id: user.id, name: user.display_name };

  // Whoever you followed before hears that you left.
  const previous = await db
    .prepare("SELECT host_id FROM listen_along WHERE listener_id = ?")
    .bind(user.id)
    .first<{ host_id: string }>();

  if (body.on) {
    if (!(await canFollow(db, user.id, hostId))) return Response.json({ error: "You can't listen along with them." }, { status: 403 });
    await db
      .prepare("INSERT OR REPLACE INTO listen_along (listener_id, host_id, since) VALUES (?, ?, ?)")
      .bind(user.id, hostId, new Date().toISOString())
      .run();
    if (previous && previous.host_id !== hostId) await publishPlay(previous.host_id, { kind: "listen", from: me, on: false });
    if (previous?.host_id !== hostId) await publishPlay(hostId, { kind: "listen", from: me, on: true });
    return Response.json({ listening: hostId });
  }

  await db.prepare("DELETE FROM listen_along WHERE listener_id = ?").bind(user.id).run();
  if (previous) await publishPlay(previous.host_id, { kind: "listen", from: me, on: false });
  return Response.json({ listening: null });
}
