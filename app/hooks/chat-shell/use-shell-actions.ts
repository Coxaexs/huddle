import { useCallback, useEffect, useMemo } from "react";
import { findWink } from "../../components/msn-chrome";
import { type GameKind } from "@/lib/games";
import { type Message, type DmSummary } from "../../lib/chat/types";
import { DM_HOME } from "../../lib/chat/constants";
import { formatClientDateTime } from "../../lib/chat/format";
import { apiFetch } from "../../lib/client";
import { formatDuration, type VoiceClip } from "../../components/voice-message";
import { type Theme, findThemeById, applyThemeToDocument, exportThemeCode } from "@/lib/themes";
import type { useShellHistory } from "./use-shell-history";

/** ChatShell, part 6 of 9. Actions: theme, games, winks and nudges, DMs and group DMs, pins, moderation, bot buttons, sending text and voice messages. */
export function useShellActions(s: ReturnType<typeof useShellHistory>) {
  const {
    activeChannelId, activeChannelRef, activeServerId, composerRef, detachedRef, dmChannelIdsRef, hub, inDmHome,
    loadDms, membersById, messages, msnTheme, nudgeCooling, pendingCommandRef, refreshPins,
    replyTarget, setActiveChannelId, setActiveServerId, setBannedIds, setDms, setDraft, setMembers,
    setMessages, setMobileNav, setNotice, setNudgeCooling, setReplyTarget, setStageChannelId,
    setTheme, setVoicePrefs, showCustomConfirm, showCustomPrompt, user, visibleDms, voice,
    voiceChannels,
  } = s;

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
    // Plain text shows up at once; the real message replaces it when it lands.
    let pendingId: string | null = null;
    if (text && !keys.length && user && !detachedRef.current && activeChannelRef.current === activeChannelId) {
      const now = new Date();
      pendingId = `pending-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
      const pending: Message = {
        id: pendingId,
        pending: true,
        channelId: activeChannelId,
        userId: user.id,
        author: user.displayName || user.username,
        avatar: user.avatar,
        color: user.color,
        text,
        time: now.toISOString().slice(11, 16),
        createdAt: now.toISOString(),
        replyTo,
        replyPreview: replyTarget && replyTo ? { author: replyTarget.author, text: replyTarget.text } : undefined,
      };
      setMessages((current) => [...current, pending]);
    }
    const dropPending = (real?: Message) =>
      setMessages((current) => {
        if (!current.some((message) => message.id === pendingId)) return current;
        if (!real || current.some((message) => message.id === real.id)) {
          return current.filter((message) => message.id !== pendingId);
        }
        return current.map((message) => (message.id === pendingId ? real : message));
      });
    try {
      const res = await apiFetch<{ message: Message; newAchievements: string[] }>("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          channelId: activeChannelId,
          content: text,
          attachmentKey: keys[0],
          attachmentKeys: keys.slice(1),
          replyTo,
        }),
      });
      if (pendingId) dropPending(res.message);
      return res;
    } catch (error) {
      if (pendingId) dropPending();
      throw error;
    }
  }

  /** Wrapper for Composer: it doesn't need the achievement payload, only fire-and-forget. */
  const sendTextComposer = useCallback(
    async (text: string, attachmentKeys?: string | string[] | undefined) => {
      await sendText(text, attachmentKeys);
    },
    [sendText],
  );

  return {
    ...s,
    applyTheme, wrapSelection, pendingInvite, answerInvite, startGame, sendWink, sendNudge,
    handleShareThemeToChat, postBotMessage, setDmClosed, togglePinDm, openDm, createGroupDm,
    addToGroupDm, renameGroupDm, removeFromGroupDm, leaveGroupDm, deleteMessage, togglePin,
    saveVoicePref, moderateMember, editNickname, timeoutMember, moveMember, pressBotComponent,
    openMusicDashboard, sendVoiceMessage, sendText, sendTextComposer,
  };
}
