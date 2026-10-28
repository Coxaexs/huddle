/**
 * The club dressed for a theme (lib/club-skins.ts picks which): the LED wall
 * painted as something else, fixtures that become the theme's own, and a few
 * things to touch. club-scene.ts builds the club around a dress and asks it
 * each frame; everything here is drawn in each browser from the same show.
 *
 * - winamp: the wall is Winamp's main window and equalizer, the analyser the
 *   music as this browser hears it (app/lib/music-tap.ts); the floor is an
 *   analyser too. A llama on the stage.
 * - cantina: the beam fan is eight lightsabers, the lasers fire blaster bolts,
 *   the wall flies through the stars (hyperspace on the drop, a binary sunset
 *   in a breakdown, an opening crawl for each new song); a Death Star for a
 *   mirror ball and an astromech by the decks.
 * - construct: code rain on the wall, down the neon tubes and across the
 *   floor, freezing for bullet time on the drop; a payphone that rings and the
 *   pills on the bar.
 * - redstone: a wall of redstone lamps, "Now playing" in Minecraft's colours,
 *   note blocks that play the song's own notes in Minecraft's note colours, a
 *   glass-block mirror ball and a creeper.
 */
import * as THREE from "three";
import type { ClubSection, ClubShow } from "../lib/club-lights";
import { CLUB_BAR, CLUB_DECKS, CLUB_HALF_Z, CLUB_STAGE } from "../lib/living-room";
import { noteBlockColour, type ClubSkin } from "@/lib/club-skins";
import { box, canvasTexture, mat, seeded } from "./living-room-scene";
import type { ThingKit } from "./room-things";
import { playBeeps, playHiss, playLlama, playNoteBlock, playPayphone, playRedPill } from "./living-room-sounds";

/** What the club tells its dress each frame. */
export interface SkinFrame {
  t: number;
  dt: number;
  show: ClubShow | null;
  live: boolean;
  /** SPECTRUM_BANDS levels, 0..1, low to high: the music as heard here, or (real false) guessed from the stems. */
  spectrum: Float32Array;
  real: boolean;
  /** The waveform, -1..1, while real. */
  wave: Float32Array | null;
  title: string | null;
  artist: string | null;
  /** Who plays: whoever has the decks, else the resident. */
  dj: string;
  resident: boolean;
  bpm: number | null;
  /** The song being mixed into, during a mix. */
  next: string | null;
  /** Beats, continuous (the idle clock when nothing plays), and 0..1 through this one. */
  beat: number;
  phase: number;
  section: ClubSection;
  kickHit: number;
  energy: number;
  build: number;
  sinceDrop: number;
  /** The show's master brightness (the desk, your own slider, the blackout). */
  M: number;
  calm: boolean;
}

/** A beam of the stage's fan, as the club moved it this frame. */
export interface FanBeam { at: THREE.Vector3; dir: THREE.Vector3; level: number }

export interface SkinLook {
  colours: string[];
  walls: string;
  floor: string;
  sign: string;
  signColour: string;
  /** How the sign over the bar is lettered. */
  signFont: string;
}

export interface ClubDress {
  look: SkinLook;
  /** The LED wall's picture, painted each frame; `crisp` shows it as a screen, not through the LEDs; `gain`, how bright. */
  wall: { texture: THREE.Texture; crisp: boolean; gain: number; paint: (frame: SkinFrame) => void };
  /** Draws the stage's beam fan as something else (the cantina's sabers); the fan's own beams hide. */
  fans?: (beams: readonly FanBeam[], frame: SkinFrame) => void;
  /** The lasers fire bolts instead of standing beams. */
  bolts?: boolean;
  /** The dance floor's tile on auto: its level, its colour in `out`; null leaves the club's pattern. */
  floor?: (col: number, row: number, cols: number, rows: number, frame: SkinFrame, out: THREE.Color) => number | null;
  /** The mirror ball's shape and finish. */
  ball?: { geometry: THREE.BufferGeometry; material: THREE.Material };
  /** The neon tubes on the side walls: each one's shape, and a picture on them. */
  tube?: (index: number) => THREE.BufferGeometry;
  tubeMap?: THREE.Texture;
  /** The DJ booth's front. */
  booth?: THREE.Material;
  /** What touching each thing does, for the pointer's tip, and its sound. */
  labels: Record<string, string>;
  sounds: Record<string, () => void>;
  update: (frame: SkinFrame) => void;
  dispose: () => void;
}

export interface DressKit {
  root: THREE.Group;
  things: ThingKit;
  glow: THREE.Texture;
  track: <T extends { dispose: () => void }>(thing: T) => T;
}

export const SPECTRUM_BANDS = 32;

export function dressClub(skin: ClubSkin, kit: DressKit): ClubDress | null {
  switch (skin) {
    case "winamp": return winamp(kit);
    case "cantina": return cantina(kit);
    case "construct": return construct(kit);
    case "redstone": return redstone(kit);
    default: return null;
  }
}

// ---------------------------------------------------------------- shared

