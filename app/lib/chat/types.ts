/** Shapes the chat shell passes around: messages, DMs, mentions, reactions. */

import type { BotComponentRow, BotEmbedData } from "../../components/bot-embeds";
import type { DndCardProps } from "../../components/dnd-card";
import type { ForwardedFromData } from "../../components/forwarded-message-card";
import type { GameState } from "@/lib/games";
import type { PublicChannel, PublicRole } from "@/lib/servers";
import type { Theme } from "@/lib/themes";
import type { Member } from "@/lib/users";
import type { TtsLanguage } from "../tts/client";

export interface Message {
  id: string | number;
  channelId?: string | null;
  userId?: string | null;
  author: string;
  avatar: string;
  color: string;
  time: string;
  /** ISO timestamp, used to group bursts of messages from the same author. */
  createdAt?: string;
  text: string;
  bot?: boolean;
  /** On a bot reply to a slash command: what was run, and by whom. */
  commandText?: string;
  commandBy?: string;
  image?: string;
  images?: string[];
  file?: { url: string; name: string; type: "pdf" };
  link?: string;
  actionLabel?: string;
  audio?: string;
  kind?: string;
  pinned?: boolean;
  editedAt?: string;
  replyTo?: string;
  replyPreview?: { author: string; text: string } | null;
  reactions?: Array<{
    emoji: string;
    count: number;
    mine: boolean;
    /** Who reacted, for hover tooltips. */
    users?: Array<{
      id: string;
      username: string;
      displayName: string;
      avatar: string;
      avatarUrl?: string | null;
      color: string;
    }>;
  }>;
  mentions?: string[];
  threadId?: string;
  threadCount?: number;
  payload?: {
    /** Voice messages: length and a precomputed waveform (0–100 bars). */
    voice?: { durationMs?: number; waveform?: number[] };
    /** Theme share cards */
    themeShare?: Theme;
    /** A Messenger-style nudge: shakes the recipient's window. */
    nudge?: boolean;
    /** /tts: read aloud, in this language, to whoever has the channel open. */
    tts?: { lang: TtsLanguage; voice?: { tempo?: number; pitch?: number } };
    /** A Messenger wink: a full-window animation (MSN_WINKS id). */
    wink?: string;
    /** A conversation game (lib/games.ts), played inside this message. */
    game?: GameState;
    /** Sent automatically while its author was away (MSN auto-message). */
    autoReply?: boolean;
    /** Poll cards. */
    pollId?: string;
    /** /ask answers: the web results the answer cites. */
    sources?: Array<{ title: string; url: string }>;
    question?: string;
    options?: string[];
    multi?: boolean;
    voiceChannelId?: string;
    trackId?: string;
    label?: string;
    track?: { title: string; artist?: string | null; duration?: number | null; pageUrl?: string | null } | string;
    artist?: string;
    lines?: Array<{ at: number; line: string; active: boolean }>;
    type?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    facts?: Array<{ label: string; value: string }>;
    total?: number;
    expression?: string;
    details?: string[];
    /** D&D lookup cards and roll cards; see components/dnd-card.tsx. */
    source?: string;
    page?: number;
    otherVersions?: string[];
    tags?: string[];
    abilities?: DndCardProps["abilities"];
    sections?: DndCardProps["sections"];
    image?: string;
    lookupKind?: string;
    suggestions?: string[];
    dice?: DndCardProps["dice"];
    modifier?: number;
    mode?: string;
    roller?: string;
    /** Discord-style bot replies: embeds and button rows. */
    embeds?: BotEmbedData[];
    components?: BotComponentRow[];
    autoplay?: boolean;
    automix?: boolean;
    automix_blend_seconds?: number;
    crossfade_seconds?: number;
    audio_filter?: string | null;
    artist_diversity?: boolean;
    vibe_match?: boolean;
    wrapped?: boolean;
    plays?: number;
    unique?: number;
    hours?: number;
    topSongs?: Array<[string, number]>;
    topRequesters?: Array<[string, number]>;
    topArtist?: string | null;
    topGenre?: string | null;
    peakHour?: string | null;
    streakDays?: number;
    personality?: string | null;
    currentTrack?: any;
    queue?: any;
    totalTracks?: number;
    history?: any;
    query?: string;
    forwardedFrom?: ForwardedFromData;
  };
}

export interface DmSummary {
  channelId: string;
  user: Member;
  lastMessage: string | null;
  lastAt: string | null;
  /** Closed from the list; Cmd+K or a new message brings it back. */
  hidden?: boolean;
  /** Group DMs: `user` then stands for the group (id = channel id). */
  group?: {
    name: string;
    ownerId: string | null;
    members: Member[];
  };
}

/** One row of the mentions inbox (see /api/mentions). */
export interface MentionEntry {
  message: Message;
  channelName: string;
  channelKind: string;
  serverId: string | null;
  serverName: string | null;
  read: boolean;
}

/** An autocomplete option: a member or role after @, a channel after #. */
export type MentionOption =
  | { kind: "user"; member: Member }
  | { kind: "role"; role: PublicRole }
  | { kind: "channel"; channel: PublicChannel }
  | { kind: "broadcast"; name: "everyone" | "here" };

export type ReactionList = Array<{
  emoji: string;
  count: number;
  mine: boolean;
  users?: Array<{
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl?: string | null;
    color: string;
  }>;
}>;
