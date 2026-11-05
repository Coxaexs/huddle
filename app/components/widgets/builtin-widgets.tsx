"use client";

import type { WidgetArea, WidgetSize } from "@/lib/layout-prefs";
import { DiceWidget, InitiativeWidget, LookupWidget, MyCharacterWidget, PartyWidget, RollsWidget, SlotsWidget } from "./dnd-widgets";
import { MusicWidget } from "./music-widget";
import {
  MusicControlsWidget,
  MusicCoverWidget,
  MusicHistoryWidget,
  MusicLyricsWidget,
  MusicPlaylistsWidget,
  MusicQueueWidget,
  MusicRoomsWidget,
  MusicSearchWidget,
} from "./music-widgets";

/** The body of a built-in widget. Every placement gets its own, with its own state. */
export function BuiltinWidgetBody({ id, size, area }: { id: string; size: WidgetSize; area: WidgetArea }) {
  switch (id) {
    case "music": return <MusicWidget size={size} area={area} />;
    case "music-controls": return <MusicControlsWidget size={size} />;
    case "music-queue": return <MusicQueueWidget size={size} />;
    case "music-history": return <MusicHistoryWidget size={size} />;
    case "music-cover": return <MusicCoverWidget size={size} />;
    case "music-lyrics": return <MusicLyricsWidget size={size} />;
    case "music-search": return <MusicSearchWidget size={size} />;
    case "music-playlists": return <MusicPlaylistsWidget size={size} />;
    case "music-rooms": return <MusicRoomsWidget size={size} />;
    case "dnd-dice": return <DiceWidget size={size} />;
    case "dnd-rolls": return <RollsWidget size={size} />;
    case "dnd-initiative": return <InitiativeWidget size={size} />;
    case "dnd-party": return <PartyWidget size={size} />;
    case "dnd-me": return <MyCharacterWidget size={size} />;
    case "dnd-slots": return <SlotsWidget size={size} />;
    case "dnd-spell": return <LookupWidget kind="spell" size={size} />;
    case "dnd-monster": return <LookupWidget kind="monster" size={size} />;
    case "dnd-item": return <LookupWidget kind="item" size={size} />;
    case "dnd-condition": return <LookupWidget kind="condition" size={size} />;
    case "dnd-feat": return <LookupWidget kind="feat" size={size} />;
    case "dnd-class": return <LookupWidget kind="class" size={size} />;
    default: return null;
  }
}