const STAGE_Y = CLUB_STAGE.height;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A canvas the wall shows, and its texture; painted at most 30 times a second. */
function painter(kit: DressKit, width: number, height: number, pixelated = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const texture = kit.track(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  if (pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  let since = 1;
  /** True when it's time to paint again (and the seconds since the last paint). */
  const due = (dt: number) => {
    since += dt;
    if (since < 1 / 30) return 0;
    const elapsed = Math.min(0.1, since);
    since = 0;
    return elapsed;
  };
  return { canvas, ctx, texture, due };
}

/** Asks the browser for a web font, so the canvas has it the next time it paints. */
function wantFont(spec: string) {
  try { void document.fonts?.load(spec).catch(() => undefined); } catch { /* old browser: the fallback font */ }
}

/** The level of `src` (0..1 spread over it) at `x` (0..1), straight between its bands. */
function levelAt(src: Float32Array, x: number): number {
  const at = clamp01(x) * (src.length - 1);
  const i = Math.floor(at);
  return i >= src.length - 1 ? src[src.length - 1] : src[i] + (src[i + 1] - src[i]) * (at - i);
}

/** The average of `src` over its share `i` of `n`. */
function bandOf(src: Float32Array, i: number, n: number): number {
  const from = (i / n) * src.length;
  const to = ((i + 1) / n) * src.length;
  if (to - from <= 1) return levelAt(src, (from + to) / 2 / (src.length - 1 || 1));
  let sum = 0;
  let count = 0;
  for (let k = Math.floor(from); k < Math.ceil(to) && k < src.length; k++) { sum += src[k]; count++; }
  return count ? sum / count : 0;
}

const clockText = (seconds: number) => `${String(Math.floor(seconds / 60) % 100).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Remembers when the song changed, for the elapsed time and the crawls. */
function songClock() {
  let key = "";
  let started = 0;
  let count = 0;
  return {
    /** True on the frame a new song shows up. */
    step(frame: SkinFrame): boolean {
      const now = frame.live && frame.title ? `${frame.title}|${frame.artist ?? ""}` : "";
      if (now === key) return false;
      key = now;
      started = frame.t;
      if (now) count++;
      return Boolean(now);
    },
    elapsed: (t: number) => Math.max(0, t - started),
    get count() { return count; },
  };
}

function pixelTexture(kit: DressKit, size: number, draw: (ctx: CanvasRenderingContext2D, r: () => number) => void, seed = 1) {
  const texture = kit.track(canvasTexture(size, size, (ctx) => draw(ctx, seeded(seed))));
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, r: () => number, colours: string[], x0 = 0, y0 = 0, w = 16, h = 16) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { ctx.fillStyle = colours[Math.floor(r() * colours.length)]; ctx.fillRect(x, y, 1, 1); }
}

// ---------------------------------------------------------------- Winamp

/** Winamp's analyser colours, top row to bottom, and its peak dots. */
const VIS = ["#ef3110", "#ce2910", "#d65a00", "#d66600", "#d67300", "#c67b08", "#dea518", "#d6b521", "#bdde29", "#94de21", "#29ce10", "#32be10", "#39b510", "#319c08", "#299400", "#188408"];
const VIS_COLOURS = VIS.map((c) => new THREE.Color(c));
const WA_GREEN = "#00e800";

function winamp(kit: DressKit): ClubDress {
  // The theme's own lettering (retro-chrome.tsx loads it with the theme; in case it hasn't yet).
  if (!document.getElementById("retro-skin-fonts")) {
    const link = document.createElement("link");
    link.id = "retro-skin-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=VT323&family=Silkscreen&display=swap";
    document.head.appendChild(link);
  }
  wantFont("20px VT323");
  wantFont("8px Silkscreen");
  // Two canvas pixels to an LED, drawn in LEDs (192 × 70).
  const { ctx, texture, due } = painter(kit, 384, 140);
  const BARS = 22;
  const bars = new Float32Array(BARS);
  const shown = new Float32Array(BARS);
  const peaks = new Float32Array(BARS);
  const holds = new Float32Array(BARS);
  const eq = new Float32Array(11);
  const song = songClock();
  let scroll = 0;
  let blink = 0;

  const bevel = (x: number, y: number, w: number, h: number, sunk = true) => {
    ctx.fillStyle = sunk ? "#0a0a10" : "#6d6d82";
    ctx.fillRect(x, y, w, 0.5);
    ctx.fillRect(x, y, 0.5, h);
    ctx.fillStyle = sunk ? "#5a5a70" : "#14141c";
    ctx.fillRect(x, y + h - 0.5, w, 0.5);
    ctx.fillRect(x + w - 0.5, y, 0.5, h);
  };
  const lcd = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y, w, h);
    bevel(x - 0.5, y - 0.5, w + 1, h + 1);
  };
  const glowText = (text: string, x: number, y: number, font: string, colour = WA_GREEN, align: CanvasTextAlign = "left") => {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 3;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  };
  const button = (x: number, y: number, w: number, h: number, glyph: (cx: number, cy: number) => void, lit = false) => {
    ctx.fillStyle = lit ? "#4a5a4a" : "#3c3c4c";
    ctx.fillRect(x, y, w, h);
    bevel(x, y, w, h, false);
    ctx.fillStyle = lit ? WA_GREEN : "#b8b8c8";
    glyph(x + w / 2, y + h / 2);
  };
  const tri = (cx: number, cy: number, s: number, dir = 1) => {
    ctx.beginPath();
    ctx.moveTo(cx - s * dir, cy - s);
    ctx.lineTo(cx + s * dir, cy);
    ctx.lineTo(cx - s * dir, cy + s);
    ctx.fill();
  };

  const paint = (f: SkinFrame) => {
    const newSong = song.step(f);
    const dt = due(f.dt);
    if (!dt) return;
    if (newSong) scroll = 0;
    blink += dt;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.textBaseline = "alphabetic";
    // The faceplate and the title bar, its gold ridges either side.
    ctx.fillStyle = "#1e1e2a";
    ctx.fillRect(0, 0, 192, 70);
    const bar = ctx.createLinearGradient(0, 0, 0, 6);
    bar.addColorStop(0, "#4a4a5e");
    bar.addColorStop(1, "#26263a");
    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, 192, 6.5);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? "#6a5410" : "#d8b030";
      ctx.fillRect(4, 1.2 + k * 1.5, 66, 0.7);
      ctx.fillRect(122, 1.2 + k * 1.5, 54, 0.7);
    }
    ctx.font = "6px Silkscreen, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#e8e8f0";
    ctx.fillText("WINAMP", 96, 5.4);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = "#8c8ca0"; ctx.fillRect(179 + k * 4, 1.5, 3, 3); }

    // The LCD: play state, the song's time, the analyser.
    lcd(3, 8, 94, 47);
    ctx.fillStyle = f.live ? WA_GREEN : "#2a4a2a";
    if (f.live && f.show?.info?.paused !== true) tri(8, 12.5, 2.2);
    else ctx.fillRect(6, 10.5, 4, 4);
    const elapsed = f.live && f.title ? clockText(song.elapsed(f.t)) : f.live ? clockText(f.t % 6000) : blink % 1.2 < 0.6 ? "--:--" : "";
    glowText(elapsed, 94, 25, "20px VT323, monospace", f.live ? WA_GREEN : "#1e6a1e", "right");
    // The analyser: bars that fall back slowly, peaks that hang and drop; Winamp's sixteen colours top to bottom.
    for (let i = 0; i < BARS; i++) {
      bars[i] = f.live ? bandOf(f.spectrum, i, BARS) : 0;
      shown[i] = bars[i] > shown[i] ? bars[i] : Math.max(bars[i], shown[i] - dt * (f.calm ? 4 : 2.2));
      if (shown[i] >= peaks[i]) { peaks[i] = shown[i]; holds[i] = 0.4; }
      else if ((holds[i] -= dt) < 0) peaks[i] = Math.max(0, peaks[i] - dt * 0.8);
      const x = 6 + i * 4;
      const rows = Math.round(shown[i] * 26);
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = VIS[Math.min(15, Math.floor(((25 - r) / 26) * 16))];
        ctx.fillRect(x, 53 - r, 3, 1);
      }
      const peak = Math.round(peaks[i] * 26);
      if (peak > 0) { ctx.fillStyle = "#969696"; ctx.fillRect(x, 53 - peak, 3, 1); }
    }
    if (!f.live) {
      // Stopped: the scope's resting line, breathing a little.
      for (let x = 6; x < 94; x++) {
        const y = 41 + Math.round(Math.sin(x * 0.21 + f.t * 1.3) * Math.sin(f.t * 0.4) * 2.5);
        ctx.fillStyle = "#d6d6de";
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // The song's title scrolling, as the marquee does.
    lcd(101, 8, 88, 10);
    const n = song.count || 1;
    const name = f.title ? `${n}. ${f.artist ? `${f.artist} - ` : ""}${f.title}${f.bpm ? ` (${Math.round(f.bpm)} BPM)` : ""}` : "HOFFLE CLUB - start the night from the decks";
    const marquee = `${f.next ? `>> mixing into ${f.next} <<  ***  ` : ""}${name}  ***  `;
    ctx.save();
    ctx.beginPath();
    ctx.rect(101, 8, 88, 10);
    ctx.clip();
    ctx.font = "10px VT323, monospace";
    const width = Math.max(40, ctx.measureText(marquee).width);
    scroll = (scroll + dt * 16) % width;
    glowText(marquee, 103 - scroll, 16.2, "10px VT323, monospace");
    glowText(marquee, 103 - scroll + width, 16.2, "10px VT323, monospace");
    ctx.restore();
    // kbps (the BPM), khz, mono and stereo.
    lcd(101, 20.5, 13, 6);
    glowText(f.bpm ? String(Math.round(f.bpm)).padStart(3, " ") : "", 113, 25.8, "8px VT323, monospace", WA_GREEN, "right");
    ctx.font = "3px Silkscreen, monospace";
    ctx.fillStyle = "#b8b8c8";
    ctx.textAlign = "left";
    ctx.fillText("KBPS", 115.5, 25.4, 13);
    lcd(132, 20.5, 9, 6);
    glowText("44", 140, 25.8, "8px VT323, monospace", WA_GREEN, "right");
    ctx.font = "3px Silkscreen, monospace";
    ctx.fillStyle = "#b8b8c8";
    ctx.fillText("KHZ", 142.5, 25.4, 10);
    ctx.fillStyle = f.live ? "#2a4a2a" : WA_GREEN;
    ctx.fillText("MONO", 156, 25.4, 12);
    ctx.fillStyle = f.live ? WA_GREEN : "#2a4a2a";
    ctx.fillText("STEREO", 170, 25.4, 19);

    // The equalizer: its graph and sliders, riding the music's ten bands (and the preamp its level).
    for (let i = 0; i < 10; i++) {
      const want = f.live ? bandOf(f.spectrum, i, 10) : 0.5 + 0.08 * Math.sin(f.t * 0.6 + i);
      eq[i + 1] += (want - eq[i + 1]) * Math.min(1, dt * 12);
    }
    eq[0] += ((f.live ? f.energy : 0.5) - eq[0]) * Math.min(1, dt * 6);
    lcd(108, 29, 81, 6);
    ctx.strokeStyle = "#d8b818";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const x = 109.5 + i * 8.8;
      const y = 34.3 - eq[i + 1] * 4.6;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < 11; i++) {
      const x = i === 0 ? 102.5 : 109 + (i - 1) * 8.8;
      const track = ctx.createLinearGradient(0, 37, 0, 55);
      track.addColorStop(0, "#c83214");
      track.addColorStop(0.45, "#c8c814");
      track.addColorStop(1, "#1d8a1d");
      ctx.fillStyle = track;
      ctx.fillRect(x, 37, 2, 18);
      const y = 54 - eq[i] * 16;
      ctx.fillStyle = "#d8d8e0";
      ctx.fillRect(x - 1.5, y - 1, 5, 2.4);
      ctx.fillStyle = "#6c6c80";
      ctx.fillRect(x - 1.5, y + 1, 5, 0.4);
    }

    // The seek bar (through the phrase, or through a mix) and the transport, the DJ on the right.
    ctx.fillStyle = "#121218";
    ctx.fillRect(3, 57.5, 186, 3.5);
    bevel(3, 57.5, 186, 3.5);
    const progress = f.show?.mix != null ? f.show.mix : f.live ? (f.beat % 128) / 128 : 0;
    ctx.fillStyle = "#c8b030";
    ctx.fillRect(3.5 + progress * 177, 57.7, 8, 3.1);
    const playing = f.live && f.show?.info?.paused !== true;
    const glyphs: Array<[(cx: number, cy: number) => void, boolean]> = [
      [(cx, cy) => { tri(cx + 0.6, cy, 1.6, -1); ctx.fillRect(cx - 2.2, cy - 1.6, 0.7, 3.2); }, false],
      [(cx, cy) => tri(cx + 0.4, cy, 1.8), playing],
      [(cx, cy) => { ctx.fillRect(cx - 1.6, cy - 1.7, 1.2, 3.4); ctx.fillRect(cx + 0.4, cy - 1.7, 1.2, 3.4); }, f.live && !playing],
      [(cx, cy) => ctx.fillRect(cx - 1.6, cy - 1.6, 3.2, 3.2), !f.live],
      [(cx, cy) => { tri(cx - 0.6, cy, 1.6); ctx.fillRect(cx + 1.5, cy - 1.6, 0.7, 3.2); }, false],
    ];
    glyphs.forEach(([glyph, lit], i) => button(3 + i * 10.5, 62.5, 9.5, 6.5, glyph, lit));
    button(57, 62.5, 8, 6.5, (cx, cy) => { tri(cx, cy - 0.4, 1.4); ctx.fillRect(cx - 1.6, cy + 1.4, 3.2, 0.7); }, false);
    ctx.font = "4px Silkscreen, monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#9898aa";
    ctx.fillText("SHUFFLE", 70, 67.4);
    glowText(`DJ ${f.dj.toUpperCase()}`, 189, 68.4, "11px VT323, monospace", f.resident ? "#c8b030" : WA_GREEN, "right");
    texture.needsUpdate = true;
  };

  // The llama, stage left of the decks: it nods along, and touched, hops and turns round.
  const wool = mat("#e3cfa2", 0.9);
  const dark = mat("#3a2a1a", 0.7);
  const llama = new THREE.Group();
  const body = box(0.9, 0.42, 0.36, wool);
  body.position.y = 0.86;
  const neck = new THREE.Group();
  neck.position.set(0.36, 1.0, 0);
  const neckBox = box(0.16, 0.62, 0.16, wool);
  neckBox.position.y = 0.3;
  const head = box(0.32, 0.2, 0.2, wool);
  head.position.set(0.1, 0.66, 0);
  const snout = box(0.1, 0.11, 0.14, mat("#cdb88a", 0.9));
  snout.position.set(0.3, 0.62, 0);
  neck.add(neckBox, head, snout);
  for (const z of [-0.06, 0.06]) {
    const ear = box(0.05, 0.14, 0.05, wool);
    ear.position.set(-0.02, 0.82, z);
    const eye = box(0.02, 0.04, 0.04, dark, false);
    eye.position.set(0.2, 0.7, z * 1.6);
    neck.add(ear, eye);
  }
  llama.add(body, neck);
  for (const [x, z] of [[-0.32, -0.12], [-0.32, 0.12], [0.32, -0.12], [0.32, 0.12]]) {
    const leg = box(0.1, 0.66, 0.1, wool);
    leg.position.set(x, 0.33, z);
    const hoof = box(0.11, 0.06, 0.11, dark, false);
    hoof.position.set(x, 0.03, z);
    llama.add(leg, hoof);
  }
  const tail = box(0.1, 0.16, 0.1, wool);
  tail.position.set(-0.48, 0.95, 0);
  llama.add(tail);
  llama.position.set(-3.1, STAGE_Y, -6.45);
  llama.rotation.y = -Math.PI / 2 + 0.5;    // side on to the crowd, looking at the decks
  llama.userData.animated = true;
  kit.root.add(kit.things.tag(llama, "llama"));
  let llamaSpin = 0;
  kit.things.things.llama = (since) => {
    const k = Math.min(1, since / 0.9);
    llama.position.y = STAGE_Y + Math.sin(k * Math.PI) * 0.35;
    llamaSpin = -Math.PI / 2 + 0.5 + k * Math.PI * 2;
    return since < 0.9;
  };

  return {
    look: { colours: ["#29ce10", "#94de21", "#d6b521", "#d66600", "#ef3110"], walls: "#15151e", floor: "#0b0b10", sign: "it really whips the llama's ass", signColour: "#e8c018", signFont: "700 64px Silkscreen, 'Pixelify Sans', monospace" },
    wall: { texture, crisp: false, gain: 1.5, paint },
    floor: (col, row, cols, rows, f, out) => {
      if (!f.live) return null;
      // An analyser across the floor: the lows on the left, each bar rising away from the bar towards the stage.
      const level = bandOf(f.spectrum, col, cols);
      const up = (rows - 1 - row) / Math.max(1, rows - 1);
      out.copy(VIS_COLOURS[15 - Math.min(15, Math.floor(up * 16))]);
      return up <= level * 1.05 ? 0.9 : 0.035;
    },
    labels: { llama: "Pet the llama" },
    sounds: { llama: playLlama },
    update: (f) => {
      paint(f);
      if (!kit.things.playing.has("llama")) {
        llama.position.y = STAGE_Y;
        llamaSpin = -Math.PI / 2 + 0.5;
      }
      llama.rotation.y = llamaSpin;
      // A nod on every beat, harder the more the music goes.
      const nod = f.live && !f.calm ? Math.max(0, Math.sin(f.phase * Math.PI)) * (0.12 + 0.25 * f.energy) : 0.03 * Math.sin(f.t * 0.8);
      neck.rotation.z = -nod;
      tail.rotation.x = f.live ? Math.sin(f.beat * Math.PI) * 0.4 : 0;
    },
    dispose: () => undefined,
  };
}

// ---------------------------------------------------------------- the cantina

const SABERS = ["#3d8bff", "#2bff5a", "#ff2424", "#b45cff", "#3d8bff", "#2bff5a", "#ff2424", "#ffd21f"];
const ROMAN = ["IV", "V", "VI", "I", "II", "III", "VII", "VIII", "IX"];

function cantina(kit: DressKit): ClubDress {
  wantFont("700 40px 'News Cycle'");
  const W = 1024;
  const H = 376;
  const { ctx, texture, due } = painter(kit, W, H);
  const song = songClock();
  // Stars in a box in front of the wall, flying at you.
  const STARS = 460;
  const r = seeded(77);
  const stars = Array.from({ length: STARS }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, z: 0.05 + r() * 0.95, b: 0.4 + r() * 0.6 }));
  let speed = 0.05;
  let sunset = 0;
  let hyper = 0;
  let crawlAt = -100;
  let crawl: HTMLCanvasElement | null = null;
  let lastDrop = Infinity;

  const drawCrawl = (f: SkinFrame) => {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1100;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#ffe81f";
    c.textAlign = "center";
    c.textBaseline = "top";
    c.font = "700 44px 'News Cycle', 'Franklin Gothic Medium', sans-serif";
    c.fillText(`EPISODE ${ROMAN[(song.count - 1) % ROMAN.length]}`, 360, 20);
    c.font = "700 72px 'News Cycle', 'Franklin Gothic Medium', sans-serif";
    let y = 90;
    const wrap = (text: string, size: number, max: number, justify: boolean) => {
      const words = text.split(/\s+/);
      let line = "";
      const lines: string[] = [];
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (c.measureText(next).width > max && line) { lines.push(line); line = word; } else line = next;
      }
      if (line) lines.push(line);
      for (const [i, text] of lines.entries()) {
        if (justify && i < lines.length - 1) {
          // Justified, as the crawl is: the spaces stretched to the margin.
          const parts = text.split(" ");
          const gap = (max - parts.reduce((sum, part) => sum + c.measureText(part).width, 0)) / Math.max(1, parts.length - 1);
          let x = 360 - max / 2;
          c.textAlign = "left";
          for (const part of parts) { c.fillText(part, x, y); x += c.measureText(part).width + gap; }
          c.textAlign = "center";
        } else c.fillText(text, 360, y);
        y += size * 1.18;
      }
    };
    wrap((f.title ?? "").toUpperCase(), 72, 680, false);
    y += 34;
    c.font = "700 38px 'News Cycle', 'Franklin Gothic Medium', sans-serif";
    const by = f.artist ? ` by ${f.artist}` : "";
    wrap(`It is a period of ${f.bpm ? `${Math.round(f.bpm)} beats a minute` : "great music"}. From the decks of the HOFFLE CANTINA, DJ ${f.dj.toUpperCase()} has put on ${f.title ?? "a song"}${by}, and the crowd has taken the dance floor.`, 38, 640, true);
    y += 28;
    wrap("Somewhere in the mix, the drop is coming. Only those on the floor will know when....", 38, 640, true);
    crawl = canvas;
  };

  const paint = (f: SkinFrame) => {
    if (song.step(f)) { crawlAt = f.t; drawCrawl(f); }
    const dt = due(f.dt);
    if (!dt) return;
    const beatSeconds = 60 / (f.bpm ?? 120);
    if (f.live && f.sinceDrop < lastDrop && f.sinceDrop < 0.5) { hyper = 1; crawlAt = -100; }
    lastDrop = f.sinceDrop;
    // Into hyperspace on the drop for a few beats; faster as the music goes and through a build.
    hyper = Math.max(0, hyper - dt / (beatSeconds * 6));
    const want = !f.live ? 0.05 : f.section === "breakdown" ? 0.04 : 0.1 + 0.35 * f.energy + 1.4 * f.build ** 2;
    speed += (Math.max(want, hyper * 3) - speed) * Math.min(1, dt * (hyper > 0.5 ? 12 : 2));
    sunset += ((f.live && f.section === "breakdown" ? 1 : 0) - sunset) * Math.min(1, dt * 0.8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    // Hyperspace's blue glow down the tunnel.
    if (hyper > 0.02) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      g.addColorStop(0, `rgba(190,220,255,${0.9 * hyper})`);
      g.addColorStop(0.25, `rgba(60,110,255,${0.45 * hyper})`);
      g.addColorStop(1, "rgba(0,0,30,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const fx = W * 0.42;
    const stretch = Math.min(0.9, speed * 0.55);
    ctx.lineCap = "round";
    for (const star of stars) {
      star.z -= speed * dt;
      if (star.z <= 0.02) { star.z = 1; star.x = r() * 2 - 1; star.y = r() * 2 - 1; }
      const sx = W / 2 + (star.x / star.z) * fx;
      const sy = H / 2 + (star.y / star.z) * fx;
      if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) { star.z = 1; continue; }
      const tail = star.z + stretch * star.z;
      const tx = W / 2 + (star.x / tail) * fx;
      const ty = H / 2 + (star.y / tail) * fx;
      const bright = clamp01(star.b * (1.2 - star.z)) * (1 - sunset * 0.8);
      ctx.strokeStyle = hyper > 0.2 ? `rgba(${200 + 55 * hyper},${225 + 30 * hyper},255,${bright})` : `rgba(255,255,255,${bright})`;
      ctx.lineWidth = 1 + 2.2 * (1 - star.z) + (f.live ? f.kickHit * 0.8 : 0);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(sx + 0.01, sy);
      ctx.stroke();
    }

    // A breakdown: Tatooine's two suns going down over the dunes, a moisture vaporator on the ridge.
    if (sunset > 0.01) {
      ctx.globalAlpha = sunset;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#1c1430");
      sky.addColorStop(0.45, "#a2405a");
      sky.addColorStop(0.75, "#ff9a3c");
      sky.addColorStop(1, "#ffd27a");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const sink = (f.t * 4) % 60;
      const swell = f.show ? f.show.vocals : 0;
      for (const [x, y, radius] of [[600, 210 + sink, 34], [690, 240 + sink, 24]] as const) {
        const sun = ctx.createRadialGradient(x, y, 0, x, y, radius * (2.4 + swell));
        sun.addColorStop(0, "#fffbe8");
        sun.addColorStop(0.35, "#ffe08a");
        sun.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = sun;
        ctx.fillRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
      }
      for (const [base, amp, colour, k] of [[285, 22, "#5a2a1c", 0.006], [320, 16, "#2a140e", 0.009]] as const) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base + Math.sin(x * k + base) * amp + Math.sin(x * k * 2.7) * amp * 0.4);
        ctx.lineTo(W, H);
        ctx.fill();
      }
      ctx.fillStyle = "#2a140e";
      ctx.fillRect(238, 236, 6, 60);
      ctx.fillRect(228, 250, 26, 4);
      ctx.fillRect(232, 236, 18, 3);
      ctx.globalAlpha = 1;
    }

    // A new song's opening crawl: the blue line, then the yellow text sliding away into the stars.
    const since = f.t - crawlAt;
    if (since < 2.8) {
      ctx.globalAlpha = clamp01(Math.min(since / 0.6, (2.8 - since) / 0.6));
      ctx.fillStyle = "#4bd5ee";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "400 40px 'News Cycle', 'Franklin Gothic Medium', sans-serif";
      ctx.fillText("A long time ago in a galaxy far,", 150, H / 2 - 26);
      ctx.fillText("far away....", 150, H / 2 + 26);
      ctx.globalAlpha = 1;
    } else if (crawl && since < 26) {
      const scroll = (since - 2.8) * 52 - 40;
      const top = 30;
      for (let y = top; y < H; y++) {
        const s = (y - top) / (H - top);
        const depth = 1 / (0.1 + 0.9 * s);
        const row = Math.floor(scroll - (depth - 1) * 120);
        if (row < 0 || row >= crawl.height) continue;
        const width = (W * 0.98) / depth;
        ctx.globalAlpha = clamp01((9 - depth) / 4) * clamp01((26 - since) / 2);
        ctx.drawImage(crawl, 0, row, crawl.width, 1, W / 2 - width / 2, y, width, 1);
      }
      ctx.globalAlpha = 1;
    }

    // The words round the edge, or, with nothing on, the title.
    ctx.textBaseline = "alphabetic";
    if (!f.live) {
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.font = "800 118px 'News Cycle', 'Franklin Gothic Medium', sans-serif";
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#ffe81f";
      ctx.fillStyle = "#000";
      ctx.strokeText("HOFFLE", W / 2, 170);
      ctx.fillText("HOFFLE", W / 2, 170);
      ctx.font = "800 64px 'News Cycle', 'Franklin Gothic Medium', sans-serif";
      ctx.lineWidth = 5;
      ctx.strokeText("CANTINA", W / 2, 245);
      ctx.fillText("CANTINA", W / 2, 245);
      ctx.font = "400 30px 'News Cycle', sans-serif";
      ctx.fillStyle = "#4bd5ee";
      ctx.fillText("start the night from the decks", W / 2, 305);
    } else {
      ctx.font = "700 34px 'News Cycle', sans-serif";
      ctx.fillStyle = "#ffe81f";
      ctx.textAlign = "left";
      ctx.fillText(`DJ ${f.dj.toUpperCase()}`, 28, 50);
      ctx.textAlign = "right";
      if (f.next) ctx.fillText(`JUMPING TO ${f.next.toUpperCase()}`, W - 28, 50, 560);
      if (f.bpm) {
        ctx.font = "700 28px 'News Cycle', sans-serif";
        ctx.fillText(`${Math.round(f.bpm)} BPM`, W - 28, H - 24);
      }
      if (since >= 26 && f.title) {
        ctx.textAlign = "left";
        ctx.font = "700 30px 'News Cycle', sans-serif";
        ctx.fillText(f.title.toUpperCase(), 28, H - 24, 640);
      }
    }
    texture.needsUpdate = true;
  };

  // The sabers: the stage's beam fan, a hilt on the stage for each, the blade lit as the beam would be.
  const up = new THREE.Vector3(0, 1, 0);
  const hiltMaterial = mat("#b9bcc4", 0.3, { metalness: 0.85 });
  const gripMaterial = mat("#1a1a1e", 0.6);
  const coreGeometry = kit.track(new THREE.CylinderGeometry(0.02, 0.02, 1, 8, 1));
  coreGeometry.translate(0, 0.5, 0);
  const glowGeometry = kit.track(new THREE.CylinderGeometry(0.055, 0.055, 1, 12, 1, true));
  glowGeometry.translate(0, 0.5, 0);
  const haloGeometry = kit.track(new THREE.CylinderGeometry(0.14, 0.14, 1, 12, 1, true));
  haloGeometry.translate(0, 0.5, 0);
  const sabers: Array<{ group: THREE.Group; blade: THREE.Group; core: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial; colour: THREE.Color; length: number }> = [];
  const additive = (colour: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const fans = (beams: readonly FanBeam[], f: SkinFrame) => {
    while (sabers.length < beams.length) {
      const i = sabers.length;
      const group = new THREE.Group();
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.28, 12), hiltMaterial);
      hilt.position.y = -0.14;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.1, 12), gripMaterial);
      grip.position.y = -0.17;
      const blade = new THREE.Group();
      const core = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
      const glow = additive(SABERS[i % SABERS.length]);
      const halo = additive(SABERS[i % SABERS.length], 0.35);
      const coreMesh = new THREE.Mesh(coreGeometry, core);
      const glowMesh = new THREE.Mesh(glowGeometry, glow);
      const haloMesh = new THREE.Mesh(haloGeometry, halo);
      glowMesh.renderOrder = 4;
      haloMesh.renderOrder = 5;
      for (const mesh of [coreMesh, glowMesh, haloMesh]) {
        mesh.raycast = () => undefined;
        // The club lights itself: the finishing's emitter boost stays out of it (as for everything built with it).
        (mesh.material as THREE.Material).userData.noGlow = true;
      }
      blade.add(coreMesh, glowMesh, haloMesh);
      group.add(hilt, grip, blade);
      group.userData.animated = true;
      kit.root.add(group);
      sabers.push({ group, blade, core, glow, halo, colour: new THREE.Color(SABERS[i % SABERS.length]), length: 0 });
    }
    beams.forEach((beam, i) => {
      const saber = sabers[i];
      saber.group.position.copy(beam.at);
      saber.group.quaternion.setFromUnitVectors(up, beam.dir.y < 0 ? beam.dir.clone().negate() : beam.dir);
      // Lit in a snap and put away as fast, as sabers are.
      const want = beam.level > 0.06 ? 2.6 + 0.6 * clamp01(beam.level) : 0;
      saber.length = want > saber.length ? Math.min(want, saber.length + f.dt * 14) : Math.max(want, saber.length - f.dt * 10);
      saber.blade.visible = saber.length > 0.01;
      saber.blade.scale.set(1, Math.max(0.001, saber.length), 1);
      const hum = 0.92 + 0.08 * Math.sin(f.t * 63 + i * 1.7);
      const lit = (0.55 + 1.1 * clamp01(beam.level)) * hum * Math.min(1, f.M + 0.1);
      saber.core.color.setScalar(1.3 * lit);
      saber.glow.color.copy(saber.colour).multiplyScalar(1.6 * lit);
      saber.halo.color.copy(saber.colour).multiplyScalar(0.45 * lit);
    });
  };

  // The mirror ball is the Death Star: panels, the trench round its middle, the dish.
  const deathStar = kit.track(canvasTexture(512, 256, (c) => {
    const rand = seeded(9);
    c.fillStyle = "#8d929a";
    c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) {
      const shade = 120 + Math.floor(rand() * 60);
      c.fillStyle = `rgb(${shade},${shade + 3},${shade + 8})`;
      c.fillRect(Math.floor(rand() * 512), Math.floor(rand() * 256), 4 + Math.floor(rand() * 18), 2 + Math.floor(rand() * 8));
    }
    c.fillStyle = "#3a3d44";
    c.fillRect(0, 125, 512, 7);
    c.fillStyle = "#b8bcc4";
    c.fillRect(0, 124, 512, 1);
    const dish = (x: number, y: number) => {
      c.fillStyle = "#6c717a";
      c.beginPath(); c.ellipse(x, y, 30, 22, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#50545c"; c.lineWidth = 3;
      c.beginPath(); c.ellipse(x, y, 20, 14, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = "#3a3d44";
      c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
    };
    dish(128, 74);
    dish(128 + 512, 74);
  }));
  const ball = { geometry: kit.track(new THREE.SphereGeometry(0.46, 36, 18)), material: kit.track(new THREE.MeshStandardMaterial({ map: deathStar, metalness: 0.75, roughness: 0.32, flatShading: true, emissive: "#16181e" })) };

  // An astromech beside the decks: it rocks and turns its dome to the beat, its eye flashing on the kick.
  const droid = new THREE.Group();
  const panels = kit.track(canvasTexture(256, 128, (c) => {
    c.fillStyle = "#e8eaee";
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "#2c5fd6";
    for (const [x, y, w, h] of [[20, 14, 40, 22], [80, 10, 24, 50], [150, 18, 56, 16], [30, 70, 30, 40], [120, 76, 70, 12], [210, 60, 20, 50]]) c.fillRect(x, y, w, h);
    c.fillStyle = "#9aa0aa";
    for (let x = 0; x < 256; x += 32) c.fillRect(x, 0, 2, 128);
  }));
  const dome = kit.track(canvasTexture(256, 64, (c) => {
    c.fillStyle = "#c9ccd2";
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = "#2c5fd6";
    for (let x = 0; x < 256; x += 42) c.fillRect(x + 6, 30, 24, 22);
    c.fillStyle = "#1a1a1e";
    c.fillRect(110, 34, 14, 12);
  }));
  const shell = new THREE.MeshStandardMaterial({ map: panels, roughness: 0.4, metalness: 0.2 });
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.56, 24), shell);
  bodyMesh.position.y = 0.42;
  const head = new THREE.Group();
  head.position.y = 0.7;
  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: dome, roughness: 0.25, metalness: 0.7 }));
  const eye = new THREE.MeshBasicMaterial({ color: "#ff2a2a", toneMapped: false });
  const eyeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), eye);
  eyeMesh.position.set(0, 0.1, 0.2);
  eyeMesh.rotation.x = -0.45;
  head.add(domeMesh, eyeMesh);
  droid.add(bodyMesh, head);
  for (const side of [-1, 1]) {
    const leg = box(0.07, 0.62, 0.14, mat("#e8eaee", 0.4));
    leg.position.set(side * 0.26, 0.38, 0);
    const foot = box(0.12, 0.1, 0.24, mat("#9aa0aa", 0.5));
    foot.position.set(side * 0.26, 0.05, 0.02);
    droid.add(leg, foot);
  }
  droid.position.set(CLUB_DECKS.x + CLUB_DECKS.width / 2 + 0.55, STAGE_Y, CLUB_DECKS.z - 0.1);
  droid.rotation.y = -0.35;
  droid.userData.animated = true;
  kit.root.add(kit.things.tag(droid, "club-droid"));
  kit.things.things["club-droid"] = (since) => {
    head.rotation.y = Math.sin(since * 14) * 0.9 * (1 - since / 1.6);
    droid.position.y = STAGE_Y + Math.abs(Math.sin(since * 9)) * 0.05;
    return since < 1.6;
  };

  return {
    look: { colours: ["#4fa3ff", "#38ff7a", "#ff3b3b", "#b15cff", "#ffe81f"], walls: "#2a1d12", floor: "#0e0a07", sign: "cantina", signColour: "#ffe81f", signFont: "800 132px 'News Cycle', 'Franklin Gothic Medium', sans-serif" },
    wall: { texture, crisp: true, gain: 1.6, paint },
    fans,
    bolts: true,
    ball,
    labels: { "club-droid": "Poke the droid" },
    sounds: { "club-droid": playBeeps },
    update: (f) => {
      paint(f);
      if (!kit.things.playing.has("club-droid")) {
        droid.position.y = STAGE_Y;
        const swing = f.live && !f.calm ? Math.sin(f.beat * Math.PI * 0.5) * (0.5 + 0.4 * f.energy) : Math.sin(f.t * 0.3) * 0.4;
        head.rotation.y = swing;
        droid.rotation.z = f.live && !f.calm ? Math.sin(f.beat * Math.PI) * 0.06 : 0;
      }
      eye.color.set(f.live && f.kickHit > 0.5 ? "#7fc8ff" : "#ff2a2a").multiplyScalar(1 + (f.live ? f.kickHit * 2 : 0.4 * (Math.sin(f.t * 2) > 0 ? 1 : 0)));
    },
    dispose: () => undefined,
  };
}

// ---------------------------------------------------------------- the construct

const LATIN_RAIN = "0123456789Z:.=*+-<>¦|ÇTEJHIKLRVXY";
const KANA_RAIN = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ012345789Z:.=*+-<>";

/** The film's glyphs, mirrored, green and white, cell by cell: a sheet to copy from. */
function rainAtlas(cell: number) {
  // Half-width katakana where the system has a font for them (they don't draw as the missing-glyph box); else
  // the letters and numbers.
  const probe = document.createElement("canvas");
  probe.width = probe.height = 24;
  const p = probe.getContext("2d", { willReadFrequently: true })!;
  p.font = "20px monospace";
  const ink = (glyph: string) => {
    p.clearRect(0, 0, 24, 24);
    p.fillText(glyph, 2, 20);
    const data = p.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 3; i < data.length; i += 4) sum = (sum * 31 + data[i]) % 1000003;
    return sum;
  };
  const kana = ink("\uff71") !== ink("\ue000") && ink("\uff71") !== ink("");
  const glyphs = [...(kana ? KANA_RAIN : LATIN_RAIN)];
  const sheet = document.createElement("canvas");
  sheet.width = glyphs.length * cell;
  sheet.height = cell * 2;
  const c = sheet.getContext("2d")!;
  c.font = `${Math.round(cell * 0.9)}px 'Share Tech Mono', 'MS Gothic', 'Osaka', monospace`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  glyphs.forEach((glyph, i) => {
    for (const [row, colour, blur] of [[0, "#3cff7a", 4], [1, "#e8fff0", 8]] as const) {
      c.save();
      c.translate(i * cell + cell / 2, row * cell + cell / 2);
      c.scale(-1, 1);
      c.shadowColor = row ? "#b9ffcf" : "#00ff66";
      c.shadowBlur = blur;
      c.fillStyle = colour;
      c.fillText(glyph, 0, 1);
      c.restore();
    }
  });
  return { sheet, count: glyphs.length };
}

/** Columns of falling code on a canvas of `cols` × `rows` cells. */
function rain(cols: number, rows: number, seed: number) {
  const r = seeded(seed);
  const columns = Array.from({ length: cols }, () => ({ head: -r() * rows * 2, speed: 5 + r() * 9, length: 6 + Math.floor(r() * 16) }));
  const cells = new Uint8Array(cols * rows).map(() => Math.floor(r() * 64));
  return {
    columns,
    step(dt: number, tempo: number) {
      for (const column of columns) {
        column.head += column.speed * tempo * dt;
        if (column.head - column.length > rows) { column.head = -r() * 6; column.speed = 5 + r() * 9; column.length = 6 + Math.floor(r() * 16); }
      }
      // Now and then a glyph changes its mind.
      for (let k = 0; k < cols * rows * dt * 0.6; k++) cells[Math.floor(r() * cells.length)] = Math.floor(r() * 64);
    },
    draw(c: CanvasRenderingContext2D, atlas: { sheet: HTMLCanvasElement; count: number }, cell: number, w: number, h: number, bright: number, heads: number, white: number) {
      for (let x = 0; x < cols; x++) {
        const column = columns[x];
        const top = Math.max(0, Math.floor(column.head - column.length));
        const bottom = Math.min(rows - 1, Math.floor(column.head));
        for (let y = top; y <= bottom; y++) {
          const behind = column.head - y;
          const head = behind < 1;
          c.globalAlpha = Math.min(1, (head ? 0.85 + 0.15 * heads : (1 - behind / column.length) ** 1.1) * bright);
          const glyph = cells[x * rows + y] % atlas.count;
          c.drawImage(atlas.sheet, glyph * cell, head || white > 0.5 ? cell : 0, cell, cell, x * w, y * h, w, h);
        }
      }
      c.globalAlpha = 1;
    },
  };
}

function construct(kit: DressKit): ClubDress {
  wantFont("20px 'Share Tech Mono'");
  const W = 1024;
  const H = 376;
  const CELL = 32;
  const { ctx, texture, due } = painter(kit, W, H);
  let atlas: ReturnType<typeof rainAtlas> | null = null;
  const COLS = 64;
  const ROWS = 19;
  const wallRain = rain(COLS, ROWS, 5);
  // The neon tubes: a strip of rain each, from one canvas of their own.
  const tubes = painter(kit, 28 * 16, 14 * 20);
  const tubeRain = rain(28, 14, 11);
  const song = songClock();
  let lines: string[] = [];
  let typedAt = 0;
  let lastDrop = Infinity;
  let frozenUntil = -1;
  let rushUntil = -1;
  let ringAt = -100;
  let glitchAt = -100;

  const say = (t: number, next: string[]) => { lines = next; typedAt = t; };

  const paint = (f: SkinFrame) => {
    if (song.step(f)) say(f.t, ["> now playing:", `> ${f.title}`, ...(f.artist ? [`> ${f.artist}`] : []), "> follow the white rabbit."]);
    if (!f.live && !lines.length) say(f.t, ["> wake up...", "> the construct has you.", "> start the night from the decks_"]);
    if (f.live && !f.title && !lines.length) say(f.t, ["> the music is real."]);
    if (kit.things.playing.has("payphone") && f.t - ringAt > 4) { ringAt = f.t; say(f.t, ["> ring ring.", "> the operator: you have a call."]); }
    if (kit.things.playing.has("pill") && f.t - glitchAt > 3) glitchAt = f.t;
    const dt = due(f.dt);
    if (!dt) return;
    atlas ??= rainAtlas(CELL);
    const beatSeconds = 60 / (f.bpm ?? 120);
    // Bullet time on the drop: the code hangs for a beat, white, then pours down twice as fast.
    if (f.live && f.sinceDrop < lastDrop && f.sinceDrop < 0.5 && !f.calm) { frozenUntil = f.t + beatSeconds; rushUntil = f.t + beatSeconds * 5; }
    lastDrop = f.sinceDrop;
    const frozen = f.t < frozenUntil;
    const tempo = frozen ? 0.02 : !f.live ? 0.35 : f.section === "breakdown" ? 0.3 : (f.t < rushUntil ? 2.2 : 0.6 + 0.9 * f.energy + 1.6 * f.build) * Math.min(1.4, (f.bpm ?? 120) / 120);
    wallRain.step(dt, tempo);
    tubeRain.step(dt, tempo);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const bright = !f.live ? 0.55 : f.section === "breakdown" ? 0.45 + 0.5 * (f.show?.vocals ?? 0) : 0.75 + 0.25 * f.energy;
    wallRain.draw(ctx, atlas, CELL, W / COLS, H / ROWS, bright, f.live ? f.kickHit : 0, frozen ? 1 : 0);
    const tc = tubes.ctx;
    tc.fillStyle = "#000";
    tc.fillRect(0, 0, 28 * 16, 14 * 20);
    tubeRain.draw(tc, atlas, CELL, 16, 20, bright, f.live ? f.kickHit : 0, frozen ? 1 : 0);
    tubes.texture.needsUpdate = true;

    // The terminal: lines typed out and left a while.
    const since = f.t - typedAt;
    if (lines.length && since < 12) {
      const typed = Math.floor(since * 24);
      ctx.globalAlpha = clamp01((12 - since) / 1.2);
      ctx.fillStyle = "rgba(0,0,0,0.82)";
      ctx.fillRect(34, H - 58 - lines.length * 36, 600, lines.length * 36 + 30);
      ctx.strokeStyle = "rgba(0,255,102,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(34, H - 58 - lines.length * 36, 600, lines.length * 36 + 30);
      ctx.font = "26px 'Share Tech Mono', ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#3cff7a";
      ctx.shadowColor = "#00ff66";
      ctx.shadowBlur = 6;
      let left = typed;
      lines.forEach((line, i) => {
        if (left <= 0) return;
        const shown = line.slice(0, left);
        left -= line.length;
        const cursor = left <= 0 && Math.floor(f.t * 2) % 2 === 0 ? "█" : "";
        ctx.fillText(shown + cursor, 52, H - 46 - (lines.length - 1 - i) * 36 - 12, 560);
      });
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    } else if (since >= 12) lines = [];
    ctx.font = "26px 'Share Tech Mono', ui-monospace, monospace";
    ctx.fillStyle = "#b9ffcf";
    ctx.textAlign = "right";
    ctx.fillText(`DJ ${f.dj.toUpperCase()}`, W - 30, 44);
    if (f.next) { ctx.textAlign = "left"; ctx.fillText(`> loading ${f.next}...`, 30, 44, 600); }
    if (f.bpm && f.live) { ctx.textAlign = "right"; ctx.fillText(`${Math.round(f.bpm)} BPM`, W - 30, H - 24); }

    // The red pill: the system fails for a moment, in slices.
    const glitch = f.t - glitchAt;
    if (glitch < 2.6) {
      const r = seeded(Math.floor(f.t * 20));
      for (let k = 0; k < 10; k++) {
        const y = Math.floor(r() * H);
        const h = 6 + Math.floor(r() * 30);
        ctx.drawImage(ctx.canvas, 0, y, W, h, (r() - 0.5) * 80, y, W, h);
      }
      ctx.fillStyle = "rgba(255,0,40,0.18)";
      ctx.fillRect(0, 0, W, H);
      if (Math.floor(glitch * 4) % 2 === 0) {
        ctx.fillStyle = "#000";
        ctx.fillRect(W / 2 - 250, H / 2 - 46, 500, 92);
        ctx.strokeStyle = "#3cff7a";
        ctx.lineWidth = 3;
        ctx.strokeRect(W / 2 - 250, H / 2 - 46, 500, 92);
        ctx.font = "54px 'Share Tech Mono', ui-monospace, monospace";
        ctx.fillStyle = "#3cff7a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SYSTEM FAILURE", W / 2, H / 2 + 2);
        ctx.textBaseline = "alphabetic";
      }
    }
    texture.needsUpdate = true;
  };

  // The tubes show a strip each of their own rain (a quarter of the canvas's width per two tubes).
  const tube = (index: number) => {
    const geometry = new THREE.PlaneGeometry(0.34, 2.2);
    const uv = geometry.attributes.uv as THREE.BufferAttribute;
    const u0 = (index % 14) / 14;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) / 14);
    geometry.rotateY(index < 7 ? Math.PI / 2 : -Math.PI / 2);
    return geometry;
  };

  // The payphone on the back wall, right of the bar: it rings when touched.
  const phone = new THREE.Group();
  const casing = box(0.36, 0.62, 0.16, mat("#2a2c30", 0.45, { metalness: 0.6 }));
  const hood = box(0.46, 0.06, 0.26, mat("#1c1d20", 0.5, { metalness: 0.5 }));
  hood.position.y = 0.36;
  const handset = new THREE.Group();
  const grip = box(0.06, 0.3, 0.06, mat("#0e0e10", 0.5));
  const ends = [-0.15, 0.15].map((y) => { const end = box(0.09, 0.07, 0.09, mat("#0e0e10", 0.5)); end.position.y = y; return end; });
  handset.add(grip, ...ends);
  handset.position.set(-0.12, 0.02, 0.12);
  const keys = box(0.16, 0.2, 0.02, mat("#8a8e96", 0.3, { metalness: 0.8 }));
  keys.position.set(0.06, 0.04, 0.09);
  const slot = box(0.1, 0.03, 0.02, mat("#c8a838", 0.3, { metalness: 0.9 }));
  slot.position.set(0.06, 0.22, 0.09);
  phone.add(casing, hood, handset, keys, slot);
  phone.position.set(CLUB_BAR.x1 + 2.0, 1.45, CLUB_HALF_Z - 0.1);
  phone.rotation.y = Math.PI;
  phone.userData.animated = true;
  kit.root.add(kit.things.tag(phone, "payphone"));
  kit.things.things.payphone = (since) => {
    // Two rings: the handset rattles in its cradle.
    const ringing = since % 1.5 < 0.8 && since < 3;
    handset.rotation.z = ringing ? Math.sin(since * 80) * 0.08 : 0;
    handset.position.y = 0.02 + (ringing ? Math.abs(Math.sin(since * 80)) * 0.01 : 0);
    return since < 3;
  };

  // The pills, in a dish on the bar.
  const pills = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.03, 20), mat("#d8dce2", 0.2, { metalness: 0.3 }));
  pills.add(dish);
  for (const [x, colour] of [[-0.04, "#e0102a"], [0.04, "#1a4cff"]] as const) {
    const pill = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.04, 4, 10), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.2, emissive: colour, emissiveIntensity: 0.25 }));
    pill.rotation.z = Math.PI / 2;
    pill.position.set(x, 0.035, 0);
    pills.add(pill);
  }
  pills.position.set(1.6, 1.16, (CLUB_BAR.z0 + CLUB_BAR.z1) / 2 - 0.05);
  pills.userData.animated = true;
  kit.root.add(kit.things.tag(pills, "pill"));
  kit.things.things.pill = (since) => since < 2.6;

  return {
    look: { colours: ["#00ff66", "#39ff14", "#00cc55", "#b9ffcf"], walls: "#020a04", floor: "#010402", sign: "the construct", signColour: "#00ff66", signFont: "400 120px 'Share Tech Mono', ui-monospace, monospace" },
    wall: { texture, crisp: true, gain: 2.6, paint },
    tube,
    tubeMap: tubes.texture,
    floor: (col, row, _cols, rows, f, out) => {
      if (!f.live) return null;
      // Code pours across the floor towards the bar, a tile a beat: one head per column, a fading trail behind it.
      const head = ((f.beat * 1.5 + col * 2.618) % (rows + 5)) - 2;
      const behind = head - row;
      if (behind < 0 || behind > 4) { out.set("#00ff66"); return 0.03; }
      if (behind < 1) { out.set("#d8ffe6"); return 0.95; }
      out.set("#00ff66");
      return 0.75 * (1 - behind / 4.5);
    },
    labels: { payphone: "Answer the phone", pill: "Take the red pill" },
    sounds: { payphone: playPayphone, pill: playRedPill },
    update: (f) => { paint(f); },
    dispose: () => undefined,
  };
}

// ---------------------------------------------------------------- redstone

const CREEPER_FACE = [".##..##.", ".##..##.", "...##...", "..####..", "..####..", "..#..#.."];

function redstone(kit: DressKit): ClubDress {
  wantFont("10px 'Pixelify Sans'");
  // Pixel art: 24 × 6 lamps of 16 pixels, and a strip for the words.
  const W = 384;
  const H = 144;
  const { ctx, texture, due } = painter(kit, W, H, true);
  const lamp = (lit: boolean, seed: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const c = canvas.getContext("2d")!;
    const r = seeded(seed);
    speckle(c, r, lit ? ["#f9d17a", "#ffe6a6", "#f3b85a", "#ffd88c"] : ["#5a3a1e", "#4e3219", "#663f20", "#472d16"]);
    c.fillStyle = lit ? "#b8762a" : "#2e1d0e";
    c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1); c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16);
    c.fillStyle = lit ? "#fff4d0" : "#3a2512";
    for (const [x, y, w, h] of [[7, 3, 2, 10], [3, 7, 10, 2], [4, 4, 2, 2], [10, 4, 2, 2], [4, 10, 2, 2], [10, 10, 2, 2]]) c.fillRect(x, y, w, h);
    return canvas;
  };
  const lit = lamp(true, 3);
  const unlit = lamp(false, 4);
  const tnt = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const c = canvas.getContext("2d")!;
    speckle(c, seeded(8), ["#db2b1f", "#c4241a", "#e8402e"]);
    c.fillStyle = "#e8e8e8";
    c.fillRect(0, 5, 16, 6);
    c.fillStyle = "#1a1a1a";
    for (const [x, y, w, h] of [[2, 6, 3, 1], [3, 7, 1, 3], [6, 6, 1, 4], [7, 7, 1, 1], [8, 8, 1, 1], [9, 6, 1, 4], [11, 6, 3, 1], [12, 7, 1, 3]]) c.fillRect(x, y, w, h);
    return canvas;
  })();
  const COLS = 24;
  const ROWS = 6;
  const song = songClock();
  let drops = 0;
  let lastDrop = Infinity;
  let explodedAt = -100;
  let xp = 0;
  const show = new Float32Array(COLS);

  const paint = (f: SkinFrame) => {
    song.step(f);
    if (f.live && f.sinceDrop < lastDrop && f.sinceDrop < 0.5) { drops++; explodedAt = f.t; }
    lastDrop = f.sinceDrop;
    const dt = due(f.dt);
    if (!dt) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1a120a";
    ctx.fillRect(0, 0, W, H);
    const phrase = Math.floor(f.beat / 32) % 4;
    const boom = f.t - explodedAt;
    const beatIndex = Math.floor(f.beat);
    for (let i = 0; i < COLS; i++) {
      const level = f.live ? bandOf(f.spectrum, i, COLS) : 0;
      show[i] = level > show[i] ? level : Math.max(level, show[i] - dt * 2);
    }
    const r = seeded(Math.floor(f.t * 6));
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const up = (ROWS - 1 - y) / (ROWS - 1);
        const dx = x - (COLS - 1) / 2;
        const dy = (y - (ROWS - 1) / 2) * 1.6;
        const d = Math.hypot(dx, dy) / 12;
        let on: boolean;
        let block = lit;
        if (!f.live) on = r() < 0.06;
        else if (boom < 1.2 && !f.calm) on = r() < 0.92 - boom * 0.5;             // the explosion
        else if (f.section === "build" && f.build > 0.7) { on = true; block = Math.floor(f.t * 6) % 2 && !f.calm ? lit : tnt; } // primed
        else if (f.section === "build") on = up <= f.build * 1.1;
        else if (f.section === "breakdown") {
          // A creeper looks out of the wall: its eyes and mouth lit.
          const fx = x - 8;
          on = fx >= 0 && fx < 8 && CREEPER_FACE[y][fx] === "#";
          if (fx < 0 || fx >= 8) on = r() < 0.03 * (f.show?.vocals ?? 0);
        } else if (phrase === 1) on = Math.abs(d - (1 - f.kickHit)) < 0.12 || d < f.kickHit * 0.15;
        else if (phrase === 2) on = (x + y + beatIndex) % 2 === 0 && f.kickHit > 0.2;
        else if (phrase === 3) on = ((x + y * 2 + Math.floor(f.beat * 2)) % 8) < 2;
        else on = up <= show[x] * 1.05;
        ctx.drawImage(on ? block : unlit, x * 16, y * 16);
      }
    }
    // The strip: the XP bar filling with the music, the level the drops so far, the record's words in colour.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 96, W, 48);
    xp += ((f.live ? (f.section === "build" ? f.build : f.energy) : 0) - xp) * Math.min(1, dt * 3);
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(92, 108, 200, 5);
    ctx.fillStyle = "#80ff20";
    ctx.fillRect(93, 109, Math.round(198 * xp), 3);
    ctx.font = "10px 'Pixelify Sans', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    if (drops) {
      ctx.fillStyle = "#1a3a06";
      ctx.fillText(String(drops), 193, 107);
      ctx.fillStyle = "#80ff20";
      ctx.fillText(String(drops), 192, 106);
    }
    const words = f.title ? `Now playing: ${f.artist ? `${f.artist} - ` : ""}${f.title}` : "Now playing: nothing - start the night from the decks";
    const hue = Math.floor((f.t * 90) % 360);
    ctx.font = "15px 'Pixelify Sans', monospace";
    ctx.fillStyle = `hsl(${hue},100%,16%)`;
    ctx.fillText(words, W / 2 + 1.5, 131.5, W - 16);
    ctx.fillStyle = `hsl(${hue},100%,62%)`;
    ctx.fillText(words, W / 2, 130, W - 16);
    ctx.font = "9px 'Pixelify Sans', monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`<${f.dj}>`, 6, 113);
    if (f.bpm && f.live) { ctx.textAlign = "right"; ctx.fillStyle = "#ffff55"; ctx.fillText(`${Math.round(f.bpm)} BPM`, W - 6, 113); }
    if (f.next) { ctx.textAlign = "center"; ctx.fillStyle = "#55ffff"; ctx.fillText(`next: ${f.next}`, W / 2, 142, W - 16); }
    texture.needsUpdate = true;
  };

  // Note blocks either side of the decks: each part of the song plays its own, in Minecraft's note colours.
  const plank = pixelTexture(kit, 16, (c, r) => {
    speckle(c, r, ["#6b4428", "#5c3a22", "#74492b", "#55351f"]);
    c.fillStyle = "#3a2414";
    for (const y of [0, 15]) c.fillRect(0, y, 16, 1);
    c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16);
  }, 5);
  const noteFace = pixelTexture(kit, 16, (c, r) => {
    speckle(c, r, ["#6b4428", "#5c3a22", "#74492b", "#55351f"]);
    c.fillStyle = "#2a1a0e";
    for (const [x, y, w, h] of [[9, 3, 1, 8], [10, 3, 2, 1], [12, 4, 1, 1], [6, 9, 3, 3], [7, 12, 1, 1]]) c.fillRect(x, y, w, h);
    c.fillStyle = "#3a2414";
    c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1); c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16);
  }, 6);
  const blockMaterial = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.9 });
  const faceMaterial = new THREE.MeshStandardMaterial({ map: noteFace, roughness: 0.9 });
  const noteBlocks: Array<{ mesh: THREE.Mesh; part: 0 | 1 | 2; pop: number }> = [];
  ([[-1.95, 0], [-2.5, 0], [-3.05, 2], [1.95, 1], [2.5, 1], [3.05, 2]] as const).forEach(([x, part]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), [blockMaterial, blockMaterial, blockMaterial, blockMaterial, faceMaterial, blockMaterial]);
    mesh.position.set(x, STAGE_Y + 0.25, CLUB_DECKS.z - 0.05);
    mesh.castShadow = true;
    mesh.userData.animated = true;
    kit.root.add(kit.things.tag(mesh, "noteblock"));
    noteBlocks.push({ mesh, part, pop: 0 });
  });
  // The ♪ that floats up when a block plays, tinted per note.
  const noteTexture = kit.track(canvasTexture(64, 64, (c) => {
    c.fillStyle = "#ffffff";
    c.font = "bold 54px serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("♪", 32, 34);
  }));
  noteTexture.magFilter = THREE.NearestFilter;
  const floaters = Array.from({ length: 36 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture, transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.setScalar(0.42);
    sprite.visible = false;
    sprite.renderOrder = 7;
    sprite.raycast = () => undefined;
    kit.root.add(sprite);
    return { sprite, age: 9, from: new THREE.Vector3(), drift: 0 };
  });
  let nextFloater = 0;
  const emit = (block: (typeof noteBlocks)[number], pc: number) => {
    const floater = floaters[nextFloater++ % floaters.length];
    const [red, green, blue] = noteBlockColour(pc);
    floater.sprite.material.color.setRGB(red * 1.6, green * 1.6, blue * 1.6);
    floater.from.copy(block.mesh.position).add(new THREE.Vector3(0, 0.35, 0));
    floater.drift = (Math.random() - 0.5) * 0.3;
    floater.age = 0;
    block.pop = 1;
  };
  const heard: Array<number | null> = [null, null, null];
  const heardAt = [0, 0, 0];
  let pokeNote = 0;
  kit.things.things.noteblock = (since) => {
    if (since === 0) {
      pokeNote = Math.floor(Math.random() * 12);
      emit(noteBlocks[Math.floor(Math.random() * noteBlocks.length)], pokeNote);
    }
    return since < 0.3;
  };

  // The mirror ball is a cube of glass blocks.
  const glass = pixelTexture(kit, 16, (c) => {
    c.fillStyle = "#cfe8f2";
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 16, 1); c.fillRect(0, 15, 16, 1); c.fillRect(0, 0, 1, 16); c.fillRect(15, 0, 1, 16);
    for (const [x, y] of [[3, 3], [4, 4], [5, 5], [3, 5], [10, 9], [11, 10]]) c.fillRect(x, y, 1, 1);
    c.fillStyle = "#9fc4d4";
    c.fillRect(1, 14, 14, 1);
  }, 7);
  glass.wrapS = glass.wrapT = THREE.RepeatWrapping;
  glass.repeat.set(3, 3);
  const ball = { geometry: kit.track(new THREE.BoxGeometry(0.72, 0.72, 0.72)), material: kit.track(new THREE.MeshStandardMaterial({ map: glass, metalness: 0.85, roughness: 0.12, emissive: "#121a20" })) };

  // The neon tubes are columns of redstone lamps.
  const tubeMap = pixelTexture(kit, 16, (c) => { c.drawImage(lit, 0, 0); }, 3);
  tubeMap.wrapS = tubeMap.wrapT = THREE.RepeatWrapping;
  tubeMap.repeat.set(1, 14);

  // A creeper by the dance floor: it bobs to the beat; poked, it hisses and swells... then thinks better of it.
  const greens = ["#0da70b", "#5bd35a", "#3e9a3c", "#18b818", "#4fb84c"];
  const skin = pixelTexture(kit, 16, (c, r) => speckle(c, r, greens), 21);
  const face = pixelTexture(kit, 16, (c, r) => {
    speckle(c, r, greens);
    c.fillStyle = "#0a0a0a";
    for (const [x, y, w, h] of [[2, 4, 4, 4], [10, 4, 4, 4], [6, 8, 4, 4], [4, 10, 2, 4], [10, 10, 2, 4]]) c.fillRect(x, y, w, h);
  }, 22);
  const creeperMaterials: THREE.MeshStandardMaterial[] = [];
  const part = (w: number, h: number, d: number, front: THREE.Texture, y: number, x = 0, z = 0) => {
    const faces = [skin, skin, skin, skin, front, skin].map((map) => {
      const m = new THREE.MeshStandardMaterial({ map, roughness: 0.9, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0 });
      creeperMaterials.push(m);
      return m;
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), faces);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };
  const creeper = new THREE.Group();
  const creeperHead = part(0.46, 0.46, 0.46, face, 1.32);
  const creeperBody = part(0.46, 0.7, 0.24, skin, 0.74);
  for (const [x, z] of [[-0.12, 0.2], [0.12, 0.2], [-0.12, -0.2], [0.12, -0.2]]) creeper.add(part(0.22, 0.4, 0.22, skin, 0.2, x, z));
  creeper.add(creeperHead, creeperBody);
  creeper.position.set(6.1, 0, -3.6);
  creeper.rotation.y = -0.9;
  creeper.userData.animated = true;
  kit.root.add(kit.things.tag(creeper, "club-creeper"));
  kit.things.things["club-creeper"] = (since) => {
    const k = Math.min(1, since / 1.5);
    const flash = Math.sin(since * (8 + k * 30)) > 0.2 ? 0.9 * Math.sin(k * Math.PI) + 0.1 : 0;
    for (const m of creeperMaterials) m.emissiveIntensity = since < 1.5 ? flash : 0;
    const swell = since < 1.5 ? 1 + Math.sin(k * Math.PI) * 0.12 : 1;
    creeper.scale.set(swell, 1 + (swell - 1) * 0.5, swell);
    return since < 1.5;
  };

  return {
    look: { colours: ["#55ff55", "#55ffff", "#ff55ff", "#ffff55", "#ff5555"], walls: "#18130c", floor: "#0e0b07", sign: "redstone", signColour: "#ff5555", signFont: "700 150px 'Pixelify Sans', monospace" },
    wall: { texture, crisp: true, gain: 0.9, paint },
    ball,
    tube: () => new THREE.BoxGeometry(0.16, 2.2, 0.16),
    tubeMap,
    booth: new THREE.MeshStandardMaterial({ map: noteFace, roughness: 0.9 }),
    labels: { noteblock: "Play the note block", "club-creeper": "Poke the creeper" },
    sounds: { noteblock: () => playNoteBlock(pokeNote), "club-creeper": playHiss },
    update: (f) => {
      paint(f);
      // Each part's new note sets its block off, at most a few a second each.
      const notes = f.live ? f.show?.notes : null;
      for (const part of [0, 1, 2] as const) {
        const note = notes?.[part] ?? null;
        const pc = note && note.strength > 0.25 ? note.pc : null;
        if (pc !== null && (pc !== heard[part] || f.t - heardAt[part] > 60 / (f.bpm ?? 120) * 2) && f.t - heardAt[part] > 0.22) {
          const choices = noteBlocks.filter((block) => block.part === part);
          emit(choices[Math.floor(Math.random() * choices.length)], pc);
          heardAt[part] = f.t;
        }
        heard[part] = pc;
      }
      for (const block of noteBlocks) {
        block.pop = Math.max(0, block.pop - f.dt * 5);
        block.mesh.scale.setScalar(1 + block.pop * 0.12);
      }
      for (const floater of floaters) {
        floater.age += f.dt;
        const k = floater.age / 1.3;
        floater.sprite.visible = k < 1;
        if (k >= 1) continue;
        floater.sprite.position.set(floater.from.x + floater.drift * k, floater.from.y + k * 0.9, floater.from.z);
        floater.sprite.material.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.95 + 0.05;
      }
      if (!kit.things.playing.has("club-creeper")) {
        const bob = f.live && !f.calm ? Math.abs(Math.sin(f.phase * Math.PI)) * 0.05 * (0.5 + f.energy) : 0;
        creeper.position.y = bob;
        creeperHead.rotation.x = f.live ? Math.sin(f.beat * Math.PI) * 0.12 : 0;
      }
    },
    dispose: () => undefined,
  };
}
