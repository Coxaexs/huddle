"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Coffee, Heart, Mail, Server, X } from "lucide-react";
import type { EmbedToParent, ParentToEmbed } from "../landing/say-hi/say-hi-embed";
import type { GuestbookMessage } from "../api/guestbook/route";
import type { DiceRollEvent } from "../../lib/protocol";
import { checkGuestName, MAX_GUEST_NAME } from "../../lib/guestbook";
import { BUILTIN_THEMES } from "../../lib/themes";

/**
 * The live parts of hoffle.online's landing page:
 *
 * - `LiveChannel`: the real, public #say-hi, framed in from /landing/say-hi,
 *   which draws it with the app's own markup, CSS and components. This side
 *   owns the theme pills, the name prompt, posting, and the "get the full app"
 *   dialog for anything outside #say-hi.
 * - `ThemeTour`: the slideshow of theme screenshots. It only moves when asked.
 */

export interface JoinLinks {
  kofi: string;
  sponsors: string;
  selfHost: string;
  /** For asking for a free invite by email. */
  email: string;
}

const EMBED_PATH = "/landing/say-hi";

/* ─── Dialogs ─────────────────────────────────────────────────────────── */

/** A native modal <dialog>: focus trapping, Esc and the backdrop come free. */
function Modal({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-(--line) bg-(--card) p-0 text-(--ink) shadow-2xl backdrop:bg-black/55"
    >
      {open && <div className="p-6 sm:p-7">{children}</div>}
    </dialog>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" className="-mr-2 -mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-(--paper-2)">
      <X aria-hidden className="h-5 w-5 text-(--muted)" />
    </button>
  );
}

const dialogButton = "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 transition";

function JoinDialog({ what, onClose, links }: { what: string | null; onClose: () => void; links: JoinLinks }) {
  const subject = what ? `${what.charAt(0).toUpperCase()}${what.slice(1)} is` : "That's";
  return (
    <Modal open={what !== null} onClose={onClose} labelledBy="join-title">
      <div className="flex items-start justify-between gap-4">
        <h2 id="join-title" className="lp-display text-2xl font-bold leading-tight">Try the whole Hoffle</h2>
        <CloseButton onClick={onClose} />
      </div>
      <p className="mt-2 leading-relaxed text-(--ink-2)">
        {subject} part of the full app. This page only has #say-hi; the real thing has every channel, voice rooms,
        1080p screen sharing and the music bot. Two ways in:
      </p>

      <div className="mt-5 rounded-xl border border-(--line) bg-(--paper-2) p-4">
        <h3 className="font-bold">Get an invite code</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-(--ink-2)">
          chat.hoffle.online is invite-only. Support Hoffle with $5 and you'll get an invite code: leave your email in the
          message and the code comes by email. Know someone who's already on it? They can invite you too. Don't know
          anyone yet and just want to try it? Mail me and ask.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={links.kofi} target="_blank" rel="noopener noreferrer" className={`${dialogButton} bg-(--violet-fill) text-[14px] font-semibold text-white hover:bg-(--violet-fill-hover)`}>
            <Coffee aria-hidden className="h-4 w-4" /> $5 on Ko-fi
          </a>
          <a href={links.sponsors} target="_blank" rel="noopener noreferrer" className={`${dialogButton} border border-(--line) bg-(--card) text-[14px] font-semibold text-(--ink) hover:border-(--ink)`}>
            <Heart aria-hidden className="h-4 w-4 text-[#ea4aaa]" /> $5 on GitHub Sponsors
          </a>
          <a
            href={`mailto:${links.email}?subject=${encodeURIComponent("Hoffle invite")}&body=${encodeURIComponent("Hi! I'd like to try Hoffle. Could I have an invite code?")}`}
            className={`${dialogButton} border border-(--line) bg-(--card) text-[14px] font-semibold text-(--ink) hover:border-(--ink)`}
          >
            <Mail aria-hidden className="h-4 w-4" /> Mail me
          </a>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-(--line) p-4">
        <h3 className="font-bold">Host your own</h3>
        <p className="mt-1 text-[15px] leading-relaxed text-(--ink-2)">
          Free, with Docker, on a spare PC or a small server. The first account becomes the owner and invites everyone else.
        </p>
        <a href={links.selfHost} className={`${dialogButton} mt-3 border border-(--line) bg-(--card) text-[14px] font-semibold text-(--ink) hover:border-(--ink)`}>
          <Server aria-hidden className="h-4 w-4" /> Self-hosting guide
        </a>
      </div>
    </Modal>
  );
}

const NAME_KEY = "hoffle-say-hi-name";

