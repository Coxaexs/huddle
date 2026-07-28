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
import type { PlayerState } from "@/lib/protocol";
import type { RoomActivity } from "@/lib/activities";
import type { PublicChannel, PublicRole, PublicServer } from "@/lib/servers";
import {
  ALL_PERMISSIONS,
  hasPermission,
  Permission,
} from "@/lib/permissions";
import { PRESENCE, type Member, type PresenceStatus, type PublicUser } from "@/lib/users";
import {
  Search,
  Pin,
  Sun,
  Moon,
  Settings,
  Users,
  Menu,
  Pencil,
  Plus,
  Trash2,
  Hash,
  Volume2,
  Reply,
  MessageSquare,
  Smile,
  Paperclip,
  ArrowUp,
  PhoneCall,
  Video,
  Vote,
  ChevronDown,
  X,
} from "lucide-react";
import { AuthGate } from "./components/auth-gate";
import { Avatar } from "./components/avatar";
import {
  BotMenu,
  type BotMenuAction,
} from "./components/bot-menu";
import { DndCard } from "./components/dnd-card";
import { GifPicker } from "./components/gif-picker";
import { LyricsNow } from "./components/lyrics-now";
import { MessageBody } from "./components/message-body";
import type { Battlemap, MapStroke, MapToken } from "@/lib/battlemap";
import { BattlemapBoard } from "./components/battlemap";
import { QuickSwitcher, type QuickSwitcherTarget } from "./components/quick-switcher";
import { KeyboardShortcutsDialog } from "./components/keyboard-shortcuts-dialog";
import { ToastContainer } from "./components/toast";
import { PollCard } from "./components/poll-card";
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
import { SettingsDialog } from "./components/settings-dialog";
import { CustomDialog, type DialogOptions } from "./components/custom-dialog";
import { UserFooter } from "./components/user-footer";
import { ServerSettingsDialog } from "./components/server-settings-dialog";
import { EmojiPicker } from "./components/emoji-picker";
import { SlashMenu } from "./components/slash-menu";
import { VoiceStage } from "./components/voice-stage";
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
import {
  COMMAND_ALIASES,
  DISCORD_ONLY_COMMANDS,
  DND_LINK_COMMANDS,
  LOOKUP_COMMANDS,
  MUSIC_COMMANDS,
  VOICE_REQUIRED_MUSIC_COMMANDS,
  matchCommands,
  findCommand,
} from "./lib/commands";
import { PollDialog } from "./components/poll-dialog";
import { UserProfileCard } from "./components/user-profile-card";
import { ProfileSettingsDialog } from "./components/profile-settings-dialog";

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
  reactions?: Array<{ emoji: string; count: number; mine: boolean }>;
  mentions?: string[];
  threadId?: string;
  threadCount?: number;
  payload?: {
    /** Poll cards. */
    pollId?: string;
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
  };
}

interface DmSummary {
  channelId: string;
  user: Member;
  lastMessage: string | null;
  lastAt: string | null;
}

/** The rail slot for direct messages, standing in for a server id. */
const DM_HOME = "@me";

/** The one-tap reactions shown on message hover. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮"];

/** An @-autocomplete option: a member or a role. */
type MentionOption =
  | { kind: "user"; member: Member }
  | { kind: "role"; role: PublicRole };

function Icon({
  children,
  label,
  onClick,
  active,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
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

/** Fires a desktop/web notification, unless the user turned them off. */
function showNotification(title: string, body: string): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (window.localStorage.getItem("huddle-notify") === "off") return;
    const notification = new Notification(title, { body });
    notification.onclick = () => window.focus();
  } catch {
    // Notifications are best-effort.
  }
}

/** Plays a soundboard clip locally (everyone in the room hears their own copy). */
function playSound(url: string): void {
  try {
    const audio = new Audio(url);
    audio.volume = 0.7;
    void audio.play().catch(() => undefined);
  } catch {
    // Non-fatal: a blocked autoplay just means no sound this time.
  }
}

type ReactionList = Array<{ emoji: string; count: number; mine: boolean }>;

/** Folds a single reaction toggle into a message's aggregated reaction list. */
function applyReaction(
  reactions: ReactionList | undefined,
  emoji: string,
  isMine: boolean,
  added: boolean,
): ReactionList {
  const list = (reactions || []).map((r) => ({ ...r }));
  const entry = list.find((r) => r.emoji === emoji);
  if (added) {
    if (entry) {
      entry.count += 1;
      if (isMine) entry.mine = true;
    } else {
      list.push({ emoji, count: 1, mine: isMine });
    }
  } else if (entry) {
    entry.count -= 1;
    if (isMine) entry.mine = false;
    if (entry.count <= 0) return list.filter((r) => r.emoji !== emoji);
  }
  return list;
}

/** Audio-taper curve: makes the whole 0–100 slider feel evenly useful. */
function volumeGain(percent: number): number {
  const normalized = Math.max(0, Math.min(1, percent / 100));
  return normalized * normalized;
}

