"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Users, X } from "lucide-react";
import { Avatar } from "./avatar";
import { apiFetch } from "../lib/client";
import type { FriendUser } from "@/lib/friends";

/** Most people a group DM can hold (matches GROUP_DM_LIMIT on the server). */
const GROUP_LIMIT = 10;

interface GroupDmDialogProps {
  open: boolean;
  /**
   * Set when adding people to an existing group: its current members are
   * shown as already in and the name field is hidden.
   */
  existingMemberIds?: string[];
  groupName?: string;
  onClose: () => void;
  onSubmit: (userIds: string[], name: string) => Promise<void>;
}

/** Pick friends to start a group DM with, or to add to one. */
export function GroupDmDialog({
  open,
  existingMemberIds,
  groupName,
  onClose,
  onSubmit,
}: GroupDmDialogProps) {
  const adding = Boolean(existingMemberIds);
  const [friends, setFriends] = useState<FriendUser[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setQuery("");
    setName("");
    setError(null);
    setFriends(null);
    apiFetch<{ friends: FriendUser[] }>("/api/friends")
      .then((data) => setFriends(data.friends || []))
      .catch(() => setFriends([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const existing = useMemo(() => new Set(existingMemberIds || []), [existingMemberIds]);
  // You count toward the limit when starting a group.
  const seatsLeft = GROUP_LIMIT - (adding ? existing.size : 1) - picked.size;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (friends || []).filter(
      (friend) =>
        !q ||
        friend.displayName.toLowerCase().includes(q) ||
        friend.username.toLowerCase().includes(q),
    );
  }, [friends, query]);

  if (!open) return null;

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (seatsLeft > 0) next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!picked.size || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit([...picked], name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not do that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="custom-dialog-backdrop" onClick={onClose}>
      <div
        className="forward-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-dm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="forward-dialog-header">
          <div className="flex items-center gap-2">
            <div className="forward-header-icon-wrap">
              <Users size={18} className="text-[#a78bfa]" />
            </div>
            <div>
              <h3 id="group-dm-dialog-title" className="forward-dialog-title">
                {adding ? `Add friends to ${groupName || "the group"}` : "Create a group"}
              </h3>
              <p className="forward-dialog-subtitle">
                {seatsLeft > 0
                  ? `You can add ${seatsLeft} more ${seatsLeft === 1 ? "friend" : "friends"}.`
                  : "This group is full."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="forward-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {!adding && (
          <div className="forward-comment-wrap">
            <input
              className="forward-comment-input"
              placeholder="Group name (optional)"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        )}

        <div className="forward-search-wrap">
          <Search size={14} className="forward-search-icon" />
          <input
            autoFocus
            className="forward-search-input"
            placeholder="Type the username of a friend"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="forward-dest-list">
          {friends === null ? (
            <div className="forward-dest-empty">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : !shown.length ? (
            <div className="forward-dest-empty">
              {friends.length
                ? "No friends match that."
                : "Group DMs are made from your friends. Add some friends first."}
            </div>
          ) : (
            shown.map((friend) => {
              const already = existing.has(friend.id);
              const checked = already || picked.has(friend.id);
              return (
                <button
                  type="button"
                  key={friend.id}
                  className={`forward-dest-item ${checked ? "selected" : ""}`}
                  disabled={already || (!checked && seatsLeft <= 0)}
                  onClick={() => toggle(friend.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Avatar
                      avatar={friend.avatar}
                      avatarUrl={friend.avatarUrl}
                      color={friend.color}
                      size={28}
                      className="flex-shrink-0"
                    />
                    <div className="flex flex-col text-left min-w-0 flex-1">
                      <span className="forward-dest-name truncate">{friend.displayName}</span>
                      <span className="forward-dest-sub truncate">
                        {already ? "Already in the group" : `@${friend.username}`}
                      </span>
                    </div>
                  </div>
                  <span className={`group-dm-check ${checked ? "is-checked" : ""}`}>
                    {checked && <Check size={12} />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && <p className="group-dm-error">{error}</p>}

        <div className="forward-dialog-footer">
          <button type="button" className="forward-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="forward-btn-submit"
            disabled={!picked.size || busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {adding ? "Add" : picked.size === 1 ? "Create DM" : "Create Group DM"}
          </button>
        </div>
      </div>
    </div>
  );
}
