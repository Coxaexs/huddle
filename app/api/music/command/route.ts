import { currentUser, unauthorized } from "@/lib/auth";
import { playerCommand, playerState, publishMessage } from "@/lib/hub-client";
import { formatDuration, resolveTracks, trackLabel } from "@/lib/music";
import { botFetch, botSession, fetchLyrics } from "@/lib/musicbot";
import { playbackPosition, type PlayerState } from "@/lib/protocol";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings, type StoredMessage } from "@/lib/storage";
import { publicMessage } from "@/app/api/messages/route";

export const dynamic = "force-dynamic";

const BOT_NAME = "Music + Watch";
const BOT_AVATAR = "♫";

interface CommandBody {
  command?: string;
  /** The voice channel the caller is sitting in. */
  voiceChannelId?: string;
  /** Where the bot should reply. */
  textChannelId?: string;
}

/** Posts a bot message into the text channel and pushes it to open tabs. */
async function say(
  db: D1Database,
  textChannelId: string | null,
  text: string,
  extra?: { kind?: string; payload?: unknown; link?: string; actionLabel?: string },
): Promise<void> {
  if (!textChannelId) return;
  const channel = await db
    .prepare("SELECT name FROM channels WHERE id = ?")
    .bind(textChannelId)
    .first<{ name: string }>();

  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel?.name || "general",
    channel_id: textChannelId,
    user_id: null,
    author: BOT_NAME,
    avatar: BOT_AVATAR,
    color: "#b8a6ff",
    content: text,
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    link: extra?.link || null,
    action_label: extra?.actionLabel || null,
    audio_url: null,
    kind: extra?.kind || null,
    payload: extra?.payload ? JSON.stringify(extra.payload) : null,
  };

  await db
    .prepare(
      `INSERT INTO messages
         (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
          is_bot, created_at, link, action_label, audio_url, kind, payload)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.created_at,
      stored.link,
      stored.action_label,
      stored.kind,
      stored.payload,
    )
    .run();

  await publishMessage(textChannelId, publicMessage(stored));
}

function summary(state: PlayerState | null): string {
  if (!state?.track) return "Nothing is playing.";
  const position = formatDuration(playbackPosition(state) / 1000);
  const total = formatDuration(state.track.duration);
  return `${trackLabel(state.track)} · ${position} / ${total}${
    state.paused ? " (paused)" : ""
  }${state.queue.length ? ` · ${state.queue.length} in queue` : ""}`;
}

/** Parses "1:23", "83" or "1m20s" into seconds. */
function parseSeek(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const clock = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const parts = trimmed.match(/^(?:(\d+)m)?\s*(?:(\d+)s)?$/i);
  if (parts && (parts[1] || parts[2])) {
    return Number(parts[1] || 0) * 60 + Number(parts[2] || 0);
  }
  return null;
}

async function botRoomAction(
  channelId: string,
  action: Record<string, unknown>,
): Promise<Record<string, any>> {
  const cookie = await botSession();
  return botFetch(
    `/api/guilds/${encodeURIComponent(`huddle:${channelId}`)}/action`,
    cookie,
    { method: "POST", body: JSON.stringify(action) },
  );
}

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

  const body = (await request.json().catch(() => ({}))) as CommandBody;
  const [rawName, ...parts] = (body.command?.trim().slice(0, 1000) || "").split(
    /\s+/,
  );
  const name = rawName.replace(/^\//, "").toLowerCase();
  const value = parts.join(" ").trim();
  const textChannelId = body.textChannelId || null;

  // Everything except a plain status read needs a voice room, the same way
  // Discord refuses to play into thin air.
  const voiceChannelId = body.voiceChannelId || null;
  const requiresVoice = name !== "help";
  if (requiresVoice && !voiceChannelId) {
    const text =
      "Join a voice channel first — then `/play` will bring the bot in with you.";
    await say(db, textChannelId, text);
    return Response.json({ text }, { status: 409 });
  }

  if (voiceChannelId) {
    const channel = await findChannel(db, voiceChannelId);
    if (!channel || channel.kind !== "voice") {
      return Response.json(
        { error: "That is not a voice channel." },
        { status: 400 },
      );
    }
  }

  try {
    switch (name) {
      case "autoplay":
      case "automix": {
        const normalized = value.toLowerCase();
        const enabled = normalized
          ? !["off", "false", "0", "no"].includes(normalized)
          : undefined;
        const state = await botRoomAction(voiceChannelId!, {
          action: name,
          enabled,
        });
        const active = name === "autoplay" ? state.autoplay : state.automix;
        const text = `${name === "autoplay" ? "Smart Autoplay" : "AutoMix"} is **${active ? "on" : "off"}** in this room.${
          name === "automix" && active
            ? ` Blend: ${state.automix_blend_seconds || 8}s.`
            : ""
        }`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "like":
      case "dislike": {
        const state = await botRoomAction(voiceChannelId!, {
          action: name,
          user_id: user.id,
        });
        const result = state.feedback || {};
        const text = result.added
          ? name === "like"
            ? `❤️ Liked **${result.title}** — this now helps Smart Autoplay.`
            : `👎 Noted — Smart Autoplay will avoid **${result.title}**.`
          : `${name === "like" ? "Removed the like from" : "Removed the dislike from"} **${result.title}**.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "stats":
      case "wrapped": {
        const state = await botRoomAction(voiceChannelId!, { action: name });
        const report = state.report || {};
        const songs = (report.topSongs || [])
          .map(
            (item: [string, number], index: number) =>
              `${index + 1}. ${item[0]} · ${item[1]}×`,
          )
          .join("\n");
        const requesters = (report.topRequesters || [])
          .map((item: [string, number]) => `${item[0]} · ${item[1]}×`)
          .join("\n");
        const text = [
          name === "wrapped"
            ? `🎁 **${report.label || "Room Wrapped"}**`
            : "📊 **Room listening stats**",
          `${report.plays || 0} plays · ${report.unique || 0} unique · ${report.hours || 0} hours`,
          songs ? `Top tracks\n${songs}` : "No listening history yet.",
          requesters ? `Top requesters\n${requesters}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "settings": {
        const state = await botRoomAction(voiceChannelId!, {
          action: "settings",
        }).catch(async () => {
          const cookie = await botSession();
          return botFetch(
            `/api/guilds/${encodeURIComponent(`huddle:${voiceChannelId}`)}`,
            cookie,
          );
        });
        const text = [
          "⚙️ **Music settings**",
          `Smart Autoplay: **${state.autoplay ? "On" : "Off"}**`,
          `AutoMix: **${state.automix ? "On" : "Off"}** · ${state.automix_blend_seconds || 8}s`,
          `Filter: **${state.audio_filter || "off"}** · Crossfade: **${state.crossfade_seconds || 0}s**`,
          `Artist diversity: **${state.artist_diversity ? "On" : "Off"}** · Vibe matching: **${state.vibe_match ? "On" : "Off"}**`,
          "Use `/autoplay on`, `/automix on`, or the music dashboard to change them.",
        ].join("\n");
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "play":
      case "playnext": {
        if (!value) throw new Error(`Use \`/${name} song name or URL\`.`);
        const before = await playerState(voiceChannelId!);
        const tracks = await resolveTracks(value, user.display_name);
        const [track, ...rest] = tracks;
        let state: PlayerState | null = null;
        if (name === "playnext") {
          // Each playnext inserts at the front, so reverse the collection to
          // preserve the Spotify/YouTube playlist's original order.
          for (const item of [...tracks].reverse()) {
            state = await playerCommand(voiceChannelId!, {
              name: "playnext",
              track: item,
            });
          }
        } else {
          state = await playerCommand(voiceChannelId!, { name: "play", track });
          for (const item of rest) {
            state = await playerCommand(voiceChannelId!, {
              name: "enqueue",
              track: item,
            });
          }
        }

        if (before?.track) {
          const position = name === "playnext" ? 1 : (state?.queue.length ?? 1);
          const extra = tracks.length > 1 ? ` and ${tracks.length - 1} more` : "";
          const text = `Queued ${trackLabel(track)}${extra} (#${position} in line).`;
          await say(db, textChannelId, text);
          return Response.json({ text, state });
        }

        const extra = tracks.length > 1
          ? ` · queued ${tracks.length - 1} more`
          : "";
        await say(db, textChannelId, `Now playing ${trackLabel(track)}${extra}`, {
          kind: "nowplaying",
          payload: {
            voiceChannelId,
            trackId: track.id,
            label: trackLabel(track),
          },
        });
        return Response.json({ text: `Now playing ${trackLabel(track)}`, state });
      }

      case "pause":
      case "resume":
      case "skip":
      case "stop":
      case "shuffle":
      case "clear": {
        const state = await playerCommand(voiceChannelId!, { name });
        const text =
          name === "stop"
            ? "Stopped playback and cleared the queue."
            : name === "skip"
              ? state?.track
                ? `Skipped. Now playing ${trackLabel(state.track)}`
                : "Skipped. The queue is empty."
              : name === "pause"
                ? "Paused."
                : name === "resume"
                  ? "Playing again."
                  : name === "shuffle"
                    ? "Shuffled the queue."
                    : "Cleared the queue.";
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "disconnect": {
        const state = await playerCommand(voiceChannelId!, { name: "stop" });
        const text = "Left the voice channel.";
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "seek": {
        const seconds = parseSeek(value);
        if (seconds === null) {
          throw new Error("Use `/seek 1:30` or `/seek 90`.");
        }
        const state = await playerCommand(voiceChannelId!, {
          name: "seek",
          positionMs: seconds * 1000,
        });
        const text = `Jumped to ${formatDuration(seconds)}.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "volume": {
        const level = Number(value);
        if (!Number.isFinite(level)) throw new Error("Use `/volume 0-100`.");
        const state = await playerCommand(voiceChannelId!, {
          name: "volume",
          volume: level,
        });
        const text = `Volume set to ${state?.volume ?? level}%.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "loop": {
        const mode =
          value === "track" || value === "song"
            ? "track"
            : value === "queue" || value === "all"
              ? "queue"
              : "off";
        const state = await playerCommand(voiceChannelId!, {
          name: "loop",
          mode,
        });
        const text = `Loop is ${mode}.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "remove": {
        const index = Number(value);
        if (!Number.isFinite(index) || index < 1) {
          throw new Error("Use `/remove 2` with the queue position.");
        }
        const state = await playerCommand(voiceChannelId!, {
          name: "remove",
          index: index - 1,
        });
        const text = `Removed #${index} from the queue.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "forward":
      case "rewind": {
        const state = await playerState(voiceChannelId!);
        if (!state?.track) throw new Error("Nothing is playing.");
        const step = (Number(value) || 15) * 1000;
        const target = Math.max(
          0,
          playbackPosition(state) + (name === "forward" ? step : -step),
        );
        const next = await playerCommand(voiceChannelId!, {
          name: "seek",
          positionMs: target,
        });
        const text = `${name === "forward" ? "Skipped ahead" : "Went back"} to ${formatDuration(target / 1000)}.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state: next });
      }

      case "replay": {
        const state = await playerCommand(voiceChannelId!, {
          name: "seek",
          positionMs: 0,
        });
        const text = "Back to the start.";
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "skipto": {
        const index = Number(value);
        if (!Number.isFinite(index) || index < 1) {
          throw new Error("Use `/skipto 3` with the queue position.");
        }
        const state = await playerCommand(voiceChannelId!, {
          name: "skipto",
          index: index - 1,
        });
        const text = state?.track
          ? `Jumped to ${trackLabel(state.track)}`
          : "That position is past the end of the queue.";
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "move": {
        const [from, to] = value.split(/\s+/).map(Number);
        if (!Number.isFinite(from) || !Number.isFinite(to)) {
          throw new Error("Use `/move 3 1` — from position, then to position.");
        }
        const state = await playerCommand(voiceChannelId!, {
          name: "move",
          from: from - 1,
          to: to - 1,
        });
        const text = `Moved #${from} to #${to}.`;
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "removedupes": {
        const before = await playerState(voiceChannelId!);
        const state = await playerCommand(voiceChannelId!, { name: "removedupes" });
        const dropped =
          (before?.queue.length ?? 0) - (state?.queue.length ?? 0);
        const text = dropped
          ? `Removed ${dropped} duplicate${dropped === 1 ? "" : "s"}.`
          : "No duplicates in the queue.";
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "history": {
        const state = await playerState(voiceChannelId!);
        const played = (state?.history || [])
          .slice(0, 10)
          .map((track, index) => `${index + 1}. ${trackLabel(track)}`)
          .join(" · ");
        const text = played
          ? `Played here recently: ${played}`
          : "This room has not played anything yet.";
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "grab": {
        const state = await playerState(voiceChannelId!);
        if (!state?.track) throw new Error("Nothing is playing to grab.");
        const text = `${user.display_name} grabbed ${trackLabel(state.track)}`;
        await say(db, textChannelId, text, {
          link: state.track.pageUrl || undefined,
          actionLabel: state.track.pageUrl ? "Open the track" : undefined,
        });
        return Response.json({ text, state });
      }

      case "search": {
        if (!value) throw new Error("Use `/search song name`.");
        const [track] = await resolveTracks(value, user.display_name);
        const text = `Top hit for “${value}”: ${trackLabel(track)} (${formatDuration(track.duration)}). Use /play to start it.`;
        await say(db, textChannelId, text, {
          link: track.pageUrl || undefined,
          actionLabel: track.pageUrl ? "Open the track" : undefined,
        });
        return Response.json({ text });
      }

      case "lyrics":
      case "lyricsnow": {
        const state = await playerState(voiceChannelId!);
        const title = value || state?.track?.title;
        if (!title) {
          throw new Error("Nothing is playing — try `/lyrics song name`.");
        }
        const lyrics = await fetchLyrics(
          title,
          value ? null : state?.track?.artist,
          state?.track?.duration,
        );

        if (name === "lyricsnow") {
          if (!lyrics.lines.length) {
            const text = `No synced lyrics for ${lyrics.track || title}.`;
            await say(db, textChannelId, text);
            return Response.json({ text });
          }
          const seconds = playbackPosition(state!) / 1000;
          let currentIndex = 0;
          for (let index = 0; index < lyrics.lines.length; index += 1) {
            if (lyrics.lines[index][0] <= seconds) currentIndex = index;
            else break;
          }
          const start = Math.max(0, currentIndex - 2);
          const end = Math.min(lyrics.lines.length, currentIndex + 3);
          const visibleLines = lyrics.lines
            .slice(start, end)
            .map(([at, line], offset) => ({
              at,
              line,
              active: start + offset === currentIndex,
            }));
          const text = visibleLines
            .map(({ at, line, active }) => {
              return `${active ? "▶" : "  "} ${formatDuration(at)}  ${line}`;
            })
            .join("\n");
          await say(db, textChannelId, text, {
            kind: "lyricsnow",
            payload: {
              track: lyrics.track || title,
              artist: lyrics.artist || state?.track?.artist || "",
              voiceChannelId,
              trackId: state?.track?.id,
              lines: lyrics.lines.map(([at, line]) => ({
                at,
                line,
                active: false,
              })),
            },
          });
          return Response.json({ text });
        }

        const excerpt = lyrics.lines.length
          ? lyrics.lines
              .slice(0, 12)
              .map((line) => line[1])
              .join("\n")
          : (lyrics.lyrics || "").split("\n").slice(0, 12).join("\n");
        const text = excerpt
          ? `${lyrics.track || title}${lyrics.artist ? ` — ${lyrics.artist}` : ""}\n${excerpt}`
          : `No lyrics found for ${title}.`;
        await say(db, textChannelId, text);
        return Response.json({ text });
      }

      case "queue": {
        const state = await playerState(voiceChannelId!);
        const lines = (state?.queue || [])
          .slice(0, 10)
          .map((track, index) => `${index + 1}. ${trackLabel(track)}`)
          .join(" · ");
        const text = state?.queue.length
          ? `${summary(state)} — next: ${lines}`
          : summary(state);
        await say(db, textChannelId, text);
        return Response.json({ text, state });
      }

      case "nowplaying":
      case "np": {
        const state = await playerState(voiceChannelId!);
        if (!state?.track) {
          const text = "Nothing is playing in this room right now.";
          await say(db, textChannelId, text);
          return Response.json({ text, state });
        }
        await say(db, textChannelId, `Now playing ${trackLabel(state.track)}`, {
          kind: "nowplaying",
          payload: {
            voiceChannelId,
            trackId: state.track.id,
            label: trackLabel(state.track),
          },
        });
        return Response.json({ text: summary(state), state });
      }

      default:
        throw new Error(
          "Music commands: /play, /pause, /resume, /skip, /stop, /queue, /nowplaying, /seek, /volume, /loop, /shuffle, /clear, /remove, /disconnect.",
        );
    }
  } catch (error) {
    const text =
      error instanceof Error ? error.message : "That music command failed.";
    await say(db, textChannelId, text);
    return Response.json({ error: text }, { status: 502 });
  }
}
