"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VoicePref } from "./user-menu";

export interface BotMenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface BotMenuProps {
  name: string;
  description: string;
  x: number;
  y: number;
  actions: BotMenuAction[];
  voicePref?: VoicePref;
  onVoiceMute?: (muted: boolean) => void;
  onVoiceVolume?: (volume: number) => void;
  onClose: () => void;
}

export function BotMenu({
  name,
  description,
  x,
  y,
  actions,
  voicePref,
  onVoiceMute,
  onVoiceVolume,
  onClose,
}: BotMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => {
    const winW = typeof window !== "undefined" ? window.innerWidth : 1200;
    const winH = typeof window !== "undefined" ? window.innerHeight : 800;
    const estimatedWidth = 240;
    const estimatedHeight = 440;
    return {
      left: Math.max(12, Math.min(x, winW - estimatedWidth - 12)),
      top: Math.max(12, Math.min(y, winH - estimatedHeight - 12)),
    };
  });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const winW = window.innerWidth || 1200;
    const winH = window.innerHeight || 800;
    const padding = 12;

    let nextLeft = x;
    let nextTop = y;

    if (nextLeft + rect.width > winW - padding) {
      nextLeft = Math.max(padding, winW - rect.width - padding);
    }
    if (nextTop + rect.height > winH - padding) {
      nextTop = Math.max(padding, winH - rect.height - padding);
    }

    setPos({ left: nextLeft, top: nextTop });
  }, [x, y, actions.length, Boolean(voicePref)]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
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

  return (
    <div
      className="user-menu bot-menu"
      ref={ref}
      style={{
        left: pos.left,
        top: pos.top,
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
      }}
      role="menu"
    >
      <div className="user-menu-head">
        <strong>{name}</strong>
        <span>{description}</span>
      </div>

      {voicePref && onVoiceMute && onVoiceVolume && (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => onVoiceMute(!voicePref.muted)}
          >
            {voicePref.muted ? "Unmute bot for me" : "Mute bot for me"}
          </button>
          <label className="user-menu-volume">
            <span>Bot volume · {voicePref.volume}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={voicePref.volume}
              onChange={(event) => onVoiceVolume(Number(event.target.value))}
            />
          </label>
          <div className="user-menu-divider" />
        </>
      )}

      {actions.map((action) => (
        <button
          type="button"
          role="menuitem"
          className={action.danger ? "danger" : ""}
          key={action.label}
          onClick={() => {
            action.onSelect();
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
