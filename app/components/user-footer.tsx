"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Headphones, VolumeX, Settings, ChevronDown, Check } from "lucide-react";
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
            {muted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            type="button"
            className="user-footer-chevron"
            onClick={() => setMicMenuOpen((o) => !o)}
            aria-label="Input options"
            title="Input options"
          >
            <ChevronDown size={14} />
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
                    {mic.deviceId === selectedMicId && <Check size={14} className="mr-1 inline" />}
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
            {deafened ? <VolumeX size={18} /> : <Headphones size={18} />}
          </button>
          <button
            type="button"
            className="user-footer-chevron"
            onClick={() => setDeafenMenuOpen((o) => !o)}
            aria-label="Output options"
            title="Output options"
          >
            <ChevronDown size={14} />
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
                    {spk.deviceId === selectedSpeakerId && <Check size={14} className="mr-1 inline" />}
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
          <Settings size={18} />
        </button>
      </div>
    </footer>
  );
}
