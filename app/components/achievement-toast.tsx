"use client";

import { useEffect, useRef, useState } from "react";
import { Award, MessageSquare, Mic, Users, Calendar, CheckCircle2, X } from "lucide-react";
import { showToast } from "./toast";

/** Reads the live theme id from <html data-custom-theme-id="...">. */
function currentThemeId(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.dataset.customThemeId || "";
}

function isMinecraftTheme(): boolean {
  return currentThemeId() === "minecraft";
}

function isMsnTheme(): boolean {
  const id = currentThemeId();
  return id === "msn" || id === "msn-dark" || id.startsWith("msn");
}

function isCampfireTheme(): boolean {
  // The "amber" theme is the fireside/warm one; also matches any theme
  // containing "campfire" or "fire" just in case.
  const id = currentThemeId();
  return id === "amber" || id.includes("campfire") || id.includes("fire");
}

const ACHIEVEMENT_ICONS: Record<string, typeof Award> = {
  "first-steps": MessageSquare,
  chatterbox: MessageSquare,
  "big-talker": MessageSquare,
  "voice-newcomer": Mic,
  "voice-regular": Mic,
  "voice-veteran": Mic,
  "social-butterfly": Users,
  weekender: Calendar,
  "helpful-hand": CheckCircle2,
};

export interface EarnedAchievement {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export interface AchievementToastProps {
  /** Achievements just earned that still need a themed popup. */
  earned: EarnedAchievement[];
  onDismiss?: () => void;
}

export function AchievementToast({ earned, onDismiss }: AchievementToastProps) {
  const [queue, setQueue] = useState<EarnedAchievement[]>([]);
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!earned.length) return;
    const next = earned.filter((a) => !shownRef.current.has(a.id));
    if (!next.length) return;
    for (const a of next) shownRef.current.add(a.id);
    setQueue((current) => [...current, ...next]);
  }, [earned]);

  if (!queue.length) return null;

  const first = queue[0];
  const Icon = ACHIEVEMENT_ICONS[first.id] || Award;
  const isMine = isMinecraftTheme();
  const isMsn = isMsnTheme();
  const isCamp = isCampfireTheme();

  // Play a theme-appropriate sound (best effort).
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !isMsn && !isMine) {
        // Default ding for non-themed toasts.
      }
    } catch {
      // Ignored.
    }
  }, [first.id, isMine, isMsn, isCamp]);

  const dismiss = () => {
    setQueue((current) => current.slice(1));
    onDismiss?.();
  };

  // ---- Theme-specific popups ----

  if (isMine) {
    // Minecraft "Achievement Get!" popup: dark slate, yellow text, bevel border.
    return (
      <div
        className="achievement-toast achievement-toast-minecraft"
        onClick={dismiss}
        role="alert"
        aria-label={`Achievement earned: ${first.label}`}
      >
        <div className="achievement-mc-frame">
          <div className="achievement-mc-header">Achievement Get!</div>
          <div className="achievement-mc-body">
            <div className="achievement-mc-icon">
              <Icon size={20} />
            </div>
            <div className="achievement-mc-text">
              <div className="achievement-mc-title">{first.label}</div>
              <div className="achievement-mc-desc">{first.description}</div>
            </div>
          </div>
          <div className="achievement-mc-hint">Click to dismiss</div>
        </div>
      </div>
    );
  }

  if (isMsn) {
    // MSN Messenger alert: blue title bar, "says:" style, news ticker feel.
    return (
      <div
        className="achievement-toast achievement-toast-msn"
        onClick={dismiss}
        role="alert"
        aria-label={`Achievement earned: ${first.label}`}
      >
        <div className="achievement-msn-window">
          <div className="achievement-msn-titlebar">
            <span className="achievement-msn-title">MSN Alert</span>
            <button className="achievement-msn-close" onClick={dismiss} aria-label="Close">
              ×
            </button>
          </div>
          <div className="achievement-msn-body">
            <div className="achievement-msn-icon">
              <Icon size={16} />
            </div>
            <div className="achievement-msn-text">
              <div className="achievement-msn-header">Hoffle says:</div>
              <div className="achievement-msn-label">You earned an achievement!</div>
              <div className="achievement-msn-achievement">
                <strong>{first.label}</strong>
              </div>
              <div className="achievement-msn-desc">{first.description}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isCamp) {
    // Campfire/amber: warm glow, a bat delivers the badge.
    return (
      <div
        className="achievement-toast achievement-toast-campfire"
        onClick={dismiss}
        role="alert"
        aria-label={`Achievement earned: ${first.label}`}
      >
        <div className="achievement-camp-card">
          <div className="achievement-camp-bat">🦇</div>
          <div className="achievement-camp-body">
            <div className="achievement-camp-icon">
              <Icon size={18} />
            </div>
            <div className="achievement-camp-text">
              <div className="achievement-camp-title">A bat brings you an achievement</div>
              <div className="achievement-camp-label">{first.label}</div>
              <div className="achievement-camp-desc">{first.description}</div>
            </div>
          </div>
          <button className="achievement-camp-dismiss" onClick={dismiss} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  // Default theme: clean cozy toast.
  return (
    <div
      className="achievement-toast achievement-toast-default"
      onClick={dismiss}
      role="alert"
      aria-label={`Achievement earned: ${first.label}`}
    >
      <div className="achievement-default-card">
        <div className="achievement-default-icon">
          <Icon size={18} />
        </div>
        <div className="achievement-default-text">
          <div className="achievement-default-title">Achievement earned</div>
          <div className="achievement-default-label">{first.label}</div>
          <div className="achievement-default-desc">{first.description}</div>
        </div>
        <button className="achievement-default-dismiss" onClick={dismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
