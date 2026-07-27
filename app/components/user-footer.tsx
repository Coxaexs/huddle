"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";
import { PRESENCE, type PresenceStatus } from "@/lib/users";
import type { PublicUser } from "@/lib/users";

interface UserFooterProps {
  user: PublicUser;
  status: PresenceStatus;
  customStatus?: string;
  muted: boolean;
  deafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenStatusMenu: (e: React.MouseEvent) => void;
  onOpenSettings: () => void;
  microphones?: Array<{ deviceId: string; label: string }>;
  speakers?: Array<{ deviceId: string; label: string }>;
  selectedMicId?: string;
  selectedSpeakerId?: string;
  onSelectMic?: (id: string) => void;
  onSelectSpeaker?: (id: string) => void;
}

export function UserFooter({
  user,
  status,
  customStatus,
  muted,
  deafened,
  onToggleMute,
  onToggleDeafen,
  onOpenStatusMenu,
  onOpenSettings,
  microphones = [],
  speakers = [],
  selectedMicId,
  selectedSpeakerId,
  onSelectMic,
  onSelectSpeaker,
}: UserFooterProps) {
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [deafenMenuOpen, setDeafenMenuOpen] = useState(false);

  const micMenuRef = useRef<HTMLDivElement>(null);
  const deafenMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (micMenuRef.current && !micMenuRef.current.contains(e.target as Node)) {
        setMicMenuOpen(false);
      }
      if (deafenMenuRef.current && !deafenMenuRef.current.contains(e.target as Node)) {
        setDeafenMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const presenceInfo = PRESENCE[status] || PRESENCE.online;

  return (
    <footer className="discord-user-footer">
      <div
        className="user-footer-profile"
        onClick={onOpenStatusMenu}
        title={`${user.displayName} · ${customStatus || presenceInfo.label}`}
        role="button"
        tabIndex={0}
      >
        <div className="avatar-wrapper">
          <Avatar
            className="user-footer-avatar"
            avatar={user.avatar}
            avatarUrl={user.avatarUrl}
            color={user.color}
          />
          <span
            className="user-footer-presence-dot"
            style={{ background: presenceInfo.color }}
          />
        </div>
        <div className="user-footer-info">
          <span className="user-footer-name">{user.displayName}</span>
          <span className="user-footer-status">
            {customStatus || presenceInfo.label}
          </span>
        </div>
      </div>

      <div className="user-footer-controls">
        {/* Mic control with chevron dropdown */}
        <div className="control-btn-group" ref={micMenuRef}>
          <button
            type="button"
            className={`user-footer-btn ${muted ? "off" : ""}`}
            onClick={onToggleMute}
            title={muted ? "Unmute Microphone" : "Mute Microphone"}
            aria-label={muted ? "Unmute Microphone" : "Mute Microphone"}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
              </svg>
            )}
          </button>
          <button
            type="button"
            className="user-footer-chevron"
            onClick={() => setMicMenuOpen((o) => !o)}
            aria-label="Input options"
            title="Input options"
          >
            ▾
          </button>

          {micMenuOpen && (
            <div className="user-footer-dropdown-menu">
              <div className="menu-header">INPUT DEVICE</div>
              {microphones.length > 0 ? (
                microphones.map((mic) => (
                  <button
                    key={mic.deviceId}
                    type="button"
                    className={`menu-item ${mic.deviceId === selectedMicId ? "active" : ""}`}
                    onClick={() => {
                      onSelectMic?.(mic.deviceId);
                      setMicMenuOpen(false);
                    }}
                  >
                    {mic.deviceId === selectedMicId && "✓ "}
                    {mic.label || `Microphone (${mic.deviceId.slice(0, 5)})`}
                  </button>
                ))
              ) : (
                <div className="menu-item disabled">Default Microphone</div>
              )}
            </div>
          )}
        </div>

        {/* Headphones control with chevron dropdown */}
        <div className="control-btn-group" ref={deafenMenuRef}>
          <button
            type="button"
            className={`user-footer-btn ${deafened ? "off" : ""}`}
            onClick={onToggleDeafen}
            title={deafened ? "Undeafen" : "Deafen"}
            aria-label={deafened ? "Undeafen" : "Deafen"}
          >
            {deafened ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h3v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-3v8h3c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h3v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-3v8h3c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z"/>
              </svg>
            )}
          </button>
          <button
            type="button"
            className="user-footer-chevron"
            onClick={() => setDeafenMenuOpen((o) => !o)}
            aria-label="Output options"
            title="Output options"
          >
            ▾
          </button>

          {deafenMenuOpen && (
            <div className="user-footer-dropdown-menu">
              <div className="menu-header">OUTPUT DEVICE</div>
              {speakers.length > 0 ? (
                speakers.map((spk) => (
                  <button
                    key={spk.deviceId}
                    type="button"
                    className={`menu-item ${spk.deviceId === selectedSpeakerId ? "active" : ""}`}
                    onClick={() => {
                      onSelectSpeaker?.(spk.deviceId);
                      setDeafenMenuOpen(false);
                    }}
                  >
                    {spk.deviceId === selectedSpeakerId && "✓ "}
                    {spk.label || `Speaker (${spk.deviceId.slice(0, 5)})`}
                  </button>
                ))
              ) : (
                <div className="menu-item disabled">Default Output</div>
              )}
            </div>
          )}
        </div>

        {/* User Settings Gear button */}
        <button
          type="button"
          className="user-footer-btn settings-btn"
          onClick={onOpenSettings}
          title="User Settings"
          aria-label="User Settings"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </footer>
  );
}
