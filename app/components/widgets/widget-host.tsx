"use client";

import { createContext, useContext, useMemo } from "react";
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

export const MUSIC_ENTRY: Omit<WidgetEntry, "title" | "description"> = {
  id: "music",
  icon: "♫",
  botName: "Music + Watch",
  sizes: WIDGET_SIZES,
};

/** Everything placeable in the server on screen. */
export function useWidgetCatalog(
  serverId: string | null,
  t: (key: "widget.music" | "widget.music.desc") => string,
): WidgetEntry[] {
  const widgets = useServerWidgets(serverId);
  return useMemo(() => {
    const entries: WidgetEntry[] = [
      { ...MUSIC_ENTRY, title: t("widget.music"), description: t("widget.music.desc") },
    ];
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
  }, [widgets, t]);
}
