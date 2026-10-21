import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { readStatusExpiresAt, writeStatusExpiresAt } from "../../lib/status-clear";
import type { DiceRollEvent, PlayerState } from "@/lib/protocol";
import { canShowVoiceBubble, onNativeVoiceAction, requestVoiceBubblePermission, syncNativeVoice } from "../../lib/native-voice";
import { registerNativePush } from "../../lib/native-push";
import { useMobileShell } from "../use-mobile-shell";
import { shouldShowMsnToday } from "../../components/msn-today";
import { stripTextStyle } from "@/lib/text-style";
import type { RoomActivity } from "@/lib/activities";
import { channelKindInfo } from "@/lib/channel-kinds";
import { type Member, type PresenceStatus } from "@/lib/users";
import { EMAIL_PROMPT_AFTER_KEY, FIRST_RUN_KEY, type FirstRun } from "../../components/welcome-tutorial";
import { type MentionEntry } from "../../lib/chat/types";
import { DM_HOME } from "../../lib/chat/constants";
import { hasLiveVideo } from "../../components/voice-stage/tiles";
import { awaitingScreen, subscribeTuneIn, tuneInVersion, watchingParty } from "../../lib/tune-in";
import { useLiveCaptions } from "../use-live-captions";
import { useLivingRoom } from "../use-living-room";
import { usePlayer } from "../use-player";
import { useVoice } from "../use-voice";
import { apiFetch } from "../../lib/client";
import { comboToAccelerator } from "../../lib/hotkeys";
import { findCommand } from "../../lib/commands";
import { useActivityDetector } from "../use-activity-detector";
import { updateAppBadge } from "../../lib/chat/app-badge";
import { installThemeFx } from "../../lib/theme-fx";
import type { useShellRealtime } from "./use-shell-realtime";

