"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { DiceRollEvent, PlayerState } from "@/lib/protocol";
import { ConnectionBanner } from "./components/connection-banner";
import { convertMsnEmoticons } from "@/lib/msn-emoticons";
import {
  canShowVoiceBubble,
  onNativeVoiceAction,
  requestVoiceBubblePermission,
  syncNativeVoice,
} from "./lib/native-voice";
import { registerNativePush, unregisterNativePush } from "./lib/native-push";
import { useMobileShell } from "./hooks/use-mobile-shell";
import {
  MsnAdBanner,
  MsnDisplayPictures,
  MsnFormatToolbar,
  MsnSignInToasts,
  MSN_EXTRA_STATUSES,
  messageFontStyle,
  MsnFileTransfer,
  MsnPicturePicker,
  MsnSoundsDialog,
  MsnHoverCard,
  MsnWhatsNew,
  fileNameFromUrl,
  findWink,
  flashTitle,
  playMessageChime,
  playNudge,
  playWink,
  useMsnTheme,
} from "./components/msn-chrome";
import { TextStyleMenu } from "./components/text-style-menu";
import { GameCard, GamesPicker } from "./components/game-card";
import { MsnToday, shouldShowMsnToday } from "./components/msn-today";
import { useMsnContacts, usePersonalEmoticons, useWhatsNew } from "./hooks/use-msn-extras";
import { applyPersonalEmoticons } from "@/lib/msn-contacts";
import { msnPictureFile, type MsnPicture } from "./lib/msn-pictures";
import { GAME_INFO, isGameKind, type GameKind, type GameState } from "@/lib/games";
import { applyMessageFont, readMessageFont, saveMessageFont, stripTextStyle, type MessageFont } from "@/lib/text-style";
import type { RoomActivity } from "@/lib/activities";
import type { PublicChannel, PublicRole, PublicServer } from "@/lib/servers";
import { channelKindInfo, channelNameRules, convertibleKinds, CREATABLE_CHANNEL_KINDS, type ChannelKind } from "@/lib/channel-kinds";
import { shouldStartMuted } from "@/lib/stage";
import {
  ALL_PERMISSIONS,
  hasPermission,
  Permission,
} from "@/lib/permissions";
import { PRESENCE, type Member, type PresenceStatus, type PublicUser } from "@/lib/users";
import { activeUntil } from "@/lib/timeouts";
import { findTagQuery, mentionMatchScore, nameToHandle } from "@/lib/mention-handles";
import {
  Search,
  Bell,
  BellOff,
  CheckCheck,
  Pin,
  Sun,
  Moon,
  Settings,
  Users,
  Menu,
  Pencil,
  Plus,
  Trash2,
  StickyNote,
  Hash,
  Volume2,
  VolumeX,
  Radio,
  Reply,
  MessageSquare,
  Smile,
  SmilePlus,
  Paperclip,
  ArrowUp,
  PhoneCall,
  Video,
  Vote,
  Gamepad2,
  Type,
  ChevronDown,
  X,
  User,
  UserPlus,
  MoreHorizontal,
  AtSign,
  Send,
  PhoneOff,
  VideoOff,
  Mic,
  ShieldAlert,
  MicOff,
  Headphones,
  AudioLines,
  Monitor,
  Maximize2,
  Forward,
  Timer,
  CalendarDays,
  LogOut,
  Folder,
  FolderPlus,
} from "lucide-react";
import {
  startCallingTone,
  stopCallingTone,
  startIncomingCallTone,
  stopIncomingCallTone,
  playCallAnswerSound,
  playCallEndSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
} from "./lib/audio-cues";
import { AuthGate } from "./components/auth-gate";
import { Avatar } from "./components/avatar";
import {
  BotMenu,
  type BotMenuAction,
} from "./components/bot-menu";
import { DndCard, type DndCardProps } from "./components/dnd-card";
import {
  BotEmbeds,
  type BotComponentRow,
  type BotEmbedData,
} from "./components/bot-embeds";
import { DiceOverlay } from "./components/dice-overlay";
import { GifPicker } from "./components/gif-picker";
import { LyricsNow } from "./components/lyrics-now";
import { MessageBody, StyledText, isImageUrl, type MentionChannel } from "./components/message-body";
import { EditHistoryDialog } from "./components/edit-history";
import { EventsPanel, eventIsOpen, eventWhen, useServerEvents } from "./components/events-panel";
import {
  ServerInviteCard,
  type ResolvedInvite,
} from "./components/server-invite-card";
import { BattlemapBoard } from "./components/battlemap";
import { useBattlemap } from "./hooks/use-battlemap";
import { QuickSwitcher, type QuickSwitcherTarget } from "./components/quick-switcher";
import { GroupDmDialog } from "./components/group-dm-dialog";
import {
  createFolder,
  moveToFolder,
  railEntries,
  removeFromFolders,
  type ServerFolder,
} from "@/lib/server-folders";
import { KeyboardShortcutsDialog } from "./components/keyboard-shortcuts-dialog";
import { ToastContainer, showToast } from "./components/toast";
import { PollCard } from "./components/poll-card";
import { ForumBoard } from "./components/forum-board";
import { PdfViewer } from "./components/pdf-viewer";
import { ProfileCard } from "./components/profile-card";
import {
  MusicSettingsCard,
  MusicStatsCard,
  MusicQueueCard,
  MusicHistoryCard,
  MusicSearchCard,
  type MusicSettings,
} from "./components/music-cards";
import { NowPlaying } from "./components/now-playing";
import { MiniMusicBar } from "./components/mini-music-bar";
import { OutlineEmoji } from "./components/outline-emoji";
import { RemoteVoiceAudio } from "./components/remote-voice-audio";
import { SettingsDialog } from "./components/settings-dialog";
import { CustomDialog, type DialogOptions } from "./components/custom-dialog";
import { UserFooter } from "./components/user-footer";
import { ServerSettingsDialog } from "./components/server-settings-dialog";
import { EmojiPicker } from "./components/emoji-picker";
import { SlashMenu } from "./components/slash-menu";
import { VoiceStage, SoundboardDrawer } from "./components/voice-stage";
import { playPresetSound } from "@/lib/soundboard-presets";
import {
  replaceEmojiShortcodes,
  parseQuickReaction,
  findMatchingEmojiShortcodes,
} from "@/lib/emoji-shortcodes";
import { FriendsView } from "./components/friends-view";
import { GlobalUserSearchDialog } from "./components/global-user-search-dialog";
import { RecordingDirector } from "./components/recording-director";
import { VoiceDuration } from "./components/voice-duration";
import {
  UserMenu,
  type UserMenuTarget,
  type VoicePref,
} from "./components/user-menu";
import { useHub } from "./hooks/use-hub";
import { usePlayer } from "./hooks/use-player";
import {
  useVoice,
  type ScreenShareQuality,
} from "./hooks/use-voice";
import { apiFetch, apiUrl } from "./lib/client";
import { registerMedia, unlockAudio, unregisterMedia } from "./lib/devices";
import { comboToAccelerator } from "./lib/hotkeys";
import { enableWebPush, registerServiceWorker, showPageNotification } from "./lib/web-push";
import {
  COMMAND_ALIASES,
  DISCORD_ONLY_COMMANDS,
  DND_LINK_COMMANDS,
  LOOKUP_COMMANDS,
  MUSIC_COMMANDS,
  VOICE_REQUIRED_MUSIC_COMMANDS,
  matchCommands,
  findCommand,
  type SlashCommand,
} from "./lib/commands";
import { PollDialog } from "./components/poll-dialog";
import { UserProfileCard } from "./components/user-profile-card";
import {
  VoiceMessagePlayer,
  VoiceRecordButton,
  VoiceRecordingBar,
  formatDuration,
  useVoiceRecorder,
  type VoiceClip,
} from "./components/voice-message";
import { BlahajBuddy } from "./components/blahaj-buddy";
import { PrideBadges } from "./components/pride-badges";
import { useActivityDetector } from "./hooks/use-activity-detector";
import { ForwardMessageDialog, type ForwardMessageTarget } from "./components/forward-message-dialog";
import { ForwardedMessageCard, type ForwardedFromData } from "./components/forwarded-message-card";
import { ThemeShareCard } from "./components/theme-share-card";
import { AiAnswerCard } from "./components/ai-answer-card";
import { ImageGallery } from "./components/image-gallery";
import {
  type Theme,
  getActiveThemeId,
  findThemeById,
  applyThemeToDocument,
  applyClientUiCss,
  importThemeCode,
  exportThemeCode,
} from "@/lib/themes";

interface Message {
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

interface DmSummary {
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

/**
 * The argument hint the slash menu shows for a bot command: subcommands as
 * `<join|add|next>`, options as `<required> [optional]`.
 */
function commandArgsHint(options: unknown): string | undefined {
  if (!Array.isArray(options) || !options.length) return undefined;
  const list = options as Array<{ name: string; type?: number; required?: boolean }>;
  const subs = list.filter((option) => option.type === 1 || option.type === 2);
  if (subs.length) return `<${subs.map((option) => option.name).join("|")}>`;
  return list
    .map((option) => (option.required ? `<${option.name}>` : `[${option.name}]`))
    .join(" ");
}

/** Effective notification level: the channel's own, else its server's, else "all". */
function notifyLevel(
  prefs: Record<string, string>,
  channelId: string,
  serverId: string | undefined,
): string {
  return prefs[channelId] || (serverId && prefs[`server:${serverId}`]) || "all";
}

/** The rail slot for direct messages, standing in for a server id. */
const DM_HOME = "@me";

/** Default one-tap reactions shown on message hover. */
const DEFAULT_QUICK_REACTIONS = ["👍", "👎", "❤️", "😂", "🔥", "🎉"];

/** One row of the mentions inbox (see /api/mentions). */
interface MentionEntry {
  message: Message;
  channelName: string;
  channelKind: string;
  serverId: string | null;
  serverName: string | null;
  read: boolean;
}

/** Options for the one-tap "quick vote" on a message. */
const QUICK_VOTES = ["👍", "👎", "🍕", "🌮", "😂", "😢"];

/** An autocomplete option: a member or role after @, a channel after #. */
type MentionOption =
  | { kind: "user"; member: Member }
  | { kind: "role"; role: PublicRole }
  | { kind: "channel"; channel: PublicChannel }
  | { kind: "broadcast"; name: "everyone" | "here" };

/** Items matching `query` on any of their names, best matches first. */
function rankMentionMatches<T>(
  items: T[],
  query: string,
  names: (item: T) => Array<string | null | undefined>,
  tieBreak: (a: T, b: T) => number,
): T[] {
  return items
    .map((item) => ({ item, score: mentionMatchScore(query, names(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || tieBreak(a.item, b.item))
    .map((entry) => entry.item);
}

function formatClientTime(createdAt?: string, fallbackTime?: string): string {
  if (!createdAt) return fallbackTime || "";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return fallbackTime || "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return fallbackTime || "";
  }
}

function formatClientDateTime(createdAt?: string): string {
  if (!createdAt) return "";
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

/** Messenger's status-bar line: "Last message received at 7:06 PM on 9/26/2026." */
function msnLastReceived(list: Message[], selfId: string | undefined): string {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const message = list[i];
    if (message.userId === selfId || !message.createdAt) continue;
    const at = new Date(message.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    return `Last message received at ${at.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })} on ${at.toLocaleDateString()}.`;
  }
  return "No messages received yet.";
}

function Icon({
  children,
  label,
  onClick,
  active,
  badge,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  /** A small count in the corner, hidden when zero. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
      {badge ? <span className="icon-badge">{badge > 99 ? "99+" : badge}</span> : null}
    </button>
  );
}

/** Opens a one-shot file dialog and resolves with the chosen image. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] || null);
    // A cancelled dialog fires nothing in some browsers; resolve on focus back.
    window.addEventListener(
      "focus",
      () => window.setTimeout(() => resolve(input.files?.[0] || null), 400),
      { once: true },
    );
    input.click();
  });
}

/** Fires a desktop/web notification, unless the user turned them off. Only
 *  fires when the tab is not the focused/visible one — if you're looking at
 *  the app, the unread badge already tells you. Supports desktop native bridge. */
function showNotification(rawTitle: string, rawBody: string, tag?: string): void {
  const title = stripTextStyle(rawTitle);
  const body = stripTextStyle(rawBody);
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("huddle-notify") === "off") return;
    // Don't pop a notification while the user is actively focused on the app; the
    // in-app unread badge is the cue there.
    if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) return;

    // Desktop shell (Electron) native notification
    const win = typeof window !== "undefined" ? (window as unknown as { huddle?: { notify?: (t: string, b: string) => void } }) : null;
    if (win?.huddle?.notify) {
      win.huddle.notify(title, body);
      return;
    }

    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    void showPageNotification(title, body, tag).catch(() => undefined);
  } catch {
    // Notifications are best-effort.
  }
}

/** Plays a soundboard clip locally (everyone in the room hears their own copy). */
function playSound(url: string, volume = 0.7): void {
  try {
    const savedVol = typeof localStorage !== "undefined" ? parseFloat(localStorage.getItem("huddle_soundboard_volume") || "0.7") : 0.7;
    const effVol = isNaN(savedVol) ? volume : Math.max(0, Math.min(1, savedVol));
    if (url.startsWith("preset:")) {
      playPresetSound(url.slice(7), effVol);
      return;
    }
    const audio = new Audio(url);
    audio.volume = effVol;
    void audio.play().catch(() => undefined);
  } catch {
    // Non-fatal: a blocked autoplay just means no sound this time.
  }
}

type ReactionList = Array<{
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

/** Folds a single reaction toggle into a message's aggregated reaction list.
 *  Idempotent: if `me` is already (or no longer) in the users list, the count
 *  is not changed again. This keeps the optimistic update + socket echo from
 *  double-counting the same person. */
function applyReaction(
  reactions: ReactionList | undefined,
  emoji: string,
  isMine: boolean,
  added: boolean,
  me?: { id: string; username: string; displayName: string; avatar: string; avatarUrl?: string | null; color: string },
): ReactionList {
  const list = (reactions || []).map((r) => ({ ...r, users: r.users ? [...r.users] : [] }));
  const entry = list.find((r) => r.emoji === emoji);
  const alreadyThere = Boolean(me && entry?.users?.some((u) => u.id === me.id));
  if (added) {
    if (entry) {
      if (!alreadyThere) entry.count += 1;
      if (isMine) entry.mine = true;
      if (me && !alreadyThere) {
        entry.users = [...(entry.users || []), me];
      }
    } else {
      list.push({ emoji, count: 1, mine: isMine, users: me ? [me] : [] });
    }
  } else if (entry) {
    if (alreadyThere) {
      entry.count -= 1;
      if (isMine) entry.mine = false;
      if (me) entry.users = (entry.users || []).filter((u) => u.id !== me.id);
    }
    if (entry.count <= 0) return list.filter((r) => r.emoji !== emoji);
  }
  return list;
}

/**
 * Audio-taper curve: makes the whole 0–100 slider feel evenly useful. Above
 * 100% it boosts linearly, so 200% is twice as loud as the original (+6 dB).
 */
function volumeGain(percent: number): number {
  const normalized = Math.max(0, Math.min(2, percent / 100));
  return normalized <= 1 ? normalized * normalized : normalized;
}

/** Hover text for a reaction pill: who reacted with this emoji. */
function reactionTooltip(reaction: ReactionList[number]): string {
  const names = (reaction.users || []).map((u) => u.displayName);
  if (!names.length) return `${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`;
  const list = names.join(", ");
  return `${list} reacted with ${reaction.emoji}`;
}

/** Extracts server invite codes from text that contain hangout invite links or codes. */
export function extractInviteCodes(text: string): string[] {
  if (!text) return [];
  const inviteRegex = /(?:https?:\/\/[^\s/?#]+|[a-zA-Z0-9.-]+)?\/hangout\?(?:(?:servercode|code|invite)=)?([A-Za-z0-9_-]{4,24})\b/gi;
  const codes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = inviteRegex.exec(text)) !== null) {
    const code = match[1]?.toUpperCase();
    if (code && !codes.includes(code)) {
      codes.push(code);
    }
  }
  return codes;
}

/**
 * Creation-UI copy per channel kind.
 *
 * Presentation only, so it lives here rather than in `lib/channel-kinds.ts`,
 * which owns behaviour. A kind missing from this map still works — the prompt
 * falls back to plain "text" wording — so adding a kind server-side never
 * breaks this screen.
 */
const CHANNEL_KIND_COPY: Record<
  string,
  { title: string; message: string; placeholder: string }
> = {
  text: {
    title: "Create Text Channel",
    message: "Enter name for the new text channel:",
    placeholder: "general",
  },
  announcement: {
    title: "Create Announcement Channel",
    message: "Create a read-only feed that only moderators can post in:",
    placeholder: "announcements",
  },
  forum: {
    title: "Create Forum",
    message: "Create a board where each post starts its own thread:",
    placeholder: "help",
  },
  voice: {
    title: "Create Voice Room",
    message: "Enter name for the new voice room:",
    placeholder: "Voice Lounge",
  },
  stage: {
    title: "Create Stage",
    message: "Create a voice room with an audience, where speaking is a permission:",
    placeholder: "Friday Standup",
  },
};

/** "an announcement", "a forum". */
function withArticle(label: string): string {
  const lower = label.toLowerCase();
  return `${/^[aeiou]/.test(lower) ? "an" : "a"} ${lower}`;
}

/** Human label for a kind, for menus and badges. */
function channelKindLabel(kind: ChannelKind): string {
  switch (kind) {
    case "announcement":
      return "Announcement";
    case "forum":
      return "Forum";
    case "voice":
      return "Voice room";
    case "stage":
      return "Stage";
    case "text":
    default:
      return "Text channel";
  }
}

/**
 * Icon for a kind, chosen to match what the channel actually does: a forum is a
 * board of posts, a stage has an audience, an announcement is a broadcast.
 */
function channelKindIcon(kind: ChannelKind, size = 14, className?: string) {
  switch (kind) {
    case "announcement":
      return <Radio size={size} className={className} aria-hidden="true" />;
    case "forum":
      return <MessageSquare size={size} className={className} aria-hidden="true" />;
    case "voice":
      return <Volume2 size={size} className={className} aria-hidden="true" />;
    case "stage":
      return <Users size={size} className={className} aria-hidden="true" />;
    case "text":
    default:
      return <Hash size={size} className={className} aria-hidden="true" />;
  }
}


export function ChatShell() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [ready, setReady] = useState(false);
  /** Per-host feature flags; defaults to everything on until loaded. */
  const [features, setFeatures] = useState<{ recordSessions: boolean }>({
    recordSessions: true,
  });

  // Register the service worker and (re)subscribe to web push once signed in.
  // No permission prompt here — that happens from the settings toggle.
  useEffect(() => {
    if (!user) return;
    void registerServiceWorker().then(() => {
      if (window.localStorage.getItem("huddle-notify") === "off") return;
      return enableWebPush(false);
    }).catch(() => undefined);
  }, [user]);

  const [servers, setServers] = useState<PublicServer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberFilterQuery, setMemberFilterQuery] = useState("");
  const [dms, setDms] = useState<DmSummary[]>([]);
  /** The friend picker for starting a group DM, or adding people to one. */
  const [groupDialog, setGroupDialog] = useState<
    { mode: "create" } | { mode: "add"; channelId: string } | null
  >(null);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  /** When set, the main column shows this voice channel's stage instead of text. */
  const [stageChannelId, setStageChannelId] = useState<string | null>(null);
  const [quickSoundboardOpen, setQuickSoundboardOpen] = useState(false);
  /** Channel id currently being dragged in the sidebar, for reordering. */
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
  /** Server id currently being dragged on the rail, for reordering. */
  const [dragServerId, setDragServerId] = useState<string | null>(null);
  /** Where a dragged server would land: between icons, or merged into one. */
  const [serverDropHint, setServerDropHint] = useState<
    { id: string; mode: "before" | "merge" } | null
  >(null);
  const [serverFolders, setServerFolders] = useState<ServerFolder[]>([]);
  /** Folders shown open on the rail; remembered per device. */
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("huddle:open-folders") || "[]"));
    } catch {
      return new Set();
    }
  });
  const [folderMenu, setFolderMenu] = useState<{
    folder: ServerFolder;
    x: number;
    y: number;
  } | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(
        JSON.parse(window.localStorage.getItem("huddle-collapsed-cats") || "[]"),
      );
    } catch {
      return new Set();
    }
  });
  const [messages, setMessages] = useState<Message[]>([]);
  /** Raw unread counts; `unread` below is this with notification levels applied. */
  const [rawUnread, setUnread] = useState<
    Record<string, { unread: boolean; count: number; mentions: number }>
  >({});
  const [pins, setPins] = useState<Message[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  const [mentionsTab, setMentionsTab] = useState<"all" | "unread">("all");
  const [mentionInbox, setMentionInbox] = useState<MentionEntry[] | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [friendUserIds, setFriendUserIds] = useState<Set<string>>(new Set());
  const [outgoingFriendUserIds, setOutgoingFriendUserIds] = useState<Set<string>>(new Set());
  const [incomingFriendUserIds, setIncomingFriendUserIds] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const blockedUserIdsRef = useRef(blockedUserIds);
  blockedUserIdsRef.current = blockedUserIds;
  const [expandedBlockedMessages, setExpandedBlockedMessages] = useState<Set<string>>(new Set());

  const channelDraftsRef = useRef<Record<string, string>>({});
  const prevChannelForDraftRef = useRef<string | null>(null);
  const [draft, setDraftState] = useState("");
  const draftRef = useRef("");
  draftRef.current = draft;

  const setDraft = useCallback((valueOrFn: string | ((prev: string) => string)) => {
    setDraftState((prev) => {
      const next = typeof valueOrFn === "function" ? valueOrFn(prev) : valueOrFn;
      draftRef.current = next;
      const channelId = activeChannelRef.current;
      if (channelId) {
        channelDraftsRef.current[channelId] = next;
      }
      return next;
    });
  }, []);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      channelId: string;
      channelName: string;
      author: string;
      snippet: string;
    }>
  >([]);
  /** Files staged in the composer; images carry a data-URL preview. */
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ id: string; file: File; preview: string | null }>
  >([]);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  /** On touch screens, which message's action bar is currently revealed. */
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(
    null,
  );
  /** Which message's quick-vote chips are currently open. */
  const [quickVoteId, setQuickVoteId] = useState<string | number | null>(null);

  /** User's custom quick reactions in message actions bar. */
  const [quickReactions, setQuickReactions] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_QUICK_REACTIONS;
    try {
      const stored = window.localStorage.getItem("huddle_quick_reactions_v2");
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return DEFAULT_QUICK_REACTIONS;
  });

  const [hiddenServerEmojiIds, setHiddenServerEmojiIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem("huddle_hidden_server_emojis_v2");
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const syncProfileEmojis = useCallback((qr?: string[], hidden?: string[]) => {
    if (!user) return;
    void apiFetch("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({
        ...(qr !== undefined ? { quickReactions: qr } : {}),
        ...(hidden !== undefined ? { hiddenEmojis: hidden } : {}),
      }),
    }).catch(() => {});
  }, [user]);

  // Reconcile and hydrate client-side quick reactions on mount and when user session loads
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("huddle_quick_reactions_v2");
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setQuickReactions(parsed);
          return;
        }
      }
    } catch {}
    if (user?.quickReactions && Array.isArray(user.quickReactions)) {
      setQuickReactions(user.quickReactions);
      try {
        window.localStorage.setItem(
          "huddle_quick_reactions_v2",
          JSON.stringify(user.quickReactions),
        );
      } catch {}
    }
  }, [user?.id]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("huddle_hidden_server_emojis_v2");
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenServerEmojiIds(parsed);
          return;
        }
      }
    } catch {}
    if (user?.hiddenEmojis && Array.isArray(user.hiddenEmojis)) {
      setHiddenServerEmojiIds(user.hiddenEmojis);
      try {
        window.localStorage.setItem(
          "huddle_hidden_server_emojis_v2",
          JSON.stringify(user.hiddenEmojis),
        );
      } catch {}
    }
  }, [user?.id]);

  const removeQuickReaction = (emojiToRemove: string) => {
    const cleanEmoji = emojiToRemove.replace(/^:|:$/g, "");
    setQuickReactions((prev) => {
      const next = prev.filter(
        (e) => e !== emojiToRemove && e.replace(/^:|:$/g, "") !== cleanEmoji,
      );
      try {
        window.localStorage.setItem("huddle_quick_reactions_v2", JSON.stringify(next));
      } catch {}
      syncProfileEmojis(next, undefined);
      return next;
    });

    // If it is also a server custom emoji, ensure it's hidden so it doesn't resurface from server emojis
    const matchingServerEmoji = emojis.find(
      (e) => e.name === cleanEmoji || e.id === emojiToRemove,
    );
    if (matchingServerEmoji || emojiToRemove.startsWith(":")) {
      const idToHide = matchingServerEmoji ? matchingServerEmoji.id : cleanEmoji;
      setHiddenServerEmojiIds((prev) => {
        const tokens = [idToHide, cleanEmoji, `:${cleanEmoji}:`];
        const next = [...new Set([...prev, ...tokens])];
        try {
          window.localStorage.setItem("huddle_hidden_server_emojis_v2", JSON.stringify(next));
        } catch {}
        syncProfileEmojis(undefined, next);
        return next;
      });
    }

    showToast(`Removed ${emojiToRemove} from quick reactions`);
  };

  const hideServerEmoji = (id: string, name: string) => {
    const cleanName = name.replace(/^:|:$/g, "");
    const tokens = [id, cleanName, `:${cleanName}:`];
    setHiddenServerEmojiIds((prev) => {
      const next = [...new Set([...prev, ...tokens])];
      try {
        window.localStorage.setItem("huddle_hidden_server_emojis_v2", JSON.stringify(next));
      } catch {}
      syncProfileEmojis(undefined, next);
      return next;
    });

    // Also remove from quick reactions if present
    setQuickReactions((prev) => {
      const next = prev.filter(
        (e) => e !== id && e !== cleanName && e !== `:${cleanName}:`,
      );
      if (next.length !== prev.length) {
        try {
          window.localStorage.setItem("huddle_quick_reactions_v2", JSON.stringify(next));
        } catch {}
        syncProfileEmojis(next, undefined);
      }
      return next;
    });

    showToast(`Removed :${cleanName}: from quick reactions`);
  };

  const addQuickReaction = (emojiToAdd: string) => {
    const cleanName = emojiToAdd.replace(/^:|:$/g, "");
    setQuickReactions((prev) => {
      if (prev.includes(emojiToAdd)) {
        showToast(`${emojiToAdd} is already in quick reactions`);
        return prev;
      }
      const next = [...prev, emojiToAdd];
      try {
        window.localStorage.setItem("huddle_quick_reactions_v2", JSON.stringify(next));
      } catch {}
      syncProfileEmojis(next, undefined);
      return next;
    });

    // If it was hidden, unhide it
    setHiddenServerEmojiIds((prev) => {
      const next = prev.filter(
        (id) => id !== emojiToAdd && id !== cleanName && id !== `:${cleanName}:`,
      );
      if (next.length !== prev.length) {
        try {
          window.localStorage.setItem("huddle_hidden_server_emojis_v2", JSON.stringify(next));
        } catch {}
        syncProfileEmojis(undefined, next);
      }
      return next;
    });

    showToast(`Added ${emojiToAdd} to quick reactions`);
  };

  /** Which message currently has the emoji reaction picker popover open with screen coordinates. */
  const [reactionPicker, setReactionPicker] = useState<{
    messageId: string | number;
    top: number;
    right: number;
    mode?: "react" | "addToQuickReactions";
  } | null>(null);

  /** Forward message target modal state. */
  const [forwardTarget, setForwardTarget] = useState<ForwardMessageTarget | null>(null);

  /** Which reaction pill's "who reacted" popover is open, with screen coordinates. */
  const [reactionViewer, setReactionViewer] = useState<{
    messageId: string | number;
    emoji: string;
    top: number;
    left: number;
  } | null>(null);

  /** Server invites resolved for rendering rich Discord-style invite cards in chat. */
  const [resolvedInvites, setResolvedInvites] = useState<
    Record<string, ResolvedInvite>
  >({});
  const fetchingInvitesRef = useRef<Set<string>>(new Set());

  const touchStartRef = useRef<{ x: number; y: number; id: string | number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    if (!openActionsId) return;
    const handleOutside = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (
        !target?.closest(`.message[id="msg-${openActionsId}"] .message-actions`) &&
        !target?.closest(`.message[id="msg-${openActionsId}"] .message-actions-toggle`)
      ) {
        setOpenActionsId(null);
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener("pointerdown", handleOutside);
    }, 60);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", handleOutside);
    };
  }, [openActionsId]);

  const handleMessageTouchStart = (
    messageId: string | number,
    e: React.TouchEvent,
  ) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        "button, a, input, textarea, select, audio, video, [role='button'], .message-actions, .message-actions-toggle, .avatar, .reaction, .message-image, .message-file-card",
      )
    ) {
      return;
    }
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id: messageId };
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setOpenActionsId(messageId);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch { }
      }
    }, 450);
  };

  const handleMessageTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      touchStartRef.current = null;
    }
  };

  const handleMessageTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartRef.current = null;
    if (longPressTriggeredRef.current) {
      setTimeout(() => {
        longPressTriggeredRef.current = false;
      }, 300);
    }
  };

  const handleOpenReactionPicker = (
    e: React.MouseEvent,
    messageId: string | number,
    mode: "react" | "addToQuickReactions" = "react",
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const pickerHeight = 450;
    const margin = 16;
    let top = rect.top - 200;
    if (top < margin) top = margin;
    if (top + pickerHeight > window.innerHeight - margin) {
      top = window.innerHeight - pickerHeight - margin;
    }
    const right = Math.max(margin, window.innerWidth - rect.left + 8);
    setReactionPicker((current) =>
      current?.messageId === messageId && current?.mode === mode
        ? null
        : { messageId, top, right, mode },
    );
  };

  async function handleForwardMessage(
    destinationChannelId: string,
    comment: string,
    destinationName: string,
  ) {
    if (!forwardTarget) return;
    try {
      const res = await apiFetch<Message>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: destinationChannelId,
          content: comment || "",
          payload: {
            forwardedFrom: {
              id: String(forwardTarget.id),
              author: forwardTarget.author,
              avatar: forwardTarget.avatar,
              avatarUrl: forwardTarget.avatarUrl,
              color: forwardTarget.color,
              text: forwardTarget.text,
              createdAt: forwardTarget.createdAt,
              image: forwardTarget.image,
              images: forwardTarget.images,
              file: forwardTarget.file,
              channelName: forwardTarget.channelName,
              serverName: forwardTarget.serverName,
            },
          },
        }),
      });
      showToast(`Forwarded message to ${destinationName}`, "success");
      if (destinationChannelId === activeChannelId && res) {
        setMessages((prev) => [...prev, res]);
      }
    } catch {
      showToast("Failed to forward message", "warning");
    }
  }

  const handleOpenReactionViewer = (
    e: React.MouseEvent,
    messageId: string | number,
    emoji: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const viewerHeight = 320;
    const margin = 16;
    let top = rect.top - viewerHeight - 8;
    if (top < margin) top = rect.bottom + 8;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - 260 - margin),
    );
    setReactionViewer((current) =>
      current?.messageId === messageId && current.emoji === emoji
        ? null
        : { messageId, emoji, top, left },
    );
  };
  // On a phone the member list is an overlay, so it starts out of the way.
  const [membersOpen, setMembersOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 760,
  );
  const [markdownModalOpen, setMarkdownModalOpen] = useState(false);
  const [theme, setTheme] = useState<"cozy" | "legacy" | "light">("cozy");
  const msnTheme = useMsnTheme();
  /** Contact-list groups folded shut by their arrow (MSN theme). */
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean | undefined>>({});
  /** Like Messenger, you can't nudge again straight away. */
  const [nudgeCooling, setNudgeCooling] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 240;
    const saved = Number(window.localStorage.getItem("huddle-sidebar-width"));
    return saved >= 160 && saved <= 450 ? saved : 240;
  });
  const [membersWidth, setMembersWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 250;
    const saved = Number(window.localStorage.getItem("huddle-members-width"));
    return saved >= 180 && saved <= 450 ? saved : 250;
  });

  const sidebarDragging = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartW = useRef(240);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  const membersDragging = useRef(false);
  const membersStartX = useRef(0);
  const membersStartW = useRef(250);
  const membersWidthRef = useRef(membersWidth);
  membersWidthRef.current = membersWidth;

  const [threadWidth, setThreadWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 420;
    const saved = Number(window.localStorage.getItem("huddle-thread-width"));
    return saved >= 300 && saved <= 650 ? saved : 420;
  });
  const threadDragging = useRef(false);
  const threadStartX = useRef(0);
  const threadStartW = useRef(420);
  const threadWidthRef = useRef(threadWidth);
  threadWidthRef.current = threadWidth;

  const onSidebarResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    sidebarDragging.current = true;
    sidebarStartX.current = e.clientX;
    sidebarStartW.current = sidebarWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onMembersResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    membersDragging.current = true;
    membersStartX.current = e.clientX;
    membersStartW.current = membersWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onThreadResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    threadDragging.current = true;
    threadStartX.current = e.clientX;
    threadStartW.current = threadWidthRef.current;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => {
      if (sidebarDragging.current) {
        const delta = e.clientX - sidebarStartX.current;
        const next = Math.min(460, Math.max(160, sidebarStartW.current + delta));
        setSidebarWidth(next);
      }
      if (membersDragging.current) {
        const delta = membersStartX.current - e.clientX;
        const next = Math.min(460, Math.max(180, membersStartW.current + delta));
        setMembersWidth(next);
      }
      if (threadDragging.current) {
        const delta = threadStartX.current - e.clientX;
        const next = Math.min(650, Math.max(300, threadStartW.current + delta));
        setThreadWidth(next);
      }
    };
    const up = () => {
      if (sidebarDragging.current) {
        sidebarDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.localStorage.setItem("huddle-sidebar-width", String(sidebarWidthRef.current));
      }
      if (membersDragging.current) {
        membersDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.localStorage.setItem("huddle-members-width", String(membersWidthRef.current));
      }
      if (threadDragging.current) {
        threadDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.localStorage.setItem("huddle-thread-width", String(threadWidthRef.current));
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  /** The MSN "Font" dialog's choice: wraps everything you send while that theme is on. */
  const [messageFont, setMessageFont] = useState<MessageFont | null>(null);
  useEffect(() => setMessageFont(readMessageFont()), []);
  /** MSN's Sounds dialog; which sound (if any) plays is chosen there (app/lib/msn-sounds.ts). */
  const [soundsOpen, setSoundsOpen] = useState(false);
  const msnSoundsRef = useRef(false);
  msnSoundsRef.current = msnTheme;
  const msnThemeRef = useRef(msnTheme);
  msnThemeRef.current = msnTheme;
  const [slashIndex, setSlashIndex] = useState(0);
  /** Slash commands registered by connected bots, offered beside our own. */
  const [botCommands, setBotCommands] = useState<SlashCommand[]>([]);
  const [userMenu, setUserMenu] = useState<UserMenuTarget | null>(null);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  /** Image(s) opened fullscreen in the carousel lightbox. */
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  /** Message whose edit history is open. */
  const [editHistoryId, setEditHistoryId] = useState<string | null>(null);
  /** Events panel for the active server, and a counter that refetches its list. */
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventsRefresh, setEventsRefresh] = useState(0);

  const openLightbox = useCallback((images: string | string[], index = 0) => {
    if (typeof images === "string") {
      setLightbox({ images: [images], index: 0 });
    } else if (Array.isArray(images) && images.length > 0) {
      setLightbox({ images, index: Math.max(0, Math.min(index, images.length - 1)) });
    }
  }, []);

  const setLightboxImage = useCallback((img: string | null) => {
    if (!img) setLightbox(null);
    else setLightbox({ images: [img], index: 0 });
  }, []);
  /** PDF opened in the in-Huddle reader and form editor. */
  const [pdfViewer, setPdfViewer] = useState<{
    url: string;
    name: string;
  } | null>(null);
  /** Who is typing where: channelId -> userId -> {name, at}. */
  const [typing, setTyping] = useState<
    Record<string, Record<string, { name: string; at: number }>>
  >({});
  const lastTypingSentRef = useRef(0);
  /** Live vote tallies pushed over the socket, keyed by poll id. */
  const [pollCounts, setPollCounts] = useState<Record<string, number[]>>({});
  const [emojis, setEmojis] = useState<
    Array<{ id: string; serverId: string; name: string; url: string }>
  >([]);
  /**
   * Notification levels, absent meaning "all". Keyed by channel id, plus
   * `server:<id>` for a whole-server setting (a channel's own level wins).
   */
  const [channelPrefs, setChannelPrefs] = useState<Record<string, string>>({});
  /** Which server each channel belongs to; channels not listed are DMs. */
  const channelServer = useMemo(() => {
    const map = new Map<string, string>();
    for (const server of servers) {
      for (const channel of server.channels) map.set(channel.id, server.id);
    }
    return map;
  }, [servers]);
  const channelServerRef = useRef(channelServer);
  channelServerRef.current = channelServer;
  // Applied at display time, so counts loaded on startup respect muted
  // channels and servers the same way live messages do.
  const unread = useMemo(() => {
    const shown: typeof rawUnread = {};
    for (const [channelId, entry] of Object.entries(rawUnread)) {
      const level = notifyLevel(channelPrefs, channelId, channelServer.get(channelId));
      if (level === "nothing") continue;
      if (level === "mentions") {
        if (entry.mentions > 0) {
          shown[channelId] = { unread: true, count: entry.mentions, mentions: entry.mentions };
        }
        continue;
      }
      shown[channelId] = entry;
    }
    return shown;
  }, [rawUnread, channelPrefs, channelServer]);
  const rawUnreadRef = useRef(rawUnread);
  rawUnreadRef.current = rawUnread;
  /** Members banned from the active server, so the menu can offer Unban. */
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [channelMenu, setChannelMenu] = useState<{
    channel: PublicChannel;
    x: number;
    y: number;
  } | null>(null);
  /**
   * The channel-kind picker that is open, and which context opened it:
   * `null` for the sidebar header, a category id for that category's "+".
   */
  const [kindMenu, setKindMenu] = useState<{ categoryId: string | null } | null>(null);
  /** Right-click menu on a server icon in the rail. */
  const [railMenu, setRailMenu] = useState<{
    server: PublicServer;
    x: number;
    y: number;
  } | null>(null);
  /** The message whose thread is open in the side panel. */
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  /** Whiteboard, watch party, game, tier list, or timer open in voice. */
  const [roomActivity, setRoomActivity] = useState<RoomActivity | null>(null);
  /** The latest dice roll shown over the voice stage (null when idle). */
  const [diceRoll, setDiceRoll] = useState<DiceRollEvent | null>(null);
  const lastDiceRollSeedRef = useRef<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  /** Your own presence, mirrored locally so the dot reacts instantly. */
  const [myStatus, setMyStatus] = useState<PresenceStatus>("online");
  /**
   * Messenger Plus!'s auto-message: while you're Away or Busy, the first DM
   * from each person gets this reply once (per stretch of being away).
   */
  const [autoReply, setAutoReply] = useState<string | null>(null);
  useEffect(() => {
    try {
      setAutoReply(window.localStorage.getItem("huddle-msn-autoreply"));
    } catch {
      // Storage blocked: off.
    }
  }, []);
  const autoReplyRef = useRef<{ text: string | null; away: boolean; replied: Set<string> }>({
    text: null,
    away: false,
    replied: new Set(),
  });
  autoReplyRef.current.text = autoReply;
  const nowAway = myStatus === "idle" || myStatus === "dnd";
  // Back online: the next time you're away, everyone gets the reply again.
  if (!nowAway && autoReplyRef.current.away) autoReplyRef.current.replied = new Set();
  autoReplyRef.current.away = nowAway;
  const [myCustomStatus, setMyCustomStatus] = useState<string | null>(null);
  /** True while auto-idle is holding you at "idle" after inactivity. */
  const autoIdleRef = useRef(false);
  const [botMenu, setBotMenu] = useState<{
    kind: "music" | "dnd";
    x: number;
    y: number;
  } | null>(null);
  const [voicePrefs, setVoicePrefs] = useState<Record<string, VoicePref>>({});
  const prefFor = useCallback(
    (id: string): VoicePref =>
      voicePrefs[id] || { volume: 100, muted: false },
    [voicePrefs],
  );

  const [musicWatchOnline, setMusicWatchOnline] = useState<boolean | null>(null);
  const [musicDashboardUrl, setMusicDashboardUrl] = useState<string | null>(null);
  const [dndOnline, setDndOnline] = useState<boolean | null>(null);
  const [dndUrl, setDndUrl] = useState<string | null>(null);

  // Custom modal dialog & server settings states
  const [dialogOptions, setDialogOptions] = useState<DialogOptions | null>(null);
  const [dialogCallback, setDialogCallback] = useState<((val?: string) => void) | null>(null);
  const [dialogCancel, setDialogCancel] = useState<(() => void) | null>(null);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);

  const showCustomPrompt = (options: {
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    confirmText?: string;
    maxLength?: number;
    onConfirm: (val?: string) => void;
  }) => {
    setDialogOptions({ ...options, type: "prompt" });
    setDialogCallback(() => options.onConfirm);
    setDialogCancel(null);
  };

  const showCustomConfirm = (options: {
    title: string;
    message?: string;
    isDanger?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    /** Runs only when the cancel button is clicked; backdrop, X and Escape just close. */
    onCancel?: () => void;
  }) => {
    setDialogOptions({ ...options, type: "confirm" });
    setDialogCallback(() => () => options.onConfirm());
    setDialogCancel(() => options.onCancel || null);
  };

  // ---- MSN contact list extras: groups, quiet sign-ins, personal emoticons ----
  const msnContacts = useMsnContacts(msnTheme && Boolean(user));
  // One entry per person: the server roster has their status, so it wins over
  // the slimmer DM copy (comparing both would report changes that aren't).
  const whatsNewPeople = useMemo(() => {
    const byId = new Map<string, Member>();
    for (const person of [...members, ...dms.filter((dm) => !dm.group).map((dm) => dm.user)]) {
      if (!byId.has(person.id)) byId.set(person.id, person);
    }
    return [...byId.values()];
  }, [members, dms]);
  const whatsNew = useWhatsNew(msnTheme && Boolean(user), whatsNewPeople, user?.id ?? null);
  const personalEmoticons = usePersonalEmoticons(msnTheme && Boolean(user));

  function createContactGroup(thenPlace?: string) {
    showCustomPrompt({
      title: "Create a group",
      message: "Name your new contact group, like Friends, Family or Coworkers.",
      placeholder: "Friends",
      confirmText: "Create",
      maxLength: 32,
      onConfirm: (name) => {
        const clean = name?.trim();
        if (!clean) return;
        const id = `g${Date.now().toString(36)}`;
        msnContacts.update((current) => ({
          ...current,
          groups: [...current.groups, { id, name: clean }],
          placement: thenPlace ? { ...current.placement, [thenPlace]: id } : current.placement,
        }));
      },
    });
  }

  function renameContactGroup(groupId: string) {
    const group = msnContacts.contacts.groups.find((g) => g.id === groupId);
    if (!group) return;
    showCustomPrompt({
      title: "Rename group",
      defaultValue: group.name,
      confirmText: "Rename",
      maxLength: 32,
      onConfirm: (name) => {
        const clean = name?.trim();
        if (!clean) return;
        msnContacts.update((current) => ({
          ...current,
          groups: current.groups.map((g) => (g.id === groupId ? { ...g, name: clean } : g)),
        }));
      },
    });
  }

  function deleteContactGroup(groupId: string) {
    const group = msnContacts.contacts.groups.find((g) => g.id === groupId);
    if (!group) return;
    showCustomConfirm({
      title: `Delete "${group.name}"?`,
      message: "The contacts in it go back to Online / Not Online. Nobody is removed.",
      confirmText: "Delete group",
      isDanger: true,
      onConfirm: () =>
        msnContacts.update((current) => ({
          ...current,
          groups: current.groups.filter((g) => g.id !== groupId),
          placement: Object.fromEntries(
            Object.entries(current.placement).filter(([, id]) => id !== groupId),
          ),
        })),
    });
  }

  /** Messenger 2009's contact hover card: a short wait, then a mini profile. */
  const [hoverCard, setHoverCard] = useState<{ member: Member; top: number; left: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  function queueHoverCard(member: Member | null, anchor?: HTMLElement) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (!member || !anchor) {
      hoverTimer.current = window.setTimeout(() => setHoverCard(null), 150);
      return;
    }
    hoverTimer.current = window.setTimeout(() => {
      const rect = anchor.getBoundingClientRect();
      setHoverCard({
        member,
        top: Math.min(rect.top, window.innerHeight - 190),
        left: Math.max(8, rect.left - 268),
      });
    }, 550);
  }

  /** Messenger's Display Picture dialog. */
  const [pictureOpen, setPictureOpen] = useState(false);
  async function setStockPicture(picture: MsnPicture) {
    const file = await msnPictureFile(picture);
    const form = new FormData();
    form.append("file", file);
    const upload = await apiFetch<{ key: string }>("/api/uploads", { method: "POST", body: form });
    const data = await apiFetch<{ user: PublicUser }>("/api/settings/profile", {
      method: "PATCH",
      body: JSON.stringify({ avatarKey: upload.key, avatar: user?.avatar }),
    });
    setUser(data.user);
    void loadMembers().catch(() => undefined);
  }

  function placeContact(userId: string, groupId: string | null) {
    msnContacts.update((current) => {
      const placement = { ...current.placement };
      if (groupId) placement[userId] = groupId;
      else delete placement[userId];
      return { ...current, placement };
    });
  }

  function toggleSignInAlert(userId: string) {
    msnContacts.update((current) => ({
      ...current,
      quiet: current.quiet.includes(userId)
        ? current.quiet.filter((id) => id !== userId)
        : [...current.quiet, userId],
    }));
  }

  // The shared battlemap for the open voice stage (map, GM flag, hide state,
  // create/open, dropping your own token, and socket reconciliation).
  const battlemapApi = useBattlemap({
    stageChannelId,
    user,
    onNotice: setNotice,
    showPrompt: showCustomPrompt,
    showConfirm: showCustomConfirm,
    pickImage: pickImageFile,
  });
  const {
    battlemap,
    gm: battlemapGm,
    hidden: battlemapHidden,
    onSocket: onBattlemapSocket,
    open: openBattlemap,
    addMyToken,
    localToken: onLocalToken,
    localStroke: onLocalStroke,
    toggle: toggleBattlemap,
    close: closeBattlemap,
  } = battlemapApi;

  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  // Whether the reader is parked at the latest message; new messages only
  // pull the view down when they are, otherwise the jump button counts them.
  const nearBottomRef = useRef(true);
  const [showJumpLatest, setShowJumpLatest] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const lastSeenTailRef = useRef<string | number | null>(null);
  const unreadRef = useRef(rawUnread);
  unreadRef.current = rawUnread;
  const initialChannelScrollRef = useRef<{
    channelId: string;
    unreadCount: number;
  } | null>(null);
  const [messagesLoadedFor, setMessagesLoadedFor] = useState<string | null>(null);
  const activeChannelRef = useRef<string | null>(null);
  activeChannelRef.current = activeChannelId;
  const activeServerRef = useRef<string | null>(null);
  activeServerRef.current = activeServerId;
  /** The slash command being handled, consumed by the first bot reply so it
   *  can show "who used what" in place of keeping the original message. */
  const pendingCommandRef = useRef<{ text: string; by: string } | null>(null);

  const inDmHome = activeServerId === DM_HOME;
  const [touchInput, setTouchInput] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const apply = () => setTouchInput(coarse.matches);
    apply();
    coarse.addEventListener("change", apply);
    return () => coarse.removeEventListener("change", apply);
  }, []);

  // Phones refuse to start any audio until the page has been touched. Every
  // media element registers itself, so one gesture is enough for all of them.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("touchend", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchend", unlock);
    };
  }, []);

  // ------------------------------------------------------------- session

  const loadServers = useCallback(async () => {
    const data = await apiFetch<{ servers: PublicServer[] }>("/api/servers");
    setServers(data.servers);
    return data.servers;
  }, []);

  const loadMembers = useCallback(async () => {
    const serverId = activeServerRef.current;
    if (!serverId || serverId === DM_HOME) {
      setMembers([]);
      return;
    }
    const query = `?serverId=${encodeURIComponent(serverId)}`;
    const data = await apiFetch<{ members: Member[] }>(`/api/members${query}`);
    // Guard against stale responses: if the user switched servers while this
    // fetch was in-flight, discard the result so we don't flash the wrong roster.
    if (activeServerRef.current !== serverId) return;
    setMembers(data.members);
  }, []);

  const loadServerFolders = useCallback(async () => {
    const data = await apiFetch<{ folders: ServerFolder[] }>("/api/servers/folders");
    setServerFolders(data.folders);
  }, []);

  const loadDms = useCallback(async () => {
    const data = await apiFetch<{ conversations: DmSummary[] }>("/api/dms");
    setDms(data.conversations);
    return data.conversations;
  }, []);

  const loadFriendsCount = useCallback(async () => {
    try {
      const data = await apiFetch<{
        friends?: Array<{ id: string }>;
        incoming: Array<{ id: string }>;
        outgoing?: Array<{ id: string }>;
        blocked: Array<{ id: string }>;
      }>("/api/friends");
      setPendingFriendCount(data.incoming?.length || 0);
      setFriendUserIds(new Set((data.friends || []).map((b) => b.id)));
      setIncomingFriendUserIds(new Set((data.incoming || []).map((b) => b.id)));
      setOutgoingFriendUserIds(new Set((data.outgoing || []).map((b) => b.id)));
      setBlockedUserIds(new Set((data.blocked || []).map((b) => b.id)));
    } catch {
      // Ignore
    }
  }, []);

  const handleAddFriend = useCallback(
    async (targetUserId: string, targetUsername?: string) => {
      try {
        await apiFetch("/api/friends", {
          method: "POST",
          body: JSON.stringify(
            targetUsername ? { username: targetUsername } : { userId: targetUserId },
          ),
        });
        setOutgoingFriendUserIds((prev) => new Set(prev).add(targetUserId));
        void loadFriendsCount();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Failed to send friend request.");
      }
    },
    [loadFriendsCount],
  );

  const handleRemoveFriend = useCallback(
    async (targetUserId: string) => {
      try {
        await apiFetch(`/api/friends?id=${encodeURIComponent(targetUserId)}`, {
          method: "DELETE",
        });
        setFriendUserIds((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        void loadFriendsCount();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Failed to remove friend.");
      }
    },
    [loadFriendsCount],
  );

  const handleAcceptFriend = useCallback(
    async (targetUserId: string) => {
      try {
        await apiFetch("/api/friends/accept", {
          method: "POST",
          body: JSON.stringify({ requesterId: targetUserId }),
        });
        setIncomingFriendUserIds((prev) => {
          const next = new Set(prev);
          next.delete(targetUserId);
          return next;
        });
        setFriendUserIds((prev) => new Set(prev).add(targetUserId));
        void loadFriendsCount();
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Failed to accept friend request.");
      }
    },
    [loadFriendsCount],
  );

  const handleBlockUser = useCallback(
    async (targetId: string) => {
      try {
        await apiFetch("/api/friends/block", {
          method: "POST",
          body: JSON.stringify({ targetId }),
        });
        setBlockedUserIds((prev) => new Set(prev).add(targetId));
        void loadFriendsCount();
        void loadDms();
      } catch (err) {
        console.error("Failed to block user:", err);
      }
    },
    [loadFriendsCount, loadDms],
  );

  const handleUnblockUser = useCallback(
    async (targetId: string) => {
      try {
        await apiFetch(`/api/friends?id=${encodeURIComponent(targetId)}`, {
          method: "DELETE",
        });
        setBlockedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        void loadFriendsCount();
        void loadDms();
      } catch (err) {
        console.error("Failed to unblock user:", err);
      }
    },
    [loadFriendsCount, loadDms],
  );

  const loadPrefs = useCallback(async () => {
    const data = await apiFetch<{ prefs: Record<string, VoicePref> }>(
      "/api/voice/prefs",
    );
    setVoicePrefs(data.prefs || {});
  }, []);

  const loadChannelPrefs = useCallback(async () => {
    const data = await apiFetch<{ prefs: Record<string, string> }>(
      "/api/channels/prefs",
    ).catch(() => ({ prefs: {} }));
    setChannelPrefs(data.prefs || {});
  }, []);

  const loadEmojis = useCallback(async () => {
    const data = await apiFetch<{
      emojis: Array<{ id: string; serverId: string; name: string; url: string }>;
    }>("/api/emojis").catch(() => ({ emojis: [] }));
    setEmojis(data.emojis || []);
  }, []);

  const loadUnread = useCallback(async () => {
    const data = await apiFetch<{
      channels: Record<string, { unread: boolean; count: number; mentions: number }>;
    }>("/api/channels/reads").catch(() => ({ channels: {} }));
    setUnread(data.channels || {});
  }, []);

  /** Clears every unread channel in a server with one request. */
  const markServerRead = useCallback((server: PublicServer) => {
    const ids = server.channels
      .map((channel) => channel.id)
      .filter((id) => rawUnreadRef.current[id]);
    if (!ids.length) return;
    setUnread((current) => {
      const next = { ...current };
      for (const id of ids) delete next[id];
      return next;
    });
    void apiFetch("/api/channels/reads", {
      method: "POST",
      body: JSON.stringify({ channelIds: ids }),
    }).catch(() => undefined);
  }, []);

  /** Sets a notification level for a channel id or a `server:<id>` key. */
  const setNotifyLevel = useCallback((key: string, level: string) => {
    setChannelPrefs((prefs) => {
      const next = { ...prefs };
      if (level === "all") delete next[key];
      else next[key] = level;
      return next;
    });
    void apiFetch("/api/channels/prefs", {
      method: "POST",
      body: JSON.stringify({ channelId: key, level }),
    }).catch(() => undefined);
  }, []);

  /** Clears a channel's unread flag locally and records it read on the server. */
  const markChannelRead = useCallback((channelId: string) => {
    setUnread((current) => {
      if (!current[channelId]?.unread && !current[channelId]?.mentions) {
        return current;
      }
      const next = { ...current };
      delete next[channelId];
      return next;
    });
    void apiFetch("/api/channels/reads", {
      method: "POST",
      body: JSON.stringify({ channelId }),
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    apiFetch<{ user: PublicUser | null; bootstrap: boolean }>(
      "/api/auth/session",
    )
      .then((data) => {
        setUser(data.user);
        setBootstrap(data.bootstrap);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));

    apiFetch<{ recordSessions: boolean }>("/api/features")
      .then((data) => setFeatures(data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadServers().catch(() => undefined);
    void loadServerFolders().catch(() => undefined);
    void loadDms().catch(() => undefined);
    void loadFriendsCount().catch(() => undefined);
    void loadPrefs().catch(() => undefined);
    void loadUnread().catch(() => undefined);
    void loadEmojis().catch(() => undefined);
    void loadChannelPrefs().catch(() => undefined);
  }, [
    user,
    loadServers,
    loadDms,
    loadFriendsCount,
    loadPrefs,
    loadUnread,
    loadEmojis,
    loadChannelPrefs,
  ]);

  // Detect and redeem invite links on load (e.g. /hangout?CODE, ?servercode=CODE, ?code=CODE, ?invite=CODE)
  useEffect(() => {
    if (!user) return;
    try {
      const search = window.location.search;
      let code = "";
      if (search) {
        const params = new URLSearchParams(search);
        code = (
          params.get("code") ||
          params.get("servercode") ||
          params.get("invite") ||
          ""
        ).trim();
        // Also support ?SERVERCODE (e.g. /hangout?HX3F-9K2Q without key=value)
        if (!code && search.length > 1 && !search.includes("=")) {
          code = decodeURIComponent(search.slice(1)).trim();
        }
      }
      if (code) {
        const inviteCode = code.toUpperCase();
        void apiFetch<{
          serverId: string;
          servers: PublicServer[];
          alreadyMember?: boolean;
        }>("/api/servers/membership", {
          method: "POST",
          body: JSON.stringify({ action: "join", code: inviteCode }),
        })
          .then((data) => {
            setServers(data.servers);
            setActiveServerId(data.serverId);
            setNotice(
              data.alreadyMember
                ? "You are already a member of this server."
                : "Joined server via invite link!",
            );
            const cleanPath = window.location.pathname.startsWith("/hangout")
              ? "/"
              : window.location.pathname;
            window.history.replaceState({}, document.title, cleanPath);
          })
          .catch((err) => {
            setNotice(
              err instanceof Error ? err.message : "Invalid or expired invite link.",
            );
          });
      }
    } catch {
      // ignore
    }
  }, [user]);

  // Resolves server invite codes found in visible chat messages so we can render Discord-style invite cards
  useEffect(() => {
    if (!user) return;
    const codesToFetch: string[] = [];
    const checkText = (txt?: string) => {
      if (!txt) return;
      const found = extractInviteCodes(txt);
      for (const code of found) {
        if (!resolvedInvites[code] && !fetchingInvitesRef.current.has(code)) {
          codesToFetch.push(code);
          fetchingInvitesRef.current.add(code);
        }
      }
    };

    messages.forEach((m) => checkText(m.text));
    threadMessages.forEach((m) => checkText(m.text));
    if (threadRoot) checkText(threadRoot.text);

    if (codesToFetch.length === 0) return;

    codesToFetch.forEach((code) => {
      apiFetch<ResolvedInvite>(`/api/invites/resolve?code=${encodeURIComponent(code)}`)
        .then((res) => {
          setResolvedInvites((prev) => ({ ...prev, [code]: res }));
        })
        .catch(() => {
          setResolvedInvites((prev) => ({
            ...prev,
            [code]: { code, valid: false },
          }));
        })
        .finally(() => {
          fetchingInvitesRef.current.delete(code);
        });
    });
  }, [user, messages, threadMessages, threadRoot, resolvedInvites]);

  // Opening a channel marks it read.
  useEffect(() => {
    if (!activeChannelId) return;
    initialChannelScrollRef.current = {
      channelId: activeChannelId,
      unreadCount: unreadRef.current[activeChannelId]?.count || 0,
    };
    markChannelRead(activeChannelId);
  }, [activeChannelId, markChannelRead]);

  // Switching channels isolates draft messages, cancels pending attachments and replies
  useEffect(() => {
    const prev = prevChannelForDraftRef.current;
    if (prev && prev !== activeChannelId) {
      channelDraftsRef.current[prev] = draftRef.current;
    }
    prevChannelForDraftRef.current = activeChannelId;

    const nextDraft = activeChannelId ? (channelDraftsRef.current[activeChannelId] || "") : "";
    setDraftState(nextDraft);
    draftRef.current = nextDraft;

    setPendingFiles([]);
    setReplyTarget(null);
    setEditingId(null);
  }, [activeChannelId]);

  // Bot commands are per-server, so the slash menu reloads them on a move.
  useEffect(() => {
    if (!activeChannelId) {
      setBotCommands([]);
      return;
    }
    let cancelled = false;
    void apiFetch<{
      commands: Array<{ name: string; description: string; options?: unknown[] }>;
    }>(`/api/commands?channelId=${encodeURIComponent(activeChannelId)}`)
      .then((data) => {
        if (cancelled) return;
        setBotCommands(
          (data.commands || []).map((command) => ({
            name: command.name,
            description: command.description || "From a connected bot",
            group: "Bots" as const,
            args: commandArgsHint(command.options),
          })),
        );
      })
      .catch(() => {
        // A Huddle with no bots, or an offline gateway: the menu just shows
        // the built-in commands.
        if (!cancelled) setBotCommands([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChannelId]);

  // Switching servers re-scopes the member roster to that server's members.
  useEffect(() => {
    if (user && activeServerId && activeServerId !== DM_HOME) {
      void loadMembers().catch(() => undefined);
    } else if (activeServerId === DM_HOME) {
      setMembers([]);
    }
  }, [user, activeServerId, loadMembers]);

  useEffect(() => {
    if (!servers.length) return;
    setActiveServerId((current) => {
      if (current === DM_HOME) return current;
      const remembered =
        current || window.localStorage.getItem("huddle-server") || "";
      return servers.some((server) => server.id === remembered)
        ? remembered
        : servers[0].id;
    });
  }, [servers]);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) || null,
    [servers, activeServerId],
  );
  // Split by capability, not by a literal kind: a forum and an announcement
  // channel are text channels that behave differently, and a stage is a voice
  // room. Comparing to "text"/"voice" directly is what would make the newer
  // kinds vanish from the sidebar.
  const textChannels = useMemo(
    () =>
      activeServer?.channels.filter(
        (c) => channelKindInfo(c.kind).text && c.kind !== "dm",
      ) || [],
    [activeServer],
  );
  const voiceChannels = useMemo(
    () => activeServer?.channels.filter((c) => channelKindInfo(c.kind).appearsAsVoice) || [],
    [activeServer],
  );
  const { events: serverEvents, reload: reloadEvents } = useServerEvents(
    inDmHome ? null : activeServerId,
    eventsRefresh,
  );
  /** The soonest event that hasn't ended, for the sidebar chip. */
  const nextEvent = serverEvents.find((event) => eventWhen(event) !== "Ended") || null;
  const membersById = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members) map.set(member.id, member);
    if (user) {
      // Merge rather than replace: the member row carries this server's
      // nickname and role ids, while `user` has the freshest profile edits.
      const own = map.get(user.id);
      map.set(user.id, {
        ...own,
        id: user.id,
        username: user.username,
        displayName: own?.nickname || user.displayName,
        globalName: user.displayName,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl,
        color: user.color,
        isAdmin: user.isAdmin,
        canInvite: user.canInvite,
        lastSeenAt: own?.lastSeenAt || (user as any).lastSeenAt || new Date().toISOString(),
      });
    }
    for (const dm of dms) {
      if (dm.user && !map.has(dm.user.id)) {
        map.set(dm.user.id, {
          id: dm.user.id,
          username: dm.user.username,
          displayName: dm.user.displayName,
          avatar: dm.user.avatar,
          avatarUrl: dm.user.avatarUrl,
          color: dm.user.color,
          lastSeenAt: (dm.user as any).lastSeenAt || new Date().toISOString(),
        });
      }
    }
    return map;
  }, [members, user, dms]);

  /** Bumped when your own timeout runs out, so the composer unlocks on time. */
  const [timeoutTick, setTimeoutTick] = useState(0);
  /** When your timeout in the server on screen ends, if you have one. */
  const myTimeoutUntil = useMemo(
    () => (inDmHome || !user ? null : activeUntil(membersById.get(user.id)?.timeoutUntil)),
    // timeoutTick re-runs this once the end time passes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [membersById, inDmHome, user, timeoutTick],
  );
  useEffect(() => {
    if (!myTimeoutUntil) return;
    const wait = Math.min(Date.parse(myTimeoutUntil) - Date.now() + 500, 2 ** 31 - 1);
    const timer = window.setTimeout(() => setTimeoutTick((n) => n + 1), Math.max(wait, 0));
    return () => window.clearTimeout(timer);
  }, [myTimeoutUntil]);

  /**
   * The signed-in member's effective permission bitmask on the active server,
   * mirroring lib/permissions on the client so the UI can hide privileged
   * affordances. The server still enforces every action.
   */
  const myPermissions = useMemo(() => {
    if (!user || !activeServer) return 0;
    if (user.isAdmin || activeServer.ownerId === user.id) return ALL_PERMISSIONS;
    const myRoleIds = new Set(
      membersById.get(user.id)?.roleIds?.[activeServer.id] || [],
    );
    let mask = 0;
    for (const role of activeServer.roles) {
      if (myRoleIds.has(role.id)) mask |= role.permissions;
    }
    if (mask & Permission.ADMINISTRATOR) return ALL_PERMISSIONS;
    return mask;
  }, [user, activeServer, membersById]);

  const canManageChannels = hasPermission(myPermissions, Permission.MANAGE_CHANNELS);
  const canManageServer = hasPermission(myPermissions, Permission.MANAGE_SERVER);
  const canRecordSessions = hasPermission(
    myPermissions,
    Permission.RECORD_SESSIONS,
  );
  const canModerate = hasPermission(myPermissions, Permission.MODERATE);
  /**
   * Posting in an announcement channel. Matches the server's check exactly —
   * gating the client on a different flag than the server would either hide a
   * composer that works or offer one that always 403s.
   */
  const canPostAnnouncements = hasPermission(myPermissions, Permission.MANAGE_MESSAGES);
  /** Pinning: MANAGE_MESSAGES in a server (the server checks the same), anyone in a DM. */
  const canPin = inDmHome || canPostAnnouncements;
  const canManageNicknames = hasPermission(myPermissions, Permission.MANAGE_NICKNAMES);
  const canMentionEveryone = hasPermission(myPermissions, Permission.MENTION_EVERYONE);
  const canCreateServerInvites =
    hasPermission(myPermissions, Permission.CREATE_INVITES) ||
    Boolean(user?.isAdmin || user?.canInvite);

  /** Roles a member holds on the active server, highest position first. */
  const rolesForMember = useCallback(
    (member: Member | undefined): PublicRole[] => {
      if (!member || !activeServer) return [];
      const ids = new Set(member.roleIds?.[activeServer.id] || []);
      return activeServer.roles
        .filter((role) => ids.has(role.id))
        .sort((a, b) => b.position - a.position);
    },
    [activeServer],
  );

  function openProfile(member: Member, e?: React.MouseEvent) {
    setUserMenu(null);
    const pos = e ? { x: e.clientX, y: e.clientY } : undefined;
    setProfileCardTarget({ member, pos });
  }
  function openProfileByHandle(handle: string) {
    const lower = handle.toLowerCase();
    const member =
      members.find((m) => m.username.toLowerCase() === lower) ||
      Array.from(membersById.values()).find(
        (m) => m.username.toLowerCase() === lower,
      );
    if (member) openProfile(member);
  }

  /** The top (highest-position) role colour for a member on the active server. */
  const roleColorFor = useCallback(
    (member: Member | undefined): string | null => {
      if (!member || !activeServer) return null;
      const ids = new Set(member.roleIds?.[activeServer.id] || []);
      let best: { position: number; color: string } | null = null;
      for (const role of activeServer.roles) {
        if (!ids.has(role.id)) continue;
        if (!best || role.position > best.position) {
          best = { position: role.position, color: role.color };
        }
      }
      return best?.color || null;
    },
    [activeServer],
  );

  // Channels grouped into ordered categories plus an uncategorised bucket, both
  // sorted by their stored position. This drives the Discord-style sidebar.
  // NOTE: this hook must stay above the early returns below (React hook rules).
  const channelLayout = useMemo(() => {
    const all = activeServer?.channels.filter((c) => c.kind !== "dm") || [];
    const byPos = (a: PublicChannel, b: PublicChannel) => a.position - b.position;
    const categories = [...(activeServer?.categories || [])].sort(
      (a, b) => a.position - b.position,
    );
    const uncategorised = all.filter((c) => !c.categoryId).sort(byPos);
    const grouped = categories.map((category) => ({
      category,
      channels: all.filter((c) => c.categoryId === category.id).sort(byPos),
    }));
    return { uncategorised, grouped };
  }, [activeServer]);

  /** Custom emoji by name, for rendering `:name:` anywhere it appears. */
  const emojiMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const emoji of emojis) map[emoji.name] = emoji.url;
    return map;
  }, [emojis]);

  // DMs with unread messages, surfaced as avatars on the server rail.
  const dmUnread = useMemo(
    () =>
      dms
        .map((dm) => ({ dm, count: unread[dm.channelId]?.count || 0 }))
        .filter((entry) => entry.count > 0),
    [dms, unread],
  );
  const dmUnreadTotal = dmUnread.reduce((sum, entry) => sum + entry.count, 0);

  useEffect(() => {
    if (!activeServerId || activeServerId === DM_HOME) return;
    window.localStorage.setItem("huddle-server", activeServerId);
    setActiveChannelId((current) => {
      if (current && textChannels.some((channel) => channel.id === current)) {
        return current;
      }
      const remembered = window.localStorage.getItem(
        `huddle-channel:${activeServerId}`,
      );
      return (
        textChannels.find((channel) => channel.id === remembered)?.id ||
        textChannels[0]?.id ||
        null
      );
    });
  }, [activeServerId, textChannels]);

  useEffect(() => {
    if (activeServerId && activeServerId !== DM_HOME && activeChannelId) {
      window.localStorage.setItem(
        `huddle-channel:${activeServerId}`,
        activeChannelId,
      );
    }
  }, [activeServerId, activeChannelId]);

  const activeChannel = useMemo(
    () => textChannels.find((channel) => channel.id === activeChannelId) || null,
    [textChannels, activeChannelId],
  );
  /** Capabilities of the open channel; drives the composer's wording and gating. */
  const activeChannelInfo = channelKindInfo(activeChannel?.kind);
  /**
   * Announcement channels are read-only for anyone without MANAGE_MESSAGES, so
   * the composer is replaced by an explanation instead of a box that 403s.
   */
  const composerBlocked = Boolean(
    activeChannel && activeChannelInfo.moderatorOnlyPosting && !canPostAnnouncements,
  );
  const activeDm = useMemo(
    () => dms.find((dm) => dm.channelId === activeChannelId) || null,
    [dms, activeChannelId],
  );
  /** DMs shown in the list; closed ones stay reachable through Cmd+K. */
  const visibleDms = useMemo(() => dms.filter((dm) => !dm.hidden), [dms]);
  const isSelfDm = Boolean(
    inDmHome && activeDm && user && activeDm.user.id === user.id,
  );
  const channelTitle = inDmHome
    ? isSelfDm
      ? `${user?.displayName || "You"} (Notes)`
      : activeDm?.user.displayName || "Direct messages"
    : activeChannel?.name || "no channel";

  const isDmBlocked = Boolean(
    inDmHome && activeDm && !isSelfDm && blockedUserIds.has(activeDm.user.id),
  );

  // ------------------------------------------------------------ realtime

  const refreshPins = useCallback(async (channelId: string) => {
    const data = await apiFetch<{ messages: Message[] }>(
      `/api/messages?channelId=${encodeURIComponent(channelId)}&pinned=1`,
    ).catch(() => ({ messages: [] as Message[] }));
    setPins(data.messages);
  }, []);

  const handleIncomingMessage = useCallback(
    (channelId: string, message: unknown) => {
      const incoming = message as Message;
      // Nudges shake the window when they land in the open conversation or
      // any DM, unless the sender is blocked.
      if (
        incoming.payload?.nudge &&
        (channelId === activeChannelRef.current || !channelServerRef.current.get(channelId)) &&
        !(incoming.userId && blockedUserIdsRef.current.has(incoming.userId))
      ) {
        playNudge();
      }
      // Winks play under the same rules.
      if (
        incoming.payload?.wink &&
        (channelId === activeChannelRef.current || !channelServerRef.current.get(channelId)) &&
        !(incoming.userId && blockedUserIdsRef.current.has(incoming.userId))
      ) {
        playWink(incoming.payload.wink);
      }
      // Messenger's "new message" chime, for other people's messages you
      // aren't looking at: the open conversation while the window is in the
      // background, any DM, or a mention elsewhere.
      if (
        msnSoundsRef.current &&
        user &&
        incoming.userId !== user.id &&
        !incoming.bot &&
        !incoming.payload?.nudge &&
        !incoming.payload?.wink &&
        (channelId !== activeChannelRef.current || !document.hasFocus()) &&
        (channelId === activeChannelRef.current ||
          !channelServerRef.current.get(channelId) ||
          Boolean(incoming.mentions?.includes(user.id))) &&
        !(incoming.userId && blockedUserIdsRef.current.has(incoming.userId)) &&
        notifyLevel(channelPrefsRef.current, channelId, channelServerRef.current.get(channelId)) !== "nothing"
      ) {
        playMessageChime();
      }
      // Away with an auto-message set: answer a DM once, never an auto-reply.
      if (
        msnThemeRef.current &&
        autoReplyRef.current.text &&
        autoReplyRef.current.away &&
        user &&
        incoming.userId &&
        incoming.userId !== user.id &&
        !incoming.bot &&
        !incoming.payload?.autoReply &&
        !channelServerRef.current.get(channelId) &&
        !autoReplyRef.current.replied.has(channelId) &&
        !blockedUserIdsRef.current.has(incoming.userId)
      ) {
        autoReplyRef.current.replied.add(channelId);
        void apiFetch("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            channelId,
            content: `[i]Auto-message:[/i] ${autoReplyRef.current.text}`,
            payload: { autoReply: true },
          }),
        }).catch(() => autoReplyRef.current.replied.delete(channelId));
      }
      // …and blink the tab title while the window is in the background.
      if (
        msnThemeRef.current &&
        user &&
        incoming.userId !== user.id &&
        !incoming.bot &&
        !document.hasFocus() &&
        !(incoming.userId && blockedUserIdsRef.current.has(incoming.userId)) &&
        (channelId === activeChannelRef.current ||
          !channelServerRef.current.get(channelId) ||
          Boolean(incoming.mentions?.includes(user.id)))
      ) {
        flashTitle(`${stripTextStyle(incoming.author)} says…`);
      }
      if (channelId !== activeChannelRef.current) {
        const serverId = channelServerRef.current.get(channelId);
        // A DM you are not looking at still deserves to bubble up the list.
        // Server channels don't touch the DM list, so skip the refetch.
        if (!serverId) void loadDms().catch(() => undefined);
        const mentioned = Boolean(user && incoming.mentions?.includes(user.id));
        // Your own messages (echoed back) never count as unread.
        if (user && incoming.userId === user.id) return;

        // Counted regardless of level (the `unread` view filters it), but
        // "nothing" never pops a notification.
        const level = notifyLevel(channelPrefsRef.current, channelId, serverId);

        setUnread((current) => ({
          ...current,
          [channelId]: {
            unread: true,
            count: (current[channelId]?.count || 0) + 1,
            mentions: (current[channelId]?.mentions || 0) + (mentioned ? 1 : 0),
          },
        }));
        if (mentioned && level !== "nothing") {
          showNotification(
            `${incoming.author} mentioned you`,
            incoming.text.slice(0, 140),
            `msg-${channelId}`,
          );
        }
        return;
      }
      // Thread replies belong in the thread panel, not the channel flow; the
      // root message just gains a reply.
      if (incoming.threadId) {
        setThreadMessages((current) =>
          threadRootRef.current &&
            String(threadRootRef.current.id) === incoming.threadId &&
            !current.some((m) => m.id === incoming.id)
            ? [...current, incoming]
            : current,
        );
        if (!countedThreadRepliesRef.current.has(String(incoming.id))) {
          countedThreadRepliesRef.current.add(String(incoming.id));
          setMessages((current) =>
            current.map((m) =>
              String(m.id) === incoming.threadId
                ? { ...m, threadCount: (m.threadCount || 0) + 1 }
                : m,
            ),
          );
        }
        return;
      }
      setMessages((current) =>
        current.some((existing) => existing.id === incoming.id)
          ? current
          : [...current, incoming],
      );
    },
    [loadDms, user],
  );

  const voiceSignalRef = useRef<(from: string, data: unknown) => void>(() => { });
  const forcedMuteRef = useRef<(userId: string, muted: boolean) => void>(
    () => { },
  );
  /** Current connected voice channel, for the soundboard event handler. */
  const voiceChannelRef = useRef<string | null>(null);
  /** Tears this tab out of voice when the account joins from another one. */
  const voiceEvictedRef = useRef<() => void>(() => { });
  /** Joins another voice channel when a moderator moves this account. */
  const voiceMoveRef = useRef<(channelId: string) => void>(() => { });
  /** DM call signaling listener ref */
  const onDmCallRef = useRef<((payload: any) => void) | null>(null);
  /** The open thread, readable from socket handlers without re-subscribing. */
  const threadRootRef = useRef<Message | null>(null);
  /** Thread reply ids already counted, since the POST response and the socket
   * echo both deliver the sender's own reply. */
  const countedThreadRepliesRef = useRef<Set<string>>(new Set());
  threadRootRef.current = threadRoot;
  /** Notification levels, readable from socket handlers. */
  const channelPrefsRef = useRef<Record<string, string>>({});
  channelPrefsRef.current = channelPrefs;
  /** The voice channel whose stage is open, for battlemap events. */
  const stageChannelRef = useRef<string | null>(null);
  stageChannelRef.current = stageChannelId;

  /**
   * A burst of structure changes (renaming several channels, a role edit that
   * touches many rows) would otherwise trigger a full servers+members+emojis
   * reload for each event on every open tab. Coalesce them into one reload.
   */
  const structureReloadRef = useRef<number | null>(null);
  const reloadStructureSoon = useCallback(() => {
    if (structureReloadRef.current) return;
    structureReloadRef.current = window.setTimeout(() => {
      structureReloadRef.current = null;
      void loadServers().catch(() => undefined);
      void loadMembers().catch(() => undefined);
      void loadEmojis().catch(() => undefined);
      // Group DMs you were added to (or renamed) arrive as structure changes.
      void loadDms().catch(() => undefined);
      setEventsRefresh((n) => n + 1);
    }, 400);
    // loadEmojis/loadServers/loadMembers are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hub = useHub(Boolean(user), {
    onMessage: handleIncomingMessage,
    onSignal: (from, data) => voiceSignalRef.current(from, data),
    onStructureChange: reloadStructureSoon,
    onMessageDeleted: (channelId, id) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) => current.filter((message) => message.id !== id));
      setPins((current) => current.filter((message) => message.id !== id));
    },
    onMessagePinned: (channelId, id, pinned) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, pinned } : message,
        ),
      );
      void refreshPins(channelId);
    },
    onMessageEdited: (channelId, id, content, editedAt, payload) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? {
                ...message,
                text: typeof content === "string" ? content : message.text,
                editedAt,
                // Bot edits may carry only the parts they changed (an
                // ephemeral message's new embed, say): merge, don't replace.
                ...(payload !== undefined
                  ? {
                      payload: payload
                        ? { ...message.payload, ...(payload as Message["payload"]) }
                        : undefined,
                    }
                  : {}),
              }
            : message,
        ),
      );
    },
    onReaction: (channelId, messageId, emoji, userId, added) => {
      if (channelId !== activeChannelRef.current) return;
      // Resolve the reacting person from the roster so the tooltip can name
      // them even when the reaction arrives over the socket. Falls back to the
      // signed-in user's own profile when the reactor is us (they may not be
      // in the current server's roster, e.g. a DM partner).
      const reactor = membersById.get(userId);
      const reactorInfo =
        reactor || (user && userId === user.id)
          ? {
            id: reactor?.id || user!.id,
            username: reactor?.username || user!.username,
            displayName: reactor?.displayName || user!.displayName,
            avatar: reactor?.avatar || user!.avatar,
            avatarUrl: reactor?.avatarUrl ?? user!.avatarUrl,
            color: reactor?.color || user!.color,
          }
          : undefined;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, reactions: applyReaction(message.reactions, emoji, userId === user?.id, added, reactorInfo) }
            : message,
        ),
      );
    },
    onSoundboard: (channelId, url) => {
      if (channelId !== voiceChannelRef.current) return;
      playSound(url);
    },
    onTyping: (channelId, userId, displayName) => {
      setTyping((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] || {}),
          [userId]: { name: displayName, at: Date.now() },
        },
      }));
    },
    onPoll: (channelId, pollId, counts) => {
      if (channelId !== activeChannelRef.current) return;
      setPollCounts((current) => ({ ...current, [pollId]: counts }));
    },
    onBattlemap: (channelId, payload) => {
      onBattlemapSocket(channelId, payload);
    },
    onActivity: (channelId, payload) => {
      if (channelId !== stageChannelRef.current) return;
      if (payload.action === "close") {
        setRoomActivity(null);
        return;
      }
      const incoming = (payload.activity as RoomActivity) || null;
      setRoomActivity((current) => {
        // The Draw & Guess prompt is returned only to its drawer. Public
        // socket updates must not make that prompt disappear mid-round.
        if (
          incoming?.kind === "drawguess" &&
          incoming.state.drawerId === user?.id &&
          current?.kind === "drawguess" &&
          current.state.drawerId === user?.id &&
          current.state.word
        ) {
          return {
            ...incoming,
            state: { ...incoming.state, word: current.state.word },
          };
        }
        return incoming;
      });
    },
    onDiceRoll: (channelId, roll) => {
      // Show the roll wherever it's relevant: the open voice stage or the
      // active text channel (rolls publish to both).
      if (
        channelId !== stageChannelRef.current &&
        channelId !== activeChannelRef.current
      ) {
        return;
      }
      if (roll?.animationSeed && roll.animationSeed === lastDiceRollSeedRef.current) {
        return;
      }
      lastDiceRollSeedRef.current = roll?.animationSeed || null;
      setDiceRoll(roll);
    },
    onForceMute: (userId, muted) => forcedMuteRef.current(userId, muted),
    onVoiceEvicted: () => {
      // The hub already removed this tab from the room; tear the call down
      // locally so the microphone and peer connections actually stop.
      voiceEvictedRef.current();
    },
    onVoiceMove: (channelId) => voiceMoveRef.current(channelId),
    onDmCall: (payload) => onDmCallRef.current?.(payload),
  });

  const voice = useVoice({
    connectionId: hub.connectionId,
    rooms: hub.voice,
    send: hub.send,
  });
  voiceSignalRef.current = voice.handleSignal;
  voiceChannelRef.current = voice.channelId;
  voiceEvictedRef.current = () => {
    if (!voice.channelId) return;
    voice.leave();
    setStageChannelId(null);
    setNotice("You joined this voice room from another tab or device.");
  };
  voiceMoveRef.current = (channelId) => {
    // A moderator moved us: open that room's stage and actually join it, which
    // renegotiates WebRTC with the new set of people.
    setStageChannelId(channelId);
    void voice.join(channelId);
    const name = voiceChannels.find((channel) => channel.id === channelId)?.name;
    setNotice(name ? `You were moved to ${name}.` : "You were moved to another voice channel.");
  };
  // Native apps: mirror the call into the Android notification + bubble or
  // the iOS call UI, and take Mute / Deafen / Leave presses back from them.
  useMobileShell({
    navOpen: mobileNav,
    membersOpen,
    setNavOpen: setMobileNav,
    setMembersOpen,
  });
  const nativeInVoiceRef = useRef(false);
  // Android app: phone notifications via Firebase once you're signed in.
  const signedInId = user?.id;
  useEffect(() => {
    if (signedInId) void registerNativePush();
  }, [signedInId]);
  const voiceChannelName = voice.channelId
    ? voiceChannels.find((channel) => channel.id === voice.channelId)?.name ||
      dms.find((dm) => dm.channelId === voice.channelId)?.user.displayName ||
      "Voice call"
    : null;
  useEffect(() => {
    syncNativeVoice(
      voiceChannelName
        ? { channelName: voiceChannelName, muted: voice.muted, deafened: voice.deafened }
        : null,
      nativeInVoiceRef.current,
    );
    nativeInVoiceRef.current = Boolean(voiceChannelName);
  }, [voiceChannelName, voice.muted, voice.deafened]);
  const nativeVoiceActionsRef = useRef(voice);
  nativeVoiceActionsRef.current = voice;
  useEffect(
    () =>
      onNativeVoiceAction((action) => {
        const current = nativeVoiceActionsRef.current;
        if (action === "mute") current.toggleMute();
        else if (action === "deafen") current.toggleDeafen();
        else if (action === "disconnect") current.leave();
      }),
    [],
  );
  // First voice join in the Android app: offer the floating bubble once.
  useEffect(() => {
    if (!voice.channelId) return;
    let asked = false;
    try {
      asked = window.localStorage.getItem("huddle-bubble-asked") === "1";
    } catch {
      // Storage blocked: ask this session.
    }
    if (asked) return;
    void canShowVoiceBubble().then((granted) => {
      if (granted) return;
      try {
        window.localStorage.setItem("huddle-bubble-asked", "1");
      } catch {
        // ignore
      }
      showCustomConfirm({
        title: "Show voice controls over other apps?",
        message:
          "While you're in voice, a small Huddle bubble floats over other apps so you can mute or leave without switching back. Android will ask you to allow \"Display over other apps\".",
        confirmText: "Allow",
        cancelText: "Not now",
        onConfirm: requestVoiceBubblePermission,
      });
    });
    // showCustomConfirm is recreated each render; only a new join should ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.channelId]);

  forcedMuteRef.current = (userId, muted) => {
    if (user && userId === user.id) voice.setForcedMute(muted);
  };

  /**
   * Voice rooms with each person's current name (server nickname included)
   * and avatar. The hub only knows what they had when their socket connected.
   */
  const voiceRooms = useMemo(() => {
    const rooms: typeof hub.voice = {};
    for (const [channelId, people] of Object.entries(hub.voice)) {
      rooms[channelId] = people.map((person) => {
        const member = membersById.get(person.id);
        return member
          ? {
              ...person,
              displayName: member.displayName,
              avatar: member.avatar,
              avatarUrl: member.avatarUrl ?? null,
              color: member.color,
            }
          : person;
      });
    }
    return rooms;
  }, [hub.voice, membersById]);

  const voiceParticipants = useMemo(
    () => (voice.channelId ? voiceRooms[voice.channelId] || [] : []),
    [voiceRooms, voice.channelId],
  );

  /** When the person in the open member menu took their voice seat, if any. */
  const userMenuVoiceJoinedAt = useMemo(() => {
    if (!userMenu) return null;
    for (const people of Object.values(voiceRooms)) {
      const person = people.find((entry) => entry.id === userMenu.member.id);
      if (person) return person.joinedAt;
    }
    return null;
  }, [userMenu, voiceRooms]);

  // Leaving voice (Disconnect) closes the stage and returns to the text channel.
  useEffect(() => {
    if (!voice.channelId) {
      setStageChannelId(null);
      setQuickSoundboardOpen(false);
    }
  }, [voice.channelId]);

  // Adopt the stored presence once the member list arrives.
  useEffect(() => {
    if (!user) return;
    const me = membersById.get(user.id);
    if (!me) return;
    setMyStatus((current) =>
      current === "online" && me.status ? (me.status as PresenceStatus) : current,
    );
    setMyCustomStatus((current) => current ?? me.customStatus ?? null);
  }, [user, membersById]);

  // Auto-idle: go idle after 10 minutes without input, and come back on
  // activity — but never override a status you picked yourself.
  useEffect(() => {
    if (!user) return;
    let timer = 0;
    const goIdle = () => {
      if (myStatus !== "online") return;
      autoIdleRef.current = true;
      void savePresence({ status: "idle" });
    };
    const bump = () => {
      window.clearTimeout(timer);
      if (autoIdleRef.current && myStatus === "idle") {
        autoIdleRef.current = false;
        void savePresence({ status: "online" });
      }
      timer = window.setTimeout(goIdle, 10 * 60 * 1000);
    };
    bump();
    for (const type of ["pointerdown", "keydown", "focus"]) {
      window.addEventListener(type, bump);
    }
    return () => {
      window.clearTimeout(timer);
      for (const type of ["pointerdown", "keydown", "focus"]) {
        window.removeEventListener(type, bump);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, myStatus]);

  // Who is banned here, so the member menu can offer Unban. Only people who
  // can manage the server may read the list, so failures are silent.
  useEffect(() => {
    if (!user || !activeServerId || activeServerId === DM_HOME || !canManageServer) {
      setBannedIds(new Set());
      return;
    }
    let cancelled = false;
    apiFetch<{ bans: Array<{ userId: string }> }>(
      `/api/bans?serverId=${encodeURIComponent(activeServerId)}`,
    )
      .then((data) => {
        if (!cancelled) {
          setBannedIds(new Set((data.bans || []).map((ban) => ban.userId)));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, activeServerId, canManageServer]);

  // The activity surface is persisted per voice room, just like the map.
  useEffect(() => {
    if (!stageChannelId) {
      setRoomActivity(null);
      return;
    }
    let cancelled = false;
    apiFetch<{ activity: RoomActivity | null }>(
      `/api/activities?channelId=${encodeURIComponent(stageChannelId)}`,
    )
      .then((data) => {
        if (!cancelled) setRoomActivity(data.activity);
      })
      .catch(() => {
        if (!cancelled) setRoomActivity(null);
      });
    return () => {
      cancelled = true;
    };
  }, [stageChannelId]);

  // Typing indicators fade out on their own a few seconds after the last keypress.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 6000;
      setTyping((current) => {
        let changed = false;
        const next: typeof current = {};
        for (const [channelId, people] of Object.entries(current)) {
          const live: Record<string, { name: string; at: number }> = {};
          for (const [userId, entry] of Object.entries(people)) {
            if (entry.at > cutoff) live[userId] = entry;
            else changed = true;
          }
          if (Object.keys(live).length) next[channelId] = live;
        }
        return changed ? next : current;
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  /** The status to show for a member: offline unless their socket is up. */
  function presenceOf(member: Member): PresenceStatus | "offline" {
    const own = member.id === user?.id;
    const status = (own ? myStatus : member.status) || "online";
    if (status === "invisible") return own ? "invisible" : "offline";
    return hub.online.has(member.id) ? status : "offline";
  }

  async function savePresence(patch: {
    status?: PresenceStatus;
    customStatus?: string | null;
  }) {
    if (patch.status) setMyStatus(patch.status);
    if (patch.customStatus !== undefined) setMyCustomStatus(patch.customStatus);
    await apiFetch("/api/settings/presence", {
      method: "POST",
      body: JSON.stringify(patch),
    }).catch(() => undefined);
  }

  /** Display names of everyone typing in the channel you are looking at. */
  const typingNames = Object.entries(typing[activeChannelId || ""] || {})
    .filter(([userId]) => userId !== user?.id)
    .map(([userId, entry]) => stripTextStyle(membersById.get(userId)?.displayName || entry.name));

  /** Tells the room you are typing, at most once every few seconds. */
  function noteTyping() {
    const now = Date.now();
    if (!activeChannelId || now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    hub.send({ t: "typing", channelId: activeChannelId });
  }

  /**
   * Clicking anywhere outside an open dropdown closes it, instead of only its
   * own button doing so. Each entry lists the menu and the button(s) that open
   * it: a click on either is "inside", so the button still toggles normally.
   * Right-click menus have their own full-screen backdrop and aren't listed.
   */
  useEffect(() => {
    const popovers: Array<[boolean, string, () => void]> = [
      [serverMenuOpen, '.server-menu-dropdown, [aria-label="Server settings"]', () => setServerMenuOpen(false)],
      // The server menu's "Create Channel" opens this one, so it counts as inside.
      [kindMenu !== null, ".channel-kind-picker, .server-menu-dropdown", () => setKindMenu(null)],
      [statusOpen, ".status-menu, .user-footer-profile, .profile-dot", () => setStatusOpen(false)],
      [quickSoundboardOpen, ".soundboard-quick-popover, .mini-voice-btn", () => setQuickSoundboardOpen(false)],
      [emojiOpen, ".discord-emoji-picker, .popover-picker, .composer-emoji-btn, .msn-format-shell", () => setEmojiOpen(false)],
      [gifOpen, ".gif-picker, .gif-button, .msn-format-shell", () => setGifOpen(false)],
      [formatOpen, ".text-style-menu, .composer-format-btn", () => setFormatOpen(false)],
      [gamesOpen, ".games-picker, .composer-games-btn", () => setGamesOpen(false)],
      [mentionsOpen, '.mentions-panel, [aria-label="Mentions"]', () => setMentionsOpen(false)],
      [pinsOpen, '.pins-panel:not(.mentions-panel), [aria-label="Pinned messages"]', () => setPinsOpen(false)],
    ];
    const open = popovers.filter(([isOpen]) => isOpen);
    if (!open.length) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      // A dialog opened from a menu (confirm, prompt) sits outside it; leave be.
      if (!target?.isConnected || target.closest('[role="dialog"]:not(.popover-picker)')) return;
      for (const [, inside, close] of open) {
        if (!target.closest(inside)) close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [serverMenuOpen, kindMenu, statusOpen, quickSoundboardOpen, emojiOpen, gifOpen, formatOpen, mentionsOpen, pinsOpen]);

  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [profileCardTarget, setProfileCardTarget] = useState<{ member: Member; pos?: { x: number; y: number } } | null>(null);

  useActivityDetector({
    user,
    onUpdateSpotify: (spotifyAct) => {
      if (!user) return;
      // Only the member roster/profile card needs this — updating root `user`
      // state would re-render the entire shell on every poll. The activity
      // detector already dedupes to song changes.
      setMembers((prev) =>
        prev.map((m) => (m.id === user.id ? { ...m, spotifyActivity: spotifyAct } : m)),
      );
    },
  });

  const activeSlashCommand = useMemo(() => {
    if (!draft.startsWith("/")) return undefined;
    const command = findCommand(draft);
    if (command && command.name === "record" && !features.recordSessions) {
      return undefined;
    }
    return command;
  }, [draft, features.recordSessions]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen((o) => !o);
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === "/") ||
        (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName))
      ) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc closes the image lightbox. (KeyboardEvent here is React's type, so the
  // DOM one needs qualifying.)
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightbox(null);
      } else if (event.key === "ArrowLeft") {
        setLightbox((prev) =>
          prev && prev.images.length > 1
            ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }
            : prev,
        );
      } else if (event.key === "ArrowRight") {
        setLightbox((prev) =>
          prev && prev.images.length > 1
            ? { ...prev, index: (prev.index + 1) % prev.images.length }
            : prev,
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  // Desktop shell: the global mute hotkey arrives as a DOM event.
  useEffect(() => {
    const onHotkey = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      if (action === "toggle-mute" && voice.channelId) voice.toggleMute();
    };
    window.addEventListener("huddle-hotkey", onHotkey);
    return () => window.removeEventListener("huddle-hotkey", onHotkey);
  }, [voice.channelId, voice.toggleMute]);

  // Desktop shell: keep its global mute shortcut in step with the setting, so
  // the same combo works when the window is not focused.
  useEffect(() => {
    (
      window as unknown as {
        huddle?: { setMuteHotkey?: (accelerator: string) => void };
      }
    ).huddle?.setMuteHotkey?.(comboToAccelerator(voice.muteKey));
  }, [voice.muteKey]);

  const unreadMentionTotal = useMemo(
    () => Object.values(unread).reduce((sum, entry) => sum + (entry.mentions || 0), 0),
    [unread],
  );

  // Desktop shell: reflect the unread mention count on the dock/taskbar badge.
  useEffect(() => {
    (
      window as unknown as { huddle?: { setBadge?: (n: number) => void } }
    ).huddle?.setBadge?.(unreadMentionTotal);
  }, [unreadMentionTotal]);

  // The mentions inbox refetches when opened and whenever a new mention lands.
  useEffect(() => {
    if (!mentionsOpen) return;
    let cancelled = false;
    void apiFetch<{ mentions: MentionEntry[] }>("/api/mentions")
      .then((data) => {
        if (!cancelled) setMentionInbox(data.mentions || []);
      })
      .catch(() => {
        if (!cancelled) setMentionInbox([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionsOpen, unreadMentionTotal]);

  /** MSN Today: opens by itself once a day in the MSN theme, or from the status menu. */
  const [todayOpen, setTodayOpen] = useState(false);
  const todayCheckedRef = useRef(false);
  useEffect(() => {
    if (!msnTheme || !user || !hub.connected || !servers.length || todayCheckedRef.current) return;
    todayCheckedRef.current = true;
    // Let presence settle so "contacts online" isn't empty.
    const timer = window.setTimeout(() => {
      if (shouldShowMsnToday()) setTodayOpen(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [msnTheme, user, hub.connected, servers.length]);

  /** Everything MSN Today shows, built only while it's open. */
  const todayData = useMemo(() => {
    if (!todayOpen || !user) return null;
    const channelInfo = new Map<string, { serverId: string; serverName: string; name: string }>();
    for (const server of servers) {
      for (const channel of server.channels) {
        channelInfo.set(channel.id, { serverId: server.id, serverName: server.name, name: channel.name });
      }
    }
    const goTo = (serverId: string, channelId: string) => {
      setTodayOpen(false);
      setActiveServerId(serverId);
      setStageChannelId(null);
      setActiveChannelId(channelId);
    };
    const people = new Map<string, { id: string; name: string; avatar: string; avatarUrl?: string | null; color: string }>();
    for (const person of [...dms.filter((dm) => !dm.group).map((dm) => dm.user), ...members]) {
      if (person.id === user.id || !hub.online.has(person.id) || people.has(person.id)) continue;
      people.set(person.id, { ...person, name: person.displayName });
    }
    const waiting = Object.entries(unread)
      .filter(([, entry]) => entry.count > 0)
      .flatMap(([channelId, entry]) => {
        const dm = dms.find((d) => d.channelId === channelId);
        const info = channelInfo.get(channelId);
        if (!dm && !info) return [];
        return [
          {
            key: channelId,
            label: dm ? stripTextStyle(dm.user.displayName) : `#${info!.name} in ${info!.serverName}`,
            count: entry.count,
            mentions: entry.mentions,
            open: () => goTo(dm ? DM_HOME : info!.serverId, channelId),
          },
        ];
      })
      .sort((a, b) => b.mentions - a.mentions || b.count - a.count);
    const playing = Object.entries(hub.players).flatMap(([channelId, player]) => {
      const info = channelInfo.get(channelId);
      if (!player?.track || player.paused || !info) return [];
      return [
        {
          room: info.name,
          title: player.track.title,
          artist: player.track.artist,
          open: () => {
            setTodayOpen(false);
            setActiveServerId(info.serverId);
            setStageChannelId(channelId);
          },
        },
      ];
    });
    return { online: [...people.values()], waiting, playing, channelInfo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayOpen, user, servers, dms, members, hub.online, hub.players, unread]);

  /** Opens the channel (server or DM) a mention came from, scrolled to it. */
  function openMention(entry: MentionEntry) {
    setMentionsOpen(false);
    setActiveServerId(entry.serverId || DM_HOME);
    if (entry.message.channelId) jumpToMessage(entry.message.channelId, String(entry.message.id));
  }

  const roomPlayer: PlayerState | null = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;

  /**
   * MSN's "Show what I'm listening to": while it's on, your status line
   * follows the song playing in your voice room ("♫ Title - Artist") and goes
   * back to what it was when the music stops.
   */
  const [shareListening, setShareListening] = useState(false);
  useEffect(() => {
    try {
      setShareListening(window.localStorage.getItem("huddle-msn-listening") === "1");
    } catch {
      // Storage blocked: stays off.
    }
  }, []);
  const statusBeforeMusic = useRef<string | null | undefined>(undefined);
  const listeningTo =
    msnTheme && shareListening && roomPlayer?.track && !roomPlayer.paused
      ? `♫ ${roomPlayer.track.title}${roomPlayer.track.artist ? ` - ${roomPlayer.track.artist}` : ""}`.slice(0, 80)
      : null;
  useEffect(() => {
    if (!user) return;
    // Settle first, so a skip or a quick pause doesn't write twice.
    const timer = window.setTimeout(() => {
      if (listeningTo) {
        if (myCustomStatus === listeningTo) return;
        if (statusBeforeMusic.current === undefined) {
          statusBeforeMusic.current = myCustomStatus?.startsWith("♫ ") ? null : myCustomStatus;
        }
        void savePresence({ customStatus: listeningTo });
      } else if (statusBeforeMusic.current !== undefined) {
        const previous = statusBeforeMusic.current;
        statusBeforeMusic.current = undefined;
        if (myCustomStatus?.startsWith("♫ ")) void savePresence({ customStatus: previous });
      }
    }, 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningTo, user?.id]);
  const botStreaming = voiceParticipants.some(
    (participant) => participant.bot,
  );

  const musicBotPref = prefFor("bot:music");
  const player = usePlayer({
    state: roomPlayer,
    streamed: botStreaming,
    serverNow: hub.serverNow,
    deafened: voice.deafened,
    personalVolume: musicBotPref.volume,
    personalMuted: musicBotPref.muted,
    onEnded: (trackId) => {
      if (!voice.channelId) return;
      hub.send({
        t: "player",
        channelId: voice.channelId,
        action: { name: "ended", trackId },
      });
    },
  });

  // --------------------------------------------------------------- data

  useEffect(() => {
    if (!user || !activeChannelId) {
      setMessages([]);
      setMessagesLoadedFor(null);
      return;
    }
    let cancelled = false;
    setMessages([]);
    setMessagesLoadedFor(null);
    apiFetch<{ messages: Message[] }>(
      `/api/messages?channelId=${encodeURIComponent(activeChannelId)}`,
    )
      .then((data) => {
        if (!cancelled) {
          setMessages(data.messages);
          setMessagesLoadedFor(activeChannelId);
        }
      })
      .catch(() => undefined);
    void refreshPins(activeChannelId);
    hub.send({ t: "subscribe", channelId: activeChannelId });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeChannelId, hub.connected]);

  useLayoutEffect(() => {
    if (!activeChannelId || messagesLoadedFor !== activeChannelId) return;
    const initial = initialChannelScrollRef.current;
    if (initial?.channelId === activeChannelId) {
      initialChannelScrollRef.current = null;
      if (initial.unreadCount > 0 && messages.length > 0) {
        const firstUnreadIndex = Math.max(
          0,
          messages.length - initial.unreadCount,
        );
        document
          .getElementById(`msg-${messages[firstUnreadIndex].id}`)
          ?.scrollIntoView({ behavior: "auto", block: "center" });
        return;
      }
      messageEndRef.current?.scrollIntoView({ behavior: "auto" });
      nearBottomRef.current = true;
      setUnseenCount(0);
      lastSeenTailRef.current = messages[messages.length - 1]?.id ?? null;
      return;
    }
    const tail = messages[messages.length - 1];
    const tailChanged = (tail?.id ?? null) !== lastSeenTailRef.current;
    if (nearBottomRef.current || (tailChanged && tail && user && tail.userId === user.id)) {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
      nearBottomRef.current = true;
      setUnseenCount(0);
      lastSeenTailRef.current = tail?.id ?? null;
    } else if (tailChanged && tail) {
      const lastIdx = messages.findIndex((m) => m.id === lastSeenTailRef.current);
      setUnseenCount(lastIdx >= 0 ? messages.length - 1 - lastIdx : (n) => n + 1);
      lastSeenTailRef.current = tail.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelId, messages, messagesLoadedFor]);

  useEffect(() => {
    nearBottomRef.current = true;
    setShowJumpLatest(false);
    setUnseenCount(0);
  }, [activeChannelId]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < 120;
    nearBottomRef.current = near;
    if (near) setUnseenCount(0);
    setShowJumpLatest(distance > Math.max(300, el.clientHeight * 0.6));
  }, []);

  const jumpToLatest = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    nearBottomRef.current = true;
    setUnseenCount(0);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Very long jumps would take ages to animate; snap most of the way first.
    if (!reduce && el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight * 4) {
      el.scrollTop = el.scrollHeight - el.clientHeight * 2;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("huddle-theme");
    const preferred: "cozy" | "legacy" | "light" =
      saved === "legacy" ? "legacy" : saved === "light" ? "light" : "cozy";
    const root = document.documentElement;
    root.dataset.theme = preferred;
    root.dataset.density =
      window.localStorage.getItem("huddle-density") || "cozy";
    root.dataset.backdrop =
      ["plain", "aurora", "dots"].includes(
        window.localStorage.getItem("huddle-backdrop") || "",
      )
        ? window.localStorage.getItem("huddle-backdrop")!
        : "plain";
    root.dataset.motion =
      window.localStorage.getItem("huddle-motion") || "full";
    root.dataset.cute =
      window.localStorage.getItem("huddle-cute") === "on" ? "on" : "off";
    const prideTheme = window.localStorage.getItem("huddle-pride-theme");
    root.dataset.prideTheme = ["trans", "pride", "nonbinary"].includes(
      prideTheme || "",
    )
      ? prideTheme!
      : "off";
    root.dataset.blahaj =
      window.localStorage.getItem("huddle-blahaj") === "on" ? "on" : "off";
    root.style.setProperty(
      "--lavender",
      window.localStorage.getItem("huddle-accent") || "#9d8cf5",
    );
    root.style.setProperty(
      "--ui-corners",
      `${Number(window.localStorage.getItem("huddle-corners")) || 16}px`,
    );

    // Apply client-side custom UI CSS if enabled
    applyClientUiCss();
    const activeThemeId = getActiveThemeId();
    const activeTheme = findThemeById(activeThemeId);
    if (activeTheme) {
      applyThemeToDocument(activeTheme);
      setTheme(activeTheme.baseTheme);
    } else {
      const frame = window.requestAnimationFrame(() => setTheme(preferred));
      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/integrations/musicwatch"))
      .then(
        (response) =>
          response.json() as Promise<{ online?: boolean; dashboardUrl?: string }>,
      )
      .then((data) => {
        setMusicWatchOnline(Boolean(data.online));
        setMusicDashboardUrl(data.dashboardUrl || null);
      })
      .catch(() => setMusicWatchOnline(false));

    fetch(apiUrl("/api/integrations/dnd"))
      .then(
        (response) =>
          response.json() as Promise<{ online?: boolean; appUrl?: string }>,
      )
      .then((data) => {
        setDndOnline(Boolean(data.online));
        setDndUrl(data.appUrl || null);
      })
      .catch(() => setDndOnline(false));
  }, [user]);

  // ------------------------------------------------------------- actions

  function applyTheme(next: "cozy" | "legacy" | "light" | Theme) {
    if (typeof next === "string") {
      setTheme(next);
      const th = findThemeById(next);
      if (th) {
        applyThemeToDocument(th);
      } else {
        document.documentElement.dataset.theme = next;
        window.localStorage.setItem("huddle-theme", next);
      }
    } else {
      setTheme(next.baseTheme);
      applyThemeToDocument(next);
    }
  }

  /**
   * Wraps the composer selection in `open` … `close` (bold, colours, fonts,
   * effects). With nothing selected the tags land at the caret with the caret
   * between them, ready to type into.
   */
  function wrapSelection(open: string, close: string) {
    const box = composerRef.current;
    if (!box) return;
    const current = box.value;
    const start = box.selectionStart ?? current.length;
    const end = box.selectionEnd ?? start;
    const next = `${current.slice(0, start)}${open}${current.slice(start, end)}${close}${current.slice(end)}`;
    setDraft(next);
    window.requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(start + open.length, end + open.length);
    });
  }

  /**
   * The newest game invitation waiting for you in this conversation, shown
   * the Messenger way: a bar across the top with Accept (Alt+C) / Decline (Alt+D).
   */
  const pendingInvite = useMemo(() => {
    if (!msnTheme || !user) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      const game = message.kind === "game" ? message.payload?.game : undefined;
      if (!game || game.status !== "waiting") continue;
      if (game.players[0].id === user.id || (game.invitee && game.invitee !== user.id)) continue;
      return { id: String(message.id), game };
    }
    return null;
  }, [msnTheme, user, messages]);
  const answerInvite = useCallback(async (action: "join" | "decline") => {
    if (!pendingInvite) return;
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ action, messageId: pendingInvite.id }),
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't answer the invitation.");
    }
  }, [pendingInvite]);
  useEffect(() => {
    if (!pendingInvite) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "c" || key === "d") {
        event.preventDefault();
        void answerInvite(key === "c" ? "join" : "decline");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingInvite, answerInvite]);

  /** Sends a game invitation into this conversation (MSN's Games menu, /game). */
  async function startGame(kind: GameKind, solo = false) {
    if (!activeChannelId) return;
    try {
      await apiFetch("/api/games", {
        method: "POST",
        body: JSON.stringify({ action: "start", channelId: activeChannelId, kind, solo }),
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't start the game.");
    }
  }

  async function sendWink(id: string) {
    const wink = findWink(id);
    if (!activeChannelId || !wink) return;
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelId,
          content: `sent a wink: ${wink.emoji} ${wink.name}`,
          payload: { wink: wink.id },
        }),
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't send the wink.");
    }
  }

  async function sendNudge() {
    if (!activeChannelId || nudgeCooling) return;
    setNudgeCooling(true);
    window.setTimeout(() => setNudgeCooling(false), 10_000);
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelId,
          content: "sent a nudge!",
          payload: { nudge: true },
        }),
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't send the nudge.");
    }
  }

  const handleShareThemeToChat = useCallback(
    async (themeToShare: Theme) => {
      if (!activeChannelRef.current) return;
      try {
        const code = exportThemeCode(themeToShare);
        await apiFetch("/api/messages", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelRef.current,
            content: `🎨 Shared a theme: **${themeToShare.name}**\n${code}`,
            payload: {
              themeShare: themeToShare,
            },
          }),
        });
      } catch (err) {
        console.error("Failed to share theme to chat:", err);
      }
    },
    [],
  );

  const postBotMessage = useCallback(
    async (text: string, options?: Partial<Message>) => {
      if (!activeChannelRef.current) return;
      // The first bot reply after a command carries the invocation header.
      const invocation = pendingCommandRef.current;
      pendingCommandRef.current = null;
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelRef.current,
          content: text,
          asBot: true,
          botName: options?.author || "Music + Watch",
          botAvatar: options?.avatar || "♫",
          link: options?.link,
          actionLabel: options?.actionLabel,
          audio: options?.audio,
          kind: options?.kind,
          payload: options?.payload,
          commandText: options?.commandText || invocation?.text,
          commandBy: options?.commandBy || invocation?.by,
        }),
      }).catch(() => undefined);
    },
    [],
  );



  /**
   * Close a DM (hide it from the list) or bring it back. Nothing is deleted:
   * the conversation reopens from Cmd+K, or on its own when a message arrives.
   */
  async function setDmClosed(channelId: string, closed: boolean) {
    setDms((current) =>
      current.map((dm) => (dm.channelId === channelId ? { ...dm, hidden: closed } : dm)),
    );
    if (closed && activeChannelId === channelId && inDmHome) {
      const next = visibleDms.find((dm) => dm.channelId !== channelId);
      setActiveChannelId(next?.channelId || null);
      setStageChannelId(null);
    }
    try {
      const data = await apiFetch<{ conversations: DmSummary[] }>("/api/dms", {
        method: "PATCH",
        body: JSON.stringify({ channelId, hidden: closed }),
      });
      setDms(data.conversations);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not do that.");
      void loadDms().catch(() => undefined);
    }
  }

  async function openDm(targetId: string) {
    try {
      const data = await apiFetch<{
        channelId: string;
        conversations: DmSummary[];
      }>("/api/dms", {
        method: "POST",
        body: JSON.stringify({ userId: targetId }),
      });
      setDms(data.conversations);
      setActiveServerId(DM_HOME);
      setActiveChannelId(data.channelId);
      setMobileNav(false);
      composerRef.current?.focus();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open that.");
    }
  }

  /** Picking one friend opens your DM with them; two or more make a group. */
  async function createGroupDm(userIds: string[], name: string) {
    if (userIds.length === 1 && !name) {
      await openDm(userIds[0]);
      return;
    }
    const data = await apiFetch<{ channelId: string; conversations: DmSummary[] }>(
      "/api/dms/groups",
      { method: "POST", body: JSON.stringify({ userIds, name }) },
    );
    setDms(data.conversations);
    setActiveServerId(DM_HOME);
    setActiveChannelId(data.channelId);
    setStageChannelId(null);
    setMobileNav(false);
  }

  async function addToGroupDm(channelId: string, userIds: string[]) {
    const data = await apiFetch<{ conversations: DmSummary[] }>("/api/dms/groups", {
      method: "PATCH",
      body: JSON.stringify({ channelId, addUserIds: userIds }),
    });
    setDms(data.conversations);
  }

  function renameGroupDm(dm: DmSummary) {
    showCustomPrompt({
      title: "Rename group",
      message: "Leave it empty to name the group after its members.",
      defaultValue: dm.group?.name || "",
      placeholder: "Group name",
      confirmText: "Save",
      maxLength: 100,
      onConfirm: (value) => {
        void apiFetch<{ conversations: DmSummary[] }>("/api/dms/groups", {
          method: "PATCH",
          body: JSON.stringify({ channelId: dm.channelId, name: value || "" }),
        })
          .then((data) => setDms(data.conversations))
          .catch((error) =>
            setNotice(error instanceof Error ? error.message : "Could not rename it."),
          );
      },
    });
  }

  function removeFromGroupDm(dm: DmSummary, member: { id: string; displayName: string }) {
    showCustomConfirm({
      title: `Remove ${member.displayName}`,
      message: `Remove ${member.displayName} from ${dm.user.displayName}? They will lose access to its messages.`,
      isDanger: true,
      confirmText: "Remove",
      onConfirm: () => {
        void apiFetch<{ conversations: DmSummary[] }>("/api/dms/groups", {
          method: "DELETE",
          body: JSON.stringify({ channelId: dm.channelId, userId: member.id }),
        })
          .then((data) => setDms(data.conversations))
          .catch((error) =>
            setNotice(error instanceof Error ? error.message : "Could not remove them."),
          );
      },
    });
  }

  function leaveGroupDm(dm: DmSummary) {
    showCustomConfirm({
      title: `Leave '${dm.user.displayName}'`,
      message:
        "Are you sure you want to leave? You won't be able to rejoin unless someone adds you back.",
      isDanger: true,
      confirmText: "Leave Group",
      onConfirm: () => {
        void apiFetch<{ conversations: DmSummary[] }>("/api/dms/groups", {
          method: "DELETE",
          body: JSON.stringify({ channelId: dm.channelId }),
        })
          .then((data) => {
            setDms(data.conversations);
            if (activeChannelId === dm.channelId) {
              setActiveChannelId(null);
              setStageChannelId(null);
            }
          })
          .catch((error) =>
            setNotice(error instanceof Error ? error.message : "Could not leave it."),
          );
      },
    });
  }

  async function deleteMessage(id: string | number) {
    try {
      await apiFetch(`/api/messages/${id}`, { method: "DELETE" });
      setMessages((current) => current.filter((message) => message.id !== id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete it.");
    }
  }

  async function togglePin(message: Message) {
    try {
      const data = await apiFetch<{ pinned: boolean }>(
        `/api/messages/${message.id}`,
        { method: "PATCH", body: JSON.stringify({ pinned: !message.pinned }) },
      );
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, pinned: data.pinned } : item,
        ),
      );
      if (activeChannelId) void refreshPins(activeChannelId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not pin it.");
    }
  }

  async function saveVoicePref(
    targetId: string,
    patch: { volume?: number; muted?: boolean; serverMuted?: boolean },
  ) {
    if (patch.volume !== undefined || patch.muted !== undefined) {
      setVoicePrefs((current) => ({
        ...current,
        [targetId]: {
          volume: patch.volume ?? current[targetId]?.volume ?? 100,
          muted: patch.muted ?? current[targetId]?.muted ?? false,
        },
      }));
    }
    await apiFetch("/api/voice/prefs", {
      method: "POST",
      body: JSON.stringify({ targetId, ...patch }),
    }).catch((error: Error) => setNotice(error.message));
  }

  async function moderateMember(
    userId: string,
    action: "kick" | "ban" | "unban",
  ) {
    if (!activeServerId || activeServerId === DM_HOME) return;
    const verb =
      action === "ban" ? "Ban" : action === "unban" ? "Unban" : "Kick";
    showCustomConfirm({
      title: `${verb} Member?`,
      message:
        action === "unban"
          ? "They will be able to read and post here again."
          : `Are you sure you want to ${action} this member from the server?`,
      isDanger: action !== "unban",
      confirmText: `${verb} Member`,
      onConfirm: async () => {
        try {
          await apiFetch(`/api/members/${userId}`, {
            method: "POST",
            body: JSON.stringify({ serverId: activeServerId, action }),
          });
          setBannedIds((current) => {
            const next = new Set(current);
            if (action === "ban") next.add(userId);
            else if (action === "unban") next.delete(userId);
            return next;
          });
          setNotice(
            action === "unban"
              ? "Unbanned · they can post here again."
              : `${verb === "Ban" ? "Banned" : "Kicked"} · roles cleared.`,
          );
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not do that.");
        }
      },
    });
  }

  /** Set or clear someone's nickname in the active server (yours, or theirs with permission). */
  function editNickname(userId: string) {
    if (!activeServerId || activeServerId === DM_HOME) return;
    const serverId = activeServerId;
    const member = membersById.get(userId);
    const self = userId === user?.id;
    showCustomPrompt({
      title: self ? "Change your nickname" : `Nickname for ${member?.globalName || member?.displayName || "member"}`,
      message: "Only shown in this server. Leave it empty to use the account name.",
      defaultValue: member?.nickname || "",
      placeholder: member?.globalName || member?.displayName || "",
      confirmText: "Save",
      maxLength: 32,
      onConfirm: async (value) => {
        const nickname = (value || "").trim() || null;
        try {
          await apiFetch(`/api/members/${userId}`, {
            method: "PATCH",
            body: JSON.stringify({ serverId, nickname }),
          });
          setMembers((prev) =>
            prev.map((m) =>
              m.id === userId
                ? { ...m, nickname, displayName: nickname || m.globalName || m.displayName }
                : m,
            ),
          );
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not change that nickname.");
        }
      },
    });
  }

  /** Moderator action: time a member out of the active server (0 lifts it). */
  async function timeoutMember(userId: string, minutes: number) {
    if (!activeServerId || activeServerId === DM_HOME) return;
    try {
      const result = await apiFetch<{ timeoutUntil: string | null }>(`/api/members/${userId}`, {
        method: "POST",
        body: JSON.stringify({ serverId: activeServerId, action: "timeout", minutes }),
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, timeoutUntil: result.timeoutUntil } : m)),
      );
      setNotice(
        result.timeoutUntil
          ? `Timed out until ${formatClientDateTime(result.timeoutUntil)}.`
          : "Timeout lifted.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not do that.");
    }
  }

  /** Moderator action: move a member into another voice channel. */
  async function moveMember(userId: string, channelId: string) {
    try {
      await apiFetch("/api/voice/move", {
        method: "POST",
        body: JSON.stringify({ userId, channelId }),
      });
      const name = voiceChannels.find((channel) => channel.id === channelId)?.name;
      setNotice(name ? `Moved them to ${name}.` : "Moved them.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not move them.");
    }
  }

  /** A button or select on a bot's message: becomes a component interaction. */
  async function pressBotComponent(
    message: Message,
    customId: string,
    componentType: number,
    values?: string[],
  ) {
    const channelId = message.channelId || activeChannelId;
    if (!channelId) return;
    try {
      const result = await apiFetch<{ ok: boolean; reason: string | null }>(
        "/api/commands/component",
        {
          method: "POST",
          body: JSON.stringify({
            channelId,
            messageId: String(message.id),
            customId,
            componentType,
            values,
          }),
        },
      );
      if (!result.ok) {
        setNotice(
          result.reason === "offline"
            ? "That bot is not connected right now."
            : "That button no longer does anything.",
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The bot didn't respond.");
    }
  }

  /**
   * Opens the music dashboard (or its DJ booth) scoped to one voice room
   * with no password, like Discord's /web. The tab opens before the request
   * so the browser still counts it as a click; if it is blocked the link is
   * posted instead.
   */
  async function openMusicDashboard(page?: "dj") {
    const label = page === "dj" ? "DJ booth" : "music dashboard";
    const voiceChannelId =
      voice.channelId ||
      voiceChannels.find((channel) => hub.players[channel.id]?.track)?.id ||
      voiceChannels[0]?.id;
    if (!voiceChannelId) {
      setNotice("This server does not have a voice room yet.");
      return;
    }
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { url } = await apiFetch<{ url: string }>(
        "/api/integrations/musicwatch/web-link",
        { method: "POST", body: JSON.stringify({ voiceChannelId, page }) },
      );
      if (tab) {
        tab.location.href = url;
        pendingCommandRef.current = null;
      } else {
        await postBotMessage(
          `Here's the ${label} for this voice room.`,
          { link: url, actionLabel: `Open ${label}` },
        );
      }
    } catch (error) {
      tab?.close();
      setNotice(
        error instanceof Error && error.message
          ? `Couldn't open the ${label}: ${error.message}`
          : "The music server looks offline. Start it first, then try again.",
      );
    }
  }

  async function runCommand(raw: string) {
    const [rawName, ...parts] = raw.trim().split(/\s+/);
    const bare = rawName.replace(/^\//, "").toLowerCase();
    const name = COMMAND_ALIASES[bare] || bare;
    const value = parts.join(" ").trim();

    // Remember who ran what, so the bot's reply can show it instead of us
    // posting the raw slash text as its own message.
    pendingCommandRef.current = user
      ? { text: raw.trim().slice(0, 200), by: user.displayName }
      : null;

    if (name === "markdown") {
      setMarkdownModalOpen((prev) => !prev);
      setNotice("Markdown enabled! Use ```cpp for code blocks, **bold**, *italic*.");
      return;
    }

    // /game tictactoe | connect4 | rps | mines | rota [solo]
    if (name === "game") {
      const [pick = "", mode = ""] = value.split(/\s+/);
      const solo = /^(solo|alone|tek)$/i.test(mode);
      const aliases: Record<string, GameKind> = {
        ttt: "tictactoe",
        "tic-tac-toe": "tictactoe",
        four: "connect4",
        "connect-4": "connect4",
        minesweeper: "mines",
        flags: "mines",
        route: "rota",
        countries: "rota",
      };
      const kind = aliases[pick.toLowerCase()] ?? pick.toLowerCase();
      if (!isGameKind(kind)) {
        setNotice("Try: /game tictactoe, /game connect4, /game rps, /game mines or /game rota");
        return;
      }
      await startGame(kind, solo);
      return;
    }

    // /poll Question? | option | option
    if (name === "poll") {
      const [question, ...options] = value.split("|").map((part) => part.trim());
      if (!question || options.filter(Boolean).length < 2) {
        setNotice("Try: /poll Pizza or burger? | Pizza | Burger");
        return;
      }
      try {
        await apiFetch("/api/polls", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            question,
            options: options.filter(Boolean),
          }),
        });
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Could not create the poll.",
        );
      }
      return;
    }

    // /ask_gm belongs to the D&D bot; while it isn't connected here, the
    // built-in AI answers instead of a link to the companion.
    const gmFallback =
      name === "ask_gm" && !botCommands.some((command) => command.name === "ask_gm");
    if (name === "ask" || gmFallback) {
      // The server posts the answer itself (with the "/ask ..." header), so
      // nothing here should pick up the pending invocation.
      pendingCommandRef.current = null;
      if (!value) {
        setNotice("Try: /ask how do spell slots work? (start with web: to force a web search)");
        return;
      }
      if (!activeChannelId) return;
      setNotice("✦ Huddle AI is thinking…");
      try {
        await apiFetch("/api/ai/ask", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            question: gmFallback ? `noweb: As a D&D 5e Game Master: ${value}` : value,
          }),
        });
        setNotice("");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The AI did not answer.");
      }
      return;
    }

    if (name === "record") {
      if (!features.recordSessions) {
        setNotice("Session recording is disabled on this Huddle.");
        return;
      }
      if (!voice.channelId) {
        setNotice("Join the voice room you want to record first.");
        return;
      }
      const [subcommand = "status", ...rest] = value.split(/\s+/);
      const recording = hub.recordings[voice.channelId] || null;
      if (subcommand === "setup") {
        window.dispatchEvent(new CustomEvent("huddle-recording-setup"));
        setStageChannelId(voice.channelId);
        return;
      }
      if (subcommand === "status") {
        setNotice(
          recording
            ? `${recording.title}: ${recording.status.replace("-", " ")} · ${recording.consents.filter((entry) => entry.decision === "accepted").length}/${recording.consents.length} consented.`
            : "No recording is active in this room.",
        );
        return;
      }
      if (!recording) {
        setNotice("No recording is active. Use /record setup first.");
        return;
      }
      const action =
        subcommand === "start" ||
          subcommand === "pause" ||
          subcommand === "resume" ||
          subcommand === "stop"
          ? subcommand
          : subcommand === "marker"
            ? "marker"
            : subcommand === "scene"
              ? "scene"
              : null;
      if (!action) {
        setNotice(
          "Use /record setup, start, pause, resume, marker <name>, scene <scene>, stop, or status.",
        );
        return;
      }
      try {
        await apiFetch("/api/recordings", {
          method: "POST",
          body: JSON.stringify({
            action,
            sessionId: recording.id,
            ...(action === "marker"
              ? { name: rest.join(" ") || "Marker", kind: "chapter" }
              : {}),
            ...(action === "scene" ? { scene: rest[0] } : {}),
          }),
        });
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Recording command failed.",
        );
      }
      return;
    }

    if (MUSIC_COMMANDS.has(name)) {
      const requiresPresence = VOICE_REQUIRED_MUSIC_COMMANDS.has(name);
      if (requiresPresence && !voice.channelId) {
        setNotice(
          `Join a voice channel first to use /${name}. Room info, settings, stats and Wrapped work from anywhere.`,
        );
        return;
      }
      const targetVoiceChannelId =
        voice.channelId ||
        voiceChannels.find((channel) => hub.players[channel.id]?.track)?.id ||
        voiceChannels[0]?.id;
      if (!targetVoiceChannelId) {
        setNotice("This server does not have a voice room yet.");
        return;
      }
      // Keep the permanent media element unlocked when a playback command is
      // submitted from a user gesture.
      if (requiresPresence) player.prime();
      try {
        await apiFetch("/api/music/command", {
          method: "POST",
          body: JSON.stringify({
            command: `/${name} ${value}`.trim(),
            voiceChannelId: targetVoiceChannelId,
            textChannelId: activeChannelId,
            commandText: raw.trim().slice(0, 200),
            commandBy: user?.displayName,
          }),
        });
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "That music command failed.",
        );
      }
      return;
    }

    if (name === "join" && voice.channelId) {
      // In Huddle the bot has no idle seat: it joins the room by itself
      // whenever something plays and leaves when the queue ends.
      await postBotMessage(
        "I'll hop into this voice room as soon as something plays. Use `/play <song>` or play a playlist from `/web`.",
      );
      return;
    }

    if (DISCORD_ONLY_COMMANDS.has(name)) {
      // These drive the bot's Discord voice connection, not Huddle playback.
      try {
        const data = await apiFetch<{
          text?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/musicwatch/command",
          {
            method: "POST",
            body: JSON.stringify({ command: `/${name} ${value}`.trim() }),
          },
        );
        await postBotMessage(data.text || "Done on Discord.");
      } catch (error) {
        await postBotMessage(
          error instanceof Error
            ? error.message
            : "The Discord music bot could not do that.",
        );
      }
      return;
    }

    if (name === "watch" || name === "reels") {
      if (!voice.channelId) {
        await postBotMessage(
          "Join a Huddle voice room first so everyone there gets the same activity.",
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
                channelId: voice.channelId,
                action: "open",
                kind: "watch",
                state: {
                  url: data.url,
                  title: `${channelTitle} Watch Party`,
                },
              }),
            },
          );
          setRoomActivity(opened.activity);
          setStageChannelId(voice.channelId);
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

    if (name === "music" || name === "web") {
      await openMusicDashboard();
      return;
    }

    if (name === "dj") {
      await openMusicDashboard("dj");
      return;
    }

    if (name === "roll") {
      // Two-phase flow: the roller's 3D dice animation IS the source of truth.
      // 1. Ask the server to parse the command and return the dice structure.
      // 2. Roll the real dice locally; when they settle, submit the actual
      //    values so the server can total them and broadcast to everyone.
      try {
        const diceTheme =
          typeof window !== "undefined"
            ? window.localStorage.getItem("huddle_dice_theme") || "default"
            : "default";
        const diceColor =
          typeof window !== "undefined"
            ? window.localStorage.getItem("huddle_dice_color") || "#2563eb"
            : "#2563eb";

        const data = await apiFetch<{
          text?: string;
          kind?: string;
          payload?: Message["payload"];
          roll?: DiceRollEvent;
          error?: string;
        }>("/api/integrations/dnd/roll", {
          method: "POST",
          body: JSON.stringify({
            command: raw,
            theme: diceTheme,
            themeColor: diceColor,
            channelId: voice.channelId || undefined,
            textChannelId: activeChannelRef.current || undefined,
          }),
        });
        if (data.error) {
          await postBotMessage(data.error, {
            author: "D&D Bot",
            avatar: "⚔",
          });
          return;
        }
        if (data.roll) {
          lastDiceRollSeedRef.current = data.roll.animationSeed;
          setDiceRoll(data.roll);
        }
        await postBotMessage(data.text || "The roll succeeded.", {
          author: "D&D Bot",
          avatar: "⚔",
          kind: data.kind,
          payload: data.payload,
        });
      } catch (error) {
        await postBotMessage(
          error instanceof Error ? error.message : "The roll failed.",
          { author: "D&D Bot", avatar: "⚔" },
        );
      }
      return;
    }

    if (LOOKUP_COMMANDS.has(name)) {
      if (!value) {
        setNotice(`Try \`/${name} ${name === "spell" ? "fireball" : "goblin"}\`.`);
        return;
      }
      try {
        const data = await apiFetch<{
          text: string;
          link?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/dnd/lookup",
          { method: "POST", body: JSON.stringify({ kind: name, query: value }) },
        );
        await postBotMessage(data.text, {
          author: "D&D Bot",
          avatar: "⚔",
          link: data.link,
          actionLabel: data.link ? "Open on 5e.tools" : undefined,
          kind: data.kind,
          payload: data.payload,
        });
      } catch (error) {
        await postBotMessage(
          error instanceof Error ? error.message : "That lookup failed.",
          { author: "D&D Bot", avatar: "⚔" },
        );
      }
      return;
    }

    // A connected D&D bot (running on this Hoffle through the Discord
    // gateway) does these for real, so it wins over the link-out stub.
    if (DND_LINK_COMMANDS.has(name) && botCommands.some((command) => command.name === bare)) {
      if (await runBotSlashCommand(bare, value)) return;
    }

    if (DND_LINK_COMMANDS.has(name)) {
      await postBotMessage(
        dndOnline
          ? "Character sheets, inventory and the GM panel live in the D&D companion — open it here."
          : "The D&D companion looks offline right now.",
        {
          ...(dndUrl ? { link: dndUrl, actionLabel: "Open D&D companion" } : {}),
          author: "D&D Bot",
          avatar: "⚔",
        },
      );
      return;
    }

    if (name === "flip" || name === "coinflip") {
      await postBotMessage(Math.random() > 0.5 ? "Heads." : "Tails.");
      return;
    }

    if (name === "shrug") {
      await sendText("¯\\_(ツ)_/¯");
      return;
    }

    if (name === "help") {
      await postBotMessage(
        "Type / in the box to see every command with its arguments. Music commands need you to be in a voice channel; a few still run on Discord and say so.",
      );
      return;
    }

    // Last: a command a connected bot registered. The server tells us whether
    // it owns the name, so an unknown one still gets the message below.
    if (await runBotSlashCommand(bare, value)) return;

    setNotice(`I don't know /${bare}. Type / to see what I do know.`);
  }

  /** Runs a bot-registered command; false when no connected bot owns it. */
  async function runBotSlashCommand(bare: string, value: string): Promise<boolean> {
    if (!activeChannelId) return false;
    try {
      const result = await apiFetch<{ ok: boolean; reason: string | null; message?: string }>(
        "/api/commands",
        {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            name: bare,
            args: value,
          }),
        },
      );
      if (result.ok) return true;
      if (result.reason === "usage") {
        setNotice(result.message || `Check the arguments for /${bare}.`);
        return true;
      }
      if (result.reason === "offline") {
        setNotice(`The bot that owns /${bare} is not connected right now.`);
        return true;
      }
    } catch {
      // Treated as unknown: the caller falls back.
    }
    return false;
  }

  async function runMusicUiCommand(
    raw: string,
    roomHint?: string,
  ): Promise<MusicSettings | void> {
    const targetVoiceChannelId =
      roomHint ||
      voice.channelId ||
      voiceChannels.find((channel) => hub.players[channel.id]?.track)?.id ||
      voiceChannels[0]?.id;
    if (!targetVoiceChannelId) {
      setNotice("This server does not have a voice room yet.");
      return;
    }
    const name = raw.trim().split(/\s+/)[0].replace(/^\//, "");
    const silent = new Set([
      "autoplay",
      "automix",
      "artistdiversity",
      "vibematch",
      "automixblend",
      "crossfade",
      "filter",
    ]).has(name);
    try {
      const data = await apiFetch<{ state?: MusicSettings }>(
        "/api/music/command",
        {
          method: "POST",
          body: JSON.stringify({
            command: raw,
            voiceChannelId: targetVoiceChannelId,
            textChannelId: activeChannelId,
            silent,
          }),
        },
      );
      return data.state;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That music control failed.",
      );
    }
  }

  /** Uploads a recorded clip and posts it as a voice message. */
  async function sendVoiceMessage(clip: VoiceClip) {
    const channelId = activeChannelId;
    if (!channelId) return;
    const replyTo = replyTarget?.id != null ? String(replyTarget.id) : undefined;
    const extension = clip.blob.type.includes("mp4")
      ? "m4a"
      : clip.blob.type.includes("ogg")
        ? "ogg"
        : "webm";
    const form = new FormData();
    form.append("purpose", "voice");
    form.append(
      "file",
      new File([clip.blob], `voice-${Date.now()}.${extension}`, { type: clip.blob.type }),
    );
    const upload = await apiFetch<{ key: string }>("/api/uploads", {
      method: "POST",
      body: form,
    });
    setReplyTarget(null);
    await apiFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        channelId,
        content: `Voice message (${formatDuration(clip.durationMs)})`,
        audio: `/hangout/api/uploads/${encodeURIComponent(upload.key)}`,
        kind: "voice",
        payload: {
          voice: { durationMs: Math.round(clip.durationMs), waveform: clip.waveform },
        },
        replyTo,
      }),
    });
  }

  async function sendText(text: string, attachmentKeys?: string | string[]) {
    if (!activeChannelId) return;
    const replyTo = replyTarget?.id != null ? String(replyTarget.id) : undefined;
    setReplyTarget(null);
    const keys =
      typeof attachmentKeys === "string"
        ? [attachmentKeys]
        : attachmentKeys || [];
    await apiFetch("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        channelId: activeChannelId,
        content: text,
        attachmentKey: keys[0],
        attachmentKeys: keys.slice(1),
        replyTo,
      }),
    });
  }

  async function toggleReaction(messageId: string | number, emoji: string) {
    const id = String(messageId);
    const me = user
      ? {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        avatarUrl: user.avatarUrl,
        color: user.color,
      }
      : undefined;
    // Optimistic: flip locally, then persist. The socket echo reconciles.
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
            ...message,
            reactions: applyReaction(
              message.reactions,
              emoji,
              true,
              !message.reactions?.find((r) => r.emoji === emoji)?.mine,
              me,
            ),
          }
          : message,
      ),
    );
    setThreadMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
            ...message,
            reactions: applyReaction(
              message.reactions,
              emoji,
              true,
              !message.reactions?.find((r) => r.emoji === emoji)?.mine,
              me,
            ),
          }
          : message,
      ),
    );
    setThreadRoot((current) =>
      current && current.id === messageId
        ? {
          ...current,
          reactions: applyReaction(
            current.reactions,
            emoji,
            true,
            !current.reactions?.find((r) => r.emoji === emoji)?.mine,
            me,
          ),
        }
        : current,
    );
    await apiFetch(`/api/messages/${id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }).catch(() => undefined);
  }

  const threadBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (threadRoot && threadBottomRef.current) {
      threadBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [threadRoot?.id, threadMessages.length]);

  async function openThread(message: Message) {
    setThreadRoot(message);
    setThreadDraft("");
    // If window is < 1300px, automatically close member panel to leave ample room for chat + thread
    if (typeof window !== "undefined" && window.innerWidth < 1300 && membersOpen) {
      setMembersOpen(false);
    }
    const data = await apiFetch<{ messages: Message[] }>(
      `/api/messages?threadId=${encodeURIComponent(String(message.id))}`,
    ).catch(() => ({ messages: [] as Message[] }));
    setThreadMessages(data.messages);
  }

  async function sendThreadReply() {
    const text = threadDraft.trim();
    if (!text || !threadRoot || !activeChannelId) return;
    setThreadDraft("");

    // Quick reaction shortcut support in threads (e.g. :+tada:, :+smiley:, :+thumbsup:)
    const quickReaction = parseQuickReaction(text, emojiMap);
    if (quickReaction) {
      const targetMessage = threadMessages.length > 0
        ? threadMessages[threadMessages.length - 1]
        : threadRoot;
      if (targetMessage) {
        await toggleReaction(targetMessage.id, quickReaction.emoji);
        return;
      }
    }

    // In an AI answer's thread every reply is a follow-up question. Both the
    // question and the answer arrive over the socket like any thread reply.
    if (threadRoot.kind === "ai") {
      try {
        await apiFetch("/api/ai/ask", {
          method: "POST",
          body: JSON.stringify({
            channelId: activeChannelId,
            question: text,
            threadId: String(threadRoot.id),
          }),
        });
      } catch (error) {
        setThreadDraft(text);
        setNotice(error instanceof Error ? error.message : "The AI did not answer.");
      }
      return;
    }

    try {
      const processedText = replaceEmojiShortcodes(text, emojiMap);
      const data = await apiFetch<{ message: Message }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelId,
          content: processedText,
          threadId: String(threadRoot.id),
        }),
      });
      // The socket echo may have already delivered this reply; don't add or
      // count it twice.
      setThreadMessages((current) =>
        current.some((m) => m.id === data.message.id)
          ? current
          : [...current, data.message],
      );
      if (!countedThreadRepliesRef.current.has(String(data.message.id))) {
        countedThreadRepliesRef.current.add(String(data.message.id));
        // Bump the reply count on the root message in the main view.
        setMessages((current) =>
          current.map((m) =>
            m.id === threadRoot.id
              ? { ...m, threadCount: (m.threadCount || 0) + 1 }
              : m,
          ),
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reply did not send.");
    }
  }

  function beginEdit(message: Message) {
    setEditingId(message.id);
    setEditDraft(message.text);
  }

  async function saveEdit(message: Message) {
    const content = editDraft.trim();
    setEditingId(null);
    if (!content || content === message.text) return;
    setMessages((current) =>
      current.map((m) =>
        m.id === message.id
          ? { ...m, text: content, editedAt: new Date().toISOString() }
          : m,
      ),
    );
    await apiFetch(`/api/messages/${message.id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }).catch((error: Error) => setNotice(error.message));
  }

  const [incomingDmCall, setIncomingDmCall] = useState<{
    channelId: string;
    fromUserId: string;
    fromDisplayName: string;
    fromAvatar: string;
    fromAvatarUrl?: string | null;
    isVideo?: boolean;
  } | null>(null);

  const [dmCall, setDmCall] = useState<{
    channelId: string;
    otherUser: { id: string; displayName: string; avatar?: string; avatarUrl?: string | null; color?: string };
    status: "calling" | "connected";
    startTime: number;
    isVideo?: boolean;
  } | null>(null);
  const dmCallRef = useRef(dmCall);
  dmCallRef.current = dmCall;
  const callingTimeoutRef = useRef<number | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    if (!dmCall || dmCall.status !== "connected") {
      setCallDuration(0);
      return;
    }
    const interval = window.setInterval(() => {
      setCallDuration(Math.max(0, Math.floor((Date.now() - dmCall.startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [dmCall]);

  const endDmCall = useCallback(
    (missed = false) => {
      stopCallingTone();
      stopIncomingCallTone();
      playCallEndSound();
      if (callingTimeoutRef.current) {
        window.clearTimeout(callingTimeoutRef.current);
        callingTimeoutRef.current = null;
      }
      const currentCall = dmCallRef.current;
      if (currentCall && currentCall.status === "calling") {
        hub.send({
          t: "dm-call",
          channelId: currentCall.channelId,
          targetUserId: currentCall.otherUser.id,
          action: "cancel",
        });
      }
      if (missed && activeChannelId && user) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const dateStr = now.toLocaleDateString([], { month: "short", day: "numeric" });
        void sendText(`📞 Missed call from ${user.displayName} on ${dateStr} at ${timeStr}`);
      }
      voice.leave();
      setDmCall(null);
    },
    [activeChannelId, user, voice, hub],
  );

  const startDmCall = useCallback(
    (video = false) => {
      if (!activeDm || !activeChannelId || !user) return;
      setDmCall({
        channelId: activeChannelId,
        otherUser: activeDm.user,
        status: "calling",
        startTime: Date.now(),
        isVideo: video,
      });
      startCallingTone();
      void voice.join(activeChannelId);
      if (video) void voice.startCamera();

      hub.send({
        t: "dm-call",
        channelId: activeChannelId,
        targetUserId: activeDm.user.id,
        action: "call",
        isVideo: video,
      });

      if (callingTimeoutRef.current) window.clearTimeout(callingTimeoutRef.current);
      callingTimeoutRef.current = window.setTimeout(() => {
        endDmCall(true);
      }, 35000);
    },
    [activeDm, activeChannelId, user, voice, hub, endDmCall],
  );

  const acceptIncomingCall = useCallback(() => {
    if (!incomingDmCall || !user) return;
    const callInfo = incomingDmCall;
    stopIncomingCallTone();
    setIncomingDmCall(null);

    hub.send({
      t: "dm-call",
      channelId: callInfo.channelId,
      targetUserId: callInfo.fromUserId,
      action: "accept",
    });

    setActiveServerId(DM_HOME);
    setActiveChannelId(callInfo.channelId);
    setDmCall({
      channelId: callInfo.channelId,
      otherUser: {
        id: callInfo.fromUserId,
        displayName: callInfo.fromDisplayName,
        avatar: callInfo.fromAvatar,
        avatarUrl: callInfo.fromAvatarUrl,
      },
      status: "connected",
      startTime: Date.now(),
      isVideo: callInfo.isVideo,
    });

    playCallAnswerSound();
    void voice.join(callInfo.channelId);
    if (callInfo.isVideo) void voice.startCamera();
  }, [incomingDmCall, user, hub, voice]);

  const declineIncomingCall = useCallback(() => {
    if (!incomingDmCall) return;
    const callInfo = incomingDmCall;
    stopIncomingCallTone();
    setIncomingDmCall(null);

    hub.send({
      t: "dm-call",
      channelId: callInfo.channelId,
      targetUserId: callInfo.fromUserId,
      action: "decline",
    });
  }, [incomingDmCall, hub]);

  // Wire up incoming DM call socket handler
  useEffect(() => {
    onDmCallRef.current = (payload: {
      channelId: string;
      fromUserId: string;
      fromDisplayName: string;
      fromAvatar: string;
      fromAvatarUrl?: string | null;
      action: "call" | "accept" | "decline" | "cancel";
      isVideo?: boolean;
    }) => {
      if (payload.action === "call") {
        if (payload.fromUserId === user?.id) return;
        startIncomingCallTone();
        showNotification(
          `Incoming ${payload.isVideo ? "Video" : "Voice"} Call`,
          `${payload.fromDisplayName || "Someone"} is calling you...`,
          `call-${payload.channelId}`,
        );
        setIncomingDmCall({
          channelId: payload.channelId,
          fromUserId: payload.fromUserId,
          fromDisplayName: payload.fromDisplayName,
          fromAvatar: payload.fromAvatar,
          fromAvatarUrl: payload.fromAvatarUrl,
          isVideo: payload.isVideo,
        });
      } else if (payload.action === "accept") {
        stopCallingTone();
        playCallAnswerSound();
        if (callingTimeoutRef.current) {
          window.clearTimeout(callingTimeoutRef.current);
          callingTimeoutRef.current = null;
        }
        setDmCall((curr) =>
          curr ? { ...curr, status: "connected", startTime: Date.now() } : null,
        );
      } else if (payload.action === "decline") {
        stopCallingTone();
        playCallEndSound();
        if (callingTimeoutRef.current) {
          window.clearTimeout(callingTimeoutRef.current);
          callingTimeoutRef.current = null;
        }
        setDmCall(null);
        voice.leave();
        setNotice(`${payload.fromDisplayName} declined the call.`);
      } else if (payload.action === "cancel") {
        stopIncomingCallTone();
        setIncomingDmCall(null);
      }
    };
  }, [user, voice]);

  // Clean up tones on unmount
  useEffect(() => {
    return () => {
      stopCallingTone();
      stopIncomingCallTone();
    };
  }, []);

  useEffect(() => {
    if (!dmCall) return;
    if (dmCall.status === "calling") {
      const otherInRoom = voiceParticipants.some((p) => p.id === dmCall.otherUser.id);
      if (otherInRoom) {
        stopCallingTone();
        playCallAnswerSound();
        if (callingTimeoutRef.current) {
          window.clearTimeout(callingTimeoutRef.current);
          callingTimeoutRef.current = null;
        }
        setDmCall((curr) => (curr ? { ...curr, status: "connected", startTime: Date.now() } : null));
      }
    } else if (dmCall.status === "connected") {
      const otherInRoom = voiceParticipants.some((p) => p.id === dmCall.otherUser.id);
      if (!otherInRoom && voiceParticipants.length <= 1) {
        endDmCall(false);
      }
    }
  }, [voiceParticipants, dmCall, endDmCall]);

  // Peer screen sharing sound tracker
  const prevPeerScreenShares = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentScreenPeers = new Set(
      voiceParticipants
        .filter((p) => p.connectionId !== hub.connectionId && !!p.screenStreamId)
        .map((p) => p.connectionId),
    );
    if (voice.channelId) {
      for (const id of currentScreenPeers) {
        if (!prevPeerScreenShares.current.has(id)) {
          playScreenShareStartSound();
          break;
        }
      }
      for (const id of prevPeerScreenShares.current) {
        if (!currentScreenPeers.has(id)) {
          playScreenShareStopSound();
          break;
        }
      }
    }
    prevPeerScreenShares.current = currentScreenPeers;
  }, [voiceParticipants, voice.channelId, hub.connectionId]);

  async function runSearch(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2 || !activeServerId || inDmHome) {
      setSearchResults([]);
      return;
    }
    const data = await apiFetch<{
      results: Array<{
        id: string;
        channelId: string;
        channelName: string;
        author: string;
        snippet: string;
      }>;
    }>(
      `/api/messages/search?serverId=${encodeURIComponent(activeServerId)}&q=${encodeURIComponent(query)}`,
    ).catch(() => ({ results: [] }));
    setSearchResults(data.results);
  }

  function jumpToMessage(channelId: string, messageId: string) {
    setSearchOpen(false);
    setStageChannelId(null);
    setActiveChannelId(channelId);
    // Scroll to the message once it's rendered.
    window.setTimeout(() => {
      document
        .getElementById(`msg-${messageId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const typed = draft.trim();
    // The MSN theme turns :) (Y) <3 into pictures, as Messenger did. Never
    // inside a slash command, where the text is an argument.
    const text = msnTheme && !typed.startsWith("/") ? convertMsnEmoticons(typed) : typed;
    const files = pendingFiles;
    if (!text && !files.length) return;

    setDraft("");
    setPendingFiles([]);

    if (text.startsWith("/") && !files.length) {
      await runCommand(text);
      return;
    }

    // Quick reaction shortcut to react to the last message in the channel (e.g. :+tada:, :+smiley:, :+thumbsup:, :+1:)
    const quickReaction = parseQuickReaction(text, emojiMap);
    if (quickReaction && !files.length) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        await toggleReaction(lastMessage.id, quickReaction.emoji);
        return;
      } else {
        setNotice("There are no messages in this channel to react to yet.");
        return;
      }
    }

    try {
      // Upload every staged file, then send one message carrying them all.
      const keys: string[] = [];
      for (const entry of files) {
        const form = new FormData();
        form.append("file", entry.file);
        const upload = await apiFetch<{ key: string }>("/api/uploads", {
          method: "POST",
          body: form,
        });
        keys.push(upload.key);
      }
      const processedText = replaceEmojiShortcodes(text, emojiMap);
      // MSN sends everything in the font picked in its Font dialog (not a
      // bare GIF/sticker link, which has to stay a link to show as a picture).
      // Your own emoticons turn into their pictures for everyone, too.
      const styled =
        msnTheme && !isImageUrl(processedText)
          ? applyMessageFont(applyPersonalEmoticons(processedText, personalEmoticons.emoticons), messageFont)
          : processedText;
      await sendText(styled, keys);
    } catch (error) {
      // Put the message back so a dropped connection or a rate limit does not
      // eat what someone typed — unless they have already started a new one.
      setDraft((current) => (current ? current : text));
      setPendingFiles((current) => (current.length ? current : files));
      setNotice(
        error instanceof Error ? error.message : "That message did not send.",
      );
    }
  }

  const slashOpen = draft.startsWith("/") && !draft.includes("\n");
  const slashMatches = useMemo(
    () =>
      (slashOpen ? matchCommands(draft.split(/\s+/)[0], botCommands) : []).filter(
        (command) => features.recordSessions || command.name !== "record",
      ),
    [slashOpen, draft, features.recordSessions, botCommands],
  );
  const slashActive = slashOpen && !draft.includes(" ") && slashMatches.length > 0;

  // @-mention / #-channel autocomplete for the token right before the caret.
  const [composerCaret, setComposerCaret] = useState(0);
  const [dismissedTagAt, setDismissedTagAt] = useState<number | null>(null);
  const tagQuery = useMemo(
    () => findTagQuery(draft.slice(0, composerCaret)),
    [draft, composerCaret],
  );
  useEffect(() => {
    if (!tagQuery) setDismissedTagAt(null);
  }, [tagQuery]);
  const dmMembers: Member[] = useMemo(() => {
    if (!inDmHome || !user) return [];
    const meAsMember: Member = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      avatarUrl: user.avatarUrl,
      color: user.color,
      lastSeenAt: new Date().toISOString(),
    };
    if (!activeDm) return [meAsMember];
    if (activeDm.group) {
      return activeDm.group.members.map((member) =>
        member.id === user.id ? meAsMember : member,
      );
    }
    const otherAsMember: Member = {
      id: activeDm.user.id,
      username: activeDm.user.username,
      displayName: activeDm.user.displayName,
      avatar: activeDm.user.avatar,
      avatarUrl: activeDm.user.avatarUrl,
      color: activeDm.user.color,
      lastSeenAt: new Date().toISOString(),
    };
    return [meAsMember, otherAsMember];
  }, [inDmHome, activeDm, user]);

  const mentionMatches = useMemo<MentionOption[]>(() => {
    if (!tagQuery) return [];
    const query = tagQuery.query;
    if (tagQuery.trigger === "#") {
      if (inDmHome) return [];
      // Voice rooms stay listed: people link `#kitchen-table` to send someone
      // into a room, so only the DM pseudo-kind is excluded.
      const channels = (activeServer?.channels || []).filter((channel) => {
        const info = channelKindInfo(channel.kind);
        return (info.text || info.appearsAsVoice) && channel.kind !== "dm";
      });
      return rankMentionMatches(
        channels,
        query,
        (channel) => [channel.name],
        (a, b) =>
          Number(channelKindInfo(a.kind).appearsAsVoice) -
            Number(channelKindInfo(b.kind).appearsAsVoice) || a.position - b.position,
      )
        .slice(0, 10)
        .map((channel) => ({ kind: "channel", channel }));
    }
    // People first: that's what @ is usually for. Nicknames, global names
    // and usernames all match, so "@es" finds "Escanor" by any of them.
    const memberOptions: MentionOption[] = rankMentionMatches(
      inDmHome ? dmMembers : members,
      query,
      (member) => [member.displayName, member.nickname, member.globalName, member.username],
      (a, b) => a.displayName.localeCompare(b.displayName),
    )
      .slice(0, 8)
      .map((member) => ({ kind: "user", member }));
    const roleOptions: MentionOption[] = rankMentionMatches(
      (activeServer?.roles || []).filter((role) => nameToHandle(role.name) !== ""),
      query,
      (role) => [role.name],
      (a, b) => a.name.localeCompare(b.name),
    )
      .slice(0, 5)
      .map((role) => ({ kind: "role", role }));
    const broadcastOptions: MentionOption[] =
      inDmHome || !canMentionEveryone
        ? []
        : rankMentionMatches(
            ["everyone", "here"] as const,
            query,
            (name) => [name],
            () => 0,
          ).map((name) => ({ kind: "broadcast", name }));
    return [...memberOptions, ...roleOptions, ...broadcastOptions];
  }, [tagQuery, members, activeServer, inDmHome, dmMembers, canMentionEveryone]);
  const mentionActive =
    tagQuery !== null && tagQuery.start !== dismissedTagAt && mentionMatches.length > 0;

  useEffect(() => setSlashIndex(0), [draft, tagQuery?.trigger]);

  function pickMention(option: MentionOption) {
    if (!tagQuery) return;
    const token =
      option.kind === "user"
        ? `@${option.member.username}`
        : option.kind === "role"
          ? `@${nameToHandle(option.role.name)}`
          : option.kind === "broadcast"
            ? `@${option.name}`
            : `#${nameToHandle(option.channel.name)}`;
    const before = draft.slice(0, tagQuery.start);
    // Swallow the rest of a half-typed word when picking from the middle of it.
    const after = draft.slice(composerCaret).replace(/^[^\s]*/, "");
    const insert = after.startsWith(" ") ? token : `${token} `;
    const caret = before.length + insert.length + (after.startsWith(" ") ? 1 : 0);
    setDraft(before + insert + after);
    setComposerCaret(caret);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(caret, caret);
    });
  }

  /** Where a #channel link in a message takes you. */
  function openMentionedChannel(target: MentionChannel) {
    const channel = activeServer?.channels.find((c) => c.id === target.id);
    if (!channel) return;
    // `appearsAsVoice` rather than `kind === "voice"`, so a stage room is joined
    // the same way a voice room is.
    if (channelKindInfo(channel.kind).appearsAsVoice) {
      openVoiceChannel(channel);
      return;
    }
    setStageChannelId(null);
    setActiveChannelId(channel.id);
    setMobileNav(false);
  }

  // :-emoji autocomplete: matches a :shortcode or :+shortcode being typed at the end of the draft.
  const emojiShortcodeMatch = useMemo(() => {
    const match = draft.match(/(?:^|\s)(:\+?|[+]:?)([a-zA-Z0-9_+-]{1,20})$/);
    if (!match) return null;
    return {
      prefix: match[1],
      query: match[2].toLowerCase(),
    };
  }, [draft]);

  const emojiMatches = useMemo(() => {
    if (!emojiShortcodeMatch) return [];
    return findMatchingEmojiShortcodes(emojiShortcodeMatch.query, emojiMap, 8);
  }, [emojiShortcodeMatch, emojiMap]);

  const emojiActive = emojiShortcodeMatch !== null && emojiMatches.length > 0;
  const [emojiIndex, setEmojiIndex] = useState(0);
  useEffect(() => setEmojiIndex(0), [emojiShortcodeMatch?.query]);

  function pickEmojiShortcode(item: { name: string; symbol: string; isCustom?: boolean; url?: string }) {
    if (!emojiShortcodeMatch) return;
    const isReaction = emojiShortcodeMatch.prefix.includes("+");
    const replacement = isReaction
      ? `:+${item.name}:`
      : item.isCustom
        ? `:${item.name}: `
        : `${item.symbol} `;
    setDraft((current) =>
      current.replace(/(?:^|\s)(:\+?|[+]:?)[a-zA-Z0-9_+-]{1,20}$/, (m) => {
        const lead = m.startsWith(" ") ? " " : "";
        return lead + replacement;
      }),
    );
    composerRef.current?.focus();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+B, I, U format the selection, as in any editor.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const fence = { b: "**", i: "*", u: "__" }[event.key.toLowerCase()];
      if (fence) {
        event.preventDefault();
        wrapSelection(fence, fence);
        return;
      }
    }
    if (mentionActive) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedTagAt(tagQuery?.start ?? null);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % mentionMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex(
          (index) => (index - 1 + mentionMatches.length) % mentionMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickMention(mentionMatches[slashIndex % mentionMatches.length]);
        return;
      }
    }
    if (emojiActive) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setEmojiIndex((index) => (index + 1) % emojiMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setEmojiIndex(
          (index) => (index - 1 + emojiMatches.length) % emojiMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickEmojiShortcode(emojiMatches[emojiIndex % emojiMatches.length]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setEmojiIndex(0);
        return;
      }
    }
    if (slashActive) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % slashMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex(
          (index) => (index - 1 + slashMatches.length) % slashMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        pickCommand(slashIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft("");
        return;
      }
    }
    if (
      event.key === "ArrowUp" &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      if (!draft && !editingId && user) {
        const lastUserMessage = [...messages]
          .reverse()
          .find((m) => m.userId === user.id && !m.bot);
        if (lastUserMessage) {
          event.preventDefault();
          beginEdit(lastUserMessage);
          return;
        }
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function pickCommand(index: number) {
    const command = slashMatches[index];
    if (!command) return;
    setDraft(command.args ? `/${command.name} ` : `/${command.name}`);
    composerRef.current?.focus();
    if (!command.args) {
      void runCommand(`/${command.name}`);
      setDraft("");
    }
  }

  /** Shared by the paperclip, a drop, and a paste. Accepts several at once. */
  function acceptAttachment(files: FileList | File[] | undefined | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const MAX = 10;

    for (const file of list) {
      const isImage = file.type.startsWith("image/");
      const isPdf =
        file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isImage && !isPdf) {
        setNotice("Huddle takes images and PDFs.");
        continue;
      }
      const id = `${file.name}:${file.size}:${crypto.randomUUID()}`;
      setPendingFiles((current) =>
        current.length >= MAX ? current : [...current, { id, file, preview: null }],
      );
      if (isImage) {
        const reader = new FileReader();
        reader.onload = () =>
          setPendingFiles((current) =>
            current.map((entry) =>
              entry.id === id
                ? { ...entry, preview: String(reader.result) }
                : entry,
            ),
          );
        reader.readAsDataURL(file);
      }
    }
    composerRef.current?.focus();
  }

  function chooseAttachment(event: ChangeEvent<HTMLInputElement>) {
    acceptAttachment(event.target.files);
    event.target.value = "";
  }

  function onChannelDragOver(event: DragEvent<HTMLElement>) {
    if (!activeChannelId) return;
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onChannelDrop(event: DragEvent<HTMLElement>) {
    if (!activeChannelId) return;
    event.preventDefault();
    setDragging(false);
    acceptAttachment(event.dataTransfer.files);
  }

  /** Leaves a server: drops membership and falls back to another server. */
  async function leaveServer(serverId: string) {
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        "/api/servers/membership",
        {
          method: "POST",
          body: JSON.stringify({ action: "leave", serverId }),
        },
      );
      setServers(data.servers);
      setServerSettingsOpen(false);
      setActiveServerId(data.servers[0]?.id || DM_HOME);
      setNotice("You left the server.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not leave.");
    }
  }

  /** Redeems a server invite code or link directly and jumps into the joined server. */
  async function joinServerDirect(rawInput?: string) {
    if (!rawInput?.trim()) return;
    let code = rawInput.trim();
    if (code.includes("?") || code.includes("/")) {
      try {
        const url = new URL(code.startsWith("http") ? code : `https://${code}`);
        code =
          url.searchParams.get("code") ||
          url.searchParams.get("servercode") ||
          url.searchParams.get("invite") ||
          url.search.slice(1) ||
          code;
      } catch {
        const qIdx = code.indexOf("?");
        if (qIdx !== -1) code = code.slice(qIdx + 1);
      }
    }
    code = code
      .replace(/^code=/i, "")
      .replace(/^servercode=/i, "")
      .replace(/^invite=/i, "")
      .trim()
      .toUpperCase();
    if (!code) return;
    try {
      const data = await apiFetch<{
        serverId: string;
        servers: PublicServer[];
        alreadyMember?: boolean;
      }>("/api/servers/membership", {
        method: "POST",
        body: JSON.stringify({ action: "join", code }),
      });
      setServers(data.servers);
      setActiveServerId(data.serverId);
      setResolvedInvites((prev) => {
        const existing = prev[code];
        if (!existing) return prev;
        return {
          ...prev,
          [code]: { ...existing, isMember: true },
        };
      });
      setNotice(
        data.alreadyMember
          ? "Switched to server."
          : "Joined the server.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not join.");
    }
  }

  /** Redeems a server invite code and jumps into the joined server. */
  async function joinServerByCode() {
    showCustomPrompt({
      title: "Join a Server",
      message: "Paste the invite code or invite link:",
      placeholder: "e.g. HX3F-9K2Q or deeppixel.online/hangout?HX3F-9K2Q",
      confirmText: "Join Server",
      onConfirm: async (rawInput) => {
        await joinServerDirect(rawInput);
      },
    });
  }

  function createServer() {
    // "+" now offers both making a server and joining one by invite.
    showCustomConfirm({
      title: "Add a Server",
      message: "Create your own server, or join one with an invite code.",
      confirmText: "Create New",
      cancelText: "Join with Code",
      onConfirm: () => {
        showCustomPrompt({
          title: "Create Server",
          message: "Enter a name for your new server:",
          placeholder: "e.g. My Cool Server",
          confirmText: "Create Server",
          maxLength: 50,
          onConfirm: async (name) => {
            if (!name?.trim()) return;
            try {
              const data = await apiFetch<{
                server: PublicServer;
                servers: PublicServer[];
              }>("/api/servers", {
                method: "POST",
                body: JSON.stringify({ name: name.trim() }),
              });
              setServers(data.servers);
              setActiveServerId(data.server.id);
              setNotice(
                `${data.server.name} is live — invite people from its settings.`,
              );
            } catch (error) {
              setNotice(
                error instanceof Error ? error.message : "Could not create it.",
              );
            }
          },
        });
      },
      onCancel: () => void joinServerByCode(),
    });
  }

  async function createChannel(
    kind: ChannelKind,
    categoryId: string | null = null,
  ) {
    if (!activeServerId || activeServerId === DM_HOME) return;
    const copy = CHANNEL_KIND_COPY[kind] ?? CHANNEL_KIND_COPY.text;
    showCustomPrompt({
      title: copy.title,
      message: copy.message,
      placeholder: copy.placeholder,
      confirmText: "Create Channel",
      // Voice-room and stage names are free-form; text-like ones become
      // `#mentions`, so they get the shorter cap the server also enforces.
      maxLength: channelNameRules(kind).maxLength,
      onConfirm: async (name) => {
        if (!name?.trim()) return;
        try {
          const data = await apiFetch<{ channelId: string; servers: PublicServer[] }>(
            "/api/channels",
            {
              method: "POST",
              body: JSON.stringify({ serverId: activeServerId, name: name.trim(), kind, categoryId }),
            },
          );
          setServers(data.servers);
          // Only text-like kinds become the open channel. Dropping someone into
          // an empty voice room they just created is a dead end.
          if (channelKindInfo(kind).text) setActiveChannelId(data.channelId);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not create it.");
        }
      },
    });
  }

  /** Turns a channel into another kind of the same family, keeping its messages. */
  async function changeChannelKind(channel: { id: string; name: string }, kind: ChannelKind) {
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ kind }),
      });
      setServers(data.servers);
      setNotice(`#${channel.name} is now ${withArticle(channelKindLabel(kind))}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change the channel type.");
    }
  }

  /**
   * The kind picker's menu, shared by the sidebar header and each category so
   * both offer the same five kinds instead of only text and voice.
   */
  function renderKindMenu(categoryId: string | null) {
    return (
      <div className="channel-kind-menu" role="menu" aria-label="Channel type">
        {CREATABLE_CHANNEL_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            role="menuitem"
            onClick={() => {
              setKindMenu(null);
              void createChannel(kind, categoryId);
            }}
          >
            <span className="flex items-center gap-2">
              {channelKindIcon(kind)} {channelKindLabel(kind)}
            </span>
          </button>
        ))}
      </div>
    );
  }

  async function renameChannel(channel: PublicChannel) {
    showCustomPrompt({
      title: `Rename Channel`,
      message: `Enter a new name for ${channel.name}:`,
      defaultValue: channel.name,
      confirmText: "Save Name",
      maxLength: 25,
      onConfirm: async (name) => {
        if (!name?.trim()) return;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not rename it.");
        }
      },
    });
  }

  async function editChannelTopic(channel: PublicChannel) {
    showCustomPrompt({
      title: `Edit Channel Topic`,
      message: `Set topic description for #${channel.name}:`,
      defaultValue: channel.topic || "",
      placeholder: "e.g. Plans, chaos, and meme sharing",
      confirmText: "Save Topic",
      onConfirm: async (topic) => {
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ topic: topic?.trim() || "" }) },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not save topic.");
        }
      },
    });
  }

  async function editChannelSlowmode(channel: PublicChannel) {
    showCustomPrompt({
      title: `Set Channel Slowmode Cooldown`,
      message: `Enter slowmode cooldown in seconds (0 to disable, e.g. 5, 10, 30):`,
      defaultValue: String(channel.slowmode || 0),
      placeholder: "0",
      confirmText: "Set Slowmode",
      onConfirm: async (val) => {
        const sec = parseInt(val || "0", 10) || 0;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ slowmode: sec }) },
          );
          setServers(data.servers);
          setNotice(sec > 0 ? `Slowmode set to ${sec}s` : "Slowmode disabled");
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not set slowmode.");
        }
      },
    });
  }

  async function deleteChannel(channel: PublicChannel) {
    showCustomConfirm({
      title: `Delete '${channel.name}'?`,
      message: "Are you sure? All messages in this channel will be permanently removed.",
      isDanger: true,
      confirmText: "Delete Channel",
      onConfirm: async () => {
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "DELETE" },
          );
          setServers(data.servers);
          if (voice.channelId === channel.id) voice.leave();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not delete it.");
        }
      },
    });
  }

  async function editServer() {
    if (!activeServer) return;
    setServerSettingsOpen(true);
  }

  async function signOut() {
    // Before logging out, while the request is still authenticated.
    await unregisterNativePush();
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    voice.leave();
    setUser(null);
    setSettingsOpen(false);
  }

  function openUserMenu(event: MouseEvent, member: Member) {
    event.preventDefault();
    setBotMenu(null);
    setUserMenu({ member, x: event.clientX, y: event.clientY });
  }

  /**
   * Touch screens have no right-click, so on a coarse pointer a plain tap opens
   * the same menu. Handed to both onClick and onContextMenu.
   */
  function userMenuHandlers(member: Member) {
    return {
      onContextMenu: (event: MouseEvent) => openUserMenu(event, member),
      onClick: (event: MouseEvent) => {
        if (!touchInput) return;
        openUserMenu(event, member);
      },
    };
  }

  function openBotMenu(event: MouseEvent, kind: "music" | "dnd") {
    event.preventDefault();
    setUserMenu(null);
    setBotMenu({ kind, x: event.clientX, y: event.clientY });
  }

  function prepareCommand(command: string) {
    setDraft(command);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }


  // --------------------------------------------------------------- render

  const voiceRecorder = useVoiceRecorder(sendVoiceMessage);
  useEffect(() => {
    if (!voiceRecorder.error) return;
    setNotice(voiceRecorder.error);
    voiceRecorder.clearError();
  }, [voiceRecorder.error]);
  // Switching channels mid-recording throws the recording away.
  useEffect(() => {
    voiceRecorder.cancel();
  }, [activeChannelId]);

  if (!ready) {
    return (
      <main className="app-shell booting">
        <div className="boot-card">Opening Hoffle…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <AuthGate
          bootstrap={bootstrap}
          onSignedIn={(signedIn, defaultTheme) => {
            const startTheme = defaultTheme && findThemeById(defaultTheme);
            if (startTheme) applyTheme(startTheme);
            setUser(signedIn);
            setBootstrap(false);
          }}
        />
      </main>
    );
  }

  const rawDisplayedMembers = inDmHome ? dmMembers : members;
  const filterQ = memberFilterQuery.trim().toLowerCase();
  const displayedMembers = filterQ
    ? rawDisplayedMembers.filter(
      (m) =>
        m.username.toLowerCase().includes(filterQ) ||
        m.displayName.toLowerCase().includes(filterQ),
    )
    : rawDisplayedMembers;
  const onlineMembers = displayedMembers.filter((member) => hub.online.has(member.id));
  const offlineMembers = displayedMembers.filter((member) => !hub.online.has(member.id));
  const currentVoiceChannel = voiceChannels.find(
    (channel) => channel.id === voice.channelId,
  );
  const stageDm = stageChannelId
    ? dms.find((d) => d.channelId === stageChannelId)
    : null;

  // The voice channel whose stage fills the main column, if any. Falls back to
  // the connected room's channel across servers or DMs so switching servers keeps it.
  const stageChannel: PublicChannel | null = stageChannelId
    ? voiceChannels.find((channel) => channel.id === stageChannelId) ||
    servers
      .flatMap((server) => server.channels)
      .find((channel) => channel.id === stageChannelId) ||
    (stageDm
      ? {
        id: stageDm.channelId,
        serverId: "",
        name: stageDm.user.displayName,
        kind: "voice" as const,
        topic: `Direct call with ${stageDm.user.displayName}`,
        position: 0,
        categoryId: null,
      }
      : null)
    : null;

  /** Open a voice channel's stage and join it (without ever leaving on re-click). */
  function openVoiceChannel(channel: PublicChannel) {
    if (myTimeoutUntil && voice.channelId !== channel.id) {
      setNotice(`You are timed out here until ${formatClientDateTime(myTimeoutUntil)}.`);
      return;
    }
    player.prime();
    setStageChannelId(channel.id);
    setMobileNav(false);
    if (voice.channelId !== channel.id) {
      // A stage opens you in the audience unless SPEAK says otherwise. This is
      // the only place SPEAK is enforced, and it is what makes the audience real:
      // without it everyone would join with a live microphone and the roster's
      // "on stage" list would be meaningless.
      const startMuted = shouldStartMuted(channel.kind, hasPermission(myPermissions, Permission.SPEAK));
      void voice.join(channel.id, { startMuted });
    }
  }

  function toggleCategory(id: string) {
    setCollapsedCats((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(
        "huddle-collapsed-cats",
        JSON.stringify([...next]),
      );
      return next;
    });
  }

  async function addCategory() {
    if (!activeServerId || activeServerId === DM_HOME) return;
    showCustomPrompt({
      title: "Add Category",
      message: "Enter name for the new category:",
      placeholder: "e.g. Text Channels",
      confirmText: "Create Category",
      onConfirm: async (name) => {
        if (!name?.trim()) return;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>("/api/categories", {
            method: "POST",
            body: JSON.stringify({ serverId: activeServerId, name: name.trim() }),
          });
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not create it.");
        }
      },
    });
  }

  async function renameCategory(categoryId: string, current: string) {
    showCustomPrompt({
      title: "Rename Category",
      message: `Enter new name for category "${current}":`,
      defaultValue: current,
      confirmText: "Save Name",
      onConfirm: async (name) => {
        if (!name?.trim() || name.trim() === current) return;
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/categories/${categoryId}`,
            { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not rename it.");
        }
      },
    });
  }

  async function deleteCategory(categoryId: string, name: string) {
    showCustomConfirm({
      title: `Delete Category '${name}'?`,
      message: `Are you sure you want to delete the "${name}" category? Channels inside it will remain uncategorized.`,
      isDanger: true,
      confirmText: "Delete Category",
      onConfirm: async () => {
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/categories/${categoryId}`,
            { method: "DELETE" },
          );
          setServers(data.servers);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not delete it.");
        }
      },
    });
  }

  /**
   * Persist a drag: place the dragged channel into `targetCategoryId`, just
   * before `beforeChannelId` (or at the end when null), then renumber every
   * channel's position within its category and send the whole layout.
   */
  async function dropChannel(
    draggedId: string,
    targetCategoryId: string | null,
    beforeChannelId: string | null,
  ) {
    if (!activeServerId || !canManageChannels) return;
    const all = (activeServer?.channels.filter((c) => c.kind !== "dm") || []).map(
      (c) => ({ ...c }),
    );
    const dragged = all.find((c) => c.id === draggedId);
    if (!dragged || draggedId === beforeChannelId) return;

    // Rebuild each category's ordered list from current positions.
    const lists = new Map<string, PublicChannel[]>();
    const keyOf = (id: string | null) => id ?? "__none__";
    for (const channel of all) {
      if (channel.id === draggedId) continue;
      const key = keyOf(channel.categoryId);
      const list = lists.get(key) || [];
      list.push(channel);
      lists.set(key, list);
    }
    for (const list of lists.values()) list.sort((a, b) => a.position - b.position);

    dragged.categoryId = targetCategoryId;
    const targetKey = keyOf(targetCategoryId);
    const targetList = lists.get(targetKey) || [];
    const index = beforeChannelId
      ? targetList.findIndex((c) => c.id === beforeChannelId)
      : -1;
    if (index < 0) targetList.push(dragged);
    else targetList.splice(index, 0, dragged);
    lists.set(targetKey, targetList);

    const payload: Array<{ id: string; categoryId: string | null; position: number }> =
      [];
    for (const [key, list] of lists) {
      list.forEach((channel, position) => {
        payload.push({
          id: channel.id,
          categoryId: key === "__none__" ? null : key,
          position,
        });
      });
    }

    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        "/api/channels/reorder",
        {
          method: "POST",
          body: JSON.stringify({ serverId: activeServerId, channels: payload }),
        },
      );
      setServers(data.servers);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reorder.");
    } finally {
      setDragChannelId(null);
    }
  }

  /** Drag handles for a channel row: drop places the dragged one before it. */
  function channelDragProps(channel: PublicChannel) {
    if (!canManageChannels) return {};
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragChannelId(channel.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-huddle-channel", channel.id);
      },
      onDragEnd: () => setDragChannelId(null),
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragChannelId && dragChannelId !== channel.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragChannelId) return;
        event.preventDefault();
        event.stopPropagation();
        void dropChannel(dragChannelId, channel.categoryId, channel.id);
      },
    };
  }

  /** Drop onto a category (header or body) appends the channel to its end. */
  function categoryDropProps(categoryId: string | null) {
    if (!canManageChannels) return {};
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragChannelId) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragChannelId) return;
        event.preventDefault();
        void dropChannel(dragChannelId, categoryId, null);
      },
    };
  }

  /**
   * Persist a server-rail drag: place the dragged server just before
   * `beforeServerId` (or at the end when null), renumber every server the user
   * belongs to, and send the whole layout.
   */
  async function dropServer(
    draggedId: string,
    beforeServerId: string | null,
  ) {
    if (!draggedId || draggedId === beforeServerId) return;
    const all = servers.map((s) => ({ ...s }));
    const dragged = all.find((s) => s.id === draggedId);
    if (!dragged) return;

    const rest = all.filter((s) => s.id !== draggedId);
    const index = beforeServerId
      ? rest.findIndex((s) => s.id === beforeServerId)
      : -1;
    if (index < 0) rest.push(dragged);
    else rest.splice(index, 0, dragged);

    const payload = rest.map((server, position) => ({
      id: server.id,
      position,
    }));

    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(
        "/api/servers/reorder",
        {
          method: "POST",
          body: JSON.stringify({ servers: payload }),
        },
      );
      setServers(data.servers);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reorder.");
    } finally {
      setDragServerId(null);
    }
  }

  /** Saves the folder layout: shown at once, then stored on the account. */
  function saveServerFolders(next: ServerFolder[]) {
    setServerFolders(next);
    void apiFetch<{ folders: ServerFolder[] }>("/api/servers/folders", {
      method: "PUT",
      body: JSON.stringify({ folders: next }),
    }).catch((error) => {
      setNotice(error instanceof Error ? error.message : "Could not save folders.");
      void loadServerFolders().catch(() => undefined);
    });
  }

  function toggleFolderOpen(folderId: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      try {
        localStorage.setItem("huddle:open-folders", JSON.stringify([...next]));
      } catch {
        // Private mode: folders just start closed next time.
      }
      return next;
    });
  }

  function folderIdOf(serverId: string): string | null {
    return serverFolders.find((folder) => folder.serverIds.includes(serverId))?.id || null;
  }

  /**
   * Drag props for a server on the rail. Dropping on the middle of another
   * server groups the two into a folder (like Discord); dropping near its edge
   * places the dragged one before it, joining or leaving folders to match.
   */
  function serverDragProps(server: PublicServer) {
    return {
      draggable: true,
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDragServerId(server.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-huddle-server", server.id);
      },
      onDragEnd: () => {
        setDragServerId(null);
        setServerDropHint(null);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragServerId && dragServerId !== server.id) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const box = event.currentTarget.getBoundingClientRect();
          const y = (event.clientY - box.top) / box.height;
          const mode = y > 0.25 && y < 0.75 ? "merge" : "before";
          if (serverDropHint?.id !== server.id || serverDropHint.mode !== mode) {
            setServerDropHint({ id: server.id, mode });
          }
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setServerDropHint((hint) => (hint?.id === server.id ? null : hint));
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragServerId) return;
        event.preventDefault();
        event.stopPropagation();
        const merge = serverDropHint?.id === server.id && serverDropHint.mode === "merge";
        setServerDropHint(null);
        const targetFolder = folderIdOf(server.id);
        if (merge) {
          saveServerFolders(
            targetFolder
              ? moveToFolder(serverFolders, dragServerId, targetFolder)
              : createFolder(serverFolders, server.id, dragServerId, crypto.randomUUID()),
          );
          if (targetFolder && !openFolders.has(targetFolder)) toggleFolderOpen(targetFolder);
          setDragServerId(null);
          return;
        }
        if (targetFolder !== folderIdOf(dragServerId)) {
          saveServerFolders(
            targetFolder
              ? moveToFolder(serverFolders, dragServerId, targetFolder)
              : removeFromFolders(serverFolders, dragServerId),
          );
        }
        void dropServer(dragServerId, server.id);
      },
    };
  }

  /** Drop props for a folder's icon: dropping a server there files it inside. */
  function folderDropProps(folder: ServerFolder) {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (dragServerId && !folder.serverIds.includes(dragServerId)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (serverDropHint?.id !== folder.id) {
            setServerDropHint({ id: folder.id, mode: "merge" });
          }
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setServerDropHint((hint) => (hint?.id === folder.id ? null : hint));
        }
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragServerId) return;
        event.preventDefault();
        event.stopPropagation();
        setServerDropHint(null);
        saveServerFolders(moveToFolder(serverFolders, dragServerId, folder.id));
        setDragServerId(null);
      },
    };
  }

  /** One server icon on the rail (loose, or inside an open folder). */
  function renderRailServer(server: PublicServer) {
    const isActive = server.id === activeServerId;
    const initials =
      server.name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "SV";
    const hasUnread =
      !isActive && server.channels.some((c) => unread[c.id]?.unread);
    const mentionTotal = server.channels.reduce(
      (sum, c) => sum + (unread[c.id]?.mentions || 0),
      0,
    );
    const occupiedRooms = server.channels.filter(
      (c) => channelKindInfo(c.kind).appearsAsVoice && (voiceRooms[c.id]?.length || 0) > 0,
    );
    const voiceActive = occupiedRooms.length > 0;
    const voiceTitle = occupiedRooms
      .map(
        (c) =>
          `🔊 ${c.name}: ${voiceRooms[c.id].map((p) => p.displayName).join(", ")}`,
      )
      .join("\n");
    return (
      <div
        key={server.id}
        className={`rail-item ${dragServerId === server.id ? "dragging" : ""} ${serverDropHint?.id === server.id ? `drop-${serverDropHint.mode}` : ""
        }`}
        {...serverDragProps(server)}
      >
        {isActive ? (
          <span
            className="rail-active-pill"
            style={{ background: server.color || "#a78bfa" }}
          />
        ) : (
          hasUnread && <span className="rail-unread-pill" />
        )}
        <button
          className={`space-mark ${isActive ? "active-space" : ""}`}
          style={
            isActive ? { background: server.color || "#a78bfa" } : undefined
          }
          aria-label={server.name}
          title={server.name}
          onClick={() => {
            setActiveServerId(server.id);
            setStageChannelId(null);
            setMobileNav(false);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            setRailMenu({ server, x: event.clientX, y: event.clientY });
          }}
        >
          {server.iconUrl ? (
            <img
              src={server.iconUrl}
              alt={server.name}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "14px",
                objectFit: "cover",
              }}
            />
          ) : (
            server.icon || initials
          )}
          {mentionTotal > 0 && (
            <span className="rail-badge">{mentionTotal}</span>
          )}
          {voiceActive && (
            <span className="rail-voice-badge" title={voiceTitle}>
              <Volume2 size={11} />
            </span>
          )}
        </button>
      </div>
    );
  }

  /** A folder on the rail: a mini grid when closed, its servers when open. */
  function renderRailFolder(folder: ServerFolder, folderServers: PublicServer[]) {
    const open = openFolders.has(folder.id);
    const containsActive = folderServers.some((server) => server.id === activeServerId);
    const hasUnread = folderServers.some(
      (server) => server.id !== activeServerId && server.channels.some((c) => unread[c.id]?.unread),
    );
    const mentionTotal = folderServers.reduce(
      (sum, server) =>
        sum + server.channels.reduce((n, c) => n + (unread[c.id]?.mentions || 0), 0),
      0,
    );
    const label = folder.name || folderServers.map((server) => server.name).join(", ");
    return (
      <div
        key={`folder-${folder.id}`}
        className={`rail-folder ${open ? "is-open" : ""}`}
        style={{ ["--folder-color" as string]: folder.color }}
      >
        <div
          className={`rail-item ${serverDropHint?.id === folder.id ? "drop-merge" : ""}`}
          {...folderDropProps(folder)}
        >
          {!open && containsActive ? (
            <span className="rail-active-pill" />
          ) : (
            !open && hasUnread && <span className="rail-unread-pill" />
          )}
          <button
            type="button"
            className="rail-folder-mark"
            aria-label={`${label} folder, ${open ? "open" : "closed"}`}
            aria-expanded={open}
            title={label}
            onClick={() => toggleFolderOpen(folder.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setFolderMenu({ folder, x: event.clientX, y: event.clientY });
            }}
          >
            {open ? (
              <Folder size={20} fill="currentColor" />
            ) : (
              <span className="rail-folder-grid">
                {folderServers.slice(0, 4).map((server) => (
                  <span
                    key={server.id}
                    style={{ background: server.color || "#a78bfa" }}
                  >
                    {server.iconUrl ? (
                      <img src={server.iconUrl} alt="" />
                    ) : (
                      server.icon || server.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                ))}
              </span>
            )}
            {!open && mentionTotal > 0 && <span className="rail-badge">{mentionTotal}</span>}
          </button>
        </div>
        {open && folderServers.map((server) => renderRailServer(server))}
      </div>
    );
  }

  function renderChannel(channel: PublicChannel) {
    if (channelKindInfo(channel.kind).appearsAsVoice) {
      const people = voiceRooms[channel.id] || [];
      const playing = hub.players[channel.id]?.track;
      // Merge channel-reorder drag props with a drop zone that accepts a
      // dragged voice member (a moderator moving someone into this room).
      const chanProps = channelDragProps(channel);
      const voiceDropProps = {
        onDragOver: (event: DragEvent<HTMLElement>) => {
          if (
            event.dataTransfer.types.includes(
              "application/x-huddle-voice-member",
            )
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            return;
          }
          chanProps.onDragOver?.(event);
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
          const personId = event.dataTransfer.getData(
            "application/x-huddle-voice-member",
          );
          if (personId) {
            event.preventDefault();
            event.stopPropagation();
            if (!people.some((person) => person.id === personId)) {
              void moveMember(personId, channel.id);
            }
            return;
          }
          chanProps.onDrop?.(event);
        },
      };
      const isConnectedVoice = voice.channelId === channel.id;
      return (
        <div
          key={channel.id}
          {...chanProps}
          {...voiceDropProps}
          className={`voice-room-wrapper ${isConnectedVoice ? "voice-active-contour" : ""}`}
        >
          <button
            className={`voice-room ${isConnectedVoice ? "selected-voice active-connected-room" : ""} ${stageChannelId === channel.id ? "viewing-voice" : ""}`}
            title={
              channel.topic
                ? `${channel.name} — ${channel.topic}`
                : channel.name
            }
            onClick={() => openVoiceChannel(channel)}
            onContextMenu={(event) => {
              event.preventDefault();
              setChannelMenu({ channel, x: event.clientX, y: event.clientY });
            }}
          >
            <span className={`speaker-icon ${isConnectedVoice ? "text-emerald-400" : ""}`}>
              {channelKindIcon(channel.kind, 16)}
            </span>
            <span className={isConnectedVoice ? "font-semibold text-[#c8bdf5]" : ""}>{channel.name}</span>
            {isConnectedVoice ? (
              <span className="voice-active-pill">
                {people.length > 0 ? `${people.length} active` : "connected"}
              </span>
            ) : people.length > 0 ? (
              <span className="live-pill">LIVE</span>
            ) : null}
            {canManageChannels && (
              <span
                className="channel-delete"
                role="button"
                aria-label={`Delete ${channel.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteChannel(channel);
                }}
              >
                ×
              </span>
            )}
          </button>

          {people.length > 0 && (
            <div className={`voice-members ${isConnectedVoice ? "contour-members" : ""}`}>
              {people.map((person) => {
                const isSpeaking = voice.speaking.has(
                  person.connectionId === hub.connectionId
                    ? "self"
                    : person.connectionId,
                );
                return (
                  <div
                    className={`voice-member ${canModerate && !person.bot ? "draggable-member" : ""
                      } ${isSpeaking ? "is-speaking" : ""}`}
                    key={person.connectionId}
                    draggable={canModerate && !person.bot}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        "application/x-huddle-voice-member",
                        person.id,
                      );
                    }}
                    onContextMenu={(event) => {
                      if (person.bot) {
                        openBotMenu(event, "music");
                        return;
                      }
                      const member = membersById.get(person.id);
                      if (member) openUserMenu(event, member);
                    }}
                    onClick={(event) => {
                      if (!touchInput) return;
                      if (person.bot) {
                        openBotMenu(event, "music");
                        return;
                      }
                      const member = membersById.get(person.id);
                      if (member) openUserMenu(event, member);
                    }}
                  >
                    <div className={`relative flex items-center justify-center ${isSpeaking ? "ring-2 ring-emerald-500/80 rounded-full" : ""}`}>
                      <Avatar
                        className="tiny-avatar"
                        avatar={person.avatar}
                        avatarUrl={person.avatarUrl}
                        color={person.color}
                      />
                    </div>
                    <span className={isSpeaking ? "font-medium text-[#ede9f6]" : ""}>
                      {person.connectionId === hub.connectionId
                        ? "You"
                        : person.displayName}
                      {isSpeaking && isConnectedVoice ? " (speaking)" : ""}
                    </span>
                    <VoiceDuration
                      className="voice-member-timer"
                      joinedAt={person.joinedAt}
                      serverNow={hub.serverNow}
                    />
                    {isSpeaking && (
                      <Mic size={12} className="text-emerald-400 ml-auto animate-pulse" />
                    )}
                    {person.muted && !person.bot && !isSpeaking && (
                      <span
                        className="muted-pill ml-auto"
                        title={person.serverMuted ? "Muted for everyone" : "Muted"}
                      >
                        <VolumeX size={14} />
                      </span>
                    )}
                    {person.deafened && !person.bot && (
                      <span className="deafened-pill ml-auto text-[#7d749a]" title="Deafened">
                        <Headphones size={13} />
                      </span>
                    )}
                    {person.bot && playing && (
                      <span className="speaking-bars ml-auto" aria-label="Playing">
                        <AudioLines size={14} />
                      </span>
                    )}
                    {person.bot && person.deafened && (
                      <span
                        className="bot-deafened-pill ml-auto"
                        title="The bot sends music but cannot hear the room"
                        aria-label="Bot deafened"
                      >
                        <Volume2 size={12} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={channel.id}
        className={`channel ${activeChannelId === channel.id && !stageChannelId ? "selected" : ""} ${unread[channel.id]?.unread ? "has-unread" : ""
          }`}
        {...channelDragProps(channel)}
        title={
          channel.topic
            ? `#${channel.name} — ${channel.topic}`
            : `#${channel.name}`
        }
        onClick={() => {
          setActiveChannelId(channel.id);
          setStageChannelId(null);
          setMobileNav(false);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setChannelMenu({ channel, x: event.clientX, y: event.clientY });
        }}
      >
        {unread[channel.id]?.unread && <span className="unread-pill" />}
        {channelKindIcon(channel.kind, 16, "channel-hash shrink-0")}
        <span>{channel.name}</span>
        {(unread[channel.id]?.mentions ?? 0) > 0 && (
          <span className="mention-badge">{unread[channel.id].mentions}</span>
        )}
        {canManageChannels && (
          <span
            className="channel-delete"
            role="button"
            aria-label={`Delete ${channel.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void deleteChannel(channel);
            }}
          >
            ×
          </span>
        )}
      </button>
    );
  }
  const currentPlayer = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;
  const musicBotActions: BotMenuAction[] = [
    { label: "Play something…", onSelect: () => prepareCommand("/play ") },
    { label: "Show queue", onSelect: () => prepareCommand("/queue") },
    { label: "Lyrics now", onSelect: () => void runCommand("/lyricsnow") },
    {
      label: "Toggle Smart Autoplay",
      onSelect: () => void runCommand("/autoplay"),
    },
    {
      label: "Toggle AutoMix",
      onSelect: () => void runCommand("/automix"),
    },
    { label: "Like this track", onSelect: () => void runCommand("/like") },
    {
      label: "Dislike this track",
      onSelect: () => void runCommand("/dislike"),
    },
    { label: "Listening stats", onSelect: () => void runCommand("/stats") },
    { label: "Room Wrapped", onSelect: () => void runCommand("/wrapped") },
    { label: "Music settings", onSelect: () => void runCommand("/settings") },
    ...(voice.channelId && currentPlayer?.track
      ? [
        {
          label: currentPlayer.paused ? "Resume" : "Pause",
          onSelect: () =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "toggle" },
            }),
        },
        {
          label: "Skip",
          onSelect: () =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "skip" },
            }),
        },
        {
          label: "Stop playing",
          danger: true,
          onSelect: () =>
            hub.send({
              t: "player",
              channelId: voice.channelId!,
              action: { name: "stop" },
            }),
        },
      ]
      : []),
    ...(user?.isAdmin || canModerate
      ? [
        {
          label: "Set room volume…",
          onSelect: () => prepareCommand("/volume "),
        },
      ]
      : []),
    ...(musicDashboardUrl
      ? [
        {
          label: "Open dashboard",
          onSelect: () => void openMusicDashboard(),
        },
        {
          label: "Open DJ booth",
          onSelect: () => void openMusicDashboard("dj"),
        },
      ]
      : []),
  ];
  const dndBotActions: BotMenuAction[] = [
    { label: "Roll dice…", onSelect: () => prepareCommand("/roll ") },
    { label: "Find a spell…", onSelect: () => prepareCommand("/spell ") },
    { label: "Find a monster…", onSelect: () => prepareCommand("/monster ") },
    ...(dndUrl
      ? [
        {
          label: "Open dashboard",
          onSelect: () =>
            window.open(dndUrl, "_blank", "noopener,noreferrer"),
        },
      ]
      : []),
  ];

  return (
    <main
      className={`app-shell ${mobileNav ? "nav-open" : ""} ${threadRoot ? "has-thread" : ""} ${membersOpen && !stageChannel ? "has-members" : ""}`}
      style={{
        "--sidebar-w": `${sidebarWidth}px`,
        "--thread-w": threadRoot ? `${threadWidth}px` : "0px",
        "--members-w": membersOpen && !stageChannel ? `${membersWidth}px` : "0px",
      } as React.CSSProperties}
    >
      <ConnectionBanner connected={hub.connected} />
      {msnTheme && (
        <>
        {soundsOpen && <MsnSoundsDialog onClose={() => setSoundsOpen(false)} />}
        {hoverCard && (
          <MsnHoverCard
            name={hoverCard.member.displayName}
            username={hoverCard.member.username}
            avatar={hoverCard.member.avatar}
            avatarUrl={hoverCard.member.avatarUrl}
            color={hoverCard.member.color}
            presence={
              PRESENCE[
                (presenceOf(hoverCard.member) === "offline"
                  ? "invisible"
                  : presenceOf(hoverCard.member)) as PresenceStatus
              ]
            }
            offline={presenceOf(hoverCard.member) === "offline"}
            personalMessage={
              hoverCard.member.id === user?.id ? myCustomStatus : hoverCard.member.customStatus
            }
            group={
              msnContacts.contacts.groups.find(
                (g) => g.id === msnContacts.contacts.placement[hoverCard.member.id],
              )?.name
            }
            style={{ top: hoverCard.top, left: hoverCard.left }}
            onEnter={() => hoverTimer.current && window.clearTimeout(hoverTimer.current)}
            onLeave={() => queueHoverCard(null)}
            onMessage={
              hoverCard.member.id === user?.id
                ? undefined
                : () => {
                    const id = hoverCard.member.id;
                    setHoverCard(null);
                    void openDm(id);
                  }
            }
            onProfile={() => {
              const member = hoverCard.member;
              setHoverCard(null);
              openProfile(member);
            }}
          />
        )}
        {pictureOpen && (
          <MsnPicturePicker
            onPick={setStockPicture}
            onBrowse={() => {
              setPictureOpen(false);
              setSettingsOpen(true);
            }}
            onClose={() => setPictureOpen(false)}
          />
        )}
        {todayOpen && todayData && user && (
          <MsnToday
            userName={user.displayName}
            online={todayData.online}
            waiting={todayData.waiting}
            playing={todayData.playing}
            whatsNew={whatsNew.feed}
            serverIds={servers.map((server) => server.id)}
            onOpenPerson={(id) => {
              setTodayOpen(false);
              void openDm(id);
            }}
            onOpenEvent={(event) => {
              setTodayOpen(false);
              setActiveServerId(event.serverId);
              setStageChannelId(null);
              setEventsOpen(true);
            }}
            onClose={() => setTodayOpen(false)}
          />
        )}
        <MsnSignInToasts
          online={hub.online}
          people={members
            .filter((m) => !msnContacts.contacts.quiet.includes(m.id))
            .map((m) => ({ ...m, name: m.displayName }))}
          selfId={user?.id ?? null}
          connected={hub.connected}
          onOpen={(id) => void openDm(id)}
        />
        </>
      )}

      {/* Tapping outside the drawer on a phone closes it. */}
      <div
        className="mobile-nav-backdrop"
        onClick={() => setMobileNav(false)}
        aria-hidden="true"
      />
      <aside className="rail" aria-label="Servers">
        <div className="rail-item">
          {inDmHome && <span className="rail-active-pill" />}
          <button
            className={`brand-mark ${inDmHome ? "active-space" : ""}`}
            aria-label="Direct messages"
            title="Direct messages"
            onClick={() => {
              setActiveServerId(DM_HOME);
              setActiveChannelId(visibleDms[0]?.channelId || null);
              setStageChannelId(null);
              setMobileNav(false);
            }}
          >
            CC
            {dmUnreadTotal > 0 && !inDmHome && (
              <span className="rail-badge">{dmUnreadTotal}</span>
            )}
          </button>
        </div>

        <div className="rail-divider" />
        {railEntries(servers, serverFolders).map((entry) =>
          entry.kind === "server"
            ? renderRailServer(entry.server)
            : renderRailFolder(entry.folder, entry.servers),
        )}
        <button
          className="space-mark add-space"
          aria-label="Create a server"
          title="Create a server"
          onClick={createServer}
        >
          +
        </button>

        <div className="rail-divider" />

        {/* Quick DMs directly on rail from Figma design */}
        {visibleDms.slice(0, 4).map((dm) => {
          const isActive = inDmHome && activeChannelId === dm.channelId;
          const count = unread[dm.channelId]?.count || 0;
          const presence = presenceOf(dm.user);
          return (
            <div key={dm.channelId} className="rail-item">
              {isActive && (
                <span
                  className="rail-active-pill"
                  style={{ background: dm.user.color || "#a78bfa" }}
                />
              )}
              <button
                className={`rail-dm ${isActive ? "active-space" : ""}`}
                title={`${dm.user.displayName}${count > 0 ? ` · ${count} new` : ""}`}
                aria-label={`${dm.user.displayName}, ${count} unread`}
                onClick={() => {
                  setActiveServerId(DM_HOME);
                  setActiveChannelId(dm.channelId);
                  setStageChannelId(null);
                  setMobileNav(false);
                }}
              >
                <div className="relative flex-shrink-0">
                  <Avatar
                    className="rail-dm-avatar"
                    avatar={dm.user.avatar}
                    avatarUrl={dm.user.avatarUrl}
                    color={dm.user.color}
                  />
                  {!dm.group && (
                    <span
                      className={`rail-dm-online-dot is-${presence === "invisible" ? "offline" : presence}`}
                    />
                  )}
                  {voiceRooms[dm.channelId]?.length > 0 && (
                    <span className="dm-call-active-indicator" title="Active voice call" />
                  )}
                </div>
                {count > 0 && <span className="rail-badge">{count}</span>}
              </button>
            </div>
          );
        })}
        <div className="rail-spacer" />

        {statusOpen && (
          <div className="status-menu" role="menu">
            {(Object.keys(PRESENCE) as PresenceStatus[]).map((key) => (
              <button
                key={key}
                type="button"
                className={myStatus === key ? "active" : ""}
                onClick={() => {
                  autoIdleRef.current = false;
                  void savePresence({ status: key });
                  setStatusOpen(false);
                }}
              >
                <span
                  className="status-dot"
                  style={{ background: PRESENCE[key].color }}
                />
                {PRESENCE[key].label}
              </button>
            ))}
            {msnTheme &&
              MSN_EXTRA_STATUSES.map((extra) => (
                <button
                  key={extra.label}
                  type="button"
                  className={myStatus === extra.status && myCustomStatus === extra.text ? "active" : ""}
                  onClick={() => {
                    autoIdleRef.current = false;
                    void savePresence({ status: extra.status, customStatus: extra.text });
                    setStatusOpen(false);
                  }}
                >
                  <span
                    className="status-dot"
                    style={{ background: PRESENCE[extra.status].color }}
                  />
                  {extra.label}
                </button>
              ))}
            {msnTheme && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={shareListening}
                className={shareListening ? "active" : ""}
                onClick={() => {
                  const next = !shareListening;
                  setShareListening(next);
                  try {
                    window.localStorage.setItem("huddle-msn-listening", next ? "1" : "0");
                  } catch {
                    // Storage blocked: applies until reload.
                  }
                  setStatusOpen(false);
                }}
              >
                <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
                  {shareListening ? "✓" : "♫"}
                </span>
                Show what I&apos;m listening to
              </button>
            )}
            {msnTheme && (
              <button
                type="button"
                onClick={() => {
                  setStatusOpen(false);
                  setSoundsOpen(true);
                }}
              >
                <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
                  🔔
                </span>
                Sounds…
              </button>
            )}
            {msnTheme && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={Boolean(autoReply)}
                className={autoReply ? "active" : ""}
                onClick={() => {
                  setStatusOpen(false);
                  showCustomPrompt({
                    title: "Auto-reply when away",
                    message:
                      "While you're Away or Busy, the first person to message you in each DM gets this reply. Leave it empty to turn it off.",
                    defaultValue: autoReply ?? "I'm away from my computer right now. I'll get back to you soon!",
                    confirmText: "Save",
                    maxLength: 200,
                    onConfirm: (text) => {
                      if (text === undefined) return;
                      const clean = text.trim() || null;
                      setAutoReply(clean);
                      try {
                        if (clean) window.localStorage.setItem("huddle-msn-autoreply", clean);
                        else window.localStorage.removeItem("huddle-msn-autoreply");
                      } catch {
                        // Storage blocked: applies until reload.
                      }
                    },
                  });
                }}
              >
                <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
                  {autoReply ? "✓" : "💬"}
                </span>
                Auto-reply when away…
              </button>
            )}
            {msnTheme && (
              <button
                type="button"
                onClick={() => {
                  setStatusOpen(false);
                  setPictureOpen(true);
                }}
              >
                <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
                  🖼
                </span>
                Change display picture…
              </button>
            )}
            {msnTheme && (
              <button
                type="button"
                onClick={() => {
                  setStatusOpen(false);
                  setTodayOpen(true);
                }}
              >
                <span className="status-dot msn-listening-dot" style={{ background: "transparent" }}>
                  ☀
                </span>
                Open MSN Today
              </button>
            )}
            <div className="status-menu-divider" />
            <button
              type="button"
              onClick={() => {
                setStatusOpen(false);
                showCustomPrompt({
                  title: "Set Custom Status",
                  message: "What's on your mind?",
                  defaultValue: myCustomStatus || "",
                  placeholder: "e.g. In a meeting / Coding...",
                  confirmText: "Save Status",
                  onConfirm: (text) => {
                    if (text === undefined) return;
                    void savePresence({ customStatus: text });
                  },
                });
              }}
            >
              <span className="status-dot" style={{ background: "transparent" }}>
                <Pencil size={13} />
              </span>
              {myCustomStatus ? "Edit status" : "Set a status"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusOpen(false);
                setSettingsOpen(true);
              }}
            >
              <span className="status-dot flex items-center justify-center" style={{ background: "transparent" }}>
                <User size={14} />
              </span>
              Edit Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusOpen(false);
                setSettingsOpen(true);
              }}
            >
              <span className="status-dot flex items-center justify-center" style={{ background: "transparent" }}>
                <Settings size={14} />
              </span>
              Settings
            </button>
          </div>
        )}
        {/* 
        <Avatar
          className="profile-dot"
          avatar={user.avatar}
          avatarUrl={user.avatarUrl}
          color={user.color}
          title={
            myCustomStatus ||
            `${PRESENCE[myStatus].label} · click for status, right-click for settings`
          }
          onClick={() => setStatusOpen((open) => !open)}
          onContextMenu={(event) => {
            event.preventDefault();
            setSettingsOpen(true);
          }}
        >
          <span
            className="presence-dot"
            style={{
              background: hub.connected
                ? PRESENCE[myStatus].color
                : PRESENCE.invisible.color,
            }}
          />
        </Avatar> */}
      </aside>

      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        {/* Mobile close button from Figma */}
        <div className="mobile-drawer-header md:hidden">
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        {activeServer?.bannerUrl && !inDmHome && (
          <div
            className="server-banner-header"
            style={{
              backgroundImage: `url(${activeServer.bannerUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              height: "120px",
              width: "100%",
              flexShrink: 0,
            }}
          />
        )}
        <header className="space-header" style={{ position: "relative" }}>
          <div>
            <span className="eyebrow">
              {inDmHome ? "PRIVATE" : "PRIVATE SPACE"}
            </span>
            <h1>{inDmHome ? "Direct messages" : activeServer?.name || "Huddle"}</h1>
          </div>
          {!inDmHome && (
            <Icon label="Server settings" onClick={() => setServerMenuOpen((o) => !o)}>
              •••
            </Icon>
          )}

          {serverMenuOpen && !inDmHome && activeServer && (
            <div className="server-menu-dropdown" role="menu">
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  setServerSettingsOpen(true);
                }}
              >
                <span className="flex items-center gap-2">
                  <Settings size={16} /> Server Settings
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  showCustomPrompt({
                    title: "Rename Server",
                    message: "Enter a new name for this server:",
                    defaultValue: activeServer.name,
                    confirmText: "Save Name",
                    onConfirm: async (name) => {
                      if (!name?.trim()) return;
                      const data = await apiFetch<{ servers: PublicServer[] }>(
                        `/api/servers/${activeServer.id}`,
                        { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
                      ).catch(() => null);
                      if (data) setServers(data.servers);
                    },
                  });
                }}
              >
                <span className="flex items-center gap-2">
                  <Pencil size={16} /> Rename Server
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  // The same five-kind picker as the sidebar's "+".
                  setKindMenu({ categoryId: null });
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} /> Create Channel
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  markServerRead(activeServer);
                }}
              >
                <span className="flex items-center gap-2">
                  <CheckCheck size={16} /> Mark as Read
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false);
                  const key = `server:${activeServer.id}`;
                  setNotifyLevel(key, channelPrefs[key] ? "all" : "mentions");
                }}
              >
                <span className="flex items-center gap-2">
                  {channelPrefs[`server:${activeServer.id}`] ? (
                    <><Bell size={16} /> Unmute Server</>
                  ) : (
                    <><BellOff size={16} /> Mute Server</>
                  )}
                </span>
              </button>
              <div className="server-menu-divider" />
              {canManageServer && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setServerMenuOpen(false);
                    showCustomConfirm({
                      title: `Delete '${activeServer.name}'?`,
                      message: "Are you sure? This will permanently delete the server and all channels.",
                      isDanger: true,
                      confirmText: "Delete Server",
                      onConfirm: async () => {
                        const data = await apiFetch<{ servers: PublicServer[] }>(
                          `/api/servers/${activeServer.id}`,
                          { method: "DELETE" },
                        ).catch(() => null);
                        if (data) {
                          setServers(data.servers);
                          setActiveServerId(data.servers[0]?.id || null);
                        }
                      },
                    });
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 size={16} /> Delete Server
                  </span>
                </button>
              )}
            </div>
          )}
        </header>

        {inDmHome ? (
          <nav className="channel-nav" aria-label="Conversations">
            <div className="px-2 pt-1 pb-2">
              <button
                type="button"
                onClick={() => setGlobalSearchOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#9d95bc] hover:text-white transition-colors text-xs font-semibold border border-white/[0.04]"
                title="Search all users (⌘K)"
              >
                <span className="flex items-center gap-2">
                  <Search size={14} className="text-[#a78bfa]" />
                  <span>Find conversation or user</span>
                </span>
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-[#9d95bc]">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="px-2 pb-2">
              <button
                type="button"
                onClick={() => {
                  setActiveChannelId(null);
                  setStageChannelId(null);
                  setMobileNav(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${!activeChannelId && !stageChannelId
                  ? "bg-white/[0.12] text-white"
                  : "text-[#9d95bc] hover:bg-white/[0.05] hover:text-white"
                  }`}
              >
                <Users size={18} className={!activeChannelId && !stageChannelId ? "text-[#a78bfa]" : "text-[#7c7599]"} />
                <span className="flex-1 text-left">Friends</span>
                {pendingFriendCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500 text-white font-black text-[11px] leading-tight">
                    {pendingFriendCount}
                  </span>
                )}
              </button>
            </div>

            <div className="section-label flex items-center justify-between">
              <span>DIRECT MESSAGES</span>
              {user && (
                <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="hover:text-white transition-colors"
                  title="Create DM or group"
                  aria-label="Create DM or group"
                  onClick={() => setGroupDialog({ mode: "create" })}
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="hover:text-white transition-colors"
                  title="Note to Self"
                  onClick={() => void openDm(user.id)}
                >
                  <StickyNote size={14} />
                </button>
                </span>
              )}
            </div>
            {visibleDms.map((dm) => {
              const isSelf = Boolean(user && dm.user.id === user.id);
              return (
                <div key={dm.channelId} className="dm-row">
                <button
                  className={`channel dm-channel ${activeChannelId === dm.channelId ? "selected" : ""} ${unread[dm.channelId]?.unread ? "has-unread" : ""
                    }`}
                  onClick={() => {
                    setActiveChannelId(dm.channelId);
                    setStageChannelId(null);
                    setMobileNav(false);
                  }}
                  onContextMenu={(event) => {
                    if (dm.group) {
                      event.preventDefault();
                      return;
                    }
                    openUserMenu(event, dm.user);
                  }}
                >
                  {unread[dm.channelId]?.unread && <span className="unread-pill" />}
                  <Avatar
                    className="tiny-avatar"
                    avatar={dm.user.avatar}
                    avatarUrl={dm.user.avatarUrl}
                    color={dm.user.color}
                  />
                  {dm.group ? (
                    <span className="dm-group-label">
                      <span className="truncate"><StyledText text={dm.user.displayName} /></span>
                      <small>
                        {dm.group.members.length}{" "}
                        {dm.group.members.length === 1 ? "Member" : "Members"}
                      </small>
                    </span>
                  ) : (
                  <span className="flex items-center gap-1.5 truncate">
                    <StyledText text={dm.user.displayName} />
                    {isSelf && " (Notes)"}
                  </span>
                  )}
                  {dm.group ? null : isSelf ? (
                    <StickyNote size={12} className="text-amber-400/80 ml-auto flex-shrink-0" />
                  ) : (
                    hub.online.has(dm.user.id) && <i className="dm-online" />
                  )}
                  {voiceRooms[dm.channelId]?.length > 0 && (
                    <PhoneCall size={12} className="text-green-400 ml-auto animate-pulse" />
                  )}
                  {(unread[dm.channelId]?.count ?? 0) > 0 && (
                    <span className="mention-badge">
                      {unread[dm.channelId].count}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="dm-close"
                  aria-label={`Close conversation with ${dm.user.displayName}`}
                  title="Close (messages are kept, reopen with Cmd+K)"
                  onClick={() => void setDmClosed(dm.channelId, true)}
                >
                  <X size={13} />
                </button>
                </div>
              );
            })}
            {!visibleDms.length && (
              <p className="sidebar-empty">
                Right-click someone or click the note icon above to start a conversation.
              </p>
            )}
          </nav>
        ) : (
          <nav className="channel-nav" aria-label="Channels">
            <div className="section-label">
              <span>CHANNELS</span>
              {canManageChannels && (
                <span className="section-actions">
                  <button
                    aria-label="Add category"
                    title="Add category"
                    onClick={() => void addCategory()}
                  >
                    <ChevronDown size={14} /><Plus size={14} />
                  </button>
                  {/* One picker for all five kinds. Separate text/voice buttons
                      made the other three undiscoverable. */}
                  <span className="channel-kind-picker">
                    <button
                      aria-label="Create channel"
                      title="Create channel"
                      aria-haspopup="menu"
                      aria-expanded={kindMenu?.categoryId === null}
                      onClick={() =>
                        setKindMenu(kindMenu?.categoryId === null ? null : { categoryId: null })
                      }
                    >
                      <Plus size={14} />
                    </button>
                    {kindMenu?.categoryId === null && renderKindMenu(null)}
                  </span>
                </span>
              )}
            </div>

            <button
              type="button"
              className={`events-chip ${nextEvent && eventIsOpen(nextEvent) ? "is-open" : ""}`}
              onClick={() => setEventsOpen(true)}
              title={nextEvent ? `${nextEvent.title} · ${eventWhen(nextEvent)}` : "Plan an event"}
            >
              <CalendarDays size={15} />
              {nextEvent ? (
                <span className="events-chip-text">
                  <strong>{nextEvent.title}</strong>
                  <small>{eventWhen(nextEvent)}</small>
                </span>
              ) : (
                <span className="events-chip-text">
                  <strong>Events</strong>
                </span>
              )}
              {serverEvents.length > 1 && <span className="events-chip-count">{serverEvents.length}</span>}
            </button>

            {/* Uncategorised channels sit above every category, Discord-style. */}
            <div className="category-body" {...categoryDropProps(null)}>
              {channelLayout.uncategorised.map((channel) => renderChannel(channel))}
            </div>

            {channelLayout.grouped.map(({ category, channels }) => {
              const collapsed = collapsedCats.has(category.id);
              return (
                <div className="category" key={category.id}>
                  <div
                    className="category-head"
                    {...categoryDropProps(category.id)}
                  >
                    <button
                      className="category-toggle"
                      onClick={() => toggleCategory(category.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (canManageChannels)
                          void renameCategory(category.id, category.name);
                      }}
                    >
                      <ChevronDown
                        size={14}
                        className={`cat-caret transition-transform ${collapsed ? "-rotate-90" : ""}`}
                      />
                      <span>{category.name}</span>
                    </button>
                    {canManageChannels && (
                      <span className="category-actions">
                        <span className="channel-kind-picker">
                          <button
                            aria-label={`Add channel to ${category.name}`}
                            title="Add channel here"
                            aria-haspopup="menu"
                            aria-expanded={kindMenu?.categoryId === category.id}
                            onClick={() =>
                              setKindMenu(
                                kindMenu?.categoryId === category.id
                                  ? null
                                  : { categoryId: category.id },
                              )
                            }
                          >
                            +
                          </button>
                          {kindMenu?.categoryId === category.id && renderKindMenu(category.id)}
                        </span>
                        <button
                          aria-label={`Delete ${category.name}`}
                          title="Delete category"
                          onClick={() => void deleteCategory(category.id, category.name)}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="category-body" {...categoryDropProps(category.id)}>
                      {channels.map((channel) => renderChannel(channel))}
                      {!channels.length && (
                        <p className="category-empty">Drag channels here</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          </nav>
        )}

        {/* Synchronized Music Bar - sits on top of mini-voice-bar */}
        {roomPlayer?.track && (
          <MiniMusicBar
            state={roomPlayer}
            position={player.position}
            controllable
            onToggle={() =>
              hub.send({
                t: "player",
                channelId: voice.channelId!,
                action: { name: "toggle" },
              })
            }
            onSeek={(positionMs) =>
              hub.send({
                t: "player",
                channelId: voice.channelId!,
                action: { name: "seek", positionMs },
              })
            }
            onSkip={() =>
              hub.send({
                t: "player",
                channelId: voice.channelId!,
                action: { name: "skip" },
              })
            }
          />
        )}

        {/* Mini voice bar - seamless top extension of discord-user-footer */}
        {voice.channelId && (
          <div className="mini-voice-bar">
            <div className="mini-voice-bar-header">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="mini-voice-dot animate-pulse" />
                <div className="mini-voice-info min-w-0">
                  <span className="mini-voice-name truncate">
                    {servers
                      .flatMap((s) => s.channels)
                      .find((c) => c.id === voice.channelId)?.name || "Voice Connected"}
                  </span>
                  <span className="mini-voice-status">voice connected</span>
                </div>
              </div>
              <div className="mini-voice-actions flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  className={`mini-voice-btn ${quickSoundboardOpen ? "on" : ""}`}
                  onClick={() => setQuickSoundboardOpen((o) => !o)}
                  title={quickSoundboardOpen ? "Close soundboard" : "Soundboard"}
                >
                  <Volume2 size={14} />
                </button>
                <button
                  type="button"
                  className={`mini-voice-btn ${voice.screenSharing ? "on" : ""}`}
                  onClick={() =>
                    voice.screenSharing
                      ? voice.stopScreenShare()
                      : void voice.startScreenShare()
                  }
                  title={voice.screenSharing ? "Stop sharing screen" : "Share screen"}
                >
                  <Monitor size={14} />
                </button>
                <button
                  type="button"
                  className={`mini-voice-btn ${voice.cameraOn ? "on" : ""}`}
                  onClick={() =>
                    voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
                  }
                  title={voice.cameraOn ? "Turn camera off" : "Camera"}
                >
                  {voice.cameraOn ? <VideoOff size={14} /> : <Video size={14} />}
                </button>
                <button
                  type="button"
                  className="mini-voice-leave"
                  onClick={() => voice.leave()}
                  title="Disconnect"
                >
                  <PhoneOff size={14} />
                </button>
              </div>
            </div>
            {quickSoundboardOpen && (
              <div className="soundboard-quick-popover">
                <SoundboardDrawer
                  serverId={servers.find((s) => s.channels.some((c) => c.id === voice.channelId))?.id || null}
                  channelId={voice.channelId}
                  canManage={false}
                  onClose={() => setQuickSoundboardOpen(false)}
                />
              </div>
            )}
          </div>
        )}

        {user && (
          <UserFooter
            user={user}
            status={myStatus}
            customStatus={myCustomStatus || undefined}
            muted={voice.muted}
            deafened={voice.deafened}
            onToggleMute={voice.toggleMute}
            onToggleDeafen={voice.toggleDeafen}
            onOpenStatusMenu={() => setStatusOpen((o) => !o)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenProfileSettings={() => setSettingsOpen(true)}
          />
        )}

        {/* Sidebar Resize Handle (Desktop) */}
        <div
          className="sidebar-resize-handle"
          onMouseDown={onSidebarResizeDown}
          title="Drag to resize channels"
        />
      </aside>

      <section
        className={`chat-panel ${dragging ? "drop-target" : ""}`}
        onDragOver={onChannelDragOver}
        onDragLeave={(event) => {
          // Ignore the flicker as the pointer crosses child elements.
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={onChannelDrop}
      >
        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            <div>Drop to attach · images and PDFs</div>
          </div>
        )}
        {!stageChannel && (
          <DiceOverlay
            roll={diceRoll}
            onDone={() => setDiceRoll(null)}
            className="dice-overlay chat-dice-overlay"
          />
        )}
        {inDmHome && !activeChannelId && !stageChannel ? (
          <FriendsView
            onlineUserIds={hub.online}
            onOpenDm={(targetUser) => {
              void openDm(targetUser.id);
            }}
            onPendingCountChange={(count) => {
              setPendingFriendCount(count);
            }}
            onOpenMobileNav={() => setMobileNav(true)}
          />
        ) : (
          <>
            <header className="chat-header">
              <button
                className="mobile-menu"
                aria-label="Open channels"
                onClick={() => setMobileNav((open) => !open)}
              >
                <Menu size={20} />
              </button>
              <span className="big-hash">
                {stageChannel ? (
                  channelKindIcon(stageChannel.kind, 20)
                ) : inDmHome ? (
                  isSelfDm ? (
                    <StickyNote size={20} />
                  ) : (
                    <AtSign size={20} />
                  )
                ) : (
                  channelKindIcon(activeChannel?.kind ?? "text", 20)
                )}
              </span>
              <div className="channel-heading">
                <strong>{stageChannel ? stageChannel.name : channelTitle}</strong>
                <span>
                  {stageChannel
                    ? voiceParticipants.length === 1
                      ? "Just you so far"
                      : `${voiceParticipants.length} in the room`
                    : inDmHome
                      ? activeDm
                        ? isSelfDm
                          ? "Your personal space for notes, drafts, and to-dos"
                          : activeDm.group
                            ? `${activeDm.group.members.length} ${activeDm.group.members.length === 1 ? "member" : "members"}`
                            : `Just you and ${activeDm.user.displayName}`
                        : "Pick a conversation"
                      : activeChannel?.topic ||
                      (activeChannel
                        ? `Everything happening in ${activeChannel.name}`
                        : "Create a channel to start talking")}
                </span>
              </div>
              <div className="header-actions">
                {inDmHome && activeDm?.group && (
                  <div className="dm-call-actions">
                    <button
                      type="button"
                      className="dm-call-btn flex items-center gap-1.5"
                      onClick={() => setGroupDialog({ mode: "add", channelId: activeDm.channelId })}
                      title="Add friends to this group"
                    >
                      <UserPlus size={15} /> Add
                    </button>
                    <button
                      type="button"
                      className="dm-call-btn flex items-center gap-1.5"
                      onClick={() => renameGroupDm(activeDm)}
                      title="Rename group"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="dm-call-btn flex items-center gap-1.5"
                      onClick={() => leaveGroupDm(activeDm)}
                      title="Leave group"
                    >
                      <LogOut size={15} />
                    </button>
                  </div>
                )}
                {inDmHome && activeChannelId && !isSelfDm && !activeDm?.group && (
                  <div className="dm-call-actions">
                    {dmCall && dmCall.channelId === activeChannelId ? (
                      <button
                        type="button"
                        className="dm-call-btn flex items-center gap-1.5"
                        onClick={() => setStageChannelId(activeChannelId)}
                        title="Open Full Call View"
                      >
                        <Maximize2 size={15} /> Call View
                      </button>
                    ) : voiceRooms[activeChannelId]?.length > 0 && voice.channelId !== activeChannelId ? (
                      <button
                        type="button"
                        className="dm-join-call-btn flex items-center gap-1.5"
                        onClick={() => {
                          void voice.join(activeChannelId);
                          if (activeDm) {
                            setDmCall({
                              channelId: activeChannelId,
                              otherUser: activeDm.user,
                              status: "connected",
                              startTime: Date.now(),
                            });
                          }
                        }}
                        title="Join Ongoing Call"
                      >
                        <PhoneCall size={15} /> Join Call
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="dm-call-btn flex items-center gap-1.5"
                          onClick={() => startDmCall(false)}
                          title="Start Voice Call"
                        >
                          <PhoneCall size={15} /> Start Call
                        </button>
                        <button
                          type="button"
                          className="dm-call-btn flex items-center gap-1.5"
                          onClick={() => startDmCall(true)}
                          title="Start Video Call"
                        >
                          <Video size={15} /> Video Call
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!inDmHome && (
                  <Icon
                    label="Find users"
                    onClick={() => setGlobalSearchOpen(true)}
                  >
                    <UserPlus size={18} />
                  </Icon>
                )}
                {!inDmHome && (
                  <Icon
                    label="Search messages"
                    active={searchOpen}
                    onClick={() => setSearchOpen((open) => !open)}
                  >
                    <Search size={18} />
                  </Icon>
                )}
                <Icon
                  label="Mentions"
                  active={mentionsOpen}
                  badge={unreadMentionTotal}
                  onClick={() => setMentionsOpen((open) => !open)}
                >
                  <AtSign size={18} />
                </Icon>
                <Icon
                  label="Pinned messages"
                  active={pinsOpen}
                  onClick={() => setPinsOpen((open) => !open)}
                >
                  <Pin size={18} />
                </Icon>
                <Icon
                  label={`Switch to ${theme === "light" ? "cozy" : "light"} mode`}
                  onClick={() => applyTheme(theme === "light" ? "cozy" : "light")}
                >
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                </Icon>
                <Icon label="Settings" onClick={() => setSettingsOpen(true)}>
                  <Settings size={18} />
                </Icon>
                <Icon
                  label="Toggle member list"
                  active={membersOpen}
                  onClick={() => setMembersOpen((open) => !open)}
                >
                  <Users size={18} />
                </Icon>
              </div>
            </header>

            {stageChannel ? (
              <VoiceStage
                channelName={stageChannel.name}
                participants={voiceParticipants}
                connectionId={hub.connectionId}
                serverNow={hub.serverNow}
                voice={voice}
                joined={voice.channelId === stageChannel.id}
                onJoin={() => void openVoiceChannel(stageChannel)}
                onExit={() => setStageChannelId(null)}
                serverId={stageChannel.serverId}
                canManageSounds={canManageChannels}
                // A stage has an audience, so the view splits the room into
                // audible and listening, and offers the listening half a hand.
                stageMode={channelKindInfo(stageChannel.kind).kind === "stage"}
                // Hosts host: moving seats on and off the stage is a moderation
                // action, and the hub rechecks the same permission.
                canManageStage={hasPermission(myPermissions, Permission.MUTE_MEMBERS)}
                userId={user.id}
                userName={user.displayName}
                activity={roomActivity}
                onActivity={setRoomActivity}
                diceRoll={diceRoll}
                onDiceRollDone={() => setDiceRoll(null)}
                onOpenParticipantMenu={(event, person) => {
                  if (person.bot) {
                    openBotMenu(event, "music");
                    return;
                  }
                  const member = membersById.get(person.id);
                  if (member) openUserMenu(event, member);
                }}
                recording={
                  features.recordSessions ? (
                    <RecordingDirector
                      channelId={stageChannel.id}
                      recording={hub.recordings[stageChannel.id] || null}
                      participants={voiceParticipants}
                      currentUserId={user.id}
                      canControl={canRecordSessions}
                      speaking={voice.speaking}
                      onNotice={setNotice}
                    />
                  ) : null
                }
                battlemapOpen={Boolean(battlemap) && !battlemapHidden}
                onToggleBattlemap={() => {
                  if (!battlemap) {
                    if (battlemapGm) void openBattlemap();
                    else setNotice("No map is on the table yet.");
                    return;
                  }
                  toggleBattlemap();
                }}
                battlemap={
                  battlemap && !battlemapHidden ? (
                    <BattlemapBoard
                      channelId={stageChannel.id}
                      map={battlemap}
                      gm={battlemapGm}
                      userId={user.id}
                      onClose={closeBattlemap}
                      onAddMyToken={() => void addMyToken()}
                      onLocalToken={onLocalToken}
                      onLocalStroke={onLocalStroke}
                    />
                  ) : null
                }
                onClip={async (clip) => {
                  if (!activeChannelId) {
                    setNotice("Open a text channel to post the clip into.");
                    return;
                  }
                  const form = new FormData();
                  form.append(
                    "file",
                    new File([clip], `clip-${Date.now()}.webm`, { type: clip.type }),
                  );
                  const upload = await apiFetch<{ key: string }>("/api/uploads", {
                    method: "POST",
                    body: form,
                  });
                  await apiFetch("/api/messages", {
                    method: "POST",
                    body: JSON.stringify({
                      channelId: activeChannelId,
                      content: `Clipped the last ${voice.clipSeconds}s of ${stageChannel.name}`,
                      audio: `/hangout/api/uploads/${encodeURIComponent(upload.key)}`,
                    }),
                  });
                  setNotice("Clip posted.");
                }}
              />
            ) : (
              <>
                {searchOpen && (
                  <div className="search-panel">
                    <div className="search-head">
                      <input
                        autoFocus
                        value={searchQuery}
                        placeholder={`Search #${channelTitle}'s server…`}
                        onChange={(event) => void runSearch(event.target.value)}
                        aria-label="Search messages"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setSearchQuery("");
                          setSearchResults([]);
                        }}
                        aria-label="Close search"
                      >
                        ×
                      </button>
                    </div>
                    <div className="search-filter-pills">
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("from:") ? searchQuery : `from: ${searchQuery}`.trim();
                          setSearchQuery(q);
                        }}
                      >
                        from:
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("in:") ? searchQuery : `in: ${searchQuery}`.trim();
                          setSearchQuery(q);
                        }}
                      >
                        in:
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("has:link") ? searchQuery : `${searchQuery} has:link`.trim();
                          setSearchQuery(q);
                          void runSearch(q);
                        }}
                      >
                        has:link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const q = searchQuery.includes("has:file") ? searchQuery : `${searchQuery} has:file`.trim();
                          setSearchQuery(q);
                          void runSearch(q);
                        }}
                      >
                        has:file
                      </button>
                    </div>
                    <div className="search-results">
                      {searchResults.map((result) => (
                        <button
                          type="button"
                          key={result.id}
                          className="search-result"
                          onClick={() => jumpToMessage(result.channelId, result.id)}
                        >
                          <span className="search-result-meta">
                            <span className="channel-hash">#</span>
                            {result.channelName} · <strong>{result.author}</strong>
                          </span>
                          <span className="search-result-snippet">{result.snippet}</span>
                        </button>
                      ))}
                      {searchQuery.length >= 2 && !searchResults.length && (
                        <p className="pins-empty">Nothing matched that.</p>
                      )}
                    </div>
                  </div>
                )}

                {mentionsOpen && (
                  <div className="pins-panel mentions-panel">
                    <div className="pins-head">
                      <strong>Mentions</strong>
                      <button
                        type="button"
                        className="popup-close-x"
                        onClick={() => setMentionsOpen(false)}
                        aria-label="Close mentions"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="mentions-tabs" role="tablist">
                      {(["all", "unread"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          role="tab"
                          aria-selected={mentionsTab === tab}
                          className={mentionsTab === tab ? "active" : ""}
                          onClick={() => setMentionsTab(tab)}
                        >
                          {tab === "all" ? "All" : `Unread${unreadMentionTotal ? ` (${unreadMentionTotal})` : ""}`}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      if (!mentionInbox) return <p className="pins-empty">Loading…</p>;
                      const shown =
                        mentionsTab === "unread"
                          ? mentionInbox.filter((entry) => !entry.read)
                          : mentionInbox;
                      if (!shown.length) {
                        return (
                          <p className="pins-empty">
                            {mentionsTab === "unread"
                              ? "You're all caught up."
                              : "Nobody has mentioned you yet."}
                          </p>
                        );
                      }
                      return shown.map((entry) => (
                        <button
                          type="button"
                          key={entry.message.id}
                          className={`search-result mention-entry ${entry.read ? "" : "is-unread"}`}
                          onClick={() => openMention(entry)}
                        >
                          <span className="search-result-meta">
                            {entry.serverName ? (
                              <>
                                {entry.serverName} · <span className="channel-hash">#</span>
                                {entry.channelName}
                              </>
                            ) : (
                              "Direct message"
                            )}
                            {" · "}
                            {formatClientDateTime(entry.message.createdAt)}
                          </span>
                          <span className="search-result-meta">
                            <strong>{entry.message.author}</strong>
                          </span>
                          <span className="search-result-snippet">{entry.message.text}</span>
                        </button>
                      ));
                    })()}
                  </div>
                )}

                {pinsOpen && (
                  <div className="pins-panel">
                    <div className="pins-head">
                      <strong>Pinned in {channelTitle}</strong>
                      <button
                        type="button"
                        className="popup-close-x"
                        onClick={() => setPinsOpen(false)}
                        aria-label="Close pinned messages"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {pins.length ? (
                      pins.map((pin) => (
                        <div
                          className="pin-item cursor-pointer hover:bg-white/5 p-2.5 rounded-lg transition-colors border border-transparent hover:border-white/10 my-1"
                          key={pin.id}
                          onClick={() => {
                            const el = document.getElementById(`msg-${pin.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              el.classList.add("jump-flash");
                              setTimeout(() => {
                                el.classList.remove("jump-flash");
                              }, 2000);
                            }
                          }}
                          title="Click to jump to message"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <strong className="text-xs text-white">{pin.author}</strong>
                            {canPin && (
                            <button
                                type="button"
                                className="text-xs text-red-400 hover:text-red-300 font-medium px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void togglePin(pin);
                                }}
                              >
                                Unpin
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-300 line-clamp-3">{pin.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="pins-empty">
                        Nothing pinned yet. Hover a message and press the pin.
                      </p>
                    )}
                  </div>
                )}

                {inDmHome && dmCall && dmCall.channelId === activeChannelId && (
                  <section className="dm-call-stage" aria-label="Direct Message Call">
                    <div className="dm-call-participants">
                      <div
                        className={`dm-call-avatar-wrapper ${voice.speaking.has(hub.connectionId || "") ? "is-speaking" : ""
                          }`}
                      >
                        <Avatar
                          name={user.displayName}
                          avatar={user.avatar}
                          avatarUrl={user.avatarUrl}
                          color={user.color}
                          size={48}
                        />
                        <span className="dm-call-user-name">{user.displayName}</span>
                      </div>

                      <div className="dm-call-status-center">
                        <span className="dm-call-status-label">
                          {dmCall.status === "calling" ? (
                            <>
                              <span className="dm-call-status-dot" style={{ background: "#a78bfa" }} />
                              Calling...
                            </>
                          ) : (
                            <>
                              <span className="dm-call-status-dot" />
                              In Call ({Math.floor(callDuration / 60)}:{String(callDuration % 60).padStart(2, "0")})
                            </>
                          )}
                        </span>
                      </div>

                      <div
                        className={`dm-call-avatar-wrapper ${dmCall.status === "calling" ? "is-calling is-ringing" : ""
                          } ${voiceParticipants.some(
                            (p) => p.id === dmCall.otherUser.id && voice.speaking.has(p.connectionId),
                          )
                            ? "is-speaking"
                            : ""
                          }`}
                      >
                        <Avatar
                          name={dmCall.otherUser.displayName}
                          avatar={dmCall.otherUser.avatar || "?"}
                          avatarUrl={dmCall.otherUser.avatarUrl}
                          color={dmCall.otherUser.color || "#a78bfa"}
                          size={48}
                        />
                        <span className="dm-call-user-name">{dmCall.otherUser.displayName}</span>
                      </div>
                    </div>

                    <div className="dm-call-controls">
                      <button
                        type="button"
                        className={`vctrl-btn ${voice.muted ? "off" : ""}`}
                        onClick={() => voice.toggleMute()}
                        title={voice.muted ? "Unmute" : "Mute"}
                      >
                        {voice.muted ? <MicOff size={16} /> : <Mic size={16} />}
                      </button>
                      <button
                        type="button"
                        className={`vctrl-btn ${voice.deafened ? "off" : ""}`}
                        onClick={() => voice.toggleDeafen()}
                        title={voice.deafened ? "Undeafen" : "Deafen"}
                      >
                        {voice.deafened ? <VolumeX size={16} /> : <Headphones size={16} />}
                      </button>
                      <button
                        type="button"
                        className={`vctrl-btn ${voice.screenSharing ? "active-screen" : ""}`}
                        onClick={() => {
                          if (voice.screenSharing) {
                            voice.stopScreenShare();
                          } else {
                            void voice.startScreenShare();
                          }
                        }}
                        title={voice.screenSharing ? "Stop sharing" : "Share screen"}
                      >
                        <Monitor size={16} />
                      </button>
                      <button
                        type="button"
                        className={`vctrl-btn ${voice.cameraOn ? "active-camera" : ""}`}
                        onClick={() => {
                          if (voice.cameraOn) {
                            voice.stopCamera();
                          } else {
                            void voice.startCamera();
                          }
                        }}
                        title={voice.cameraOn ? "Turn off camera" : "Turn on camera"}
                      >
                        {voice.cameraOn ? <Video size={16} /> : <VideoOff size={16} />}
                      </button>
                      <button
                        type="button"
                        className="vctrl-btn expand-btn"
                        onClick={() => setStageChannelId(dmCall.channelId)}
                        title="Open Call View"
                      >
                        <Maximize2 size={16} />
                      </button>
                      <button
                        type="button"
                        className="vctrl-btn disconnect-btn"
                        onClick={() => endDmCall(false)}
                        title="End Call"
                      >
                        <PhoneOff size={16} />
                      </button>
                    </div>
                  </section>
                )}

                {/* A forum's posts are its top-level messages, so the board
                    replaces the chat list rather than sitting beside it. The
                    list stays mounted (just hidden) so scroll position and
                    read-marking keep working when you switch back. */}
                {activeChannelInfo.threadContainer && !inDmHome && (
                  <ForumBoard
                    posts={messages}
                    channelName={channelTitle}
                    canPost={!composerBlocked}
                    onOpenPost={(postId) => {
                      // Resolved here rather than passed through, so the board
                      // never has to know about the richer Message type.
                      const post = messages.find((m) => m.id === postId);
                      if (post) void openThread(post);
                    }}
                    onNewPost={() => composerRef.current?.focus()}
                  />
                )}

                {pendingInvite && (
                  <div className="msn-info-bar" role="status">
                    <span className="msn-info-icon" aria-hidden="true">
                      {GAME_INFO[pendingInvite.game.kind].emoji}
                    </span>
                    <span>
                      <StyledText text={pendingInvite.game.players[0].name} /> has invited you to play{" "}
                      <strong>{GAME_INFO[pendingInvite.game.kind].name}</strong>. Do you want to{" "}
                      <button type="button" onClick={() => void answerInvite("join")}>
                        Accept
                      </button>{" "}
                      (Alt+C) or{" "}
                      <button type="button" onClick={() => void answerInvite("decline")}>
                        Decline
                      </button>{" "}
                      (Alt+D) the invitation?
                    </span>
                  </div>
                )}
                <div
                  ref={messagesScrollRef}
                  onScroll={handleMessagesScroll}
                  className={`messages ${activeChannelInfo.threadContainer && !inDmHome ? "forum-list-hidden" : ""}`}
                  aria-live="polite"
                >
                  {msnTheme && (
                    <p className="msn-warning">
                      Never give out your password or credit card number in an instant message conversation.
                    </p>
                  )}
                  <div className="channel-intro">
                    <div className="cozy-intro-pill">
                      <span className="cozy-intro-icon">
                        {inDmHome ? (
                          isSelfDm ? (
                            <StickyNote size={13} />
                          ) : (
                            <AtSign size={13} />
                          )
                        ) : (
                          <Hash size={13} />
                        )}
                      </span>
                      <span className="cozy-intro-text">
                        {inDmHome
                          ? isSelfDm
                            ? "This is your personal space for notes, drafts, and reminders."
                            : activeDm?.group
                              ? `welcome to the beginning of ${channelTitle}`
                              : `this is the beginning of your conversation with ${channelTitle}`
                          : `welcome to #${channelTitle}${activeChannel?.topic ? ` — ${activeChannel.topic}` : ""}`}
                      </span>
                    </div>
                    <div className="legacy-intro-content">
                      <div className="intro-icon">
                        {inDmHome ? (isSelfDm ? "📝" : "@") : "#"}
                      </div>
                      <h2>{inDmHome ? channelTitle : `Welcome to #${channelTitle}`}</h2>
                      <p>
                        {inDmHome
                          ? isSelfDm
                            ? "Messages sent here are private and only visible to you. Great for jotting down thoughts, saving links, or staging drafts."
                            : activeDm?.group
                              ? "Welcome to the beginning of this group. Only its members can see it."
                              : "This conversation is only visible to the two of you."
                          : "This is the start of the channel. Be excellent to each other."}
                      </p>
                    </div>
                  </div>

                  {messages.map((message, index) => {
                    if (message.kind?.startsWith("system-")) {
                      const pinnedId =
                        message.kind === "system-pin" &&
                          message.payload &&
                          typeof (message.payload as { messageId?: unknown }).messageId === "string"
                          ? (message.payload as { messageId: string }).messageId
                          : null;
                      const actor =
                        (message.userId && membersById.get(message.userId)) ||
                        (message.userId &&
                          activeDm?.group?.members.find((m) => m.id === message.userId)) ||
                        null;
                      const actorName = actor?.displayName || message.author;
                      // The stored text starts with the name it had when posted;
                      // show the current name and keep the rest of the sentence.
                      const rest = message.text.startsWith(message.author)
                        ? message.text.slice(message.author.length)
                        : ` ${message.text}`;
                      return (
                        <div
                          key={message.id}
                          id={`msg-${message.id}`}
                          className={`system-message system-message--${message.kind.slice(7)}`}
                        >
                          <span className="system-message-icon" aria-hidden="true">
                            {message.kind === "system-pin" ? (
                              <Pin size={15} />
                            ) : message.kind === "system-group-leave" ||
                              message.kind === "system-group-remove" ? (
                              <LogOut size={15} />
                            ) : message.kind === "system-group-rename" ? (
                              <Pencil size={15} />
                            ) : (
                              <UserPlus size={15} />
                            )}
                          </span>
                          <p>
                            <button
                              type="button"
                              className="system-message-actor"
                              onClick={(event) => {
                                if (actor) openUserMenu(event, actor as Member);
                              }}
                            >
                              {actorName}
                            </button>
                            {message.kind === "system-pin" ? (
                              <>
                                {" pinned "}
                                {pinnedId ? (
                                  <button
                                    type="button"
                                    className="system-message-link"
                                    onClick={() => {
                                      if (activeChannelId) jumpToMessage(activeChannelId, pinnedId);
                                    }}
                                  >
                                    a message
                                  </button>
                                ) : (
                                  "a message"
                                )}
                                {" to this channel. See all "}
                                <button
                                  type="button"
                                  className="system-message-link"
                                  onClick={() => setPinsOpen(true)}
                                >
                                  pinned messages
                                </button>
                                .
                              </>
                            ) : (
                              rest
                            )}
                            <time title={formatClientDateTime(message.createdAt)}>
                              {formatClientTime(message.createdAt, message.time)}
                            </time>
                          </p>
                        </div>
                      );
                    }
                    const author = message.userId
                      ? membersById.get(message.userId)
                      : undefined;
                    const canDelete =
                      message.userId === user.id ||
                      message.bot ||
                      user.isAdmin ||
                      canModerate;

                    const isBlockedUser = Boolean(
                      message.userId && blockedUserIds.has(message.userId),
                    );
                    const isBlockedExpanded = expandedBlockedMessages.has(String(message.id));

                    if (isBlockedUser && !isBlockedExpanded) {
                      return (
                        <div key={message.id} className="blocked-message-notice">
                          <div className="flex items-center gap-2">
                            <ShieldAlert size={14} className="text-rose-400 shrink-0" />
                            <span>1 Blocked message ({message.author})</span>
                          </div>
                          <button
                            type="button"
                            className="blocked-message-toggle"
                            onClick={() => {
                              setExpandedBlockedMessages((prev) =>
                                new Set(prev).add(String(message.id)),
                              );
                            }}
                          >
                            Show message
                          </button>
                        </div>
                      );
                    }

                    if (message.payload?.nudge) {
                      return (
                        <div key={message.id} id={`msg-${message.id}`} className="nudge-line">
                          <span className="nudge-line-rule" aria-hidden="true" />
                          {message.userId === user.id
                            ? "You have just sent a nudge."
                            : `${stripTextStyle(author?.displayName || message.author)} has just sent you a nudge.`}
                          <span className="nudge-line-rule" aria-hidden="true" />
                        </div>
                      );
                    }
                    const wink = findWink(message.payload?.wink);
                    if (wink) {
                      return (
                        <div key={message.id} id={`msg-${message.id}`} className="nudge-line wink-line">
                          <span className="nudge-line-rule" aria-hidden="true" />
                          <span className="wink-line-emoji" aria-hidden="true">{wink.emoji}</span>
                          {message.userId === user.id
                            ? `You have just sent a wink: ${wink.name}.`
                            : `${stripTextStyle(author?.displayName || message.author)} has just sent you a wink: ${wink.name}.`}
                          <button type="button" className="wink-replay" onClick={() => playWink(wink.id)}>
                            Play
                          </button>
                          <span className="nudge-line-rule" aria-hidden="true" />
                        </div>
                      );
                    }

                    // Collapse the avatar/name header when the same author sends a
                    // burst of messages close together — but never for replies,
                    // command answers or rich cards, which each need their own header.
                    const prev = index > 0 ? messages[index - 1] : undefined;
                    const sameAuthor =
                      !!prev &&
                      Boolean(prev.bot) === Boolean(message.bot) &&
                      (message.bot
                        ? prev.author === message.author
                        : !!prev.userId && prev.userId === message.userId);
                    const closeInTime =
                      !!prev && message.createdAt && prev.createdAt
                        ? new Date(message.createdAt).getTime() -
                        new Date(prev.createdAt).getTime() <
                        7 * 60 * 1000
                        : true;
                    const continuation =
                      sameAuthor &&
                      closeInTime &&
                      !message.replyTo &&
                      !message.commandText &&
                      (!message.kind || message.kind === "voice") &&
                      (!prev?.kind || prev.kind === "voice");
                    return (
                      <article
                        id={`msg-${message.id}`}
                        className={`message ${continuation ? "continuation" : ""} ${message.pinned ? "is-pinned" : ""
                          } ${openActionsId === message.id ? "actions-open" : ""} ${reactionPicker?.messageId === message.id
                            ? "actions-open reaction-picker-active"
                            : ""
                          } ${user && message.mentions?.includes(user.id) ? "mentions-me" : ""
                          }`}
                        key={message.id}
                        onTouchStart={(e) => handleMessageTouchStart(message.id, e)}
                        onTouchMove={handleMessageTouchMove}
                        onTouchEnd={handleMessageTouchEnd}
                        onTouchCancel={handleMessageTouchEnd}
                        onContextMenu={(event) => {
                          if (longPressTriggeredRef.current || touchInput) {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpenActionsId(message.id);
                            return;
                          }
                          if (message.bot) {
                            openBotMenu(
                              event,
                              message.author.toLowerCase().includes("d&d")
                                ? "dnd"
                                : "music",
                            );
                          }
                        }}
                      >
                        {isBlockedUser && (
                          <div className="col-span-full flex items-center justify-between text-[11px] text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-md mb-2">
                            <span className="flex items-center gap-1.5 font-bold">
                              <ShieldAlert size={12} /> Message from blocked user
                            </span>
                            <button
                              type="button"
                              className="text-xs font-bold underline hover:text-rose-300 cursor-pointer"
                              onClick={() => {
                                setExpandedBlockedMessages((prev) => {
                                  const n = new Set(prev);
                                  n.delete(String(message.id));
                                  return n;
                                });
                              }}
                            >
                              Hide message
                            </button>
                          </div>
                        )}
                        {continuation ? (
                          <span className="message-gutter" aria-hidden="true">
                            <time title={formatClientDateTime(message.createdAt)}>
                              {formatClientTime(message.createdAt, message.time)}
                            </time>
                          </span>
                        ) : (
                          <Avatar
                            className={`avatar ${message.bot ? "bot-avatar" : ""}`}
                            avatar={author?.avatar || message.avatar}
                            avatarUrl={author?.avatarUrl}
                            color={author?.color || message.color}
                            onContextMenu={(event) => {
                              if (author) openUserMenu(event, author);
                            }}
                            onClick={(event) => {
                              // Same as clicking the name: show their profile card,
                              // opened beside the avatar. Right-click keeps the menu.
                              if (author) openProfile(author, event);
                            }}
                          />
                        )}
                        <div className="message-body">
                          {message.commandText && (
                            <div className="command-invocation">
                              <span className="reply-arrow">↩</span>
                              <strong>{message.commandBy || "someone"}</strong>
                              <span className="command-used">used</span>
                              <code>{message.commandText}</code>
                            </div>
                          )}
                          {message.replyTo && (
                            <button
                              type="button"
                              className="reply-preview"
                              onClick={() =>
                                document
                                  .getElementById(`msg-${message.replyTo}`)
                                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
                              }
                            >
                              <span className="reply-arrow">↩</span>
                              <strong>{message.replyPreview?.author || "someone"}</strong>
                              <span className="reply-snippet">
                                {message.replyPreview?.text || "message"}
                              </span>
                            </button>
                          )}
                          {!continuation && (
                            <div className="message-meta">
                              <strong
                                className={author ? "clickable-name" : ""}
                                style={{ color: roleColorFor(author) || undefined }}
                                onContextMenu={(event) => {
                                  if (author) openUserMenu(event, author);
                                }}
                                onClick={() => {
                                  if (author) openProfile(author);
                                }}
                              >
                                <StyledText text={author?.displayName || message.author} />
                              </strong>
                              {author && <PrideBadges badges={author.prideBadges} mini />}
                              {message.bot && <span className="bot-tag">BOT</span>}
                              <time title={formatClientDateTime(message.createdAt)}>
                                {formatClientTime(message.createdAt, message.time)}
                              </time>
                              {message.editedAt && (
                                <button
                                  type="button"
                                  className="edited-tag"
                                  title={`Edited ${formatClientDateTime(message.editedAt)} · show history`}
                                  onClick={() => setEditHistoryId(String(message.id))}
                                >
                                  (edited)
                                </button>
                              )}
                              {message.pinned && (
                                <span className="pin-tag flex items-center gap-1" title="Pinned">
                                  <Pin size={12} />
                                </span>
                              )}
                            </div>
                          )}

                          {message.kind === "lyricsnow" && message.payload?.lines ? (
                            <LyricsNow
                              track={typeof message.payload.track === "string" ? message.payload.track : message.payload.track?.title}
                              artist={message.payload.artist}
                              lines={message.payload.lines}
                              positionMs={
                                message.payload.voiceChannelId === voice.channelId
                                  ? player.position
                                  : undefined
                              }
                              live={
                                message.payload.voiceChannelId === voice.channelId &&
                                hub.players[voice.channelId!]?.track?.id ===
                                message.payload.trackId
                              }
                            />
                          ) : message.kind === "ai" ? (
                            <AiAnswerCard
                              messageId={message.id}
                              channelId={activeChannelId}
                              question={message.payload?.question}
                              sources={message.payload?.sources}
                              threadCount={message.threadCount}
                              onOpenThread={() => void openThread(message)}
                              onError={setNotice}
                            >
                              <MessageBody
                                text={message.text}
                                selfHandle={user.username}
                                onMention={openProfileByHandle}
                                onImage={setLightboxImage}
                                emojis={emojiMap}
                              />
                            </AiAnswerCard>
                          ) : message.kind === "dnd" && message.payload ? (
                            <DndCard
                              {...message.payload}
                              onCommand={(command) => void runCommand(command)}
                            />
                          ) : message.kind === "music-settings" && message.payload ? (
                            <MusicSettingsCard
                              settings={message.payload}
                              disabled={!message.payload.voiceChannelId}
                              onCommand={(command) =>
                                runMusicUiCommand(
                                  command,
                                  message.payload?.voiceChannelId,
                                )
                              }
                            />
                          ) : message.kind === "music-stats" && message.payload ? (
                            <MusicStatsCard
                              wrapped={message.payload.wrapped}
                              label={message.payload.label}
                              plays={message.payload.plays}
                              unique={message.payload.unique}
                              hours={message.payload.hours}
                              topSongs={message.payload.topSongs}
                              topRequesters={message.payload.topRequesters}
                              topArtist={message.payload.topArtist}
                              topGenre={message.payload.topGenre}
                              peakHour={message.payload.peakHour}
                              streakDays={message.payload.streakDays}
                              personality={message.payload.personality}
                              disabled={!message.payload.voiceChannelId}
                              onCommand={(command) =>
                                runMusicUiCommand(
                                  command,
                                  message.payload?.voiceChannelId,
                                )
                              }
                            />
                          ) : message.kind === "music-queue" && message.payload ? (
                            <MusicQueueCard
                              currentTrack={message.payload.currentTrack}
                              queue={message.payload.queue}
                              totalTracks={message.payload.totalTracks}
                              disabled={!message.payload.voiceChannelId}
                              onCommand={(command) =>
                                runMusicUiCommand(
                                  command,
                                  message.payload?.voiceChannelId,
                                )
                              }
                            />
                          ) : message.kind === "music-history" && message.payload ? (
                            <MusicHistoryCard
                              history={message.payload.history}
                              disabled={!message.payload.voiceChannelId}
                              onCommand={(command) =>
                                runMusicUiCommand(
                                  command,
                                  message.payload?.voiceChannelId,
                                )
                              }
                            />
                          ) : message.kind === "music-search" && message.payload ? (
                            <MusicSearchCard
                              query={message.payload.query}
                              track={typeof message.payload.track === "object" ? message.payload.track : undefined}
                              disabled={!message.payload.voiceChannelId}
                              onCommand={(command) =>
                                runMusicUiCommand(
                                  command,
                                  message.payload?.voiceChannelId,
                                )
                              }
                            />
                          ) : message.kind === "voice" && message.audio ? (
                            <VoiceMessagePlayer
                              src={message.audio}
                              durationMs={message.payload?.voice?.durationMs}
                              waveform={message.payload?.voice?.waveform}
                            />
                          ) : message.kind === "game" && message.payload?.game ? (
                            <GameCard
                              messageId={String(message.id)}
                              game={message.payload.game}
                              userId={user.id}
                              onPlayAgain={(kind, solo) => void startGame(kind, solo)}
                            />
                          ) : message.kind === "poll" && message.payload?.pollId ? (
                            <PollCard
                              pollId={message.payload.pollId}
                              question={message.payload.question || message.text}
                              options={message.payload.options || []}
                              multi={message.payload.multi}
                              liveCounts={pollCounts[message.payload.pollId]}
                            />
                          ) : editingId === message.id ? (
                            <div className="message-edit">
                              <textarea
                                value={editDraft}
                                autoFocus
                                onChange={(event) => setEditDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") setEditingId(null);
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void saveEdit(message);
                                  }
                                }}
                              />
                              <div className="message-edit-hint">
                                Enter to save · Esc to cancel
                              </div>
                            </div>
                          ) : message.payload?.forwardedFrom ? (
                            <ForwardedMessageCard
                              data={message.payload.forwardedFrom}
                              comment={message.text}
                              selfHandle={user.username}
                              emojis={emojiMap}
                              onMention={openProfileByHandle}
                              onImage={setLightboxImage}
                              onPdf={setPdfViewer}
                              formatTime={(d) => formatClientTime(d, "")}
                            />
                          ) : (
                            <MessageBody
                              text={message.text}
                              selfHandle={user.username}
                              onMention={openProfileByHandle}
                              onImage={setLightboxImage}
                              emojis={emojiMap}
                              linkPreviews
                              channels={activeServer?.channels}
                              roles={activeServer?.roles}
                              onChannel={openMentionedChannel}
                            />
                          )}

                          {!message.kind &&
                            (message.payload?.embeds?.length ||
                              message.payload?.components?.length) ? (
                            <BotEmbeds
                              embeds={message.payload.embeds}
                              components={message.payload.components}
                              selfHandle={user.username}
                              onMention={openProfileByHandle}
                              onImage={setLightboxImage}
                              emojis={emojiMap}
                              onComponent={(customId, componentType, values) =>
                                pressBotComponent(message, customId, componentType, values)
                              }
                            />
                          ) : null}

                          {message.payload?.themeShare && (
                            <ThemeShareCard
                              theme={message.payload.themeShare}
                              onApplyTheme={(th) => applyTheme(th)}
                            />
                          )}

                          {!message.payload?.themeShare && message.text?.includes("huddle-theme:v1:") && (() => {
                            const match = message.text.match(/huddle-theme:v1:[a-zA-Z0-9+/=_-]+/);
                            if (!match) return null;
                            const parsed = importThemeCode(match[0]);
                            if (!parsed) return null;
                            return (
                              <ThemeShareCard
                                theme={parsed}
                                onApplyTheme={(th) => applyTheme(th)}
                              />
                            );
                          })()}

                          {extractInviteCodes(message.text).map((code) => {
                            const inv = resolvedInvites[code];
                            if (!inv) return null;
                            const isCurrentlyMember = inv.server
                              ? servers.some((s) => s.id === inv.server?.id)
                              : false;
                            return (
                              <ServerInviteCard
                                key={code}
                                invite={inv}
                                isMember={isCurrentlyMember}
                                onJoin={() => {
                                  if (isCurrentlyMember && inv.server) {
                                    setActiveServerId(inv.server.id);
                                  } else {
                                    void joinServerDirect(code);
                                  }
                                }}
                              />
                            );
                          })}

                          {message.kind === "nowplaying" &&
                            message.payload?.voiceChannelId && (
                              <NowPlaying
                                state={hub.players[message.payload.voiceChannelId] || null}
                                trackId={message.payload.trackId}
                                trackLabel={message.payload.label}
                                position={
                                  voice.channelId === message.payload.voiceChannelId
                                    ? player.position
                                    : 0
                                }
                                controllable={
                                  voice.channelId === message.payload.voiceChannelId
                                }
                                blocked={!botStreaming && player.blocked}
                                onUnblock={player.unblock}
                                voiceChannelName={
                                  voiceChannels.find(
                                    (channel) =>
                                      channel.id === message.payload?.voiceChannelId,
                                  )?.name
                                }
                                onSeek={(positionMs) =>
                                  hub.send({
                                    t: "player",
                                    channelId: message.payload!.voiceChannelId!,
                                    action: { name: "seek", positionMs },
                                  })
                                }
                                onToggle={() =>
                                  hub.send({
                                    t: "player",
                                    channelId: message.payload!.voiceChannelId!,
                                    action: { name: "toggle" },
                                  })
                                }
                                onSkip={() =>
                                  hub.send({
                                    t: "player",
                                    channelId: message.payload!.voiceChannelId!,
                                    action: { name: "skip" },
                                  })
                                }
                                volume={prefFor("bot:music").volume}
                                onVolume={(volume) =>
                                  void saveVoicePref("bot:music", { volume })
                                }
                              />
                            )}

                          {message.link && (
                            <a
                              className="bot-action"
                              href={message.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {message.actionLabel || "Open"}
                              <span aria-hidden="true">↗</span>
                            </a>
                          )}
                          {message.audio && message.kind !== "voice" && (
                            <audio
                              className="message-audio"
                              controls
                              preload="none"
                              src={message.audio}
                            />
                          )}
                          <MsnFileTransfer
                            enabled={msnTheme && !message.bot}
                            messageId={String(message.id)}
                            mine={message.userId === user.id}
                            fromName={author?.displayName || message.author}
                            createdAt={message.createdAt}
                            fileNames={[
                              ...[message.image, ...(message.images || [])]
                                .filter((img): img is string => typeof img === "string" && Boolean(img))
                                .map(fileNameFromUrl),
                              ...(message.file ? [message.file.name] : []),
                            ]}
                          >
                          {(() => {
                            const allImages = [
                              message.image,
                              ...(message.images || []),
                            ].filter((img): img is string => typeof img === "string" && Boolean(img));
                            if (allImages.length === 0) return null;
                            return (
                              <ImageGallery
                                images={allImages}
                                onOpenLightbox={(imgs, idx) =>
                                  setLightbox({ images: imgs, index: idx })
                                }
                              />
                            );
                          })()}
                          {message.file?.type === "pdf" && (
                            <button
                              type="button"
                              className="message-file-card"
                              onClick={() =>
                                setPdfViewer({
                                  url: message.file!.url,
                                  name: message.file!.name,
                                })
                              }
                            >
                              <span className="message-file-icon">PDF</span>
                              <span>
                                <strong>{message.file.name}</strong>
                                <small>PDF document · view and fill in Huddle</small>
                              </span>
                              <b aria-hidden="true">Open</b>
                            </button>
                          )}
                          </MsnFileTransfer>

                          {(message.threadCount ?? 0) > 0 && message.kind !== "ai" && (
                            <button
                              type="button"
                              className="thread-link inline-flex items-center gap-1.5"
                              onClick={() => void openThread(message)}
                            >
                              <MessageSquare size={14} /> {message.threadCount}{" "}
                              {message.threadCount === 1 ? "reply" : "replies"}
                            </button>
                          )}

                          {message.reactions && message.reactions.length > 0 && (
                            <div className="reactions">
                              {message.reactions.map((reaction) => (
                                <button
                                  type="button"
                                  key={reaction.emoji}
                                  className={`reaction outline-reaction-pill ${reaction.mine ? "mine" : ""} ${reactionViewer?.messageId === message.id && reactionViewer.emoji === reaction.emoji ? "viewer-open" : ""}`}
                                  onClick={() =>
                                    void toggleReaction(message.id, reaction.emoji)
                                  }
                                  onContextMenu={(e) =>
                                    handleOpenReactionViewer(
                                      e,
                                      message.id,
                                      reaction.emoji,
                                    )
                                  }
                                  title={reactionTooltip(reaction)}
                                >
                                  {emojiMap[reaction.emoji.replace(/^:|:$/g, "")] ? (
                                    <img
                                      className="custom-emoji"
                                      src={emojiMap[reaction.emoji.replace(/^:|:$/g, "")]}
                                      alt={reaction.emoji}
                                    />
                                  ) : (
                                    <OutlineEmoji emoji={reaction.emoji} />
                                  )}
                                  <b>{reaction.count}</b>
                                </button>
                              ))}
                              <button
                                type="button"
                                className={`reaction add-reaction-btn ${reactionPicker?.messageId === message.id ? "mine" : ""}`}
                                title="Add reaction · Shift-click to add to quick reactions"
                                onClick={(e) => {
                                  if (e.shiftKey) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleOpenReactionPicker(e, message.id, "addToQuickReactions");
                                    return;
                                  }
                                  handleOpenReactionPicker(e, message.id, "react");
                                }}
                              >
                                <SmilePlus size={14} />
                              </button>
                            </div>
                          )}

                          {quickVoteId === message.id && (
                            <div className="quick-vote">
                              <span className="quick-vote-title">Vote</span>
                              {QUICK_VOTES.map((emoji) => {
                                const reacted =
                                  message.reactions?.find((r) => r.emoji === emoji)?.mine ||
                                  false;
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={`reaction ${reacted ? "mine" : ""}`}
                                    onClick={() =>
                                      void toggleReaction(message.id, emoji)
                                    }
                                  >
                                    <OutlineEmoji emoji={emoji} />
                                    <b>
                                      {message.reactions?.find((r) => r.emoji === emoji)
                                        ?.count || 0}
                                    </b>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Touch-only: reveal this message's actions on tap instead of
                    showing every message's full bar at once. */}
                        <button
                          type="button"
                          className="message-actions-toggle"
                          aria-label="Message actions"
                          onClick={() =>
                            setOpenActionsId((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        <div className="message-actions">
                          <div className="quick-reactions">
                            {quickReactions.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className="quick-react-outline-btn"
                                title={`React ${emoji} · Shift-click to remove`}
                                onClick={(e) => {
                                  if (e.shiftKey) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    removeQuickReaction(emoji);
                                    if (message.reactions?.some((r) => r.emoji === emoji && r.mine)) {
                                      void toggleReaction(message.id, emoji);
                                    }
                                    return;
                                  }
                                  void toggleReaction(message.id, emoji);
                                  setOpenActionsId(null);
                                }}
                              >
                                {emojiMap[emoji.replace(/^:|:$/g, "")] ? (
                                  <img
                                    className="custom-emoji"
                                    src={emojiMap[emoji.replace(/^:|:$/g, "")]}
                                    alt={emoji}
                                  />
                                ) : (
                                  <OutlineEmoji emoji={emoji} />
                                )}
                              </button>
                            ))}
                            {/* The server's own emoji, right where you react. */}
                            {emojis
                              .filter((emoji) => {
                                const code = `:${emoji.name}:`;
                                const clean = emoji.name;
                                return (
                                  !hiddenServerEmojiIds.includes(emoji.id) &&
                                  !hiddenServerEmojiIds.includes(clean) &&
                                  !hiddenServerEmojiIds.includes(code) &&
                                  !quickReactions.includes(code) &&
                                  !quickReactions.includes(clean)
                                );
                              })
                              .slice(0, 4)
                              .map((emoji) => {
                                const emojiCode = `:${emoji.name}:`;
                                return (
                                  <button
                                    key={emoji.id}
                                    type="button"
                                    title={`React ${emojiCode} · Shift-click to remove`}
                                    onClick={(e) => {
                                      if (e.shiftKey) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        hideServerEmoji(emoji.id, emoji.name);
                                        if (
                                          message.reactions?.some(
                                            (r) =>
                                              (r.emoji === emojiCode || r.emoji === emoji.name) &&
                                              r.mine,
                                          )
                                        ) {
                                          void toggleReaction(message.id, emojiCode);
                                        }
                                        return;
                                      }
                                      void toggleReaction(message.id, emojiCode);
                                      setOpenActionsId(null);
                                    }}
                                  >
                                    <img className="custom-emoji" src={emoji.url} alt={emoji.name} />
                                  </button>
                                );
                              })}
                            <button
                              type="button"
                              title="Add reaction · Shift-click to add to quick reactions"
                              className={`add-reaction-action-btn ${reactionPicker?.messageId === message.id ? "active" : ""}`}
                              onClick={(e) => {
                                if (e.shiftKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleOpenReactionPicker(e, message.id, "addToQuickReactions");
                                  return;
                                }
                                handleOpenReactionPicker(e, message.id, "react");
                              }}
                            >
                              <SmilePlus size={16} />
                            </button>
                          </div>
                          <button
                            type="button"
                            title="Reply"
                            onClick={() => {
                              setReplyTarget(message);
                              composerRef.current?.focus();
                              setOpenActionsId(null);
                            }}
                          >
                            <Reply size={16} />
                          </button>
                          <button
                            type="button"
                            title="Reply in thread"
                            onClick={() => {
                              void openThread(message);
                              setOpenActionsId(null);
                            }}
                          >
                            <MessageSquare size={16} />
                          </button>
                          <button
                            type="button"
                            title="Forward"
                            onClick={() => {
                              const chName = inDmHome
                                ? activeDm?.user.displayName
                                : activeChannel?.name;
                              const srvName = inDmHome ? undefined : activeServer?.name;
                              setForwardTarget({
                                id: message.id,
                                author: author?.displayName || message.author,
                                avatar: author?.avatar || message.avatar,
                                avatarUrl: author?.avatarUrl,
                                color: author?.color || message.color,
                                text: message.text,
                                createdAt: message.createdAt,
                                image: message.image,
                                images: message.images,
                                file: message.file,
                                channelId: message.channelId || activeChannelId,
                                channelName: chName,
                                serverName: srvName,
                              });
                              setOpenActionsId(null);
                            }}
                          >
                            <Forward size={16} />
                          </button>
                          <button
                            type="button"
                            title="Quick vote"
                            onClick={() => {
                              setQuickVoteId((current) =>
                                current === message.id ? null : message.id,
                              );
                              setOpenActionsId(null);
                            }}
                          >
                            <Vote size={16} />
                          </button>
                          {message.userId === user.id && !message.bot && (
                            <button
                              type="button"
                              title="Edit"
                              onClick={() => {
                                beginEdit(message);
                                setOpenActionsId(null);
                              }}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canPin && (
                          <button
                              type="button"
                              title={message.pinned ? "Unpin" : "Pin"}
                              onClick={() => {
                                void togglePin(message);
                                setOpenActionsId(null);
                              }}
                            >
                              <Pin size={16} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              title="Delete (Hold Shift to skip confirmation)"
                              onClick={(event) => {
                                setOpenActionsId(null);
                                if (event.shiftKey) {
                                  void deleteMessage(message.id);
                                } else {
                                  showCustomConfirm({
                                    title: "Delete Message",
                                    message:
                                      "Are you sure you want to delete this message? Pro tip: You can delete while pressing Shift to skip this confirmation.",
                                    isDanger: true,
                                    confirmText: "Delete",
                                    cancelText: "Cancel",
                                    onConfirm: () => {
                                      void deleteMessage(message.id);
                                    },
                                  });
                                }
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  <div ref={messageEndRef} />
                </div>

                <div className={`jump-latest-anchor ${activeChannelInfo.threadContainer && !inDmHome ? "forum-list-hidden" : ""}`}>
                  <button
                    type="button"
                    className={`jump-latest ${showJumpLatest || unseenCount > 0 ? "visible" : ""} ${unseenCount > 0 ? "has-unseen" : ""}`}
                    onClick={jumpToLatest}
                    aria-label={unseenCount > 0 ? `Jump to latest, ${unseenCount} new message${unseenCount === 1 ? "" : "s"}` : "Jump to latest message"}
                    tabIndex={showJumpLatest || unseenCount > 0 ? 0 : -1}
                    aria-hidden={!(showJumpLatest || unseenCount > 0)}
                  >
                    {unseenCount > 0 && (
                      <span className="jump-latest-count">
                        {unseenCount > 99 ? "99+" : unseenCount} new
                      </span>
                    )}
                    <ChevronDown size={18} strokeWidth={2.4} />
                  </button>
                </div>

                {(notice || voice.error) && (
                  <button
                    className="notice"
                    onClick={() => {
                      setNotice("");
                      voice.setError("");
                    }}
                    aria-label="Dismiss notification"
                  >
                    {notice || voice.error}
                    <span>×</span>
                  </button>
                )}

                <form className="composer-wrap" onSubmit={sendMessage}>
                  {activeSlashCommand && draft.startsWith("/") && (
                    <div className="active-command-helper">
                      <span className="command-title">/{activeSlashCommand.name}</span>
                      {activeSlashCommand.args && (
                        <span className="command-args">{activeSlashCommand.args}</span>
                      )}
                      <span className="command-desc">— {activeSlashCommand.description}</span>
                    </div>
                  )}

                  {slashActive && (
                    <SlashMenu
                      query={draft.split(/\s+/)[0]}
                      highlighted={slashIndex}
                      onHighlight={setSlashIndex}
                      onPick={(command) =>
                        pickCommand(
                          slashMatches.findIndex((item) => item.name === command.name),
                        )
                      }
                      inVoice={Boolean(voice.channelId)}
                    />
                  )}

                  {mentionActive && (
                    <div className="mention-menu" role="listbox" aria-label={tagQuery?.trigger === "#" ? "Channels" : "Mentions"}>
                      {mentionMatches.map((option, index) => {
                        const active = index === slashIndex % mentionMatches.length;
                        // Section headers, printed when the kind changes.
                        const previous = mentionMatches[index - 1];
                        const header =
                          !previous || previous.kind !== option.kind ? (
                            <div className="mention-section" key={`h:${option.kind}`}>
                              {option.kind === "user"
                                ? "MEMBERS"
                                : option.kind === "role"
                                  ? "ROLES"
                                  : option.kind === "broadcast"
                                    ? "NOTIFY"
                                    : "CHANNELS"}
                            </div>
                          ) : null;

                        if (option.kind === "channel") {
                          const channel = option.channel;
                          return (
                            <div key={`channel:${channel.id}`}>
                              {header}
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={`mention-item ${active ? "active" : ""}`}
                                onMouseEnter={() => setSlashIndex(index)}
                                onClick={() => pickMention(option)}
                              >
                                {channelKindIcon(channel.kind, 16, "mention-channel-icon")}
                                <span className="mention-primary">{channel.name}</span>
                                <span className="mention-note">
                                  {channel.topic || channelKindLabel(channel.kind)}
                                </span>
                              </button>
                            </div>
                          );
                        }

                        if (option.kind === "broadcast") {
                          return (
                            <div key={`broadcast:${option.name}`}>
                              {header}
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={`mention-item ${active ? "active" : ""}`}
                                onMouseEnter={() => setSlashIndex(index)}
                                onClick={() => pickMention(option)}
                              >
                                <AtSign size={16} className="mention-channel-icon" />
                                <span className="mention-primary">@{option.name}</span>
                                <span className="mention-note">
                                  {option.name === "everyone"
                                    ? "Notify every member of this server"
                                    : "Notify everyone who is online"}
                                </span>
                              </button>
                            </div>
                          );
                        }

                        if (option.kind === "role") {
                          return (
                            <div key={`role:${option.role.id}`}>
                              {header}
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={`mention-item ${active ? "active" : ""}`}
                                onMouseEnter={() => setSlashIndex(index)}
                                onClick={() => pickMention(option)}
                              >
                                <span
                                  className="mention-role-dot"
                                  style={{ background: option.role.color }}
                                />
                                <span
                                  className="mention-primary"
                                  style={{ color: option.role.color }}
                                >
                                  @{option.role.name}
                                </span>
                                <span className="mention-note">
                                  Notify everyone with this role
                                </span>
                              </button>
                            </div>
                          );
                        }

                        const member = option.member;
                        return (
                          <div key={`user:${member.id}`}>
                            {header}
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              className={`mention-item ${active ? "active" : ""}`}
                              onMouseEnter={() => setSlashIndex(index)}
                              onClick={() => pickMention(option)}
                            >
                              <Avatar
                                className="tiny-avatar"
                                avatar={member.avatar}
                                avatarUrl={member.avatarUrl}
                                color={member.color}
                              />
                              <span
                                className="mention-primary"
                                style={{ color: roleColorFor(member) || undefined }}
                              >
                                <StyledText text={member.displayName} />
                              </span>
                              <span className="mention-note">
                                {member.globalName && member.globalName !== member.displayName
                                  ? `${member.globalName} · `
                                  : ""}
                                @{member.username}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {emojiActive && (
                    <div className="mention-menu">
                      <div className="mention-section">
                        {emojiShortcodeMatch?.prefix.includes("+")
                          ? "REACT TO LAST MESSAGE"
                          : "EMOJI SHORTCODES"}
                      </div>
                      {emojiMatches.map((item, index) => {
                        const active = index === emojiIndex % emojiMatches.length;
                        return (
                          <button
                            key={item.name}
                            type="button"
                            className={`mention-item ${active ? "active" : ""}`}
                            onMouseEnter={() => setEmojiIndex(index)}
                            onClick={() => pickEmojiShortcode(item)}
                          >
                            <span className="text-base shrink-0 mr-2 flex items-center justify-center w-5 h-5">
                              {item.url ? (
                                <img src={item.url} alt={item.name} className="w-4 h-4 object-contain" />
                              ) : (
                                item.symbol
                              )}
                            </span>
                            <span className="mention-primary">
                              {emojiShortcodeMatch?.prefix.includes("+")
                                ? `:+${item.name}:`
                                : `:${item.name}:`}
                            </span>
                            {item.isCustom && <span className="mention-note">Server Emoji</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {gifOpen && (
                    <GifPicker
                      onClose={() => setGifOpen(false)}
                      serverId={inDmHome ? null : activeServerId}
                      canManageStickers={canManageChannels}
                      onPick={(url) => {
                        setGifOpen(false);
                        void sendText(url);
                      }}
                      onInsert={(text) => {
                        setDraft((current) => current + text);
                        composerRef.current?.focus();
                      }}
                      onEmojiChange={() => void loadEmojis().catch(() => undefined)}
                    />
                  )}

                  {gamesOpen && !msnTheme && (
                    <GamesPicker
                      inVoice={Boolean(voice.channelId)}
                      onClose={() => setGamesOpen(false)}
                      onStart={(kind, solo) => {
                        setGamesOpen(false);
                        void startGame(kind, solo);
                      }}
                      onActivities={() => {
                        setGamesOpen(false);
                        if (!voice.channelId) return;
                        setStageChannelId(voice.channelId);
                        window.setTimeout(() => window.dispatchEvent(new Event("huddle:open-activities")), 150);
                      }}
                    />
                  )}

                  {formatOpen && !msnTheme && (
                    <TextStyleMenu
                      onWrap={(open, close) => {
                        wrapSelection(open, close);
                        setFormatOpen(false);
                      }}
                    />
                  )}

                  {emojiOpen && (
                    <EmojiPicker
                      serverId={inDmHome ? null : activeServerId}
                      canManageEmojis={canManageChannels}
                      onPickEmoji={(codeOrUrl) => {
                        setEmojiOpen(false);
                        setDraft((current) => current + codeOrUrl + " ");
                        composerRef.current?.focus();
                      }}
                      onClose={() => setEmojiOpen(false)}
                    />
                  )}

                  {replyTarget && (
                    <div className="reply-bar">
                      <span>
                        Replying to <strong>{replyTarget.author}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyTarget(null)}
                        aria-label="Cancel reply"
                      >
                        ×
                      </button>
                    </div>
                  )}

                  {pendingFiles.length > 0 && (
                    <div className="attachment-row">
                      {pendingFiles.map((entry) => (
                        <div
                          key={entry.id}
                          className={`attachment-preview ${entry.preview ? "" : "file-preview"}`}
                        >
                          {entry.preview ? (
                            <img src={entry.preview} alt={entry.file.name} />
                          ) : (
                            <>
                              <span className="message-file-icon">PDF</span>
                              <span>
                                <strong>{entry.file.name}</strong>
                                <small>
                                  {(entry.file.size / 1024 / 1024).toFixed(1)} MB
                                </small>
                              </span>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setPendingFiles((current) =>
                                current.filter((item) => item.id !== entry.id),
                              )
                            }
                            aria-label={`Remove ${entry.file.name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {myTimeoutUntil && !isDmBlocked ? (
                    <div className="dm-blocked-banner">
                      <Timer size={16} className="text-amber-400 shrink-0" />
                      <span>
                        You are timed out in this server until{" "}
                        {formatClientDateTime(myTimeoutUntil)}. You can still read along.
                      </span>
                    </div>
                  ) : isDmBlocked ? (
                    <div className="dm-blocked-banner">
                      <ShieldAlert size={16} className="text-rose-400 shrink-0" />
                      <span>You have blocked this user. Unblock them to send messages.</span>
                      <button
                        type="button"
                        className="dm-unblock-btn"
                        onClick={() => activeDm && handleUnblockUser(activeDm.user.id)}
                      >
                        Unblock
                      </button>
                    </div>
                  ) : composerBlocked ? (
                    <div className="dm-blocked-banner">
                      <Radio size={16} className="text-violet-400 shrink-0" />
                      <span>
                        This is an announcement channel, so only moderators can post here.
                      </span>
                    </div>
                  ) : (
                    <>
                    {msnTheme &&
                      inDmHome &&
                      activeDm &&
                      !activeDm.group &&
                      !isSelfDm &&
                      hub.connected &&
                      !hub.online.has(activeDm.user.id) && (
                        <p className="msn-offline-note">
                          <span aria-hidden="true">ⓘ</span>
                          <StyledText text={activeDm.user.displayName} /> appears to be offline. Messages you
                          send will be delivered when they sign in.
                        </p>
                      )}
                    {msnTheme && (
                      <MsnFormatToolbar
                        messageFont={messageFont}
                        onMessageFont={(font) => {
                          setMessageFont(font);
                          saveMessageFont(font);
                          composerRef.current?.focus();
                        }}
                        onWrap={wrapSelection}
                        onEmoticons={() => {
                          setEmojiOpen((open) => !open);
                          setGifOpen(false);
                        }}
                        onWinks={() => {
                          setGifOpen((open) => !open);
                          setEmojiOpen(false);
                        }}
                        onSendWink={(id) => void sendWink(id)}
                        onStartGame={(kind, solo) => void startGame(kind, solo)}
                        personalEmoticons={personalEmoticons.emoticons}
                        onAddEmoticon={personalEmoticons.add}
                        onRemoveEmoticon={(shortcut) => void personalEmoticons.remove(shortcut).catch(() => undefined)}
                        inVoice={Boolean(voice.channelId)}
                        onActivities={() => {
                          if (!voice.channelId) return;
                          setStageChannelId(voice.channelId);
                          // The stage mounts first, then opens its panel.
                          window.setTimeout(() => window.dispatchEvent(new Event("huddle:open-activities")), 150);
                        }}
                        onVoiceClip={voiceRecorder.start}
                        onHandwriting={(file) => {
                          acceptAttachment([file]);
                          composerRef.current?.focus();
                        }}
                        channelId={activeChannelId}
                        onNudge={() => void sendNudge()}
                        nudgeCooling={nudgeCooling || !activeChannelId}
                      />
                    )}
                    <div className="composer">
                      {voiceRecorder.state !== "idle" ? (
                        <VoiceRecordingBar recorder={voiceRecorder} />
                      ) : (
                      <>
                      <button
                        type="button"
                        className="attach-button"
                        onClick={() => fileRef.current?.click()}
                        aria-label="Attach an image or PDF"
                      >
                        +
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,application/pdf,.pdf"
                        multiple
                        hidden
                        onChange={chooseAttachment}
                      />
                      <textarea
                        ref={composerRef}
                        value={draft}
                        onChange={(event) => {
                          setDraft(event.target.value);
                          setComposerCaret(event.target.selectionStart ?? event.target.value.length);
                          if (event.target.value.trim()) noteTyping();
                        }}
                        onSelect={(event) =>
                          setComposerCaret(event.currentTarget.selectionStart ?? 0)
                        }
                        onKeyDown={onComposerKeyDown}
                        onPaste={(event) => {
                          // Pasting a screenshot attaches it instead of doing nothing.
                          const files = Array.from(event.clipboardData.files || []);
                          if (files.length) {
                            event.preventDefault();
                            acceptAttachment(files);
                          }
                        }}
                        placeholder={
                          activeChannelId
                            ? isSelfDm
                              ? "Jot down a note or link to yourself..."
                              : activeChannelInfo.threadContainer
                                ? "Start a new post…"
                                : activeChannelInfo.moderatorOnlyPosting
                                  ? `Post an announcement in #${channelTitle}`
                                  : `Message ${inDmHome ? "" : "#"}${channelTitle}`
                            : "Pick a channel first"
                        }
                        aria-label={
                          activeChannelInfo.threadContainer
                            ? `New post in ${channelTitle}`
                            : `Message ${channelTitle}`
                        }
                        rows={1}
                        disabled={!activeChannelId}
                        style={msnTheme ? messageFontStyle(messageFont) : undefined}
                      />
                      <button
                        type="button"
                        className={`composer-emoji-btn composer-format-btn ${formatOpen ? "active" : ""}`}
                        onClick={() => {
                          setFormatOpen((open) => !open);
                          setEmojiOpen(false);
                          setGifOpen(false);
                        }}
                        aria-label="Text formatting"
                        title="Colours, fonts and effects"
                        aria-expanded={formatOpen}
                      >
                        <Type size={18} />
                      </button>
                      <button
                        type="button"
                        className="composer-emoji-btn"
                        onClick={() => {
                          setEmojiOpen((open) => !open);
                          setGifOpen(false);
                          setFormatOpen(false);
                        }}
                        aria-label="Open Emoji Picker"
                        title="Open Emoji Picker"
                      >
                        <Smile size={18} />
                      </button>
                      <button
                        type="button"
                        className="gif-button"
                        onClick={() => {
                          setGifOpen((open) => !open);
                          setEmojiOpen(false);
                        }}
                        aria-label="Add a GIF"
                      >
                        GIF
                      </button>
                      <button
                        type="button"
                        className="composer-emoji-btn"
                        onClick={() => setPollDialogOpen(true)}
                        aria-label="Create a Poll"
                        title="Create a Poll"
                      >
                        <Vote size={18} />
                      </button>
                      <button
                        type="button"
                        className={`composer-emoji-btn composer-games-btn ${gamesOpen ? "active" : ""}`}
                        onClick={() => {
                          setGamesOpen((open) => !open);
                          setEmojiOpen(false);
                          setGifOpen(false);
                          setFormatOpen(false);
                        }}
                        aria-label="Games"
                        title="Play a game"
                        aria-expanded={gamesOpen}
                        disabled={!activeChannelId}
                      >
                        <Gamepad2 size={18} />
                      </button>
                      <button
                        type="button"
                        className="gif-button"
                        onClick={() => {
                          setDraft("/");
                          composerRef.current?.focus();
                        }}
                        aria-label="Show commands"
                      >
                        /
                      </button>
                      {!draft.trim() && pendingFiles.length === 0 ? (
                        <VoiceRecordButton
                          recorder={voiceRecorder}
                          disabled={!activeChannelId}
                        />
                      ) : (
                        <button
                          className="send-button"
                          type="submit"
                          aria-label="Send message"
                        >
                          <Send size={15} />
                        </button>
                      )}
                      </>
                      )}
                    </div>
                    </>
                  )}

                  <div className="composer-hint">
                    {typingNames.length > 0 ? (
                      <span className="typing-line">
                        <span className="typing-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                        {msnTheme
                          ? typingNames.length === 1
                            ? `${typingNames[0]} is writing a message...`
                            : `${typingNames.slice(0, 3).join(", ")} are writing messages...`
                          : typingNames.length === 1
                          ? `${typingNames[0]} is typing…`
                          : typingNames.length === 2
                            ? `${typingNames[0]} and ${typingNames[1]} are typing…`
                            : `${typingNames.length} people are typing…`}
                      </span>
                    ) : msnTheme ? (
                      <span className="msn-status-bar">{msnLastReceived(messages, user?.id)}</span>
                    ) : (
                      <span className="composer-hint-keys">
                        <kbd>Enter</kbd> send · <kbd>Shift+Enter</kbd> new line · <kbd>/</kbd> commands
                      </span>
                    )}
                  </div>
                </form>
              </>
            )}
            {msnTheme && (
              <MsnDisplayPictures
                them={
                  inDmHome && activeDm
                    ? { ...activeDm.user, name: activeDm.user.displayName }
                    : {
                        name: activeServer?.name || "Huddle",
                        avatar: activeServer?.icon || "H",
                        avatarUrl: activeServer?.iconUrl,
                        color: "#3a6ea5",
                      }
                }
                me={user ? { ...user, name: user.displayName } : null}
                onChangeMine={() => setPictureOpen(true)}
              />
            )}
          </>
        )}
      </section>

      {threadRoot && (
        <aside
          className="thread-panel"
          aria-label="Thread"
          style={{ width: `${threadWidth}px` }}
        >
          {/* Resize handle for thread panel */}
          <div
            className="thread-resize-handle"
            onMouseDown={onThreadResizeDown}
            title="Drag to resize thread"
          />

          <header className="thread-head">
            <div className="thread-head-info">
              <div className="thread-head-title-row">
                <MessageSquare size={16} className="thread-icon" />
                <span className="thread-title">
                  {threadRoot.text?.slice(0, 36) || (threadRoot.image ? "Image" : "Thread")}
                </span>
              </div>
              <span className="thread-head-channel">
                #{activeChannel?.name || "channel"}
              </span>
            </div>
            <div className="thread-head-actions">
              <button
                type="button"
                className="thread-close-btn"
                onClick={() => setThreadRoot(null)}
                aria-label="Close thread"
                title="Close thread"
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="thread-body">
            <article className="message thread-root">
              <Avatar
                className="avatar"
                avatar={
                  (threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.avatar
                    : null) || threadRoot.avatar
                }
                avatarUrl={
                  threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.avatarUrl
                    : undefined
                }
                color={
                  (threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.color
                    : null) || threadRoot.color
                }
              />
              <div className="message-body">
                <div className="message-meta">
                  <strong
                    style={{
                      color:
                        roleColorFor(
                          threadRoot.userId
                            ? membersById.get(threadRoot.userId)
                            : undefined,
                        ) || undefined,
                    }}
                  >
                    {threadRoot.author}
                  </strong>
                  <time title={formatClientDateTime(threadRoot.createdAt)}>
                    {formatClientTime(threadRoot.createdAt, threadRoot.time)}
                  </time>
                </div>
                <MessageBody
                  text={threadRoot.text}
                  selfHandle={user.username}
                  onMention={openProfileByHandle}
                  onImage={setLightboxImage}
                  emojis={emojiMap}
                  linkPreviews
                  channels={activeServer?.channels}
                  roles={activeServer?.roles}
                  onChannel={openMentionedChannel}
                />
                {(() => {
                  const allImages = [
                    threadRoot.image,
                    ...(threadRoot.images || []),
                  ].filter((img): img is string => typeof img === "string" && Boolean(img));
                  if (allImages.length === 0) return null;
                  return (
                    <ImageGallery
                      images={allImages}
                      onOpenLightbox={(imgs, idx) =>
                        setLightbox({ images: imgs, index: idx })
                      }
                    />
                  );
                })()}
                {threadRoot.file?.type === "pdf" && (
                  <button
                    type="button"
                    className="message-file-card"
                    onClick={() =>
                      setPdfViewer({
                        url: threadRoot.file!.url,
                        name: threadRoot.file!.name,
                      })
                    }
                  >
                    <span className="message-file-icon">PDF</span>
                    <span>
                      <strong>{threadRoot.file.name}</strong>
                      <small>PDF document · view and fill in Huddle</small>
                    </span>
                    <b aria-hidden="true">Open</b>
                  </button>
                )}
                {extractInviteCodes(threadRoot.text).map((code) => {
                  const inv = resolvedInvites[code];
                  if (!inv) return null;
                  const isCurrentlyMember = inv.server
                    ? servers.some((s) => s.id === inv.server?.id)
                    : false;
                  return (
                    <ServerInviteCard
                      key={code}
                      invite={inv}
                      isMember={isCurrentlyMember}
                      onJoin={() => {
                        if (isCurrentlyMember && inv.server) {
                          setActiveServerId(inv.server.id);
                        } else {
                          void joinServerDirect(code);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </article>

            <div className="thread-divider">
              <span>
                {threadMessages.length}{" "}
                {threadMessages.length === 1 ? "reply" : "replies"}
              </span>
            </div>

            {threadMessages.length === 0 && (
              <div className="thread-empty-state">
                <MessageSquare size={24} className="thread-empty-icon" />
                <p>No replies yet.</p>
                <span>Be the first to reply in this thread!</span>
              </div>
            )}

            {threadMessages.map((reply) => {
              const author = reply.userId
                ? membersById.get(reply.userId)
                : undefined;
              return (
                <article className="message thread-reply" key={reply.id}>
                  <Avatar
                    className="avatar"
                    avatar={author?.avatar || reply.avatar}
                    avatarUrl={author?.avatarUrl}
                    color={author?.color || reply.color}
                  />
                  <div className="message-body">
                    <div className="message-meta">
                      <strong
                        style={{ color: roleColorFor(author) || undefined }}
                      >
                        {author?.displayName || reply.author}
                      </strong>
                      <time title={formatClientDateTime(reply.createdAt)}>
                        {formatClientTime(reply.createdAt, reply.time)}
                      </time>
                    </div>
                    {reply.payload?.forwardedFrom ? (
                      <ForwardedMessageCard
                        data={reply.payload.forwardedFrom}
                        comment={reply.text}
                        selfHandle={user.username}
                        emojis={emojiMap}
                        onMention={openProfileByHandle}
                        onImage={setLightboxImage}
                        onPdf={setPdfViewer}
                        formatTime={(d) => formatClientTime(d, "")}
                      />
                    ) : (
                      <MessageBody
                        text={reply.text}
                        selfHandle={user.username}
                        onMention={openProfileByHandle}
                        onImage={setLightboxImage}
                        emojis={emojiMap}
                        linkPreviews
                        channels={activeServer?.channels}
                        roles={activeServer?.roles}
                        onChannel={openMentionedChannel}
                      />
                    )}
                    {reply.payload?.themeShare && (
                      <ThemeShareCard
                        theme={reply.payload.themeShare}
                        onApplyTheme={(th) => applyTheme(th)}
                      />
                    )}
                    {!reply.payload?.themeShare && reply.text?.includes("huddle-theme:v1:") && (() => {
                      const match = reply.text.match(/huddle-theme:v1:[a-zA-Z0-9+/=_-]+/);
                      if (!match) return null;
                      const parsed = importThemeCode(match[0]);
                      if (!parsed) return null;
                      return (
                        <ThemeShareCard
                          theme={parsed}
                          onApplyTheme={(th) => applyTheme(th)}
                        />
                      );
                    })()}
                    {(() => {
                      const allImages = [
                        reply.image,
                        ...(reply.images || []),
                      ].filter((img): img is string => typeof img === "string" && Boolean(img));
                      if (allImages.length === 0) return null;
                      return (
                        <ImageGallery
                          images={allImages}
                          onOpenLightbox={(imgs, idx) =>
                            setLightbox({ images: imgs, index: idx })
                          }
                        />
                      );
                    })()}
                    {reply.file?.type === "pdf" && (
                      <button
                        type="button"
                        className="message-file-card"
                        onClick={() =>
                          setPdfViewer({
                            url: reply.file!.url,
                            name: reply.file!.name,
                          })
                        }
                      >
                        <span className="message-file-icon">PDF</span>
                        <span>
                          <strong>{reply.file.name}</strong>
                          <small>PDF document · view and fill in Huddle</small>
                        </span>
                        <b aria-hidden="true">Open</b>
                      </button>
                    )}
                    {extractInviteCodes(reply.text).map((code) => {
                      const inv = resolvedInvites[code];
                      if (!inv) return null;
                      const isCurrentlyMember = inv.server
                        ? servers.some((s) => s.id === inv.server?.id)
                        : false;
                      return (
                        <ServerInviteCard
                          key={code}
                          invite={inv}
                          isMember={isCurrentlyMember}
                          onJoin={() => {
                            if (isCurrentlyMember && inv.server) {
                              setActiveServerId(inv.server.id);
                            } else {
                              void joinServerDirect(code);
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </article>
              );
            })}
            <div ref={threadBottomRef} />
          </div>

          <form
            className="thread-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendThreadReply();
            }}
          >
            <div className="thread-composer-inner">
              <textarea
                value={threadDraft}
                rows={1}
                placeholder="Reply in thread…"
                aria-label="Reply in thread"
                onChange={(event) => setThreadDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendThreadReply();
                  }
                }}
              />
              <button
                type="submit"
                className={`thread-send-btn ${threadDraft.trim() ? "can-send" : ""}`}
                disabled={!threadDraft.trim()}
                aria-label="Send reply"
                title="Send reply"
              >
                <Send size={15} />
              </button>
            </div>
          </form>
        </aside>
      )}

      <aside className={`member-panel ${membersOpen && !(inDmHome && !activeChannelId) ? "" : "closed"}`}>
        {/* Resize handle for members panel (Desktop) */}
        <div
          className="member-resize-handle"
          onMouseDown={onMembersResizeDown}
          title="Drag to resize member list"
        />

        {voice.channelId && (
          <>
            <div className="member-panel-title">
              <span>IN VOICE — {voiceParticipants.length}</span>
            </div>
            <div className="voice-feature">
              <div className="voice-feature-avatars">
                {voiceParticipants.slice(0, 5).map((person) => (
                  <Avatar
                    key={person.connectionId}
                    avatar={person.avatar}
                    avatarUrl={person.avatarUrl}
                    color={person.color}
                  />
                ))}
              </div>
              <strong>{currentVoiceChannel?.name}</strong>
              <p>
                {voiceParticipants.length === 1
                  ? "Just you so far"
                  : `${voiceParticipants.length} in the room`}
              </p>
              <div className="voice-controls">
                <button
                  className={`mic-control ${voice.muted ? "muted" : ""}`}
                  onClick={voice.toggleMute}
                  disabled={voice.forcedMute}
                >
                  {voice.forcedMute
                    ? "Server muted"
                    : voice.muted
                      ? "Muted"
                      : "Mic on"}
                </button>
                <button className="leave-outline" onClick={voice.leave}>
                  Leave
                </button>
              </div>
              <div className="screen-share-controls compact">
                <select
                  aria-label="Screen share quality"
                  value={voice.screenQuality}
                  disabled={voice.screenSharing}
                  onChange={(event) =>
                    voice.setScreenQuality(
                      event.target.value as ScreenShareQuality,
                    )
                  }
                >
                  <option value="720p30">720p30</option>
                  <option value="1080p30">1080p30</option>
                  <option value="1080p60">1080p60</option>
                </select>
                <button
                  className={voice.screenSharing ? "sharing" : ""}
                  onClick={() =>
                    voice.screenSharing
                      ? voice.stopScreenShare()
                      : void voice.startScreenShare()
                  }
                >
                  {voice.screenSharing ? "Stop" : "Share screen"}
                </button>
                <button
                  className={voice.cameraOn ? "sharing" : ""}
                  onClick={() =>
                    voice.cameraOn ? voice.stopCamera() : void voice.startCamera()
                  }
                >
                  {voice.cameraOn ? "Camera off" : "Camera"}
                </button>
              </div>
            </div>

            {stageChannelId !== voice.channelId && voice.channelId && (
              <button
                type="button"
                className="open-stage-button"
                onClick={() => setStageChannelId(voice.channelId)}
              >
                Open call view
              </button>
            )}
          </>
        )}

        <div className="px-3 pt-2 pb-1">
          <div className="relative flex items-center">
            <input
              type="text"
              value={memberFilterQuery}
              onChange={(e) => setMemberFilterQuery(e.target.value)}
              placeholder="Search members..."
              className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] text-xs text-white placeholder-white/40 rounded-lg px-2.5 py-1.5 outline-none transition-colors border border-white/5 focus:border-[#7b63e6]/50"
            />
            {memberFilterQuery && (
              <button
                type="button"
                onClick={() => setMemberFilterQuery("")}
                className="absolute right-2 text-white/40 hover:text-white text-xs px-1"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {(() => {
          // One row per contact; Online and Not Online share it, and so do
          // the MSN theme's own groups.
          const row = (member: Member, offline: boolean) =>
            offline ? (
          <div
            className="member offline-member clickable-name"
            key={member.id}
            {...userMenuHandlers(member)}
            onClick={() => openProfile(member)}
              onMouseEnter={(event) => msnTheme && queueHoverCard(member, event.currentTarget)}
              onMouseLeave={() => msnTheme && queueHoverCard(null)}
          >
            <Avatar
              className="member-avatar"
              avatar={member.avatar}
              avatarUrl={member.avatarUrl}
              color={member.color}
            />
            <div>
              <div className="member-name-line">
                <strong style={{ color: roleColorFor(member) || undefined }}>
                  <StyledText text={member.displayName} />
                </strong>
                <PrideBadges badges={member.prideBadges} mini />
                {activeUntil(member.timeoutUntil) && (
                  <span
                    className="member-timeout-icon"
                    title={`Timed out until ${formatClientDateTime(member.timeoutUntil!)}`}
                    aria-label="Timed out"
                  >
                    <Timer size={12} />
                  </span>
                )}
              </div>
              <span>Away</span>
            </div>
          </div>
            ) : (
          <div
            className="member clickable-name"
            key={member.id}
            {...userMenuHandlers(member)}
            onClick={() => openProfile(member)}
              onMouseEnter={(event) => msnTheme && queueHoverCard(member, event.currentTarget)}
              onMouseLeave={() => msnTheme && queueHoverCard(null)}
          >
            <Avatar
              className="member-avatar"
              avatar={member.avatar}
              avatarUrl={member.avatarUrl}
              color={member.color}
            >
              <span
                className="presence-dot"
                title={
                  PRESENCE[
                    (presenceOf(member) === "offline"
                      ? "invisible"
                      : presenceOf(member)) as PresenceStatus
                  ].label
                }
                style={{
                  background:
                    presenceOf(member) === "offline"
                      ? PRESENCE.invisible.color
                      : PRESENCE[presenceOf(member) as PresenceStatus].color,
                }}
              />
            </Avatar>
            <div>
              <div className="member-name-line">
                <strong style={{ color: roleColorFor(member) || undefined }}>
                  <StyledText text={member.displayName} />
                </strong>
                <PrideBadges badges={member.prideBadges} mini />
                {activeUntil(member.timeoutUntil) && (
                  <span
                    className="member-timeout-icon"
                    title={`Timed out until ${formatClientDateTime(member.timeoutUntil!)}`}
                    aria-label="Timed out"
                  >
                    <Timer size={12} />
                  </span>
                )}
              </div>
              <span>
                <StyledText text={(member.id === user.id ? myCustomStatus : member.customStatus) ||
                  (member.id === user.id
                    ? "Here now"
                    : prefFor(member.id).muted
                      ? "Muted for you"
                      : hub.forcedMutes.has(member.id)
                        ? "Server muted"
                        : PRESENCE[
                          (presenceOf(member) === "offline"
                            ? "invisible"
                            : presenceOf(member)) as PresenceStatus
                        ].label)} />
              </span>
            </div>
          </div>
            );
          const placement = msnTheme ? msnContacts.contacts.placement : {};
          const groups = msnTheme ? msnContacts.contacts.groups : [];
          const unplaced = (list: Member[]) =>
            groups.length ? list.filter((m) => !groups.some((g) => g.id === placement[m.id])) : list;
          const looseOnline = unplaced(onlineMembers);
          const looseOffline = unplaced(offlineMembers);
          const header = (key: string, label: string, extraClass: string, tools?: ReactNode) => (
            <div
              className={`member-panel-title ${extraClass} ${msnTheme && collapsedGroups[key] ? "msn-collapsed" : ""}`}
              role={msnTheme ? "button" : undefined}
              tabIndex={msnTheme ? 0 : undefined}
              aria-expanded={msnTheme ? !collapsedGroups[key] : undefined}
              onClick={() => msnTheme && setCollapsedGroups((g) => ({ ...g, [key]: !g[key] }))}
              onKeyDown={(event) => {
                if (msnTheme && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setCollapsedGroups((g) => ({ ...g, [key]: !g[key] }));
                }
              }}
            >
              <span>{label}</span>
              {tools}
            </div>
          );
          return (
            <>
              {groups.map((group) => {
                const inGroupOnline = onlineMembers.filter((m) => placement[m.id] === group.id);
                const inGroupOffline = offlineMembers.filter((m) => placement[m.id] === group.id);
                return (
                  <div key={group.id} className="msn-contact-group">
                    {header(
                      `group:${group.id}`,
                      `${group.name} (${inGroupOnline.length}/${inGroupOnline.length + inGroupOffline.length})`,
                      "msn-group-title",
                      <span className="msn-group-tools" onClick={(event) => event.stopPropagation()}>
                        <button type="button" title="Rename group" onClick={() => renameContactGroup(group.id)}>
                          ✎
                        </button>
                        <button type="button" title="Delete group" onClick={() => deleteContactGroup(group.id)}>
                          ×
                        </button>
                      </span>,
                    )}
                    {!collapsedGroups[`group:${group.id}`] && (
                      <>
                        {inGroupOnline.map((member) => row(member, false))}
                        {inGroupOffline.map((member) => row(member, true))}
                      </>
                    )}
                  </div>
                );
              })}
              {header(
                "online",
                msnTheme ? `Online (${looseOnline.length})` : `ONLINE — ${looseOnline.length}`,
                "online-title",
              )}
              {!(msnTheme && collapsedGroups.online) && looseOnline.map((member) => row(member, false))}
              {header(
                "offline",
                msnTheme ? `Not Online (${looseOffline.length})` : `OFFLINE — ${looseOffline.length}`,
                "offline-title",
              )}
              {!(msnTheme && collapsedGroups.offline) && looseOffline.map((member) => row(member, true))}
              {msnTheme && (
                <button type="button" className="msn-add-group" onClick={() => createContactGroup()}>
                  + Create a group
                </button>
              )}
            </>
          );
        })()}
        {msnTheme && (
          <MsnWhatsNew
            feed={whatsNew.feed}
            onClear={whatsNew.clear}
            onOpen={(id) => {
              const person = whatsNewPeople.find((p) => p.id === id);
              if (person) openProfile(person);
            }}
          />
        )}
        {msnTheme && <MsnAdBanner onClick={() => setGlobalSearchOpen(true)} />}
      </aside>

      {/* Remote voice audio. Hidden, but this is what you actually hear. */}
      {voice.channelId && (
        <RemoteVoiceAudio
          key={voice.channelId}
          streams={voice.remoteStreams}
          participants={voiceParticipants}
          listenerId={hub.connectionId}
          enabled={voice.tableMode}
          hostId={voice.tableHostId}
          seatOrder={voice.tableSeatOrder}
          seatPans={voice.tableSeatPans}
          width={voice.tableWidth}
          headTracking={voice.headTracking}
          headTrackingSource={voice.headTrackingSource}
          headphones={voice.spatialOutput === "headphones"}
          onHeadTracking={voice.onHeadTracking}
          deafened={voice.deafened}
          preferenceFor={(id) => {
            const pref = prefFor(id);
            if (id === "bot:music") {
              const generalVol = Math.max(
                0,
                Math.min(1, (roomPlayer?.volume ?? 100) / 100),
              );
              return {
                volume: volumeGain(pref.volume) * generalVol,
                muted: pref.muted,
              };
            }
            return { volume: volumeGain(pref.volume), muted: pref.muted };
          }}
        />
      )}

      {botMenu && (
        <BotMenu
          name={botMenu.kind === "music" ? "Music + Watch" : "D&D Bot"}
          description={
            botMenu.kind === "music"
              ? "Music and watch-together bot"
              : "Tabletop helper bot"
          }
          x={botMenu.x}
          y={botMenu.y}
          actions={
            botMenu.kind === "music" ? musicBotActions : dndBotActions
          }
          voicePref={
            botMenu.kind === "music"
              ? prefFor("bot:music")
              : undefined
          }
          onVoiceMute={
            botMenu.kind === "music"
              ? (muted) => void saveVoicePref("bot:music", { muted })
              : undefined
          }
          onVoiceVolume={
            botMenu.kind === "music"
              ? (volume) => void saveVoicePref("bot:music", { volume })
              : undefined
          }
          onClose={() => setBotMenu(null)}
        />
      )}

      {userMenu && (
        <UserMenu
          target={userMenu}
          isSelf={userMenu.member.id === user.id}
          extra={
            msnTheme && userMenu.member.id !== user.id ? (
              <div className="msn-menu-extra">
                <div className="user-menu-divider" />
                <p className="user-menu-note">Contact group</p>
                {msnContacts.contacts.groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={msnContacts.contacts.placement[userMenu.member.id] === group.id}
                    className={msnContacts.contacts.placement[userMenu.member.id] === group.id ? "active" : ""}
                    onClick={() => {
                      placeContact(userMenu.member.id, group.id);
                      setUserMenu(null);
                    }}
                  >
                    {msnContacts.contacts.placement[userMenu.member.id] === group.id ? "✓ " : ""}
                    {group.name}
                  </button>
                ))}
                {msnContacts.contacts.placement[userMenu.member.id] && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      placeContact(userMenu.member.id, null);
                      setUserMenu(null);
                    }}
                  >
                    Remove from group
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const id = userMenu.member.id;
                    setUserMenu(null);
                    createContactGroup(id);
                  }}
                >
                  New group…
                </button>
                <div className="user-menu-divider" />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={!msnContacts.contacts.quiet.includes(userMenu.member.id)}
                  onClick={() => {
                    toggleSignInAlert(userMenu.member.id);
                    setUserMenu(null);
                  }}
                >
                  {msnContacts.contacts.quiet.includes(userMenu.member.id) ? "" : "✓ "}
                  Alert me when they sign in
                </button>
              </div>
            ) : undefined
          }
          isOwner={Boolean(user.isAdmin)}
          onToggleInvitePermission={
            user.isAdmin && !userMenu.member.isAdmin && userMenu.member.id !== user.id
              ? async () => {
                const targetMember = userMenu.member;
                const newCanInvite = !targetMember.canInvite;
                setUserMenu(null);
                try {
                  await apiFetch("/api/invites/permissions", {
                    method: "POST",
                    body: JSON.stringify({
                      userId: targetMember.id,
                      canInvite: newCanInvite,
                    }),
                  });
                  setMembers((prev) =>
                    prev.map((m) =>
                      m.id === targetMember.id
                        ? { ...m, canInvite: newCanInvite }
                        : m,
                    ),
                  );
                } catch (err) {
                  console.error("Failed to update invite permission:", err);
                }
              }
              : undefined
          }
          pref={prefFor(userMenu.member.id)}
          serverMuted={hub.forcedMutes.has(userMenu.member.id)}
          isBlocked={blockedUserIds.has(userMenu.member.id)}
          onBlock={() => {
            void handleBlockUser(userMenu.member.id);
          }}
          onUnblock={() => {
            void handleUnblockUser(userMenu.member.id);
          }}
          onClose={() => setUserMenu(null)}
          onMessage={() => {
            const id = userMenu.member.id;
            setUserMenu(null);
            void openDm(id);
          }}
          onLocalMute={(muted) => {
            void saveVoicePref(userMenu.member.id, { muted });
          }}
          onVolume={(volume) => {
            void saveVoicePref(userMenu.member.id, { volume });
          }}
          onServerMute={(muted) => {
            void saveVoicePref(userMenu.member.id, { serverMuted: muted });
            setUserMenu(null);
          }}
          canModerate={canModerate}
          canManage={canManageServer && !inDmHome}
          onRemoveFromGroup={
            inDmHome &&
              activeDm?.group &&
              activeDm.group.ownerId === user.id &&
              userMenu.member.id !== user.id &&
              activeDm.group.members.some((m) => m.id === userMenu.member.id)
              ? () => {
                removeFromGroupDm(activeDm, userMenu.member);
                setUserMenu(null);
              }
              : undefined
          }
          onKick={() => {
            void moderateMember(userMenu.member.id, "kick");
            setUserMenu(null);
          }}
          onBan={() => {
            void moderateMember(userMenu.member.id, "ban");
            setUserMenu(null);
          }}
          banned={bannedIds.has(userMenu.member.id)}
          onUnban={() => {
            void moderateMember(userMenu.member.id, "unban");
            setUserMenu(null);
          }}
          voiceChannels={
            canModerate && !inDmHome
              ? voiceChannels.map((channel) => ({
                id: channel.id,
                name: channel.name,
              }))
              : []
          }
          targetVoiceChannelId={
            voiceChannels.find((channel) =>
              (voiceRooms[channel.id] || []).some(
                (person) => person.id === userMenu.member.id,
              ),
            )?.id || null
          }
          voiceJoinedAt={userMenuVoiceJoinedAt}
          serverNow={hub.serverNow}
          onMove={(channelId) => {
            void moveMember(userMenu.member.id, channelId);
            setUserMenu(null);
          }}
          timeoutUntil={activeUntil(membersById.get(userMenu.member.id)?.timeoutUntil)}
          onTimeout={
            !inDmHome &&
            userMenu.member.id !== user.id &&
            membersById.has(userMenu.member.id) &&
            !membersById.get(userMenu.member.id)?.isAdmin &&
            activeServer?.ownerId !== userMenu.member.id &&
            (canModerate ||
              canManageServer ||
              hasPermission(myPermissions, Permission.KICK_MEMBERS))
              ? (minutes) => {
                  const id = userMenu.member.id;
                  setUserMenu(null);
                  void timeoutMember(id, minutes);
                }
              : undefined
          }
          onNickname={
            !inDmHome &&
            membersById.has(userMenu.member.id) &&
            (userMenu.member.id === user.id ||
              (canManageNicknames &&
                !membersById.get(userMenu.member.id)?.isAdmin &&
                activeServer?.ownerId !== userMenu.member.id))
              ? () => {
                  const id = userMenu.member.id;
                  setUserMenu(null);
                  editNickname(id);
                }
              : undefined
          }
        />
      )}

      {eventsOpen && activeServer && !inDmHome && user && (
        <EventsPanel
          serverId={activeServer.id}
          events={serverEvents}
          reload={reloadEvents}
          userId={user.id}
          canManage={canManageServer || canManageChannels}
          voiceChannels={voiceChannels.map((channel) => ({ id: channel.id, name: channel.name }))}
          onJoinVoice={(channelId) => {
            const channel = voiceChannels.find((item) => item.id === channelId);
            setEventsOpen(false);
            if (channel) openVoiceChannel(channel);
          }}
          onClose={() => setEventsOpen(false)}
          onRequestConfirm={showCustomConfirm}
        />
      )}

      {editHistoryId && (
        <EditHistoryDialog messageId={editHistoryId} onClose={() => setEditHistoryId(null)} />
      )}

      {railMenu && (
        <>
          <div
            className="menu-shade"
            onClick={() => setRailMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setRailMenu(null);
            }}
          />
          <div
            className="user-menu"
            role="menu"
            style={{
              left: Math.min(railMenu.x, (globalThis.innerWidth || 1200) - 240),
              top: Math.min(railMenu.y, (globalThis.innerHeight || 800) - 260),
            }}
          >
            <div className="user-menu-head">
              <strong>{railMenu.server.name}</strong>
            </div>
            <button
              type="button"
              role="menuitem"
              disabled={!railMenu.server.channels.some((c) => unread[c.id])}
              onClick={() => {
                markServerRead(railMenu.server);
                setRailMenu(null);
              }}
            >
              Mark as read
            </button>
            {folderIdOf(railMenu.server.id) && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  saveServerFolders(removeFromFolders(serverFolders, railMenu.server.id));
                  setRailMenu(null);
                }}
              >
                Remove from folder
              </button>
            )}
            <div className="user-menu-divider" />
            <div className="user-menu-head">
              <span>Notifications</span>
            </div>
            {(
              [
                ["all", "All messages"],
                ["mentions", "Only @mentions"],
                ["nothing", "Nothing"],
              ] as const
            ).map(([level, label]) => {
              const key = `server:${railMenu.server.id}`;
              const current = channelPrefs[key] || "all";
              return (
                <button
                  key={level}
                  type="button"
                  role="menuitem"
                  className={current === level ? "active" : ""}
                  onClick={() => {
                    setNotifyLevel(key, level);
                    setRailMenu(null);
                  }}
                >
                  {current === level ? "● " : "○ "}
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {folderMenu && (
        <>
          <div
            className="menu-shade"
            onClick={() => setFolderMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setFolderMenu(null);
            }}
          />
          <div
            className="user-menu"
            role="menu"
            style={{
              left: Math.min(folderMenu.x, (globalThis.innerWidth || 1200) - 240),
              top: Math.min(folderMenu.y, (globalThis.innerHeight || 800) - 260),
            }}
          >
            <div className="user-menu-head">
              <strong>{folderMenu.folder.name || "Server folder"}</strong>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                for (const server of servers) {
                  if (folderMenu.folder.serverIds.includes(server.id)) markServerRead(server);
                }
                setFolderMenu(null);
              }}
            >
              Mark folder as read
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const target = folderMenu.folder;
                setFolderMenu(null);
                showCustomPrompt({
                  title: "Folder name",
                  message: "Leave it empty to show the servers' names.",
                  defaultValue: target.name,
                  placeholder: "Games, Friends, Work…",
                  confirmText: "Save",
                  maxLength: 40,
                  onConfirm: (value) =>
                    saveServerFolders(
                      serverFolders.map((folder) =>
                        folder.id === target.id
                          ? { ...folder, name: (value || "").trim() }
                          : folder,
                      ),
                    ),
                });
              }}
            >
              Rename folder
            </button>
            <div className="user-menu-divider" />
            <div className="user-menu-head">
              <span>Colour</span>
            </div>
            <div className="rail-folder-colors">
              {["#5865f2", "#3ba55c", "#faa61a", "#ed4245", "#eb459e", "#9b59b6", "#1abc9c", "#747f8d"].map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Colour ${color}`}
                    className={folderMenu.folder.color === color ? "is-current" : ""}
                    style={{ background: color }}
                    onClick={() => {
                      saveServerFolders(
                        serverFolders.map((folder) =>
                          folder.id === folderMenu.folder.id ? { ...folder, color } : folder,
                        ),
                      );
                      setFolderMenu(null);
                    }}
                  />
                ),
              )}
            </div>
            <div className="user-menu-divider" />
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                saveServerFolders(
                  serverFolders.filter((folder) => folder.id !== folderMenu.folder.id),
                );
                setFolderMenu(null);
              }}
            >
              Ungroup servers
            </button>
          </div>
        </>
      )}

      {channelMenu && (
        <>
          <div
            className="menu-shade"
            onClick={() => setChannelMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setChannelMenu(null);
            }}
          />
          <div
            className="user-menu"
            role="menu"
            style={{
              left: Math.min(channelMenu.x, (globalThis.innerWidth || 1200) - 240),
              top: Math.min(channelMenu.y, (globalThis.innerHeight || 800) - 280),
            }}
          >
            <div className="user-menu-head">
              <strong>
                {channelKindIcon(channelMenu.channel.kind)}
                {" "}
                {channelMenu.channel.name}
              </strong>
              <span>Notifications</span>
            </div>
            {(
              [
                ["all", "All messages"],
                ["mentions", "Only @mentions"],
                ["nothing", "Nothing"],
              ] as const
            ).map(([level, label]) => {
              const current = channelPrefs[channelMenu.channel.id] || "all";
              return (
                <button
                  key={level}
                  type="button"
                  role="menuitem"
                  className={current === level ? "active" : ""}
                  onClick={() => {
                    setNotifyLevel(channelMenu.channel.id, level);
                    setChannelMenu(null);
                  }}
                >
                  {current === level ? "● " : "○ "}
                  {label}
                </button>
              );
            })}
            {canManageChannels && (
              <>
                <div className="user-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void renameChannel(channel);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void editChannelTopic(channel);
                  }}
                >
                  Edit Topic
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void editChannelSlowmode(channel);
                  }}
                >
                  Set Slowmode
                </button>
                {convertibleKinds(channelMenu.channel.kind).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const channel = channelMenu.channel;
                      setChannelMenu(null);
                      void changeChannelKind(channel, kind);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {channelKindIcon(kind)} Make it {withArticle(channelKindLabel(kind))}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="danger"
                  onClick={() => {
                    const channel = channelMenu.channel;
                    setChannelMenu(null);
                    void deleteChannel(channel);
                  }}
                >
                  Delete channel
                </button>
              </>
            )}
          </div>
        </>
      )}

      {lightbox && lightbox.images[lightbox.index] && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label="Close image"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          {lightbox.images.length > 1 && (
            <>
              <button
                type="button"
                className="lightbox-nav lightbox-prev"
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index:
                            (prev.index - 1 + prev.images.length) %
                            prev.images.length,
                        }
                      : null,
                  );
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="lightbox-nav lightbox-next"
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((prev) =>
                    prev
                      ? {
                          ...prev,
                          index: (prev.index + 1) % prev.images.length,
                        }
                      : null,
                  );
                }}
              >
                ›
              </button>
              <div
                className="lightbox-counter"
                onClick={(e) => e.stopPropagation()}
              >
                {lightbox.index + 1} / {lightbox.images.length}
              </div>
            </>
          )}
          <img
            key={lightbox.images[lightbox.index]}
            src={lightbox.images[lightbox.index]}
            alt=""
            onClick={(event) => event.stopPropagation()}
          />
          <a
            className="lightbox-open"
            href={lightbox.images[lightbox.index]}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Open original ↗
          </a>
        </div>
      )}

      {pdfViewer && (
        <PdfViewer
          url={pdfViewer.url}
          name={pdfViewer.name}
          onClose={() => setPdfViewer(null)}
        />
      )}

      {profileMember && (
        <ProfileCard
          member={profileMember}
          online={hub.online.has(profileMember.id)}
          roles={rolesForMember(profileMember)}
          isSelf={profileMember.id === user.id}
          onMessage={() => {
            const id = profileMember.id;
            setProfileMember(null);
            void openDm(id);
          }}
          onClose={() => setProfileMember(null)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          user={user}
          theme={theme}
          onTheme={applyTheme}
          onShareThemeToChat={handleShareThemeToChat}
          onUser={setUser}
          onClose={() => setSettingsOpen(false)}
          onSignOut={signOut}
          onMicrophoneChange={() => void voice.switchMicrophone()}
          micSettings={voice.micSettings}
          onMicSettings={voice.setMicSettings}
          subscribeMicTelemetry={voice.subscribeMicTelemetry}
          inCall={Boolean(voice.channelId)}
          relay={voice.relay}
          onCheckRelay={() => void voice.recheckRelay()}
          headTracking={voice.headTracking}
          setHeadTracking={voice.setHeadTracking}
          headTrackingOffered={voice.headTrackingOffered}
          airpodsOffered={voice.airpodsOffered}
          headTrackingSource={voice.headTrackingSource}
          setHeadTrackingSource={voice.setHeadTrackingSource}
          spatialOutput={voice.spatialOutput}
          setSpatialOutput={voice.setSpatialOutput}
          headTrackingStatus={voice.headTrackingStatus}
          recenterHead={voice.recenterHead}
          tableMode={voice.tableMode}
          onTableMode={voice.setTableMode}
          tableHostId={voice.tableHostId}
          onTableHostId={voice.setTableHostId}
          tableParticipants={voiceParticipants.filter((p) => !p.bot && !p.recorder)}
          pushToTalk={voice.pushToTalk}
          pttKey={voice.pttKey}
          onPushToTalk={voice.setPushToTalk}
          onPttKey={voice.setPttKey}
          muteKey={voice.muteKey}
          deafenKey={voice.deafenKey}
          onMuteKey={voice.setMuteKey}
          onDeafenKey={voice.setDeafenKey}
          server={inDmHome ? null : activeServer}
          members={members}
          canManageServer={canManageServer}
        />
      )}

      {serverSettingsOpen && activeServer && (
        <ServerSettingsDialog
          server={activeServer}
          members={members}
          onlineUserIds={hub.online}
          canManageServer={canManageServer}
          canManageExpressions={
            hasPermission(myPermissions, Permission.MANAGE_EMOJIS) ||
            hasPermission(myPermissions, Permission.MANAGE_CHANNELS)
          }
          canCreateInvites={canCreateServerInvites}
          onClose={() => setServerSettingsOpen(false)}
          onServerUpdated={() => void loadServers().catch(() => undefined)}
          onServerDeleted={() => {
            void loadServers().catch(() => undefined);
            setActiveServerId(servers[0]?.id || null);
          }}
          onRequestPrompt={showCustomPrompt}
          onRequestConfirm={showCustomConfirm}
          isOwner={Boolean(user && activeServer.ownerId === user.id)}
          onLeaveServer={() => void leaveServer(activeServer.id)}
        />
      )}

      <GlobalUserSearchDialog
        isOpen={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onlineUserIds={hub.online}
        servers={servers}
        onOpenDm={(targetUser) => {
          void openDm(targetUser.id);
        }}
        onSelectServer={(serverId) => {
          setActiveServerId(serverId);
          setStageChannelId(null);
          setMobileNav(false);
        }}
      />

      {dialogOptions && (
        <CustomDialog
          options={dialogOptions}
          onConfirm={(val) => {
            // Clear first, THEN run the callback: a callback that opens another
            // dialog (name → background) would otherwise be wiped by these
            // resets, which is why "Next" appeared to do nothing.
            const callback = dialogCallback;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            callback?.(val);
          }}
          onCancel={() => {
            const cancel = dialogCancel;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            cancel?.();
          }}
          onDismiss={() => {
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
          }}
        />
      )}

      <GroupDmDialog
        open={Boolean(groupDialog)}
        existingMemberIds={
          groupDialog?.mode === "add"
            ? dms
              .find((dm) => dm.channelId === groupDialog.channelId)
              ?.group?.members.map((member) => member.id) || []
            : undefined
        }
        groupName={
          groupDialog?.mode === "add"
            ? dms.find((dm) => dm.channelId === groupDialog.channelId)?.user.displayName
            : undefined
        }
        onClose={() => setGroupDialog(null)}
        onSubmit={(userIds, name) =>
          groupDialog?.mode === "add"
            ? addToGroupDm(groupDialog.channelId, userIds)
            : createGroupDm(userIds, name)
        }
      />

      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        servers={servers}
        channels={servers.flatMap((s) => s.channels || [])}
        dms={dms.map((d) => ({
          id: d.channelId,
          user: {
            id: d.user.id,
            displayName: d.user.displayName,
            username: d.user.username,
            avatar: d.user.avatar,
            avatarUrl: d.user.avatarUrl || undefined,
          },
        }))}
        onSelect={(target: QuickSwitcherTarget) => {
          if (target.type === "channel") {
            if (target.serverId && target.serverId !== activeServerId) {
              setActiveServerId(target.serverId);
            }
            if (channelKindInfo(target.kind).appearsAsVoice) {
              setStageChannelId(target.id);
              void voice.join(target.id);
            } else {
              setActiveChannelId(target.id);
              setStageChannelId(null);
            }
          } else if (target.type === "dm") {
            setActiveServerId(DM_HOME);
            setActiveChannelId(target.id);
            setStageChannelId(null);
            if (dms.find((dm) => dm.channelId === target.id)?.hidden) {
              void setDmClosed(target.id, false);
            }
          } else if (target.type === "server") {
            setActiveServerId(target.id);
          }
        }}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <PollDialog
        open={pollDialogOpen}
        onClose={() => setPollDialogOpen(false)}
        onSubmit={async (question, options, isPrivate) => {
          if (!activeChannelId) return;
          try {
            await apiFetch("/api/polls", {
              method: "POST",
              body: JSON.stringify({
                channelId: activeChannelId,
                question,
                options,
                isPrivate,
              }),
            });
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "Failed to create poll");
          }
        }}
      />

      {profileCardTarget && (
        <UserProfileCard
          member={profileCardTarget.member}
          roles={activeServer?.roles || []}
          userRoles={
            profileCardTarget.member.roleIds?.[activeServerId || ""] || []
          }
          position={profileCardTarget.pos}
          onClose={() => setProfileCardTarget(null)}
          onToggleRole={
            canManageServer && activeServer && !inDmHome
              ? async (roleId, add) => {
                const serverId = activeServer.id;
                await apiFetch("/api/roles/assign", {
                  method: "POST",
                  body: JSON.stringify({
                    serverId,
                    userId: profileCardTarget.member.id,
                    roleId,
                    add,
                  }),
                });
                void loadMembers().catch(() => undefined);
              }
              : undefined
          }
          isSelf={user?.id === profileCardTarget.member.id}
          presence={presenceOf(profileCardTarget.member)}
          isBlocked={blockedUserIds.has(profileCardTarget.member.id)}
          onEditProfile={() => {
            setProfileCardTarget(null);
            setSettingsOpen(true);
          }}
          friendStatus={
            friendUserIds.has(profileCardTarget.member.id)
              ? "friend"
              : incomingFriendUserIds.has(profileCardTarget.member.id)
                ? "incoming"
                : outgoingFriendUserIds.has(profileCardTarget.member.id)
                  ? "outgoing"
                  : "none"
          }
          onAddFriend={(targetUserId, targetUsername) => {
            void handleAddFriend(targetUserId, targetUsername);
          }}
          onRemoveFriend={(targetUserId) => {
            void handleRemoveFriend(targetUserId);
          }}
          onAcceptFriend={(targetUserId) => {
            void handleAcceptFriend(targetUserId);
          }}
          onBlock={(targetUserId) => {
            void handleBlockUser(targetUserId);
          }}
          onUnblock={(targetUserId) => {
            void handleUnblockUser(targetUserId);
          }}
          onDirectMessage={(targetUserId) => {
            void openDm(targetUserId);
          }}
          onMention={(username) => {
            setDraft((curr) => curr + `@${username} `);
            composerRef.current?.focus();
          }}
        />
      )}

      {incomingDmCall && (
        <div className="incoming-call-overlay" role="alertdialog" aria-modal="true" aria-label="Incoming Call">
          <div className="incoming-call-card">
            <div className="incoming-call-avatar-wrapper">
              <Avatar
                avatar={incomingDmCall.fromAvatar}
                avatarUrl={incomingDmCall.fromAvatarUrl}
                color="#a78bfa"
                name={incomingDmCall.fromDisplayName}
                size={52}
              />
            </div>
            <div className="incoming-call-info">
              <span className="incoming-call-name">{incomingDmCall.fromDisplayName}</span>
              <span className="incoming-call-subtitle">
                {incomingDmCall.isVideo ? <Video size={13} /> : <PhoneCall size={13} />}
                Incoming {incomingDmCall.isVideo ? "Video" : "Voice"} Call...
              </span>
            </div>
            <div className="incoming-call-actions">
              <button
                type="button"
                className="incoming-call-btn decline"
                onClick={declineIncomingCall}
                title="Decline Call"
                aria-label="Decline Call"
              >
                <PhoneOff size={20} />
              </button>
              <button
                type="button"
                className="incoming-call-btn accept"
                onClick={acceptIncomingCall}
                title="Accept Call"
                aria-label="Accept Call"
              >
                {incomingDmCall.isVideo ? <Video size={20} /> : <PhoneCall size={20} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {markdownModalOpen && (
        <div
          className="markdown-guide-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setMarkdownModalOpen(false)}
        >
          <div
            className="markdown-guide-modal w-full max-w-lg rounded-2xl border border-[#2e2646] bg-[#161224] p-5 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#ede9f6]">Markdown & Code Snippets</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple-500/40 bg-purple-500/10 text-purple-300">
                  Active
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMarkdownModalOpen(false)}
                className="popup-close-x"
                aria-label="Close markdown guide"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-[#b8b0cf] leading-relaxed">
              Hoffle natively formats your messages with Discord-flavoured Markdown. Send code snippets with syntax highlighting using triple backticks.
            </p>

            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[#9e83fc] uppercase tracking-wider">
                Code Blocks (C++, Python, JS, Bash):
              </div>
              <div className="rounded-xl border border-[#28223e] bg-[#0f0d19] p-3 font-mono text-[11px] text-[#c4b5fd]">
                <div>```cpp</div>
                <div className="text-[#a499c8] pl-2">#include &lt;iostream&gt;</div>
                <div className="text-[#a499c8] pl-2">int main() &#123;</div>
                <div className="text-emerald-400 pl-4">std::cout &lt;&lt; &quot;Hello from Hoffle!&quot; &lt;&lt; std::endl;</div>
                <div className="text-[#a499c8] pl-4">return 0;</div>
                <div className="text-[#a499c8] pl-2">&#125;</div>
                <div>```</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-[#a499c8]">
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <strong className="text-white">**bold**</strong> → <strong>bold</strong>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <em className="text-white">*italic*</em> → <em>italic</em>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <code className="text-purple-300">`code`</code> → <code className="text-xs">code</code>
              </div>
              <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <span className="text-white">||spoiler||</span> → spoiler
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => {
                  setDraft("```cpp\n#include <iostream>\n\nint main() {\n    std::cout << \"Hello from Hoffle!\" << std::endl;\n    return 0;\n}\n```");
                  setMarkdownModalOpen(false);
                  composerRef.current?.focus();
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#7c5cfc] hover:bg-[#6c48f8] text-white transition-colors cursor-pointer"
              >
                Insert C++ Code Template
              </button>
              <button
                type="button"
                onClick={() => setMarkdownModalOpen(false)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#b8b0cf] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <BlahajBuddy />
      <ToastContainer />

      {reactionPicker && (
        <div
          className="reaction-picker-overlay"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="reaction-picker-backdrop"
            onClick={() => setReactionPicker(null)}
          />
          <div
            className="reaction-picker-floating"
            style={{
              top: reactionPicker.top,
              right: reactionPicker.right,
            }}
          >
            <EmojiPicker
              className="discord-emoji-picker reaction-picker"
              serverId={inDmHome ? null : activeServerId}
              canManageEmojis={canManageChannels}
              title={
                reactionPicker.mode === "addToQuickReactions"
                  ? "Add to Quick Reactions"
                  : undefined
              }
              subtitle={
                reactionPicker.mode === "addToQuickReactions"
                  ? "Click any emoji to add to your message actions bar"
                  : undefined
              }
              onPickEmoji={(codeOrUrl, _isCustom, e) => {
                if (reactionPicker.mode === "addToQuickReactions" || e?.shiftKey) {
                  addQuickReaction(codeOrUrl);
                  setReactionPicker(null);
                  return;
                }
                void toggleReaction(reactionPicker.messageId, codeOrUrl);
                setReactionPicker(null);
              }}
              onClose={() => setReactionPicker(null)}
            />
          </div>
        </div>
      )}

      <ForwardMessageDialog
        target={forwardTarget}
        servers={servers}
        dms={dms}
        currentChannelId={activeChannelId}
        onClose={() => setForwardTarget(null)}
        onForward={handleForwardMessage}
      />

      {reactionViewer && (
        <div
          className="reaction-viewer-overlay"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="reaction-viewer-backdrop"
            onClick={() => setReactionViewer(null)}
          />
          <div
            className="reaction-viewer-floating"
            style={{
              top: reactionViewer.top,
              left: reactionViewer.left,
            }}
          >
            {(() => {
              const msg = messages.find(
                (m) => m.id === reactionViewer.messageId,
              );
              const reaction = msg?.reactions?.find(
                (r) => r.emoji === reactionViewer.emoji,
              );
              const users = reaction?.users || [];
              return (
                <>
                  <div className="reaction-viewer-header">
                    <span className="reaction-viewer-emoji">
                      {emojiMap[reactionViewer.emoji.replace(/^:|:$/g, "")] ? (
                        <img
                          className="custom-emoji"
                          src={
                            emojiMap[reactionViewer.emoji.replace(/^:|:$/g, "")]
                          }
                          alt={reactionViewer.emoji}
                        />
                      ) : (
                        <OutlineEmoji emoji={reactionViewer.emoji} />
                      )}
                    </span>
                    <span className="reaction-viewer-title">
                      {users.length}{" "}
                      {users.length === 1 ? "reaction" : "reactions"}
                    </span>
                    <button
                      type="button"
                      className="popup-close-x"
                      onClick={() => setReactionViewer(null)}
                      aria-label="Close reactions"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="reaction-viewer-list">
                    {users.length === 0 && (
                      <div className="reaction-viewer-empty">
                        No one has reacted yet.
                      </div>
                    )}
                    {users.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        className="reaction-viewer-user"
                        onClick={() => {
                          const member = membersById.get(u.id);
                          if (member) openProfile(member);
                          setReactionViewer(null);
                        }}
                      >
                        <Avatar
                          name={u.displayName}
                          avatar={u.avatar}
                          avatarUrl={u.avatarUrl}
                          color={u.color}
                          size={28}
                        />
                        <span className="reaction-viewer-name">
                          {u.displayName}
                        </span>
                        <span className="reaction-viewer-username">
                          @{u.username}
                        </span>
                        {u.id === user?.id && (
                          <span className="reaction-viewer-you">You</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </main>
  );
}
