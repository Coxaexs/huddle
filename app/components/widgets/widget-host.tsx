"use client";

import { createContext, useContext, useMemo } from "react";
import type { MessageKey } from "@/lib/i18n";
import type { Initiative, TableCharacter } from "@/lib/lounge-shared";
import type { PlayerState } from "@/lib/protocol";
import type { BotWidget } from "@/lib/bot-widgets";
import { WIDGET_SIZES, type WidgetSize } from "@/lib/layout-prefs";
import { distinctWidgets, useServerWidgets } from "@/app/lib/widget-store";

/**
 * What every widget needs from the shell, provided once by renderChatShell so
 * the areas (sidebar, member list, header) don't each take a dozen props.
 */
export interface WidgetHostValue {
  /** The server on screen; null in DMs. */
  serverId: string | null;
  activeChannelId: string | null;
  voiceChannelId: string | null;
  players: Record<string, PlayerState>;
  /** The server's voice rooms, for "Playing in …". */
  voiceRooms: Array<{ id: string; name: string }>;
  joinVoice: (channelId: string) => void;
  membersOpen: boolean;
  /** The music bot is in the server on screen (always true in DMs). */
  musicBot: boolean;
  /** Some bot here can use the room player, which the player widgets need. */
  playerBot: boolean;
  /** Who is signed in. */
  userId: string;
  /** Runs a slash command as if typed in the open channel. */
  runCommand: (raw: string) => Promise<void>;
  /** The D&D table of the voice room you are in. */
  table: {
    initiative: Initiative | null;
    characters: Record<string, TableCharacter>;
    setInitiative: (next: Initiative) => void;
  };
}

const WidgetHost = createContext<WidgetHostValue | null>(null);

export const WidgetHostProvider = WidgetHost.Provider;

export function useWidgetHost(): WidgetHostValue {
  const host = useContext(WidgetHost);
  if (!host) throw new Error("Widgets need a WidgetHostProvider");
  return host;
}

/** A widget someone can place: the built-in one or a bot's. */
export interface WidgetEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** The bot that offers it; null for built-in widgets. */
  botName: string | null;
  sizes: readonly WidgetSize[];
  bot?: BotWidget;
}

export interface BuiltinEntry extends Omit<WidgetEntry, "title" | "description"> {
  /** What it takes: the music bot, any bot using the room player, or nothing (D&D). */
  needs: "music" | "player" | "dnd";
  titleKey: MessageKey;
  descKey: MessageKey;
}

const MUSIC = "Music + Watch";
const DND = "D&D Bot";
const music = (id: string, icon: string, titleKey: MessageKey, descKey: MessageKey): BuiltinEntry => ({
  id, icon, titleKey, descKey, needs: "music", botName: MUSIC, sizes: WIDGET_SIZES,
});
const player = (id: string, icon: string, titleKey: MessageKey, descKey: MessageKey): BuiltinEntry => ({
  id, icon, titleKey, descKey, needs: "player", botName: null, sizes: WIDGET_SIZES,
});
const dnd = (id: string, icon: string, titleKey: MessageKey, descKey: MessageKey): BuiltinEntry => ({
  id, icon, titleKey, descKey, needs: "dnd", botName: DND, sizes: WIDGET_SIZES,
});

/** The widgets that come with the music and D&D bots. Each can be placed many times. */
export const BUILTIN_WIDGETS: readonly BuiltinEntry[] = [
  player("music", "♫", "widget.music", "widget.music.desc"),
  player("music-controls", "⏯", "widget.musicControls", "widget.musicControls.desc"),
  player("music-queue", "📜", "widget.musicQueue", "widget.musicQueue.desc"),
  player("music-history", "🕘", "widget.musicHistory", "widget.musicHistory.desc"),
  player("music-cover", "💿", "widget.musicCover", "widget.musicCover.desc"),
  music("music-lyrics", "🎤", "widget.musicLyrics", "widget.musicLyrics.desc"),
  music("music-search", "🔎", "widget.musicSearch", "widget.musicSearch.desc"),
  music("music-playlists", "📂", "widget.musicPlaylists", "widget.musicPlaylists.desc"),
  player("music-rooms", "🔊", "widget.musicRooms", "widget.musicRooms.desc"),
  dnd("dnd-dice", "🎲", "widget.dndDice", "widget.dndDice.desc"),
  dnd("dnd-rolls", "📊", "widget.dndRolls", "widget.dndRolls.desc"),
  dnd("dnd-initiative", "⚔", "widget.dndInitiative", "widget.dndInitiative.desc"),
  dnd("dnd-party", "🛡", "widget.dndParty", "widget.dndParty.desc"),
  dnd("dnd-me", "🧙", "widget.dndMe", "widget.dndMe.desc"),
  dnd("dnd-slots", "✨", "widget.dndSlots", "widget.dndSlots.desc"),
  dnd("dnd-spell", "📖", "widget.dndSpell", "widget.dndSpell.desc"),
  dnd("dnd-monster", "🐉", "widget.dndMonster", "widget.dndMonster.desc"),
  dnd("dnd-item", "🗡", "widget.dndItem", "widget.dndItem.desc"),
  dnd("dnd-condition", "💫", "widget.dndCondition", "widget.dndCondition.desc"),
  dnd("dnd-feat", "🏅", "widget.dndFeat", "widget.dndFeat.desc"),
  dnd("dnd-class", "📜", "widget.dndClass", "widget.dndClass.desc"),
];

export function builtinWidget(id: string): BuiltinEntry | undefined {
  return BUILTIN_WIDGETS.find((entry) => entry.id === id);
}

/** Whether a built-in widget works on what is on screen. */
export function widgetAvailable(entry: BuiltinEntry, where: { serverId: string | null; musicBot: boolean; playerBot: boolean }): boolean {
  if (entry.needs === "music") return where.musicBot;
  if (entry.needs === "player") return where.playerBot;
  return Boolean(where.serverId);
}

/** Everything placeable in the server on screen. */
export function useWidgetCatalog(
  serverId: string | null,
  t: (key: MessageKey) => string,
  musicBot = true,
  playerBot = musicBot,
): WidgetEntry[] {
  const widgets = useServerWidgets(serverId);
  return useMemo(() => {
    // Like any bot's widget, these are offered where their bot is.
    const entries: WidgetEntry[] = BUILTIN_WIDGETS.filter((entry) => widgetAvailable(entry, { serverId, musicBot, playerBot })).map(
      (entry) => ({ ...entry, title: t(entry.titleKey), description: t(entry.descKey) }),
    );
    for (const widget of distinctWidgets(widgets)) {
      const embed = widget.embeds[0] as { description?: string } | undefined;
      entries.push({
        id: widget.key,
        title: widget.title,
        description: (embed?.description || widget.content || "").split("\n")[0].slice(0, 80),
        icon: widget.botAvatar,
        botName: widget.botName,
        sizes: widget.sizes,
        bot: widget,
      });
    }
    return entries;
  }, [widgets, t, musicBot, playerBot, serverId]);
}
