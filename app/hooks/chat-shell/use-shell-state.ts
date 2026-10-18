import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiceRollEvent } from "@/lib/protocol";
import { useMsnTheme } from "../../components/msn-chrome";
import { isRetroSoundThemeEnabled } from "../../lib/msn-sounds";
import { useMsnContacts, usePersonalEmoticons, useWhatsNew } from "../use-msn-extras";
import { readMessageFont, type MessageFont } from "@/lib/text-style";
import type { RoomActivity } from "@/lib/activities";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { type Member, type PresenceStatus, type PublicUser } from "@/lib/users";
import { type ResolvedInvite } from "../../components/server-invite-card";
import { useBattlemap } from "../use-battlemap";
import { type ServerFolder } from "@/lib/server-folders";
import { showToast } from "../../components/toast";
import { announceUnlocked } from "../../lib/achievement-client";
import { type DialogOptions } from "../../components/custom-dialog";
import { type Message, type DmSummary, type MentionEntry, type PendingFile } from "../../lib/chat/types";
import { DM_HOME, DEFAULT_QUICK_REACTIONS } from "../../lib/chat/constants";
import { notifyLevel } from "../../lib/chat/format";
import { pickImageFile } from "../../lib/chat/browser";
import { type VoiceChatEvent } from "../../components/voice-chat-panel";
import { type UserMenuTarget, type VoicePref } from "../../components/user-menu";
import { apiFetch } from "../../lib/client";
import { useMessageSearch } from "../use-message-search";
import { useSavedMessages } from "../use-saved-messages";
import { unlockAudio } from "../../lib/devices";
import { enableWebPush, registerServiceWorker } from "../../lib/web-push";
import { type SlashCommand } from "../../lib/commands";
import { type ForwardMessageTarget } from "../../components/forward-message-dialog";
import { DRAFTS_KEY } from "../../lib/chat/shell-helpers";
import { registerProfileStyles } from "../../lib/profile-look";

/** ChatShell, part 1 of 9. Everything ChatShell keeps in state: servers, channels, messages, drafts, menus, dialogs, panel sizes, quick reactions, contact extras. */
/** Who or what a "Streaming Now" card is about. */
export interface StreamHoverInfo {
  kind: "screen" | "watch";
  /** The streamer's seat (screen shares only). */
  connectionId?: string;
  streamerName: string;
  title?: string;
  /** Hub-clock ms the stream or film started. */
  startedAt?: number | null;
  channel: PublicChannel;
}

/** Open the stage on one stream: a seat's screen share, or the room's watch party. */
export interface StageFocusRequest {
  channelId: string;
  target: { kind: "screen"; connectionId: string } | { kind: "watch" };
  at: number;
}

/** Swipe right on a message to reply: how far it must go, how far it follows, and the edge kept for the channel list. */
const SWIPE_REPLY_PX = 64;
const SWIPE_MAX_PX = 96;
const SWIPE_EDGE_PX = 28;

