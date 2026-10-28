"use client";

import { useEffect, useRef, useState } from "react";
import {
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Search,
  Settings,
  Users,
} from "lucide-react";
import type { PlayerState } from "@/lib/protocol";
import { EQ_LABELS, EQ_MAX_DB, EQ_PRESETS, eqGraphPoints } from "@/lib/winamp-eq";
import { openMusicReader } from "../lib/music-tap";
import { setWinampEq, useWinampEq } from "../lib/winamp-eq-store";

/**
 * Window furniture for the two retro skins that CSS alone can't draw.
 *
 * Classic Winamp gets the main window (LCD clock, scrolling title, analyser,
 * transport buttons) and the equalizer, docked above the channel "playlist".
 * TeamSpeak 2 gets the Windows title bar, menu bar, toolbar, the server info
 * pane over the chat and the status bar. The grid placement of every piece
 * lives in theme-flavors.css; on phones none of this renders.
 */

export type RetroSkin = "winamp" | "teamspeak" | "msn" | null;

/** Which retro skin is active, if any. */
export function useRetroSkin(): RetroSkin {
  const [skin, setSkin] = useState<RetroSkin>(null);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const id = root.dataset.customThemeId;
      // "msn" and "msn-dark" share one title bar.
      setSkin(id === "winamp" || id === "teamspeak" ? id : id?.startsWith("msn") ? "msn" : null);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return skin;
}

export interface RetroChromeProps {
  serverName: string | null;
  serverIconUrl: string | null;
  bannerUrl: string | null;
  channelName: string | null;
  channelNumber: number;
  channelTopic: string | null;
  onlineCount: number;
  memberCount: number;
  userName: string;
  connected: boolean;
  voiceRoom: string | null;
  muted: boolean;
  deafened: boolean;
  pingMs: number | null;
  player: PlayerState | null;
  membersOpen: boolean;
  onPrevChannel: () => void;
  onNextChannel: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeaveVoice: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenShortcuts: () => void;
  onToggleMembers: () => void;
  onOpenSounds: () => void;
  onOpenPicture: () => void;
  onOpenToday: () => void;
  onSendNudge: () => void;
  onSignOut: () => void;
}

export function RetroChrome(props: RetroChromeProps) {
  const skin = useRetroSkin();
  // Winamp's LCD and title-bar lettering; only fetched once a retro skin is on.
  useEffect(() => {
    if (skin !== "winamp" || document.getElementById("retro-skin-fonts")) return;
    const link = document.createElement("link");
    link.id = "retro-skin-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=VT323&family=Silkscreen&display=swap";
    document.head.appendChild(link);
  }, [skin]);
  if (skin === "winamp") return <WinampChrome {...props} />;
  if (skin === "teamspeak") return <TeamSpeakChrome {...props} />;
  if (skin === "msn") return <MsnChrome {...props} />;
  return null;
}

/** Re-renders once a second while `on`. */
function useTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** When you joined the current voice room (local clock), for the elapsed counters. */
function useJoinedAt(voiceRoom: string | null): number | null {
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  useEffect(() => {
    setJoinedAt(voiceRoom ? Date.now() : null);
  }, [voiceRoom]);
  return joinedAt;
}

/* ------------------------------------------------------------------ Winamp */

/** Winamp's own visualisation colours: the analyser's sixteen rows, top to bottom, its peak dots and the scope's five. */
const VIS_ROWS = ["#ef3110", "#ce2910", "#d65a00", "#d66600", "#d67300", "#c67b08", "#dea518", "#d6b521", "#bdde29", "#94de21", "#29ce10", "#32be10", "#39b510", "#319c08", "#299400", "#188408"];
const VIS_PEAK = "#969696";
const VIS_SCOPE = ["#ffffff", "#d6d6de", "#b5bdbd", "#a0aaaf", "#949ca5"];
type VizMode = "bars" | "scope" | "off";
const VIZ_MODES: VizMode[] = ["bars", "scope", "off"];

