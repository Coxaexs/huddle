"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
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
import { MsnDisplayPictures, findWink, flashTitle, playMessageChime, playNudge, playWink, useMsnTheme } from "./components/msn-chrome";
import { isRetroSoundThemeEnabled, playSound as playMsnSound } from "./lib/msn-sounds";
import { shouldShowMsnToday } from "./components/msn-today";
import { useMsnContacts, usePersonalEmoticons, useWhatsNew } from "./hooks/use-msn-extras";
import { applyPersonalEmoticons } from "@/lib/msn-contacts";
import { msnPictureFile, type MsnPicture } from "./lib/msn-pictures";
import { GAME_INFO, isGameKind, type GameKind } from "@/lib/games";
import { applyMessageFont, readMessageFont, stripTextStyle, type MessageFont } from "@/lib/text-style";
import type { RoomActivity } from "@/lib/activities";
import type { PublicChannel, PublicRole, PublicServer } from "@/lib/servers";
import { channelKindInfo, channelNameRules, CREATABLE_CHANNEL_KINDS, type ChannelKind } from "@/lib/channel-kinds";
import { clampVoiceBitrate, VOICE_BITRATE_DEFAULT, VOICE_BITRATE_MAX, VOICE_BITRATE_MIN } from "@/lib/voice-quality";
import { shouldStartMuted } from "@/lib/stage";
import { ALL_PERMISSIONS, hasPermission, Permission, canAccessServerSettings } from "@/lib/permissions";
import { type Member, type PresenceStatus, type PublicUser } from "@/lib/users";
import { activeUntil } from "@/lib/timeouts";
import { findTagQuery, nameToHandle } from "@/lib/mention-handles";
import { ChevronDown, Mic, MicOff, HeadphoneOff, AudioLines } from "lucide-react";
import { playScreenShareStartSound, playScreenShareStopSound } from "./lib/audio-cues";
import { AuthGate } from "./components/auth-gate";
import { EmailPrompt } from "./components/email-prompt";
import { Avatar } from "./components/avatar";
import {
  BotMenu,
  type BotMenuAction,
} from "./components/bot-menu";
import { DiceOverlay } from "./components/dice-overlay";
import { StyledText, isImageUrl, type MentionChannel } from "./components/message-body";
import { EditHistoryDialog } from "./components/edit-history";
import { EventsPanel, eventWhen, useServerEvents } from "./components/events-panel";
import { type ResolvedInvite } from "./components/server-invite-card";
import { BattlemapBoard } from "./components/battlemap";
import { useBattlemap } from "./hooks/use-battlemap";
import { QuickSwitcher, type QuickSwitcherTarget } from "./components/quick-switcher";
import { GroupDmDialog } from "./components/group-dm-dialog";
import { createFolder, moveToFolder, removeFromFolders, type ServerFolder } from "@/lib/server-folders";
import { KeyboardShortcutsDialog } from "./components/keyboard-shortcuts-dialog";
import { practiceRoll, TUTORIAL_PENDING_KEY, TutorialPill, WelcomeTutorial } from "./components/welcome-tutorial";
import { ToastContainer, showToast } from "./components/toast";
import { DeviceSwitchPrompt } from "./components/device-switch-prompt";
import { ForumBoard } from "./components/forum-board";
import { PdfViewer } from "./components/pdf-viewer";
import { ProfileCard } from "./components/profile-card";
import type { MusicSettings } from "./components/music-cards";
import { RemoteVoiceAudio } from "./components/remote-voice-audio";
import { requestProfileEditor } from "@/lib/profile-editor-request";
import { SettingsDialog } from "./components/settings-dialog";
import { CustomDialog, type DialogOptions } from "./components/custom-dialog";
import { type Message, type DmSummary, type MentionEntry, type MentionOption, compareDms } from "./lib/chat/types";
import { DM_HOME, DEFAULT_QUICK_REACTIONS } from "./lib/chat/constants";
import { commandArgsHint, notifyLevel, rankMentionMatches, formatClientDateTime, volumeGain, withArticle } from "./lib/chat/format";
import { applyReaction } from "./lib/chat/reactions";
import { pickImageFile, showNotification, playSound } from "./lib/chat/browser";
import { extractInviteCodes } from "./lib/chat/invites";
import { CHANNEL_KIND_COPY, channelKindLabel, channelKindIcon } from "./components/chat/channel-kind";
import { MatrixRain } from "./components/matrix-rain";
import { RailFolder, RailServer } from "./components/chat/rail";
import { runSpeechCommand, SPEECH_COMMANDS, type SpeechCommand } from "./lib/chat/speech-commands";
import { runLookupCommand } from "./lib/chat/commands/lookup";
import { runMusicCommand } from "./lib/chat/commands/music";
import { runWatchCommand } from "./lib/chat/commands/watch";
import { runRecordCommand } from "./lib/chat/commands/record";
import { runRollCommand } from "./lib/chat/commands/roll";
import {
  clampTtsVoice,
  stopTtsPlayback,
  speakMessage,
  ttsPlaybackEnabled,
  type TtsLanguage,
} from "./lib/tts/client";
import { ServerSettingsDialog } from "./components/server-settings-dialog";
import { VoiceStage } from "./components/voice-stage";
import { hasLiveVideo } from "./components/voice-stage/tiles";
import {
  replaceEmojiShortcodes,
  parseQuickReaction,
  findMatchingEmojiShortcodes,
} from "@/lib/emoji-shortcodes";
import { FriendsView } from "./components/friends-view";
import { GlobalUserSearchDialog } from "./components/global-user-search-dialog";
import { VoiceDuration } from "./components/voice-duration";
import { type UserMenuTarget, type VoicePref } from "./components/user-menu";
import { useHub } from "./hooks/use-hub";
import { useLiveCaptions, type LiveCaptions } from "./hooks/use-live-captions";
import { useLivingRoom } from "./hooks/use-living-room";
import { usePlayer } from "./hooks/use-player";
import { useVoice } from "./hooks/use-voice";
import { apiFetch, apiUrl } from "./lib/client";
import { useMessageSearch } from "./hooks/use-message-search";
import { useSavedMessages } from "./hooks/use-saved-messages";
import { useDmCalls } from "./hooks/use-dm-calls";
import { Speaking, LiveRecordingDirector } from "./components/chat/shell/live-speaking";
import { unlockAudio } from "./lib/devices";
import { comboToAccelerator } from "./lib/hotkeys";
import { disableWebPush, enableWebPush, registerServiceWorker } from "./lib/web-push";
import {
  COMMAND_ALIASES,
  DISCORD_ONLY_COMMANDS,
  DND_LINK_COMMANDS,
  LOOKUP_COMMANDS,
  MUSIC_COMMANDS,
  matchCommands,
  findCommand,
  type SlashCommand,
} from "./lib/commands";
import { PollDialog } from "./components/poll-dialog";
import { formatDuration, useVoiceRecorder, type VoiceClip } from "./components/voice-message";
import { BlahajBuddy } from "./components/blahaj-buddy";
import { useActivityDetector } from "./hooks/use-activity-detector";
import { ForwardMessageDialog, type ForwardMessageTarget } from "./components/forward-message-dialog";
import { updateAppBadge } from "./lib/chat/app-badge";
import { installThemeFx } from "./lib/theme-fx";
import { WelcomeGate } from "./components/server-welcome";
import { type Theme, getActiveThemeId, findThemeById, applyThemeToDocument, applyClientUiCss, exportThemeCode } from "@/lib/themes";
import { DRAFTS_KEY, mergeMessages, fitComposer } from "./lib/chat/shell-helpers";
import { GroupDmContextMenu } from "./components/chat/group-dm-context-menu";
import { MsnOverlays, ImageLightbox, ProfileCardLayer, IncomingDmCall, MarkdownGuideModal, ReactionPickerLayer, ReactionViewerLayer, FloatingStreamPreview } from "./components/chat/shell/overlays";
import { ServerRail, ChannelSidebar, ThreadPanel, MemberPanel } from "./components/chat/shell/panels";
import { UserMenuLayer, RailMenuLayer, FolderMenuLayer, ChannelMenuLayer } from "./components/chat/shell/menus";
import { SearchPanel, SavedPanel, MentionsPanel, PinsPanel } from "./components/chat/shell/side-panels";
import { DmCallView } from "./components/chat/shell/dm-call-view";
import { MessageList } from "./components/chat/shell/message-list";
import { Composer } from "./components/chat/shell/composer";
import { ChatHeader } from "./components/chat/shell/chat-header";
import { registerProfileStyles, ringColor } from "./lib/profile-style";
import { StyledName, VoiceAura } from "./components/profile-style-parts";
















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
  const [pendingFiles, setPendingFiles] = useState<
    Array<{ id: string; file: File; preview: string | null }>
  >([]);
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

  /** Sets a notification level for a channel id or a `server:<id>` key, with optional temporary duration. */
  const setNotifyLevel = useCallback((key: string, level: string, durationMs?: number) => {
    setChannelPrefs((prefs) => {
      const next = { ...prefs };
      if (level === "all" && !durationMs) delete next[key];
      else next[key] = level;
      return next;
    });
    void apiFetch("/api/channels/prefs", {
      method: "POST",
      body: JSON.stringify({ channelId: key, level, durationMs }),
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
    void loadSaved();
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
        // Take the code out of the address bar either way.
        const cleanPath = window.location.pathname.startsWith("/hangout")
          ? "/"
          : window.location.pathname;
        window.history.replaceState({}, document.title, cleanPath);
        // A link must not be able to drop someone into a server on its own:
        // show what it is and ask first.
        void apiFetch<ResolvedInvite>(`/api/invites/resolve?code=${encodeURIComponent(inviteCode)}`)
          .then((invite) => {
            if (!invite.valid) {
              setNotice(invite.error || "That invite link is invalid or has expired.");
              return;
            }
            if (!invite.server) {
              setNotice(
                invite.inviter
                  ? `${invite.inviter.displayName} invited you to create an account, but you are already signed in.`
                  : "You are already signed in. This invite code is for registering a new account.",
              );
              return;
            }
            if (invite.isMember) {
              setActiveServerId(invite.server.id);
              return;
            }
            showCustomConfirm({
              title: `Join ${invite.server.name}?`,
              message: invite.inviter
                ? `${invite.inviter.displayName} invited you. ${invite.server.memberCount} members.`
                : `${invite.server.memberCount} members.`,
              confirmText: "Join server",
              cancelText: "Not now",
              onConfirm: () => void joinServerDirect(inviteCode),
            });
          })
          .catch(() => setNotice("That invite link is invalid or has expired."));
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
  const canManageRoles = hasPermission(myPermissions, Permission.MANAGE_ROLES);
  const canManageEmojis = hasPermission(myPermissions, Permission.MANAGE_EMOJIS);
  const canRecordSessions = hasPermission(
    myPermissions,
    Permission.RECORD_SESSIONS,
  );
  const canModerate = hasPermission(myPermissions, Permission.MODERATE);
  const canKickMembers = hasPermission(myPermissions, Permission.KICK_MEMBERS);
  const canBanMembers = hasPermission(myPermissions, Permission.BAN_MEMBERS);
  const canViewAuditLog = hasPermission(myPermissions, Permission.VIEW_AUDIT_LOG);
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

  const canOpenServerSettings = useMemo(() => {
    if (!user || !activeServer) return false;
    return canAccessServerSettings(myPermissions, {
      isOwner: Boolean(activeServer.ownerId === user.id),
      isAdmin: Boolean(user.isAdmin),
    });
  }, [user, activeServer, myPermissions]);

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
    // Anchor to the clicked avatar / name / row, not the cursor.
    const rect = e?.currentTarget instanceof Element ? e.currentTarget.getBoundingClientRect() : null;
    const pos = rect
      ? { x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom }
      : e
        ? { x: e.clientX, y: e.clientY }
        : undefined;
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
  /** DMs shown in the list; closed ones stay reachable through Cmd+K. Pinned first, then sorted by latest message. */
  const visibleDms = useMemo(
    () => dms.filter((dm) => !dm.hidden).sort(compareDms),
    [dms],
  );
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
      // The hub only sends people what they can see, so a channel this tab
      // does not know yet is a brand-new DM (or a server just joined).
      const isDm =
        dmChannelIdsRef.current.has(channelId) || !channelServerRef.current.get(channelId);
      if (isDm) {
        setDms((current) => {
          const exists = current.some((d) => d.channelId === channelId);
          if (!exists) {
            void loadDms().catch(() => undefined);
            return current;
          }
          return current.map((d) =>
            d.channelId === channelId
              ? {
                  ...d,
                  lastAt: incoming.createdAt || new Date().toISOString(),
                  lastMessage: incoming.text,
                  hidden: false,
                }
              : d,
          );
        });
      }
      // Nudges shake the window when they land in the open conversation or
      // any DM, unless the sender is blocked.
      if (
        incoming.payload?.nudge &&
        (channelId === activeChannelRef.current || isDm) &&
        !(incoming.userId && blockedUserIdsRef.current.has(incoming.userId))
      ) {
        playNudge();
      }
      // /tts messages are read aloud to whoever has the channel open.
      if (
        incoming.payload?.tts &&
        channelId === activeChannelRef.current &&
        !(incoming.userId && blockedUserIdsRef.current.has(incoming.userId)) &&
        !(incoming.userId && forcedMutesRef.current.has(incoming.userId)) &&
        ttsPlaybackEnabled()
      ) {
        const spokenId = String(incoming.id);
        void speakMessage(
          incoming.text,
          incoming.payload.tts.lang === "tr" ? "tr" : "en",
          {
            onStart: () => setTtsSpeakingId(spokenId),
            onEnd: () => setTtsSpeakingId((current) => (current === spokenId ? null : current)),
          },
          // The sender's voice, clamped here too: a payload is just data.
          clampTtsVoice(incoming.payload.tts.voice),
        ).catch(() => undefined);
      }
      // Winks play under the same rules.
      if (
        incoming.payload?.wink &&
        (channelId === activeChannelRef.current || isDm) &&
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
          isDm ||
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
        // Away replies answer direct messages only, never a server channel.
        dmChannelIdsRef.current.has(channelId) &&
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
          isDm ||
          Boolean(incoming.mentions?.includes(user.id)))
      ) {
        flashTitle(`${stripTextStyle(incoming.author)} says…`);
      }
      if (channelId !== activeChannelRef.current) {
        const serverId = channelServerRef.current.get(channelId);
        // A DM you are not looking at still deserves to bubble up the list.
        // Server channels don't touch the DM list, so skip the refetch.
        if (!serverId) {
          void loadDms().catch(() => undefined);
          // Not a DM we know either: a server we just joined. Fetch it.
          if (!dmChannelIdsRef.current.has(channelId)) void loadServers().catch(() => undefined);
        }
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
      if (detachedRef.current) {
        // Viewing old history: count it, append nothing (there is a gap).
        setUnseenCount((count) => count + 1);
        return;
      }
      setMessages((current) => {
        if (current.some((existing) => existing.id === incoming.id)) return current;
        const next = [...current, incoming];
        // A busy channel left open for hours would otherwise grow without
        // bound; drop the oldest while the reader is at the bottom.
        if (next.length > 600 && nearBottomRef.current) {
          setHasOlder(true);
          return next.slice(-400);
        }
        return next;
      });
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
  /** Pending reload scope: server ids, or "*" for a change not tied to one. */
  const structureScopeRef = useRef<Set<string>>(new Set());
  const myServerIdsRef = useRef<Set<string>>(new Set());
  const reloadStructureSoon = useCallback((serverId?: string) => {
    // A change in a server you are not in is none of this tab's business.
    if (serverId && !myServerIdsRef.current.has(serverId)) return;
    structureScopeRef.current.add(serverId || "*");
    if (structureReloadRef.current) return;
    // Spread out: with a hundred people online, a shared 400 ms timer turned
    // every change into a hundred simultaneous reloads.
    structureReloadRef.current = window.setTimeout(() => {
      structureReloadRef.current = null;
      const scope = structureScopeRef.current;
      structureScopeRef.current = new Set();
      const everything = scope.has("*");
      const active = activeServerRef.current;
      void loadServers().catch(() => undefined);
      if (everything || (active && scope.has(active))) {
        void loadMembers().catch(() => undefined);
        setEventsRefresh((n) => n + 1);
      }
      void loadEmojis().catch(() => undefined);
      // Group DMs you were added to (or renamed) arrive as unscoped changes.
      if (everything) void loadDms().catch(() => undefined);
    }, 300 + Math.random() * 1200);
    // loadEmojis/loadServers/loadMembers are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Someone's profile or presence changed: refresh only lists showing them. */
  const memberReloadRef = useRef<number | null>(null);
  const memberReloadDmsRef = useRef(false);
  const shownPeopleRef = useRef<{ members: Set<string>; dmPartners: Set<string> }>({
    members: new Set(),
    dmPartners: new Set(),
  });
  const reloadMemberSoon = useCallback((userId: string) => {
    const shown = shownPeopleRef.current;
    const inMembers = shown.members.has(userId);
    const inDms = shown.dmPartners.has(userId);
    if (!inMembers && !inDms) return;
    if (inDms) memberReloadDmsRef.current = true;
    if (memberReloadRef.current) return;
    memberReloadRef.current = window.setTimeout(() => {
      memberReloadRef.current = null;
      void loadMembers().catch(() => undefined);
      if (memberReloadDmsRef.current) {
        memberReloadDmsRef.current = false;
        void loadDms().catch(() => undefined);
      }
    }, 500 + Math.random() * 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  myServerIdsRef.current = useMemo(() => new Set(servers.map((server) => server.id)), [servers]);
  shownPeopleRef.current = useMemo(
    () => ({
      members: new Set(members.map((member) => member.id)),
      dmPartners: new Set(
        dms.flatMap((dm) => (dm.group ? dm.group.members.map((member) => member.id) : [dm.user.id])),
      ),
    }),
    [members, dms],
  );

  /** Server-muted user ids, for callbacks made before `hub` exists. */
  const forcedMutesRef = useRef<Set<string>>(new Set());
  const captionReceiveRef = useRef<LiveCaptions["receive"] | null>(null);
  const hub = useHub(Boolean(user), {
    onMessage: handleIncomingMessage,
    onSignal: (from, data) => voiceSignalRef.current(from, data),
    onStructureChange: reloadStructureSoon,
    onMember: (userId) => {
      if (user && userId === user.id) return;
      reloadMemberSoon(userId);
    },
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
    onTtsStop: (channelId, by) => {
      const here = channelId === activeChannelRef.current;
      const inCall = channelId === voiceChannelRef.current;
      if (!here && !inCall) return;
      stopTtsPlayback();
      setTtsSpeakingId(null);
      if (inCall) voiceStopSpeakingRef.current();
      setNotice(`${by} stopped text-to-speech.`);
    },
    onSoundboard: (channelId, url) => {
      if (channelId !== voiceChannelRef.current) return;
      playSound(url);
    },
    onCaption: (event) => captionReceiveRef.current?.(event),
    onTyping: (channelId, userId, displayName) => {
      setTyping((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] || {}),
          [userId]: { name: displayName, at: Date.now() },
        },
      }));
    },
    onPoll: (channelId, pollId, counts, voterLists) => {
      if (channelId !== activeChannelRef.current) return;
      setPollCounts((current) => ({ ...current, [pollId]: counts }));
      if (voterLists) setPollVoters((current) => ({ ...current, [pollId]: voterLists }));
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

  const roomBitrates = useMemo(() => {
    const map: Record<string, number> = {};
    for (const server of servers) {
      for (const channel of server.channels) {
        if (channel.bitrate) map[channel.id] = channel.bitrate;
      }
    }
    return map;
  }, [servers]);
  const isDevUser = Boolean(user?.isDev || user?.username === "kiwi" || user?.username === "flo");
  const voice = useVoice({
    connectionId: hub.connectionId,
    session: hub.session,
    rooms: hub.voice,
    send: hub.send,
    roomBitrates,
    isDev: isDevUser,
  });
  const captions = useLiveCaptions({
    roomId: voice.channelId,
    muted: voice.muted || voice.deafened || voice.forcedMute,
    send: hub.send,
    selfConnectionId: hub.connectionId,
    onError: (message) => setNotice(message),
  });
  captionReceiveRef.current = captions.receive;
  voiceStopSpeakingRef.current = voice.stopSpeaking;
  forcedMutesRef.current = hub.forcedMutes;
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

  const activeVoiceChannel = useMemo(() => {
    if (!voice.channelId) return null;
    for (const server of servers) {
      for (const channel of server.channels) {
        if (channel.id === voice.channelId) return channel;
      }
    }
    return null;
  }, [servers, voice.channelId]);

  useEffect(() => {
    if (!voice.channelId || !voice.isSfu || !voice.voiceRegion || !activeVoiceChannel) return;
    const target = activeVoiceChannel.rtcRegion;
    if (target && target !== "auto" && voice.voiceRegion !== target) {
      void voice.switchRegion(target);
    }
  }, [voice.channelId, voice.isSfu, voice.voiceRegion, activeVoiceChannel, voice.switchRegion]);
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
  // The soundboard works in your current room unless it is switched off there
  // or you are sitting in a stage's audience.
  const currentRoom = voice.channelId
    ? servers.flatMap((server) => server.channels).find((channel) => channel.id === voice.channelId)
    : undefined;
  const mySeat = voice.channelId
    ? (hub.voice[voice.channelId] || []).find((seat) => seat.connectionId === hub.connectionId)
    : undefined;
  const voiceSoundboardAllowed =
    currentRoom?.soundboard !== false &&
    !(currentRoom?.kind === "stage" && mySeat?.speakAllowed !== true);
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
  const livingRoom = useLivingRoom({
    roomId: voice.channelId,
    connectionId: hub.connectionId,
    participants: voiceParticipants,
    send: hub.send,
  });

  /** Active screenshare or camera stream in the joined room for floating PiP */
  const floatingStream = useMemo(() => {
    if (!voice.channelId) return null;

    // 1. Look for remote screen shares
    for (const remote of voice.remoteStreams) {
      if (!hasLiveVideo(remote.stream)) continue;
      const person = voiceParticipants.find((p) => p.connectionId === remote.connectionId);
      const isScreen = remote.kind ? remote.kind === "screen" : person?.screenStreamId === remote.stream.id;
      if (person && isScreen && !voice.hiddenVideo[remote.connectionId]?.screen) {
        return {
          stream: remote.stream,
          streamerName: person.displayName,
          kind: "screen" as const,
          participantId: person.id,
          isSelf: false,
        };
      }
    }

    // 2. Look for local screen share
    for (const local of voice.localVideos) {
      if (local.kind === "screen" && hasLiveVideo(local.stream)) {
        return {
          stream: local.stream,
          streamerName: user?.displayName || "You",
          kind: "screen" as const,
          participantId: user?.id,
          isSelf: true,
        };
      }
    }

    // 3. Fallback to any remote video stream (e.g. camera) that is not hidden
    for (const remote of voice.remoteStreams) {
      if (!hasLiveVideo(remote.stream)) continue;
      const person = voiceParticipants.find((p) => p.connectionId === remote.connectionId);
      const isCamera = remote.kind ? remote.kind === "camera" : person?.cameraStreamId === remote.stream.id;
      const kind = isCamera ? "camera" : "screen";
      if (voice.hiddenVideo[remote.connectionId]?.[kind]) continue;
      return {
        stream: remote.stream,
        streamerName: person?.displayName || "Remote Stream",
        kind: kind as "screen" | "camera",
        participantId: person?.id,
        isSelf: false,
      };
    }

    // 4. Fallback to local camera
    for (const local of voice.localVideos) {
      if (hasLiveVideo(local.stream)) {
        return {
          stream: local.stream,
          streamerName: user?.displayName || "You",
          kind: local.kind,
          participantId: user?.id,
          isSelf: true,
        };
      }
    }

    return null;
  }, [
    voice.channelId,
    voice.remoteStreams,
    voice.localVideos,
    voice.hiddenVideo,
    voiceParticipants,
    user?.displayName,
    user?.id,
  ]);

  // When a new stream starts, automatically reopen the floating preview if not on stage
  useEffect(() => {
    if (floatingStream) {
      setPipDismissed(false);
    }
  }, [floatingStream?.stream.id]);

  /** Stream currently focused or active in screenshare for the unified top header */
  const activeScreenShare = useMemo(() => {
    if (focusedStreamInfo?.isScreen) {
      return focusedStreamInfo;
    }
    if (floatingStream?.kind === "screen") {
      return {
        streamerName: floatingStream.streamerName,
        isScreen: true,
        streamId: floatingStream.stream.id,
        participantId: floatingStream.participantId,
        self: floatingStream.isSelf,
      };
    }
    return null;
  }, [focusedStreamInfo, floatingStream]);

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
      setPipDismissed(false);
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
      [mobileComposerMenuOpen, ".mobile-composer-menu-popover, .composer-more-mobile-btn", () => setMobileComposerMenuOpen(false)],
      [mobileActionsMoreId !== null, ".message-actions, .message-action-mobile-more", () => setMobileActionsMoreId(null)],
      [mentionsOpen, '.mentions-panel, [aria-label="Mentions"]', () => setMentionsOpen(false)],
      [pinsOpen, '.pins-panel:not(.mentions-panel), [aria-label="Pinned messages"]', () => setPinsOpen(false)],
      [savedOpen, '.saved-panel, [aria-label="Saved messages"]', () => setSavedOpen(false)],
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
  }, [
    serverMenuOpen,
    kindMenu,
    statusOpen,
    quickSoundboardOpen,
    emojiOpen,
    gifOpen,
    formatOpen,
    gamesOpen,
    mobileComposerMenuOpen,
    mobileActionsMoreId,
    mentionsOpen,
    pinsOpen,
    savedOpen,
  ]);

  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** The welcome tutorial: which page, and whether it is folded away while a "Try it" runs. */
  const [tutorial, setTutorial] = useState<{ page: number; folded: boolean } | null>(null);
  // Right after signing up (the sign-in screen leaves a note), the tutorial opens by itself.
  useEffect(() => {
    if (!user) return;
    try {
      if (window.localStorage.getItem(TUTORIAL_PENDING_KEY)) setTutorial({ page: 0, folded: false });
    } catch {
      // Storage blocked: it won't open by itself, but Settings → Tutorial still works.
    }
  }, [user?.id]);
  const closeTutorial = useCallback(() => {
    setTutorial(null);
    try {
      window.localStorage.removeItem(TUTORIAL_PENDING_KEY);
    } catch {
      // Nothing to clear.
    }
  }, []);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);
  const [profileCardTarget, setProfileCardTarget] = useState<{ member: Member; pos?: { x: number; y: number; right?: number; bottom?: number } } | null>(null);

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
    onUpdateActivity: (activity) => {
      if (!user) return;
      setMembers((prev) => prev.map((m) => (m.id === user.id ? { ...m, activity } : m)));
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
        // Ctrl+K jumps anywhere; Ctrl+Shift+K finds people.
        if (e.shiftKey) setGlobalSearchOpen((o) => !o);
        else setQuickSwitcherOpen((o) => !o);
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

  // Ctrl+Shift+S / Ctrl+Shift+V toggle screen share and camera while in voice,
  // and Alt+↑/↓ steps through the channels (or DMs) in the sidebar.
  const voiceHotkeysRef = useRef({ voice, navTargets: [] as string[] });
  voiceHotkeysRef.current = {
    voice,
    navTargets: inDmHome
      ? visibleDms.map((dm) => dm.channelId)
      : [...channelLayout.uncategorised, ...channelLayout.grouped.flatMap((group) => group.channels)]
          .filter((channel) => channelKindInfo(channel.kind).text)
          .map((channel) => channel.id),
  };
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const { voice: current, navTargets } = voiceHotkeysRef.current;
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        if (!navTargets.length) return;
        event.preventDefault();
        const index = navTargets.indexOf(activeChannelRef.current || "");
        const step = event.key === "ArrowUp" ? -1 : 1;
        const next = navTargets[(index + step + navTargets.length) % navTargets.length];
        setStageChannelId(null);
        setActiveChannelId(next);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || !current.channelId) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (current.screenSharing) current.stopScreenShare();
        else void current.startScreenShare();
      } else if (key === "v") {
        event.preventDefault();
        if (current.cameraOn) current.stopCamera();
        else void current.startCamera();
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

  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;

  useEffect(() => {
    const handleDiceRollEvent = (e: Event) => {
      const custom = e as CustomEvent<DiceRollEvent>;
      if (custom.detail) {
        lastDiceRollSeedRef.current = custom.detail.animationSeed;
        setDiceRoll(custom.detail);
        window.dispatchEvent(
          new CustomEvent("huddle-dice-rolled", { detail: custom.detail }),
        );
      }
    };
    const handleRunCommandEvent = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (custom.detail) {
        void runCommandRef.current(custom.detail);
      }
    };
    window.addEventListener("huddle-dice-roll", handleDiceRollEvent);
    window.addEventListener("huddle-run-command", handleRunCommandEvent);
    return () => {
      window.removeEventListener("huddle-dice-roll", handleDiceRollEvent);
      window.removeEventListener("huddle-run-command", handleRunCommandEvent);
    };
  }, []);

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

  // Listen for Shift key state to reveal all message actions on hover
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(true);
    };
    const onKeyUp = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(false);
    };
    const onBlur = () => setShiftPressed(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Theme click effects: blood from Vampire buttons, glyphs from Matrix, and so on.
  useEffect(() => installThemeFx(), []);

  // App icon badge (tab favicon, installed app, desktop dock/taskbar): a
  // count for mentions and unread DMs, a dot for any other unread channel.
  const badgeDmCount = useMemo(
    () => dms.reduce((sum, dm) => sum + (unread[dm.channelId]?.mentions ? 0 : unread[dm.channelId]?.count || 0), 0),
    [dms, unread],
  );
  // Only channels you can actually see: the reads API also returns channels
  // of servers you are not in, which would light a dot with nothing to read.
  const badgeDot = useMemo(() => {
    const dmIds = new Set(dms.map((dm) => dm.channelId));
    return Object.entries(unread).some(
      ([channelId, entry]) => entry.unread && (channelServer.has(channelId) || dmIds.has(channelId)),
    );
  }, [unread, dms, channelServer]);
  useEffect(() => {
    updateAppBadge(unreadMentionTotal + badgeDmCount, badgeDot);
  }, [unreadMentionTotal, badgeDmCount, badgeDot]);

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

  /** Older history exists above what is loaded. */
  const [hasOlder, setHasOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  /**
   * Viewing a window around a jumped-to message rather than the live tail.
   * Live messages are not appended while detached (there would be a gap);
   * "Jump to present" reloads the tail.
   */
  const [detached, setDetached] = useState(false);
  const detachedRef = useRef(false);
  detachedRef.current = detached;
  /** A message to scroll to once its channel has loaded. */
  const pendingJumpRef = useRef<{ channelId: string; messageId: string } | null>(null);
  /** Set just before older messages are prepended, to keep the view still. */
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);

  const loadChannelPage = useCallback(
    async (channelId: string, around?: string) => {
      const query = around
        ? `&around=${encodeURIComponent(around)}`
        : "";
      return apiFetch<{ messages: Message[]; hasMore?: boolean; hasNewer?: boolean }>(
        `/api/messages?channelId=${encodeURIComponent(channelId)}${query}`,
      );
    },
    [],
  );

  useEffect(() => {
    if (!user || !activeChannelId) {
      setMessages([]);
      setMessagesLoadedFor(null);
      return;
    }
    let cancelled = false;
    setMessages([]);
    setMessagesLoadedFor(null);
    setHasOlder(false);
    setDetached(false);
    const jump =
      pendingJumpRef.current?.channelId === activeChannelId ? pendingJumpRef.current.messageId : undefined;
    loadChannelPage(activeChannelId, jump)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        setHasOlder(Boolean(data.hasMore));
        setDetached(Boolean(jump && data.hasNewer));
        setMessagesLoadedFor(activeChannelId);
      })
      .catch(() => undefined);
    void refreshPins(activeChannelId);
    hub.send({ t: "subscribe", channelId: activeChannelId });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeChannelId]);

  // After a reconnect, catch up on what was missed without blanking the list
  // or losing the scroll position: merge the latest page into what is shown.
  const lastSessionRef = useRef(hub.session);
  useEffect(() => {
    if (hub.session === lastSessionRef.current) return;
    lastSessionRef.current = hub.session;
    const channelId = activeChannelRef.current;
    if (!channelId || detachedRef.current) return;
    hub.send({ t: "subscribe", channelId });
    loadChannelPage(channelId)
      .then((data) => {
        if (activeChannelRef.current !== channelId) return;
        setMessages((current) => mergeMessages(current, data.messages));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.session]);

  /** Loads the page above the oldest shown message. */
  const loadOlder = useCallback(async () => {
    const channelId = activeChannelRef.current;
    const el = messagesScrollRef.current;
    if (!channelId || loadingOlderRef.current || !hasOlder || !el) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    loadingOlderRef.current = true;
    try {
      const data = await apiFetch<{ messages: Message[]; hasMore?: boolean }>(
        `/api/messages?channelId=${encodeURIComponent(channelId)}&before=${encodeURIComponent(String(oldest.id))}`,
      );
      if (activeChannelRef.current !== channelId) return;
      prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((current) => mergeMessages(data.messages, current));
      setHasOlder(Boolean(data.hasMore));
    } catch {
      // Try again on the next scroll.
    } finally {
      loadingOlderRef.current = false;
    }
  }, [hasOlder]);

  // Scroll to a jumped-to message once it is on screen, and flash it.
  useEffect(() => {
    const jump = pendingJumpRef.current;
    if (!jump || jump.channelId !== activeChannelId || messagesLoadedFor !== activeChannelId) return;
    const element = document.getElementById(`msg-${jump.messageId}`);
    if (!element) return;
    pendingJumpRef.current = null;
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("jump-flash");
      window.setTimeout(() => element.classList.remove("jump-flash"), 2000);
    });
  }, [activeChannelId, messagesLoadedFor, messages]);

  useLayoutEffect(() => {
    if (!activeChannelId || messagesLoadedFor !== activeChannelId) return;
    const anchor = prependAnchorRef.current;
    if (anchor) {
      // Older history went in above: keep the same messages under the eye.
      prependAnchorRef.current = null;
      const el = messagesScrollRef.current;
      if (el) el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
      return;
    }
    if (pendingJumpRef.current?.channelId === activeChannelId) return;
    const initial = initialChannelScrollRef.current;
    if (initial?.channelId === activeChannelId) {
      initialChannelScrollRef.current = null;
      if (initial.unreadCount > 0 && messages.length > 0) {
        // The count skips your own messages, so walk back past only others'.
        let firstUnreadIndex = messages.length;
        let others = 0;
        while (firstUnreadIndex > 0 && others < initial.unreadCount) {
          firstUnreadIndex -= 1;
          if (!user || messages[firstUnreadIndex].userId !== user.id) others += 1;
        }
        const first = messages[firstUnreadIndex];
        setUnreadMarker({
          channelId: activeChannelId,
          messageId: String(first.id),
          count: initial.unreadCount,
          more: others < initial.unreadCount,
          since: first.createdAt || "",
        });
        setUnreadBarVisible(true);
        document
          .getElementById(`msg-${first.id}`)
          ?.scrollIntoView({ behavior: "auto", block: "center" });
        // Short channels never scroll, so no scroll event would hide the bar:
        // check once laid out whether the latest message is already in view.
        window.requestAnimationFrame(() => {
          const el = messagesScrollRef.current;
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
            nearBottomRef.current = !detachedRef.current;
            if (!detachedRef.current) setUnreadBarVisible(false);
          }
        });
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
      setUnreadBarVisible(false);
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
    setUnreadMarker((current) => (current?.channelId === activeChannelId ? current : null));
    setUnreadBarVisible(false);
  }, [activeChannelId]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < 120;
    nearBottomRef.current = near && !detachedRef.current;
    if (near && !detachedRef.current) {
      setUnseenCount(0);
      setUnreadBarVisible(false);
    }
    setShowJumpLatest(detachedRef.current || distance > Math.max(300, el.clientHeight * 0.6));
    if (el.scrollTop < 400) void loadOlderRef.current();
  }, []);
  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;

  function jumpToFirstUnread() {
    const marker = unreadMarker;
    if (!marker) return;
    const element = document.getElementById(`msg-${marker.messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("jump-flash");
      window.setTimeout(() => element.classList.remove("jump-flash"), 2000);
    } else {
      jumpToMessage(marker.channelId, marker.messageId);
    }
  }

  const jumpToLatest = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    if (detachedRef.current) {
      // Viewing old history: fetch the present instead of scrolling to the
      // end of an old window.
      const channelId = activeChannelRef.current;
      if (!channelId) return;
      void loadChannelPage(channelId).then((data) => {
        if (activeChannelRef.current !== channelId) return;
        setDetached(false);
        setHasOlder(Boolean(data.hasMore));
        nearBottomRef.current = true;
        setUnseenCount(0);
        setMessages(data.messages);
        window.requestAnimationFrame(() => messageEndRef.current?.scrollIntoView({ behavior: "auto" }));
      });
      return;
    }
    nearBottomRef.current = true;
    setUnseenCount(0);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Very long jumps would take ages to animate; snap most of the way first.
    if (!reduce && el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight * 4) {
      el.scrollTop = el.scrollHeight - el.clientHeight * 2;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [loadChannelPage]);

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

    // Accessibility settings
    const savedChatFontSize = Number(window.localStorage.getItem("huddle_chat_font_size"));
    if (savedChatFontSize && !Number.isNaN(savedChatFontSize)) {
      root.style.setProperty("--chat-font-size", `${savedChatFontSize}px`);
    }
    root.dataset.underlineLinks =
      window.localStorage.getItem("huddle_underline_links") === "true" ? "on" : "off";
    root.dataset.displayNameStyles =
      window.localStorage.getItem("huddle_display_names_styles") !== "false" ? "on" : "off";
    root.dataset.nameMotion = window.localStorage.getItem("huddle_name_motion") || "hover";

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

  /**
   * Pins or unpins a DM to keep it at the top of the direct messages list.
   */
  async function togglePinDm(channelId: string, pinned: boolean) {
    const now = new Date().toISOString();
    setDms((current) =>
      current.map((dm) =>
        dm.channelId === channelId
          ? { ...dm, pinned, pinnedAt: pinned ? now : null, hidden: false }
          : dm,
      ),
    );
    try {
      const data = await apiFetch<{ conversations: DmSummary[] }>("/api/dms", {
        method: "PATCH",
        body: JSON.stringify({ channelId, pinned }),
      });
      if (data?.conversations) {
        setDms(data.conversations);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not pin that conversation.");
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

    if (name === "summarize" || name === "catchup" || name === "tldr") {
      pendingCommandRef.current = null;
      if (!activeChannelId) return;
      setNotice("✦ Reading the channel…");
      try {
        const data = await apiFetch<{ summary: string; count: number }>("/api/ai/summarize", {
          method: "POST",
          body: JSON.stringify({ channelId: activeChannelId }),
        });
        setNotice("");
        // Shown to you only; nothing is posted to the channel.
        setDialogOptions({
          type: "alert",
          title: `Catch-up · last ${data.count} messages`,
          message: data.summary,
          confirmText: "Got it",
        });
        setDialogCallback(null);
        setDialogCancel(null);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The summary did not come back.");
      }
      return;
    }

    if (name === "remind") {
      pendingCommandRef.current = null;
      try {
        const data = await apiFetch<{ dueAt: string }>("/api/reminders", {
          method: "POST",
          body: JSON.stringify({
            spec: value,
            channelId: activeChannelId,
            timezoneOffset: new Date().getTimezoneOffset(),
          }),
        });
        setNotice(`⏰ Reminder set for ${formatClientDateTime(data.dueAt)}.`);
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Try: /remind 20m take the pizza out",
        );
      }
      return;
    }

    if (name === "recap") {
      pendingCommandRef.current = null;
      const weekly = /^weekly\b/i.test(value);
      try {
        const data = await apiFetch<{ posted?: boolean; weekly?: boolean; nextAt?: string }>("/api/recap", {
          method: "POST",
          body: JSON.stringify({ channelId: activeChannelId, action: weekly ? "weekly" : "now" }),
        });
        if (weekly) {
          setNotice(
            data.weekly
              ? `📊 Weekly recap on: next one ${formatClientDateTime(data.nextAt || "")} in this channel. /recap weekly again turns it off.`
              : "📊 Weekly recap turned off.",
          );
        } else if (!data.posted) {
          setNotice("Nothing to recap: no messages here in the last week.");
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "The recap did not work.");
      }
      return;
    }

    if (name === "schedule") {
      pendingCommandRef.current = null;
      // Keep the message's own line breaks: everything after "/schedule ".
      const spec = raw.trim().replace(/^\/?\S+[ \t]*/, "");
      try {
        if (!spec || /^(list|cancel)\b/i.test(spec)) {
          const data = await apiFetch<{
            scheduled: Array<{ id: string; channelName: string | null; text: string; dueAt: string }>;
          }>("/api/scheduled");
          const cancel = spec.match(/^cancel\s+(\d+)/i);
          if (cancel) {
            const item = data.scheduled[Number(cancel[1]) - 1];
            if (!item) {
              setNotice("There is no scheduled message with that number. /schedule lists them.");
              return;
            }
            await apiFetch(`/api/scheduled?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
            setNotice(`Cancelled: “${item.text.slice(0, 60)}”`);
            return;
          }
          setDialogOptions({
            type: "alert",
            title: "Scheduled messages",
            message: data.scheduled.length
              ? data.scheduled
                  .map(
                    (item, index) =>
                      `${index + 1}. ${formatClientDateTime(item.dueAt)} · #${item.channelName || "?"}\n   ${item.text.slice(0, 120)}`,
                  )
                  .join("\n\n") + "\n\nCancel one with /schedule cancel <number>."
              : "Nothing scheduled. Try /schedule 20:00 Doors are open!",
            confirmText: "OK",
          });
          setDialogCallback(null);
          setDialogCancel(null);
          return;
        }
        const data = await apiFetch<{ dueAt: string }>("/api/scheduled", {
          method: "POST",
          body: JSON.stringify({
            spec,
            channelId: activeChannelId,
            timezoneOffset: new Date().getTimezoneOffset(),
          }),
        });
        setNotice(`🕒 Scheduled for ${formatClientDateTime(data.dueAt)}. /schedule lists or cancels it.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Try: /schedule 20:00 Doors are open!");
      }
      return;
    }

    if (name === "record") {
      await runRecordCommand(value, {
        enabled: features.recordSessions,
        voiceChannelId: voice.channelId,
        recordings: hub.recordings,
        notify: setNotice,
        openStage: setStageChannelId,
      });
      return;
    }

    if (MUSIC_COMMANDS.has(name)) {
      await runMusicCommand(name, value, raw, {
        voiceChannelId: voice.channelId,
        voiceChannels,
        players: hub.players,
        activeChannelId,
        userName: user?.displayName,
        primePlayer: () => player.prime(),
        notify: setNotice,
      });
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
      await runWatchCommand(name, {
        voiceChannelId: voice.channelId,
        channelTitle,
        postBotMessage,
        onActivity: (activity, channelId) => {
          setRoomActivity(activity);
          setStageChannelId(channelId);
        },
      });
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
      await runRollCommand(raw, {
        voiceChannelId: voice.channelId,
        textChannelId: activeChannelRef.current,
        postBotMessage,
        onRoll: (roll) => {
          lastDiceRollSeedRef.current = roll.animationSeed;
          setDiceRoll(roll);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("huddle-dice-rolled", { detail: roll }),
            );
          }
        },
      });
      return;
    }

    if (LOOKUP_COMMANDS.has(name)) {
      await runLookupCommand(name, value, { postBotMessage, notify: setNotice });
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

    if (SPEECH_COMMANDS.has(name)) {
      await runSpeechCommand(name as SpeechCommand, value, {
        activeChannelId,
        voiceChannelId: voice.channelId,
        serverMuted: Boolean(user && hub.forcedMutes.has(user.id)),
        voice,
        notify: setNotice,
        askLanguage: askTtsLanguage,
      });
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

  /** Asks which language to read `text` in; null when the question is closed. */
  function askTtsLanguage(text: string): Promise<TtsLanguage | null> {
    return new Promise((resolve) => {
      showCustomConfirm({
        title: "Which language?",
        message: `Read “${text.length > 80 ? `${text.slice(0, 80)}…` : text}” in Turkish or English?`,
        confirmText: "Türkçe",
        cancelText: "English",
        onConfirm: () => resolve("tr"),
        onCancel: () => resolve("en"),
      });
      // Closing the dialog without choosing sends nothing.
      dialogDismissRef.current = () => resolve(null);
    });
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
    const isDm = dmChannelIdsRef.current.has(activeChannelId) || inDmHome;
    if (isDm) {
      const now = new Date().toISOString();
      setDms((current) =>
        current.map((d) =>
          d.channelId === activeChannelId
            ? {
                ...d,
                lastAt: now,
                lastMessage: text,
                hidden: false,
              }
            : d,
        ),
      );
    }
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
    }).catch((error: Error) => {
      // The reaction did not land (a timeout, say): show what is really there.
      setNotice(error.message);
      const channelId = activeChannelRef.current;
      if (!channelId || detachedRef.current) return;
      void loadChannelPage(channelId)
        .then((data) => {
          if (activeChannelRef.current === channelId) {
            setMessages((current) => mergeMessages(current, data.messages));
          }
        })
        .catch(() => undefined);
    });
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
    }).catch((error: Error) => {
      // Put the text back as it was: the edit did not happen.
      setMessages((current) =>
        current.map((m) =>
          m.id === message.id ? { ...m, text: message.text, editedAt: message.editedAt } : m,
        ),
      );
      setNotice(error.message);
    });
  }

  // The message box grows with what you type instead of scrolling a slot.
  useLayoutEffect(() => {
    if (composerRef.current) fitComposer(composerRef.current);
  }, [draft]);

  const {
    incomingDmCall,
    dmCall,
    setDmCall,
    callDuration,
    dmCallView,
    startDmCall,
    endDmCall,
    acceptIncomingCall,
    declineIncomingCall,
  } = useDmCalls({
    user,
    hub,
    voice,
    voiceParticipants,
    voiceRooms,
    dms,
    activeDm,
    activeChannelId,
    blockedUserIdsRef,
    onDmCallRef,
    setNotice,
    setActiveServerId,
    setActiveChannelId,
  });

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

  const runSearch = (query: string) =>
    runMessageSearch(query, inDmHome ? null : activeServerId);

  function jumpToMessage(channelId: string, messageId: string) {
    setSearchOpen(false);
    setStageChannelId(null);
    pendingJumpRef.current = { channelId, messageId };
    if (channelId !== activeChannelRef.current) {
      // The channel load picks the jump up and fetches the window around it.
      setActiveChannelId(channelId);
      return;
    }
    if (messagesRef.current.some((message) => String(message.id) === messageId)) {
      // Already loaded: the jump effect scrolls to it.
      setMessages((current) => [...current]);
      return;
    }
    // Further back than what is loaded: load the window around it.
    void loadChannelPage(channelId, messageId).then((data) => {
      if (activeChannelRef.current !== channelId) return;
      setMessages(data.messages);
      setHasOlder(Boolean(data.hasMore));
      setDetached(Boolean(data.hasNewer));
    });
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
      if (msnSoundsRef.current) {
        playMsnSound("send");
      }
    } catch (error) {
      if (msnSoundsRef.current) {
        playMsnSound("error");
      }
      // Put the message back so a dropped connection or a rate limit does not
      // eat what someone typed — unless they have already started a new one.
      setDraft((current) => (current ? current : text));
      setPendingFiles((current) => (current.length ? current : files));
      setNotice(
        error instanceof Error ? error.message : "That message did not send.",
      );
    }
  }

  // Posts a file (e.g. a filled-in PDF copy) straight to the current channel.
  async function sendFileCopy(file: File) {
    const form = new FormData();
    form.append("file", file);
    const upload = await apiFetch<{ key: string }>("/api/uploads", {
      method: "POST",
      body: form,
    });
    await sendText("", [upload.key]);
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
        pickCommand(slashIndex, true);
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

  function pickCommand(index: number, fromKeyboard = false) {
    const command = slashMatches[index];
    if (!command) return;
    composerRef.current?.focus();
    // Run straight away only when the full name was typed (or it was clicked):
    // "/s" + Enter used to fire /skip or /stop for the whole room.
    const typedFully = draft.trim().toLowerCase() === `/${command.name}`;
    if (!command.args && (!fromKeyboard || typedFully)) {
      void runCommand(`/${command.name}`);
      setDraft("");
      return;
    }
    setDraft(command.args ? `/${command.name} ` : `/${command.name}`);
  }

  /** Shared by the paperclip, a drop, and a paste. Accepts several at once. */
  function acceptAttachment(files: FileList | File[] | undefined | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length) return;
    const MAX = 10;

    for (const file of list) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".svg") || lower.endsWith(".html") || lower.endsWith(".htm")) {
        setNotice("For security, HTML and SVG files cannot be attached.");
        continue;
      }
      if (file.size > 40 * 1024 * 1024) {
        setNotice(`${file.name} is larger than 40 MB.`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
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

  async function editChannelBitrate(channel: PublicChannel) {
    const current = Math.round(clampVoiceBitrate(channel.bitrate) / 1000);
    showCustomPrompt({
      title: `Voice Bitrate for ${channel.name}`,
      message:
        `The most each speaker sends, in kbps (${VOICE_BITRATE_MIN / 1000}–${VOICE_BITRATE_MAX / 1000}). ` +
        `64 is clear speech; go higher for music or singing. Bigger rooms automatically send ` +
        `less per person, so nobody's upload gets swamped.`,
      defaultValue: String(current),
      placeholder: String(VOICE_BITRATE_DEFAULT / 1000),
      confirmText: "Set Bitrate",
      onConfirm: async (value) => {
        const kbps = parseInt(value || "", 10);
        if (!Number.isFinite(kbps)) return;
        const bitrate = clampVoiceBitrate(kbps * 1000);
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ bitrate }) },
          );
          setServers(data.servers);
          setNotice(`Voice bitrate set to ${bitrate / 1000} kbps`);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not set the bitrate.");
        }
      },
    });
  }

  async function toggleChannelSoundboard(channel: PublicChannel) {
    const enable = channel.soundboard === false;
    try {
      const data = await apiFetch<{ servers: PublicServer[] }>(`/api/channels/${channel.id}`, {
        method: "PATCH",
        body: JSON.stringify({ soundboard: enable }),
      });
      setServers(data.servers);
      setNotice(enable ? `Soundboard on in ${channel.name}.` : `Soundboard off in ${channel.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change the soundboard.");
    }
  }

  async function editChannelRegion(channel: PublicChannel) {
    const current = channel.rtcRegion || "auto";
    showCustomPrompt({
      title: `Region Override for #${channel.name}`,
      message:
        `Select the primary voice server region for this channel.\n` +
        `• "auto" - Netherlands normally, automatically routes to Germany when 40+ people join\n` +
        `• "nl" - Netherlands (Home Server)\n` +
        `• "de" - Germany (Oracle Cloud)`,
      defaultValue: current,
      placeholder: "auto, nl, or de",
      confirmText: "Set Region",
      onConfirm: async (value) => {
        const val = (value || "").trim().toLowerCase();
        if (val !== "auto" && val !== "nl" && val !== "de") {
          setNotice("Invalid region. Choose 'auto', 'nl', or 'de'.");
          return;
        }
        try {
          const data = await apiFetch<{ servers: PublicServer[] }>(
            `/api/channels/${channel.id}`,
            { method: "PATCH", body: JSON.stringify({ rtcRegion: val }) },
          );
          setServers(data.servers);
          const label = val === "de" ? "Germany" : val === "nl" ? "Netherlands" : "Automatic";
          setNotice(`Voice region set to ${label} for #${channel.name}.`);
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Could not set region.");
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
    // Before logging out, while the request is still authenticated: this
    // device must stop getting the account's notifications.
    await unregisterNativePush();
    await disableWebPush().catch(() => undefined);
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    voice.leave();
    setUser(null);
    setSettingsOpen(false);
  }

  function openUserMenu(
    event: MouseEvent,
    member: Member,
    opts?: { dmChannelId?: string; dmPinned?: boolean },
  ) {
    event.preventDefault();
    setBotMenu(null);
    setGroupDmMenu(null);
    setUserMenu({
      member,
      x: event.clientX,
      y: event.clientY,
      dmChannelId: opts?.dmChannelId,
      dmPinned: opts?.dmPinned,
    });
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
        <div className="boot-card">
          <p>Opening Hoffle…</p>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 8, maxWidth: 360 }}>
            An open-source, self-hostable chat app: voice channels with screen sharing, servers, DMs and friends, on web and desktop. AGPL-3.0, no tracking.
          </p>
        </div>
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
    return (
      <RailServer
        key={server.id}
        server={server}
        isActive={server.id === activeServerId}
        unread={unread}
        voiceRooms={voiceRooms}
        dragging={dragServerId === server.id}
        dropMode={serverDropHint?.id === server.id ? serverDropHint.mode : null}
        dragProps={serverDragProps(server)}
        onOpen={() => {
          setActiveServerId(server.id);
          setStageChannelId(null);
          setMobileNav(false);
        }}
        onMenu={(x, y) => setRailMenu({ server, x, y })}
      />
    );
  }

  /** A folder on the rail: a mini grid when closed, its servers when open. */
  function renderRailFolder(folder: ServerFolder, folderServers: PublicServer[]) {
    return (
      <RailFolder
        key={`folder-${folder.id}`}
        folder={folder}
        folderServers={folderServers}
        open={openFolders.has(folder.id)}
        activeServerId={activeServerId}
        unread={unread}
        dropMerge={serverDropHint?.id === folder.id}
        dropProps={folderDropProps(folder)}
        onToggle={() => toggleFolderOpen(folder.id)}
        onMenu={(x, y) => setFolderMenu({ folder, x, y })}
        renderServer={renderRailServer}
      />
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
            <span className={isConnectedVoice ? "font-semibold text-[var(--accent-hi)]" : ""}>{channel.name}</span>
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
                const speakingId =
                  person.connectionId === hub.connectionId ? "self" : person.connectionId;
                return (
                  <Speaking key={person.connectionId} store={voice.speakingStore} id={speakingId}>
                    {(isSpeaking) => (
                  <div
                    className={`voice-member ${canModerate && !person.bot ? "draggable-member" : ""
                      } ${isSpeaking ? "is-speaking" : ""}`}
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
                    <div className={`relative flex items-center justify-center ${isSpeaking && !membersById.get(person.id)?.profileStyle?.ring ? "ring-2 ring-emerald-500/80 rounded-full" : ""}`}>
                      <VoiceAura
                        ring={membersById.get(person.id)?.profileStyle?.ring}
                        color={ringColor(membersById.get(person.id)?.profileStyle, person.color)}
                        speaking={isSpeaking}
                      >
                        <Avatar
                          className="tiny-avatar"
                          avatar={person.avatar}
                          avatarUrl={person.avatarUrl}
                          color={person.color}
                        />
                      </VoiceAura>
                    </div>
                    <span className={isSpeaking ? "font-medium text-[var(--ink)]" : ""}>
                      {person.connectionId === hub.connectionId
                        ? "You"
                        : <StyledName name={person.displayName} style={membersById.get(person.id)?.profileStyle} />}
                      {isSpeaking && isConnectedVoice ? " (speaking)" : ""}
                    </span>
                    <VoiceDuration
                      className="voice-member-timer"
                      joinedAt={person.joinedAt}
                      serverNow={hub.serverNow}
                    />
                    {/* One right-aligned slot so icons line up whatever the name length. */}
                    <span className="voice-member-status">
                      {isSpeaking && (
                        <Mic size={14} className="is-speaking-icon" aria-label="Speaking" />
                      )}
                      {person.muted && !person.bot && !isSpeaking && (
                        <span
                          className={`muted-pill ${person.serverMuted ? "is-server" : ""}`}
                          title={person.serverMuted ? "Muted for everyone" : "Muted"}
                        >
                          <MicOff size={14} />
                        </span>
                      )}
                      {person.deafened && !person.bot && (
                        <span className="deafened-pill" title="Deafened">
                          <HeadphoneOff size={14} />
                        </span>
                      )}
                      {person.bot && playing && (
                        <span className="speaking-bars" aria-label="Playing">
                          <AudioLines size={14} />
                        </span>
                      )}
                      {person.bot && person.deafened && (
                        <span
                          className="bot-deafened-pill"
                          title="The bot sends music but cannot hear the room"
                          aria-label="Bot deafened"
                        >
                          <HeadphoneOff size={14} />
                        </span>
                      )}
                    </span>
                  </div>
                    )}
                  </Speaking>
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
    <>
    <MatrixRain />
    <main
      className={`app-shell ${mobileNav ? "nav-open" : ""} ${threadRoot ? "has-thread" : ""} ${membersOpen && !stageChannel ? "has-members" : ""}`}
      style={{
        "--sidebar-w": `${sidebarWidth}px`,
        "--thread-w": threadRoot ? `${threadWidth}px` : "0px",
        "--members-w": membersOpen && !stageChannel ? `${membersWidth}px` : "0px",
      } as React.CSSProperties}
    >
      <ConnectionBanner connected={hub.connected} />
      <MsnOverlays
        msnTheme={msnTheme}
        soundsOpen={soundsOpen}
        setSoundsOpen={setSoundsOpen}
        hoverCard={hoverCard}
        presenceOf={presenceOf}
        user={user}
        myCustomStatus={myCustomStatus}
        msnContacts={msnContacts}
        hoverTimer={hoverTimer}
        queueHoverCard={queueHoverCard}
        setHoverCard={setHoverCard}
        openDm={openDm}
        openProfile={openProfile}
        pictureOpen={pictureOpen}
        setStockPicture={setStockPicture}
        setPictureOpen={setPictureOpen}
        setSettingsOpen={setSettingsOpen}
        todayOpen={todayOpen}
        todayData={todayData}
        whatsNew={whatsNew}
        servers={servers}
        setTodayOpen={setTodayOpen}
        setActiveServerId={setActiveServerId}
        setStageChannelId={setStageChannelId}
        setEventsOpen={setEventsOpen}
        hub={hub}
        members={members}
      />

      {/* Tapping outside the drawer on a phone closes it. */}
      <div
        className="mobile-nav-backdrop"
        onClick={() => setMobileNav(false)}
        aria-hidden="true"
      />
      <ServerRail
        inDmHome={inDmHome}
        setActiveServerId={setActiveServerId}
        setActiveChannelId={setActiveChannelId}
        visibleDms={visibleDms}
        setStageChannelId={setStageChannelId}
        setMobileNav={setMobileNav}
        dmUnreadTotal={dmUnreadTotal}
        servers={servers}
        serverFolders={serverFolders}
        renderRailServer={renderRailServer}
        renderRailFolder={renderRailFolder}
        createServer={createServer}
        activeChannelId={activeChannelId}
        unread={unread}
        voiceRooms={voiceRooms}
        presenceOf={presenceOf}
        statusOpen={statusOpen}
        myStatus={myStatus}
        myCustomStatus={myCustomStatus}
        savePresence={savePresence}
        autoIdleRef={autoIdleRef}
        setStatusOpen={setStatusOpen}
        msnTheme={msnTheme}
        shareListening={shareListening}
        setShareListening={setShareListening}
        autoReply={autoReply}
        setAutoReply={setAutoReply}
        showCustomPrompt={showCustomPrompt}
        setSoundsOpen={setSoundsOpen}
        setPictureOpen={setPictureOpen}
        setTodayOpen={setTodayOpen}
        setSettingsOpen={setSettingsOpen}
      />

      <ChannelSidebar
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        activeServer={activeServer}
        inDmHome={inDmHome}
        setServerMenuOpen={setServerMenuOpen}
        serverMenuOpen={serverMenuOpen}
        canOpenServerSettings={canOpenServerSettings}
        setServerSettingsOpen={setServerSettingsOpen}
        canCreateServerInvites={canCreateServerInvites}
        showCustomPrompt={showCustomPrompt}
        canManageServer={canManageServer}
        setServers={setServers}
        canManageChannels={canManageChannels}
        setKindMenu={setKindMenu}
        markServerRead={markServerRead}
        setNotifyLevel={setNotifyLevel}
        channelPrefs={channelPrefs}
        showCustomConfirm={showCustomConfirm}
        setActiveServerId={setActiveServerId}
        setGlobalSearchOpen={setGlobalSearchOpen}
        setActiveChannelId={setActiveChannelId}
        setStageChannelId={setStageChannelId}
        activeChannelId={activeChannelId}
        stageChannelId={stageChannelId}
        pendingFriendCount={pendingFriendCount}
        user={user}
        setGroupDialog={setGroupDialog}
        openDm={openDm}
        visibleDms={visibleDms}
        unread={unread}
        setUserMenu={setUserMenu}
        setGroupDmMenu={setGroupDmMenu}
        openUserMenu={openUserMenu}
        hub={hub}
        voiceRooms={voiceRooms}
        togglePinDm={togglePinDm}
        setDmClosed={setDmClosed}
        addCategory={addCategory}
        kindMenu={kindMenu}
        renderKindMenu={renderKindMenu}
        nextEvent={nextEvent}
        setEventsOpen={setEventsOpen}
        serverEvents={serverEvents}
        categoryDropProps={categoryDropProps}
        channelLayout={channelLayout}
        renderChannel={renderChannel}
        collapsedCats={collapsedCats}
        toggleCategory={toggleCategory}
        renameCategory={renameCategory}
        deleteCategory={deleteCategory}
        roomPlayer={roomPlayer}
        player={player}
        voice={voice}
        servers={servers}
        dmCall={dmCall}
        quickSoundboardOpen={quickSoundboardOpen}
        setQuickSoundboardOpen={setQuickSoundboardOpen}
        sidebarShareSetupOpen={sidebarShareSetupOpen}
        setSidebarShareSetupOpen={setSidebarShareSetupOpen}
        voiceSoundboardAllowed={voiceSoundboardAllowed}
        myStatus={myStatus}
        myCustomStatus={myCustomStatus}
        setStatusOpen={setStatusOpen}
        setSettingsOpen={setSettingsOpen}
        onSidebarResizeDown={onSidebarResizeDown}
      />

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
            <ChatHeader
        setMobileNav={setMobileNav}
        stageChannel={stageChannel}
        inDmHome={inDmHome}
        isSelfDm={isSelfDm}
        activeChannel={activeChannel}
        channelTitle={channelTitle}
        activeScreenShare={activeScreenShare}
        voiceParticipants={voiceParticipants}
        activeDm={activeDm}
        voice={voice}
        streamPreferenceFor={streamPreferenceFor}
        toggleStreamMute={toggleStreamMute}
        setStreamVolume={setStreamVolume}
        setStageChannelId={setStageChannelId}
        setPipDismissed={setPipDismissed}
        voiceViewMode={voiceViewMode}
        setVoiceViewMode={setVoiceViewMode}
        battlemap={battlemap}
        openBattlemap={openBattlemap}
        closeBattlemap={closeBattlemap}
        togglePinDm={togglePinDm}
        setGroupDialog={setGroupDialog}
        renameGroupDm={renameGroupDm}
        leaveGroupDm={leaveGroupDm}
        activeChannelId={activeChannelId}
        dmCall={dmCall}
        voiceRooms={voiceRooms}
        setDmCall={setDmCall}
        startDmCall={startDmCall}
        setGlobalSearchOpen={setGlobalSearchOpen}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        mentionsOpen={mentionsOpen}
        unreadMentionTotal={unreadMentionTotal}
        setMentionsOpen={setMentionsOpen}
        pinsOpen={pinsOpen}
        setPinsOpen={setPinsOpen}
        savedOpen={savedOpen}
        setSavedOpen={setSavedOpen}
        loadSaved={loadSaved}
        msnTheme={msnTheme}
        setSettingsOpen={setSettingsOpen}
        membersOpen={membersOpen}
        setMembersOpen={setMembersOpen}
      />

            {stageChannel ? (
              <VoiceStage
                channelName={stageChannel.name}
                participants={voiceParticipants}
                connectionId={hub.connectionId}
                serverNow={hub.serverNow}
                voice={voice}
                captions={voice.channelId === stageChannel.id ? captions : undefined}
                livingRoom={voice.channelId === stageChannel.id ? livingRoom : undefined}
                nowPlaying={voice.channelId === stageChannel.id ? roomPlayer : null}
                joined={voice.channelId === stageChannel.id}
                onJoin={() => void openVoiceChannel(stageChannel)}
                onExit={() => setStageChannelId(null)}
                onPopout={() => {
                  setStageChannelId(null);
                  setPipDismissed(false);
                }}
                hideTopbar={true}
                viewMode={voiceViewMode}
                onViewModeChange={setVoiceViewMode}
                onFocusedChange={setFocusedStreamInfo}
                streamPreferenceFor={streamPreferenceFor}
                onSetStreamVolume={setStreamVolume}
                onToggleStreamMute={toggleStreamMute}
                serverId={stageChannel.serverId}
                canManageSounds={canManageChannels}
                canProject={canManageChannels}
                // A stage has an audience, so the view splits the room into
                // audible and listening, and offers the listening half a hand.
                stageMode={channelKindInfo(stageChannel.kind).kind === "stage"}
                soundboardEnabled={stageChannel.soundboard !== false}
                // Hosts host: moving seats on and off the stage is a moderation
                // action, and the hub rechecks the same permission.
                canManageStage={hasPermission(myPermissions, Permission.MUTE_MEMBERS)}
                userId={user.id}
                userName={user.displayName}
                activity={roomActivity}
                onActivity={setRoomActivity}
                diceRoll={diceRoll}
                onDiceRollDone={() => setDiceRoll(null)}
                onRollCommand={(command) => void runCommand(command)}
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
                    <LiveRecordingDirector
                      channelId={stageChannel.id}
                      recording={hub.recordings[stageChannel.id] || null}
                      participants={voiceParticipants}
                      currentUserId={user.id}
                      canControl={canRecordSessions}
                      speakingStore={voice.speakingStore}
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
                <SearchPanel
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        channelTitle={channelTitle}
        runSearch={runSearch}
        setSearchOpen={setSearchOpen}
        setSearchQuery={setSearchQuery}
        setSearchResults={setSearchResults}
        searchResults={searchResults}
        jumpToMessage={jumpToMessage}
      />

                <SavedPanel
        savedOpen={savedOpen}
        setSavedOpen={setSavedOpen}
        savedList={savedList}
        setActiveServerId={setActiveServerId}
        jumpToMessage={jumpToMessage}
        toggleSaved={toggleSaved}
      />
                <MentionsPanel
        mentionsOpen={mentionsOpen}
        setMentionsOpen={setMentionsOpen}
        mentionsTab={mentionsTab}
        setMentionsTab={setMentionsTab}
        unreadMentionTotal={unreadMentionTotal}
        mentionInbox={mentionInbox}
        openMention={openMention}
      />

                <PinsPanel
        pinsOpen={pinsOpen}
        channelTitle={channelTitle}
        setPinsOpen={setPinsOpen}
        pins={pins}
        activeChannelId={activeChannelId}
        jumpToMessage={jumpToMessage}
        canPin={canPin}
        togglePin={togglePin}
      />

                <DmCallView
        inDmHome={inDmHome}
        activeChannelId={activeChannelId}
        dmCallView={dmCallView}
        dmCall={dmCall}
        callDuration={callDuration}
        user={user}
        voice={voice}
        setStageChannelId={setStageChannelId}
        endDmCall={endDmCall}
        incomingDmCall={incomingDmCall}
        acceptIncomingCall={acceptIncomingCall}
        activeDm={activeDm}
        setDmCall={setDmCall}
      />

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
                <MessageList
        messagesScrollRef={messagesScrollRef}
        handleMessagesScroll={handleMessagesScroll}
        activeChannelInfo={activeChannelInfo}
        inDmHome={inDmHome}
        unreadBarVisible={unreadBarVisible}
        unreadMarker={unreadMarker}
        activeChannelId={activeChannelId}
        jumpToFirstUnread={jumpToFirstUnread}
        setUnreadBarVisible={setUnreadBarVisible}
        msnTheme={msnTheme}
        hasOlder={hasOlder}
        loadOlder={loadOlder}
        isSelfDm={isSelfDm}
        activeDm={activeDm}
        channelTitle={channelTitle}
        activeChannel={activeChannel}
        messages={messages}
        membersById={membersById}
        openUserMenu={openUserMenu}
        jumpToMessage={jumpToMessage}
        setPinsOpen={setPinsOpen}
        user={user}
        canModerate={canModerate}
        blockedUserIds={blockedUserIds}
        expandedBlockedMessages={expandedBlockedMessages}
        setExpandedBlockedMessages={setExpandedBlockedMessages}
        openActionsId={openActionsId}
        reactionPicker={reactionPicker}
        ttsSpeakingId={ttsSpeakingId}
        handleMessageTouchStart={handleMessageTouchStart}
        handleMessageTouchMove={handleMessageTouchMove}
        handleMessageTouchEnd={handleMessageTouchEnd}
        longPressTriggeredRef={longPressTriggeredRef}
        touchInput={touchInput}
        setOpenActionsId={setOpenActionsId}
        openBotMenu={openBotMenu}
        openProfile={openProfile}
        roleColorFor={roleColorFor}
        activeServer={activeServer}
        setEditHistoryId={setEditHistoryId}
        voice={voice}
        player={player}
        hub={hub}
        openThread={openThread}
        setNotice={setNotice}
        openProfileByHandle={openProfileByHandle}
        setLightboxImage={setLightboxImage}
        emojiMap={emojiMap}
        runCommand={runCommand}
        runMusicUiCommand={runMusicUiCommand}
        startGame={startGame}
        pollCounts={pollCounts}
        pollVoters={pollVoters}
        editingId={editingId}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        setEditingId={setEditingId}
        saveEdit={saveEdit}
        setPdfViewer={setPdfViewer}
        openMentionedChannel={openMentionedChannel}
        pressBotComponent={pressBotComponent}
        applyTheme={applyTheme}
        resolvedInvites={resolvedInvites}
        servers={servers}
        setActiveServerId={setActiveServerId}
        joinServerDirect={joinServerDirect}
        botStreaming={botStreaming}
        voiceChannels={voiceChannels}
        prefFor={prefFor}
        saveVoicePref={saveVoicePref}
        setLightbox={setLightbox}
        reactionViewer={reactionViewer}
        toggleReaction={toggleReaction}
        handleOpenReactionViewer={handleOpenReactionViewer}
        handleOpenReactionPicker={handleOpenReactionPicker}
        quickVoteId={quickVoteId}
        quickReactions={quickReactions}
        removeQuickReaction={removeQuickReaction}
        emojis={emojis}
        hiddenServerEmojiIds={hiddenServerEmojiIds}
        hideServerEmoji={hideServerEmoji}
        shiftPressed={shiftPressed}
        mobileActionsMoreId={mobileActionsMoreId}
        setReplyTarget={setReplyTarget}
        composerRef={composerRef}
        setMobileActionsMoreId={setMobileActionsMoreId}
        savedIds={savedIds}
        toggleSaved={toggleSaved}
        setForwardTarget={setForwardTarget}
        setQuickVoteId={setQuickVoteId}
        beginEdit={beginEdit}
        canPin={canPin}
        togglePin={togglePin}
        deleteMessage={deleteMessage}
        showCustomConfirm={showCustomConfirm}
        messageEndRef={messageEndRef}
      />

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

                <Composer
        sendMessage={sendMessage}
        activeSlashCommand={activeSlashCommand}
        draft={draft}
        slashActive={slashActive}
        slashIndex={slashIndex}
        setSlashIndex={setSlashIndex}
        pickCommand={pickCommand}
        slashMatches={slashMatches}
        voice={voice}
        mentionActive={mentionActive}
        tagQuery={tagQuery}
        mentionMatches={mentionMatches}
        pickMention={pickMention}
        roleColorFor={roleColorFor}
        emojiActive={emojiActive}
        emojiShortcodeMatch={emojiShortcodeMatch}
        emojiMatches={emojiMatches}
        emojiIndex={emojiIndex}
        setEmojiIndex={setEmojiIndex}
        pickEmojiShortcode={pickEmojiShortcode}
        gifOpen={gifOpen}
        setGifOpen={setGifOpen}
        inDmHome={inDmHome}
        activeServerId={activeServerId}
        canManageChannels={canManageChannels}
        sendText={sendText}
        setDraft={setDraft}
        composerRef={composerRef}
        loadEmojis={loadEmojis}
        gamesOpen={gamesOpen}
        msnTheme={msnTheme}
        setGamesOpen={setGamesOpen}
        startGame={startGame}
        setStageChannelId={setStageChannelId}
        formatOpen={formatOpen}
        wrapSelection={wrapSelection}
        setFormatOpen={setFormatOpen}
        emojiOpen={emojiOpen}
        setEmojiOpen={setEmojiOpen}
        replyTarget={replyTarget}
        setReplyTarget={setReplyTarget}
        pendingFiles={pendingFiles}
        setPendingFiles={setPendingFiles}
        myTimeoutUntil={myTimeoutUntil}
        isDmBlocked={isDmBlocked}
        activeDm={activeDm}
        handleUnblockUser={handleUnblockUser}
        composerBlocked={composerBlocked}
        isSelfDm={isSelfDm}
        hub={hub}
        messageFont={messageFont}
        setMessageFont={setMessageFont}
        sendWink={sendWink}
        personalEmoticons={personalEmoticons}
        voiceRecorder={voiceRecorder}
        acceptAttachment={acceptAttachment}
        activeChannelId={activeChannelId}
        sendNudge={sendNudge}
        nudgeCooling={nudgeCooling}
        fileRef={fileRef}
        chooseAttachment={chooseAttachment}
        setComposerCaret={setComposerCaret}
        noteTyping={noteTyping}
        onComposerKeyDown={onComposerKeyDown}
        activeChannelInfo={activeChannelInfo}
        channelTitle={channelTitle}
        mobileComposerMenuOpen={mobileComposerMenuOpen}
        setMobileComposerMenuOpen={setMobileComposerMenuOpen}
        setPollDialogOpen={setPollDialogOpen}
        typingNames={typingNames}
        messages={messages}
        user={user}
      />
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

      <ThreadPanel
        threadRoot={threadRoot}
        threadWidth={threadWidth}
        onThreadResizeDown={onThreadResizeDown}
        activeChannel={activeChannel}
        setThreadRoot={setThreadRoot}
        membersById={membersById}
        roleColorFor={roleColorFor}
        user={user}
        openProfileByHandle={openProfileByHandle}
        setLightboxImage={setLightboxImage}
        emojiMap={emojiMap}
        activeServer={activeServer}
        openMentionedChannel={openMentionedChannel}
        setLightbox={setLightbox}
        setPdfViewer={setPdfViewer}
        resolvedInvites={resolvedInvites}
        servers={servers}
        setActiveServerId={setActiveServerId}
        joinServerDirect={joinServerDirect}
        threadMessages={threadMessages}
        applyTheme={applyTheme}
        threadBottomRef={threadBottomRef}
        sendThreadReply={sendThreadReply}
        threadDraft={threadDraft}
        setThreadDraft={setThreadDraft}
      />

      <MemberPanel
        membersOpen={membersOpen}
        inDmHome={inDmHome}
        activeChannelId={activeChannelId}
        voice={voice}
        collapsedGroups={collapsedGroups}
        onMembersResizeDown={onMembersResizeDown}
        msnTheme={msnTheme}
        setCollapsedGroups={setCollapsedGroups}
        voiceParticipants={voiceParticipants}
        currentVoiceChannel={currentVoiceChannel}
        sidebarShareSetupOpen={sidebarShareSetupOpen}
        setSidebarShareSetupOpen={setSidebarShareSetupOpen}
        stageChannelId={stageChannelId}
        setStageChannelId={setStageChannelId}
        memberFilterQuery={memberFilterQuery}
        setMemberFilterQuery={setMemberFilterQuery}
        userMenuHandlers={userMenuHandlers}
        openProfile={openProfile}
        queueHoverCard={queueHoverCard}
        roleColorFor={roleColorFor}
        presenceOf={presenceOf}
        user={user}
        myCustomStatus={myCustomStatus}
        prefFor={prefFor}
        hub={hub}
        msnContacts={msnContacts}
        onlineMembers={onlineMembers}
        offlineMembers={offlineMembers}
        renameContactGroup={renameContactGroup}
        deleteContactGroup={deleteContactGroup}
        createContactGroup={createContactGroup}
        whatsNew={whatsNew}
        whatsNewPeople={whatsNewPeople}
        setGlobalSearchOpen={setGlobalSearchOpen}
      />

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
          livingRoom={livingRoom.heard}
          tv={livingRoom.tv}
          spatialOff={livingRoom.spatialOff}
          roomShape={livingRoom.open && livingRoom.settings.spatial ? livingRoom.theme : "table"}
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
          streamPreferenceFor={(streamId, userId) => {
            const pref = streamPreferenceFor(streamId, userId);
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

      <UserMenuLayer
        userMenu={userMenu}
        user={user}
        msnTheme={msnTheme}
        msnContacts={msnContacts}
        placeContact={placeContact}
        setUserMenu={setUserMenu}
        createContactGroup={createContactGroup}
        toggleSignInAlert={toggleSignInAlert}
        setMembers={setMembers}
        prefFor={prefFor}
        hub={hub}
        blockedUserIds={blockedUserIds}
        handleBlockUser={handleBlockUser}
        handleUnblockUser={handleUnblockUser}
        openDm={openDm}
        saveVoicePref={saveVoicePref}
        togglePinDm={togglePinDm}
        canModerate={canModerate}
        canManageServer={canManageServer}
        inDmHome={inDmHome}
        activeDm={activeDm}
        removeFromGroupDm={removeFromGroupDm}
        moderateMember={moderateMember}
        bannedIds={bannedIds}
        voiceChannels={voiceChannels}
        voiceRooms={voiceRooms}
        userMenuVoiceJoinedAt={userMenuVoiceJoinedAt}
        moveMember={moveMember}
        membersById={membersById}
        activeServer={activeServer}
        myPermissions={myPermissions}
        timeoutMember={timeoutMember}
        canManageNicknames={canManageNicknames}
        editNickname={editNickname}
      />

      {groupDmMenu && (
        <GroupDmContextMenu
          target={groupDmMenu}
          onClose={() => setGroupDmMenu(null)}
          onTogglePin={() => {
            void togglePinDm(groupDmMenu.dm.channelId, !groupDmMenu.dm.pinned);
            setGroupDmMenu(null);
          }}
          onRename={() => {
            renameGroupDm(groupDmMenu.dm);
            setGroupDmMenu(null);
          }}
          onAddMembers={() => {
            setGroupDialog({ mode: "add", channelId: groupDmMenu.dm.channelId });
            setGroupDmMenu(null);
          }}
          onLeave={() => {
            leaveGroupDm(groupDmMenu.dm);
            setGroupDmMenu(null);
          }}
          onCloseDm={() => {
            void setDmClosed(groupDmMenu.dm.channelId, true);
            setGroupDmMenu(null);
          }}
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

      <RailMenuLayer
        railMenu={railMenu}
        setRailMenu={setRailMenu}
        unread={unread}
        markServerRead={markServerRead}
        folderIdOf={folderIdOf}
        saveServerFolders={saveServerFolders}
        serverFolders={serverFolders}
        channelPrefs={channelPrefs}
        setNotifyLevel={setNotifyLevel}
      />

      <FolderMenuLayer
        folderMenu={folderMenu}
        setFolderMenu={setFolderMenu}
        servers={servers}
        markServerRead={markServerRead}
        showCustomPrompt={showCustomPrompt}
        saveServerFolders={saveServerFolders}
        serverFolders={serverFolders}
      />

      <ChannelMenuLayer
        channelMenu={channelMenu}
        setChannelMenu={setChannelMenu}
        channelPrefs={channelPrefs}
        setNotifyLevel={setNotifyLevel}
        canManageChannels={canManageChannels}
        renameChannel={renameChannel}
        editChannelTopic={editChannelTopic}
        editChannelSlowmode={editChannelSlowmode}
        editChannelBitrate={editChannelBitrate}
        toggleChannelSoundboard={toggleChannelSoundboard}
        editChannelRegion={editChannelRegion}
        changeChannelKind={changeChannelKind}
        deleteChannel={deleteChannel}
      />

      <ImageLightbox lightbox={lightbox} setLightbox={setLightbox} />

      {pdfViewer && (
        <PdfViewer
          url={pdfViewer.url}
          name={pdfViewer.name}
          onClose={() => setPdfViewer(null)}
          onSendCopy={activeChannelId ? sendFileCopy : undefined}
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

      {!user.email && !user.emailPromptSkipped && <EmailPrompt onUser={setUser} />}

      {settingsOpen && (
        <SettingsDialog
          user={user}
          theme={theme}
          onTheme={applyTheme}
          onShareThemeToChat={handleShareThemeToChat}
          onUser={setUser}
          onClose={() => setSettingsOpen(false)}
          onOpenDm={(targetId) => {
            setSettingsOpen(false);
            void openDm(targetId);
          }}
          onOpenTutorial={() => {
            setSettingsOpen(false);
            setTutorial({ page: 0, folded: false });
          }}
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
          screenShareAudio={voice.screenShareAudio}
          onScreenShareAudioChange={voice.setScreenShareAudio}
          server={inDmHome ? null : activeServer}
          members={members}
          canManageServer={canManageServer}
        />
      )}

      {activeServer && !inDmHome && user && activeServer.ownerId !== user.id && !welcomeChecked.has(activeServer.id) && (
        <WelcomeGate
          key={activeServer.id}
          serverId={activeServer.id}
          serverName={activeServer.name}
          onDone={() => markWelcomeChecked(activeServer.id)}
          onLeave={() => {
            markWelcomeChecked(activeServer.id);
            void leaveServer(activeServer.id);
          }}
        />
      )}

      {serverSettingsOpen && activeServer && canOpenServerSettings && (
        <ServerSettingsDialog
          server={activeServer}
          members={members}
          onlineUserIds={hub.online}
          canManageServer={canManageServer}
          canManageExpressions={
            hasPermission(myPermissions, Permission.MANAGE_EMOJIS) ||
            hasPermission(myPermissions, Permission.MANAGE_CHANNELS)
          }
          canManageRoles={canManageRoles}
          canManageChannels={canManageChannels}
          canModerate={canModerate}
          canKickMembers={canKickMembers}
          canBanMembers={canBanMembers}
          canViewAuditLog={canViewAuditLog}
          canCreateInvites={canCreateServerInvites}
          onClose={() => setServerSettingsOpen(false)}
          onServerUpdated={() => void loadServers().catch(() => undefined)}
          onServerDeleted={() => {
            const deleted = activeServer.id;
            void loadServers()
              .then((list) => setActiveServerId(list.find((server) => server.id !== deleted)?.id || DM_HOME))
              .catch(() => undefined);
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
            dialogDismissRef.current = null;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            callback?.(val);
          }}
          onCancel={() => {
            const cancel = dialogCancel;
            dialogDismissRef.current = null;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            cancel?.();
          }}
          onDismiss={() => {
            const dismissed = dialogDismissRef.current;
            dialogDismissRef.current = null;
            setDialogOptions(null);
            setDialogCallback(null);
            setDialogCancel(null);
            dismissed?.();
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
            // By the channel itself: the switcher calls a stage "text".
            const found = servers
              .flatMap((server) => server.channels)
              .find((channel) => channel.id === target.id);
            const voiceTarget =
              found && channelKindInfo(found.kind).appearsAsVoice ? found : undefined;
            if (voiceTarget) {
              // The same path as clicking the room: timeout check, stage mute.
              openVoiceChannel(voiceTarget);
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

      {tutorial && !tutorial.folded && (
        <WelcomeTutorial
          page={tutorial.page}
          onPage={(page) => setTutorial({ page, folded: false })}
          onClose={closeTutorial}
          onTry={() => setTutorial((current) => current && { ...current, folded: true })}
          actions={{
            activeThemeId: getActiveThemeId(),
            onTheme: (next) => applyTheme(next),
            openSwitcher: () => setQuickSwitcherOpen(true),
            joinVoice: voiceChannels[0]
              ? { name: voiceChannels[0].name, run: () => openVoiceChannel(voiceChannels[0]) }
              : null,
            openFormat: () => setFormatOpen(true),
            openPoll: () => setPollDialogOpen(true),
            rollDice: () => setDiceRoll(practiceRoll({ id: user.id, displayName: user.displayName })),
            openGames: () => setGamesOpen(true),
            openProfile: () => {
              requestProfileEditor();
              setSettingsOpen(true);
            },
            openShortcuts: () => setShortcutsOpen(true),
          }}
        />
      )}
      {tutorial?.folded && (
        <TutorialPill
          page={tutorial.page}
          onResume={() => setTutorial((current) => current && { ...current, folded: false })}
          onClose={closeTutorial}
        />
      )}

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

      <ProfileCardLayer
        profileCardTarget={profileCardTarget}
        inDmHome={inDmHome}
        activeServer={activeServer}
        activeServerId={activeServerId}
        setProfileCardTarget={setProfileCardTarget}
        canManageServer={canManageServer}
        canManageRoles={canManageRoles}
        loadMembers={loadMembers}
        user={user}
        presenceOf={presenceOf}
        blockedUserIds={blockedUserIds}
        setSettingsOpen={setSettingsOpen}
        friendUserIds={friendUserIds}
        incomingFriendUserIds={incomingFriendUserIds}
        outgoingFriendUserIds={outgoingFriendUserIds}
        handleAddFriend={handleAddFriend}
        handleRemoveFriend={handleRemoveFriend}
        handleAcceptFriend={handleAcceptFriend}
        handleBlockUser={handleBlockUser}
        handleUnblockUser={handleUnblockUser}
        openDm={openDm}
        setDraft={setDraft}
        composerRef={composerRef}
      />

      <IncomingDmCall incomingDmCall={incomingDmCall} declineIncomingCall={declineIncomingCall} acceptIncomingCall={acceptIncomingCall} />

      <MarkdownGuideModal
        markdownModalOpen={markdownModalOpen}
        setMarkdownModalOpen={setMarkdownModalOpen}
        setDraft={setDraft}
        composerRef={composerRef}
      />

      <BlahajBuddy onRollCommand={(command) => void runCommand(command)} />
      <ToastContainer />
      <DeviceSwitchPrompt
        inCall={Boolean(voice.channelId)}
        activeMicrophone={voice.activeMicrophone}
        onMicrophoneChange={() => void voice.switchMicrophone()}
      />

      <ReactionPickerLayer
        reactionPicker={reactionPicker}
        setReactionPicker={setReactionPicker}
        inDmHome={inDmHome}
        activeServerId={activeServerId}
        canManageChannels={canManageChannels}
        addQuickReaction={addQuickReaction}
        toggleReaction={toggleReaction}
      />

      <ForwardMessageDialog
        target={forwardTarget}
        servers={servers}
        dms={dms}
        currentChannelId={activeChannelId}
        onClose={() => setForwardTarget(null)}
        onForward={handleForwardMessage}
      />

      <ReactionViewerLayer
        reactionViewer={reactionViewer}
        setReactionViewer={setReactionViewer}
        messages={messages}
        threadMessages={threadMessages}
        threadRoot={threadRoot}
        emojiMap={emojiMap}
        membersById={membersById}
        openProfile={openProfile}
        user={user}
      />

      {/* Floating Movable Screen Share Preview (Picture-in-Picture) */}
      <FloatingStreamPreview
        floatingStream={floatingStream}
        pipDismissed={pipDismissed}
        stageChannelId={stageChannelId}
        voice={voice}
        servers={servers}
        voiceParticipants={voiceParticipants}
        streamPreferenceFor={streamPreferenceFor}
        setStreamVolume={setStreamVolume}
        toggleStreamMute={toggleStreamMute}
        activeServerId={activeServerId}
        setActiveServerId={setActiveServerId}
        setStageChannelId={setStageChannelId}
        setPipDismissed={setPipDismissed}
      />
    </main>
    </>
  );
}


