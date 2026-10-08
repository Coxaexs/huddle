"use client";

import { useEffect, type ReactNode } from "react";
import {
  AtSign,
  Check,
  ChevronLeft,
  ChevronRight,
  Command,
  Compass,
  Dices,
  Gamepad2,
  GraduationCap,
  Headphones,
  Keyboard,
  MessageSquare,
  Palette,
  Sparkles,
  UserRound,
  Vote,
  X,
} from "lucide-react";
import type { DiceRollEvent } from "@/lib/protocol";
import { BUILTIN_THEMES, type Theme } from "@/lib/themes";

/**
 * The welcome tutorial: a theme picker, then five pages on how Hoffle works.
 *
 * It opens by itself right after signing up, and any time from Settings →
 * Tutorial. Every page can go back, forward, or close. The "Try it" buttons
 * do the real thing in the app; while you try something the tutorial folds
 * into a small pill (`TutorialPill`) that brings you back to the same page.
 */

/** Set at signup, cleared once the tutorial is closed or finished. */
export const TUTORIAL_PENDING_KEY = "hoffle-tutorial-pending";

export interface TutorialActions {
  activeThemeId: string;
  onTheme: (theme: Theme) => void;
  openSwitcher: () => void;
  /** Joins the first voice room of the open server; null when it has none. */
  joinVoice: { name: string; run: () => void } | null;
  openFormat: () => void;
  openPoll: () => void;
  rollDice: () => void;
  openGames: () => void;
  openProfile: () => void;
  openShortcuts: () => void;
}

interface Page {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  tries?: { label: string; icon: ReactNode; run: () => void }[];
}

const STYLE = `
.tutorial-backdrop { position: fixed; inset: 0; z-index: 130; display: grid; place-items: center; padding: 20px;
  background: color-mix(in srgb, var(--paper, #16131f) 55%, transparent); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
.tutorial-card { width: min(640px, 100%); max-height: min(720px, calc(var(--app-height, 100vh) - 40px)); display: flex; flex-direction: column;
  background: var(--panel, #1a1628); color: var(--ink, #e8e3f5); border: 1px solid var(--line, rgba(255,255,255,.08));
  border-radius: calc(var(--ui-corners, 16px) + 4px); box-shadow: 0 28px 90px rgba(0,0,0,.45); overflow: hidden; }
.tutorial-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px 0; }
.tutorial-step { font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--lavender, #a78bfa); }
.tutorial-close { margin-left: auto; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 999px;
  background: transparent; color: var(--muted, #9d95bc); cursor: pointer; }
.tutorial-close:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); color: var(--ink); }
.tutorial-body { padding: 8px 22px 18px; overflow-y: auto; }
.tutorial-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-top: 6px; border-radius: calc(var(--ui-corners, 16px) - 2px);
  background: var(--lavender-soft, rgba(167,139,250,.15)); color: var(--lavender, #a78bfa); }
.tutorial-title { margin: 14px 0 6px; font: 400 28px/1.15 var(--font-display, inherit); }
.tutorial-text { margin: 0; color: var(--muted, #9d95bc); font-size: 15px; line-height: 1.6; }
.tutorial-text b { color: var(--ink); font-weight: 700; }
.tutorial-text kbd { padding: 1px 6px; border: 1px solid var(--line); border-radius: 6px; font-size: 12px; color: var(--ink); background: color-mix(in srgb, var(--ink) 6%, transparent); }
.tutorial-list { margin: 12px 0 0; padding-left: 18px; list-style: disc; color: var(--muted); font-size: 14px; line-height: 1.6; }
.tutorial-tries { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.tutorial-try { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--lavender) 55%, transparent); border-radius: calc(var(--ui-corners, 16px) - 4px);
  background: var(--lavender-soft, rgba(167,139,250,.15)); color: var(--ink); font-weight: 700; font-size: 14px; }
.tutorial-try:hover { border-color: var(--lavender); }
.tutorial-themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; margin-top: 16px; }
.tutorial-theme { position: relative; display: flex; align-items: center; gap: 10px; padding: 10px; cursor: pointer; text-align: left;
  border: 1px solid var(--line); border-radius: calc(var(--ui-corners, 16px) - 4px); background: color-mix(in srgb, var(--ink) 3%, transparent); color: var(--ink); }
.tutorial-theme:hover { border-color: color-mix(in srgb, var(--lavender) 60%, transparent); }
.tutorial-theme[aria-pressed="true"] { border-color: var(--lavender); box-shadow: 0 0 0 1px var(--lavender); }
.tutorial-swatch { flex: none; width: 34px; height: 34px; border-radius: 10px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
.tutorial-theme-name { font-weight: 700; font-size: 14px; }
.tutorial-check { position: absolute; top: 6px; right: 6px; color: var(--lavender); }
.tutorial-foot { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--line); }
.tutorial-dots { display: flex; gap: 6px; }
.tutorial-dots span { width: 7px; height: 7px; border-radius: 999px; background: color-mix(in srgb, var(--ink) 22%, transparent); transition: width .2s; }
.tutorial-dots span.on { width: 20px; background: var(--lavender); }
.tutorial-nav { margin-left: auto; display: flex; gap: 8px; }
.tutorial-btn { display: inline-flex; align-items: center; gap: 4px; height: 38px; padding: 0 14px; cursor: pointer; font-weight: 700; font-size: 14px;
  border-radius: calc(var(--ui-corners, 16px) - 4px); border: 1px solid var(--line); background: transparent; color: var(--ink); }
.tutorial-btn.primary { border-color: transparent; background: var(--lavender); color: var(--on-accent, #15121f); }
.tutorial-pill { position: fixed; z-index: 125; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  display: inline-flex; align-items: center; height: 40px; padding: 0 6px 0 16px; border-radius: 999px;
  border: 1px solid var(--lavender); background: var(--panel); color: var(--ink); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.tutorial-pill button { border: 0; background: transparent; color: var(--ink); cursor: pointer; }
.tutorial-pill-resume { display: inline-flex; align-items: center; gap: 8px; height: 100%; font-weight: 700; font-size: 14px; white-space: nowrap; }
.tutorial-pill-close { display: grid; place-items: center; width: 30px; height: 30px; margin-left: 6px; border-radius: 999px; color: var(--muted) !important; }
.tutorial-pill-close:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
@media (max-width: 560px) {
  .tutorial-backdrop { padding: 10px; }
  .tutorial-title { font-size: 24px; }
  .tutorial-themes { grid-template-columns: 1fr 1fr; }
}
`;

