"use client";

import { useEffect, useRef } from "react";
import type { Member } from "@/lib/users";

export interface UserMenuTarget {
  member: Pick<Member, "id" | "displayName" | "username">;
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

          <div className="user-menu-divider" />
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

      {isSelf && <p className="user-menu-note">This is you.</p>}
    </div>
  );
}
