import { currentUser, unauthorized } from "@/lib/auth";
import { botFetch, botSession } from "@/lib/musicbot";
import { can, Permission } from "@/lib/permissions";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import { isClubStation } from "@/lib/club-feed";

export const dynamic = "force-dynamic";

/**
 * The Living Room club's DJ booth: the music bot's DJ booth for one voice
 * room, through the club's own panel. Starting the night puts Real DJ (or
 * Auto DJ) on air with the stemmed songs; whoever has the decks then mixes,
 * remixes, fires the sampler and decides who mixes and how. Only these
 * controls go through (the full booth, /dj, has the rest), and only for
 * people who may join the room.
 */

const STEMS = ["drums", "bass", "vocals", "other"];
const MOVES = ["drop", "acapella", "beatbreak", "stutter", "echo"];
const MIX_STYLES = ["auto", "blend", "fade", "filter", "echo", "cut", "brake", "spinback", "stem_swap", "acapella", "drum_bridge", "mashup", "loop_roll", "guitar_ride"];
const SAMPLES = ["horn", "siren", "rewind", "laser", "boom", "clap", "riser", "scratch"];
const FX = ["echo", "delay", "reverb", "flanger", "roll", "trans"];
const VIBES = ["chill", "club", "hype"];
/** Parts of other songs the club's loop pads borrow (the bot's loops.py), and how a loop's id looks. */
const LOOP_PARTS = ["guitar", "piano", "bass", "drums"];
const LOOP_ID = /^[0-9a-f]{12}-(guitar|piano|bass|drums)-\d{1,5}$/;

/** The booth control to send for a club panel request, or a reason it is refused. */
export function boothOp(body: Record<string, unknown>): Record<string, unknown> | string {
  const op = typeof body.op === "string" ? body.op : "";
  switch (op) {
    case "club":
      return {
        op: "club", ...(VIBES.includes(body.vibe as string) ? { vibe: body.vibe } : {}), ...(body.mode === "auto" ? { mode: "auto" } : {}),
        ...(isClubStation(body.station) ? { station: body.station } : {}),
      };
    case "stop":
      return { op: "stop" };
    case "auto": {
      const out: Record<string, unknown> = { op: "auto" };
      if (body.mode === "real" || body.mode === "auto") out.mode = body.mode;
      if (VIBES.includes(body.vibe as string)) out.vibe = body.vibe;
      if (typeof body.on === "boolean") out.on = body.on;
      if (typeof body.three === "boolean") out.three = body.three;
      // Autoplay: the set carries on with songs from the library when the queue runs out.
      if (typeof body.autoplay === "boolean") out.autoplay = body.autoplay;
      // The mood station (null: any mood).
      if (body.station === null || isClubStation(body.station)) out.station = body.station;
      // Auto DJ's mixes: their style, and their length in beats (0: each style's own).
      if (MIX_STYLES.includes(body.style as string)) out.style = body.style;
      const beats = Number(body.beats);
      if (body.beats !== undefined && Number.isInteger(beats) && beats >= 0 && beats <= 64) out.beats = beats;
      return Object.keys(out).length > 1 ? out : "Nothing to change.";
    }
    case "skip":
      return { op: "skip", ...(MIX_STYLES.includes(body.style as string) ? { style: body.style } : {}) };
    case "club_move":
      return MOVES.includes(body.move as string) ? { op: "club_move", move: body.move } : "Unknown move.";
    case "sample":
      return SAMPLES.includes(body.name as string) ? { op: "sample", name: body.name } : "Unknown pad.";
    case "club_loop":
      return LOOP_PARTS.includes(body.part as string) ? { op: "club_loop", part: body.part } : "Unknown part.";
    case "loop_vote":
      if (typeof body.id !== "string" || !LOOP_ID.test(body.id)) return "Unknown loop.";
      return body.vote === "up" || body.vote === "down" || body.vote === null ? { op: "loop_vote", id: body.id, vote: body.vote } : "Unknown vote.";
    case "set": {
      if (body.deck !== "A" && body.deck !== "B") return "Choose deck A or B.";
      const value = Number(body.value);
      if (!Number.isFinite(value)) return "Bad value.";
      if (typeof body.stem === "string" && STEMS.includes(body.stem)) {
        return { op: "set", deck: body.deck, param: `stem_${body.stem}`, value: Math.max(0, Math.min(1, value)) };
      }
      if (body.param === "color") return { op: "set", deck: body.deck, param: "color", value: Math.max(-1, Math.min(1, value)) };
      return "Unknown setting.";
    }
    case "fx": {
      if (!FX.includes(body.type as string) || typeof body.on !== "boolean") return "Unknown effect.";
      const beat = Number(body.beat);
      return { op: "fx", type: body.type, on: body.on, level: 0.8, target: "master", ...(Number.isInteger(beat) && beat >= 0 && beat <= 7 ? { beat } : {}) };
    }
    case "queue": {
      const query = typeof body.query === "string" ? body.query.trim().slice(0, 300) : "";
      return query ? { op: "queue", query } : "Type a song name or paste a link.";
    }
    default:
      return "Unknown control.";
  }
}

