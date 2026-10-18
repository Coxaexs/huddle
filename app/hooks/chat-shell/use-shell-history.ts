import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Message, type MentionEntry } from "../../lib/chat/types";
import { DM_HOME } from "../../lib/chat/constants";
import { apiFetch, apiUrl } from "../../lib/client";
import { getActiveThemeId, findThemeById, applyThemeToDocument, applyClientUiCss } from "@/lib/themes";
import { mergeMessages } from "../../lib/chat/shell-helpers";
import type { useShellVoice } from "./use-shell-voice";

/**
 * A channel opens with up to 200 messages, but only the newest ones are
 * mounted; older ones mount a batch at a time as you scroll up, before any
 * older page is fetched. Mounting 200 rich rows on every channel switch was
 * the slowest part of switching, on phones especially.
 */
const MOUNTED_ON_OPEN = 60;
const MOUNT_BATCH = 60;

/** Where the first unread message is: the count skips your own messages, so walk back past only others'. */
function firstUnreadIndex(messages: Message[], unreadCount: number, userId: string | undefined) {
  let index = messages.length;
  let others = 0;
  while (index > 0 && others < unreadCount) {
    index -= 1;
    if (!userId || messages[index].userId !== userId) others += 1;
  }
  return { index, others };
}

/** ChatShell, part 5 of 9. Message history: loading pages, scrolling, jumping to a message, the unread bar. */
export function useShellHistory(s: ReturnType<typeof useShellVoice>) {
  const {
    activeChannelId, activeChannelRef, detachedRef, hasOlder, hub, initialChannelScrollRef,
    jumpToMessageRef, lastSeenTailRef, loadingOlderRef, messageEndRef, messages, messagesLoadedFor,
    messagesRef, messagesScrollRef, nearBottomRef, refreshPins, setActiveChannelId,
    setActiveServerId, setDetached, setDndOnline, setDndUrl, setHasOlder, setMentionsOpen,
    setMessages, setMessagesLoadedFor, setMusicDashboardUrl, setMusicWatchOnline, setSearchOpen,
    setShowJumpLatest, setStageChannelId, setTheme, setUnreadBarVisible, setUnreadMarker,
    setUnseenCount, unreadMarker, user,
  } = s;

  // --------------------------------------------------------------- data

  /** A message to scroll to once its channel has loaded. */
  const pendingJumpRef = useRef<{ channelId: string; messageId: string } | null>(null);
  /** Set just before older messages are prepended, to keep the view still. */
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  /** The oldest mounted message; null mounts them all. */
  const [mountedFrom, setMountedFrom] = useState<Message["id"] | null>(null);
  const mountedStart = useMemo(() => {
    if (mountedFrom === null) return 0;
    // Gone (a jump replaced the list, or the 400 cap trimmed it): mount everything.
    return Math.max(0, messages.findIndex((message) => message.id === mountedFrom));
  }, [messages, mountedFrom]);
  const mountedMessages = useMemo(
    () => (mountedStart > 0 ? messages.slice(mountedStart) : messages),
    [messages, mountedStart],
  );
  const mountedStartRef = useRef(mountedStart);
  mountedStartRef.current = mountedStart;
  /** Mounts the messages from `index` on. */
  const mountFrom = useCallback((list: Message[], index: number) => {
    setMountedFrom(index > 0 ? list[index].id : null);
  }, []);

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
        const list = data.messages;
        let start = jump ? 0 : list.length - MOUNTED_ON_OPEN;
        const initial = initialChannelScrollRef.current;
        if (start > 0 && initial?.channelId === activeChannelId && initial.unreadCount > 0) {
          start = Math.min(start, firstUnreadIndex(list, initial.unreadCount, user.id).index - 5);
        }
        mountFrom(list, Math.max(0, start));
        setMessages(list);
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
    if (!channelId || loadingOlderRef.current || !el) return;
    const shownFrom = mountedStartRef.current;
    if (shownFrom > 0) {
      // Already loaded, just not mounted yet: mount the next batch first.
      prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      mountFrom(messagesRef.current, Math.max(0, shownFrom - MOUNT_BATCH));
      return;
    }
    if (!hasOlder) return;
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
  }, [hasOlder, mountFrom]);

  // Scroll to a jumped-to message once it is on screen, and flash it.
  useEffect(() => {
    const jump = pendingJumpRef.current;
    if (!jump || jump.channelId !== activeChannelId || messagesLoadedFor !== activeChannelId) return;
    const element = document.getElementById(`msg-${jump.messageId}`);
    if (!element) {
      // Loaded but not mounted: mount down to it, and this runs again.
      const index = messages.findIndex((message) => String(message.id) === jump.messageId);
      if (index >= 0 && index < mountedStart) mountFrom(messages, Math.max(0, index - 10));
      return;
    }
    pendingJumpRef.current = null;
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("jump-flash");
      window.setTimeout(() => element.classList.remove("jump-flash"), 2000);
    });
  }, [activeChannelId, messagesLoadedFor, messages, mountedStart]);

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
        const { index, others } = firstUnreadIndex(messages, initial.unreadCount, user?.id);
        const first = messages[index];
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
  }, [activeChannelId, messages, messagesLoadedFor, mountedStart]);

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
      setMountedFrom(null);
      setMessages(data.messages);
      setHasOlder(Boolean(data.hasMore));
      setDetached(Boolean(data.hasNewer));
    });
  }

  jumpToMessageRef.current = jumpToMessage;

  /** Opens the channel (server or DM) a mention came from, scrolled to it. */
  function openMention(entry: MentionEntry) {
    setMentionsOpen(false);
    setActiveServerId(entry.serverId || DM_HOME);
    if (entry.message.channelId) jumpToMessage(entry.message.channelId, String(entry.message.id));
  }

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

  return {
    ...s,
    pendingJumpRef, prependAnchorRef, loadChannelPage, lastSessionRef, loadOlder,
    handleMessagesScroll, loadOlderRef, jumpToMessage, openMention, jumpToFirstUnread,
    jumpToLatest, mountedMessages, hasUnmounted: mountedStart > 0,
  };
}
