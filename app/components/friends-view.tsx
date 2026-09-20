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
  UserCheck,
  Clock,
  Sparkles,
  Menu,
} from "lucide-react";
import { apiFetch } from "../lib/client";
import { Avatar } from "./avatar";
import type { FriendUser, FriendsSummary } from "@/lib/friends";

interface FriendsViewProps {
  onlineUserIds: Set<string>;
  onOpenDm: (user: { id: string; username: string; displayName: string; avatar: string; avatarUrl: string | null; color: string }) => void;
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
    <div className="flex-1 flex flex-col h-full bg-[#16131f] text-[#e8e3f5] select-none overflow-hidden font-['Nunito',sans-serif]">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-white/[0.07] px-5 flex items-center justify-between shrink-0 bg-[#16131f]/90 backdrop-blur-sm">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
          {onOpenMobileNav && (
            <button
              className="mobile-menu mr-1 sm:hidden text-[#9d95bc] hover:text-white p-1 rounded-lg hover:bg-white/[0.06]"
              aria-label="Open navigation"
              onClick={onOpenMobileNav}
            >
              <Menu size={20} />
            </button>
          )}
          <div className="flex items-center gap-2 font-extrabold text-base text-[#e8e3f5] pr-3 border-r border-white/[0.08]">
            <Users size={20} className="text-[#a78bfa]" />
            <span>Friends</span>
          </div>

          <div className="flex items-center gap-1 text-sm font-bold">
            <button
              onClick={() => { setTab("online"); setMenuUserId(null); }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "online"
                  ? "bg-white/[0.08] text-white"
                  : "text-[#9d95bc] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              Online
              {onlineFriends.length > 0 && (
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/[0.08] text-white/80">
                  {onlineFriends.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setTab("all"); setMenuUserId(null); }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "all"
                  ? "bg-white/[0.08] text-white"
                  : "text-[#9d95bc] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              All
              {data.friends.length > 0 && (
                <span className="text-xs px-1.5 py-0.2 rounded-full bg-white/[0.08] text-white/80">
                  {data.friends.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setTab("pending"); setMenuUserId(null); }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "pending"
                  ? "bg-white/[0.08] text-white"
                  : "text-[#9d95bc] hover:bg-white/[0.04] hover:text-white"
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
              onClick={() => { setTab("blocked"); setMenuUserId(null); }}
              className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                tab === "blocked"
                  ? "bg-white/[0.08] text-white"
                  : "text-[#9d95bc] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              Blocked
            </button>

            <button
              onClick={() => { setTab("add"); setMenuUserId(null); }}
              className={`ml-2 px-3.5 py-1.5 rounded-lg font-extrabold transition-all flex items-center gap-1.5 text-xs ${
                tab === "add"
                  ? "bg-[#4ade80] text-black shadow-md shadow-[#4ade80]/20"
                  : "bg-[#4ade80]/15 text-[#4ade80] hover:bg-[#4ade80]/25"
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
            <h2 className="text-lg font-black text-[#e8e3f5] uppercase tracking-wide mb-1">
              Add Friend
            </h2>
            <p className="text-xs text-[#9d95bc] mb-4">
              You can add friends with their Hoffle username.
            </p>

            <form onSubmit={handleSendRequest} className="relative mb-4">
              <div className="flex items-center bg-[#1a1628] border border-white/[0.08] rounded-xl px-4 py-3 focus-within:border-[#a78bfa] transition-all">
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  placeholder="Enter a Username"
                  className="w-full bg-transparent text-sm text-white placeholder-white/30 outline-none"
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
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                }`}
              >
                {addStatus.type === "success" ? <Check size={16} /> : <X size={16} />}
                <span>{addStatus.message}</span>
              </div>
            )}

            <div className="mt-12 p-6 rounded-2xl bg-[#1a1628] border border-white/[0.06] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#2e2750] flex items-center justify-center text-[#a78bfa] shrink-0">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Private & Independent</h3>
                <p className="text-xs text-[#9d95bc] leading-relaxed">
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
              <div className="text-xs font-black text-[#9d95bc] uppercase tracking-wider mb-3">
                Incoming Friend Requests — {data.incoming.length}
              </div>

              {data.incoming.length === 0 ? (
                <p className="text-xs text-white/30 italic">No incoming friend requests.</p>
              ) : (
                <div className="space-y-2">
                  {data.incoming.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#1a1628] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          avatar={req.avatar}
                          avatarUrl={req.avatarUrl}
                          color={req.color}
                          className="w-10 h-10 rounded-xl"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate">
                            {req.displayName}
                          </div>
                          <div className="text-xs text-[#9d95bc] truncate">
                            @{req.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAccept(req.id)}
                          className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 transition-colors"
                          title="Accept"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => handleDecline(req.id)}
                          className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 transition-colors"
                          title="Decline"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing requests */}
            <div>
              <div className="text-xs font-black text-[#9d95bc] uppercase tracking-wider mb-3">
                Outgoing Friend Requests — {data.outgoing.length}
              </div>

              {data.outgoing.length === 0 ? (
                <p className="text-xs text-white/30 italic">No outgoing friend requests.</p>
              ) : (
                <div className="space-y-2">
                  {data.outgoing.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#1a1628] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          avatar={req.avatar}
                          avatarUrl={req.avatarUrl}
                          color={req.color}
                          className="w-10 h-10 rounded-xl"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate">
                            {req.displayName}
                          </div>
                          <div className="text-xs text-[#9d95bc] truncate flex items-center gap-1.5">
                            <Clock size={12} /> Outgoing Request · @{req.username}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDecline(req.id)}
                        className="p-2 rounded-xl hover:bg-white/[0.08] text-white/50 hover:text-rose-400 transition-colors"
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
            <div className="text-xs font-black text-[#9d95bc] uppercase tracking-wider mb-3">
              Blocked Users — {data.blocked.length}
            </div>

            {data.blocked.length === 0 ? (
              <p className="text-xs text-white/30 italic">You haven't blocked anyone.</p>
            ) : (
              <div className="space-y-2">
                {data.blocked.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#1a1628] border border-white/[0.06]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        avatar={b.avatar}
                        avatarUrl={b.avatarUrl}
                        color={b.color}
                        className="w-10 h-10 rounded-xl opacity-60"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-white/70 truncate">
                          {b.displayName}
                        </div>
                        <div className="text-xs text-[#9d95bc] truncate">
                          @{b.username} · Blocked
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveFriend(b.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-white/[0.1] hover:bg-white/[0.06] text-white transition-colors"
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
                className="w-full bg-[#1a1628] border border-white/[0.07] rounded-xl px-10 py-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-[#a78bfa] transition-colors"
              />
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="text-xs font-black text-[#9d95bc] uppercase tracking-wider mb-3">
              {tab === "online" ? "Online" : "All Friends"} — {displayedFriends.length}
            </div>

            {displayedFriends.length === 0 ? (
              <div className="py-16 text-center text-white/30">
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
              <div className="divide-y divide-white/[0.05]">
                {displayedFriends.map((f) => {
                  const isOnline = onlineUserIds.has(f.id);

                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-white/[0.03] transition-colors group relative"
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
                            className="w-10 h-10 rounded-xl"
                          />
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#16131f]"
                            style={{
                              background: isOnline ? "#4ade80" : "#6b7280",
                            }}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white group-hover:text-[#a78bfa] transition-colors truncate">
                            {f.displayName}
                          </div>
                          <div className="text-xs text-[#9d95bc] truncate">
                            {f.customStatus || `@${f.username}`}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <button
                          onClick={() => onOpenDm(f)}
                          className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-colors"
                          title="Direct Message"
                        >
                          <MessageSquare size={18} />
                        </button>

                        {onCallUser && (
                          <button
                            onClick={() => onCallUser(f)}
                            className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-colors"
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
                            className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white transition-colors"
                            title="More options"
                          >
                            <MoreVertical size={18} />
                          </button>

                          {menuUserId === f.id && (
                            <div
                              className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-[#1a1628] border border-white/[0.1] shadow-2xl py-1.5 z-30 font-semibold text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleRemoveFriend(f.id)}
                                className="w-full text-left px-3.5 py-2 text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                              >
                                <X size={14} /> Remove Friend
                              </button>
                              <button
                                onClick={() => handleBlock(f.id)}
                                className="w-full text-left px-3.5 py-2 text-white/60 hover:bg-white/[0.06] hover:text-white transition-colors flex items-center gap-2"
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
