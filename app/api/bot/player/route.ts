import { playerCommand, playerState } from "@/lib/hub-client";
import { resolveTrack } from "@/lib/music";
import type { PlayerAction, Track } from "@/lib/protocol";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const token = bindings().BOT_TOKEN;
  return Boolean(
    token && request.headers.get("authorization") === `Bearer ${token}`,
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  if (!channelId) {
    return Response.json({ error: "Which voice channel?" }, { status: 400 });
  }
  return Response.json({ state: await playerState(channelId) });
}

/**
 * Drives a Huddle voice room's player from outside the browser — this is what
 * the music bot dashboard calls when you press play on a Huddle room.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
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
      { error: "That is not a Huddle voice channel." },
      { status: 404 },
    );
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
    if (pending.audioUrl || !pending.query) {
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
