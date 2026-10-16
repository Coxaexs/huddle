/**
 * Natural 1s that belong to an app theme rather than a dice material:
 *
 * creeper   (Minecraft) a creeper walks up to the die, hisses, flashes and
 *           blows it up: blocks fly, a crater, "d20 was blown up by Creeper".
 * virus-xp  (MSN Messenger) the die catches a virus: XP error windows pile up
 *           in a trail across the screen, then a blue screen.
 * virus-ts  (TeamSpeak 2) the same, in Windows 98 grey with TeamSpeak's errors.
 * zombie    a rotting hand bursts out of the table, grabs the die and drags
 *           it under; dirt flies and the hole closes over it.
 *
 * Built on the helpers in dice-crit-fx, like the material effects.
 */

import {
  bakeToWorld,
  clamp01,
  cloneMaterials,
  createOverlay,
  disposePieces,
  easeOutCubic,
  fragment,
  pick,
  prefersReducedMotion,
  rand,
  screenRadius,
  setGlow,
  setOpacity,
  shakePage,
  smooth,
  stepPiece,
  toScreen,
  type Effect,
  type EffectCtx,
  type Piece,
} from "./dice-crit-fx";
import { playCreeperHiss } from "../lib/dice-sounds";

export type FumbleSkin = "creeper" | "virus-xp" | "virus-ts" | "zombie";

/** The theme fumble for the app theme you are in, or else for the roll's dice style. */
export function fumbleSkinFor(diceStyle: string | null | undefined, appTheme?: string | null): FumbleSkin | null {
  if (appTheme === "minecraft") return "creeper";
  if (appTheme === "teamspeak") return "virus-ts";
  if (appTheme?.startsWith("msn")) return "virus-xp";
  if (appTheme === "zombie") return "zombie";
  if (diceStyle === "minecraft") return "creeper";
  if (diceStyle === "msn") return "virus-xp";
  if (diceStyle === "zombie") return "zombie";
  return null;
}

/** Stable 0..1 noise per grid cell, so pixel textures don't shimmer. */
function cellNoise(x: number, y: number, salt = 0): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// --------------------------------------------------------------------------
// Creeper
// --------------------------------------------------------------------------

const CREEPER_FACE = [
  "........",
  "........",
  ".XX..XX.",
  ".XX..XX.",
  "...XX...",
  "..XXXX..",
  "..XXXX..",
  "..X..X..",
];
const CREEPER_GREENS = ["#0da70b", "#5bd35a", "#3e9a3c", "#7fe07e", "#18b818", "#4fb84c"];
const CREEPER_DARK = ["#0a0a0a", "#1d1d1d", "#173117"];

/**
 * Front view, 8 px wide: head 8x8, body 8x12, two legs 4x6. `footY` is where
 * the feet stand, `u` the size of one texture pixel.
 */
function drawCreeper(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  u: number,
  step: number,
  flash: number,
  swell: number,
) {
  const ux = u * (1 + swell * 0.22);
  const uy = u * (1 + swell * 0.12);
  const left = cx - 4 * ux;
  const cell = (gx: number, gy: number, color: string, lift = 0) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(left + gx * ux), Math.round(footY - (26 - gy) * uy - lift), Math.ceil(ux), Math.ceil(uy));
  };
  const bob = Math.abs(Math.sin(step)) * u * 0.6;
  // Legs: the front pair steps alternately.
  const liftL = Math.max(0, Math.sin(step)) * u * 1.2;
  const liftR = Math.max(0, -Math.sin(step)) * u * 1.2;
  for (let gy = 20; gy < 26; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const n = cellNoise(gx, gy, 3);
      const shade = gx === 3 || gx === 4 ? "#0b5f0a" : CREEPER_GREENS[Math.floor(n * CREEPER_GREENS.length)];
      cell(gx, gy, gy === 25 ? "#0b5f0a" : shade, gx < 4 ? liftL : liftR);
    }
  }
  // Body.
  for (let gy = 8; gy < 20; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const n = cellNoise(gx, gy, 1);
      const base = CREEPER_GREENS[Math.floor(n * CREEPER_GREENS.length)];
      cell(gx, gy, n < 0.12 ? "#2f7d2c" : base, bob);
    }
  }
  // Head and face.
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 8; gx++) {
      const n = cellNoise(gx, gy, 2);
      const face = CREEPER_FACE[gy][gx] === "X";
      cell(gx, gy, face ? CREEPER_DARK[Math.floor(n * CREEPER_DARK.length)] : CREEPER_GREENS[Math.floor(n * CREEPER_GREENS.length)], bob);
    }
  }
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, footY - 26 * uy - bob, 8 * ux, 20 * uy);
    ctx.fillRect(left, footY - 6 * uy, 8 * ux, 6 * uy);
    ctx.globalAlpha = 1;
  }
}

