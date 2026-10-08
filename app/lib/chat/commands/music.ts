/** Huddle music commands (/play, /skip, /queue …), run by the music bot in a voice room. */
import { apiFetch } from "../../client";
import { VOICE_REQUIRED_MUSIC_COMMANDS } from "../../commands";
import type { PlayerState } from "@/lib/protocol";

export interface MusicContext {
  /** The voice room this tab is in, if any. */
  voiceChannelId: string | null;
  /** The server's voice rooms, to target when the caller is not in one. */
  voiceChannels: Array<{ id: string }>;
  /** What each voice room is playing, from the hub. */
  players: Record<string, PlayerState>;
  /** The text channel the command was typed in. */
  activeChannelId: string | null;
  userName: string | undefined;
  /** Unlocks the page's audio element from this user gesture. */
  primePlayer: () => void;
  notify: (text: string) => void;
}

export async function runMusicCommand(name: string, value: string, raw: string, ctx: MusicContext): Promise<void> {
  const { voiceChannelId, voiceChannels, players, activeChannelId, userName, primePlayer, notify } = ctx;
  const requiresPresence = VOICE_REQUIRED_MUSIC_COMMANDS.has(name);
  if (requiresPresence && !voiceChannelId) {
    notify(
      `Join a voice channel first to use /${name}. Room info, settings, stats and Wrapped work from anywhere.`,
    );
    return;
  }
  const targetVoiceChannelId =
    voiceChannelId ||
    voiceChannels.find((channel) => players[channel.id]?.track)?.id ||
    voiceChannels[0]?.id;
  if (!targetVoiceChannelId) {
    notify("This server does not have a voice room yet.");
    return;
  }
  // Keep the permanent media element unlocked when a playback command is
  // submitted from a user gesture.
  if (requiresPresence) primePlayer();
  try {
    await apiFetch("/api/music/command", {
      method: "POST",
      body: JSON.stringify({
        command: `/${name} ${value}`.trim(),
        voiceChannelId: targetVoiceChannelId,
        textChannelId: activeChannelId,
        commandText: raw.trim().slice(0, 200),
        commandBy: userName,
      }),
    });
  } catch (error) {
    notify(
      error instanceof Error ? error.message : "That music command failed.",
    );
  }
  return;
}
