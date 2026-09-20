"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, MessageSquare, UserPlus, Check, Clock, ShieldAlert, Loader2 } from "lucide-react";
import { Avatar } from "./avatar";
import { apiFetch } from "../lib/client";

export interface SearchResultUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  status: string;
  customStatus: string | null;
  lastSeenAt: string | null;
  isSelf: boolean;
  relationship: "self" | "friend" | "incoming" | "outgoing" | "blocked" | "none";
}

interface GlobalUserSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onlineUserIds: Set<string>;
  onOpenDm: (user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    avatarUrl: string | null;
    color: string;
  }) => void;
}

export function GlobalUserSearchDialog({
  isOpen,
  onClose,
  onlineUserIds,
  onOpenDm,
}: GlobalUserSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ users: SearchResultUser[] }>(
          `/api/users/search?q=${encodeURIComponent(trimmed)}&limit=30`,
        );
        setResults(res.users || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSendFriendRequest = async (user: SearchResultUser) => {
    setActionLoadingId(user.id);
    try {
      await apiFetch("/api/friends", {
        method: "POST",
        body: JSON.stringify({ username: user.username }),
      });
      // Update relationship locally to outgoing or friend
      setResults((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, relationship: "outgoing" } : u)),
      );
    } catch {
      // Ignore
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptRequest = async (user: SearchResultUser) => {
    setActionLoadingId(user.id);
    try {
      await apiFetch("/api/friends/accept", {
        method: "POST",
        body: JSON.stringify({ requesterId: user.id }),
      });
      setResults((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, relationship: "friend" } : u)),
      );
    } catch {
      // Ignore
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSelectUser = (u: SearchResultUser) => {
    if (u.isSelf) return;
    onOpenDm({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatar: u.avatar,
      avatarUrl: u.avatarUrl,
      color: u.color,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150 font-['Nunito',sans-serif]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1a1628] border border-white/[0.08] shadow-2xl rounded-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Search header */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/[0.08] gap-3 bg-[#16131f]/60">
          <Search size={20} className="text-[#a78bfa] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users by name or @username..."
            className="flex-1 bg-transparent border-none text-[#e8e3f5] text-base placeholder-[#7c7599] focus:outline-none"
          />
          {loading ? (
            <Loader2 size={18} className="animate-spin text-[#a78bfa] shrink-0" />
          ) : query ? (
            <button
              onClick={() => setQuery("")}
              className="text-[#9d95bc] hover:text-white p-1 rounded hover:bg-white/[0.05]"
              title="Clear search"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[11px] font-mono bg-white/[0.08] text-[#9d95bc] rounded">
              ESC
            </kbd>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {query.trim() === "" ? (
            <div className="py-12 px-4 text-center text-[#9d95bc]">
              <p className="text-sm font-medium">Type a name or @username to find any Hoffle user.</p>
              <p className="text-xs text-[#7c7599] mt-1">
                Direct message, send friend requests, or connect instantly.
              </p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-12 px-4 text-center text-[#9d95bc]">
              <p className="text-sm font-semibold">No users found</p>
              <p className="text-xs text-[#7c7599] mt-1">
                We couldn&apos;t find anyone matching &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            results.map((u) => {
              const isOnline = onlineUserIds.has(u.id);
              const isBusy = actionLoadingId === u.id;

              return (
                <div
                  key={u.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                    u.isSelf
                      ? "opacity-60 bg-white/[0.02]"
                      : "hover:bg-white/[0.05] cursor-pointer group"
                  }`}
                  onClick={() => {
                    if (!u.isSelf) handleSelectUser(u);
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className="relative shrink-0">
                      <Avatar
                        name={u.displayName}
                        avatar={u.avatar}
                        avatarUrl={u.avatarUrl}
                        color={u.color}
                        size={40}
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#1a1628] ${
                          isOnline ? "bg-[#4ade80]" : "bg-neutral-500"
                        }`}
                        title={isOnline ? "Online" : "Offline"}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#e8e3f5] truncate">
                          {u.displayName}
                        </span>
                        <span className="text-xs text-[#9d95bc] truncate">
                          @{u.username}
                        </span>
                        {u.isSelf && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-white/[0.08] text-[#a78bfa]">
                            You
                          </span>
                        )}
                      </div>

                      {u.customStatus ? (
                        <p className="text-xs text-[#9d95bc] truncate mt-0.5">
                          {u.customStatus}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[#7c7599] truncate mt-0.5">
                          {isOnline ? "Active now" : "Offline"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!u.isSelf && (
                      <>
                        <button
                          onClick={() => handleSelectUser(u)}
                          className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-[#e8e3f5] transition-colors"
                          title="Open Direct Message"
                        >
                          <MessageSquare size={16} />
                        </button>

                        {u.relationship === "none" && (
                          <button
                            onClick={() => handleSendFriendRequest(u)}
                            disabled={isBusy}
                            className="px-3 py-1.5 rounded-lg bg-[#a78bfa]/20 hover:bg-[#a78bfa]/30 text-[#c4b5fd] text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
                            title="Add Friend"
                          >
                            <UserPlus size={14} />
                            <span>Add</span>
                          </button>
                        )}

                        {u.relationship === "outgoing" && (
                          <span className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-[#9d95bc] text-xs font-semibold flex items-center gap-1">
                            <Clock size={12} />
                            Sent
                          </span>
                        )}

                        {u.relationship === "incoming" && (
                          <button
                            onClick={() => handleAcceptRequest(u)}
                            disabled={isBusy}
                            className="px-3 py-1.5 rounded-lg bg-[#4ade80]/20 hover:bg-[#4ade80]/30 text-[#4ade80] text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                            title="Accept Friend Request"
                          >
                            <Check size={14} />
                            <span>Accept</span>
                          </button>
                        )}

                        {u.relationship === "friend" && (
                          <span className="px-2.5 py-1.5 rounded-lg bg-[#4ade80]/15 text-[#4ade80] text-xs font-semibold flex items-center gap-1">
                            <Check size={12} />
                            Friend
                          </span>
                        )}

                        {u.relationship === "blocked" && (
                          <span className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold flex items-center gap-1">
                            <ShieldAlert size={12} />
                            Blocked
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-[#16131f]/80 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#7c7599]">
          <span>Fast lookup across all registered members</span>
          <span>Press ESC to exit</span>
        </div>
      </div>
    </div>
  );
}
