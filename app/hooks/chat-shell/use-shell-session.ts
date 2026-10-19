import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { msnPictureFile, type MsnPicture } from "../../lib/msn-pictures";
import type { PublicChannel, PublicRole, PublicServer } from "@/lib/servers";
import { channelKindInfo } from "@/lib/channel-kinds";
import { ALL_PERMISSIONS, hasPermission, Permission, canAccessServerSettings } from "@/lib/permissions";
import { type Member, type PublicUser } from "@/lib/users";
import { activeUntil } from "@/lib/timeouts";
import { eventWhen, useServerEvents } from "../../components/events-panel";
import { type ResolvedInvite } from "../../components/server-invite-card";
import { type ServerFolder } from "@/lib/server-folders";
import { type DmSummary, compareDms } from "../../lib/chat/types";
import { DM_HOME } from "../../lib/chat/constants";
import { commandArgsHint } from "../../lib/chat/format";
import { extractInviteCodes } from "../../lib/chat/invites";
import { parseMessageLink, resolveMessageLink } from "../../lib/chat/message-links";
import { type VoicePref } from "../../components/user-menu";
import { apiFetch } from "../../lib/client";
import type { useShellState } from "./use-shell-state";

/** ChatShell, part 2 of 9. The signed-in session: loading servers, members, friends, prefs and unread counts; message and invite links; permissions and the active server/channel/DM. */
export function useShellSession(s: ReturnType<typeof useShellState>) {
  const {
    activeChannelId, activeServerId, activeServerRef, blockedUserIds, channelDraftsRef, dms,
    draftRef, emojis, eventsRefresh, fetchingInvitesRef, inDmHome, initialChannelScrollRef,
    loadSaved, members, messages, prevChannelForDraftRef, rawUnreadRef, resolvedInvites, servers,
    setActiveChannelId, setActiveServerId, setBlockedUserIds, setBootstrap, setBotCommands,
    setChannelPrefs, setDms, setDraftState, setEditingId, setEmojis, setFeatures, setFriendUserIds,
    setIncomingFriendUserIds, setMembers, setNotice, setOpenSignup, setOutgoingFriendUserIds,
    setPendingFiles, setPendingFriendCount, setProfileCardTarget, setReady, setReplyTarget,
    setResolvedInvites, setServerFolders, setServers, setTurnstileSiteKey, setUnread, setUser,
    setUserMenu, setVoicePrefs, showCustomConfirm, threadMessages, threadRoot, unread, unreadRef,
    user,
  } = s;

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
    apiFetch<{
      user: PublicUser | null;
      bootstrap: boolean;
      openSignup?: boolean;
      turnstileSiteKey?: string | null;
    }>("/api/auth/session")
      .then((data) => {
        setUser(data.user);
        setBootstrap(data.bootstrap);
        setOpenSignup(Boolean(data.openSignup));
        setTurnstileSiteKey(data.turnstileSiteKey ?? null);
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

  // A copied message link opened from outside (/hangout?server=…&channel=…&message=…):
  // once the servers are in, open the message's channel scrolled to it. Once
  // per page load, and the link comes out of the address bar.
  const jumpToMessageRef = useRef<(channelId: string, messageId: string) => void>(() => undefined);
  const linkedMessageHandledRef = useRef(false);
  useEffect(() => {
    if (!user || !servers.length || linkedMessageHandledRef.current) return;
    linkedMessageHandledRef.current = true;
    const target = parseMessageLink(window.location.href);
    if (!target) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    void resolveMessageLink(target)
      .then(({ serverId, channelId, messageId }) => {
        setActiveServerId(serverId || DM_HOME);
        jumpToMessageRef.current(channelId, messageId);
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : "That message can't be opened."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, servers]);

  const joinServerDirectRef = useRef<(code: string) => Promise<unknown>>(async () => undefined);
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
              onConfirm: () => void joinServerDirectRef.current(inviteCode),
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
        avatarUrl: own?.serverAvatarUrl || user.avatarUrl,
        globalAvatarUrl: user.avatarUrl,
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

  return {
    ...s,
    loadServers, loadMembers, loadServerFolders, loadDms, loadFriendsCount, handleAddFriend,
    handleRemoveFriend, handleAcceptFriend, handleBlockUser, handleUnblockUser, loadPrefs,
    loadChannelPrefs, loadEmojis, loadUnread, markServerRead, setNotifyLevel, markChannelRead,
    jumpToMessageRef, linkedMessageHandledRef, joinServerDirectRef, activeServer, textChannels,
    voiceChannels, serverEvents, reloadEvents, nextEvent, membersById, timeoutTick, setTimeoutTick,
    myTimeoutUntil, myPermissions, canManageChannels, canManageServer, canManageRoles,
    canManageEmojis, canRecordSessions, canModerate, canKickMembers, canBanMembers,
    canViewAuditLog, canPostAnnouncements, canPin, canManageNicknames, canMentionEveryone,
    canCreateServerInvites, canOpenServerSettings, rolesForMember, openProfile,
    openProfileByHandle, roleColorFor, channelLayout, emojiMap, dmUnread, dmUnreadTotal,
    activeChannel, activeChannelInfo, composerBlocked, activeDm, visibleDms, isSelfDm,
    channelTitle, isDmBlocked, hasOlder, setHasOlder, loadingOlderRef, detached, setDetached,
    detachedRef, setStockPicture,
  };
}