function NameDialog({
  text,
  onCancel,
  onSend,
}: {
  text: string | null;
  onCancel: () => void;
  onSend: (name: string) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roll = text?.startsWith("/roll") ?? false;

  useEffect(() => {
    if (text === null) return;
    setError(null);
    setBusy(false);
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* private mode: start blank */
    }
  }, [text]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = checkGuestName(name);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    const problem = await onSend(checked.value);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Modal open={text !== null} onClose={onCancel} labelledBy="name-title">
      <form onSubmit={submit}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="name-title" className="lp-display text-2xl font-bold leading-tight">
            {roll ? "What name should we roll this under?" : "What name should we send this with?"}
          </h2>
          <CloseButton onClick={onCancel} />
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-(--ink-2)">Everyone on this page will see it under this name.</p>
        <blockquote className="mt-4 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border-l-[3px] border-(--violet) bg-(--paper-2) px-3 py-2 text-[15px] text-(--ink-2)">
          {text}
        </blockquote>
        <label htmlFor="say-hi-name" className="mt-5 block text-sm font-semibold">Your name</label>
        <input
          id="say-hi-name"
          autoFocus
          autoComplete="nickname"
          maxLength={MAX_GUEST_NAME}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "say-hi-name-error" : undefined}
          className="mt-1.5 h-11 w-full rounded-lg border border-(--line) bg-(--paper) px-3 text-[16px] text-(--ink) outline-none focus:border-(--violet)"
          placeholder="e.g. Sam"
        />
        {error && (
          <p id="say-hi-name-error" role="alert" className="mt-2 text-sm font-semibold text-[#d2452f]">{error}</p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={`${dialogButton} border border-(--line) bg-(--card) hover:border-(--ink)`}>
            <span className="text-[14px] font-semibold text-(--ink)">Cancel</span>
          </button>
          <button type="submit" disabled={busy} className={`${dialogButton} bg-(--violet-fill) hover:bg-(--violet-fill-hover) disabled:opacity-60`}>
            <span className="text-[14px] font-semibold text-white">{busy ? "Sending…" : roll ? "Roll" : "Send message"}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ─── The live channel (hero) ─────────────────────────────────────────── */

function isEmbedMessage(event: MessageEvent, frame: HTMLIFrameElement | null): event is MessageEvent<EmbedToParent> {
  return (
    event.origin === window.location.origin &&
    Boolean(frame) &&
    event.source === frame!.contentWindow &&
    (event.data as { hoffle?: string } | null)?.hoffle === "say-hi"
  );
}

export function LiveChannel({ links }: { links: JoinLinks }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [themeId, setThemeId] = useState("cozy");
  const themeRef = useRef(themeId);
  themeRef.current = themeId;
  const picked = useRef(false);
  const [pending, setPending] = useState<{ text: string; diceTheme: string } | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  const toEmbed = (message: ParentToEmbed) => frameRef.current?.contentWindow?.postMessage(message, window.location.origin);

  const pickTheme = (id: string) => {
    setThemeId(id);
    toEmbed({ hoffle: "say-hi", type: "theme", id });
  };

  // Start on the site's own light or dark look until someone picks a theme.
  useEffect(() => {
    const sync = () => {
      if (!picked.current) pickTheme(document.documentElement.dataset.lpTheme === "light" ? "light" : "cozy");
    };
    sync();
    window.addEventListener("lp-theme-change", sync);
    return () => window.removeEventListener("lp-theme-change", sync);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isEmbedMessage(event, frameRef.current)) return;
      const data = event.data;
      if (data.type === "ready") toEmbed({ hoffle: "say-hi", type: "theme", id: themeRef.current });
      if (data.type === "compose") setPending({ text: data.text, diceTheme: data.diceTheme });
      if (data.type === "locked") setLocked(data.what);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function send(name: string): Promise<string | null> {
    if (pending === null) return null;
    try {
      const response = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, text: pending.text, diceTheme: pending.diceTheme }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: GuestbookMessage;
        roll?: DiceRollEvent;
        error?: string;
        field?: string;
      };
      if (!response.ok || !data.message) {
        if (data.field === "name") return data.error ?? "That name can't be used.";
        // A problem with the message itself shows under the message box, as in the app.
        setPending(null);
        toEmbed({ hoffle: "say-hi", type: "error", error: data.error ?? "That didn't go through. Try again in a moment." });
        return null;
      }
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {
        /* sent anyway */
      }
      setPending(null);
      toEmbed({ hoffle: "say-hi", type: "sent", message: data.message, roll: data.roll, name });
      return null;
    } catch {
      return "Couldn't reach Hoffle. Check your connection and try again.";
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3">
        <p className="text-sm text-(--muted)">
          <b className="text-(--ink)">This is a real, public channel.</b> Say hi and everyone on this page sees it, or try{" "}
          <code className="rounded bg-(--paper-2) px-1.5 py-0.5 text-[13px] text-(--ink)">/roll d20</code>. In any theme:
        </p>
        <div role="group" aria-label="Theme" className="flex flex-wrap gap-1.5">
          {BUILTIN_THEMES.map((theme) => {
            const selected = theme.id === themeId;
            const c = theme.colors;
            return (
              <button
                key={theme.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  picked.current = true;
                  pickTheme(theme.id);
                }}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 transition ${
                  selected ? "border-(--ink) bg-(--ink)" : "border-(--line) bg-(--card) hover:border-(--ink-2)"
                }`}
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15"
                  style={{ background: `linear-gradient(90deg, ${c.paper} 0 33%, ${c.panel} 33% 66%, ${c.lavender} 66%)` }}
                />
                {/* The chat app's global `button` rule resets colour and font, so they live on the span. */}
                <span className={`text-[13px] font-semibold ${selected ? "text-(--paper)" : "text-(--ink-2)"}`}>{theme.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-(--line) shadow-[0_40px_80px_-40px_rgba(40,28,10,.45)]">
        <iframe
          ref={frameRef}
          src={`${EMBED_PATH}?theme=cozy`}
          title="#say-hi, a live Hoffle channel"
          className="block h-[600px] w-full sm:h-[620px]"
        />
      </div>
      <NameDialog text={pending?.text ?? null} onCancel={() => setPending(null)} onSend={send} />
      <JoinDialog what={locked} onClose={() => setLocked(null)} links={links} />
    </div>
  );
}

/* ─── Theme tour ─────────────────────────────────────────────────────── */

/** Digital rain for the Matrix slide's background, drawn with CSS. */
export function MatrixRain() {
  const glyphs = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789:=*+-<>";
  const columns = 22;
  return (
    <div aria-hidden className="lp-rain">
      <style href="hoffle-landing-rain" precedence="default">{`
        .lp-rain { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .lp-rain span { position: absolute; top: 0; width: 1ch; word-break: break-all; line-height: 1.15; font: 14px "Share Tech Mono", ui-monospace, monospace; color: #00ff66; text-shadow: 0 0 6px rgba(0,255,102,.6); animation: lp-fall linear infinite; -webkit-mask-image: linear-gradient(transparent, #000 75%); mask-image: linear-gradient(transparent, #000 75%); }
        @keyframes lp-fall { from { transform: translateY(-70%); } to { transform: translateY(110%); } }
        @media (prefers-reduced-motion: reduce) { .lp-rain span { animation: none; } }
      `}</style>
      {Array.from({ length: columns }, (_, i) => (
        <span
          key={i}
          style={{ left: `${(i / columns) * 100 + 0.8}%`, animationDuration: `${6 + ((i * 37) % 7)}s`, animationDelay: `-${(i * 53) % 9}s` }}
        >
          {Array.from({ length: 28 }, (_, j) => glyphs[(i * 7 + j * 13) % glyphs.length]).join("")}
        </span>
      ))}
    </div>
  );
}

/* ─── Slideshow ───────────────────────────────────────────────────────── */

export interface TourSlide {
  id: string;
  label: string;
  /** CSS background for the whole section while this slide shows. */
  background: string;
  content: ReactNode;
}

/** Moves only when someone presses next, previous or a dot; never on a timer. */
export function ThemeTour({ slides }: { slides: TourSlide[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const go = (next: number) => setIndex((next + count) % count);
  const nextLabel = slides[(index + 1) % count].label;

  return (
    <section
      id="themes"
      aria-roledescription="carousel"
      aria-label="Theme tour"
      className="relative scroll-mt-4 overflow-hidden px-4 pb-24 pt-12 sm:px-6 sm:pt-14"
      style={{ background: slides[index].background }}
    >
      <span id="msn" aria-hidden className="absolute top-0" />
      <div className="relative z-10 mx-auto mb-10 flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] font-bold uppercase tracking-[.14em] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,.35)]">
          Theme tour · {index + 1} of {count}
        </p>
        <div className="flex items-center gap-2 rounded-full bg-black/30 p-1 backdrop-blur-sm">
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous theme" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
            <ChevronLeft aria-hidden className="h-5 w-5 text-white" />
          </button>
          <div className="flex items-center gap-1.5 px-1">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show ${slide.label}`}
                aria-current={i === index ? "true" : undefined}
                className={`h-2.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2.5 bg-white/45 hover:bg-white/70"}`}
              />
            ))}
          </div>
          <button type="button" onClick={() => go(index + 1)} className="inline-flex h-9 items-center gap-1 rounded-full bg-white/90 pl-3.5 pr-2 hover:bg-white">
            <span className="text-[13px] font-semibold text-[#17151f]">Next: {nextLabel}</span>
            <ChevronRight aria-hidden className="h-4 w-4 text-[#17151f]" />
          </button>
        </div>
      </div>
      <div aria-live="polite">
        {slides.map((slide, i) => (
          <div key={slide.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}: ${slide.label}`} hidden={i !== index}>
            {slide.content}
          </div>
        ))}
      </div>
    </section>
  );
}