export function ChatShell() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [ready, setReady] = useState(false);

  const [servers, setServers] = useState<PublicServer[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [dms, setDms] = useState<DmSummary[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  /** When set, the main column shows this voice channel's stage instead of text. */
  const [stageChannelId, setStageChannelId] = useState<string | null>(null);
  /** Channel id currently being dragged in the sidebar, for reordering. */
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
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
  const [unread, setUnread] = useState<
    Record<string, { unread: boolean; count: number; mentions: number }>
  >({});
  const [pins, setPins] = useState<Message[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);

  const [draft, setDraft] = useState("");
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
  // On a phone the member list is an overlay, so it starts out of the way.
  const [membersOpen, setMembersOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 760,
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [userMenu, setUserMenu] = useState<UserMenuTarget | null>(null);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  /** Image opened fullscreen in the lightbox. */
  const [lightbox, setLightbox] = useState<string | null>(null);
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
  /** Per-channel notification level; absent means "all". */
  const [channelPrefs, setChannelPrefs] = useState<Record<string, string>>({});
  /** Members banned from the active server, so the menu can offer Unban. */
  const [bannedIds, setBannedIds] = useState<Set<string>>(new Set());
  const [channelMenu, setChannelMenu] = useState<{
    channel: PublicChannel;
    x: number;
    y: number;
  } | null>(null);
  /** The message whose thread is open in the side panel. */
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  /** The shared battlemap for the voice room you are viewing. */
  const [battlemap, setBattlemap] = useState<Battlemap | null>(null);
  const [battlemapGm, setBattlemapGm] = useState(false);
  const [battlemapHidden, setBattlemapHidden] = useState(false);
  /** Whiteboard, watch party, game, tier list, or timer open in voice. */
  const [roomActivity, setRoomActivity] = useState<RoomActivity | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  /** Your own presence, mirrored locally so the dot reacts instantly. */
  const [myStatus, setMyStatus] = useState<PresenceStatus>("online");
  const [myCustomStatus, setMyCustomStatus] = useState<string | null>(null);
  /** True while auto-idle is holding you at "idle" after inactivity. */
  const autoIdleRef = useRef(false);
  const [botMenu, setBotMenu] = useState<{
    kind: "music" | "dnd";
    x: number;
    y: number;
  } | null>(null);
  const [voicePrefs, setVoicePrefs] = useState<Record<string, VoicePref>>({});

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
    /** Runs when the cancel button (or backdrop) dismisses the dialog. */
    onCancel?: () => void;
  }) => {
    setDialogOptions({ ...options, type: "confirm" });
    setDialogCallback(() => () => options.onConfirm());
    setDialogCancel(() => options.onCancel || null);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
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
    // Scope the roster to the server you are looking at; DMs (no server) still
    // see everyone so mentions and profiles keep resolving.
    const serverId = activeServerRef.current;
    const query =
      serverId && serverId !== DM_HOME
        ? `?serverId=${encodeURIComponent(serverId)}`
        : "";
    const data = await apiFetch<{ members: Member[] }>(`/api/members${query}`);
    setMembers(data.members);
  }, []);

  const loadDms = useCallback(async () => {
    const data = await apiFetch<{ conversations: DmSummary[] }>("/api/dms");
    setDms(data.conversations);
    return data.conversations;
  }, []);

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
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadServers().catch(() => undefined);
    void loadMembers().catch(() => undefined);
    void loadDms().catch(() => undefined);
    void loadPrefs().catch(() => undefined);
    void loadUnread().catch(() => undefined);
    void loadEmojis().catch(() => undefined);
    void loadChannelPrefs().catch(() => undefined);
  }, [
    user,
    loadServers,
    loadMembers,
    loadDms,
    loadPrefs,
    loadUnread,
    loadEmojis,
    loadChannelPrefs,
  ]);

  // Opening a channel marks it read.
  useEffect(() => {
    if (!activeChannelId) return;
    initialChannelScrollRef.current = {
      channelId: activeChannelId,
      unreadCount: unreadRef.current[activeChannelId]?.count || 0,
    };
    markChannelRead(activeChannelId);
  }, [activeChannelId, markChannelRead]);

  // Switching servers re-scopes the member roster to that server's members.
  useEffect(() => {
    if (user) void loadMembers().catch(() => undefined);
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
  const textChannels = useMemo(
    () => activeServer?.channels.filter((c) => c.kind === "text") || [],
    [activeServer],
  );
  const voiceChannels = useMemo(
    () => activeServer?.channels.filter((c) => c.kind === "voice") || [],
    [activeServer],
  );
  const membersById = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

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
  const canModerate = hasPermission(myPermissions, Permission.MODERATE);

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
    const member = members.find((m) => m.username.toLowerCase() === lower);
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
  const activeDm = useMemo(
    () => dms.find((dm) => dm.channelId === activeChannelId) || null,
    [dms, activeChannelId],
  );
  const channelTitle = inDmHome
    ? activeDm?.user.displayName || "Direct messages"
    : activeChannel?.name || "no channel";

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
      if (channelId !== activeChannelRef.current) {
        // A DM you are not looking at still deserves to bubble up the list.
        void loadDms().catch(() => undefined);
        const mentioned = Boolean(user && incoming.mentions?.includes(user.id));
        // Your own messages (echoed back) never count as unread.
        if (user && incoming.userId === user.id) return;

        // Per-channel level: "nothing" stays silent, "mentions" only lights up
        // when you are named.
        const level = channelPrefsRef.current[channelId] || "all";
        if (level === "nothing") return;
        if (level === "mentions" && !mentioned) return;

        setUnread((current) => ({
          ...current,
          [channelId]: {
            unread: true,
            count: (current[channelId]?.count || 0) + 1,
            mentions: (current[channelId]?.mentions || 0) + (mentioned ? 1 : 0),
          },
        }));
        if (mentioned) {
          showNotification(
            `${incoming.author} mentioned you`,
            incoming.text.slice(0, 140),
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
        setMessages((current) =>
          current.map((m) =>
            String(m.id) === incoming.threadId
              ? { ...m, threadCount: (m.threadCount || 0) + 1 }
              : m,
          ),
        );
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

  const voiceSignalRef = useRef<(from: string, data: unknown) => void>(() => {});
  const forcedMuteRef = useRef<(userId: string, muted: boolean) => void>(
    () => {},
  );
  /** Current connected voice channel, for the soundboard event handler. */
  const voiceChannelRef = useRef<string | null>(null);
  /** Tears this tab out of voice when the account joins from another one. */
  const voiceEvictedRef = useRef<() => void>(() => {});
  /** Joins another voice channel when a moderator moves this account. */
  const voiceMoveRef = useRef<(channelId: string) => void>(() => {});
  /** The open thread, readable from socket handlers without re-subscribing. */
  const threadRootRef = useRef<Message | null>(null);
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
    onMessageEdited: (channelId, id, content, editedAt) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, text: content, editedAt } : message,
        ),
      );
    },
    onReaction: (channelId, messageId, emoji, userId, added) => {
      if (channelId !== activeChannelRef.current) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, reactions: applyReaction(message.reactions, emoji, userId === user?.id, added) }
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
      if (channelId !== stageChannelRef.current) return;
      if (payload.action === "open") {
        setBattlemap((payload.map as Battlemap) || null);
        setBattlemapHidden(false);
        return;
      }
      if (payload.action === "close") {
        setBattlemap(null);
        return;
      }
      setBattlemap((current) => {
        if (!current) return current;
        if (payload.action === "token") {
          const moved = payload.token as MapToken;
          return {
            ...current,
            tokens: current.tokens.map((t) => (t.id === moved.id ? moved : t)),
          };
        }
        if (payload.action === "tokens") {
          return { ...current, tokens: (payload.tokens as MapToken[]) || [] };
        }
        if (payload.action === "stroke") {
          const stroke = payload.stroke as MapStroke;
          return current.strokes.some((s) => s.id === stroke.id)
            ? current
            : { ...current, strokes: [...current.strokes, stroke] };
        }
        if (payload.action === "cleared") {
          return {
            ...current,
            tokens: (payload.tokens as MapToken[]) || [],
            strokes: (payload.strokes as MapStroke[]) || [],
          };
        }
        return current;
      });
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
    onForceMute: (userId, muted) => forcedMuteRef.current(userId, muted),
    onVoiceEvicted: () => {
      // The hub already removed this tab from the room; tear the call down
      // locally so the microphone and peer connections actually stop.
      voiceEvictedRef.current();
    },
    onVoiceMove: (channelId) => voiceMoveRef.current(channelId),
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
  forcedMuteRef.current = (userId, muted) => {
    if (user && userId === user.id) voice.setForcedMute(muted);
  };

  const voiceParticipants = useMemo(
    () => (voice.channelId ? hub.voice[voice.channelId] || [] : []),
    [hub.voice, voice.channelId],
  );

  // Leaving voice (Disconnect) closes the stage and returns to the text channel.
  useEffect(() => {
    if (!voice.channelId) setStageChannelId(null);
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

  // Opening a voice stage pulls in whatever map is on the table there.
  useEffect(() => {
    if (!stageChannelId) {
      setBattlemap(null);
      setBattlemapGm(false);
      return;
    }
    let cancelled = false;
    apiFetch<{ map: Battlemap | null; gm: boolean }>(
      `/api/battlemap?channelId=${encodeURIComponent(stageChannelId)}`,
    )
      .then((data) => {
        if (cancelled) return;
        setBattlemap(data.map);
        setBattlemapGm(Boolean(data.gm));
        setBattlemapHidden(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [stageChannelId]);

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

  /** GM: put a map on the table (optionally with an uploaded image). */
  /** Creates the map on the server, uploading a background first if given. */
  async function createBattlemap(name: string, picked: File | null) {
    if (!stageChannelId) return;
    try {
      let imageKey: string | null = null;
      if (picked) {
        const form = new FormData();
        form.append("file", picked);
        // Let a failed upload surface instead of silently opening a blank map —
        // that looked like "the battlemap upload is broken".
        const upload = await apiFetch<{ key: string }>("/api/uploads", {
          method: "POST",
          body: form,
        });
        imageKey = upload.key;
      }
      await apiFetch("/api/battlemap", {
        method: "POST",
        body: JSON.stringify({
          channelId: stageChannelId,
          action: "open",
          name: name.trim() || "Battlemap",
          imageKey,
        }),
      });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not open the battlemap.",
      );
    }
  }

  async function openBattlemap() {
    if (!stageChannelId) return;
    showCustomPrompt({
      title: "New Battlemap",
      message: "Enter a name for the new battlemap:",
      defaultValue: "Battlemap",
      confirmText: "Next",
      onConfirm: (name) => {
        const mapName = name?.trim() || "Battlemap";
        showCustomConfirm({
          title: "Map Background",
          message:
            "Upload a background image, or start on a blank grid. You can add tokens either way.",
          confirmText: "Upload Image",
          cancelText: "Blank Grid",
          // "Upload Image": pick a file, then open with it.
          onConfirm: async () => {
            const picked = await pickImageFile();
            await createBattlemap(mapName, picked);
          },
          // "Blank Grid" previously did nothing — now it opens an empty map.
          onCancel: () => {
            void createBattlemap(mapName, null);
          },
        });
      },
    });
  }

  /** Adds a token for yourself, using your avatar. */
  async function addMyToken() {
    if (!stageChannelId || !user) return;
    await apiFetch("/api/battlemap", {
      method: "POST",
      body: JSON.stringify({
        channelId: stageChannelId,
        action: "add-token",
        token: {
          label: user.displayName,
          color: user.color,
          avatarUrl: user.avatarUrl || null,
          ownerId: user.id,
          x: 2,
          y: 2,
        },
      }),
    }).catch((error: Error) => setNotice(error.message));
  }

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
    .map(([, entry]) => entry.name);

  /** Tells the room you are typing, at most once every few seconds. */
  function noteTyping() {
    const now = Date.now();
    if (!activeChannelId || now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    hub.send({ t: "typing", channelId: activeChannelId });
  }

  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [profileCardTarget, setProfileCardTarget] = useState<{ member: Member; pos?: { x: number; y: number } } | null>(null);

  const activeSlashCommand = useMemo(() => {
    if (!draft.startsWith("/")) return undefined;
    return findCommand(draft);
  }, [draft]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickSwitcherOpen((o) => !o);
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
      if (event.key === "Escape") setLightbox(null);
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

  // Desktop shell: reflect the unread mention count on the dock/taskbar badge.
  useEffect(() => {
    const total = Object.values(unread).reduce(
      (sum, entry) => sum + (entry.mentions || 0),
      0,
    );
    (
      window as unknown as { huddle?: { setBadge?: (n: number) => void } }
    ).huddle?.setBadge?.(total);
  }, [unread]);

  const roomPlayer: PlayerState | null = voice.channelId
    ? hub.players[voice.channelId] || null
    : null;
  const botStreaming = voiceParticipants.some(
    (participant) => participant.bot,
  );

  const player = usePlayer({
    state: roomPlayer,
    streamed: botStreaming,
    serverNow: hub.serverNow,
    deafened: voice.deafened,
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
      return;
    }
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChannelId, messages, messagesLoadedFor]);

  useEffect(() => {
    const preferred =
      window.localStorage.getItem("huddle-theme") === "light" ? "light" : "dark";
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
    root.style.setProperty(
      "--lavender",
      window.localStorage.getItem("huddle-accent") || "#9d8cf5",
    );
    root.style.setProperty(
      "--ui-corners",
      `${Number(window.localStorage.getItem("huddle-corners")) || 16}px`,
    );
    const frame = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(frame);
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

  function applyTheme(next: "dark" | "light") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("huddle-theme", next);
  }

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
      await postBotMessage(
        musicWatchOnline
          ? "The music dashboard is online. It can see this Huddle's voice rooms as well as Discord."
          : "The music server looks offline. Start musicwatchtogether first, then try again.",
        musicDashboardUrl
          ? { link: musicDashboardUrl, actionLabel: "Open music dashboard" }
          : undefined,
      );
      return;
    }

    if (name === "roll") {
      try {
        const data = await apiFetch<{
          text?: string;
          kind?: string;
          payload?: Message["payload"];
        }>(
          "/api/integrations/dnd/roll",
          { method: "POST", body: JSON.stringify({ command: raw }) },
        );
        await postBotMessage(data.text || "The roll failed.", {
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

    setNotice(`I don't know /${bare}. Type / to see what I do know.`);
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
              ),
            }
          : message,
      ),
    );
    await apiFetch(`/api/messages/${id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }).catch(() => undefined);
  }

  async function openThread(message: Message) {
    setThreadRoot(message);
    setThreadDraft("");
    const data = await apiFetch<{ messages: Message[] }>(
      `/api/messages?threadId=${encodeURIComponent(String(message.id))}`,
    ).catch(() => ({ messages: [] as Message[] }));
    setThreadMessages(data.messages);
  }

  async function sendThreadReply() {
    const text = threadDraft.trim();
    if (!text || !threadRoot || !activeChannelId) return;
    setThreadDraft("");
    try {
      const data = await apiFetch<{ message: Message }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelId,
          content: text,
          threadId: String(threadRoot.id),
        }),
      });
      setThreadMessages((current) => [...current, data.message]);
      // Bump the reply count on the root message in the main view.
      setMessages((current) =>
        current.map((m) =>
          m.id === threadRoot.id
            ? { ...m, threadCount: (m.threadCount || 0) + 1 }
            : m,
        ),
      );
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
    const text = draft.trim();
    const files = pendingFiles;
    if (!text && !files.length) return;

    setDraft("");
    setPendingFiles([]);

    if (text.startsWith("/") && !files.length) {
      await runCommand(text);
      return;
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
      await sendText(text, keys);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That message did not send.",
      );
    }
  }

  const slashOpen = draft.startsWith("/") && !draft.includes("\n");
  const slashMatches = useMemo(
    () => (slashOpen ? matchCommands(draft.split(/\s+/)[0]) : []),
    [slashOpen, draft],
  );
  const slashActive = slashOpen && !draft.includes(" ") && slashMatches.length > 0;

  // @-mention autocomplete: matches an @handle being typed at the end of the draft.
  const mentionQuery = useMemo(() => {
    const match = draft.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    return match ? match[1].toLowerCase() : null;
  }, [draft]);
  const mentionMatches = useMemo<MentionOption[]>(() => {
    if (mentionQuery === null) return [];
    const roleOptions: MentionOption[] = (activeServer?.roles || [])
      .filter((role) => role.name.toLowerCase().startsWith(mentionQuery))
      .map((role) => ({ kind: "role", role }));
    const memberOptions: MentionOption[] = members
      .filter(
        (member) =>
          member.username.toLowerCase().startsWith(mentionQuery) ||
          member.displayName.toLowerCase().startsWith(mentionQuery),
      )
      .map((member) => ({ kind: "user", member }));
    // Roles first (they're fewer and often what you want), then people.
    return [...roleOptions, ...memberOptions].slice(0, 8);
  }, [mentionQuery, members, activeServer]);
  const mentionActive = mentionQuery !== null && mentionMatches.length > 0;

  useEffect(() => setSlashIndex(0), [draft]);

  function pickMention(option: MentionOption) {
    const handle =
      option.kind === "user" ? option.member.username : option.role.name;
    setDraft((current) =>
      current.replace(/@([a-zA-Z0-9._-]*)$/, `@${handle} `),
    );
    composerRef.current?.focus();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionActive) {
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

  /** Redeems a server invite code and jumps into the joined server. */
  async function joinServerByCode() {
    showCustomPrompt({
      title: "Join a Server",
      message: "Paste the invite code a friend gave you:",
      placeholder: "e.g. HX3F-9K2Q",
      confirmText: "Join Server",
      onConfirm: async (code) => {
        if (!code?.trim()) return;
        try {
          const data = await apiFetch<{
            serverId: string;
            servers: PublicServer[];
            alreadyMember?: boolean;
          }>("/api/servers/membership", {
            method: "POST",
            body: JSON.stringify({ action: "join", code: code.trim() }),
          });
          setServers(data.servers);
          setActiveServerId(data.serverId);
          setNotice(
            data.alreadyMember
              ? "You are already in that server."
              : "Joined the server.",
          );
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not join.");
        }
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
    kind: "text" | "voice",
    categoryId: string | null = null,
  ) {
    if (!activeServerId || activeServerId === DM_HOME) return;
    showCustomPrompt({
      title: kind === "text" ? "Create Text Channel" : "Create Voice Room",
      message: `Enter name for the new ${kind === "text" ? "text channel" : "voice room"}:`,
      placeholder: kind === "text" ? "general" : "Voice Lounge",
      confirmText: "Create Channel",
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
          if (kind === "text") setActiveChannelId(data.channelId);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not create it.");
        }
      },
    });
  }

  async function renameChannel(channel: PublicChannel) {
    showCustomPrompt({
      title: `Rename Channel`,
      message: `Enter a new name for ${channel.name}:`,
      defaultValue: channel.name,
      confirmText: "Save Name",
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

  if (!ready) {
    return (
      <main className="app-shell booting">
        <div className="boot-card">Opening Huddle…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <AuthGate
          bootstrap={bootstrap}
          onSignedIn={(signedIn) => {
            setUser(signedIn);
            setBootstrap(false);
          }}
        />
      </main>
    );
  }

  const onlineMembers = members.filter((member) => hub.online.has(member.id));
  const offlineMembers = members.filter((member) => !hub.online.has(member.id));
  const currentVoiceChannel = voiceChannels.find(
    (channel) => channel.id === voice.channelId,
  );
  // The voice channel whose stage fills the main column, if any. Falls back to
  // the connected room's channel across servers so switching servers keeps it.
  const stageChannel =
    (stageChannelId
      ? voiceChannels.find((channel) => channel.id === stageChannelId) ||
        servers
          .flatMap((server) => server.channels)
          .find((channel) => channel.id === stageChannelId)
      : null) || null;

  /** Open a voice channel's stage and join it (without ever leaving on re-click). */
  function openVoiceChannel(channel: PublicChannel) {
    player.prime();
    setStageChannelId(channel.id);
    setMobileNav(false);
    if (voice.channelId !== channel.id) void voice.join(channel.id);
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

  function renderChannel(channel: PublicChannel) {
    if (channel.kind === "voice") {
      const people = hub.voice[channel.id] || [];
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
      return (
        <div key={channel.id} {...chanProps} {...voiceDropProps}>
          <button
            className={`voice-room ${voice.channelId === channel.id ? "selected-voice" : ""} ${stageChannelId === channel.id ? "viewing-voice" : ""}`}
            onClick={() => openVoiceChannel(channel)}
            onContextMenu={(event) => {
              event.preventDefault();
              setChannelMenu({ channel, x: event.clientX, y: event.clientY });
            }}
          >
            <span className="speaker-icon">◖))</span>
            <span>{channel.name}</span>
            {people.length > 0 && <span className="live-pill">LIVE</span>}
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
            <div className="voice-members">
              {people.map((person) => (
                <div
                  className={`voice-member ${
                    canModerate && !person.bot ? "draggable-member" : ""
                  } ${
                    voice.speaking.has(
                      person.connectionId === hub.connectionId
                        ? "self"
                        : person.connectionId,
                    )
                      ? "is-speaking"
                      : ""
                  }`}
                  key={person.connectionId}
                  // Moderators can drag a person onto another voice channel to
                  // move them there.
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
                    // Touch has no right-click: a tap opens the same menu.
                    if (!touchInput) return;
                    if (person.bot) {
                      openBotMenu(event, "music");
                      return;
                    }
                    const member = membersById.get(person.id);
                    if (member) openUserMenu(event, member);
                  }}
                >
                  <Avatar
                    className="tiny-avatar"
                    avatar={person.avatar}
                    avatarUrl={person.avatarUrl}
                    color={person.color}
                  />
                  <span>
                    {person.connectionId === hub.connectionId
                      ? "You"
                      : person.displayName}
                  </span>
                  {person.muted && !person.bot && (
                    <span
                      className="muted-pill"
                      title={person.serverMuted ? "Muted for everyone" : "Muted"}
                    >
                      ⃠
                    </span>
                  )}
                  {person.bot && playing && (
                    <span className="speaking-bars" aria-label="Playing">
                      ııı
                    </span>
                  )}
                  {person.bot && person.deafened && (
                    <span
                      className="bot-deafened-pill"
                      title="The bot sends music but cannot hear the room"
                      aria-label="Bot deafened"
                    >
                      <Volume2 size={12} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={channel.id}
        className={`channel ${activeChannelId === channel.id && !stageChannelId ? "selected" : ""} ${
          unread[channel.id]?.unread ? "has-unread" : ""
        }`}
        {...channelDragProps(channel)}
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
        <Hash size={16} className="channel-hash shrink-0" />
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
  const prefFor = (id: string): VoicePref =>
    voicePrefs[id] || { volume: 100, muted: false };
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
    ...(musicDashboardUrl
      ? [
          {
            label: "Open dashboard",
            onSelect: () =>
              window.open(
                musicDashboardUrl,
                "_blank",
                "noopener,noreferrer",
              ),
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
    <main className={`app-shell ${mobileNav ? "nav-open" : ""}`}>
      {/* Tapping outside the drawer on a phone closes it. */}
      <div
        className="mobile-nav-backdrop"
        onClick={() => setMobileNav(false)}
        aria-hidden="true"
      />
      <aside className="rail" aria-label="Servers">
        <button
          className={`brand-mark ${inDmHome ? "active-space" : ""}`}
          aria-label="Direct messages"
          title="Direct messages"
          onClick={() => {
            setActiveServerId(DM_HOME);
            setActiveChannelId(dms[0]?.channelId || null);
            setStageChannelId(null);
          }}
        >
          h
          {dmUnreadTotal > 0 && !inDmHome && (
            <span className="rail-badge">{dmUnreadTotal}</span>
          )}
        </button>

        {/* Unread DMs ride the rail like Discord: sender's picture + count. */}
        {dmUnread.map(({ dm, count }) => (
          <button
            key={dm.channelId}
            className="rail-dm"
            title={`${dm.user.displayName} · ${count} new`}
            aria-label={`${dm.user.displayName}, ${count} unread`}
            onClick={() => {
              setActiveServerId(DM_HOME);
              setActiveChannelId(dm.channelId);
              setStageChannelId(null);
            }}
          >
            <Avatar
              className="rail-dm-avatar"
              avatar={dm.user.avatar}
              avatarUrl={dm.user.avatarUrl}
              color={dm.user.color}
            />
            <span className="rail-badge">{count}</span>
          </button>
        ))}

        <div className="rail-divider" />
        {servers.map((server) => (
          <button
            key={server.id}
            className={`space-mark ${server.id === activeServerId ? "active-space" : ""}`}
            style={
              server.id === activeServerId ? { background: server.color } : undefined
            }
            aria-label={server.name}
            title={server.name}
            onClick={() => setActiveServerId(server.id)}
          >
            {server.iconUrl ? (
              <img
                src={server.iconUrl}
                alt={server.name}
                style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              server.icon
            )}
          </button>
        ))}
        <button
          className="space-mark add-space"
          aria-label="Create a server"
          title="Create a server"
          onClick={createServer}
        >
          +
        </button>
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
                ✎
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
                <Settings size={14} />
              </span>
              Settings
            </button>
          </div>
        )}

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
        </Avatar>
      </aside>

      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
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
                  createChannel("text");
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus size={16} /> Create Channel
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
            <div className="section-label">
              <span>CONVERSATIONS</span>
            </div>
            {dms.map((dm) => (
              <button
                key={dm.channelId}
                className={`channel dm-channel ${activeChannelId === dm.channelId ? "selected" : ""} ${
                  unread[dm.channelId]?.unread ? "has-unread" : ""
                }`}
                onClick={() => {
                  setActiveChannelId(dm.channelId);
                  setStageChannelId(null);
                  setMobileNav(false);
                }}
                onContextMenu={(event) => openUserMenu(event, dm.user)}
              >
                {unread[dm.channelId]?.unread && <span className="unread-pill" />}
                <Avatar
                  className="tiny-avatar"
                  avatar={dm.user.avatar}
                  avatarUrl={dm.user.avatarUrl}
                  color={dm.user.color}
                />
                <span>{dm.user.displayName}</span>
                {hub.online.has(dm.user.id) && <i className="dm-online" />}
                {(unread[dm.channelId]?.count ?? 0) > 0 && (
                  <span className="mention-badge">
                    {unread[dm.channelId].count}
                  </span>
                )}
              </button>
            ))}
            {!dms.length && (
              <p className="sidebar-empty">
                Right-click someone in the member list to start a conversation.
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
                    ▾+
                  </button>
                  <button
                    aria-label="Add text channel"
                    title="Add text channel"
                    onClick={() => createChannel("text")}
                  >
                    #+
                  </button>
                  <button
                    aria-label="Add voice room"
                    title="Add voice room"
                    onClick={() => createChannel("voice")}
                  >
                    ◖))+
                  </button>
                </span>
              )}
            </div>

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
                        <button
                          aria-label={`Add channel to ${category.name}`}
                          title="Add text channel here"
                          onClick={() => createChannel("text", category.id)}
                        >
                          +
                        </button>
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
            onOpenProfileSettings={() => setProfileSettingsOpen(true)}
          />
        )}
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
        <header className="chat-header">
          <button
            className="mobile-menu"
            aria-label="Open channels"
            onClick={() => setMobileNav((open) => !open)}
          >
            <Menu size={20} />
          </button>
          <span className="big-hash">
            {stageChannel ? "◖))" : inDmHome ? "@" : "#"}
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
                    ? `Just you and ${activeDm.user.displayName}`
                    : "Pick a conversation"
                  : activeChannel?.topic ||
                    (activeChannel
                      ? `Everything happening in ${activeChannel.name}`
                      : "Create a channel to start talking")}
            </span>
          </div>
          <div className="header-actions">
            {inDmHome && activeChannelId && (
              <div className="dm-call-actions">
                <button
                  type="button"
                  className="dm-call-btn flex items-center gap-1.5"
                  onClick={() => {
                    setStageChannelId(activeChannelId);
                    void voice.join(activeChannelId);
                  }}
                  title="Start Voice Call"
                >
                  <PhoneCall size={15} /> Start Call
                </button>
                <button
                  type="button"
                  className="dm-call-btn flex items-center gap-1.5"
                  onClick={() => {
                    setStageChannelId(activeChannelId);
                    void voice.join(activeChannelId);
                    void voice.startCamera();
                  }}
                  title="Start Video Call"
                >
                  <Video size={15} /> Video Call
                </button>
              </div>
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
              label="Pinned messages"
              active={pinsOpen}
              onClick={() => setPinsOpen((open) => !open)}
            >
              <Pin size={18} />
            </Icon>
            <Icon
              label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
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
            voice={voice}
            serverId={stageChannel.serverId}
            canManageSounds={canManageChannels}
            userId={user.id}
            userName={user.displayName}
            activity={roomActivity}
            onActivity={setRoomActivity}
            battlemapOpen={Boolean(battlemap) && !battlemapHidden}
            onToggleBattlemap={() => {
              if (!battlemap) {
                if (battlemapGm) void openBattlemap();
                else setNotice("No map is on the table yet.");
                return;
              }
              setBattlemapHidden((hidden) => !hidden);
            }}
            battlemap={
              battlemap && !battlemapHidden ? (
                <BattlemapBoard
                  channelId={stageChannel.id}
                  map={battlemap}
                  gm={battlemapGm}
                  userId={user.id}
                  onClose={() => setBattlemapHidden(true)}
                  onAddMyToken={() => void addMyToken()}
                  onLocalToken={(token) =>
                    setBattlemap((current) =>
                      current
                        ? {
                            ...current,
                            tokens: current.tokens.map((t) =>
                              t.id === token.id ? token : t,
                            ),
                          }
                        : current,
                    )
                  }
                  onLocalStroke={(stroke) =>
                    setBattlemap((current) =>
                      current
                        ? { ...current, strokes: [...current.strokes, stroke] }
                        : current,
                    )
                  }
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
                  content: `📎 Clipped the last ${voice.clipSeconds}s of ${stageChannel.name}`,
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

        {pinsOpen && (
          <div className="pins-panel">
            <div className="pins-head">
              <strong>Pinned in {channelTitle}</strong>
              <button type="button" onClick={() => setPinsOpen(false)}>
                ×
              </button>
            </div>
            {pins.length ? (
              pins.map((pin) => (
                <div className="pin-item" key={pin.id}>
                  <strong>{pin.author}</strong>
                  <p>{pin.text}</p>
                  <button type="button" onClick={() => void togglePin(pin)}>
                    Unpin
                  </button>
                </div>
              ))
            ) : (
              <p className="pins-empty">
                Nothing pinned yet. Hover a message and press the pin.
              </p>
            )}
          </div>
        )}

        <div className="messages" aria-live="polite">
          <div className="channel-intro">
            <div className="intro-icon">{inDmHome ? "@" : "#"}</div>
            <h2>{inDmHome ? channelTitle : `Welcome to #${channelTitle}`}</h2>
            <p>
              {inDmHome
                ? "This conversation is only visible to the two of you."
                : "This is the start of the channel. Be excellent to each other."}
            </p>
          </div>

          {messages.map((message, index) => {
            const author = message.userId
              ? membersById.get(message.userId)
              : undefined;
            const canDelete =
              message.userId === user.id ||
              message.bot ||
              user.isAdmin ||
              canModerate;
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
              !message.kind &&
              !prev?.kind;
            return (
              <article
                id={`msg-${message.id}`}
                className={`message ${continuation ? "continuation" : ""} ${
                  message.pinned ? "is-pinned" : ""
                } ${openActionsId === message.id ? "actions-open" : ""} ${
                  user && message.mentions?.includes(user.id) ? "mentions-me" : ""
                }`}
                key={message.id}
                onContextMenu={(event) => {
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
                {continuation ? (
                  <span className="message-gutter" aria-hidden="true">
                    <time>{message.time}</time>
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
                      if (touchInput && author) openUserMenu(event, author);
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
                        {author?.displayName || message.author}
                      </strong>
                      {message.bot && <span className="bot-tag">BOT</span>}
                      <time>{message.time}</time>
                      {message.editedAt && (
                        <span className="edited-tag" title="Edited">
                          (edited)
                        </span>
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
                  ) : message.kind === "dnd" && message.payload ? (
                    <DndCard {...message.payload} />
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
                  ) : (
                    <MessageBody
                      text={message.text}
                      selfHandle={user.username}
                      onMention={openProfileByHandle}
                      onImage={setLightbox}
                      emojis={emojiMap}
                    />
                  )}

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
                        onVolume={(volume) =>
                          hub.send({
                            t: "player",
                            channelId: message.payload!.voiceChannelId!,
                            action: { name: "volume", volume },
                          })
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
                  {message.audio && (
                    <audio
                      className="message-audio"
                      controls
                      preload="none"
                      src={message.audio}
                    />
                  )}
                  {message.image && (
                    <img
                      className="message-image"
                      src={message.image}
                      alt="Shared attachment"
                      onClick={() => setLightbox(message.image!)}
                    />
                  )}
                  {message.images && message.images.length > 0 && (
                    <div
                      className={`attachment-grid count-${Math.min(
                        message.images.length,
                        4,
                      )}`}
                    >
                      {message.images.map((url) => (
                        <img
                          key={url}
                          className="message-image"
                          src={url}
                          alt="Shared attachment"
                          onClick={() => setLightbox(url)}
                        />
                      ))}
                    </div>
                  )}
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

                  {(message.threadCount ?? 0) > 0 && (
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
                          className={`reaction ${reaction.mine ? "mine" : ""}`}
                          onClick={() =>
                            void toggleReaction(message.id, reaction.emoji)
                          }
                        >
                          {emojiMap[reaction.emoji.replace(/^:|:$/g, "")] ? (
                            <img
                              className="custom-emoji"
                              src={emojiMap[reaction.emoji.replace(/^:|:$/g, "")]}
                              alt={reaction.emoji}
                            />
                          ) : (
                            <span>{reaction.emoji}</span>
                          )}
                          <b>{reaction.count}</b>
                        </button>
                      ))}
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
                  ⋯
                </button>
                <div className="message-actions">
                  <div className="quick-reactions">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        title={`React ${emoji}`}
                        onClick={() => void toggleReaction(message.id, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                    {/* The server's own emoji, right where you react. */}
                    {emojis.slice(0, 4).map((emoji) => (
                      <button
                        key={emoji.id}
                        type="button"
                        title={`React :${emoji.name}:`}
                        onClick={() =>
                          void toggleReaction(message.id, `:${emoji.name}:`)
                        }
                      >
                        <img className="custom-emoji" src={emoji.url} alt={emoji.name} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    title="Reply"
                    onClick={() => {
                      setReplyTarget(message);
                      composerRef.current?.focus();
                    }}
                  >
                    <Reply size={16} />
                  </button>
                  <button
                    type="button"
                    title="Reply in thread"
                    onClick={() => void openThread(message)}
                  >
                    <MessageSquare size={16} />
                  </button>
                  {message.userId === user.id && !message.bot && (
                    <button
                      type="button"
                      title="Edit"
                      onClick={() => beginEdit(message)}
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    title={message.pinned ? "Unpin" : "Pin"}
                    onClick={() => void togglePin(message)}
                  >
                    <Pin size={16} />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => void deleteMessage(message.id)}
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
            <div className="mention-menu">
              {mentionMatches.map((option, index) => {
                const active = index === slashIndex % mentionMatches.length;
                // Section headers, printed when the kind changes.
                const previous = mentionMatches[index - 1];
                const header =
                  !previous || previous.kind !== option.kind ? (
                    <div className="mention-section" key={`h:${option.kind}`}>
                      {option.kind === "user" ? "MEMBERS" : "ROLES"}
                    </div>
                  ) : null;

                if (option.kind === "role") {
                  return (
                    <div key={`role:${option.role.id}`}>
                      {header}
                      <button
                        type="button"
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
                        {member.displayName}
                      </span>
                      <span className="mention-note">@{member.username}</span>
                    </button>
                  </div>
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

          <div className="composer">
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
                if (event.target.value.trim()) noteTyping();
              }}
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
                  ? `Message ${inDmHome ? "" : "#"}${channelTitle}`
                  : "Pick a channel first"
              }
              aria-label={`Message ${channelTitle}`}
              rows={1}
              disabled={!activeChannelId}
            />
            <button
              type="button"
              className="composer-emoji-btn"
              onClick={() => {
                setEmojiOpen((open) => !open);
                setGifOpen(false);
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
              className="gif-button"
              onClick={() => {
                setDraft("/");
                composerRef.current?.focus();
              }}
              aria-label="Show commands"
            >
              /
            </button>
            <button className="send-button" type="submit" aria-label="Send message">
              <ArrowUp size={18} />
            </button>
          </div>

          <div className="composer-hint">
            {typingNames.length > 0 ? (
              <span className="typing-line">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
                {typingNames.length === 1
                  ? `${typingNames[0]} is typing…`
                  : typingNames.length === 2
                    ? `${typingNames[0]} and ${typingNames[1]} are typing…`
                    : `${typingNames.length} people are typing…`}
              </span>
            ) : (
              "Enter to send · Shift + Enter for a new line · / for commands"
            )}
          </div>
        </form>
          </>
        )}
      </section>

      {threadRoot && (
        <aside className="thread-panel" aria-label="Thread">
          <header className="thread-head">
            <strong className="flex items-center gap-1.5"><MessageSquare size={16} /> Thread</strong>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="thread-quit-btn"
                onClick={() => setThreadRoot(null)}
                aria-label="Quit thread"
              >
                Quit Thread
              </button>
              <button
                type="button"
                onClick={() => setThreadRoot(null)}
                aria-label="Close thread"
              >
                ×
              </button>
            </div>
          </header>

          <div className="thread-body">
            <article className="message thread-root">
              <Avatar
                className="avatar"
                avatar={threadRoot.avatar}
                avatarUrl={
                  threadRoot.userId
                    ? membersById.get(threadRoot.userId)?.avatarUrl
                    : undefined
                }
                color={threadRoot.color}
              />
              <div className="message-body">
                <div className="message-meta">
                  <strong>{threadRoot.author}</strong>
                  <time>{threadRoot.time}</time>
                </div>
                <MessageBody
                  text={threadRoot.text}
                  selfHandle={user.username}
                  onMention={openProfileByHandle}
                  onImage={setLightbox}
                  emojis={emojiMap}
                />
              </div>
            </article>

            <div className="thread-divider">
              {threadMessages.length}{" "}
              {threadMessages.length === 1 ? "reply" : "replies"}
            </div>

            {threadMessages.map((reply) => {
              const author = reply.userId
                ? membersById.get(reply.userId)
                : undefined;
              return (
                <article className="message" key={reply.id}>
                  <Avatar
                    className="avatar"
                    avatar={author?.avatar || reply.avatar}
                    avatarUrl={author?.avatarUrl}
                    color={author?.color || reply.color}
                  />
                  <div className="message-body">
                    <div className="message-meta">
                      <strong style={{ color: roleColorFor(author) || undefined }}>
                        {author?.displayName || reply.author}
                      </strong>
                      <time>{reply.time}</time>
                    </div>
                    <MessageBody
                      text={reply.text}
                      selfHandle={user.username}
                      onMention={openProfileByHandle}
                      onImage={setLightbox}
                      emojis={emojiMap}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <form
            className="thread-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendThreadReply();
            }}
          >
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
            <button type="submit" aria-label="Send reply">
              ↑
            </button>
          </form>
        </aside>
      )}

      <aside className={`member-panel ${membersOpen ? "" : "closed"}`}>
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

            {roomPlayer?.track && (
              <div className="member-player">
                <NowPlaying
                  state={roomPlayer}
                  position={player.position}
                  controllable
                  blocked={!botStreaming && player.blocked}
                  onUnblock={player.unblock}
                  voiceChannelName={currentVoiceChannel?.name}
                  onSeek={(positionMs) =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "seek", positionMs },
                    })
                  }
                  onToggle={() =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "toggle" },
                    })
                  }
                  onSkip={() =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "skip" },
                    })
                  }
                  onVolume={(volume) =>
                    hub.send({
                      t: "player",
                      channelId: voice.channelId!,
                      action: { name: "volume", volume },
                    })
                  }
                />
              </div>
            )}
          </>
        )}

        <div className="member-panel-title online-title">
          <span>ONLINE — {onlineMembers.length}</span>
        </div>
        {onlineMembers.map((member) => (
          <div
            className="member clickable-name"
            key={member.id}
            {...userMenuHandlers(member)}
            onClick={() => openProfile(member)}
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
              <strong style={{ color: roleColorFor(member) || undefined }}>
                {member.displayName}
              </strong>
              <span>
                {(member.id === user.id ? myCustomStatus : member.customStatus) ||
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
                          ].label)}
              </span>
            </div>
          </div>
        ))}

        <div className="member-panel-title offline-title">
          <span>OFFLINE — {offlineMembers.length}</span>
        </div>
        {offlineMembers.map((member) => (
          <div
            className="member offline-member clickable-name"
            key={member.id}
            {...userMenuHandlers(member)}
            onClick={() => openProfile(member)}
          >
            <Avatar
              className="member-avatar"
              avatar={member.avatar}
              avatarUrl={member.avatarUrl}
              color={member.color}
            />
            <div>
              <strong style={{ color: roleColorFor(member) || undefined }}>
                {member.displayName}
              </strong>
              <span>Away</span>
            </div>
          </div>
        ))}
      </aside>

      {/* Remote voice audio. Hidden, but this is what you actually hear. */}
      {voice.remoteStreams
        .filter(({ stream }) => stream.getAudioTracks().length > 0)
        .map(({ connectionId, stream }) => {
        const person = voiceParticipants.find(
          (participant) => participant.connectionId === connectionId,
        );
        const pref = person ? prefFor(person.id) : { volume: 100, muted: false };
        return (
          <audio
            key={`${connectionId}:${stream.id}`}
            autoPlay
            playsInline
            ref={(element) => {
              if (!element) {
                return;
              }
              registerMedia(element);
              if (element.srcObject !== stream) {
                element.srcObject = stream;
                // Safari is more reliable when playback is requested after
                // srcObject is assigned, even with the autoPlay attribute.
                void element.play().catch(() => undefined);
              }
              // Per-person volume, on top of your own deafen switch.
              element.volume = volumeGain(pref.volume);
            }}
            muted={voice.deafened || pref.muted}
          />
        );
        })}

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
            botMenu.kind === "music" &&
            voiceParticipants.some((person) => person.bot)
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
          pref={prefFor(userMenu.member.id)}
          serverMuted={hub.forcedMutes.has(userMenu.member.id)}
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
              (hub.voice[channel.id] || []).some(
                (person) => person.id === userMenu.member.id,
              ),
            )?.id || null
          }
          onMove={(channelId) => {
            void moveMember(userMenu.member.id, channelId);
            setUserMenu(null);
          }}
        />
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
                {channelMenu.channel.kind === "voice" ? "◖))" : "#"}{" "}
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
                    const id = channelMenu.channel.id;
                    setChannelPrefs((prefs) => {
                      const next = { ...prefs };
                      if (level === "all") delete next[id];
                      else next[id] = level;
                      return next;
                    });
                    if (level !== "all") {
                      // Muting clears whatever was already lit up.
                      setUnread((current) => {
                        const next = { ...current };
                        if (level === "nothing") delete next[id];
                        return next;
                      });
                    }
                    void apiFetch("/api/channels/prefs", {
                      method: "POST",
                      body: JSON.stringify({ channelId: id, level }),
                    }).catch(() => undefined);
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

      {lightbox && (
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
          <img src={lightbox} alt="" onClick={(event) => event.stopPropagation()} />
          <a
            className="lightbox-open"
            href={lightbox}
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
          onUser={setUser}
          onClose={() => setSettingsOpen(false)}
          onSignOut={signOut}
          onMicrophoneChange={() => void voice.switchMicrophone()}
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
          canManageServer={canManageServer}
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
        />
      )}

      <QuickSwitcher
        open={quickSwitcherOpen}
        onClose={() => setQuickSwitcherOpen(false)}
        servers={servers}
        channels={servers.flatMap((s) => s.channels || [])}
        dms={dms.map((d) => ({ id: d.channelId, user: d.user }))}
        onSelect={(target: QuickSwitcherTarget) => {
          if (target.type === "channel") {
            if (target.serverId && target.serverId !== activeServerId) {
              setActiveServerId(target.serverId);
            }
            if (target.kind === "voice") {
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
          } else if (target.type === "server") {
            setActiveServerId(target.id);
          }
        }}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {profileSettingsOpen && user && (
        <ProfileSettingsDialog
          user={user}
          onClose={() => setProfileSettingsOpen(false)}
          onProfileUpdated={(updatedUser) => {
            setUser(updatedUser);
            void loadMembers();
          }}
        />
      )}

      <PollDialog
        open={pollDialogOpen}
        onClose={() => setPollDialogOpen(false)}
        onSubmit={(question, options) => {
          const text = `/poll ${question} | ${options.join(" | ")}`;
          void runCommand(text);
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
          onDirectMessage={(targetUserId) => {
            void openDm(targetUserId);
          }}
          onMention={(username) => {
            setDraft((curr) => curr + `@${username} `);
            composerRef.current?.focus();
          }}
        />
      )}

      <ToastContainer />
    </main>
  );
}