const BLOCKS: Array<{ top: string[]; side: string[] }> = [
  { top: ["#5fa83a", "#6cbb44", "#4e9230"], side: ["#866043", "#79553a", "#966c4a", "#5fa83a"] }, // grass
  { top: ["#866043", "#79553a", "#966c4a"], side: ["#866043", "#79553a", "#966c4a"] }, // dirt
  { top: ["#7f7f7f", "#8f8f8f", "#6e6e6e"], side: ["#7f7f7f", "#8f8f8f", "#6e6e6e", "#5d5d5d"] }, // stone
  { top: ["#9a9a9a", "#6b6b6b", "#7b7b7b"], side: ["#7b7b7b", "#555555", "#9a9a9a"] }, // cobble
  { top: ["#dbd3a0", "#d1c58e", "#e3dbac"], side: ["#dbd3a0", "#c9bd85", "#e3dbac"] }, // sand
];

/** A little block icon, 4x4 texture pixels with a darker right/bottom edge. */
function drawBlock(ctx: CanvasRenderingContext2D, size: number, kind: number, seed: number) {
  const b = BLOCKS[kind];
  const p = size / 4;
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const list = gy === 0 ? b.top : b.side;
      ctx.fillStyle = list[Math.floor(cellNoise(gx, gy, seed) * list.length)];
      ctx.fillRect(-size / 2 + gx * p, -size / 2 + gy * p, Math.ceil(p), Math.ceil(p));
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(size / 2 - p * 0.5, -size / 2, p * 0.5, size);
  ctx.fillRect(-size / 2, size / 2 - p * 0.5, size, p * 0.5);
}

