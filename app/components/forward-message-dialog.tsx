"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Forward, Hash, Search, X, Check, MessageSquare, Loader2 } from "lucide-react";
import { Avatar } from "./avatar";

export interface ForwardMessageTarget {
  id: string | number;
  author: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
  text: string;
  createdAt?: string;
  image?: string;
  images?: string[];
  file?: { url: string; name: string; type: "pdf" };
  channelId?: string | null;
  channelName?: string;
  serverName?: string;
}

export interface ForwardDestination {
  id: string;
  name: string;
  subtext?: string;
  kind: "channel" | "dm";
  avatar?: string;
  avatarUrl?: string | null;
  color?: string;
  serverName?: string;
}

interface ForwardMessageDialogProps {
  target: ForwardMessageTarget | null;
  servers: Array<{
    id: string;
    name: string;
    icon?: string | null;
    channels: Array<{ id: string; name: string; kind: string }>;
  }>;
  dms: Array<{
    channelId: string;
    user: {
      id: string;
      username: string;
      displayName: string;
      avatar: string;
      avatarUrl?: string | null;
      color: string;
    };
  }>;
  currentChannelId?: string | null;
  onClose: () => void;
  onForward: (destinationChannelId: string, comment: string, destinationName: string) => Promise<void>;
}

export function ForwardMessageDialog({
  target,
  servers,
  dms,
  currentChannelId,
  onClose,
  onForward,
}: ForwardMessageDialogProps) {
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (target) {
      setSearch("");
      setComment("");
      setIsSubmitting(false);
      // Select first available DM or channel if not current
      setSelectedDestId(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [target]);

  const destinations = useMemo<ForwardDestination[]>(() => {
    const list: ForwardDestination[] = [];

    // DMs first
    for (const dm of dms) {
      if (!dm.user) continue;
      list.push({
        id: dm.channelId,
        name: dm.user.displayName,
        subtext: `@${dm.user.username}`,
        kind: "dm",
        avatar: dm.user.avatar,
        avatarUrl: dm.user.avatarUrl,
        color: dm.user.color,
      });
    }

    // Text channels across servers
    for (const server of servers) {
      const textChannels = server.channels.filter((c) => c.kind === "text");
      for (const channel of textChannels) {
        list.push({
          id: channel.id,
          name: channel.name,
          subtext: server.name,
          kind: "channel",
          serverName: server.name,
        });
      }
    }

    return list;
  }, [servers, dms]);

  const filteredDestinations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.subtext && d.subtext.toLowerCase().includes(q)),
    );
  }, [destinations, search]);

  if (!target) return null;

  const selectedDest = destinations.find((d) => d.id === selectedDestId);

  const handleForward = async () => {
    if (!selectedDestId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const destName = selectedDest
        ? selectedDest.kind === "dm"
          ? `@${selectedDest.name}`
          : `#${selectedDest.name}`
        : "channel";
      await onForward(selectedDestId, comment.trim(), destName);
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleForward();
    }
  };

  return (
    <div className="custom-dialog-backdrop" onClick={onClose}>
      <div
        className="forward-dialog-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-dialog-title"
      >
        <div className="forward-dialog-header">
          <div className="flex items-center gap-2">
            <div className="forward-header-icon-wrap">
              <Forward size={18} className="text-[#a78bfa]" />
            </div>
            <div>
              <h3 id="forward-dialog-title" className="forward-dialog-title">
                Forward Message
              </h3>
              <p className="forward-dialog-subtitle">
                Share this message to another channel or conversation
              </p>
            </div>
          </div>
          <button
            type="button"
            className="forward-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message Preview Snippet */}
        <div className="forward-preview-box">
          <div className="forward-preview-author">
            <Avatar
              avatar={target.avatar}
              avatarUrl={target.avatarUrl}
              color={target.color}
              size={20}
              className="flex-shrink-0"
            />
            <strong className="forward-preview-name">{target.author}</strong>
            {(target.serverName || target.channelName) && (
              <span className="forward-preview-origin">
                in {target.serverName ? `${target.serverName} • ` : ""}#{target.channelName || "chat"}
              </span>
            )}
          </div>
          <div className="forward-preview-text">
            {target.text ? (
              target.text.length > 220 ? `${target.text.slice(0, 220)}…` : target.text
            ) : target.file ? (
              `Shared document: ${target.file.name}`
            ) : target.image || (target.images && target.images.length > 0) ? (
              "Shared image attachment"
            ) : (
              "Message content"
            )}
          </div>
        </div>

        {/* Search destination */}
        <div className="forward-search-wrap">
          <Search size={14} className="forward-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="forward-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels or people…"
          />
        </div>

        {/* Destinations list */}
        <div className="forward-dest-list">
          {filteredDestinations.length === 0 ? (
            <div className="forward-dest-empty">
              No matching channels or conversations found.
            </div>
          ) : (
            filteredDestinations.map((dest) => {
              const isSelected = selectedDestId === dest.id;
              const isCurrent = currentChannelId === dest.id;
              return (
                <button
                  key={dest.id}
                  type="button"
                  className={`forward-dest-item ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDestId(dest.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {dest.kind === "dm" ? (
                      <Avatar
                        avatar={dest.avatar || "✦"}
                        avatarUrl={dest.avatarUrl}
                        color={dest.color || "#a78bfa"}
                        size={26}
                        className="flex-shrink-0"
                      />
                    ) : (
                      <div className="forward-channel-icon-wrap">
                        <Hash size={14} className="text-[#a78bfa]" />
                      </div>
                    )}
                    <div className="flex flex-col text-left min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="forward-dest-name truncate">{dest.name}</span>
                        {isCurrent && (
                          <span className="forward-dest-badge">Current</span>
                        )}
                      </div>
                      {dest.subtext && (
                        <span className="forward-dest-sub truncate">{dest.subtext}</span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`forward-dest-radio ${isSelected ? "checked" : ""}`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Optional commentary */}
        <div className="forward-comment-wrap">
          <textarea
            className="forward-comment-input"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add an optional comment… (Ctrl+Enter to send)"
            maxLength={1000}
          />
        </div>

        {/* Footer actions */}
        <div className="forward-dialog-footer">
          <button
            type="button"
            className="forward-btn-cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="forward-btn-submit"
            disabled={!selectedDestId || isSubmitting}
            onClick={() => void handleForward()}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Forwarding…</span>
              </>
            ) : (
              <>
                <Forward size={14} />
                <span>
                  {selectedDest
                    ? `Forward to ${selectedDest.kind === "dm" ? selectedDest.name : `#${selectedDest.name}`}`
                    : "Forward"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
