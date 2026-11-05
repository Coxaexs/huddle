import { hasPermission, Permission } from "@/lib/permissions";
import { authenticatePlayerBot, type BotIdentity } from "@/lib/bot-auth";
import { botCanSeeServer } from "@/lib/discord/guild-data";
import { playerCommand, playerState } from "@/lib/hub-client";
import { resolveTrack } from "@/lib/music";
import { isLibraryAudio, type PlayerAction, type Track } from "@/lib/protocol";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The room's server has to have added this bot, and let it into voice. */
async function mayUseRoom(db: D1Database, bot: BotIdentity, channelId: string): Promise<boolean> {
  if (!bot.grants) return true;
  const channel = await findChannel(db, channelId);
  if (!channel?.server_id || !botCanSeeServer(bot, channel.server_id)) return false;
  const grant = bot.grants[channel.server_id];
  return hasPermission(grant, Permission.CONNECT) && hasPermission(grant, Permission.SPEAK);
}

/** What any bot may ask the player to do. Lookups belong to the music bot. */
const OPEN_ACTIONS = new Set(["pause", "resume", "toggle", "skip", "stop", "seek", "volume", "loop", "shuffle", "clear"]);

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** A bot's own tracks: each brings its audio, because Hoffle looks nothing up for it. */
function ownTracks(items: unknown[], requestedBy: string): Track[] {
  return items.slice(0, 100).flatMap((raw) => {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const audioUrl = httpsUrl(item.audioUrl);
    if (!audioUrl) return [];
    return [{
      id: crypto.randomUUID(),
      title: String(item.title || "Unknown").slice(0, 200),
      artist: String(item.artist || "").slice(0, 200),
      thumbnail: httpsUrl(item.thumbnail),
      duration: typeof item.duration === "number" ? item.duration : null,
      audioUrl,
      pageUrl: httpsUrl(item.pageUrl),
      requestedBy,
    }];
  });
}

export async function GET(request: Request) {
  const bot = await authenticatePlayerBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  if (!channelId) {
    return Response.json({ error: "Which voice channel?" }, { status: 400 });
  }
  const db = bindings().DB;
  if (bot.grants && (!db || !(await mayUseRoom(db, bot, channelId)))) {
    return Response.json({ error: "This server has not added the bot." }, { status: 403 });
  }
  return Response.json({ state: await playerState(channelId) });
}

/**
 * Drives a Huddle voice room's player from outside the browser — this is what
 * the music bot dashboard calls when you press play on a Huddle room.
 */
export async function POST(request: Request) {
  const bot = await authenticatePlayerBot(request);
  if (!bot) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    action?: PlayerAction;
    query?: string;
    requestedBy?: string;
    /** Placeholders queued at once and resolved by the bot as they come up. */
    tracks?: Array<{
      query?: string;
      title?: string;
      artist?: string;
      thumbnail?: string | null;
      duration?: number | null;
      mix?: Record<string, unknown> | null;
    }>;
    startNow?: boolean;
    playlist?: { name?: string; cover?: string | null };
    /** Look up the audio for a queued placeholder. */
    resolveTrackId?: string;
  };
  const channelId = body.channelId || "";
  const channel = await findChannel(db, channelId);
  if (!channel || channel.kind !== "voice") {
    return Response.json(
      { error: "That is not a Hoffle voice channel." },
      { status: 404 },
    );
  }
  if (!(await mayUseRoom(db, bot, channelId))) {
    return Response.json({ error: "This server has not added the bot." }, { status: 403 });
  }

  // Any other bot: its own audio and the transport controls, nothing else.
  if (bot.applicationId && bot.kind !== "music") {
    if (body.tracks?.length) {
      const tracks = ownTracks(body.tracks, bot.name);
      if (!tracks.length) {
        return Response.json({ error: "Each track needs an https audioUrl." }, { status: 400 });
      }
      return Response.json({
        state: await playerCommand(channelId, { name: "enqueueMany", tracks, startNow: Boolean(body.startNow) }),
      });
    }
    if (!body.action || !OPEN_ACTIONS.has(body.action.name)) {
      return Response.json({ error: "That is not something this bot can do to the player." }, { status: 403 });
    }
    return Response.json({ state: await playerCommand(channelId, body.action) });
  }

  if (body.tracks?.length) {
    const requestedBy = body.requestedBy || "Music dashboard";
    const playlist = body.playlist?.name
      ? { name: body.playlist.name.slice(0, 80), cover: body.playlist.cover || null }
      : null;
    const tracks: Track[] = body.tracks
      .filter((item) => item.query?.trim())
      .slice(0, 500)
      .map((item) => ({
        id: crypto.randomUUID(),
        title: (item.title || item.query || "Unknown").slice(0, 200),
        artist: (item.artist || "").slice(0, 200),
        thumbnail: item.thumbnail || null,
        duration: typeof item.duration === "number" ? item.duration : null,
        audioUrl: "",
        pageUrl: null,
        requestedBy,
        query: item.query!.trim().slice(0, 500),
        playlist,
        mix: item.mix && typeof item.mix === "object" ? item.mix : null,
      }));
    return Response.json({
      state: await playerCommand(channelId, {
        name: "enqueueMany",
        tracks,
        startNow: Boolean(body.startNow),
      }),
    });
  }

  if (body.resolveTrackId) {
    const state = await playerState(channelId);
    const pending = [state?.track, ...(state?.queue || [])].find(
      (track) => track?.id === body.resolveTrackId,
    );
    if (!pending) {
      return Response.json({ error: "That track is no longer queued." }, { status: 404 });
    }
    // A library song is only asked about again when the bot has lost its file.
    if ((pending.audioUrl && !isLibraryAudio(pending.audioUrl)) || !pending.query) {
      return Response.json({ state });
    }
    const resolved = await resolveTrack(pending.query, pending.requestedBy).catch(
      (error: Error) => error,
    );
    if (resolved instanceof Error) {
      return Response.json({ error: resolved.message }, { status: 502 });
    }
    // Keep the playlist's own title and cover; take the real audio details.
    return Response.json({
      state: await playerCommand(channelId, {
        name: "resolve",
        trackId: pending.id,
        track: {
          audioUrl: resolved.audioUrl,
          pageUrl: resolved.pageUrl,
          duration: resolved.duration ?? pending.duration,
          artist: pending.artist || resolved.artist,
          thumbnail: pending.thumbnail || resolved.thumbnail,
          key: resolved.key ?? pending.key ?? null,
        },
      }),
    });
  }

  // `query` is the convenience form: resolve it, then play or queue it.
  if (body.query) {
    const track = await resolveTrack(
      body.query,
      body.requestedBy || "Music dashboard",
    ).catch((error: Error) => error);
    if (track instanceof Error) {
      return Response.json({ error: track.message }, { status: 502 });
    }
    return Response.json({
      state: await playerCommand(channelId, { name: "play", track }),
    });
  }

  if (!body.action) {
    return Response.json({ error: "No action given." }, { status: 400 });
  }
  return Response.json({
    state: await playerCommand(channelId, body.action),
  });
}
