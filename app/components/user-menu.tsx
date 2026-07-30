"use client";

import { useEffect, useRef } from "react";
import type { Member } from "@/lib/users";
import { PrideBadges } from "./pride-badges";

export interface UserMenuTarget {
  member: Pick<Member, "id" | "displayName" | "username" | "prideBadges">;
  x: number;
  y: number;
}

export interface VoicePref {
  volume: number;
  muted: boolean;
}

interface UserMenuProps {
  target: UserMenuTarget;
  isSelf: boolean;
  pref: VoicePref;
  serverMuted: boolean;
  onClose: () => void;
  onMessage: () => void;
  onLocalMute: (muted: boolean) => void;
  onVolume: (volume: number) => void;
  onServerMute: (muted: boolean) => void;
  /** Moderation affordances, shown only when the viewer has the permission. */
  canModerate?: boolean;
  canManage?: boolean;
  onKick?: () => void;
  onBan?: () => void;
  /** Shown instead of Ban when this person is already banned. */
  banned?: boolean;
  onUnban?: () => void;
  /** Voice channels this person can be moved into (moderators only). */
  voiceChannels?: Array<{ id: string; name: string }>;
  /** The voice channel this person is currently sitting in, if any. */
  targetVoiceChannelId?: string | null;
  onMove?: (channelId: string) => void;
}

/**
 * Right-click menu for a person: message them, change how you hear them, or
 * mute them for the whole Huddle.
 */
export function UserMenu({
  target,
  isSelf,
  pref,
  serverMuted,
  onClose,
  onMessage,
  onLocalMute,
  onVolume,
  onServerMute,
  canModerate = true,
  canManage = false,
  onKick,
  onBan,
  banned = false,
  onUnban,
  voiceChannels = [],
  targetVoiceChannelId = null,
  onMove,
}: UserMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // A frame's delay, or the click that opened the menu closes it again.
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", dismiss);
      window.addEventListener("contextmenu", dismiss);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep the menu on screen when the click was near an edge.
  const style = {
    left: Math.min(target.x, (globalThis.innerWidth || 1200) - 240),
    top: Math.min(target.y, (globalThis.innerHeight || 800) - 260),
  };

  return (
    <div className="user-menu" ref={ref} style={style} role="menu">
      <div className="user-menu-head">
        <strong>{target.member.displayName}</strong>
        <PrideBadges badges={target.member.prideBadges} mini />
        <span>@{target.member.username}</span>
      </div>

      {!isSelf && (
        <>
          <button type="button" role="menuitem" onClick={onMessage}>
            Message
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onLocalMute(!pref.muted)}
          >
            {pref.muted ? "Unmute for me" : "Mute for me"}
          </button>

          <label className="user-menu-volume">
            <span>Their volume · {pref.volume}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pref.volume}
              onChange={(event) => onVolume(Number(event.target.value))}
            />
          </label>

          {(canModerate || canManage) && <div className="user-menu-divider" />}
          {canModerate && (
            <>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => onServerMute(!serverMuted)}
              >
                {serverMuted ? "Unmute on server" : "Mute on server"}
              </button>
              <p className="user-menu-note">
                Server mute stops their microphone for everyone.
              </p>
            </>
          )}
          {canModerate && onMove && targetVoiceChannelId && (
            <div className="user-menu-move">
              <span className="user-menu-move-label">Move to voice channel</span>
              {voiceChannels
                .filter((channel) => channel.id !== targetVoiceChannelId)
                .map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    role="menuitem"
                    onClick={() => onMove(channel.id)}
                  >
                    ◖)) {channel.name}
                  </button>
                ))}
              {voiceChannels.filter(
                (channel) => channel.id !== targetVoiceChannelId,
              ).length === 0 && (
                <p className="user-menu-note">No other voice channels here.</p>
              )}
            </div>
          )}
          {canManage && onKick && (
            <button type="button" role="menuitem" className="danger" onClick={onKick}>
              Kick from server
            </button>
          )}
          {canManage &&
            (banned
              ? onUnban && (
                  <button type="button" role="menuitem" onClick={onUnban}>
                    Unban
                  </button>
                )
              : onBan && (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={onBan}
                  >
                    Ban from server
                  </button>
                ))}
        </>
      )}

      {isSelf && <p className="user-menu-note">This is you.</p>}
    </div>
  );
}
