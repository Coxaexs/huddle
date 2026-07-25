"use client";

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
  group: "Music" | "Rooms" | "D&D" | "Huddle";
  /** Needs the caller to be sitting in a voice channel. */
  voice?: boolean;
}

/**
 * Everything typing "/" offers. This is the single list the palette renders and
 * the composer dispatches from, so a command can never appear without working.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "play",
    args: "<song name or URL>",
    description: "Play in your voice channel, or add to the queue",
    group: "Music",
    voice: true,
  },
  { name: "pause", description: "Pause playback", group: "Music", voice: true },
  { name: "resume", description: "Resume playback", group: "Music", voice: true },
  { name: "skip", description: "Skip to the next track", group: "Music", voice: true },
  {
    name: "stop",
    description: "Stop and clear the queue",
    group: "Music",
    voice: true,
  },
  {
    name: "seek",
    args: "<1:30>",
    description: "Jump to a position in the track",
    group: "Music",
    voice: true,
  },
  {
    name: "volume",
    args: "<0-100>",
    description: "Set the room volume",
    group: "Music",
    voice: true,
  },
  {
    name: "loop",
    args: "<off|track|queue>",
    description: "Repeat the track or the queue",
    group: "Music",
    voice: true,
  },
  { name: "queue", description: "Show what is coming up", group: "Music", voice: true },
  {
    name: "nowplaying",
    description: "Show the player with a seek bar",
    group: "Music",
    voice: true,
  },
  { name: "shuffle", description: "Shuffle the queue", group: "Music", voice: true },
  { name: "clear", description: "Empty the queue", group: "Music", voice: true },
  {
    name: "remove",
    args: "<position>",
    description: "Remove one track from the queue",
    group: "Music",
    voice: true,
  },
  {
    name: "disconnect",
    description: "Send the music bot away",
    group: "Music",
    voice: true,
  },
  {
    name: "watch",
    description: "Create a synchronized Watch Together room",
    group: "Rooms",
  },
  {
    name: "reels",
    description: "Create a synchronized ReelsTogether room",
    group: "Rooms",
  },
  { name: "music", description: "Open the full music dashboard", group: "Rooms" },
  {
    name: "roll",
    args: "<2d20+3>",
    description: "Roll dice, with advantage or disadvantage",
    group: "D&D",
  },
  { name: "dnd", description: "Open the D&D companion", group: "D&D" },
  { name: "flip", description: "Flip a coin", group: "Huddle" },
  { name: "shrug", description: "¯\\_(ツ)_/¯", group: "Huddle" },
  { name: "help", description: "List every command", group: "Huddle" },
];

export const MUSIC_COMMANDS = new Set(
  SLASH_COMMANDS.filter((command) => command.group === "Music").map(
    (command) => command.name,
  ),
);

/** Extra spellings that behave like a listed command. */
export const COMMAND_ALIASES: Record<string, string> = {
  np: "nowplaying",
  previous: "skip",
  campaign: "dnd",
  join: "play",
};

export function matchCommands(query: string): SlashCommand[] {
  const term = query.replace(/^\//, "").toLowerCase().trim();
  if (!term) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (command) =>
      command.name.startsWith(term) ||
      command.description.toLowerCase().includes(term),
  );
}
