"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Hash, Volume2, User, Server, X } from "lucide-react";
import type { PublicChannel, PublicServer } from "@/lib/servers";

export interface QuickSwitcherTarget {
  type: "channel" | "dm" | "server";
  id: string;
  name: string;
  serverId?: string | null;
  kind?: "text" | "voice";
  avatar?: string;
  avatarUrl?: string;
}

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
  servers: PublicServer[];
  channels: PublicChannel[];
  dms: Array<{ id: string; user: { id: string; displayName: string; username: string; avatar?: string; avatarUrl?: string } }>;
  onSelect: (target: QuickSwitcherTarget) => void;
}

export function QuickSwitcher({
  open,
  onClose,
  servers,
  channels,
  dms,
  onSelect,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  // Filter items
  const items: QuickSwitcherTarget[] = [];

  // 1. Text & Voice Channels
  for (const c of channels) {
    if (c.name.toLowerCase().includes(query.toLowerCase())) {
      items.push({
        type: "channel",
        id: c.id,
        name: c.name,
        serverId: c.serverId,
        kind: c.kind === "voice" ? "voice" : "text",
      });
    }
  }

  // 2. Direct Messages
  for (const dm of dms) {
    if (
      dm.user.displayName.toLowerCase().includes(query.toLowerCase()) ||
      dm.user.username.toLowerCase().includes(query.toLowerCase())
    ) {
      items.push({
        type: "dm",
        id: dm.id,
        name: dm.user.displayName,
        avatar: dm.user.avatar,
        avatarUrl: dm.user.avatarUrl,
      });
    }
  }

  // 3. Servers
  for (const s of servers) {
    if (s.name.toLowerCase().includes(query.toLowerCase())) {
      items.push({
        type: "server",
        id: s.id,
        name: s.name,
      });
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (items.length ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter" && items[selectedIndex]) {
      e.preventDefault();
      onSelect(items[selectedIndex]);
      onClose();
    }
  };

  return (
    <div className="quick-switcher-backdrop" onClick={onClose}>
      <div
        className="quick-switcher-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="quick-switcher-input-wrap">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="quick-switcher-input"
            placeholder="Where would you like to go? (Type channel, DM, or server name)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="quick-switcher-results">
          {items.map((item, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className={`quick-switcher-item ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="item-icon">
                  {item.type === "channel" ? (
                    item.kind === "voice" ? (
                      <Volume2 size={16} />
                    ) : (
                      <Hash size={16} />
                    )
                  ) : item.type === "dm" ? (
                    <User size={16} />
                  ) : (
                    <Server size={16} />
                  )}
                </span>
                <span className="item-name">{item.name}</span>
                <span className="item-badge">{item.type.toUpperCase()}</span>
              </button>
            );
          })}

          {!items.length && (
            <div className="quick-switcher-empty">
              No matching channels, DMs, or servers found.
            </div>
          )}
        </div>
        <div className="quick-switcher-footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
          <span><kbd>↵</kbd> to select</span>
          <span><kbd>ESC</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