/**
 * The main window's analyser. With the music bot streaming here it is the real thing, drawn as Winamp drew
 * it: bars that fall back slowly, peak dots that hang and drop, or the oscilloscope (click to switch, as in
 * Winamp). Without (not in voice with the bot), the old pretend bars while the room plays something.
 */
function WinampViz({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<VizMode>("bars");
  const [real, setReal] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("huddle-winamp-viz") as VizMode | null;
      if (saved && VIZ_MODES.includes(saved)) setMode(saved);
    } catch {
      // Storage blocked: the bars.
    }
  }, []);
  const cycle = () => {
    const next = VIZ_MODES[(VIZ_MODES.indexOf(mode) + 1) % VIZ_MODES.length];
    setMode(next);
    try {
      window.localStorage.setItem("huddle-winamp-viz", next);
    } catch {
      // Not remembered; fine.
    }
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode === "off") { setReal(false); return; }
    const reader = openMusicReader();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = performance.now();
    let wasReal = false;
    let bands = new Float32Array(0);
    let shown = new Float32Array(0);
    let peaks = new Float32Array(0);
    let holds = new Float32Array(0);
    const wave = new Float32Array(76);
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const width = canvas.clientWidth;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(16 * ratio); }
      const n = Math.max(8, Math.floor(width / 4));
      if (bands.length !== n) { bands = new Float32Array(n); shown = new Float32Array(n); peaks = new Float32Array(n); holds = new Float32Array(n); }
      const ok = mode === "scope" ? reader.wave(wave) : reader.bands(bands, 50, 16000);
      if (ok !== wasReal) { wasReal = ok; setReal(ok); }
      const ctx = ok ? canvas.getContext("2d") : null;
      if (ctx) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, 16);
        if (mode === "scope") {
          // The scope: a dot per pixel column, brighter the nearer the middle.
          for (let x = 0; x < width; x++) {
            const v = wave[Math.floor((x / width) * wave.length)];
            const y = Math.max(0, Math.min(15, Math.round(7.5 - v * 8)));
            ctx.fillStyle = VIS_SCOPE[Math.min(4, Math.floor(Math.abs(y - 7.5) / 2))];
            ctx.fillRect(x, y, 1, 1);
          }
        } else {
          const pitch = width / n;
          for (let i = 0; i < n; i++) {
            // Up at once, down slowly; the peak hangs a moment, then drops.
            shown[i] = bands[i] > shown[i] ? bands[i] : Math.max(bands[i], shown[i] - dt * (still ? 6 : 2.4));
            if (shown[i] >= peaks[i]) { peaks[i] = shown[i]; holds[i] = 0.35; }
            else if ((holds[i] -= dt) < 0) peaks[i] = Math.max(0, peaks[i] - dt * 0.9);
            const rows = Math.round(shown[i] * 16);
            const x = Math.round(i * pitch);
            const w = Math.max(1, Math.round(pitch) - 1);
            for (let r = 0; r < rows; r++) {
              ctx.fillStyle = VIS_ROWS[15 - r];
              ctx.fillRect(x, 15 - r, w, 1);
            }
            const peak = Math.round(peaks[i] * 16);
            if (peak > 0) {
              ctx.fillStyle = VIS_PEAK;
              ctx.fillRect(x, 16 - peak, w, 1);
            }
          }
        }
      }
      // About 30 frames a second while there's music to draw; a look twice a second while there isn't.
      if (ok) raf = requestAnimationFrame((next) => { timer = setTimeout(() => draw(next), 16); });
      else timer = setTimeout(() => draw(performance.now()), 500);
    };
    draw(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      reader.close();
    };
  }, [mode]);
  const pretend = playing && !real && mode !== "off";
  return (
    <span className={`wa-viz ${pretend ? "live" : ""} ${real ? "real" : ""}`} onClick={cycle} title="Click: analyser, oscilloscope, off">
      <canvas ref={canvasRef} />
      {!real && Array.from({ length: 19 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${(i * 173) % 700}ms`, animationDuration: `${420 + ((i * 97) % 300)}ms` }} />
      ))}
    </span>
  );
}

const EQ_STEP = 0.5;

/** One of the equalizer's sliders: drag it, or focus it and use the arrows; a double click puts it back to the middle. */
function EqSlider({ label, value, onChange, preamp = false }: { label: string; value: number; onChange: (db: number) => void; preamp?: boolean }) {
  const track = useRef<HTMLSpanElement>(null);
  const set = (db: number) => {
    const snapped = Math.round(Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, db)) / EQ_STEP) * EQ_STEP;
    // A little detent in the middle, as the real sliders had.
    onChange(Math.abs(snapped) < 0.75 ? 0 : snapped);
  };
  const fromPointer = (clientY: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    set(EQ_MAX_DB - ((clientY - rect.top) / rect.height) * EQ_MAX_DB * 2);
  };
  const text = `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
  return (
    <span className={`wa-band ${preamp ? "pre" : ""}`}>
      <span
        ref={track}
        className="wa-band-track"
        role="slider"
        tabIndex={0}
        aria-label={preamp ? "Preamp" : `${label}Hz`}
        aria-orientation="vertical"
        aria-valuemin={-EQ_MAX_DB}
        aria-valuemax={EQ_MAX_DB}
        aria-valuenow={value}
        aria-valuetext={text}
        title={`${preamp ? "Preamp" : `${label}Hz`}: ${text}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event.clientY);
        }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event.clientY); }}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(event) => {
          const by = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 3, PageDown: -3 }[event.key];
          if (by !== undefined) set(value + by);
          else if (event.key === "Home") set(EQ_MAX_DB);
          else if (event.key === "End") set(-EQ_MAX_DB);
          else return;
          event.preventDefault();
        }}
      >
        <i style={{ top: `${((EQ_MAX_DB - value) / (EQ_MAX_DB * 2)) * 100}%` }} />
      </span>
      <small>{preamp ? "PREAMP" : label}</small>
    </span>
  );
}

/**
 * The equalizer, for real: it shapes the music bot as you hear it (nobody else), from the ON button and the
 * sliders to Winamp's own presets. It only applies while this theme is on.
 */
function WinampEqualizer() {
  const eq = useWinampEq();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(false); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", escape); };
  }, [menu]);
  return (
    <div className="wa-win wa-eq">
      <WinampTitle label="WINAMP EQUALIZER" />
      <div className="wa-eq-body">
        <div className="wa-eq-top">
          <button type="button" className={`wa-mini ${eq.on ? "on" : ""}`} aria-pressed={eq.on} onClick={() => setWinampEq({ on: !eq.on })} title="Equalizer on or off: it changes how the music bot sounds to you">ON</button>
          <span className="wa-mini" aria-hidden="true">AUTO</span>
          <span className="wa-eq-graph" aria-hidden="true">
            <svg viewBox="0 0 100 20" preserveAspectRatio="none">
              <line x1="0" y1="10" x2="100" y2="10" />
              <polyline points={eqGraphPoints(eq.bands)} />
            </svg>
          </span>
          <div className="wa-presets" ref={menuRef}>
            <button type="button" className="wa-mini wide" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((open) => !open)} title={eq.preset ?? "Presets"}>PRESETS</button>
            {menu && (
              <div className="wa-preset-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setWinampEq({ preamp: 0, bands: EQ_LABELS.map(() => 0), preset: null }); setMenu(false); }}>Reset (flat)</button>
                <hr />
                {EQ_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    role="menuitemradio"
                    aria-checked={eq.preset === preset.name}
                    className={eq.preset === preset.name ? "on" : ""}
                    onClick={() => { setWinampEq({ on: true, preamp: 0, bands: preset.bands, preset: preset.name }); setMenu(false); }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={`wa-eq-bands ${eq.on ? "" : "off"}`} title="How the music bot sounds to you">
          <EqSlider label="PREAMP" preamp value={eq.preamp} onChange={(db) => setWinampEq({ preamp: db, preset: null })} />
          <span className="wa-eq-scale" aria-hidden="true"><small>+12db</small><small>+0db</small><small>-12db</small></span>
          {EQ_LABELS.map((label, i) => (
            <EqSlider key={label} label={label} value={eq.bands[i]} onChange={(db) => setWinampEq({ bands: eq.bands.map((band, j) => (j === i ? db : band)), preset: null })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WinampTitle({ label }: { label: string }) {
  return (
    <div className="wa-titlebar" aria-hidden="true">
      <span className="wa-title-ridge" />
      <span className="wa-title-text">{label}</span>
      <span className="wa-title-ridge" />
      <span className="wa-title-btns"><i /><i /><i /></span>
    </div>
  );
}

function Lightning() {
  return (
    <svg className="wa-bolt" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.5 0 2 9h5l-1.5 7L14 6.5H8.8z" />
    </svg>
  );
}

function WinampChrome(p: RetroChromeProps) {
  const track = p.player?.track ?? null;
  const playing = Boolean(track && p.player && !p.player.paused);
  const joinedAt = useJoinedAt(p.voiceRoom);
  const now = useTick(true);
  const [eqOpen, setEqOpen] = useState(true);
  useEffect(() => {
    try {
      setEqOpen(window.localStorage.getItem("huddle-winamp-eq") !== "0");
    } catch {
      // Storage blocked: the EQ stays docked.
    }
  }, []);
  const toggleEq = () => {
    setEqOpen((open) => {
      try {
        window.localStorage.setItem("huddle-winamp-eq", open ? "0" : "1");
      } catch {
        // Not remembered; fine.
      }
      return !open;
    });
  };

  // The LCD counts the song when the room plays one, else your time in voice,
  // else it's a wall clock.
  let elapsed: string;
  let progress = 0;
  if (track && p.player) {
    const pos = p.player.positionMs + (p.player.paused ? 0 : now - p.player.updatedAt);
    elapsed = clock(pos);
    if (track.duration) progress = Math.min(1, pos / (track.duration * 1000));
  } else if (joinedAt) {
    elapsed = clock(now - joinedAt);
  } else {
    const d = new Date(now);
    elapsed = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const marquee = track
    ? `${p.channelNumber}. ${track.artist ? `${track.artist} - ` : ""}${track.title}${track.duration ? ` (${clock(track.duration * 1000)})` : ""}`
    : p.voiceRoom
      ? `${p.serverName ?? "Hoffle"} - ${p.voiceRoom} (live)`
      : p.channelName
        ? `${p.channelNumber}. #${p.channelName}${p.channelTopic ? ` - ${p.channelTopic}` : ""}`
        : `Hoffle ${p.serverName ? `- ${p.serverName}` : ""}`;

  const inVoice = Boolean(p.voiceRoom);

  return (
    <>
      <div className="wa-win wa-main">
        <WinampTitle label="WINAMP" />
        <div className="wa-main-body">
          <div className="wa-lcd" aria-hidden="true">
            <span className={`wa-lcd-state ${playing || (inVoice && !p.muted) ? "on" : ""}`}>
              {playing || (inVoice && !p.muted) ? "▶" : inVoice ? "❚❚" : "■"}
            </span>
            <span className="wa-lcd-time">{elapsed}</span>
            <WinampViz playing={playing} />
          </div>
          <div className="wa-info">
            <div className="wa-marquee" title={marquee}>
              <span>
                {marquee} *** {marquee} ***{" "}
              </span>
            </div>
            <div className="wa-stats">
              <span className="wa-box" title="Members online">{p.onlineCount}</span>
              <small>kbps</small>
              <span className="wa-box" title="Members">{p.memberCount}</span>
              <small>khz</small>
              <span className={`wa-light ${inVoice ? "" : "on"}`}>mono</span>
              <span className={`wa-light ${inVoice ? "on" : ""}`}>stereo</span>
            </div>
            <div className="wa-toggles">
              <span className="wa-slider" aria-hidden="true">
                <i style={{ left: `${Math.round(((p.player?.volume ?? 80) / 100) * 100)}%` }} />
              </span>
              <span className="wa-slider short" aria-hidden="true"><i style={{ left: "50%" }} /></span>
              <button type="button" className={`wa-mini ${eqOpen ? "on" : ""}`} onClick={toggleEq} title="Equalizer">EQ</button>
              <button type="button" className={`wa-mini ${p.membersOpen ? "on" : ""}`} onClick={p.onToggleMembers} title="Member list">PL</button>
            </div>
          </div>
          <div className="wa-seek" aria-hidden="true">
            <i style={{ left: `calc(${(progress * 100).toFixed(2)}% - ${(progress * 28).toFixed(1)}px)` }} />
          </div>
          <div className="wa-transport">
            <button type="button" onClick={p.onPrevChannel} title="Previous channel" aria-label="Previous channel">⏮</button>
            <button type="button" onClick={() => p.muted && p.onToggleMute()} disabled={!inVoice} title="Play (unmute)" aria-label="Unmute">▶</button>
            <button type="button" onClick={() => !p.muted && p.onToggleMute()} disabled={!inVoice} title="Pause (mute)" aria-label="Mute">❚❚</button>
            <button type="button" onClick={p.onLeaveVoice} disabled={!inVoice} title="Stop (leave voice)" aria-label="Leave voice">■</button>
            <button type="button" onClick={p.onNextChannel} title="Next channel" aria-label="Next channel">⏭</button>
            <button type="button" className="wa-eject" onClick={p.onOpenSettings} title="Settings" aria-label="Settings">⏏</button>
            <span className="wa-shuffle" aria-hidden="true">SHUFFLE</span>
            <button type="button" className={`wa-rep ${p.deafened ? "on" : ""}`} onClick={p.onToggleDeafen} disabled={!inVoice} title={p.deafened ? "Undeafen" : "Deafen"}>
              {p.deafened ? <HeadphoneOff size={11} /> : <Headphones size={11} />}
            </button>
            <Lightning />
          </div>
        </div>
      </div>
      {eqOpen && <WinampEqualizer />}
    </>
  );
}

/* --------------------------------------------------------------- TeamSpeak */

type MenuItem = { label: string; onClick: () => void; checked?: boolean; disabled?: boolean } | "sep";

/**
 * Where the page runs decides what the title bar's window buttons do. The
 * desktop apps minimize, maximize and close through their bridge (the Mac
 * app's own traffic lights sit on top of ours and do the same). In a browser
 * only maximize can do anything — it goes fullscreen — so minimize and close
 * stay greyed out.
 */
type Shell = "mac-app" | "desktop-app" | "web";

function useShell(): Shell {
  const [shell, setShell] = useState<Shell>("web");
  useEffect(() => {
    const w = window as { huddle?: { desktop?: boolean; platform?: string }; __TAURI__?: unknown };
    let kind: Shell = "web";
    if (w.huddle?.desktop || w.__TAURI__) {
      const mac = w.huddle?.platform ? w.huddle.platform === "darwin" : /Mac/.test(navigator.platform);
      kind = mac ? "mac-app" : "desktop-app";
    }
    setShell(kind);
    document.documentElement.dataset.shell = kind;
  }, []);
  return shell;
}

/** Sends a window command to the native desktop app (Windows WebView2 or Mac WKWebView). */
function postWindowCommand(type: "windowMinimize" | "windowZoom" | "windowClose") {
  const w = window as {
    chrome?: { webview?: { postMessage?: (msg: unknown) => void } };
    webkit?: { messageHandlers?: { hoffleNative?: { postMessage: (msg: unknown) => void } } };
  };
  try {
    if (w.chrome?.webview?.postMessage) w.chrome.webview.postMessage({ type });
    else w.webkit?.messageHandlers?.hoffleNative?.postMessage({ type });
  } catch {
    // No native shell answering: nothing to do.
  }
}

function useFullscreen(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", read);
    return () => document.removeEventListener("fullscreenchange", read);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return [on, toggle];
}

/**
 * An XP window's title bar: icon, caption and minimize / maximize / close. In
 * the Mac app the buttons move to the left in macOS order (close, minimize,
 * maximize), each one under the real traffic light that does the same thing.
 */
function TitleBar({ className, icon, title }: { className: string; icon: string; title: string }) {
  const shell = useShell();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const app = shell !== "web";
  const maximize = app ? () => postWindowCommand("windowZoom") : toggleFullscreen;
  const minimizeButton = (
    <button
      key="min"
      type="button"
      onClick={() => postWindowCommand("windowMinimize")}
      disabled={!app}
      title={app ? "Minimize" : "Can't minimize a browser tab"}
      aria-label="Minimize"
    >
      _
    </button>
  );
  const maximizeButton = (
    <button
      key="max"
      type="button"
      onClick={maximize}
      title={app ? "Maximize" : fullscreen ? "Exit fullscreen" : "Fullscreen"}
      aria-label={app ? "Maximize" : fullscreen ? "Exit fullscreen" : "Fullscreen"}
    >
      {fullscreen ? "❐" : "□"}
    </button>
  );
  const closeButton = (
    <button
      key="close"
      type="button"
      className="x"
      onClick={() => postWindowCommand("windowClose")}
      disabled={!app}
      title={app ? "Close" : "Can't close a browser tab from the page"}
      aria-label="Close"
    >
      ×
    </button>
  );
  const mac = shell === "mac-app";
  return (
    <div className={`xp-titlebar ${className}`} onDoubleClick={maximize}>
      {mac && <span className="xp-caption mac">{[closeButton, minimizeButton, maximizeButton]}</span>}
      <span className={icon} aria-hidden="true" />
      <span className="xp-title-text">{title}</span>
      {!mac && <span className="xp-caption">{[minimizeButton, maximizeButton, closeButton]}</span>}
    </div>
  );
}

/** A Win32 menu bar whose menus open on click and follow the pointer once one is open. */
function MenuBar({ className, menus }: { className: string; menus: Record<string, MenuItem[]> }) {
  const [menu, setMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  return (
    <nav className={`xp-menubar ${className}`} ref={barRef}>
      {Object.entries(menus).map(([name, items]) => (
        <div className="xp-menu" key={name}>
          <button
            type="button"
            className={menu === name ? "open" : ""}
            onClick={() => setMenu(menu === name ? null : name)}
            onMouseEnter={() => menu && setMenu(name)}
          >
            <u>{name[0]}</u>{name.slice(1)}
          </button>
          {menu === name && (
            <div className="xp-dropdown" role="menu">
              {items.map((item, i) =>
                item === "sep" ? (
                  <hr key={i} />
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={item.checked === undefined ? undefined : item.checked}
                    disabled={item.disabled}
                    onClick={() => {
                      setMenu(null);
                      item.onClick();
                    }}
                  >
                    <span className="xp-check">{item.checked ? "✓" : ""}</span>
                    {item.label}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

/* --------------------------------------------------------------------- MSN */

function MsnChrome(p: RetroChromeProps) {
  const inVoice = Boolean(p.voiceRoom);
  const menus: Record<string, MenuItem[]> = {
    File: [
      { label: "My Display Picture...", onClick: p.onOpenPicture },
      { label: "MSN Today", onClick: p.onOpenToday },
      "sep",
      { label: "Sign Out", onClick: p.onSignOut },
    ],
    Contacts: [
      { label: "Search for a Contact...", onClick: p.onOpenSearch },
      { label: "Show Contact List", onClick: p.onToggleMembers, checked: p.membersOpen },
    ],
    Actions: [
      { label: "Send a Nudge", onClick: p.onSendNudge, disabled: !p.channelName && !p.serverName },
      "sep",
      { label: "Mute Microphone", onClick: p.onToggleMute, checked: p.muted, disabled: !inVoice },
      { label: "Leave Call", onClick: p.onLeaveVoice, disabled: !inVoice },
    ],
    Tools: [
      { label: "Sounds...", onClick: p.onOpenSounds },
      { label: "Options...", onClick: p.onOpenSettings },
    ],
    Help: [{ label: "Keyboard Shortcuts", onClick: p.onOpenShortcuts }],
  };
  return (
    <>
      <TitleBar className="msn-titlebar" icon="msn-app-icon" title="MSN Messenger" />
      <MenuBar className="msn-menubar" menus={menus} />
    </>
  );
}

/* --------------------------------------------------------------- TeamSpeak */

function TeamSpeakChrome(p: RetroChromeProps) {
  const now = useTick(true);
  const joinedAt = useJoinedAt(p.voiceRoom);
  const inVoice = Boolean(p.voiceRoom);

  const menus: Record<string, MenuItem[]> = {
    Connections: [
      { label: "Disconnect", onClick: p.onLeaveVoice, disabled: !inVoice },
      "sep",
      { label: "Find...", onClick: p.onOpenSearch },
    ],
    Self: [
      { label: "Mute Microphone", onClick: p.onToggleMute, checked: p.muted, disabled: !inVoice },
      { label: "Mute Speakers", onClick: p.onToggleDeafen, checked: p.deafened, disabled: !inVoice },
    ],
    Settings: [
      { label: "Options...", onClick: p.onOpenSettings },
      { label: "Player List", onClick: p.onToggleMembers, checked: p.membersOpen },
    ],
    Help: [{ label: "Keyboard Shortcuts", onClick: p.onOpenShortcuts }],
  };

  const d = new Date(now);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  return (
    <>
      <TitleBar
        className="ts-titlebar"
        icon="ts-app-icon"
        title={`TeamSpeak 2${p.serverName ? ` - [${p.serverName}]` : ""}`}
      />
      <MenuBar className="ts-menubar" menus={menus} />
      <div className="ts-toolbar">
        <button type="button" onClick={p.onLeaveVoice} disabled={!inVoice} title="Disconnect"><PhoneOff size={15} /></button>
        <span className="ts-sep" />
        <button type="button" className={p.muted ? "pressed" : ""} onClick={p.onToggleMute} disabled={!inVoice} title="Mute microphone">
          {p.muted ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <button type="button" className={p.deafened ? "pressed" : ""} onClick={p.onToggleDeafen} disabled={!inVoice} title="Mute speakers">
          {p.deafened ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
        </button>
        <span className="ts-sep" />
        <button type="button" onClick={p.onOpenSearch} title="Find"><Search size={15} /></button>
        <button type="button" className={p.membersOpen ? "pressed" : ""} onClick={p.onToggleMembers} title="Player list"><Users size={15} /></button>
        <button type="button" onClick={p.onOpenSettings} title="Options"><Settings size={15} /></button>
      </div>
      <div className="ts-info">
        <div className="ts-info-text">
          <div className="ts-info-head">
            {p.serverIconUrl ? <img src={p.serverIconUrl} alt="" /> : <span className="ts-app-icon big" />}
            <strong>{p.serverName ?? "Direct messages"}</strong>
          </div>
          <table>
            <tbody>
              {p.channelName && (
                <tr><th>Channel:</th><td>{p.channelName}</td></tr>
              )}
              {p.channelTopic && (
                <tr><th>Topic:</th><td>{p.channelTopic}</td></tr>
              )}
              <tr><th>Clients:</th><td>{p.onlineCount} / {p.memberCount}</td></tr>
              <tr><th>Nickname:</th><td>{p.userName}</td></tr>
              <tr>
                <th>Voice:</th>
                <td>{p.voiceRoom ? `${p.voiceRoom}${joinedAt ? ` (${clock(now - joinedAt)})` : ""}` : "Not connected"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {p.bannerUrl && <img className="ts-info-banner" src={p.bannerUrl} alt="" />}
      </div>
      <div className="ts-statusbar">
        <span>{p.connected ? (p.voiceRoom ? `Connected to ${p.voiceRoom}` : "Connected to server") : "Connection lost - reconnecting..."}</span>
        <span>{p.serverName ?? "Hoffle"}</span>
        <span>{inVoice && p.pingMs ? `Ping: ${Math.round(p.pingMs)} ms` : "Ping: --"}</span>
        <span>{time}</span>
      </div>
    </>
  );
}