/** Minecraft nat 1: a creeper walks up, hisses, flashes and blows the die up. */
export function creeperBlast({ box, die, onHit }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, radius } = bakeToWorld(die);
  const overlay = createOverlay();
  const reduced = prefersReducedMotion();
  const centre = toScreen(box, rest);
  const r = screenRadius(box, rest, radius);
  const u = Math.max(3, Math.min(7, r * 0.12));
  const fromLeft = centre.x > overlay.w / 2;
  const standX = centre.x + (fromLeft ? -1 : 1) * (r + 4.6 * u);
  const startX = fromLeft ? -10 * u : overlay.w + 10 * u;
  const footY = centre.y + r * 0.7;
  const WALK = reduced ? 0 : 1150;
  const FUSE = 1500;
  const BLAST = WALK + FUSE;
  const blastAt = { x: (standX + centre.x) / 2, y: centre.y };
  const reach = 26 * u * 1.1;

  let hissed = false;
  let blown = false;
  let pieces: Piece[] = [];
  const puffs = Array.from({ length: reduced ? 10 : 28 }, (_, i) => {
    const a = rand(0, Math.PI * 2);
    const d = i < 4 ? rand(0, reach * 0.2) : rand(reach * 0.15, reach * 0.75);
    return { x: blastAt.x + Math.cos(a) * d, y: blastAt.y + Math.sin(a) * d * 0.8, size: rand(0.5, 1) * u * 7, delay: rand(0, 260), life: rand(700, 1300), rise: rand(10, 50) };
  });
  const debris = Array.from({ length: reduced ? 6 : 18 }, () => {
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const speed = rand(380, 900);
    return {
      x: blastAt.x, y: blastAt.y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      rot: rand(0, Math.PI * 2), spin: rand(-9, 9),
      size: rand(1.6, 2.8) * u * 2, kind: Math.floor(rand(0, BLOCKS.length)), seed: Math.floor(rand(0, 99)),
    };
  });
  // The crater: a ragged pixel blob of scorched dirt where the die was.
  const craterCell = u * 2.2;
  const craterCells: Array<{ x: number; y: number; c: string }> = [];
  const craterR = reach * 0.55;
  for (let gy = -12; gy <= 12; gy++) {
    for (let gx = -16; gx <= 16; gx++) {
      const x = gx * craterCell, y = gy * craterCell * 0.62;
      const d = Math.hypot(x, y / 0.62) / craterR;
      const edge = 0.78 + cellNoise(gx, gy, 9) * 0.3;
      if (d > edge) continue;
      const inner = d < 0.55;
      const n = cellNoise(gx, gy, 5);
      const c = inner ? pick(["#1b120c", "#24180f", "#130d08", "#2b1d12"]) : n < 0.5 ? "#4a3322" : n < 0.8 ? "#3a281a" : "#5b4030";
      craterCells.push({ x: blastAt.x + x, y: centre.y + r * 0.5 + y, c });
    }
  }
  const font = (() => {
    try {
      return getComputedStyle(document.body).fontFamily || "monospace";
    } catch {
      return "monospace";
    }
  })();

  return {
    duration: BLAST + 2700,
    update(ms, dt) {
      overlay.clear();
      const ctx = overlay.ctx;
      ctx.imageSmoothingEnabled = false;

      if (!blown) {
        let x = standX;
        let step = 0;
        let flash = 0;
        let swell = 0;
        if (ms < WALK) {
          const t = smooth(ms / WALK);
          x = startX + (standX - startX) * t;
          step = ms / 95;
        } else {
          if (!hissed) {
            hissed = true;
            void playCreeperHiss(FUSE / 1000);
          }
          const f = clamp01((ms - WALK) / FUSE);
          // Blinks faster and faster, swelling as the fuse runs out.
          const rate = 2 + f * f * 14;
          flash = Math.sin(((ms - WALK) / 1000) * rate * Math.PI * 2) > 0.2 ? 0.55 + f * 0.4 : 0;
          swell = f * f;
          const k = f * radius * 0.06;
          die.position.set(rest.x + rand(-k, k), rest.y + rand(-k, k), rest.z);
          setGlow(materials, 0xffffff, flash * 0.5);
        }
        // A soft shadow under the feet.
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(x - 4.5 * u, footY - u * 0.4, 9 * u, u * 0.9);
        drawCreeper(ctx, x, footY, u, step, flash, swell);
        if (ms < BLAST) return;
        blown = true;
        onHit();
        shakePage(reduced ? 0.6 : 2.8, 520);
        setGlow(materials, 0x000000, 0);
        const frag = fragment(box, die, materials, (radius * radius) / 14, 1);
        pieces = frag.pieces.map((p) => {
          const speed = rand(500, 1300);
          const flat = Math.hypot(p.dir[0], p.dir[1]) || 1;
          p.mesh.castShadow = false;
          return {
            mesh: p.mesh,
            vel: [(p.dir[0] / flat) * speed, (p.dir[1] / flat) * speed, rand(300, 900)] as [number, number, number],
            spin: [rand(-25, 25), rand(-25, 25), rand(-25, 25)] as [number, number, number],
          };
        });
      }

      const since = ms - BLAST;
      for (const p of pieces) stepPiece(p, dt, 2600, 0.35);
      if (since > 1600) setOpacity(materials, 1 - clamp01((since - 1600) / 700));

      // Crater, under everything else.
      const craterAlpha = Math.min(1, since / 120) * (1 - clamp01((since - 2100) / 500));
      ctx.globalAlpha = craterAlpha;
      for (const c of craterCells) {
        ctx.fillStyle = c.c;
        ctx.fillRect(Math.round(c.x), Math.round(c.y), Math.ceil(craterCell), Math.ceil(craterCell * 0.62));
      }
      ctx.globalAlpha = 1;

      // Flying blocks.
      for (const b of debris) {
        b.vy += 1900 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.spin * dt;
        ctx.save();
        ctx.globalAlpha = 1 - clamp01((since - 1700) / 500);
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        drawBlock(ctx, b.size, b.kind, b.seed);
        ctx.restore();
      }

      // Smoke puffs: square, white to grey, the way the game draws them.
      for (const p of puffs) {
        const t = (since - p.delay) / p.life;
        if (t < 0 || t > 1) continue;
        const s = p.size * (0.35 + easeOutCubic(t) * 0.9);
        const g = Math.round(255 - t * 150);
        ctx.globalAlpha = (1 - t) * 0.92;
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        const px = p.x - s / 2;
        const py = p.y - s / 2 - p.rise * t;
        ctx.fillRect(px, py, s, s);
        ctx.fillStyle = `rgba(0,0,0,0.12)`;
        ctx.fillRect(px + s * 0.5, py + s * 0.5, s * 0.5, s * 0.5);
      }
      ctx.globalAlpha = 1;

      // The blast flash.
      if (since < 180) {
        ctx.fillStyle = `rgba(255,250,235,${0.85 * (1 - since / 180)})`;
        ctx.fillRect(0, 0, overlay.w, overlay.h);
      }

      // The death message, in the game's chat.
      if (since > 250) {
        const a = Math.min(1, (since - 250) / 150) * (1 - clamp01((since - 2200) / 400));
        const msg = "d20 was blown up by Creeper";
        ctx.font = `600 ${Math.round(Math.max(14, u * 3.2))}px ${font}`;
        const w = ctx.measureText(msg).width;
        const h = Math.max(14, u * 3.2) * 1.6;
        const x = 16;
        const y = overlay.h - 96;
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(x - 6, y - h * 0.75, w + 12, h);
        ctx.fillStyle = "#3f3f3f";
        ctx.fillText(msg, x + 2, y + 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(msg, x, y);
        ctx.globalAlpha = 1;
      }
      if (since > 2300) overlay.fadeOut();
    },
    destroy: () => {
      overlay.destroy();
      disposePieces(box.scene, pieces);
    },
  };
}

