/**
 * /watch and /reels: the Music Bot's Watch Together and Reels Together, opened
 * as an activity of your voice room.
 *
 * - /watch opens Watch Together for everyone in the room.
 * - /watch <link or search>: queued on Watch Together when the room has it
 *   open; otherwise played on the room's screen, as before.
 * - /reels [topics] opens Reels Together; topics tell its feed what you like.
 */
import { apiFetch } from "../../client";
import { BOT_ACTIVITY_NAMES, type RoomActivity } from "@/lib/activities";
import type { PostBotMessage } from "./types";
import { needsYouTubeDownload, resolveVideo } from "../../watch-video";
import type { WatchQuality } from "@/lib/lounge-shared";

export interface WatchContext {
  voiceChannelId: string | null;
  /** The current channel's title. */
  channelTitle: string;
  postBotMessage: PostBotMessage;
  /** The activity opened in this voice room. */
  onActivity: (activity: RoomActivity, voiceChannelId: string) => void;
  /** /watch <this> or /reels <these topics>. */
  what?: string;
  sendLoungeSet?: (key: "watch", value: unknown) => void;
  /** The film is on the room's screen. */
  onWatchStarted?: (voiceChannelId: string) => void;
}

const failed = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

async function roomActivity(voiceChannelId: string): Promise<RoomActivity | null> {
  try {
    const data = await apiFetch<{ activity: RoomActivity | null }>(
      `/api/activities?channelId=${encodeURIComponent(voiceChannelId)}`,
    );
    return data?.activity ?? null;
  } catch {
    return null;
  }
}

/** Plays a link on the room's own screen (the living room and the stage). */
async function playOnScreen(what: string, ctx: WatchContext, voiceChannelId: string) {
  const { postBotMessage, sendLoungeSet, onWatchStarted } = ctx;
  // "/watch <link> 4" (or 8, or original): the quality Jellyfin converts it at, once for everyone.
  const words = what.trim().split(/\s+/);
  const last = words.at(-1)?.toLowerCase().replace(/mbps$/, "");
  const quality: WatchQuality | undefined =
    words.length > 1 && (last === "4" || last === "8" || last === "original") ? last : undefined;
  const raw = quality ? words.slice(0, -1).join(" ") : what.trim();
  if (needsYouTubeDownload(raw)) {
    await postBotMessage("Getting that from YouTube… (the server downloads it first, which can take a minute)");
  }
  let video: { url: string; title: string };
  try {
    video = await resolveVideo(raw);
  } catch (error) {
    await postBotMessage(failed(error, "That video could not be played."));
    return;
  }
  sendLoungeSet!("watch", { url: video.url, title: video.title, position: 0, paused: false, ...(quality ? { quality } : {}) });
  onWatchStarted?.(voiceChannelId);
  await postBotMessage(
    `Now playing **${video.title}** for everyone in the voice room. It's on the stage, and on the living room's screen.`,
  );
}

export async function runWatchCommand(name: "watch" | "reels", ctx: WatchContext): Promise<void> {
  const { voiceChannelId, postBotMessage, onActivity } = ctx;
  if (!voiceChannelId) {
    await postBotMessage("Join a Hoffle voice room first so everyone there gets the same activity.");
    return;
  }
  const what = ctx.what?.trim() || "";
  const current = await roomActivity(voiceChannelId);

  if (name === "watch" && what) {
    if (current?.kind === "watch") {
      try {
        await apiFetch("/api/integrations/musicwatch", {
          method: "POST",
          body: JSON.stringify({ channelId: voiceChannelId, action: "add", q: what }),
        });
        await postBotMessage("Added to Watch Together. It plays for the whole room when its turn comes.");
      } catch (error) {
        await postBotMessage(failed(error, "Watch Together couldn't add that."));
      }
      return;
    }
    if (ctx.sendLoungeSet) {
      await playOnScreen(what, ctx, voiceChannelId);
      return;
    }
  }

  try {
    if (name === "reels" && what) {
      await apiFetch("/api/integrations/musicwatch", {
        method: "POST",
        body: JSON.stringify({ channelId: voiceChannelId, action: "seed", q: what }),
      });
    }
    let activity = current;
    if (current?.kind !== name) {
      const opened = await apiFetch<{ activity: RoomActivity }>("/api/activities", {
        method: "POST",
        body: JSON.stringify({
          channelId: voiceChannelId,
          action: "open",
          kind: name,
          state: { title: BOT_ACTIVITY_NAMES[name] },
        }),
      });
      activity = opened.activity;
    }
    if (activity) onActivity(activity, voiceChannelId);
    await postBotMessage(
      name === "reels"
        ? what
          ? `Reels Together is open in your voice room, and it knows you're into ${what}.`
          : "Reels Together is open in your voice room. Swipe for the next one; it learns from everyone's likes."
        : "Watch Together is open in your voice room. Search or paste a link there, or use `/watch <link>`.",
    );
  } catch (error) {
    await postBotMessage(failed(error, `${BOT_ACTIVITY_NAMES[name]} couldn't open.`));
  }
}