function pages(actions: TutorialActions): Page[] {
  return [
    {
      icon: <Palette size={24} />,
      title: "Pick your look",
      body: (
        <>
          <p className="tutorial-text">
            Hoffle comes with twelve themes, and some change more than colours: MSN Messenger rebuilds the whole layout.
            Click one to try it on. You can change it any time in <b>Settings → Appearance</b>.
          </p>
          <div className="tutorial-themes">
            {BUILTIN_THEMES.map((theme) => {
              const c = theme.colors;
              const selected = theme.id === actions.activeThemeId;
              return (
                <button key={theme.id} type="button" className="tutorial-theme" aria-pressed={selected} onClick={() => actions.onTheme(theme)}>
                  <span
                    className="tutorial-swatch"
                    style={{ background: `linear-gradient(135deg, ${c.paper} 0 45%, ${c.panel} 45% 70%, ${c.lavender} 70%)` }}
                  />
                  <span className="tutorial-theme-name">{theme.name}</span>
                  {selected && <Check size={14} className="tutorial-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      ),
    },
    {
      icon: <Compass size={24} />,
      title: "Getting around",
      body: (
        <>
          <p className="tutorial-text">
            Your servers sit down the far left. Each one has <b>text channels</b> for chatting and <b>voice rooms</b> for
            talking. Direct messages live behind the <b>h</b> at the top.
          </p>
          <ul className="tutorial-list">
            <li><kbd>Ctrl</kbd> + <kbd>K</kbd> jumps to any channel or DM by name.</li>
            <li>Hover a message (or long-press it on a phone) to reply, start a thread, react or pin it.</li>
            <li>The person icon at the top right shows who's around.</li>
          </ul>
        </>
      ),
      tries: [{ label: "Open the quick switcher", icon: <Command size={16} />, run: actions.openSwitcher }],
    },
    {
      icon: <Headphones size={24} />,
      title: "Voice and screen sharing",
      body: (
        <>
          <p className="tutorial-text">
            Click a voice room to join it; click another to move. Noise suppression runs on your device, so the keyboard
            and the fan stay out of the call.
          </p>
          <ul className="tutorial-list">
            <li>Share your screen at up to 1080p and 60 fps, with the game or film sound.</li>
            <li>Mute and deafen sit at the bottom left, next to your name.</li>
            <li>The desktop app adds push-to-talk that works while a game has focus.</li>
          </ul>
        </>
      ),
      tries: actions.joinVoice
        ? [{ label: `Join ${actions.joinVoice.name}`, icon: <Headphones size={16} />, run: actions.joinVoice.run }]
        : undefined,
    },
    {
      icon: <MessageSquare size={24} />,
      title: "Chat, your way",
      body: (
        <>
          <p className="tutorial-text">
            Messages can carry colours, fonts and effects, GIFs, stickers and voice messages. Type <kbd>/</kbd> for
            commands, like <b>/tts</b> to have a message read aloud.
          </p>
          <ul className="tutorial-list">
            <li>Polls and events with RSVPs, right in the channel.</li>
            <li>
              <AtSign size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Mention someone with @ and they get a
              notification.
            </li>
          </ul>
        </>
      ),
      tries: [
        { label: "Text effects", icon: <Sparkles size={16} />, run: actions.openFormat },
        { label: "Make a poll", icon: <Vote size={16} />, run: actions.openPoll },
      ],
    },
    {
      icon: <Dices size={24} />,
      title: "Game night",
      body: (
        <>
          <p className="tutorial-text">
            <b>/roll d20+5</b> throws real 3D dice that everyone in the channel sees, with advantage, disadvantage and
            labels. The controller button in the message box starts a game with friends.
          </p>
          <ul className="tutorial-list">
            <li>Tic-Tac-Toe, Four in a Row, Rock Paper Scissors, Minesweeper Flags and Rota.</li>
            <li>For D&amp;D: battlemaps with fog of war, and a spell and monster compendium.</li>
          </ul>
        </>
      ),
      tries: [
        { label: "Roll a d20", icon: <Dices size={16} />, run: actions.rollDice },
        { label: "Pick a game", icon: <Gamepad2 size={16} />, run: actions.openGames },
      ],
    },
    {
      icon: <GraduationCap size={24} />,
      title: "Make it yours",
      body: (
        <>
          <p className="tutorial-text">
            Set your avatar, banner, bio and pronouns in <b>Settings → Profile</b>. <kbd>Ctrl</kbd> + <kbd>/</kbd> lists
            every keyboard shortcut.
          </p>
          <p className="tutorial-text" style={{ marginTop: 12 }}>
            That's the tour. You can open this tutorial again any time from <b>Settings → Tutorial</b>.
          </p>
        </>
      ),
      tries: [
        { label: "Edit your profile", icon: <UserRound size={16} />, run: actions.openProfile },
        { label: "Keyboard shortcuts", icon: <Keyboard size={16} />, run: actions.openShortcuts },
      ],
    },
  ];
}

export const TUTORIAL_PAGES = 6;

/**
 * A d20 for "Try it": the same 3D dice as /roll, in the theme's dice set, but
 * only on your screen. Nothing is posted.
 */
export function practiceRoll(roller: { id: string; displayName: string }): DiceRollEvent {
  const value = 1 + Math.floor(Math.random() * 20);
  const themeId = document.documentElement.dataset.customThemeId || "";
  return {
    expression: "1d20",
    dice: [{ sides: 20, sign: 1, rolls: [{ value, kept: true }] }],
    modifier: 0,
    total: value,
    roller,
    rollType: "normal",
    animationSeed: Math.random().toString(16).slice(2),
    theme: ["vampire", "dark-academia", "matrix", "cyberpunk"].includes(themeId) ? themeId : "default",
  };
}

export function WelcomeTutorial({
  page,
  onPage,
  onClose,
  onTry,
  actions,
}: {
  page: number;
  onPage: (page: number) => void;
  onClose: () => void;
  /** A "Try it" button was pressed: fold the tutorial away while it runs. */
  onTry: () => void;
  actions: TutorialActions;
}) {
  const all = pages(actions);
  const current = all[Math.min(page, all.length - 1)];
  const last = page >= all.length - 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <style href="hoffle-tutorial" precedence="default">{STYLE}</style>
      <div className="tutorial-card">
        <div className="tutorial-head">
          <span className="tutorial-step">
            {page === 0 ? "Welcome to Hoffle" : "Tutorial"} · {page + 1} of {all.length}
          </span>
          <button type="button" className="tutorial-close" onClick={onClose} aria-label="Close the tutorial">
            <X size={18} />
          </button>
        </div>
        <div className="tutorial-body">
          <div className="tutorial-icon" aria-hidden="true">{current.icon}</div>
          <h2 id="tutorial-title" className="tutorial-title">{current.title}</h2>
          {current.body}
          {current.tries && (
            <div className="tutorial-tries">
              {current.tries.map((tryIt) => (
                <button
                  key={tryIt.label}
                  type="button"
                  className="tutorial-try"
                  onClick={() => {
                    onTry();
                    tryIt.run();
                  }}
                >
                  {tryIt.icon}
                  {tryIt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="tutorial-foot">
          <div className="tutorial-dots" aria-hidden="true">
            {all.map((_, index) => (
              <span key={index} className={index === page ? "on" : ""} />
            ))}
          </div>
          <div className="tutorial-nav">
            {page > 0 && (
              <button type="button" className="tutorial-btn" onClick={() => onPage(page - 1)}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <button type="button" className="tutorial-btn primary" onClick={() => (last ? onClose() : onPage(page + 1))}>
              {last ? "Done" : "Next"} {!last && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shown while a "Try it" runs: back to the same page of the tutorial, or close it. */
export function TutorialPill({ page, onResume, onClose }: { page: number; onResume: () => void; onClose: () => void }) {
  return (
    <div className="tutorial-pill" role="group" aria-label="Tutorial">
      <style href="hoffle-tutorial" precedence="default">{STYLE}</style>
      <button type="button" className="tutorial-pill-resume" onClick={onResume}>
        <GraduationCap size={16} />
        Back to the tutorial · {page + 1} of {TUTORIAL_PAGES}
      </button>
      <button type="button" className="tutorial-pill-close" onClick={onClose} aria-label="Close the tutorial">
        <X size={14} />
      </button>
    </div>
  );
}