// --------------------------------------------------------------------------
// Virus (MSN Messenger / TeamSpeak 2)
// --------------------------------------------------------------------------

type Popup = { title: string; text: string; icon: "error" | "warn" | "info"; buttons: string[] };

const XP_POPUPS: Popup[] = [
  { title: "d20.exe", text: "d20.exe has encountered a problem and needs to close. We are sorry for the inconvenience.", icon: "error", buttons: ["Send Error Report", "Don't Send"] },
  { title: "Virus Alert!", text: "W32.NatOne.worm was found in d20.exe. Your luck could not be repaired.", icon: "warn", buttons: ["OK"] },
  { title: "MSN Messenger", text: "Your contact Lady Luck has signed out.", icon: "info", buttons: ["OK"] },
  { title: "Low on Luck", text: "Your system is low on luck. To free some up, close a few dice.", icon: "warn", buttons: ["OK"] },
  { title: "CONGRATULATIONS!!!", text: "You are the 1,000,000th visitor! Click here to claim your FREE iPod!", icon: "info", buttons: ["Claim!", "Close"] },
  { title: "dice.dll", text: "The procedure entry point RollHigh could not be located in the dynamic link library dice.dll.", icon: "error", buttons: ["OK"] },
  { title: "Windows", text: "A fatal exception 0E has occurred at 0028:C0000001 in NAT(01). The current roll will be terminated.", icon: "error", buttons: ["OK"] },
  { title: "Internet Explorer", text: "Smiley Central wants to install 4,000 new emoticons. Allow?", icon: "warn", buttons: ["Yes", "Yes"] },
];

const TS_POPUPS: Popup[] = [
  { title: "TeamSpeak 2", text: "Connection to the dice lost. Error 1: you rolled a one.", icon: "error", buttons: ["OK"] },
  { title: "Virus found", text: "Trojan.Fumble was found in d20.exe and could not be quarantined.", icon: "warn", buttons: ["OK"] },
  { title: "TeamSpeak 2", text: "Packet loss: 100% of your luck.", icon: "warn", buttons: ["Retry", "Cancel"] },
  { title: "d20.exe - Application Error", text: "The instruction at 0x00000001 referenced memory at 0x00000014. The memory could not be \"rolled\".", icon: "error", buttons: ["OK", "Cancel"] },
  { title: "TeamSpeak 2", text: "You were kicked from channel Luck (reason: rolled a 1).", icon: "info", buttons: ["OK"] },
  { title: "Disk Error", text: "Not ready reading drive D20. Abort, Retry, Fail?", icon: "error", buttons: ["Abort", "Retry", "Fail"] },
  { title: "Windows", text: "This program has performed an illegal operation and will be shut down.", icon: "error", buttons: ["Close", "Details >>"] },
];

const ICONS: Record<Popup["icon"], { bg: string; fg: string; glyph: string; round: boolean }> = {
  error: { bg: "radial-gradient(circle at 35% 30%, #ff8a7a, #d11a00 60%, #8b0d00)", fg: "#fff", glyph: "✕", round: true },
  warn: { bg: "linear-gradient(#ffe880, #f2c200)", fg: "#000", glyph: "!", round: false },
  info: { bg: "radial-gradient(circle at 35% 30%, #a9d0ff, #2563d8 60%, #123a8a)", fg: "#fff", glyph: "i", round: true },
};

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text) node.textContent = text;
  return node;
}