interface Deck {
  name: string; loaded: boolean; loading: string | null; title: string | null; artist: string | null; thumbnail: string | null;
  playing: boolean; bpm: number | null; key: string | null; stems: string | null; gains: Record<string, number>;
  position: number; duration: number; color: number;
}

/** What the club panel needs of the booth's state (the booth sends a lot more). */
export function slimState(state: Record<string, any>) {
  const decks: Record<string, Deck> = {};
  for (const name of ["A", "B"]) {
    const deck = (state.decks?.[name] ?? {}) as Record<string, any>;
    const gains = (deck.stems?.gain ?? {}) as Record<string, unknown>;
    const pitch = typeof deck.pitch === "number" ? deck.pitch : 0;
    decks[name] = {
      name,
      loaded: Boolean(deck.loaded),
      loading: typeof deck.loading === "string" ? deck.loading : null,
      title: typeof deck.title === "string" ? deck.title : null,
      artist: typeof deck.artist === "string" ? deck.artist : null,
      thumbnail: typeof deck.thumbnail === "string" ? deck.thumbnail : null,
      playing: Boolean(deck.playing),
      bpm: typeof deck.bpm === "number" ? Math.round(deck.bpm * (1 + pitch / 100) * 10) / 10 : null,
      key: typeof deck.camelot === "string" ? deck.camelot : typeof deck.key === "string" ? deck.key : null,
      stems: typeof deck.stems?.status === "string" ? deck.stems.status : null,
      gains: Object.fromEntries(STEMS.map((stem) => [stem, typeof gains[stem] === "number" ? (gains[stem] as number) : 1])),
      position: typeof deck.pos === "number" ? deck.pos : 0,
      duration: typeof deck.duration === "number" ? deck.duration : 0,
      color: typeof deck.color === "number" ? deck.color : 0,
    };
  }
  const transition = state.transition as Record<string, any> | null | undefined;
  const auto = (state.auto ?? {}) as Record<string, any>;
  return {
    active: Boolean(state.active),
    live: Boolean(state.live),
    paused: Boolean(state.paused),
    decks,
    master: typeof state.mixer?.master_deck === "string" ? state.mixer.master_deck : null,
    mix: transition ? { label: String(transition.label ?? transition.style ?? ""), progress: Number(transition.progress) || 0, started: Boolean(transition.started) } : null,
    auto: {
      on: Boolean(auto.on), mode: auto.mode === "real" ? "real" : "auto", vibe: VIBES.includes(auto.vibe) ? auto.vibe : "club", three: Boolean(auto.three), next: auto.real?.next ?? null,
      autoplay: auto.autoplay !== false,
      station: isClubStation(auto.station) ? auto.station : null,
      style: MIX_STYLES.includes(auto.style) ? auto.style : "auto", beats: typeof auto.beats === "number" && auto.beats > 0 ? auto.beats : null,
    },
    stems: { on: Boolean(state.stems?.on), available: Boolean(state.stems?.available) },
    crate: (Array.isArray(state.crate) ? state.crate : []).slice(0, 12).map((item: Record<string, unknown>) => ({
      title: typeof item.title === "string" ? item.title : "",
      artist: typeof item.artist === "string" ? item.artist : "",
    })),
    notice: typeof state.notice === "string" ? state.notice : null,
    // A part of another song playing over the mix (Real DJ's or the loop pads'), to turn down if it sounds wrong.
    loop: (() => {
      const voice = (Array.isArray(state.loops) ? state.loops : []).find((v: Record<string, unknown>) => v && v.on && typeof v.id === "string");
      return voice && LOOP_PARTS.includes(voice.part) ? { id: String(voice.id), part: String(voice.part), title: typeof voice.title === "string" ? voice.title : null } : null;
    })(),
  };
}

async function allowed(request: Request, voiceChannelId: unknown): Promise<Response | string> {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const channel = typeof voiceChannelId === "string" && voiceChannelId ? await findChannel(db, voiceChannelId) : null;
  if (
    !channel ||
    channel.kind !== "voice" ||
    !(await isServerMember(db, channel.server_id, user.id)) ||
    !(await can(db, user.id, channel.server_id, Permission.CONNECT))
  ) {
    return Response.json({ error: "You can't use that room's club." }, { status: 403 });
  }
  return channel.id;
}

const boothPath = (channelId: string) => `/api/guilds/${encodeURIComponent(`huddle:${channelId}`)}/dj`;

function failed(error: unknown) {
  return Response.json(
    { error: error instanceof Error && error.message ? error.message : "The music bot is offline or unreachable." },
    { status: 502 },
  );
}

export async function GET(request: Request) {
  const room = await allowed(request, new URL(request.url).searchParams.get("voiceChannelId"));
  if (typeof room !== "string") return room;
  try {
    return Response.json(slimState(await botFetch(boothPath(room), await botSession())));
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const room = await allowed(request, body.voiceChannelId);
  if (typeof room !== "string") return room;
  const op = boothOp(body);
  if (typeof op === "string") return Response.json({ error: op }, { status: 400 });
  try {
    return Response.json(slimState(await botFetch(boothPath(room), await botSession(), { method: "POST", body: JSON.stringify(op) })));
  } catch (error) {
    return failed(error);
  }
}
