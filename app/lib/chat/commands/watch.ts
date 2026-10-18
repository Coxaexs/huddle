import { apiFetch } from "../../client";
import type { RoomActivity } from "@/lib/activities";
import type { PostBotMessage } from "./types";
import { parseStreamUrl } from "../../stream-url";

export interface WatchContext {
  voiceChannelId: string | null;
  /** The current channel's title, for naming the room. */
  channelTitle: string;
  postBotMessage: PostBotMessage;
  /** The watch party opened as this voice room's activity. */
  onActivity: (activity: RoomActivity, voiceChannelId: string) => void;
  streamUrl?: string;
  sendLoungeSet?: (key: "watch", value: unknown) => void;
}

export async function runWatchCommand(name: "watch" | "reels", ctx: WatchContext): Promise<void> {
  const { voiceChannelId, channelTitle, postBotMessage, onActivity, streamUrl, sendLoungeSet } = ctx;
  if (!voiceChannelId) {
    await postBotMessage(
      "Join a Huddle voice room first so everyone there gets the same activity.",
    );
    return;
  }

  if (name === "watch" && streamUrl && streamUrl.trim()) {
    const parsed = parseStreamUrl(streamUrl.trim());
    sendLoungeSet?.("watch", {
      url: parsed.url,
      title: parsed.title,
      position: 0,
      paused: false,
    });
    await postBotMessage(
      `Now playing **${parsed.title}** for everyone in the voice room! Tune in on the stage or in the living room.`
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