export function useShellState() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [openSignup, setOpenSignup] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
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
  // Voice tiles and anything else without the full Member read styles from here.
  useEffect(() => {
    registerProfileStyles(user ? [...members, user] : members);
  }, [members, user]);
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
  /** The voice room's side chat, docked beside its stage. Remembered per browser. */
  const [voiceChatOpen, setVoiceChatOpenState] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage.getItem("huddle-voice-chat");
      if (saved) return saved === "1";
    } catch {
      // Storage blocked: fall through to the default.
    }
    // On a phone the panel covers the stage, so it starts closed there.
    return window.innerWidth > 900;
  });
  const setVoiceChatOpen = useCallback((open: boolean) => {
    setVoiceChatOpenState(open);
    try {
      window.localStorage.setItem("huddle-voice-chat", open ? "1" : "0");
    } catch {
      // Not remembered, which is fine.
    }
  }, []);
  /** Live sinks of open voice chat panels, by channel. */
  const voiceChatSinksRef = useRef(new Map<string, Set<(event: VoiceChatEvent) => void>>());
  const subscribeVoiceChat = useCallback((channelId: string, sink: (event: VoiceChatEvent) => void) => {
    const sinks = voiceChatSinksRef.current;
    const set = sinks.get(channelId) || new Set();
    set.add(sink);
    sinks.set(channelId, set);
    return () => {
      set.delete(sink);
      if (!set.size) sinks.delete(channelId);
    };
  }, []);
  const emitVoiceChat = useCallback((channelId: string, event: VoiceChatEvent) => {
    const set = voiceChatSinksRef.current.get(channelId);
    if (!set?.size) return false;
    for (const sink of set) sink(event);
    return true;
  }, []);
  const [pipDismissed, setPipDismissed] = useState(false);
  const [voiceViewMode, setVoiceViewMode] = useState<"grid" | "table" | "map">("grid");
  const [focusedStreamInfo, setFocusedStreamInfo] = useState<{
    streamerName: string;
    isScreen: boolean;
    streamId?: string;
    participantId?: string;
    self?: boolean;
  } | null>(null);
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
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  /** Raw unread counts; `unread` below is this with notification levels applied. */
  const [rawUnread, setUnread] = useState<
    Record<string, { unread: boolean; count: number; mentions: number }>
  >({});
  const [pins, setPins] = useState<Message[]>([]);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [mentionsOpen, setMentionsOpen] = useState(false);
  /** Saved messages: the panel, its contents, and which ids are saved. */
  const { savedOpen, setSavedOpen, savedList, savedIds, loadSaved, toggleSaved } =
    useSavedMessages(
      (message) => setNotice(message),
      () => showToast("Saved. Find it under the bookmark at the top.", "success"),
    );
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

  /** Unsent text per channel, kept on this device across reloads. */
  const channelDraftsRef = useRef<Record<string, string>>(
    (() => {
      if (typeof window === "undefined") return {};
      try {
        const saved = JSON.parse(window.localStorage.getItem(DRAFTS_KEY) || "{}") as unknown;
        return saved && typeof saved === "object" ? (saved as Record<string, string>) : {};
      } catch {
        return {};
      }
    })(),
  );
  const draftSaveTimerRef = useRef<number | null>(null);
  const saveDraftsSoon = useCallback(() => {
    if (draftSaveTimerRef.current) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      const kept = Object.fromEntries(
        Object.entries(channelDraftsRef.current)
          .filter(([, text]) => text.trim())
          .slice(-50)
          .map(([channelId, text]) => [channelId, text.slice(0, 4000)]),
      );
      try {
        window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(kept));
      } catch {
        // Storage full or blocked: drafts just will not survive a reload.
      }
    }, 400);
  }, []);
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
        saveDraftsSoon();
      }
      return next;
    });
  }, []);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    runSearch: runMessageSearch,
  } = useMessageSearch();
  /** Files staged in the composer; images carry a data-URL preview. */
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  /** On touch screens, which message's action bar is currently revealed. */
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(
    null,
  );
  /** Track Shift key hold to reveal all message actions. */
  const [shiftPressed, setShiftPressed] = useState(false);
  /** On mobile, toggle more message actions without crowding the bar. */
  const [mobileActionsMoreId, setMobileActionsMoreId] = useState<string | number | null>(null);
  /** On mobile, toggle extra tools popup for composer (^). */
  const [mobileComposerMenuOpen, setMobileComposerMenuOpen] = useState(false);
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

  const [copiedMessageId, setCopiedMessageId] = useState<string | number | null>(null);

  // Clean up excessive whitespace/newlines when copying text from the chat messages area
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      if (!range) return;

      const container = range.commonAncestorContainer;
      const element =
        container.nodeType === Node.ELEMENT_NODE
          ? (container as Element)
          : container.parentElement;

      // Only handle selections that touch messages in chat
      if (!element?.closest(".messages-scroller, .message, .message-body")) return;

      let rawText = selection.toString();
      if (!rawText) return;

      // Normalize CRLF to LF
      let cleaned = rawText.replace(/\r\n/g, "\n");
      // Collapse 3 or more consecutive newlines into 2 (clean paragraph break)
      cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
      // Strip trailing whitespace per line and overall trim
      cleaned = cleaned
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim();

      if (cleaned && e.clipboardData) {
        e.clipboardData.setData("text/plain", cleaned);
        e.preventDefault();
      }
    };

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, []);

  const touchStartRef = useRef<{ x: number; y: number; id: string | number } | null>(null);
  /** A message being swiped right to reply to it (phones). */
  const swipeRef = useRef<{ x: number; y: number; id: string | number; row: HTMLElement; dx: number; sideways: boolean | null } | null>(null);
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
    // From the very edge, a right swipe still opens the channel list.
    swipeRef.current =
      touch.clientX > SWIPE_EDGE_PX && !String(messageId).startsWith("pending-")
        ? { x: touch.clientX, y: touch.clientY, id: messageId, row: e.currentTarget as HTMLElement, dx: 0, sideways: null }
        : null;
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
    const swipe = swipeRef.current;
    const moved = e.touches[0];
    if (swipe && moved) {
      const dx = moved.clientX - swipe.x;
      const dy = moved.clientY - swipe.y;
      // Decide once, after a few pixels: sideways means a reply swipe, otherwise a scroll.
      if (swipe.sideways === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipe.sideways = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5;
      }
      if (swipe.sideways) {
        swipe.dx = Math.max(0, Math.min(dx, SWIPE_MAX_PX));
        swipe.row.classList.add("swiping");
        swipe.row.classList.toggle("swipe-armed", swipe.dx >= SWIPE_REPLY_PX);
        swipe.row.style.setProperty("--swipe-x", `${swipe.dx}px`);
      }
    }
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
    const swipe = swipeRef.current;
    swipeRef.current = null;
    if (swipe?.sideways) {
      swipe.row.classList.remove("swiping", "swipe-armed");
      swipe.row.style.removeProperty("--swipe-x");
      const target = swipe.dx >= SWIPE_REPLY_PX ? messagesRef.current.find((m) => m.id === swipe.id) : undefined;
      if (target && !target.pending) {
        setReplyTarget(target);
        composerRef.current?.focus();
        try {
          navigator.vibrate?.(20);
        } catch { }
      }
    }
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
      const res = await apiFetch<{ message: Message; newAchievements: string[] }>("/api/messages", {
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
      announceUnlocked(res?.newAchievements);
      if (destinationChannelId === activeChannelId && res) {
        setMessages((prev) => [...prev, res.message]);
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
  /** The sidebar's "how to share" picker, open between "Share screen" and the browser's own picker. */
  const [sidebarShareSetupOpen, setSidebarShareSetupOpen] = useState(false);
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
  msnSoundsRef.current = msnTheme || isRetroSoundThemeEnabled();
  const msnThemeRef = useRef(msnTheme);
  msnThemeRef.current = msnTheme;
  const [slashIndex, setSlashIndex] = useState(0);
  /** Slash commands registered by connected bots, offered beside our own. */
  const [botCommands, setBotCommands] = useState<SlashCommand[]>([]);
  const [userMenu, setUserMenu] = useState<UserMenuTarget | null>(null);
  const [groupDmMenu, setGroupDmMenu] = useState<{
    dm: DmSummary;
    x: number;
    y: number;
  } | null>(null);
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
  const [pollVoters, setPollVoters] = useState<
    Record<string, Array<Array<{ id: string; name: string }>>>
  >({});
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
  /** Channel ids of DMs and group DMs this person is in. */
  const dmChannelIdsRef = useRef<Set<string>>(new Set());
  dmChannelIdsRef.current = useMemo(() => new Set(dms.map((dm) => dm.channelId)), [dms]);
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

  const [streamAudioPrefs, setStreamAudioPrefs] = useState<
    Record<string, { volume: number; muted: boolean }>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("huddle:stream-preferences");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const streamPreferenceFor = useCallback(
    (streamId: string, userId?: string) => {
      const key = userId || streamId;
      return (
        streamAudioPrefs[key] ||
        streamAudioPrefs[streamId] || { volume: 100, muted: false }
      );
    },
    [streamAudioPrefs],
  );

  const setStreamVolume = useCallback(
    (streamId: string, userId: string | undefined, volume: number) => {
      setStreamAudioPrefs((prev) => {
        const key = userId || streamId;
        const current =
          prev[key] || prev[streamId] || { volume: 100, muted: false };
        const next = {
          ...prev,
          [key]: {
            ...current,
            volume: Math.max(0, Math.min(200, Math.round(volume))),
          },
        };
        try {
          localStorage.setItem(
            "huddle:stream-preferences",
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    },
    [],
  );

  const toggleStreamMute = useCallback(
    (streamId: string, userId: string | undefined) => {
      setStreamAudioPrefs((prev) => {
        const key = userId || streamId;
        const current =
          prev[key] || prev[streamId] || { volume: 100, muted: false };
        const next = {
          ...prev,
          [key]: { ...current, muted: !current.muted },
        };
        try {
          localStorage.setItem(
            "huddle:stream-preferences",
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    },
    [],
  );

  const [musicWatchOnline, setMusicWatchOnline] = useState<boolean | null>(null);
  const [musicDashboardUrl, setMusicDashboardUrl] = useState<string | null>(null);
  const [dndOnline, setDndOnline] = useState<boolean | null>(null);
  const [dndUrl, setDndUrl] = useState<string | null>(null);

  // Custom modal dialog & server settings states
  const [dialogOptions, setDialogOptions] = useState<DialogOptions | null>(null);
  const [dialogCallback, setDialogCallback] = useState<((val?: string) => void) | null>(null);
  const [dialogCancel, setDialogCancel] = useState<(() => void) | null>(null);
  /** Hub handlers are made before `voice`; this reaches its /say stop. */
  const voiceStopSpeakingRef = useRef<() => void>(() => undefined);
  /** The /tts message being read aloud right now, so its row can show who is talking. */
  const [ttsSpeakingId, setTtsSpeakingId] = useState<string | null>(null);
  /** Runs when a dialog is closed without choosing (backdrop, X, Escape). */
  const dialogDismissRef = useRef<(() => void) | null>(null);
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

  /** The "Streaming Now" card for a streaming member or a room's watch party. */
  const [streamHover, setStreamHover] = useState<(StreamHoverInfo & { anchorRect: DOMRect }) | null>(null);
  const streamHoverTimer = useRef<number | null>(null);

  /** Shows the card after a short hover (now, for a tap), or hides it shortly after leaving. */
  function queueStreamHover(info: StreamHoverInfo | null, anchor?: HTMLElement, immediate = false) {
    if (streamHoverTimer.current) window.clearTimeout(streamHoverTimer.current);
    streamHoverTimer.current = null;
    if (!info || !anchor) {
      streamHoverTimer.current = window.setTimeout(() => setStreamHover(null), 200);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const show = () => setStreamHover({ ...info, anchorRect: rect });
    if (immediate) show();
    else streamHoverTimer.current = window.setTimeout(show, 250);
  }

  /** The pointer reached the card itself: keep it open. */
  function keepStreamHover() {
    if (streamHoverTimer.current) window.clearTimeout(streamHoverTimer.current);
    streamHoverTimer.current = null;
  }

  /** "Watch Stream": the stage should open on this stream, past the tune-in prompt. */
  const [stageFocusRequest, setStageFocusRequest] = useState<StageFocusRequest | null>(null);

  /** Messenger's Display Picture dialog. */
  const [pictureOpen, setPictureOpen] = useState(false);
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
  /** Where the unread messages began when this channel was opened: draws the
   *  "New" line and the "N new messages since…" bar until you catch up. */
  const [unreadMarker, setUnreadMarker] = useState<{
    channelId: string;
    messageId: string;
    count: number;
    more: boolean;
    since: string;
  } | null>(null);
  const [unreadBarVisible, setUnreadBarVisible] = useState(false);
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
  /** Servers whose welcome screen was checked (or accepted) this session. */
  const [welcomeChecked, setWelcomeChecked] = useState<Set<string>>(() => new Set());
  const markWelcomeChecked = useCallback((serverId: string) => {
    setWelcomeChecked((current) => (current.has(serverId) ? current : new Set(current).add(serverId)));
  }, []);
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

  const [profileCardTarget, setProfileCardTarget] = useState<{ member: Member; pos?: { x: number; y: number; right?: number; bottom?: number } } | null>(null);

  return {
    user, setUser, bootstrap, setBootstrap, openSignup, setOpenSignup, turnstileSiteKey,
    setTurnstileSiteKey, ready, setReady, features, setFeatures, servers, setServers, members,
    setMembers, memberFilterQuery, setMemberFilterQuery, dms, setDms, groupDialog, setGroupDialog,
    activeServerId, setActiveServerId, activeChannelId, setActiveChannelId, stageChannelId,
    setStageChannelId, voiceChatOpen, setVoiceChatOpenState, setVoiceChatOpen, voiceChatSinksRef,
    subscribeVoiceChat, emitVoiceChat, pipDismissed, setPipDismissed, voiceViewMode,
    setVoiceViewMode, focusedStreamInfo, setFocusedStreamInfo, quickSoundboardOpen,
    setQuickSoundboardOpen, dragChannelId, setDragChannelId, dragServerId, setDragServerId,
    serverDropHint, setServerDropHint, serverFolders, setServerFolders, openFolders,
    setOpenFolders, folderMenu, setFolderMenu, collapsedCats, setCollapsedCats, messages,
    setMessages, messagesRef, rawUnread, setUnread, pins, setPins, pinsOpen, setPinsOpen,
    mentionsOpen, setMentionsOpen, savedOpen, setSavedOpen, savedList, savedIds, loadSaved,
    toggleSaved, mentionsTab, setMentionsTab, mentionInbox, setMentionInbox, globalSearchOpen,
    setGlobalSearchOpen, pendingFriendCount, setPendingFriendCount, friendUserIds,
    setFriendUserIds, outgoingFriendUserIds, setOutgoingFriendUserIds, incomingFriendUserIds,
    setIncomingFriendUserIds, blockedUserIds, setBlockedUserIds, blockedUserIdsRef,
    expandedBlockedMessages, setExpandedBlockedMessages, channelDraftsRef, draftSaveTimerRef,
    saveDraftsSoon, prevChannelForDraftRef, draft, setDraftState, draftRef, setDraft, replyTarget,
    setReplyTarget, editingId, setEditingId, editDraft, setEditDraft, searchOpen, setSearchOpen,
    searchQuery, setSearchQuery, searchResults, setSearchResults, runMessageSearch, pendingFiles,
    setPendingFiles, notice, setNotice, mobileNav, setMobileNav, openActionsId, setOpenActionsId,
    shiftPressed, setShiftPressed, mobileActionsMoreId, setMobileActionsMoreId,
    mobileComposerMenuOpen, setMobileComposerMenuOpen, quickVoteId, setQuickVoteId, quickReactions,
    setQuickReactions, hiddenServerEmojiIds, setHiddenServerEmojiIds, syncProfileEmojis,
    removeQuickReaction, hideServerEmoji, addQuickReaction, reactionPicker, setReactionPicker,
    forwardTarget, setForwardTarget, reactionViewer, setReactionViewer, resolvedInvites,
    setResolvedInvites, fetchingInvitesRef, copiedMessageId, setCopiedMessageId, touchStartRef,
    longPressTimerRef, longPressTriggeredRef, handleMessageTouchStart, handleMessageTouchMove,
    handleMessageTouchEnd, handleOpenReactionPicker, handleForwardMessage,
    handleOpenReactionViewer, membersOpen, setMembersOpen, markdownModalOpen, setMarkdownModalOpen,
    theme, setTheme, msnTheme, collapsedGroups, setCollapsedGroups, sidebarShareSetupOpen,
    setSidebarShareSetupOpen, nudgeCooling, setNudgeCooling, sidebarWidth, setSidebarWidth,
    membersWidth, setMembersWidth, sidebarDragging, sidebarStartX, sidebarStartW, sidebarWidthRef,
    membersDragging, membersStartX, membersStartW, membersWidthRef, threadWidth, setThreadWidth,
    threadDragging, threadStartX, threadStartW, threadWidthRef, onSidebarResizeDown,
    onMembersResizeDown, onThreadResizeDown, settingsOpen, setSettingsOpen, gifOpen, setGifOpen,
    emojiOpen, setEmojiOpen, formatOpen, setFormatOpen, gamesOpen, setGamesOpen, messageFont,
    setMessageFont, soundsOpen, setSoundsOpen, msnSoundsRef, msnThemeRef, slashIndex,
    setSlashIndex, botCommands, setBotCommands, userMenu, setUserMenu, groupDmMenu, setGroupDmMenu,
    profileMember, setProfileMember, lightbox, setLightbox, editHistoryId, setEditHistoryId,
    eventsOpen, setEventsOpen, eventsRefresh, setEventsRefresh, openLightbox, setLightboxImage,
    pdfViewer, setPdfViewer, typing, setTyping, lastTypingSentRef, pollCounts, setPollCounts,
    pollVoters, setPollVoters, emojis, setEmojis, channelPrefs, setChannelPrefs, channelServer,
    channelServerRef, dmChannelIdsRef, unread, rawUnreadRef, bannedIds, setBannedIds, channelMenu,
    setChannelMenu, kindMenu, setKindMenu, railMenu, setRailMenu, threadRoot, setThreadRoot,
    threadMessages, setThreadMessages, threadDraft, setThreadDraft, roomActivity, setRoomActivity,
    diceRoll, setDiceRoll, lastDiceRollSeedRef, statusOpen, setStatusOpen, myStatus, setMyStatus,
    autoReply, setAutoReply, autoReplyRef, nowAway, myCustomStatus, setMyCustomStatus, autoIdleRef,
    botMenu, setBotMenu, voicePrefs, setVoicePrefs, prefFor, streamAudioPrefs, setStreamAudioPrefs,
    streamPreferenceFor, setStreamVolume, toggleStreamMute, musicWatchOnline, setMusicWatchOnline,
    musicDashboardUrl, setMusicDashboardUrl, dndOnline, setDndOnline, dndUrl, setDndUrl,
    dialogOptions, setDialogOptions, dialogCallback, setDialogCallback, dialogCancel,
    setDialogCancel, voiceStopSpeakingRef, ttsSpeakingId, setTtsSpeakingId, dialogDismissRef,
    serverMenuOpen, setServerMenuOpen, serverSettingsOpen, setServerSettingsOpen, showCustomPrompt,
    showCustomConfirm, msnContacts, whatsNewPeople, whatsNew, personalEmoticons,
    createContactGroup, renameContactGroup, deleteContactGroup, hoverCard, setHoverCard,
    hoverTimer, queueHoverCard, pictureOpen, setPictureOpen, placeContact, toggleSignInAlert,
    battlemapApi, battlemap, battlemapGm, battlemapHidden, onBattlemapSocket, openBattlemap,
    addMyToken, onLocalToken, onLocalStroke, toggleBattlemap, closeBattlemap, fileRef, composerRef,
    messageEndRef, messagesScrollRef, nearBottomRef, showJumpLatest, setShowJumpLatest,
    unseenCount, setUnseenCount, unreadMarker, setUnreadMarker, unreadBarVisible,
    setUnreadBarVisible, lastSeenTailRef, unreadRef, initialChannelScrollRef, messagesLoadedFor,
    setMessagesLoadedFor, activeChannelRef, activeServerRef, pendingCommandRef, inDmHome,
    welcomeChecked, setWelcomeChecked, markWelcomeChecked, touchInput, setTouchInput, dragging,
    setDragging, profileCardTarget, setProfileCardTarget, streamHover, setStreamHover, queueStreamHover,
    keepStreamHover, stageFocusRequest, setStageFocusRequest,
  };
}