function buildPopup(p: Popup, skin: "xp" | "ts"): HTMLElement {
  const xp = skin === "xp";
  const win = el("div", {
    position: "absolute",
    width: "330px",
    fontFamily: xp ? "Tahoma, Verdana, Segoe UI, sans-serif" : "'MS Sans Serif', Tahoma, Arial, sans-serif",
    fontSize: "11px",
    color: "#000",
    background: xp ? "#ece9d8" : "#c0c0c0",
    border: xp ? "1px solid #0831d9" : "2px outset #dfdfdf",
    borderRadius: xp ? "8px 8px 0 0" : "0",
    boxShadow: xp ? "2px 4px 14px rgba(0,0,0,0.45)" : "1px 1px 0 #000",
    overflow: "hidden",
  });
  const bar = el("div", {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: xp ? "26px" : "18px",
    padding: xp ? "0 4px 0 8px" : "0 2px 0 4px",
    color: "#fff",
    fontWeight: "bold",
    fontSize: xp ? "12px" : "11px",
    textShadow: xp ? "1px 1px 0 #0a246a" : "none",
    background: xp
      ? "linear-gradient(180deg, #0997ff 0%, #0053ee 8%, #0050ee 40%, #06f 88%, #06f 93%, #005bff 95%, #003dd7 96%, #003dd7 100%)"
      : "linear-gradient(90deg, #000080, #1084d0)",
  });
  bar.appendChild(el("span", { flex: "1", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }, p.title));
  bar.appendChild(
    el(
      "span",
      xp
        ? { width: "21px", height: "21px", borderRadius: "3px", border: "1px solid #fff", background: "linear-gradient(135deg, #e97a5a, #c4391b)", display: "grid", placeItems: "center", fontSize: "13px" }
        : { width: "16px", height: "14px", background: "#c0c0c0", color: "#000", border: "2px outset #fff", display: "grid", placeItems: "center", fontSize: "10px", lineHeight: "1" },
      "✕",
    ),
  );
  win.appendChild(bar);
  const body = el("div", { display: "flex", gap: "12px", padding: "14px 14px 8px", alignItems: "flex-start" });
  const icon = ICONS[p.icon];
  body.appendChild(
    el(
      "span",
      {
        flex: "none",
        width: "32px",
        height: "32px",
        display: "grid",
        placeItems: "center",
        borderRadius: icon.round ? "50%" : "0",
        clipPath: icon.round ? "none" : "polygon(50% 0, 100% 100%, 0 100%)",
        background: icon.bg,
        color: icon.fg,
        fontWeight: "bold",
        fontSize: icon.round ? "17px" : "18px",
        paddingTop: icon.round ? "0" : "8px",
        boxSizing: "border-box",
      },
      icon.glyph,
    ),
  );
  body.appendChild(el("span", { lineHeight: "1.4", paddingTop: "2px" }, p.text));
  win.appendChild(body);
  const row = el("div", { display: "flex", justifyContent: "center", gap: "6px", padding: "4px 12px 12px" });
  for (const label of p.buttons) {
    row.appendChild(
      el(
        "span",
        xp
          ? { minWidth: "72px", padding: "3px 8px", textAlign: "center", border: "1px solid #003c74", borderRadius: "3px", background: "linear-gradient(#fff, #ece9d8 85%, #d6d0bf)" }
          : { minWidth: "70px", padding: "3px 8px", textAlign: "center", background: "#c0c0c0", border: "2px outset #fff", boxShadow: "1px 1px 0 #000" },
        label,
      ),
    );
  }
  win.appendChild(row);
  return win;
}

function buildBlueScreen(skin: "xp" | "ts"): HTMLElement {
  const screen = el("div", {
    position: "absolute",
    inset: "0",
    background: skin === "xp" ? "#0000aa" : "#0000a8",
    color: "#fff",
    fontFamily: "'Lucida Console', 'Courier New', monospace",
    fontSize: "clamp(12px, 1.6vw, 18px)",
    lineHeight: "1.5",
    padding: "8vh 8vw",
    boxSizing: "border-box",
    whiteSpace: "pre-wrap",
    opacity: "0",
    transition: "opacity 80ms linear",
  });
  screen.textContent =
    skin === "xp"
      ? "A problem has been detected and Windows has been shut down to prevent damage\nto your dice.\n\nNAT_ONE_EXCEPTION\n\nIf this is the first time you've seen this Stop error screen,\nroll again. If this screen appears again, follow these steps:\n\nCheck to make sure your luck is properly installed.\n\n*** STOP: 0x00000001 (0x00000014, 0x00000000, 0x00000001, 0x00000000)\n\n*** d20.sys - Address F7C0FFEE base at F7C00000, DateStamp 3b7d855c"
      : "                          TeamSpeak\n\nA fatal exception 0E has occurred at 0028:C0011E36 in VXD DICE(01) +\n00000001. The current application will be terminated.\n\n*  Press any key to terminate the current application.\n*  Press CTRL+ALT+DEL again to restart your computer. You will\n   lose any unsaved luck in all applications.\n\n                      Press any key to continue _";
  return screen;
}

