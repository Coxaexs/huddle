import { useCallback, useEffect, useMemo, useRef } from "react";
import { flashTitle, playMessageChime, playNudge, playWink } from "../../components/msn-chrome";
import { stripTextStyle } from "@/lib/text-style";
import type { RoomActivity } from "@/lib/activities";
import { announceUnlocked, SHOWCASE_CHANGED_EVENT } from "../../lib/achievement-client";
import { type Message } from "../../lib/chat/types";
import { notifyLevel } from "../../lib/chat/format";
import { applyReaction } from "../../lib/chat/reactions";
import { showNotification, playSound } from "../../lib/chat/browser";
import { clampTtsVoice, stopTtsPlayback, speakMessage, ttsPlaybackEnabled } from "../../lib/tts/client";
import { useHub } from "../use-hub";
import { type LiveCaptions } from "../use-live-captions";
import { apiFetch } from "../../lib/client";
import type { useShellSession } from "./use-shell-session";

/** ChatShell, part 3 of 9. Realtime: incoming messages, whispers, debounced structure/member reloads and the hub socket with its event handlers. */
export function useShellRealtime(s: ReturnType<typeof useShellSession>) {
  const {
    activeChannelRef, activeServerRef, autoReplyRef, blockedUserIdsRef, channelPrefs,
    channelServerRef, detachedRef, dmChannelIdsRef, dms, emitVoiceChat, lastDiceRollSeedRef,
    loadDms, loadEmojis, loadMembers, loadServers, members, membersById, msnSoundsRef, msnThemeRef,
    nearBottomRef, onBattlemapSocket, servers, setDiceRoll, setDms, setEventsRefresh, setHasOlder,
    setMembers, setMessages, setNotice, setPins, setPollCounts, setPollVoters, setRoomActivity,
    setThreadMessages, setTtsSpeakingId, setTyping, setUnread, setUnseenCount, setUser,
    stageChannelId, threadRoot, user, voiceStopSpeakingRef,
  } = s;

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
      // A voice room's chat open beside its stage is being read, so it is not unread.
      if (emitVoiceChat(channelId, { type: "message", message: incoming }) && channelId !== activeChannelRef.current) {
        return;
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
        } else if (level === "all") {
          showNotification(
            incoming.author,
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
        // Our own message, back from the hub before the send call returned:
        // it takes the place of the copy shown while it was on its way.
        if (user && incoming.userId === user.id) {
          const waiting = current.findIndex((existing) => existing.pending && existing.text === incoming.text);
          if (waiting >= 0) return current.map((existing, index) => (index === waiting ? incoming : existing));
        }
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
    [loadDms, user, emitVoiceChat],
  );

  /** Whom each text whisper we sent was to, for our own copy of the line. */
  const whisperNamesRef = useRef(new Map<string, string>());
  /** A text whisper arrives only as a live event, so it is shown here and not kept. */
  const handleTextWhisper = useCallback(
    (whisper: {
      channelId: string; id: string; fromUserId: string; fromName: string; toUserId: string;
      toUserIds?: string[]; toNames?: string[]; text: string; undelivered?: boolean; missed?: string[];
    }) => {
      const mine = whisper.fromUserId === user?.id;
      if (mine && whisper.undelivered) {
        setNotice("They aren't here or can't see this channel, so your whisper wasn't delivered.");
        return;
      }
      const nameList = (names: string[]) =>
        names.length < 2 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      if (mine && whisper.missed?.length) {
        const missedNames = whisper.missed.map((id) => members.find((m) => m.id === id)?.displayName || "someone");
        setNotice(`${nameList(missedNames)} isn't here or can't see this channel, so they didn't get your whisper.`);
      }
      if (!mine && blockedUserIdsRef.current.has(whisper.fromUserId)) return;
      if (whisper.channelId !== activeChannelRef.current) {
        if (!mine) setNotice(`${stripTextStyle(whisper.fromName)} whispered to you in another channel.`);
        return;
      }
      // Each person is told who else heard it; the sender sees who it reached.
      const reachedNames = (whisper.toNames ?? []).map((name) => stripTextStyle(name));
      const toName = reachedNames.length ? nameList(reachedNames) : whisperNamesRef.current.get(whisper.id) || "them";
      const alsoHeard = (whisper.toUserIds ?? []).flatMap((id, i) => (id === user?.id ? [] : [reachedNames[i] ?? "someone"]));
      const now = new Date();
      const line: Message = {
        id: `whisper-${whisper.id}`,
        channelId: whisper.channelId,
        userId: whisper.fromUserId,
        author: whisper.fromName,
        avatar: "🤫",
        color: "#8b7aa8",
        time: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        createdAt: now.toISOString(),
        text: mine
          ? `[i]You whisper to ${toName}:[/i] ${whisper.text}`
          : `[i]whispers to you${alsoHeard.length ? ` and ${nameList(alsoHeard)}` : ""}:[/i] ${whisper.text}`,
        kind: "whisper",
        bot: true,
      };
      setMessages((current) => (current.some((m) => m.id === line.id) ? current : [...current, line]));
      if (!mine && msnSoundsRef.current && !document.hasFocus()) playMessageChime();
    },
    [user, members],
  );
  const voiceWhisperRef = useRef<(from: string, active: boolean) => void>(() => { });

  const voiceSignalRef = useRef<(from: string, data: unknown) => void>(() => { });
  const forcedMuteRef = useRef<(userId: string, muted: boolean) => void>(
    () => { },
  );
  /** Current connected voice channel, for the soundboard event handler. */
  const voiceChannelRef = useRef<string | null>(null);
  /** Tears this tab out of voice when the account joins from another one. */
  const voiceEvictedRef = useRef<(reason?: "moderator" | "self") => void>(() => { });
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
  // Your own profile card shows the new showcase straight away.
  useEffect(() => {
    const onShowcase = (event: Event) => {
      const showcase = (event as CustomEvent<string[]>).detail || [];
      setUser((current) => (current ? { ...current, achievementShowcase: showcase } : current));
      setMembers((current) =>
        current.map((member) => (member.id === user?.id ? { ...member, achievementShowcase: showcase } : member)),
      );
    };
    window.addEventListener(SHOWCASE_CHANGED_EVENT, onShowcase);
    return () => window.removeEventListener(SHOWCASE_CHANGED_EVENT, onShowcase);
  }, [user?.id]);

  const hub = useHub(Boolean(user), {
    onMessage: handleIncomingMessage,
    onAchievement: (ids) => announceUnlocked(ids),
    onSignal: (from, data) => voiceSignalRef.current(from, data),
    onVoiceWhisper: (from, active) => voiceWhisperRef.current(from, active),
    onTextWhisper: handleTextWhisper,
    onStructureChange: reloadStructureSoon,
    onMember: (userId) => {
      if (user && userId === user.id) return;
      reloadMemberSoon(userId);
    },
    onMessageDeleted: (channelId, id) => {
      emitVoiceChat(channelId, { type: "deleted", id: String(id) });
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
      emitVoiceChat(channelId, {
        type: "edited",
        id: String(id),
        content: typeof content === "string" ? content : undefined,
        editedAt,
      });
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
    onVoiceEvicted: (reason) => {
      // The hub already removed this tab from the room; tear the call down
      // locally so the microphone and peer connections actually stop.
      voiceEvictedRef.current(reason);
    },
    onVoiceMove: (channelId) => voiceMoveRef.current(channelId),
    onDmCall: (payload) => onDmCallRef.current?.(payload),
  });

  return {
    ...s,
    refreshPins, handleIncomingMessage, whisperNamesRef, handleTextWhisper, voiceWhisperRef,
    voiceSignalRef, forcedMuteRef, voiceChannelRef, voiceEvictedRef, voiceMoveRef, onDmCallRef,
    threadRootRef, countedThreadRepliesRef, channelPrefsRef, stageChannelRef, structureReloadRef,
    structureScopeRef, myServerIdsRef, reloadStructureSoon, memberReloadRef, memberReloadDmsRef,
    shownPeopleRef, reloadMemberSoon, forcedMutesRef, captionReceiveRef, hub,
  };
}
