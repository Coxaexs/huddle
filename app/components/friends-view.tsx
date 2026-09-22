"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Users,
  MessageSquare,
  PhoneCall,
  UserPlus,
  Check,
  X,
  Search,
  MoreVertical,
  ShieldAlert,
  Clock,
  Sparkles,
  Menu,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "../lib/client";
import { Avatar } from "./avatar";
import type { FriendUser, FriendsSummary } from "@/lib/friends";

interface FriendsViewProps {
  onlineUserIds: Set<string>;
  onOpenDm: (user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl: string | null;
    color: string;
  }) => void;
  onCallUser?: (user: { id: string; username: string; displayName: string }) => void;
  onPendingCountChange?: (count: number) => void;
  onOpenMobileNav?: () => void;
}

type TabKey = "online" | "all" | "pending" | "blocked" | "add";

export function FriendsView({
  onlineUserIds,
  onOpenDm,
  onCallUser,
  onPendingCountChange,
  onOpenMobileNav,
}: FriendsViewProps) {
  const [tab, setTab] = useState<TabKey>("online");
  const [data, setData] = useState<FriendsSummary>({
    friends: [],
    incoming: [],
    outgoing: [],
    blocked: [],
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Add Friend state
  const [addUsername, setAddUsername] = useState("");
  const [addStatus, setAddStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Block user state
  const [blockUsername, setBlockUsername] = useState("");
  const [blockStatus, setBlockStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  // Active menu dropdown for friend actions
  const [menuUserId, setMenuUserId] = useState<string | null>(null);

  const loadFriends = async () => {
    try {
      const res = await apiFetch<FriendsSummary>("/api/friends");
      setData(res);
      onPendingCountChange?.(res.incoming?.length || 0);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFriends();
  }, []);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim() || submitting) return;

    setSubmitting(true);
    setAddStatus(null);

    try {
      const res = await apiFetch<{ friend: FriendUser; autoAccepted: boolean }>("/api/friends", {
        method: "POST",
        body: JSON.stringify({ username: addUsername.trim() }),
      });

      if (res.autoAccepted) {
        setAddStatus({
          type: "success",
          message: `Success! You and @${res.friend.username} are now friends.`,
        });
      } else {
        setAddStatus({
          type: "success",
          message: `Success! Your friend request to @${res.friend.username} was sent.`,
        });
      }
      setAddUsername("");
      void loadFriends();
    } catch (err) {
      setAddStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Could not send friend request.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockByUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockUsername.trim() || blockSubmitting) return;

    setBlockSubmitting(true);
    setBlockStatus(null);

    try {
      const res = await apiFetch<{ ok: boolean; user?: FriendUser }>("/api/friends/block", {
        method: "POST",
        body: JSON.stringify({ username: blockUsername.trim() }),
      });

      setBlockStatus({
        type: "success",
        message: res.user
          ? `Successfully blocked @${res.user.username}.`
          : "User successfully blocked.",
      });
      setBlockUsername("");
      void loadFriends();
    } catch (err) {
      setBlockStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Could not block user.",
      });
    } finally {
      setBlockSubmitting(false);
    }
  };

  const handleAccept = async (requesterId: string) => {
    try {
      await apiFetch("/api/friends/accept", {
        method: "POST",
        body: JSON.stringify({ requesterId }),
      });
      void loadFriends();
    } catch {
      // Ignore
    }
  };

  const handleDecline = async (otherId: string) => {
    try {
      await apiFetch("/api/friends/decline", {
        method: "POST",
        body: JSON.stringify({ otherId }),
      });
      void loadFriends();
    } catch {
      // Ignore
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await apiFetch(`/api/friends?id=${encodeURIComponent(friendId)}`, {
        method: "DELETE",
      });
      setMenuUserId(null);
      void loadFriends();
    } catch {
      // Ignore
    }
  };

  const handleBlock = async (targetId: string) => {
    try {
      await apiFetch("/api/friends/block", {
        method: "POST",
        body: JSON.stringify({ targetId }),
      });
      setMenuUserId(null);
      void loadFriends();
    } catch {
      // Ignore
    }
  };

  // Filtered lists
  const onlineFriends = useMemo(() => {
    return data.friends.filter((f) => onlineUserIds.has(f.id));
  }, [data.friends, onlineUserIds]);

  const displayedFriends = useMemo(() => {
    const list = tab === "online" ? onlineFriends : data.friends;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.username.toLowerCase().includes(q) ||
        f.displayName.toLowerCase().includes(q),
    );
  }, [tab, onlineFriends, data.friends, searchQuery]);

  const pendingCount = data.incoming.length;

  return (
    <div className="friends-view-panel flex-1 flex flex-col h-full bg-[var(--chat-bg)] text-[var(--ink)] select-none overflow-hidden font-['Nunito',sans-serif]">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-[var(--line)] px-5 flex items-center justify-between shrink-0 bg-[var(--chat-bg)]/90 backdrop-blur-sm">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
          {onOpenMobileNav && (
            <button
              className="mobile-menu mr-1 sm:hidden text-[var(--muted)] hover:text-[var(--ink)] p-1 rounded-lg hover:bg-[var(--panel)]"
              aria-label="Open navigation"
              onClick={onOpenMobileNav}
            >
              <Menu size={20} />
            </button>
          )}
          <div className="flex items-center gap-2 font-extrabold text-base text-[var(--ink)] pr-3 border-r border-[var(--line)]">
            <Users size={20} className="text-[var(--lavender,#a78bfa)]" />
            <span>Friends</span>
          </div>

          <div className="flex items-center gap-1 text-sm font-bold">
            <button
              onClick={() => {
                setTab("online");
                setMenuUserId(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "online"
                  ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--panel)]/50 hover:text-[var(--ink)]"
              }`}
            >
              Online
              {onlineFriends.length > 0 && (
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-[var(--line)] text-[var(--muted)]">
                  {onlineFriends.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setTab("all");
                setMenuUserId(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "all"
                  ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--panel)]/50 hover:text-[var(--ink)]"
              }`}
            >
              All
              {data.friends.length > 0 && (
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-[var(--line)] text-[var(--muted)]">
                  {data.friends.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setTab("pending");
                setMenuUserId(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "pending"
                  ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--panel)]/50 hover:text-[var(--ink)]"
              }`}
            >
              Pending
              {pendingCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px] leading-tight">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setTab("blocked");
                setMenuUserId(null);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "blocked"
                  ? "bg-[var(--panel)] text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)] hover:bg-[var(--panel)]/50 hover:text-[var(--ink)]"
              }`}
            >
              Blocked
              {data.blocked.length > 0 && (
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-[var(--line)] text-[var(--muted)]">
                  {data.blocked.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setTab("add");
                setMenuUserId(null);
              }}
              className={`ml-2 px-3.5 py-1.5 rounded-lg font-extrabold transition-all flex items-center gap-1.5 text-xs ${
                tab === "add"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25"
              }`}
            >
              <UserPlus size={14} /> Add Friend
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6" onClick={() => setMenuUserId(null)}>
        {/* ADD FRIEND TAB */}
        {tab === "add" && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-black text-[var(--ink)] uppercase tracking-wide mb-1">
              Add Friend
            </h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              You can add friends with their Hoffle username.
            </p>

            <form onSubmit={handleSendRequest} className="relative mb-4">
              <div className="flex items-center bg-[var(--panel)] border border-[var(--line)] rounded-xl px-4 py-3 focus-within:border-[var(--lavender)] transition-all">
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="Enter a Username"
                  className="w-full bg-transparent text-sm text-[var(--ink)] placeholder-[var(--muted)]/50 outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!addUsername.trim() || submitting}
                  className="ml-3 px-4 py-1.5 rounded-lg text-xs font-bold bg-[#6b4feb] hover:bg-[#7b63e6] disabled:opacity-40 disabled:hover:bg-[#6b4feb] text-white transition-all shrink-0"
                >
                  {submitting ? "Sending…" : "Send Friend Request"}
                </button>
              </div>
            </form>

            {addStatus && (
              <div
                className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  addStatus.type === "success"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                    : "bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300"
                }`}
              >
                {addStatus.type === "success" ? <Check size={16} /> : <X size={16} />}
                <span>{addStatus.message}</span>
              </div>
            )}

            <div className="mt-12 p-6 rounded-2xl bg-[var(--panel)] border border-[var(--line)] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--lavender,#6b4feb)]/15 flex items-center justify-center text-[var(--lavender,#6b4feb)] shrink-0">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--ink)] mb-1">Private & Independent</h3>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  Friends can send direct messages, voice call in real-time, and see each other's live game or music activity across servers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* PENDING TAB */}
        {tab === "pending" && (
          <div className="space-y-8 max-w-3xl">
            {/* Incoming requests */}
            <div>
              <div className="text-xs font-black text-[var(--muted)] uppercase tracking-wider mb-3">
                Incoming Friend Requests — {data.incoming.length}
              </div>

              {data.incoming.length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">No incoming friend requests.</p>
              ) : (
                <div className="space-y-2">
                  {data.incoming.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--panel)] border border-[var(--line)] hover:border-[var(--lavender)]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          avatar={req.avatar}
                          avatarUrl={req.avatarUrl}
                          color={req.color}
                          size={40}
                          className="friend-avatar"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[var(--ink)] truncate">
                            {req.displayName}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            @{req.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAccept(req.id)}
                          className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 transition-colors"
                          title="Accept"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => handleDecline(req.id)}
                          className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 transition-colors"
                          title="Decline"
                        >
                          <X size={18} />
                        </button>
                        <button
                          onClick={() => handleBlock(req.id)}
                          className="p-2 rounded-xl bg-[var(--line)] hover:bg-rose-500/20 text-[var(--muted)] hover:text-rose-500 transition-colors"
                          title="Block User"
                        >
                          <ShieldAlert size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing requests */}
            <div>
              <div className="text-xs font-black text-[var(--muted)] uppercase tracking-wider mb-3">
                Outgoing Friend Requests — {data.outgoing.length}
              </div>

              {data.outgoing.length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">No outgoing friend requests.</p>
              ) : (
                <div className="space-y-2">
                  {data.outgoing.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--panel)] border border-[var(--line)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          avatar={req.avatar}
                          avatarUrl={req.avatarUrl}
                          color={req.color}
                          size={40}
                          className="friend-avatar"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[var(--ink)] truncate">
                            {req.displayName}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate flex items-center gap-1.5">
                            <Clock size={12} /> Outgoing Request · @{req.username}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDecline(req.id)}
                        className="p-2 rounded-xl hover:bg-[var(--line)] text-[var(--muted)] hover:text-rose-500 transition-colors"
                        title="Cancel Request"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* BLOCKED TAB */}
        {tab === "blocked" && (
          <div className="max-w-3xl">
            {/* Block user form */}
            <div className="mb-6 p-4 rounded-2xl bg-[var(--panel)] border border-[var(--line)]">
              <div className="text-xs font-black text-[var(--ink)] uppercase tracking-wider mb-1">
                Block a User
              </div>
              <p className="text-xs text-[var(--muted)] mb-3">
                You can block anyone by entering their username, whether you are friends or not.
              </p>
              <form onSubmit={handleBlockByUsername} className="flex gap-2">
                <div className="flex-1 flex items-center bg-[var(--chat-bg)] border border-[var(--line)] rounded-xl px-3.5 py-2 focus-within:border-rose-400 transition-all">
                  <span className="text-[var(--muted)] font-bold text-sm mr-2 select-none">@</span>
                  <input
                    type="text"
                    value={blockUsername}
                    onChange={(e) => setBlockUsername(e.target.value)}
                    placeholder="Enter username to block..."
                    className="bg-transparent border-none outline-none text-xs text-[var(--ink)] placeholder-[var(--muted)]/50 w-full"
                    disabled={blockSubmitting}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!blockUsername.trim() || blockSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white transition-all shrink-0 flex items-center gap-1.5"
                >
                  <ShieldAlert size={14} />
                  {blockSubmitting ? "Blocking..." : "Block User"}
                </button>
              </form>

              {blockStatus && (
                <div
                  className={`mt-3 px-3 py-2 rounded-xl text-xs flex items-center gap-2 ${
                    blockStatus.type === "success"
                      ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {blockStatus.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                  <span>{blockStatus.message}</span>
                </div>
              )}
            </div>

            <div className="text-xs font-black text-[var(--muted)] uppercase tracking-wider mb-3">
              Blocked Users — {data.blocked.length}
            </div>

            {data.blocked.length === 0 ? (
              <p className="text-xs text-[var(--muted)] italic">You haven't blocked anyone.</p>
            ) : (
              <div className="space-y-2">
                {data.blocked.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--panel)] border border-[var(--line)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        avatar={b.avatar}
                        avatarUrl={b.avatarUrl}
                        color={b.color}
                        size={40}
                        className="friend-avatar opacity-60"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[var(--ink)] truncate">
                          {b.displayName}
                        </div>
                        <div className="text-xs text-[var(--muted)] truncate">
                          @{b.username} · Blocked
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveFriend(b.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--line)] hover:bg-[var(--line)] text-[var(--ink)] transition-colors"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ONLINE & ALL TABS */}
        {(tab === "online" || tab === "all") && (
          <div className="max-w-3xl">
            {/* Search filter */}
            <div className="relative mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search friends..."
                className="w-full bg-[var(--panel)] border border-[var(--line)] rounded-xl px-10 py-2.5 text-xs text-[var(--ink)] placeholder-[var(--muted)]/50 outline-none focus:border-[var(--lavender)] transition-colors"
              />
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs font-black text-[var(--muted)] uppercase tracking-wider mb-3">
              {tab === "online" ? "Online" : "All Friends"} — {displayedFriends.length}
            </div>

            {displayedFriends.length === 0 ? (
              <div className="py-16 text-center text-[var(--muted)]">
                <Users size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">
                  {tab === "online"
                    ? "No friends are online right now."
                    : data.friends.length === 0
                    ? "You don't have any friends added yet."
                    : "No friends matched your search."}
                </p>
                {data.friends.length === 0 && (
                  <button
                    onClick={() => setTab("add")}
                    className="mt-4 px-4 py-2 rounded-xl bg-[#6b4feb] hover:bg-[#7b63e6] text-white text-xs font-bold transition-all"
                  >
                    Add Your First Friend
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {displayedFriends.map((f) => {
                  const isOnline = onlineUserIds.has(f.id);

                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-[var(--panel)]/60 transition-colors group relative"
                    >
                      <div
                        className="flex items-center gap-3.5 min-w-0 cursor-pointer flex-1"
                        onClick={() => onOpenDm(f)}
                      >
                        <div className="relative shrink-0">
                          <Avatar
                            avatar={f.avatar}
                            avatarUrl={f.avatarUrl}
                            color={f.color}
                            size={40}
                            className="friend-avatar"
                          />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--chat-bg)]"
                            style={{
                              background: isOnline ? "#4ade80" : "#6b7280",
                            }}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[var(--ink)] group-hover:text-[var(--lavender)] transition-colors truncate">
                            {f.displayName}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            {f.customStatus || `@${f.username}`}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <button
                          onClick={() => onOpenDm(f)}
                          className="p-2.5 rounded-xl bg-[var(--panel)] hover:bg-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                          title="Direct Message"
                        >
                          <MessageSquare size={18} />
                        </button>

                        {onCallUser && (
                          <button
                            onClick={() => onCallUser(f)}
                            className="p-2.5 rounded-xl bg-[var(--panel)] hover:bg-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                            title="Start Call"
                          >
                            <PhoneCall size={18} />
                          </button>
                        )}

                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuUserId(menuUserId === f.id ? null : f.id);
                            }}
                            className="p-2.5 rounded-xl bg-[var(--panel)] hover:bg-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
                            title="More options"
                          >
                            <MoreVertical size={18} />
                          </button>

                          {menuUserId === f.id && (
                            <div
                              className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-[var(--panel)] border border-[var(--line)] shadow-2xl py-1.5 z-30 font-semibold text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleRemoveFriend(f.id)}
                                className="w-full text-left px-3.5 py-2 text-rose-500 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                              >
                                <X size={14} /> Remove Friend
                              </button>
                              <button
                                onClick={() => handleBlock(f.id)}
                                className="w-full text-left px-3.5 py-2 text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-500 transition-colors flex items-center gap-2"
                              >
                                <ShieldAlert size={14} /> Block
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