/** MSN / TeamSpeak nat 1: the die catches a virus and the desktop fills with error windows. */
export function virusInfection(skin: "xp" | "ts") {
  return ({ box, die, onHit }: EffectCtx): Effect => {
    const materials = cloneMaterials(die);
    const { rest, radius } = bakeToWorld(die);
    const reduced = prefersReducedMotion();
    const centre = toScreen(box, rest);
    const layer = el("div", {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483000",
      overflow: "hidden",
      transition: "opacity 300ms ease",
    });
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    const overlay = createOverlay();

    const INFECT = 650;
    const SPAWN_EVERY = reduced ? 380 : 120;
    const MAX = reduced ? 4 : 16;
    const BSOD = 3400;
    const END = 4300;
    const deck = [...(skin === "xp" ? XP_POPUPS : TS_POPUPS)];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // The trail: windows march down-right from the die, wrap and start again.
    let tx = Math.min(Math.max(16, centre.x - 160), vw - 350);
    let ty = Math.min(Math.max(16, centre.y - 90), vh - 190);
    let spawned = 0;
    let nextAt = INFECT;
    let hit = false;
    let pieces: Piece[] = [];
    let deleted = false;
    let blue: HTMLElement | null = null;
    const code = Array.from({ length: 40 }, () => ({ x: rand(-1, 1), y: rand(-1, 1), v: rand(30, 90), c: pick(["0", "1"]) }));

    return {
      duration: END,
      update(ms, dt) {
        overlay.clear();
        const ctx = overlay.ctx;
        if (!deleted) {
          // Infected: the die flickers sick green and twitches.
          const sick = clamp01(ms / INFECT);
          const k = sick * radius * 0.05;
          die.position.set(rest.x + rand(-k, k), rest.y + rand(-k, k), rest.z);
          setGlow(materials, Math.random() < 0.5 ? 0x00ff40 : 0x000000, sick * (0.4 + Math.random() * 0.6));
          if (ms > INFECT && Math.random() < 0.15) setOpacity(materials, rand(0.3, 1));
        }
        // Green binary leaking out of the die.
        if (ms < BSOD) {
          const r = screenRadius(box, rest, radius) * 2.2;
          ctx.font = "bold 13px monospace";
          for (const c of code) {
            const y = centre.y + c.y * r + ((ms / 1000) * c.v) % r;
            ctx.globalAlpha = 0.25 + 0.6 * clamp01(ms / INFECT) * Math.random();
            ctx.fillStyle = "#33ff66";
            ctx.fillText(Math.random() < 0.05 ? (c.c === "0" ? "1" : "0") : c.c, centre.x + c.x * r, y);
          }
          ctx.globalAlpha = 1;
        }
        if (ms >= INFECT && !hit) {
          hit = true;
          onHit();
        }
        // The error windows pile up.
        while (ms >= nextAt && spawned < MAX && ms < BSOD) {
          if (!deck.length) deck.push(...(skin === "xp" ? XP_POPUPS : TS_POPUPS));
          const popup = buildPopup(spawned === 0 ? deck.shift()! : deck.splice(Math.floor(rand(0, deck.length)), 1)[0], skin);
          popup.style.left = `${tx}px`;
          popup.style.top = `${ty}px`;
          layer.appendChild(popup);
          popup.animate([{ transform: "scale(0.92)", opacity: 0.4 }, { transform: "scale(1)", opacity: 1 }], { duration: 90, easing: "ease-out" });
          tx += 26;
          ty += 22;
          if (tx > vw - 340 || ty > vh - 180) {
            tx = rand(16, Math.max(17, vw * 0.4));
            ty = rand(16, Math.max(17, vh * 0.25));
          }
          spawned++;
          nextAt += SPAWN_EVERY * (spawned > 4 ? 0.75 : 1);
          if (spawned === 6 && skin === "xp") shakePage(1.6, 500); // a nudge
        }
        // Half way through the die is "deleted": it falls apart into drifting bits.
        if (!deleted && ms > 2100) {
          deleted = true;
          setGlow(materials, 0x00ff40, 0.6);
          setOpacity(materials, 1);
          const frag = fragment(box, die, materials, (radius * radius) / 16, 1);
          pieces = frag.pieces.map((p) => ({
            mesh: p.mesh,
            vel: [p.dir[0] * rand(40, 140), p.dir[1] * rand(40, 140), rand(40, 160)] as [number, number, number],
            spin: [rand(-4, 4), rand(-4, 4), rand(-4, 4)] as [number, number, number],
          }));
        }
        for (const p of pieces) stepPiece(p, dt, 900, 0.2);
        if (deleted) setOpacity(materials, 1 - clamp01((ms - 2300) / 900));

        if (ms >= BSOD && !reduced) {
          if (!blue) {
            blue = buildBlueScreen(skin);
            layer.appendChild(blue);
            requestAnimationFrame(() => blue && (blue.style.opacity = "1"));
          }
          if (ms > END - 380) layer.style.opacity = "0";
        } else if (ms > END - 500) {
          layer.style.opacity = "0";
        }
        if (ms > END - 500) overlay.fadeOut();
      },
      destroy: () => {
        overlay.destroy();
        layer.remove();
        disposePieces(box.scene, pieces);
      },
    };
  };
}

