"use client";

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
  group: "Music" | "Discord music" | "Rooms" | "D&D" | "Huddle";
  /** Needs the caller to be sitting in a voice channel. */
  voice?: boolean;
}

/**
 * Everything typing "/" offers, covering both bots' command sets.
 *
 * The split matters: "Music" runs in your Huddle voice room, "Discord music"
 * reaches the same bot but drives its Discord voice connection, because those
 * features live in its ffmpeg pipeline and have nowhere to happen here.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  // ---- Huddle voice playback ----
  {
    name: "play",
    args: "<song name or URL>",
    description: "Play in your voice channel, or add to the queue",
    group: "Music",
    voice: true,
  },
  {
    name: "playnext",
    args: "<song name or URL>",
    description: "Queue something as the next track",
    group: "Music",
    voice: true,
  },
  { name: "pause", description: "Pause playback", group: "Music", voice: true },
  { name: "resume", description: "Resume playback", group: "Music", voice: true },
  { name: "skip", description: "Skip to the next track", group: "Music", voice: true },
  {
    name: "skipto",
    args: "<queue position>",
    description: "Jump straight to a queued track",
    group: "Music",
    voice: true,
  },
  {
    name: "stop",
    description: "Stop and clear the queue",
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
    name: "seek",
    args: "<1:30>",
    description: "Jump to a position in the track",
    group: "Music",
    voice: true,
  },
  {
    name: "forward",
    args: "[seconds]",
    description: "Jump forward, 15 seconds by default",
    group: "Music",
    voice: true,
  },
  {
    name: "rewind",
    args: "[seconds]",
    description: "Jump back, 15 seconds by default",
    group: "Music",
    voice: true,
  },
  { name: "replay", description: "Start the track again", group: "Music", voice: true },
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
  { name: "history", description: "What this room played before", group: "Music", voice: true },
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
    name: "removedupes",
    description: "Drop duplicate tracks from the queue",
    group: "Music",
    voice: true,
  },
  {
    name: "move",
    args: "<from> <to>",
    description: "Reorder the queue",
    group: "Music",
    voice: true,
  },
  {
    name: "grab",
    description: "Send the current track to your DMs",
    group: "Music",
    voice: true,
  },
  {
    name: "search",
    args: "<song name>",
    description: "Search without playing anything yet",
    group: "Music",
    voice: true,
  },
  {
    name: "lyrics",
    args: "[song name]",
    description: "Lyrics for the current track",
    group: "Music",
    voice: true,
  },
  {
    name: "lyricsnow",
    description: "The line playing right now",
    group: "Music",
    voice: true,
  },
  { name: "autoplay", args: "<on|off>", description: "Keep playing smart related tracks", group: "Music", voice: true },
  { name: "automix", args: "<on|off>", description: "Use smooth DJ-style transitions", group: "Music", voice: true },
  { name: "like", description: "Teach the bot you like this track", group: "Music", voice: true },
  { name: "dislike", description: "Keep this track out of autoplay", group: "Music", voice: true },
  { name: "stats", description: "Listening stats for this room", group: "Music", voice: true },
  { name: "wrapped", description: "This room's monthly music recap", group: "Music", voice: true },
  { name: "settings", description: "View the room's music settings", group: "Music", voice: true },

  // ---- the same bot, but on Discord ----
  {
    name: "join",
    description: "Bring the bot into your Discord voice channel",
    group: "Discord music",
  },
  { name: "karaoke", args: "<on|off>", description: "Duck the vocals (Discord)", group: "Discord music" },
  { name: "filter", args: "<preset>", description: "Audio filter preset (Discord)", group: "Discord music" },
  { name: "crossfade", args: "<seconds>", description: "Crossfade between tracks (Discord)", group: "Discord music" },
  { name: "sleeptimer", args: "<minutes>", description: "Stop playing after a while (Discord)", group: "Discord music" },
  { name: "247start", description: "Keep the bot in the channel (Discord)", group: "Discord music" },
  { name: "247stop", description: "Stop keeping the bot there (Discord)", group: "Discord music" },
  { name: "247status", description: "Is 24/7 mode on? (Discord)", group: "Discord music" },
  { name: "randomplay", description: "Play something from the library (Discord)", group: "Discord music" },
  { name: "artist", args: "<name>", description: "Play an artist (Discord)", group: "Discord music" },

  // ---- rooms and dashboards ----
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
  { name: "web", description: "Open the music dashboard", group: "Rooms" },

  // ---- D&D ----
  {
    name: "roll",
    args: "<2d20+3>",
    description: "Roll dice, with advantage or disadvantage",
    group: "D&D",
  },
  { name: "coinflip", description: "Flip a coin", group: "D&D" },
  { name: "spell", args: "<fireball>", description: "Look up a spell", group: "D&D" },
  { name: "monster", args: "<goblin>", description: "Look up a monster", group: "D&D" },
  { name: "item", args: "<longsword>", description: "Look up an item", group: "D&D" },
  { name: "feat", args: "<alert>", description: "Look up a feat", group: "D&D" },
  { name: "race", args: "<half-orc>", description: "Look up a race", group: "D&D" },
  { name: "class", args: "<paladin>", description: "Look up a class", group: "D&D" },
  { name: "character", description: "Your character sheet (companion app)", group: "D&D" },
  { name: "inventory", description: "Your inventory (companion app)", group: "D&D" },
  { name: "condition", description: "Track conditions (companion app)", group: "D&D" },
  { name: "levelup", description: "Level up (companion app)", group: "D&D" },
  { name: "rest", description: "Short or long rest (companion app)", group: "D&D" },
  { name: "deathsave", description: "Roll a death save (companion app)", group: "D&D" },
  { name: "gmview", description: "Open the GM panel (companion app)", group: "D&D" },
  { name: "dnd", description: "Open the D&D companion", group: "D&D" },

  // ---- Huddle itself ----
  { name: "flip", description: "Flip a coin", group: "Huddle" },
  { name: "shrug", description: "¯\\_(ツ)_/¯", group: "Huddle" },
  { name: "help", description: "How commands work here", group: "Huddle" },
];

export const MUSIC_COMMANDS = new Set(
  SLASH_COMMANDS.filter((command) => command.group === "Music").map(
    (command) => command.name,
  ),
);

/** Handled by the bot's Discord side and reported back into the channel. */
export const DISCORD_ONLY_COMMANDS = new Set(
  SLASH_COMMANDS.filter((command) => command.group === "Discord music").map(
    (command) => command.name,
  ),
);

/** Answered from the D&D compendium. */
export const LOOKUP_COMMANDS = new Set([
  "spell",
  "monster",
  "item",
  "feat",
  "race",
  "class",
]);

/** Character-sheet features that need the companion app's own login. */
export const DND_LINK_COMMANDS = new Set([
  "character",
  "inventory",
  "condition",
  "create",
  "edit",
  "levelup",
  "rest",
  "deathsave",
  "gmview",
  "importpdf",
  "switch",
  "ask_gm",
  "dnd",
  "campaign",
]);

/** Extra spellings that behave like a listed command. */
export const COMMAND_ALIASES: Record<string, string> = {
  np: "nowplaying",
  previous: "history",
  campaign: "dnd",
  webui: "web",
  music: "web",
  join: "join",
  "247": "247status",
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
