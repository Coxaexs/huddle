/** /watch and /reels: a synchronized Music + Watch room, or /watch <link or search> straight onto the room's screen. */
import { apiFetch } from "../../client";
import type { RoomActivity } from "@/lib/activities";
import type { PostBotMessage } from "./types";
import { needsYouTubeDownload, resolveVideo } from "../../watch-video";
import type { WatchQuality } from "@/lib/lounge-shared";

export interface WatchContext {
  voiceChannelId: string | null;
  /** The current channel's title, for naming the room. */
  channelTitle: string;
  postBotMessage: PostBotMessage;
  /** The watch party opened as this voice room's activity. */
  onActivity: (activity: RoomActivity, voiceChannelId: string) => void;
  /** /watch <this>: a YouTube, Jellyfin or video link, or words to search YouTube for. */
  what?: string;
  sendLoungeSet?: (key: "watch", value: unknown) => void;
  /** The film is on the room's screen. */
  onWatchStarted?: (voiceChannelId: string) => void;
}

export async function runWatchCommand(name: "watch" | "reels", ctx: WatchContext): Promise<void> {
  const { voiceChannelId, channelTitle, postBotMessage, onActivity, what, sendLoungeSet, onWatchStarted } = ctx;
  if (!voiceChannelId) {
    await postBotMessage(
      "Join a Huddle voice room first so everyone there gets the same activity.",
    );
    return;
  }

  if (name === "watch" && what?.trim() && sendLoungeSet) {
    // "/watch <link> 4" (or 8, or original): the quality Jellyfin converts it at, once for everyone.
    const words = what.trim().split(/\s+/);
    const last = words.at(-1)?.toLowerCase().replace(/mbps$/, "");
    const quality: WatchQuality | undefined = words.length > 1 && (last === "4" || last === "8" || last === "original") ? last : undefined;
    const raw = quality ? words.slice(0, -1).join(" ") : what.trim();
    if (needsYouTubeDownload(raw)) {
      await postBotMessage("Getting that from YouTube… (the server downloads it first, which can take a minute)");
    }
    let video: { url: string; title: string };
    try {
      video = await resolveVideo(raw);
    } catch (error) {
      await postBotMessage(error instanceof Error ? error.message : "That video could not be played.");
      return;
    }
    sendLoungeSet("watch", { url: video.url, title: video.title, position: 0, paused: false, ...(quality ? { quality } : {}) });
    onWatchStarted?.(voiceChannelId);
    await postBotMessage(
      `Now playing **${video.title}** for everyone in the voice room. It's on the stage, and on the living room's screen.`,
    );
    return;
  }
  await postBotMessage(
    name === "reels"
      ? "Creating a synchronized ReelsTogether room…"
      : "Creating a synchronized Watch Together room…",
  );
  try {
    const data = await apiFetch<{ url: string }>(
      "/api/integrations/musicwatch",
      {
        method: "POST",
        body: JSON.stringify({ mode: name, name: `${channelTitle} · Huddle` }),
      },
    );
    if (name === "watch") {
      const opened = await apiFetch<{ activity: RoomActivity }>(
        "/api/activities",
        {
          method: "POST",
          body: JSON.stringify({
            channelId: voiceChannelId,
            action: "open",
            kind: "watch",
            state: {
              url: data.url,
              title: `${channelTitle} Watch Party`,
            },
          }),
        },
      );
      onActivity(opened.activity, voiceChannelId);
    }
    await postBotMessage(
      name === "reels"
        ? "Your shared reels room is ready. Everyone who opens this link joins the same synchronized feed."
        : "Watch Together is now live inside your Huddle voice room. The link still works outside Huddle too.",
      {
        link: data.url,
        actionLabel: name === "reels" ? "Open reels room" : "Open watch room",
      },
    );
  } catch {
    await postBotMessage(
      "I couldn’t reach the Music + Watch server. Start it on your server and set MUSICWATCH_BASE_URL in Huddle.",
    );
  }
  return;
}