// --------------------------------------------------------------------------
// Zombie
// --------------------------------------------------------------------------

/** A rotting hand seen from above: palm, four fingers that curl by `grip`, a thumb and a torn cuff. */
function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, grip: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const s = size;
  // Torn sleeve at the wrist.
  ctx.fillStyle = "#3b3226";
  ctx.beginPath();
  ctx.moveTo(-0.42 * s, 0.95 * s);
  for (let i = 0; i <= 8; i++) ctx.lineTo(-0.42 * s + (i / 8) * 0.84 * s, (i % 2 ? 0.62 : 0.72) * s);
  ctx.lineTo(0.42 * s, 1.3 * s);
  ctx.lineTo(-0.42 * s, 1.3 * s);
  ctx.fill();
  const skin = ctx.createLinearGradient(0, -s, 0, s);
  skin.addColorStop(0, "#9cb07a");
  skin.addColorStop(1, "#5f7446");
  ctx.fillStyle = skin;
  ctx.strokeStyle = "#2c3a1e";
  ctx.lineWidth = Math.max(1.5, s * 0.04);
  // Wrist and palm.
  ctx.beginPath();
  ctx.roundRect(-0.28 * s, 0.1 * s, 0.56 * s, 0.7 * s, 0.1 * s);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-0.4 * s, -0.35 * s, 0.8 * s, 0.6 * s, 0.22 * s);
  ctx.fill();
  ctx.stroke();
  // Fingers: long when reaching, short knuckles when gripping.
  const reach = 0.62 - grip * 0.42;
  [-0.27, -0.09, 0.09, 0.27].forEach((fx, i) => {
    const len = (reach + (i === 1 || i === 2 ? 0.08 : 0)) * s;
    ctx.save();
    ctx.translate(fx * s, -0.3 * s);
    ctx.rotate((fx * 0.6) * (1 - grip));
    ctx.beginPath();
    ctx.roundRect(-0.075 * s, -len, 0.15 * s, len + 0.05 * s, 0.07 * s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3a3324";
    ctx.beginPath();
    ctx.roundRect(-0.05 * s, -len, 0.1 * s, 0.08 * s, 0.03 * s);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.restore();
  });
  // Thumb.
  ctx.save();
  ctx.translate(-0.38 * s, 0.05 * s);
  ctx.rotate(-0.9 + grip * 0.7);
  ctx.beginPath();
  ctx.roundRect(-0.07 * s, -0.36 * s, 0.15 * s, 0.4 * s, 0.07 * s);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // Rot spots.
  ctx.fillStyle = "rgba(60,80,30,0.55)";
  for (const [sx, sy, r] of [[0.12, -0.1, 0.07], [-0.15, 0.3, 0.05], [0.05, 0.55, 0.06]]) {
    ctx.beginPath();
    ctx.arc(sx * s, sy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Zombie nat 1: a hand bursts out of the table, grabs the die and drags it under. */
export function zombieGrab({ box, die, onHit }: EffectCtx): Effect {
  const materials = cloneMaterials(die);
  const { rest, radius, halfHeight } = bakeToWorld(die);
  const overlay = createOverlay();
  const reduced = prefersReducedMotion();
  const centre = toScreen(box, rest);
  const r = screenRadius(box, rest, radius);
  const OPEN = 450;
  const RISE = OPEN + 450;
  const GRAB = RISE + 500;
  const PULL = GRAB + 800;
  const CLOSE = PULL + 700;
  const angle = rand(-0.4, 0.4);
  let grabbed = false;
  let shook = false;
  const dirt = Array.from({ length: reduced ? 10 : 34 }, () => {
    const a = rand(0, Math.PI * 2);
    const speed = rand(120, 420);
    return { x: centre.x, y: centre.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 140, size: rand(3, 8), c: pick(["#3b2a1a", "#5a4026", "#2a1d10", "#6b4f30"]) };
  });
  const hole = Array.from({ length: 20 }, () => rand(0.75, 1.15));

  return {
    duration: CLOSE + 500,
    update(ms, dt) {
      overlay.clear();
      const ctx = overlay.ctx;
      // The hole: opens, stays while the hand works, closes over the die.
      const open = ms < OPEN ? easeOutCubic(ms / OPEN) : ms < PULL ? 1 : 1 - clamp01((ms - PULL) / (CLOSE - PULL));
      if (open > 0) {
        const hr = r * 1.5 * open;
        ctx.fillStyle = "#140d07";
        ctx.beginPath();
        hole.forEach((f, i) => {
          const a = (i / hole.length) * Math.PI * 2;
          const px = centre.x + Math.cos(a) * hr * f;
          const py = centre.y + Math.sin(a) * hr * f * 0.75;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#5a4026";
        ctx.lineWidth = Math.max(3, r * 0.15);
        ctx.stroke();
      }
      // A mound of fresh dirt once it has closed.
      if (ms > PULL) {
        const k = clamp01((ms - PULL) / 500);
        ctx.globalAlpha = k * (1 - clamp01((ms - CLOSE) / 450));
        ctx.fillStyle = "#4a3420";
        ctx.beginPath();
        ctx.ellipse(centre.x, centre.y, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6b4f30";
        ctx.beginPath();
        ctx.ellipse(centre.x - r * 0.2, centre.y - r * 0.15, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // Dirt thrown up as the hand bursts out.
      if (ms > OPEN * 0.6) {
        for (const d of dirt) {
          d.vy += 900 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          ctx.globalAlpha = 1 - clamp01((ms - RISE - 400) / 500);
          ctx.fillStyle = d.c;
          ctx.fillRect(d.x, d.y, d.size, d.size);
        }
        ctx.globalAlpha = 1;
      }
      if (!shook && ms > OPEN) {
        shook = true;
        shakePage(reduced ? 0.4 : 1.4, 320);
      }

      // The hand: rises toward the camera, grips, then sinks with the die.
      let size = 0;
      let grip = 0;
      if (ms > OPEN && ms < PULL + 200) {
        if (ms < RISE) size = easeOutCubic((ms - OPEN) / (RISE - OPEN)) * 1.15;
        else if (ms < GRAB) { size = 1.15 - smooth((ms - RISE) / (GRAB - RISE)) * 0.15; grip = smooth((ms - RISE) / (GRAB - RISE)); }
        else { size = 1 - smooth((ms - GRAB) / (PULL - GRAB)) * 0.85; grip = 1; }
        ctx.globalAlpha = ms > PULL ? 1 - (ms - PULL) / 200 : 1;
        drawHand(ctx, centre.x, centre.y + r * 0.1, r * 1.5 * size, grip, angle);
        ctx.globalAlpha = 1;
      }
      if (!grabbed && ms > RISE + 250) {
        grabbed = true;
        onHit();
      }
      // The die: twitches in the grip, then is dragged down through the table.
      if (ms > RISE && ms < GRAB) {
        const k = radius * 0.04;
        die.position.set(rest.x + rand(-k, k), rest.y + rand(-k, k), rest.z);
      } else if (ms >= GRAB) {
        const k = smooth((ms - GRAB) / (PULL - GRAB));
        die.position.set(rest.x, rest.y, rest.z - k * halfHeight * 6);
        die.scale.setScalar(1 - k * 0.6);
        setOpacity(materials, 1 - k);
        for (const m of materials) m.transparent = true;
      }
      if (ms > CLOSE) overlay.fadeOut();
    },
    destroy: () => overlay.destroy(),
  };
}

export const THEME_FUMBLES: Record<FumbleSkin, (c: EffectCtx) => Effect> = {
  zombie: zombieGrab,
  creeper: creeperBlast,
  "virus-xp": virusInfection("xp"),
  "virus-ts": virusInfection("ts"),
};
