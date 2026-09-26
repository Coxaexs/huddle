"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "./avatar";

/**
 * Extra furniture the MSN Messenger theme needs that CSS alone can't draw:
 * the display-picture column beside the conversation and the banner at the
 * foot of the contact list. Everything renders only while that theme is on.
 */

/** True while the MSN Messenger theme is the active one. */
export function useMsnTheme(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setOn(root.dataset.customThemeId === "msn");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return on;
}

interface Picture {
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  color: string;
}

function DisplayPicture({ who, caption }: { who: Picture; caption: string }) {
  return (
    <figure className="msn-dp">
      <div className="msn-dp-frame">
        <Avatar
          className="msn-dp-image"
          avatar={who.avatar}
          avatarUrl={who.avatarUrl}
          color={who.color}
          title={who.name}
        />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** Their picture beside the history, yours beside the typing box. */
export function MsnDisplayPictures({ them, me }: { them: Picture; me: Picture | null }) {
  return (
    <aside className="msn-dp-column" aria-hidden="true">
      <DisplayPicture who={them} caption={them.name} />
      {me && <DisplayPicture who={me} caption={me.name} />}
    </aside>
  );
}

/** The banner strip that sat under every contact list. */
export function MsnAdBanner({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="msn-ad" onClick={onClick}>
      <span className="msn-ad-art" aria-hidden="true">
        <span />
        <span />
      </span>
      <span className="msn-ad-copy">
        <strong>Invite your friends to Huddle!</strong>
        <em>Click here to add a contact</em>
      </span>
    </button>
  );
}

/**
 * Shakes the whole window the way Messenger did when a nudge arrived, with a
 * short synthesized rattle. Works in every theme; nudges aren't MSN-only.
 */
export function playNudge() {
  const shell = document.querySelector(".app-shell");
  if (shell) {
    shell.classList.remove("nudging");
    // Force a reflow so back-to-back nudges restart the animation.
    void (shell as HTMLElement).offsetWidth;
    shell.classList.add("nudging");
    window.setTimeout(() => shell.classList.remove("nudging"), 900);
  }
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Eight quick knocks, falling in pitch: the "brrr-rattle" of a nudge.
    for (let i = 0; i < 8; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 180 - i * 9;
      const at = now + i * 0.055;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.05);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // No audio (autoplay policy, old browser): the shake alone still lands.
  }
}

/** Conversation backgrounds for the history pane, all drawn in CSS (see globals.css). */
export const MSN_BACKGROUNDS = [
  { id: "none", name: "None" },
  { id: "sky", name: "Blue Sky" },
  { id: "dots", name: "Polka Dots" },
  { id: "hearts", name: "Hearts" },
  { id: "stripes", name: "Candy Stripes" },
  { id: "sunset", name: "Sunset" },
  { id: "grass", name: "Meadow" },
  { id: "night", name: "Starry Night" },
  { id: "checks", name: "Checkers" },
] as const;

const BG_KEY = (channelId: string) => `huddle-msn-bg:${channelId}`;

function readBackground(channelId: string | null): string {
  if (!channelId) return "none";
  try {
    return window.localStorage.getItem(BG_KEY(channelId)) || "none";
  } catch {
    return "none";
  }
}

/** Picks a background per conversation, remembered on this device. */
function BackgroundPicker({
  channelId,
  onClose,
}: {
  channelId: string;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(() => readBackground(channelId));
  const pick = (id: string) => {
    setCurrent(id);
    try {
      window.localStorage.setItem(BG_KEY(channelId), id);
    } catch {
      // Storage blocked: still applies for this visit.
    }
    document.documentElement.dataset.msnBg = id;
  };
  return (
    <div className="msn-popover msn-bg-picker" role="dialog" aria-label="Backgrounds">
      <div className="msn-popover-title">
        Backgrounds
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="msn-bg-grid">
        {MSN_BACKGROUNDS.map((bg) => (
          <button
            key={bg.id}
            type="button"
            className={`msn-bg-swatch ${current === bg.id ? "active" : ""}`}
            onClick={() => pick(bg.id)}
            title={bg.name}
          >
            <span className="msn-bg-preview" data-msn-bg-preview={bg.id} />
            <span>{bg.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const INKS = ["#000000", "#d4352b", "#1c5ec6", "#3fa82f", "#e3a300", "#8e3fbf"];

/** The Handwriting ink pad: draw, then it's attached to your message as a picture. */
function HandwritingPad({ onDone, onClose }: { onDone: (file: File) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(INKS[0]);
  const [width, setWidth] = useState(3);
  const [eraser, setEraser] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = eraser ? "#ffffff" : ink;
    ctx.lineWidth = eraser ? width * 4 : width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  };

  const finish = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      onDone(new File([blob], `handwriting-${Date.now()}.png`, { type: "image/png" }));
    }, "image/png");
  };

  return (
    <div className="msn-popover msn-ink-pad" role="dialog" aria-label="Handwriting">
      <div className="msn-popover-title">
        Handwriting
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <canvas
        ref={canvasRef}
        width={480}
        height={200}
        className="msn-ink-canvas"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const at = point(event);
          drawing.current = at;
          stroke(at, { x: at.x + 0.1, y: at.y + 0.1 });
          setDirty(true);
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const at = point(event);
          stroke(drawing.current, at);
          drawing.current = at;
        }}
        onPointerUp={() => {
          drawing.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = null;
        }}
      />
      <div className="msn-ink-tools">
        {INKS.map((colour) => (
          <button
            key={colour}
            type="button"
            className={`msn-ink-swatch ${!eraser && ink === colour ? "active" : ""}`}
            style={{ background: colour }}
            onClick={() => {
              setInk(colour);
              setEraser(false);
            }}
            aria-label={`Ink ${colour}`}
          />
        ))}
        <span className="msn-fmt-sep" />
        {[2, 3, 6].map((w) => (
          <button
            key={w}
            type="button"
            className={`msn-ink-width ${width === w ? "active" : ""}`}
            onClick={() => setWidth(w)}
            aria-label={`Pen width ${w}`}
          >
            <span style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
        <button
          type="button"
          className={`msn-ink-text ${eraser ? "active" : ""}`}
          onClick={() => setEraser((e) => !e)}
        >
          Eraser
        </button>
        <button type="button" className="msn-ink-text" onClick={clear}>
          Clear
        </button>
        <button type="button" className="msn-ink-send" onClick={finish} disabled={!dirty}>
          Attach
        </button>
      </div>
    </div>
  );
}

interface ToolbarProps {
  onFont: () => void;
  onEmoticons: () => void;
  onNudge: () => void;
  onVoiceClip: () => void;
  onWinks: () => void;
  onHandwriting: (file: File) => void;
  channelId: string | null;
  nudgeCooling: boolean;
}

/** The strip above the typing box: Font, Emoticons, Winks, Voice Clip, Handwriting, Backgrounds, Nudge. */
export function MsnFormatToolbar({
  onFont,
  onEmoticons,
  onNudge,
  onVoiceClip,
  onWinks,
  onHandwriting,
  channelId,
  nudgeCooling,
}: ToolbarProps) {
  const [open, setOpen] = useState<"ink" | "bg" | null>(null);

  // Each conversation remembers its own background.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.msnBg = readBackground(channelId);
    setOpen(null);
    return () => {
      delete root.dataset.msnBg;
    };
  }, [channelId]);

  return (
    <div className="msn-format-bar" role="toolbar" aria-label="Formatting">
      {open === "ink" && (
        <HandwritingPad
          onClose={() => setOpen(null)}
          onDone={(file) => {
            onHandwriting(file);
            setOpen(null);
          }}
        />
      )}
      {open === "bg" && channelId && (
        <BackgroundPicker channelId={channelId} onClose={() => setOpen(null)} />
      )}
      <button type="button" onClick={onFont} title="Change the font (bold)">
        <span className="msn-fmt-font">A</span>
      </button>
      <button type="button" onClick={onEmoticons} title="Select an emoticon">
        <span className="msn-fmt-smile">☺</span>
        <span className="msn-fmt-drop" />
      </button>
      <button type="button" onClick={onWinks} title="Send a wink (animated GIF)">
        <span className="msn-fmt-icon">😉</span>
        <span>Winks</span>
      </button>
      <span className="msn-fmt-sep" />
      <button type="button" onClick={onVoiceClip} title="Voice clip">
        <span className="msn-fmt-icon">🎤</span>
        <span>Voice Clip</span>
      </button>
      <button
        type="button"
        className={open === "ink" ? "active" : ""}
        onClick={() => setOpen((o) => (o === "ink" ? null : "ink"))}
        title="Handwriting"
      >
        <span className="msn-fmt-icon">✎</span>
        <span>Handwriting</span>
      </button>
      <button
        type="button"
        className={open === "bg" ? "active" : ""}
        onClick={() => setOpen((o) => (o === "bg" ? null : "bg"))}
        disabled={!channelId}
        title="Backgrounds"
      >
        <span className="msn-fmt-icon">🖼</span>
        <span>Backgrounds</span>
      </button>
      <span className="msn-fmt-sep" />
      <button type="button" onClick={onNudge} disabled={nudgeCooling} title="Send a nudge">
        <span className="msn-fmt-icon msn-fmt-nudge">〰</span>
        <span>Nudge</span>
      </button>
    </div>
  );
}

/** The two-note "ding-dong" Messenger played when a contact signed in. */
function playSignInChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [
      { freq: 1046.5, at: 0 },
      { freq: 784, at: 0.16 },
    ].forEach(({ freq, at }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.16, now + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.55);
    });
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    // Autoplay blocked: the toast still shows.
  }
}

interface ToastPerson extends Picture {
  id: string;
}

/**
 * "Alice has just signed in." — the little window that slid up above the
 * taskbar. Watches the online set and pops one per contact who comes online.
 */
export function MsnSignInToasts({
  online,
  people,
  selfId,
  connected,
  onOpen,
}: {
  online: Set<string>;
  people: ToastPerson[];
  selfId: string | null;
  connected: boolean;
  onOpen: (id: string) => void;
}) {
  const [toasts, setToasts] = useState<Array<ToastPerson & { key: number }>>([]);
  const seen = useRef<Set<string> | null>(null);
  const settledAt = useRef(0);

  useEffect(() => {
    // The first snapshot after (re)connecting is everyone already online, not
    // people signing in; give presence a moment to settle before announcing.
    if (!connected) {
      seen.current = null;
      return;
    }
    if (!seen.current) {
      seen.current = new Set(online);
      settledAt.current = Date.now() + 4000;
      return;
    }
    const arrivals = [...online].filter((id) => !seen.current!.has(id) && id !== selfId);
    seen.current = new Set(online);
    if (!arrivals.length || Date.now() < settledAt.current) return;
    const found = arrivals
      .map((id) => people.find((p) => p.id === id))
      .filter((p): p is ToastPerson => Boolean(p));
    if (!found.length) return;
    playSignInChime();
    setToasts((current) =>
      [...current, ...found.map((p, i) => ({ ...p, key: Date.now() + i }))].slice(-3),
    );
  }, [online, people, selfId, connected]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), 6000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  if (!toasts.length) return null;
  return (
    <div className="msn-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.key} className="msn-toast">
          <div className="msn-toast-title">
            <span>Huddle Messenger</span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setToasts((current) => current.filter((t) => t.key !== toast.key))}
            >
              ×
            </button>
          </div>
          <button type="button" className="msn-toast-body" onClick={() => onOpen(toast.id)}>
            <Avatar
              className="msn-toast-avatar"
              avatar={toast.avatar}
              avatarUrl={toast.avatarUrl}
              color={toast.color}
            />
            <span>
              <strong>{toast.name}</strong> has just signed in.
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}

/** Messenger's extra statuses, stored as a base presence plus a status line. */
export const MSN_EXTRA_STATUSES = [
  { label: "Be Right Back", status: "idle", text: "Be Right Back" },
  { label: "On the Phone", status: "dnd", text: "On the Phone" },
  { label: "Out to Lunch", status: "idle", text: "Out to Lunch" },
] as const;