/** ChatShell, part 4 of 9. Voice and presence: the voice call, captions, living room, streams, typing, hotkeys, app badge, the Today card and the music player. */
export function useShellVoice(s: ReturnType<typeof useShellRealtime>) {
  const {
    activeChannelId, activeChannelRef, activeServerId, autoIdleRef, canManageServer,
    captionReceiveRef, channelLayout, channelServer, dms, draft, emojiOpen, features,
    focusedStreamInfo, forcedMuteRef, forcedMutesRef, formatOpen, gamesOpen, gifOpen, hub,
    inDmHome, kindMenu, lastDiceRollSeedRef, lastTypingSentRef, lightbox, members, membersById,
    membersOpen, mentionsOpen, mobileActionsMoreId, mobileComposerMenuOpen, mobileNav, msnTheme,
    myCustomStatus, myStatus, pinsOpen, prefFor, quickSoundboardOpen, savedOpen, serverMenuOpen,
    servers, setActiveChannelId, setActiveServerId, setBannedIds, setDiceRoll, setEmojiOpen,
    setFormatOpen, setGamesOpen, setGifOpen, setGlobalSearchOpen, setKindMenu, setLightbox,
    setMembers, setMembersOpen, setMentionInbox, setMentionsOpen, setMobileActionsMoreId,
    setMobileComposerMenuOpen, setMobileNav, setMyCustomStatus, setMyStatus, setNotice,
    setPinsOpen, setPipDismissed, setQuickSoundboardOpen, setRoomActivity, setSavedOpen,
    setServerMenuOpen, setShiftPressed, setStageChannelId, setStatusOpen, setTyping,
    showCustomConfirm, stageChannelId, statusOpen, typing, unread, user, userMenu, visibleDms,
    voiceChannelRef, voiceChannels, voiceEvictedRef, voiceMoveRef, voiceSignalRef,
    voiceStopSpeakingRef, voiceWhisperRef,
  } = s;

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
  voiceWhisperRef.current = voice.handleWhisper;
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

  // Real viewer counts: tell the hub whose screen shares this tab is receiving
  // (tuned in, not hidden) and whether a player is showing the watch party.
  const tuneVersion = useSyncExternalStore(subscribeTuneIn, tuneInVersion, () => 0);
  const watchingKey = useMemo(() => {
    if (!voice.channelId) return "";
    const screens = new Set<string>();
    for (const remote of voice.remoteStreams) {
      if (!hasLiveVideo(remote.stream)) continue;
      const person = voiceParticipants.find((p) => p.connectionId === remote.connectionId);
      const isScreen = remote.kind ? remote.kind === "screen" : person?.screenStreamId === remote.stream.id;
      if (!isScreen || voice.hiddenVideo[remote.connectionId]?.screen) continue;
      if (awaitingScreen(remote.connectionId, remote.stream.id)) continue;
      screens.add(remote.connectionId);
    }
    return JSON.stringify({ screens: [...screens].sort(), party: watchingParty() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.channelId, voice.remoteStreams, voice.hiddenVideo, voiceParticipants, tuneVersion]);
  useEffect(() => {
    if (!watchingKey || !hub.connected) return;
    const { screens, party } = JSON.parse(watchingKey) as { screens: string[]; party: boolean };
    hub.send({ t: "watching", screens, party });
    // hub.session: a reconnected hub has forgotten, so say it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchingKey, hub.connected, hub.session]);

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
    clearAfterMs?: number | null;
  }) {
    if (patch.status) setMyStatus(patch.status);
    if (patch.customStatus !== undefined) setMyCustomStatus(patch.customStatus);
    const saved = await apiFetch<{ customStatusExpiresAt?: number | null }>("/api/settings/presence", {
      method: "POST",
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (saved && "customStatusExpiresAt" in saved) {
      setStatusExpiresAt(saved.customStatusExpiresAt ?? null);
      writeStatusExpiresAt(saved.customStatusExpiresAt ?? null);
    }
  }

  // The server clears an expired status and tells everyone else; this tab
  // clears its own copy at the same moment.
  const [statusExpiresAt, setStatusExpiresAt] = useState<number | null>(() => readStatusExpiresAt());
  useEffect(() => {
    if (!statusExpiresAt || !myCustomStatus) return;
    const clear = () => {
      setMyCustomStatus(null);
      setStatusExpiresAt(null);
      writeStatusExpiresAt(null);
    };
    const wait = statusExpiresAt - Date.now();
    if (wait <= 0) {
      clear();
      return;
    }
    // setTimeout tops out near 24.8 days; a status lasts a week at most.
    const timer = window.setTimeout(clear, wait);
    return () => window.clearTimeout(timer);
  }, [statusExpiresAt, myCustomStatus, setMyCustomStatus]);

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
  const [directoryOpen, setDirectoryOpen] = useState(false);
  /** The add-an-email prompt waits a day after signup, so it isn't part of the first visits. */
  const [holdEmailPrompt, setHoldEmailPrompt] = useState(() => {
    try {
      return Number(window.localStorage.getItem(EMAIL_PROMPT_AFTER_KEY) || 0) > Date.now();
    } catch {
      return false;
    }
  });
  /** Set from the signup note while the first tutorial is open; read when it closes. */
  const firstRunRef = useRef<(FirstRun & { pendingEmail: string | null }) | null>(null);
  // Right after signing up (the sign-in screen leaves a note, see FIRST_RUN_KEY),
  // the tutorial opens by itself. What comes after waits for it to close.
  useEffect(() => {
    if (!user) return;
    let note: FirstRun | null = null;
    try {
      const raw = window.localStorage.getItem(FIRST_RUN_KEY);
      window.localStorage.removeItem(FIRST_RUN_KEY);
      if (raw) note = JSON.parse(raw) as FirstRun;
    } catch {
      // Storage blocked or an unreadable note: no first-run steps.
    }
    if (!note) return;
    setHoldEmailPrompt(true);
    try {
      window.localStorage.setItem(EMAIL_PROMPT_AFTER_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {
      // Held for this visit only.
    }
    const firstRun = { invite: Boolean(note.invite), joined: note.joined || null, pendingEmail: null as string | null };
    firstRunRef.current = firstRun;
    void apiFetch<{ pending: string | null }>("/api/settings/email")
      .then(({ pending }) => {
        firstRun.pendingEmail = pending;
      })
      .catch(() => undefined);
    setTutorial({ page: 0, folded: false });
  }, [user?.id]);
  // Closing the first tutorial: one line on where things are (the server every
  // account joins and how to leave it, a mailed code), and the directory if
  // the account is in no server and no invite is bringing it into one.
  const closeTutorial = useCallback(() => {
    setTutorial(null);
    const firstRun = firstRunRef.current;
    firstRunRef.current = null;
    if (!firstRun) return;
    const lines = [
      firstRun.joined ? `You're in ${firstRun.joined}. Leave it any time from the ••• menu next to its name.` : "",
      firstRun.pendingEmail ? `We mailed a code to ${firstRun.pendingEmail}; enter it under Settings → Account whenever you like.` : "",
    ].filter(Boolean);
    if (lines.length) setNotice(lines.join(" "));
    if (!firstRun.invite && !firstRun.joined) {
      void apiFetch<{ servers: unknown[] }>("/api/servers")
        .then(({ servers }) => {
          if (!servers.length) setDirectoryOpen(true);
        })
        .catch(() => undefined);
    }
  }, []);
  const [pollDialogOpen, setPollDialogOpen] = useState(false);

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

  const runCommandRef = useRef<(raw: string) => Promise<void>>(async () => undefined);

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

  return {
    ...s,
    roomBitrates, isDevUser, voice, captions, activeVoiceChannel, nativeInVoiceRef, signedInId,
    currentRoom, mySeat, voiceSoundboardAllowed, voiceChannelName, nativeVoiceActionsRef,
    voiceRooms, voiceParticipants, livingRoom, floatingStream, activeScreenShare,
    userMenuVoiceJoinedAt, presenceOf, savePresence, typingNames, noteTyping, quickSwitcherOpen,
    setQuickSwitcherOpen, shortcutsOpen, setShortcutsOpen, tutorial, setTutorial, directoryOpen,
    setDirectoryOpen, holdEmailPrompt, closeTutorial, pollDialogOpen, setPollDialogOpen, activeSlashCommand,
    voiceHotkeysRef, runCommandRef, unreadMentionTotal, badgeDmCount, badgeDot, todayOpen,
    setTodayOpen, todayCheckedRef, todayData, roomPlayer, shareListening, setShareListening,
    statusBeforeMusic, listeningTo, botStreaming, musicBotPref, player,
  };
}
