"use client";

import "../lib/canvas-polyfill";
import { apiUrl } from "../lib/client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Armchair, Clapperboard, Crown, DoorOpen, Dices, Eye, EyeOff, Flame, Fish, Footprints, Gamepad2, Landmark, Navigation, Map as MapIcon, Film, Maximize2, Minimize2, Settings2, SlidersHorizontal, Swords, Trees, UserRound, Users, X } from "lucide-react";
import { playbackPosition, type DiceRollEvent, type PlayerState, type VoiceParticipant } from "@/lib/protocol";
import type { LivingRoom, RoomTheme } from "../hooks/use-living-room";
import { GM_SEAT_ID, JUMP_SIGNAL, LOUNGE_EMOTES, TABLE_CENTRE, VENUE_IDS, fishingSpot, headingTo, inAnnex, routeTo, seatById, stepTo, venueById, wrapHeading, type LoungePose, type VenueId } from "../lib/living-room";
import { FishingRod, readTackle, recordCatch, type FishingPhase, type TackleEntry } from "./meadow-fishing";
import { buildRoom, roomAmbience, type BuiltRoom } from "./living-room-scene";
import { buildCinema } from "./cinema-scene";
import { TABLE_SURFACE_Y, buildTabletop } from "./tabletop-scene";
import { TableDice } from "./tabletop-dice";
import { buildBoardHall, type FloorBoard } from "./board-hall-scene";
import { buildMeadow } from "./meadow-scene";
import { DeepPixelWatcher, deepPixelPlayerId, tileAt, type BoardGameState } from "../lib/board-game";
import { BoardHallMenu } from "./board-hall-menu";
import { useDeepPixelBridge } from "../hooks/use-deeppixel-bridge";
import { TableExtras, behindScreen, type TentSpec, type CharacterTokenSpec, type ScreenPage } from "./tabletop-extras";
import { BoothPanel, CharacterPanel, GameMasterPanel, InitiativePanel, SeatFinder, WatchPanel, type WatchInfo } from "./lounge-panels";
import { buildScreenPage, readNotes, readScreenChoice, saveNotes, saveScreenChoice, type ScreenPageId } from "../lib/gm-screen";
import { isFullscreen, onFullscreenChange, toggleFullscreen as toggleElementFullscreen } from "../lib/fullscreen";
import { addInitiative, currentEntry, watchPosition, type TableCard, type WatchState } from "@/lib/lounge-shared";
import { apiFetch } from "../lib/client";
import { playCriticalFumbleSound, playCriticalSuccessSound, playDiceRollSound } from "../lib/dice-sounds";
import { RoomAmbience } from "./living-room-ambience";

/** Overhead, through your eyes, or (in the board hall) riding behind your pawn. */
type CameraView = "overhead" | "eyes" | "pawn";

interface Props {
  room: LivingRoom;
  participants: VoiceParticipant[];
  connectionId: string | null;
  speaking: Set<string>;
  /** Live screen shares; the first one plays on the TV above the fireplace. */
  screens: Array<{ stream: MediaStream; name: string }>;
  /** Live cameras by seat: a person with their camera on shows it on their token. */
  cameras?: Array<{ connectionId: string; stream: MediaStream; self: boolean }>;
  /** Deafened: the room's own sounds go quiet too. */
  deafened: boolean;
  /** The room's music player: when nothing is screen-shared, the TV shows what's playing. */
  nowPlaying?: PlayerState | null;
  /** The hub's clock, so the TV's time matches everyone else's. */
  serverNow?: () => number;
  /** The latest dice roll in the call; at the tabletop it is thrown onto the table. */
  diceRoll?: DiceRollEvent | null;
  onDiceRollDone?: () => void;
  /** Runs a slash command as you (/roll 2d6, /spell fireball): the tabletop's dice tray. */
  onCommand?: (command: string) => void;
  /** May walk into the cinema's projection booth and run the show from it (those who can create channels). */
  canProject?: boolean;
  /** The room's DeepPixel game code, when one is open: the board hall shows it live. */
  boardGameId?: string | null;
  /** Opens the room's DeepPixel game to play (starting one if there is none). */
  onPlayBoardGame?: () => void;
}

const VENUE_ICONS: Record<VenueId, typeof Armchair> = { lounge: Armchair, cinema: Clapperboard, tabletop: Dices, boardhall: Landmark, meadow: Trees };
const VENUE_NAMES: Record<VenueId, string> = { lounge: "Living room", cinema: "Cinema", tabletop: "Tabletop", boardhall: "Board hall", meadow: "Meadow" };
const VENUE_HINTS: Record<VenueId, string> = {
  lounge: "Click or tap the floor to walk, any couch, chair or cushion to sit, or Sit here for the floor. WASD walks, Q/E turns, X sits. Scroll or pinch to zoom.",
  cinema: "Pick any seat (up to 150) and watch what is shared or played on the big screen. Voices are one volume here; turn on Spatial voices in settings to hear the room. WASD walks, X sits.",
  tabletop: "Take a chair at the table (ten fit), others can stand around it. Roll from the dice tray and the dice are thrown onto the map for everyone at the table.",
  boardhall: "DeepPixel, life size: the room's game is laid out on the floor and the pawns hop round it as you play. Press Play to open the game; walk the board, or sit on a bench to watch.",
  meadow: "A little world outside. Walk anywhere (WASD, Shift or double-tap W to hurry, Space to jump), sit by the campfire, go home to the cabin, or fish off the jetty (F).",
};
/** A spell or monster card floats over the table this long, unless someone clicks it away first. */
const CARD_SECONDS = 20;
/** Only this many people are drawn as full tokens; the rest of a crowd are small dots. */
const MAX_BODIES = 20;

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const TV_COLOURS: Record<RoomTheme, { bg: [string, string]; ink: string; dim: string; accent: string; font: string }> = {
  cozy: { bg: ["#2a1810", "#120a06"], ink: "#fff4e3", dim: "#d9b98f", accent: "#ffb35c", font: "system-ui, sans-serif" },
  vampire: { bg: ["#2a0610", "#0b0205"], ink: "#f6e3e0", dim: "#c79a9a", accent: "#e0233f", font: "Georgia, serif" },
  matrix: { bg: ["#021a0a", "#000500"], ink: "#b9ffcf", dim: "#4fbf78", accent: "#00ff66", font: "ui-monospace, monospace" },
  cyberpunk: { bg: ["#1c0a3a", "#05020f"], ink: "#e6f9ff", dim: "#9fb4ff", accent: "#ff2fb4", font: "system-ui, sans-serif" },
  academia: { bg: ["#1d2a1e", "#0e130f"], ink: "#ebdfc4", dim: "#b09f7e", accent: "#c9a45c", font: "'EB Garamond', Garamond, Georgia, serif" },
};

/** The TV's "now playing" screen: cover, title, artist, a progress bar and the time. */
/** The cinema's house lights follow what the projection booth set for the room (nothing set: they dim by themselves). */
function applyHouse(lights: { setAutoDim: (on: boolean) => void; setLevel: (level: number) => void; setScreenActive: (active: boolean) => void; screenActive: boolean }, house: { level: number; auto: boolean } | null) {
  lights.setAutoDim(house ? house.auto : true);
  if (house && !house.auto) lights.setLevel(house.level);
  else lights.setScreenActive(lights.screenActive); // automatic: dim if something is playing, up if not
}

function drawNowPlaying(ctx: CanvasRenderingContext2D, state: PlayerState, now: number, art: HTMLImageElement | null, theme: RoomTheme) {
  const { width: W, height: H } = ctx.canvas;
  const c = TV_COLOURS[theme];
  const track = state.track!;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c.bg[0]);
  g.addColorStop(1, c.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const pad = 56;
  const size = H - pad * 2 - 90;
  if (art) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 30;
    ctx.drawImage(art, pad, pad, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(pad, pad, size, size);
    ctx.fillStyle = c.accent;
    ctx.font = `${Math.round(size * 0.5)}px ${c.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♫", pad + size / 2, pad + size / 2);
  }
  const x = pad * 2 + size;
  const textWidth = W - x - pad;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.accent;
  ctx.font = `600 30px ${c.font}`;
  ctx.fillText(state.paused ? "❚❚  PAUSED" : state.live ? "●  LIVE" : "♫  NOW PLAYING", x, pad + 34);
  ctx.fillStyle = c.ink;
  ctx.font = `700 54px ${c.font}`;
  // Wrap the title to two lines at most.
  const words = track.title.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > textWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = `${shown[1].replace(/\s*\S*$/, "")}…`;
  shown.forEach((text, i) => ctx.fillText(text, x, pad + 110 + i * 62, textWidth));
  ctx.fillStyle = c.dim;
  ctx.font = `400 36px ${c.font}`;
  if (track.artist) ctx.fillText(track.artist, x, pad + 110 + shown.length * 62 + 10, textWidth);
  if (state.queue.length) {
    ctx.font = `400 26px ${c.font}`;
    ctx.fillText(`Up next: ${state.queue[0].title}`, x, H - pad - 110, textWidth);
  }
  // Progress.
  const position = playbackPosition(state, now);
  const duration = track.duration ? track.duration * 1000 : 0;
  const barY = H - pad - 40;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath(); ctx.roundRect(pad, barY, W - pad * 2, 10, 5); ctx.fill();
  if (duration) {
    ctx.fillStyle = c.accent;
    ctx.beginPath(); ctx.roundRect(pad, barY, Math.max(10, (W - pad * 2) * Math.min(1, position / duration)), 10, 5); ctx.fill();
  }
  ctx.fillStyle = c.ink;
  ctx.font = `500 30px ${c.font}`;
  ctx.fillText(formatTime(position), pad, barY - 16);
  ctx.textAlign = "right";
  ctx.fillText(duration ? formatTime(duration) : "", W - pad, barY - 16);
  ctx.textAlign = "left";
}

const EYE_SEATED = 1.1;
/** Sitting at the tabletop: high enough to look down on the map and the dice, not across the rim. */
const EYE_AT_TABLE = 1.55;
const EYE_STANDING = 1.6;
const EYE_FLOOR = 0.75;
/** First-person field of view in degrees; the wheel zooms between the limits. */
const EYE_FOV = 70;
const EYE_FOV_MIN = 20;
const EYE_FOV_MAX = 100;
const OVERHEAD_FOV = 52;
const WALK_SPEED = 1.6; // m/s
/** Shift+W, or W tapped twice: a brisk walk, 30% faster. */
const SPRINT = 1.3;
/** A jump: how high (metres) and how long it is in the air (seconds). */
const JUMP_HEIGHT = 0.45;
const JUMP_SECONDS = 0.55;
/** Height of a jump `ms` milliseconds after it started. */
const jumpLift = (ms: number) => {
  const k = ms / 1000 / JUMP_SECONDS;
  return k > 0 && k < 1 ? JUMP_HEIGHT * 4 * k * (1 - k) : 0;
};

function labelTexture(text: string, colour = "#ffffff", background = "rgba(20,16,30,0.72)"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = "600 40px system-ui, sans-serif";
  ctx.font = font;
  const width = Math.min(512, Math.ceil(ctx.measureText(text).width) + 40);
  canvas.width = width;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, 64, 30);
  ctx.fill();
  ctx.fillStyle = colour;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, 34, width - 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function emojiTexture(emoji: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "96px system-ui, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 64, 72);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * A round avatar token like a voice tile's: the profile picture (or the
 * avatar letter on the user's colour until it loads) inside a ring of their
 * colour. People are shown as these, not as 3D bodies.
 */
function tokenTexture(person: VoiceParticipant): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const colour = person.color || "#ffd67c";
  const paint = (image?: HTMLImageElement) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.clip();
    if (image) ctx.drawImage(image, 18, 18, 220, 220);
    else {
      ctx.fillStyle = colour; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#1b1530";
      ctx.font = "600 110px system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText((person.avatar || person.displayName || "?").slice(0, 2), 128, 136);
    }
    ctx.restore();
  };
  paint();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (person.avatarUrl) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => { paint(image); texture.needsUpdate = true; };
    image.src = person.avatarUrl;
  }
  return texture;
}

function ringTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 96, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.18, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

interface Body {
  group: THREE.Group;
  token: THREE.Sprite;
  ring: THREE.Sprite;
  pointer: THREE.Mesh;
  shadow: THREE.Mesh;
  label: THREE.Sprite;
  mute: THREE.Sprite;
  shown: { x: number; z: number; facing: number; lift: number; floor: number };
  key: string;
  /** Current token size in metres; grows when the camera is on. */
  size: number;
  cam: CamFeed | null;
}

interface CamFeed {
  stream: MediaStream;
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  sprite: THREE.Sprite;
  mirrored: boolean;
  /** Last video size the crop was computed for. */
  w: number;
  h: number;
}

/** A token with its camera on is this big; the picture needs the room to be seen. */
const CAM_TOKEN = 0.7;
/** Playing a video per head costs; only the nearest few cameras play live, the rest keep their picture. */
const MAX_LIVE_CAMS = 8;

let circleMask: THREE.Texture | null = null;
function circleMaskTexture(): THREE.Texture {
  if (circleMask) return circleMask;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  circleMask = new THREE.CanvasTexture(canvas);
  return circleMask;
}

function attachCam(body: Body, stream: MediaStream, mirrored: boolean) {
  const video = document.createElement("video");
  video.muted = true; // Sound comes through the call, spatialised.
  video.playsInline = true;
  video.srcObject = new MediaStream(stream.getVideoTracks());
  void video.play().catch(() => undefined);
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, alphaMap: circleMaskTexture(), transparent: true }));
  sprite.renderOrder = 6;
  body.group.add(sprite);
  body.cam = { stream, video, texture, sprite, mirrored, w: 0, h: 0 };
}

function detachCam(body: Body) {
  const cam = body.cam;
  if (!cam) return;
  body.group.remove(cam.sprite);
  cam.video.pause();
  cam.video.srcObject = null;
  cam.texture.dispose();
  cam.sprite.material.dispose();
  body.cam = null;
}

/** Crops the camera to a centred square (and flips your own), once its size is known. */
function fitCam(cam: CamFeed) {
  const { videoWidth: w, videoHeight: h } = cam.video;
  if (!w || !h || (w === cam.w && h === cam.h)) return;
  cam.w = w;
  cam.h = h;
  const side = Math.min(w, h);
  const rx = side / w;
  const ry = side / h;
  cam.texture.repeat.set(cam.mirrored ? -rx : rx, ry);
  cam.texture.offset.set(cam.mirrored ? 0.5 + rx / 2 : (1 - rx) / 2, (1 - ry) / 2);
}

/** Token size in metres; big enough to read faces from across the room. */
const TOKEN = 0.364; // 30% smaller than the original 0.52

function makeBody(person: VoiceParticipant): Body {
  const group = new THREE.Group();
  const colour = new THREE.Color(person.color || "#ffd67c");
  const token = new THREE.Sprite(new THREE.SpriteMaterial({ map: tokenTexture(person), transparent: true }));
  token.scale.setScalar(TOKEN);
  token.renderOrder = 5;
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: "#5dffa0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.scale.setScalar(TOKEN * 1.45);
  ring.renderOrder = 4;
  // A soft contact shadow, and a little arrow on the floor for which way they face (it is where their ears point).
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  const arrow = new THREE.Shape([new THREE.Vector2(0, -0.42), new THREE.Vector2(0.09, -0.29), new THREE.Vector2(-0.09, -0.29)]);
  const pointer = new THREE.Mesh(new THREE.ShapeGeometry(arrow), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, depthWrite: false }));
  pointer.rotation.x = -Math.PI / 2;
  pointer.position.y = 0.014;
  // ShapeGeometry lies in XY; after tipping it flat, its -Y points to -Z: forward.
  pointer.scale.y = -1;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(person.displayName || person.username), depthTest: false }));
  const aspect = (label.material.map!.image as HTMLCanvasElement).width / 64;
  label.scale.set(0.14 * aspect, 0.14, 1);
  label.renderOrder = 10;
  const mute = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture("🔇"), depthTest: false }));
  mute.scale.setScalar(0.17);
  mute.renderOrder = 11;
  mute.visible = false;
  group.add(shadow, pointer, ring, token, label, mute);
  return { group, token, ring, pointer, shadow, label, mute, shown: { x: 0, z: 0, facing: 0, lift: 0, floor: 0 }, key: `${person.displayName}|${person.avatarUrl}|${person.color}`, size: TOKEN, cam: null };
}

function disposeTree(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
  });
}

function squeak() {
  try {
    const context = new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(900, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, context.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(700, context.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.3);
    osc.onended = () => void context.close();
  } catch { /* No sound, still cute. */ }
}

export function LivingRoomView({ room, participants, connectionId, speaking, screens, cameras = [], deafened, nowPlaying = null, serverNow, diceRoll = null, onDiceRollDone, onCommand, canProject = false, boardGameId = null, onPlayBoardGame }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CameraView>("overhead");
  const theme = room.theme;
  const venueId = room.venue;
  const venue = venueById(venueId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Hide every overlay for a clean view of the room; H or the eye button brings them back.
  const [controlsHidden, setControlsHidden] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key.toLowerCase() === "h" && !event.repeat) setControlsHidden((hidden) => !hidden);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const cinemaLightsRef = useRef<any>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(isFullscreen(shellRef.current));
    return onFullscreenChange(sync);
  }, []);
  // Falls back to filling the window (and the window itself) where the webview has no Fullscreen API.
  const toggleFullscreen = () => void toggleElementFullscreen(shellRef.current);
  const venueHint = VENUE_HINTS[venueId] + (venueId === "cinema" && canProject ? " You can run the show from the projection booth: the door at the back of the hall, on the left." : "");
  const [hint, setHint] = useState<string | null>(venueHint);
  useEffect(() => {
    setHint(venueHint);
    const t = setTimeout(() => setHint(null), 9000);
    return () => clearTimeout(t);
  }, [venueId]);
  /** The tabletop's table, once built: dice are thrown through it. */
  const diceRef = useRef<TableDice | null>(null);
  const [panel, setPanel] = useState<"watch" | "seats" | "initiative" | "character" | "booth" | "gm" | null>(null);
  // The game master's screen: which page each panel shows, their notes, and their hidden rolls this visit.
  const [screenChoice, setScreenChoiceState] = useState<ScreenPageId[]>(() => (typeof window === "undefined" ? ["initiative", "conditions", "notes"] : readScreenChoice()));
  const setScreenChoice = (value: ScreenPageId[]) => { setScreenChoiceState(value); saveScreenChoice(value); };
  const [gmNotes, setGmNotesState] = useState(() => (typeof window === "undefined" ? "" : readNotes()));
  const setGmNotes = (value: string) => { setGmNotesState(value); saveNotes(value); };
  const [hiddenLog, setHiddenLog] = useState<string[]>([]);
  const [watchVolume, setWatchVolume] = useState(0.8);
  const [watchInfo, setWatchInfo] = useState<WatchInfo>({ duration: 0, current: 0, blocked: false, error: null });
  /** Lets the panel's button start a film the browser would not start by itself. */
  const watchApi = useRef<{ start: () => void }>({ start: () => undefined });
  const [hoverSeat, setHoverSeat] = useState<{ id: string; x: number; y: number } | null>(null);
  const [rollNote, setRollNote] = useState<string | null>(null);
  const [hiddenMode, setHiddenMode] = useState(false);
  /** Fishing in the meadow: what the line is doing, the last catch, and the tackle box. */
  const [fishing, setFishing] = useState<FishingPhase>({ phase: "idle" });
  const [canFish, setCanFish] = useState(false);
  const [tackle, setTackle] = useState<Record<string, TackleEntry> | null>(null);
  const [lastCatch, setLastCatch] = useState<{ name: string; emoji: string; weight: number; rarity: string; record: boolean } | null>(null);
  const rodRef = useRef<{ cast: () => void; reel: () => void } | null>(null);
  useEffect(() => { setFishing({ phase: "idle" }); setLastCatch(null); }, [venueId]);
  /** The room's DeepPixel game as the board hall last heard it, and whether my body walks to my pawn. */
  const [boardGame, setBoardGame] = useState<BoardGameState | null>(null);
  const [followPawn, setFollowPawn] = useState(true);
  const boardFeed = useRef<{ game: BoardGameState | null; version: number }>({ game: null, version: 0 });
  const bridge = useDeepPixelBridge(venueId === "boardhall" && Boolean(boardGameId));
  /** A tile clicked on the floor board: its card shows in the game menu. */
  const [pickedTile, setPickedTile] = useState<number | null>(null);
  useEffect(() => { if (venueId !== "boardhall") setPickedTile(null); }, [venueId]);
  useEffect(() => { if (venueId !== "boardhall" && view === "pawn") setView("overhead"); }, [venueId, view]);
  useEffect(() => {
    boardFeed.current = { game: null, version: boardFeed.current.version + 1 };
    setBoardGame(null);
    if (venueId !== "boardhall" || !boardGameId) return;
    const watcher = new DeepPixelWatcher(boardGameId, (game) => {
      boardFeed.current = { game, version: boardFeed.current.version + 1 };
      setBoardGame(game);
    });
    return () => watcher.close();
  }, [venueId, boardGameId]);
  /** Set when I press "Roll my initiative": the next roll of mine goes into the order. */
  const pendingInitiative = useRef(false);
  useEffect(() => { setPanel(null); setHoverSeat(null); }, [venueId]);

  // Everything the render loop reads lives in one ref, refreshed every React render.
  // What the inside of my screen shows, if I am the game master (built further down).
  const screenPagesRef = useRef<ScreenPage[] | null>(null);
  const live = useRef({ room, participants, connectionId, speaking, screens, cameras, view, nowPlaying, serverNow, watchVolume, deafened, canProject, followPawn, screenPagesRef });
  live.current = { room, participants, connectionId, speaking, screens, cameras, view, nowPlaying, serverNow, watchVolume, deafened, canProject, followPawn, screenPagesRef };

  // The room's recorded sounds, placed in 3D and heard from where you are.
  const ambience = useRef<RoomAmbience | null>(null);
  // Recorded fire, rain and wind belong to the living room; the other rooms have no sounds of their own.
  const ambienceOn = room.settings.ambience && venueId === "lounge";
  useEffect(() => {
    if (!ambienceOn) return;
    const engine = new RoomAmbience(theme);
    ambience.current = engine;
    return () => { engine.dispose(); if (ambience.current === engine) ambience.current = null; };
  }, [ambienceOn, theme]);
  useEffect(() => { ambience.current?.setVolume(room.settings.ambienceVolume); }, [room.settings.ambienceVolume, ambienceOn, theme]);
  useEffect(() => { ambience.current?.setMuted(deafened); }, [deafened, ambienceOn, theme]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const house = new THREE.Group();
    scene.add(house);
    const parts: BuiltRoom & { cinemaLights?: any; board?: FloorBoard } = venueId === "cinema" ? buildCinema(theme)
      : venueId === "tabletop" ? buildTabletop(theme)
        : venueId === "boardhall" ? buildBoardHall(theme)
          : venueId === "meadow" ? buildMeadow(theme)
            : buildRoom(theme);
    if (parts.cinemaLights) { cinemaLightsRef.current = parts.cinemaLights; applyHouse(parts.cinemaLights, live.current.room.shared.house); }
    house.add(parts.root);
    // Apple's WebKit (the Mac app, Safari) renders point-light cube shadow maps as speckle across every lit surface; skip them there.
    if (/Mac/i.test(navigator.platform) && /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg\//.test(navigator.userAgent)) {
      parts.root.traverse((object) => { if ((object as THREE.PointLight).isPointLight) object.castShadow = false; });
    }
    if (venueId === "lounge") for (const light of roomAmbience(theme)) house.add(light);
    // At the tabletop, dice are thrown onto the map.
    const dice = venueId === "tabletop"
      ? new TableDice(house, {
          surfaceY: TABLE_SURFACE_Y,
          centre: TABLE_CENTRE,
          radius: 1.15,
          onSettled: (roll, crit) => {
            const dieTheme = roll.theme || "default";
            if (crit === "nat20") void playCriticalSuccessSound({ theme: dieTheme });
            else if (crit === "nat1") void playCriticalFumbleSound({ material: roll.material ?? "plastic", theme: dieTheme });
          },
        })
      : null;
    diceRef.current = dice;
    const extras = venueId === "tabletop" ? new TableExtras(house, TABLE_SURFACE_Y) : null;
    // Far people, past the nearest few, are small coloured dots: one draw call for a crowd of 150.
    const crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), 160);
    crowd.count = 0;
    crowd.frustumCulled = false;
    house.add(crowd);
    const background = parts.background;
    scene.background = background;
    scene.fog = parts.fog;
    renderer.toneMappingExposure = parts.exposure;
    // Outdoors the sky is far away; indoors 60 m is plenty.
    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, venueId === "meadow" ? 260 : 60);
    scene.add(camera);

    const bodies = new Map<string, Body>();
    const bubbles = new Map<number, THREE.Sprite>();
    let video: HTMLVideoElement | null = null;
    let videoTexture: THREE.VideoTexture | null = null;
    let videoStream: MediaStream | null = null;

    // Overhead orbit.
    const orbit = { yaw: 0.0, pitch: 0.82, distance: venueId === "cinema" ? 12 : venueId === "tabletop" ? 5.6 : venueId === "boardhall" ? 13 : venueId === "meadow" ? 9 : 6.2 };
    const maxDistance = venueId === "cinema" || venueId === "boardhall" ? 26 : venueId === "meadow" ? 32 : 15;
    // First-person look offset, added to body heading.
    const look = { yaw: 0, pitch: venueId === "tabletop" ? -0.38 : -0.08 };
    let eyeFov = EYE_FOV;
    // The pawn camera: how far behind, turned how far from the way play runs, and how high.
    let pawnDistance = 3.6;
    let pawnYaw = 0;
    let pawnPitch = 0.42;
    let pawnBasis = 0;
    const pawnEye = { position: new THREE.Vector3(0, 6, 12), target: new THREE.Vector3(), ready: false };
    // The room draws at half rate once nothing has moved for a moment (or behind other windows).
    let lastActive = performance.now();
    const poke = () => { lastActive = performance.now(); };
    /** Eyes above the floor the person stands on, which rises in the cinema's tiers. */
    const eyeAt = (pose: LoungePose) => venue.floorY(pose.x, pose.z) + (pose.seat === "floor" ? EYE_FLOOR : pose.seat ? (venueId === "tabletop" ? EYE_AT_TABLE : EYE_SEATED) : EYE_STANDING);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let drag: { x: number; y: number; moved: boolean } | null = null;
    // Touch: two fingers pinch to zoom, like the mouse wheel.
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null;
    const zoom = (factor: number) => {
      if (live.current.view === "pawn") pawnDistance = Math.max(1.8, Math.min(10, pawnDistance * factor));
      else if (live.current.view === "overhead") orbit.distance = Math.max(2.2, Math.min(maxDistance, orbit.distance * factor));
      else eyeFov = Math.max(EYE_FOV_MIN, Math.min(EYE_FOV_MAX, eyeFov * factor));
    };
    let walkTarget: { x: number; z: number } | null = null;
    /** Further stops after walkTarget: into or out of the cabin goes through its door. */
    let walkQueue: Array<{ x: number; z: number }> = [];
    const keys = new Set<string>();
    let shiftDown = false;
    let doubleTap = false;
    let lastForwardUp = 0;
    /** When I last jumped (performance.now), for my own eyes; everyone else sees the jump signal. */
    let jumpedAt = -10_000;
    const jump = () => {
      const now = performance.now();
      if (now - jumpedAt < JUMP_SECONDS * 1000) return;
      jumpedAt = now;
      poke();
      live.current.room.emote(JUMP_SIGNAL);
    };

    // Fishing, in the meadow: the rod's end is just in front of me, at hand height.
    const rodTip = (pose: LoungePose) => new THREE.Vector3(
      pose.x + Math.sin(pose.facing) * 1.3,
      venue.floorY(pose.x, pose.z) + (pose.seat ? 1.3 : 1.75),
      pose.z - Math.cos(pose.facing) * 1.3,
    );
    let canFishNow = false;
    const rod = venueId === "meadow"
      ? new FishingRod(house, (phase) => {
          setFishing(phase);
          if (phase.phase === "caught") {
            const { log, record } = recordCatch(phase.fish);
            setTackle(log);
            setLastCatch({ ...phase.fish, record });
            // The room sees a fish over your head.
            live.current.room.emote("🐟");
          }
        })
      : null;
    const castNow = () => {
      const pose = myPose();
      if (!rod || !pose || !canFishNow) return;
      setLastCatch(null);
      rod.cast(rodTip(pose), pose.facing);
      poke();
    };
    rodRef.current = rod ? { cast: castNow, reel: () => rod.reel() } : null;

    // Frames come faster than React re-renders, so walking builds on the last
    // pose this tab asked for rather than the last one React has shown.
    let local: { pose: LoungePose; at: number } | null = null;
    const myPose = (): LoungePose | null => {
      const { room: r, connectionId: id } = live.current;
      if (local && performance.now() - local.at < 400) return local.pose;
      local = null;
      return id ? r.poses.get(id) ?? null : null;
    };
    const moveTo = (pose: LoungePose) => {
      local = { pose, at: performance.now() };
      live.current.room.move(pose);
    };

    // The cinema's seats say where they are when pointed at.
    const seatMeshes = parts.root.children.filter((child) => child.userData.seatIds) as THREE.InstancedMesh[];
    let hoverAt = 0;
    let hovered: string | null = null;
    const hover = (event: PointerEvent) => {
      const now = performance.now();
      if (now - hoverAt < 70 || !seatMeshes.length) return;
      hoverAt = now;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(seatMeshes, false)[0];
      const id = hit && hit.instanceId !== undefined ? (hit.object.userData.seatIds as string[])[hit.instanceId] : null;
      if (id === hovered && !id) return;
      hovered = id;
      setHoverSeat(id ? { id, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
    };

    const pick = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(house.children, true);
      for (const hit of hits) {
        // The cinema's seats are instanced: the hit says which of the 150.
        const seatIds = hit.object.userData.seatIds as string[] | undefined;
        if (seatIds && hit.instanceId !== undefined) {
          local = null;
          live.current.room.sit(seatIds[hit.instanceId]);
          walkTarget = null;
          return;
        }
        if (hit.object.userData.card) {
          live.current.room.setShared("card", null);
          return;
        }
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.seat && !object.userData.blahaj && !object.userData.floor) object = object.parent;
        if (!object) continue;
        if (object.userData.blahaj) {
          squeak();
          if (parts.shark) parts.shark.userData.hop = performance.now();
          return;
        }
        if (object.userData.seat) {
          local = null;
          const refused = live.current.room.sit(object.userData.seat);
          if (refused) setHint(refused);
          walkTarget = null;
          return;
        }
        if (object.userData.floor) {
          const goal = { x: hit.point.x / house.scale.x, z: hit.point.z / house.scale.z };
          const start = myPose();
          walkQueue = start ? routeTo(venue, start, goal) : [goal];
          walkTarget = walkQueue.shift() ?? goal;
          // On the board hall's floor board, a tile you walk to shows its card.
          if (parts.board) setPickedTile(tileAt(goal.x, goal.z, parts.board.tileCount()));
          return;
        }
      }
    };

    const spread = () => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
    };
    const onDown = (event: PointerEvent) => {
      poke();
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      renderer.domElement.setPointerCapture(event.pointerId);
      if (touches.size >= 2) {
        // A second finger turns the gesture into a pinch; no tap, no drag.
        drag = null;
        pinch = spread();
        return;
      }
      drag = { x: event.clientX, y: event.clientY, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      poke();
      if (venueId === "cinema" && !drag && pinch === null) hover(event);
      if (touches.has(event.pointerId)) touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch !== null) {
        const now = spread();
        if (now && pinch) zoom(pinch / now);
        pinch = now;
        return;
      }
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (live.current.view === "pawn") {
        // Behind the pawn, dragging looks around it.
        pawnYaw -= dx * 0.006;
        pawnPitch = Math.max(0.15, Math.min(1.2, pawnPitch + dy * 0.004));
      } else if (live.current.view === "overhead") {
        orbit.yaw -= dx * 0.006;
        orbit.pitch = Math.max(0.25, Math.min(1.45, orbit.pitch + dy * 0.004));
      } else {
        // Dragging in first person turns your body, so everyone sees you look over.
        const pose = myPose();
        if (pose) moveTo({ ...pose, facing: wrapHeading(pose.facing + dx * 0.005 * (eyeFov / EYE_FOV)) });
        look.pitch = Math.max(-1.1, Math.min(0.9, look.pitch - dy * 0.004 * (eyeFov / EYE_FOV)));
      }
    };
    const onUp = (event: PointerEvent) => {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = null;
      if (drag && !drag.moved) pick(event.clientX, event.clientY);
      drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      poke();
      event.preventDefault();
      // Overhead the wheel moves the camera in and out; through your eyes it zooms (field of view).
      zoom(Math.exp(event.deltaY * 0.0012));
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      poke();
      const key = event.key.toLowerCase();
      if (key === "x" && event.type === "keydown" && !event.repeat) { local = null; live.current.room.toggleFloor(); return; }
      if (key === "shift") { shiftDown = event.type === "keydown"; return; }
      if (key === " " && event.type === "keydown") {
        event.preventDefault();
        if (!event.repeat) jump();
        return;
      }
      if (key === "f" && event.type === "keydown" && !event.repeat && venueId === "meadow") {
        if (rod?.busy()) rod.reel();
        else if (canFishNow) castNow();
        return;
      }
      if ((key === "w" || key === "arrowup") && event.type === "keydown" && !event.repeat) {
        // A second tap of W within a moment breaks into a brisk walk until it is let go.
        const now = performance.now();
        if (now - lastForwardUp < 280) doubleTap = true;
      }
      if ((key === "w" || key === "arrowup") && event.type === "keyup") { lastForwardUp = performance.now(); doubleTap = false; }
      if (!["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
      if (event.type === "keydown") { keys.add(key); walkTarget = null; walkQueue = []; } else keys.delete(key);
    };
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const clock = new THREE.Clock();
    const target = new THREE.Vector3();

    const syncBodies = () => {
      const { room: r, participants: people, speaking: talk } = live.current;
      const seen = new Set<string>();
      // Your own camera always plays; the rest, nearest to you first, up to the limit.
      const mine = r.poses.get(live.current.connectionId ?? "");
      const liveCams = new Map<string, { stream: MediaStream; self: boolean }>();
      const feeds = live.current.cameras
        .map((cam) => {
          const there = r.poses.get(cam.connectionId);
          return { cam, d: mine && there ? Math.hypot(there.x - mine.x, there.z - mine.z) : 0 };
        })
        .sort((a, b) => Number(b.cam.self) - Number(a.cam.self) || a.d - b.d)
        .slice(0, MAX_LIVE_CAMS);
      for (const { cam } of feeds) liveCams.set(cam.connectionId, cam);
      // In a crowd only the nearest few are full tokens; the rest are dots.
      const placed = people.filter((p) => !p.bot && !p.recorder && r.poses.has(p.connectionId));
      let near: Set<string> | null = null;
      if (placed.length > MAX_BODIES) {
        near = new Set(
          placed
            .map((p) => {
              const there = r.poses.get(p.connectionId)!;
              return { id: p.connectionId, self: p.connectionId === live.current.connectionId, d: mine ? Math.hypot(there.x - mine.x, there.z - mine.z) : 0 };
            })
            .sort((a, b) => Number(b.self) - Number(a.self) || a.d - b.d)
            .slice(0, MAX_BODIES)
            .map((entry) => entry.id),
        );
      }
      let dots = 0;
      const dotAt = new THREE.Matrix4();
      const dotColour = new THREE.Color();
      for (const person of people) {
        if (person.bot || person.recorder) continue;
        const pose = r.poses.get(person.connectionId);
        if (!pose) continue;
        if (near && !near.has(person.connectionId) && dots < 160) {
          const rise = pose.seat === "floor" ? 0.42 : pose.seat ? (seatById(pose.seat, venue)?.height ?? 0.45) + 0.62 : 1.2;
          dotAt.makeTranslation(pose.x, venue.floorY(pose.x, pose.z) + rise, pose.z);
          crowd.setMatrixAt(dots, dotAt);
          crowd.setColorAt(dots, dotColour.set(person.color || "#ffd67c"));
          dots++;
          continue;
        }
        seen.add(person.connectionId);
        let body = bodies.get(person.connectionId);
        const key = `${person.displayName}|${person.avatarUrl}|${person.color}`;
        if (body && body.key !== key) {
          house.remove(body.group);
          detachCam(body);
          disposeTree(body.group);
          body = undefined;
        }
        if (!body) {
          body = makeBody(person);
          body.shown = { x: pose.x, z: pose.z, facing: pose.facing, lift: 0, floor: venue.floorY(pose.x, pose.z) };
          bodies.set(person.connectionId, body);
          house.add(body.group);
        }
        const isSelf = person.connectionId === live.current.connectionId;
        const feed = liveCams.get(person.connectionId);
        if (body.cam && (!feed || body.cam.stream !== feed.stream)) detachCam(body);
        if (feed && !body.cam) attachCam(body, feed.stream, feed.self);
        if (body.cam) fitCam(body.cam);
        body.size += ((body.cam ? CAM_TOKEN : TOKEN) - body.size) * 0.18;
        const talking = talk.has(isSelf ? "self" : person.connectionId);
        const ringMaterial = body.ring.material;
        ringMaterial.opacity += ((talking ? 0.95 : 0) - ringMaterial.opacity) * 0.3;
        body.mute.visible = person.muted || Boolean(person.serverMuted) || person.deafened;
        // Your own token hides in first person so it never blocks your eyes.
        const firstPerson = isSelf && live.current.view === "eyes";
        body.group.visible = !firstPerson;
        // The token floats where a head would be: low on a cushion or the floor, higher standing.
        const height = (pose.seat === "floor" ? 0.42 : pose.seat ? (seatById(pose.seat, venue)?.height ?? 0.45) + 0.62 : 1.2) + (body.size - TOKEN) * 0.5;
        const s = body.shown;
        s.x += (pose.x - s.x) * 0.18;
        s.z += (pose.z - s.z) * 0.18;
        s.facing += wrapHeading(pose.facing - s.facing) * 0.2;
        s.lift += (height - s.lift) * 0.2;
        s.floor += (venue.floorY(pose.x, pose.z) - s.floor) * 0.3;
        // A jump lifts the whole token for a moment (everyone hears of it as a signal).
        let jumpAt = 0;
        for (const e of r.emotes) if (e.emoji === JUMP_SIGNAL && e.connectionId === person.connectionId && e.at > jumpAt) jumpAt = e.at;
        const hop = jumpAt ? jumpLift(Date.now() - jumpAt) : 0;
        if (hop) poke();
        body.group.position.set(s.x, s.floor + hop, s.z);
        body.pointer.rotation.z = -s.facing;
        // A walking token bobs; a talking one pulses.
        const moving = Math.hypot(pose.x - s.x, pose.z - s.z) > 0.02;
        if (moving) poke();
        const bob = moving ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.06 : Math.sin(clock.elapsedTime * 1.3 + s.x) * 0.012;
        const pulse = talking ? 1 + Math.sin(clock.elapsedTime * 12) * 0.035 : 1;
        body.token.position.y = s.lift + bob;
        body.token.scale.setScalar(body.size * pulse);
        if (body.cam) {
          body.cam.sprite.position.y = s.lift + bob;
          body.cam.sprite.scale.setScalar(body.size * pulse * 0.88);
        }
        body.ring.position.y = s.lift + bob;
        body.ring.scale.setScalar(body.size * (1.45 + (talking ? Math.sin(clock.elapsedTime * 8) * 0.08 : 0)));
        body.label.position.y = s.lift + body.size * 0.5 + 0.13;
        body.mute.position.y = s.lift - body.size * 0.36;
        (body.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34 - Math.min(0.2, s.lift * 0.12);
        body.group.userData.top = s.lift + body.size * 0.5;
      }
      crowd.count = dots;
      crowd.instanceMatrix.needsUpdate = true;
      if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
      for (const [id, body] of bodies) {
        if (seen.has(id)) continue;
        house.remove(body.group);
        detachCam(body);
        disposeTree(body.group);
        bodies.delete(id);
      }
      // Emote bubbles rise from their sender and fade.
      const now = Date.now();
      const active = new Set<number>();
      for (const emote of r.emotes) {
        if (emote.emoji === JUMP_SIGNAL) continue;
        const age = (now - emote.at) / 3000;
        if (age >= 1) continue;
        active.add(emote.id);
        let sprite = bubbles.get(emote.id);
        if (!sprite) {
          sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emote.emoji), transparent: true, depthTest: false }));
          sprite.renderOrder = 11;
          bubbles.set(emote.id, sprite);
          house.add(sprite);
        }
        const body = bodies.get(emote.connectionId);
        const base = body ? body.group.position : new THREE.Vector3();
        const top = (body?.group.userData.top as number | undefined) ?? 1.4;
        sprite.position.set(base.x + Math.sin(emote.id) * 0.15, base.y + top + 0.25 + age * 0.9, base.z);
        sprite.scale.setScalar(0.35 + Math.min(age * 3, 1) * 0.15);
        sprite.material.opacity = 1 - age ** 3;
      }
      for (const [id, sprite] of bubbles) {
        if (active.has(id)) continue;
        house.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        bubbles.delete(id);
      }
    };

    // When nobody is sharing a screen, the TV shows what the music bot is playing.
    const tvCanvas = document.createElement("canvas");
    tvCanvas.width = 1024;
    tvCanvas.height = 576;
    const tvContext = tvCanvas.getContext("2d")!;
    const tvTexture = new THREE.CanvasTexture(tvCanvas);
    tvTexture.colorSpace = THREE.SRGBColorSpace;
    let tvDrawn = 0;
    let art: { url: string; image: HTMLImageElement | null } | null = null;
    const coverFor = (url: string | null) => {
      if (!url) return null;
      if (art?.url !== url) {
        // Covers must allow CORS, or drawing one would taint the texture; without it, a note.
        const image = new Image();
        image.crossOrigin = "anonymous";
        const entry: { url: string; image: HTMLImageElement | null } = { url, image: null };
        image.onload = () => { entry.image = image; tvDrawn = 0; };
        // Remote art goes through our cover cache, which adds CORS.
        image.src = /^https?:/i.test(url) && !url.startsWith(location.origin)
          ? apiUrl(`/api/media/cover?url=${encodeURIComponent(url)}`)
          : url;
        art = entry;
      }
      return art.image;
    };
    /** Nothing on the screen: the venue's idle picture, or dark glass. */
    const blankScreen = () => {
      parts.screenMaterial.map = parts.idleScreen ?? null;
      parts.screenMaterial.color.set(parts.idleScreen ? "#ffffff" : "#0f0c16");
      parts.screenMaterial.needsUpdate = true;
    };
    const syncMusicTv = () => {
      const state = live.current.nowPlaying;
      const showing = Boolean(state?.track) && !videoStream && !watchShowing;
      if (!showing) {
        if (parts.screenMaterial.map === tvTexture) {
          blankScreen();
        }
        return;
      }
      const now = performance.now();
      if (now - tvDrawn < 500) return;
      tvDrawn = now;
      drawNowPlaying(tvContext, state!, (live.current.serverNow ?? Date.now)(), coverFor(state!.track!.thumbnail), theme);
      tvTexture.needsUpdate = true;
      if (parts.screenMaterial.map !== tvTexture) {
        parts.screenMaterial.map = tvTexture;
        parts.screenMaterial.color.set("#ffffff");
        parts.screenMaterial.needsUpdate = true;
      }
    };

    const syncTv = () => {
      const stream = live.current.screens[0]?.stream ?? null;
      if (stream === videoStream) {
        if (stream && video && video.paused) {
          void video.play().catch(() => undefined);
        }
        return;
      }
      videoStream = stream;
      if (video) { video.pause(); video.srcObject = null; }
      videoTexture?.dispose();
      videoTexture = null;
      if (!stream) {
        if (!watchShowing) {
          blankScreen();
          parts.cinemaLights?.setScreenActive(false);
        }
        return;
      }
      video = document.createElement("video");
      video.muted = true; // Sound comes through the call, spatialised; this is picture only.
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      void video.play().catch(() => undefined);
      videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.generateMipmaps = false;
      parts.screenMaterial.map = videoTexture;
      parts.screenMaterial.color.set("#ffffff");
      parts.screenMaterial.needsUpdate = true;
      parts.cinemaLights?.setScreenActive(true);
    };

    // Watch together: one video, the same moment for everyone, on the screen.
    let watchVideo: HTMLVideoElement | null = null;
    let watchTexture: THREE.VideoTexture | null = null;
    let watchUrl = "";
    let watchShowing = false;
    let watchBlocked = false;
    let watchError: string | null = null;
    let watchSeekAt = 0;
    let watchInfoAt = 0;
    const dropWatch = () => {
      if (watchVideo) { watchVideo.pause(); watchVideo.removeAttribute("src"); watchVideo.load(); }
      watchTexture?.dispose();
      if (parts.screenMaterial.map === watchTexture) {
        blankScreen();
      }
      watchVideo = null; watchTexture = null; watchUrl = ""; watchShowing = false; watchBlocked = false; watchError = null;
      if (!videoStream) parts.cinemaLights?.setScreenActive(false);
    };
    const tryPlay = () => {
      void watchVideo?.play().then(() => { watchBlocked = false; }).catch((error: unknown) => {
        if ((error as DOMException)?.name === "NotAllowedError") watchBlocked = true;
      });
    };
    watchApi.current = { start: () => { watchBlocked = false; tryPlay(); } };
    const syncWatch = () => {
      const w = live.current.room.shared.watch;
      if (!w) {
        if (watchVideo || watchShowing) {
          dropWatch();
          setWatchInfo({ duration: 0, current: 0, blocked: false, error: null });
        }
        return;
      }
      if (watchUrl !== w.url) {
        dropWatch();
        const element = document.createElement("video");
        // A link has to allow this site to read it, or the browser will not hand its picture to the screen.
        element.crossOrigin = "anonymous";
        element.playsInline = true;
        element.preload = "auto";
        element.onerror = () => { watchError = "This video could not be played: the link may not allow other sites to use it, or it is not an .mp4 or .webm file."; };
        element.src = w.url;
        watchVideo = element;
        watchUrl = w.url;
        watchTexture = new THREE.VideoTexture(element);
        watchTexture.colorSpace = THREE.SRGBColorSpace;
        watchTexture.minFilter = THREE.LinearFilter;
        watchTexture.magFilter = THREE.LinearFilter;
        watchTexture.generateMipmaps = false;
      }
      const element = watchVideo!;
      // A screen share on the screen wins; the film waits, quietly, behind it.
      if (videoStream) { element.pause(); element.muted = true; watchShowing = false; return; }
      poke();
      element.volume = live.current.watchVolume;
      element.muted = live.current.deafened;
      const duration = Number.isFinite(element.duration) ? element.duration : 0;
      let expected = watchPosition(w, (live.current.serverNow ?? Date.now)());
      let paused = w.paused;
      if (duration && expected >= duration) { expected = duration; paused = true; }
      const now = performance.now();
      if (element.readyState >= 1 && Math.abs(element.currentTime - expected) > (paused ? 0.3 : 1.2) && now - watchSeekAt > 1500) {
        element.currentTime = expected;
        watchSeekAt = now;
      }
      if (paused && !element.paused) element.pause();
      else if (!paused && element.paused && !watchBlocked) tryPlay();
      if (parts.screenMaterial.map !== watchTexture) {
        parts.screenMaterial.map = watchTexture;
        parts.screenMaterial.color.set("#ffffff");
        parts.screenMaterial.needsUpdate = true;
      }
      watchShowing = true;
      // Shut off all cinema lights when movie is playing!
      parts.cinemaLights?.setScreenActive(!paused);
      if (now - watchInfoAt > 500) {
        watchInfoAt = now;
        setWatchInfo((old) => (old.duration === duration && Math.abs(old.current - element.currentTime) < 0.4 && old.blocked === watchBlocked && old.error === watchError
          ? old : { duration, current: element.currentTime, blocked: watchBlocked, error: watchError }));
      }
    };

    // The battle map the game master uploaded, in place of the drawn one.
    let mapKey = "";
    let mapImage: HTMLImageElement | null = null;
    const syncMap = (map: { url: string; turns: number; zoom: number } | null) => {
      const key = map ? `${map.url}|${map.turns}|${map.zoom}` : "";
      if (key === mapKey || !parts.setTableMap) return;
      mapKey = key;
      if (!map) { mapImage = null; parts.setTableMap(null); return; }
      const apply = (image: HTMLImageElement) => { if (mapKey === key) parts.setTableMap?.(image, map.turns, map.zoom); };
      if (mapImage && mapImage.dataset.url === map.url) { apply(mapImage); return; }
      const image = new Image();
      image.dataset.url = map.url;
      image.onload = () => { mapImage = image; apply(image); };
      image.src = map.url;
    };

    // The tabletop's D&D dressing: tents, the GM's screen, the turn marker, the floating card, and 3D character tokens.
    let tentsAt = 0;
    const syncExtras = (t: number) => {
      if (!extras) return;
      const r = live.current.room;
      const shared = r.shared;
      const turn = currentEntry(shared.initiative);
      const now = performance.now();
      if (now - tentsAt > 400) {
        tentsAt = now;
        const specs: TentSpec[] = [];
        const tokenSpecs: CharacterTokenSpec[] = [];
        for (const p of live.current.participants) {
          if (p.bot || p.recorder) continue;
          const seat = seatById(r.poses.get(p.connectionId)?.seat, venue);
          // The game master's place holds their screen, not a tent and a token.
          if (!seat || !seat.id.startsWith("tab-") || seat.reserved) continue;
          // Only people who made a character get a card; nobody's profile picture is put on the table for them.
          const character = shared.characters[p.id];
          if (!character) continue;
          const isTurn = turn?.connectionId === p.connectionId;
          specs.push({
            key: `${p.connectionId}|${character.name}|${character.portraitUrl ?? ""}|${p.displayName}|${p.avatarUrl ?? ""}|${p.color}|${isTurn}`,
            seat, name: character.name, portraitUrl: character.portraitUrl || null,
            letter: (p.avatar || p.displayName || "?").slice(0, 2), colour: p.color || "#ffd67c", turn: isTurn,
          });
          // Also create a 3D character token for the map
          tokenSpecs.push({
            id: p.connectionId,
            seat,
            name: character.name,
            colour: p.color || "#ffd67c",
            type: "pc" as const,
          });
        }
        extras.setTents(specs);
        extras.setCharacterTokens(tokenSpecs);
        const gmSeat = seatById(shared.gm ? r.poses.get(shared.gm.connectionId)?.seat : null, venue);
        extras.setScreen(gmSeat && gmSeat.id.startsWith("tab-") ? gmSeat : null);
        extras.setScreenPages(live.current.screenPagesRef.current);
        syncMap(shared.tablemap);
        const hubNow = (live.current.serverNow ?? Date.now)();
        extras.setCard(shared.card, Boolean(shared.card) && hubNow - shared.card!.at > CARD_SECONDS * 1000);
      }
      let marker: { x: number; y: number; z: number } | null = null;
      if (turn?.connectionId) {
        const body = bodies.get(turn.connectionId);
        const pose = r.poses.get(turn.connectionId);
        if (body) marker = { x: body.group.position.x, y: body.group.position.y + body.shown.lift + body.size * 0.5 + 0.5, z: body.group.position.z };
        else if (pose) marker = { x: pose.x, y: venue.floorY(pose.x, pose.z) + 1.7, z: pose.z };
      }
      extras.setTurn(marker);
      extras.update(t);
    };

    // The board hall: feed the floor board the latest game, and walk me over to my pawn when it moves.
    let boardVersion = -1;
    let myTile: number | null = null;
    const syncBoard = () => {
      const board = parts.board;
      if (!board) return;
      const feed = boardFeed.current;
      if (feed.version !== boardVersion) {
        boardVersion = feed.version;
        board.setGame(feed.game);
      }
      const me = live.current.participants.find((p) => p.connectionId === live.current.connectionId);
      const spot = me ? board.pawnTile(deepPixelPlayerId(me.id)) : null;
      if (!spot) { myTile = null; return; }
      if (spot.tile === myTile) return;
      const first = myTile === null;
      myTile = spot.tile;
      if (!first && live.current.followPawn) {
        local = null;
        const pose = myPose();
        if (pose?.seat) moveTo({ ...pose, seat: null });
        walkTarget = { x: spot.x, z: spot.z };
        poke();
      }
    };

    const walk = (dt: number) => {
      const pose = myPose();
      if (!pose) return;
      let facing = pose.facing;
      let forward = 0;
      let strafe = 0;
      if (keys.has("w") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("a")) strafe -= 1;
      if (keys.has("d")) strafe += 1;
      if (keys.has("q") || keys.has("arrowleft")) facing -= dt * 2;
      if (keys.has("e") || keys.has("arrowright")) facing += dt * 2;
      // Overhead, keys move relative to the camera, not your body.
      const basis = live.current.view === "overhead" ? -orbit.yaw : live.current.view === "pawn" ? pawnBasis : facing;
      let next: LoungePose | null = null;
      if (forward || strafe) {
        const step = WALK_SPEED * dt * (shiftDown || doubleTap ? SPRINT : 1);
        const fx = Math.sin(basis) * forward + Math.cos(basis) * strafe;
        const fz = -Math.cos(basis) * forward + Math.sin(basis) * strafe;
        const to = { x: pose.x + fx * step, z: pose.z + fz * step };
        next = { ...stepTo(pose, to, venue, live.current.canProject), facing: live.current.view !== "eyes" ? headingTo(pose, to) : facing };
      } else if (walkTarget) {
        const dx = walkTarget.x - pose.x;
        const dz = walkTarget.z - pose.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.05) walkTarget = walkQueue.shift() ?? null;
        else {
          const step = Math.min(distance, WALK_SPEED * dt);
          const to = { x: pose.x + (dx / distance) * step, z: pose.z + (dz / distance) * step };
          const moved = stepTo(pose, to, venue, live.current.canProject);
          if (moved.x === pose.x && moved.z === pose.z) { walkTarget = null; walkQueue = []; }
          next = { ...moved, facing: headingTo(pose, walkTarget ?? to) };
        }
      } else if (facing !== pose.facing) {
        next = { ...pose, facing: wrapHeading(facing) };
      }
      if (next) moveTo({ ...next, facing: wrapHeading(next.facing) });
    };

    const setFov = (fov: number) => {
      if (Math.abs(camera.fov - fov) < 0.01) return;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };
    const placeCamera = () => {
      const pose = myPose();
      const me = live.current.participants.find((p) => p.connectionId === live.current.connectionId);
      const pawn = live.current.view === "pawn" && parts.board && me ? parts.board.pawnView(deepPixelPlayerId(me.id)) : null;
      if (pawn) {
        // Riding along behind my pawn, looking the way it travels round the board.
        const heading = Math.atan2(pawn.dir.x, pawn.dir.z) + pawnYaw;
        pawnBasis = Math.atan2(Math.sin(heading), -Math.cos(heading));
        const back = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
        const wantPosition = pawn.position.clone()
          .addScaledVector(back, pawnDistance * Math.cos(pawnPitch))
          .add(new THREE.Vector3(0, 1.1 + pawnDistance * Math.sin(pawnPitch), 0));
        const wantTarget = pawn.position.clone().addScaledVector(back, -2.4).add(new THREE.Vector3(0, 0.75, 0));
        const k = pawnEye.ready ? 0.09 : 1;
        pawnEye.position.lerp(wantPosition, k);
        pawnEye.target.lerp(wantTarget, k);
        pawnEye.ready = true;
        camera.position.copy(pawnEye.position);
        camera.lookAt(pawnEye.target);
        setFov(OVERHEAD_FOV);
        return;
      }
      pawnEye.ready = false;
      if (live.current.view === "eyes" && pose) {
        const eye = eyeAt(pose) + jumpLift(performance.now() - jumpedAt);
        const yaw = pose.facing;
        const pitch = look.pitch;
        camera.position.set(pose.x, eye, pose.z);
        target.set(pose.x + Math.sin(yaw) * Math.cos(pitch), eye + Math.sin(pitch), pose.z - Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(target);
        setFov(eyeFov);
        return;
      }
      // Overhead follows you around the room, so it feels like your corner of it.
      const centre = venueId === "cinema"
        ? pose ? new THREE.Vector3(pose.x * 0.5, venue.floorY(pose.x, pose.z) * 0.6 + 0.8, pose.z * 0.5 - 1.2) : new THREE.Vector3(0, 0.8, -2)
        : venueId === "tabletop"
          ? pose ? new THREE.Vector3(pose.x * 0.3, 0.6, pose.z * 0.3 + TABLE_CENTRE.z * 0.7) : new THREE.Vector3(0, 0.6, TABLE_CENTRE.z)
          : venueId === "boardhall"
            ? pose ? new THREE.Vector3(pose.x * 0.45, 0.4, pose.z * 0.45) : new THREE.Vector3(0, 0.4, 0)
            : venueId === "meadow"
              ? pose ? new THREE.Vector3(pose.x, venue.floorY(pose.x, pose.z) + 0.8, pose.z) : new THREE.Vector3(venue.focus.x, 0.8, venue.focus.z)
              : pose ? new THREE.Vector3(pose.x * 0.7, 0.5, pose.z * 0.7 - 0.6) : new THREE.Vector3(0, 0.5, -0.8);
      const yaw = orbit.yaw;
      camera.position.set(
        centre.x + Math.sin(yaw) * Math.cos(orbit.pitch) * orbit.distance,
        centre.y + Math.sin(orbit.pitch) * orbit.distance,
        centre.z + Math.cos(yaw) * Math.cos(orbit.pitch) * orbit.distance,
      );
      camera.lookAt(centre);
      setFov(OVERHEAD_FOV);
    };

    // Behind other windows nobody is watching closely: half the frames do.
    let sinceFrame = 0;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      sinceFrame += dt;
      if (walkTarget || keys.size || performance.now() - jumpedAt < 1000 || dice?.busy() || parts.board?.busy() || live.current.view === "pawn" || live.current.room.emotes.length) poke();
      // Nothing moving for a couple of seconds, or behind another window: 30 frames a second is plenty.
      const calm = !document.hasFocus() || performance.now() - lastActive > 2500;
      if (calm && sinceFrame < 1 / 30) return;
      sinceFrame = 0;
      const t = clock.elapsedTime;
      walk(dt);
      syncBodies();
      syncTv();
      syncWatch();
      syncMusicTv();
      syncExtras(t);
      syncBoard();
      if (rod) {
        const pose = myPose();
        const here = Boolean(pose && fishingSpot(pose));
        if (here !== canFishNow) { canFishNow = here; setCanFish(here); }
        rod.update(t, pose ? rodTip(pose) : null);
        if (rod.busy()) poke();
      }
      const viewer = myPose();
      if (viewer) parts.viewer?.(viewer.x, viewer.z, live.current.view);
      parts.update(t, dt);
      dice?.update();
      if (parts.shark) {
        const hop = parts.shark.userData.hop as number | undefined;
        const since = hop ? (performance.now() - hop) / 1000 : 1;
        parts.shark.position.y = 0.68 + (since < 0.5 ? Math.sin(since * Math.PI * 2) * 0.12 : 0);
        parts.shark.rotation.z = Math.sin(t * 0.8) * 0.03;
      }
      // Beams and pendant only show from inside; overhead they would hide the room.
      parts.ceiling.visible = live.current.view === "eyes";
      placeCamera();
      const me = myPose();
      if (me) ambience.current?.setListener(me, eyeAt(me));
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      if (video) { video.pause(); video.srcObject = null; }
      videoTexture?.dispose();
      tvTexture.dispose();
      disposeTree(scene);
      dice?.dispose();
      extras?.dispose();
      rod?.dispose();
      if (rodRef.current) rodRef.current = null;
      dropWatch();
      if (diceRef.current === dice) diceRef.current = null;
      crowd.dispose();
      parts.dispose();
      renderer.dispose();
      // Browsers cap live WebGL contexts; give this one back now, not at GC.
      renderer.forceContextLoss();
      mount.removeChild(canvas);
    };
  }, [theme, venueId]);

  // A roll in the call: at the tabletop it is thrown onto the table from the roller's seat.
  useEffect(() => {
    // A secret roll has no faces to land on; the call shows it as an overlay.
    if (!diceRoll || venueId !== "tabletop" || diceRoll.masked) return;
    const dice = diceRef.current;
    if (!dice) return;
    const who = live.current.participants.find((p) => p.id === diceRoll.roller.id);
    const pose = who ? live.current.room.poses.get(who.connectionId) : null;
    const from = pose
      ? new THREE.Vector3(pose.x, venue.floorY(pose.x, pose.z) + 1.1, pose.z)
      : new THREE.Vector3(TABLE_CENTRE.x, 1.2, TABLE_CENTRE.z + 2.4);
    void dice.roll(diceRoll, from);
    // "Roll my initiative": my next roll goes into the order, tied to my chair.
    const me = live.current.participants.find((p) => p.connectionId === live.current.connectionId);
    if (pendingInitiative.current && me && diceRoll.roller.id === me.id && live.current.connectionId) {
      pendingInitiative.current = false;
      const room = live.current.room;
      const character = room.shared.characters[me.id];
      room.setShared("initiative", addInitiative(room.shared.initiative, {
        id: `p-${live.current.connectionId}`, name: character?.name || me.displayName, value: diceRoll.total, connectionId: live.current.connectionId,
      }));
    }
    void playDiceRollSound({
      theme: diceRoll.theme || "default",
      diceCount: diceRoll.dice.reduce((sum, term) => sum + term.rolls.length, 0),
      material: diceRoll.material ?? "plastic",
    });
    // The call-wide roll is shown here, so it need not be shown again as an overlay.
    const done = setTimeout(() => onDiceRollDone?.(), 2500);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diceRoll?.animationSeed, venueId]);

  const myPerson = participants.find((p) => p.connectionId === connectionId);
  const myName = myPerson?.displayName || "Me";
  const isGm = Boolean(connectionId && room.shared.gm?.connectionId === connectionId);
  // The game master changes the map; with nobody (still) in that role, anyone may.
  const gmPresent = Boolean(room.shared.gm && participants.some((p) => p.connectionId === room.shared.gm?.connectionId));
  const canEditMap = isGm || !gmPresent;
  const inGmChair = Boolean(connectionId && room.poses.get(connectionId)?.seat === GM_SEAT_ID);
  const party = participants.flatMap((p) => {
    const character = room.shared.characters[p.id];
    return character && !p.bot && !p.recorder ? [{ character: character.name, player: p.displayName }] : [];
  });
  const screenData = { initiative: room.shared.initiative, party, notes: gmNotes, rolls: hiddenLog };
  screenPagesRef.current = isGm && venueId === "tabletop"
    ? screenChoice.map((id) => buildScreenPage(id, screenData) ?? { title: "", lines: [] })
    : null;
  /** The chair a seat belongs to, as a point on the table edge: where a game master's hidden dice land. */
  const seatOf = (id: string | null | undefined) => seatById(id ? room.poses.get(id)?.seat : null, venue);

  // Someone rolled behind the game master's screen: everyone else sees dice land there, with no faces to read.
  useEffect(() => {
    const hidden = room.hiddenRoll;
    const dice = diceRef.current;
    if (!hidden || venueId !== "tabletop" || !dice || hidden.by === connectionId) return;
    const seat = seatOf(hidden.by);
    const pose = room.poses.get(hidden.by);
    const fake: DiceRollEvent = {
      expression: "?", modifier: 0, total: 0, rollType: "normal", animationSeed: hidden.seed,
      dice: hidden.dice.map((die) => ({ sides: die.sides, sign: 1 as const, rolls: Array.from({ length: die.count }, () => ({ value: 1 + Math.floor(Math.random() * die.sides), kept: true })) })),
      roller: { id: "", displayName: "Game master" }, themeColor: "#444a5a",
    };
    void dice.roll(fake, new THREE.Vector3(pose?.x ?? TABLE_CENTRE.x, 1.1, pose?.z ?? TABLE_CENTRE.z + 2.4), { ...behindScreen(seat), label: "Rolled behind the screen" });
    void playDiceRollSound({ theme: "default", diceCount: hidden.dice.reduce((sum, die) => sum + die.count, 0), material: "plastic" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.hiddenRoll?.id, venueId]);

  /** The game master's own roll: the dice land behind their screen, and only they see the faces. */
  const rollHidden = async (command: string) => {
    const read = (key: string, fallback: string) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
    const material = read("huddle_dice_material", "auto");
    const texture = read("huddle_dice_texture", "auto");
    try {
      const data = await apiFetch<{ roll?: DiceRollEvent; error?: string }>("/api/integrations/dnd/roll", {
        method: "POST",
        // No channel: the server answers only to this tab and tells nobody else.
        body: JSON.stringify({ command, theme: read("huddle_dice_theme", "default"), themeColor: read("huddle_dice_color", "#2563eb"), ...(material !== "auto" ? { material } : {}), ...(texture !== "auto" ? { texture } : {}) }),
      });
      if (data.error || !data.roll) { setRollNote(data.error || "That roll did not work."); return; }
      const roll = data.roll;
      const pose = connectionId ? room.poses.get(connectionId) : null;
      void diceRef.current?.roll(roll, new THREE.Vector3(pose?.x ?? TABLE_CENTRE.x, 1.1, pose?.z ?? TABLE_CENTRE.z + 2.4), {
        ...behindScreen(seatOf(connectionId)), label: `Hidden · ${roll.expression} = ${roll.total}`,
      });
      void playDiceRollSound({ theme: "default", diceCount: roll.dice.reduce((sum, term) => sum + term.rolls.length, 0), material: roll.material ?? "plastic" });
      room.setShared("hiddenroll", { dice: roll.dice.map((term) => ({ sides: term.sides, count: term.rolls.length })), seed: roll.animationSeed });
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setHiddenLog((log) => [`${roll.expression} = ${roll.total} (${at})`, ...log].slice(0, 20));
      setRollNote(null);
    } catch (error) {
      setRollNote(error instanceof Error ? error.message : "That roll did not work.");
    }
  };

  /** Looks a spell, monster or item up and puts its card in the air over the table for everyone. */
  const showCard = async (kind: string, query: string) => {
    setRollNote(`Looking up ${query}…`);
    try {
      const data = await apiFetch<{ text?: string; payload?: { type?: string; name?: string; subtitle?: string; facts?: Array<{ label: string; value: string }>; sections?: Array<{ title: string; body: string }> } }>(
        "/api/integrations/dnd/lookup", { method: "POST", body: JSON.stringify({ kind, query }) },
      );
      const payload = data.payload;
      if (!payload || payload.type === "suggest" || !payload.name) { setRollNote(data.text || "Nothing found."); return; }
      const body = (payload.sections?.find((section) => !section.title) ?? payload.sections?.[0])?.body ?? "";
      room.setShared("card", { title: payload.name, subtitle: payload.subtitle ?? "", facts: (payload.facts ?? []).slice(0, 6), body } satisfies Pick<TableCard, "title" | "subtitle" | "facts" | "body">);
      setRollNote(null);
    } catch (error) {
      setRollNote(error instanceof Error ? error.message : "That lookup failed.");
    }
  };

  const [rollText, setRollText] = useState("");
  const [rollMode, setRollMode] = useState<"" | " adv" | " dis">("");
  const rollNow = (command: string) => {
    if (hiddenMode && isGm && /^\/roll\b/i.test(command)) void rollHidden(command);
    else onCommand?.(command);
  };
  const runTyped = () => {
    const text = rollText.trim();
    if (!text) return;
    const lookup = /^\/(spell|monster|item|feat|race|class|subclass)\s+(.+)$/i.exec(text);
    if (lookup) void showCard(lookup[1].toLowerCase(), lookup[2].trim());
    else rollNow(text.startsWith("/") ? text : `/roll ${text}${rollMode}`);
    setRollText("");
  };
  /** Takes the free seat nearest someone, so friends can sit together. */
  const sitNear = (targetId: string) => {
    const target = room.poses.get(targetId);
    if (!target) return;
    const taken = new Set([...room.poses.values()].map((pose) => pose.seat));
    const free = venue.seats.filter((seat) => !seat.reserved && !taken.has(seat.id))
      .sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z))[0];
    if (free) room.sit(free.id);
  };

  const me = connectionId ? room.poses.get(connectionId) : null;
  const inBooth = canProject && venueId === "cinema" && !!me && inAnnex(me, venue);
  // Whatever the booth set for the house lights is what everyone's cinema shows.
  const house = room.shared.house;
  useEffect(() => {
    if (venueId === "cinema" && cinemaLightsRef.current) applyHouse(cinemaLightsRef.current, house);
  }, [house, venueId]);
  // Walking into the booth brings its desk up; walking out puts it away.
  const wasInBooth = useRef(false);
  useEffect(() => {
    if (inBooth && !wasInBooth.current) setPanel("booth");
    if (!inBooth && wasInBooth.current) setPanel((current) => (current === "booth" ? null : current));
    wasInBooth.current = inBooth;
  }, [inBooth]);
  const goToBooth = () => {
    const a = venue.annex;
    if (a && me) room.move({ x: a.doorX, z: a.z0 - 0.9, facing: 0, seat: null });
  };
  const seatName = me?.seat ? seatById(me.seat, venue)?.label : null;
  const tvShowing = screens[0]?.name ?? (nowPlaying?.track ? `♫ ${nowPlaying.track.title}` : null);

  return (
    <div ref={shellRef} className={`living-room living-room-${theme}`} role="region" aria-label={VENUE_NAMES[venueId]}>
      <style>{LIVING_ROOM_CSS}</style>
      <div ref={mountRef} className="living-room-canvas" />
      {controlsHidden && (
        <button type="button" className="living-room-reveal" onClick={() => setControlsHidden(false)} title="Show controls (H)" aria-label="Show controls"><Eye size={16} /></button>
      )}
      {!controlsHidden && <div className="living-room-top">
        <div className="living-room-title">
          {(() => { const Icon = VENUE_ICONS[venueId]; return <Icon size={16} />; })()}
          <span>{VENUE_NAMES[venueId]}</span>
          {seatName ? <small>· {venueId === "cinema" ? seatName : `on the ${seatName.toLowerCase()}`}</small> : me?.seat === "floor" ? <small>· on the floor</small> : null}
          {tvShowing && <small>· {venueId === "lounge" ? "TV" : "Screen"}: {tvShowing}</small>}
        </div>
        <div className="living-room-tools">
          {VENUE_IDS.map((id) => {
            const Icon = VENUE_ICONS[id];
            return (
              <button key={id} type="button" className={venueId === id ? "active" : ""} onClick={() => room.setVenue(id)} title={VENUE_NAMES[id]} aria-label={`Go to the ${VENUE_NAMES[id].toLowerCase()}`} aria-pressed={venueId === id}>
                <Icon size={16} />
              </button>
            );
          })}
          <span className="living-room-sep" aria-hidden="true" />
          {/* A film plays on whichever screen the room is in, so anyone can start or stop it from any room. */}
          <button type="button" className={panel === "watch" || room.shared.watch ? "active" : ""} onClick={() => setPanel(panel === "watch" ? null : "watch")} title="Watch together" aria-label="Watch together" aria-expanded={panel === "watch"}><Film size={16} /></button>
          {venueId === "cinema" && canProject && (inBooth
            ? <button type="button" className={panel === "booth" ? "active" : ""} onClick={() => setPanel(panel === "booth" ? null : "booth")} title="Projection booth controls" aria-label="Projection booth controls" aria-expanded={panel === "booth"}><SlidersHorizontal size={16} /></button>
            : <button type="button" onClick={goToBooth} title="Go to the projection booth (the door at the back of the hall)" aria-label="Go to the projection booth"><DoorOpen size={16} /></button>)}
          {venueId === "cinema" && (
            <button type="button" className={panel === "seats" ? "active" : ""} onClick={() => setPanel(panel === "seats" ? null : "seats")} title="Who is where" aria-label="Who is where" aria-expanded={panel === "seats"}><Users size={16} /></button>
          )}
          {venueId === "tabletop" && (
            <>
              <button type="button" className={panel === "initiative" || room.shared.initiative ? "active" : ""} onClick={() => setPanel(panel === "initiative" ? null : "initiative")} title="Initiative" aria-label="Initiative" aria-expanded={panel === "initiative"}><Swords size={16} /></button>
              <button type="button" className={panel === "character" ? "active" : ""} onClick={() => setPanel(panel === "character" ? null : "character")} title="My character" aria-label="My character" aria-expanded={panel === "character"}><UserRound size={16} /></button>
              <button type="button" className={panel === "gm" || isGm ? "active" : ""} onClick={() => setPanel(panel === "gm" ? null : "gm")} title="Game master: the GM's chair, the battle map and your screen" aria-label="Game master" aria-expanded={panel === "gm"}><Crown size={16} /></button>
            </>
          )}
          {venueId === "boardhall" && (
            <>
              <button type="button" className="living-room-play" onClick={() => onPlayBoardGame?.()} disabled={!onPlayBoardGame} title={boardGameId ? "Open the game to play" : "Start a DeepPixel game for the room"} aria-label={boardGameId ? "Open the game" : "Start a game"}><Gamepad2 size={16} /><span>Play</span></button>
              <button type="button" className={followPawn ? "active" : ""} onClick={() => setFollowPawn((on) => !on)} title="Walk with my pawn: when it moves, you walk over to it" aria-label="Walk with my pawn" aria-pressed={followPawn}><Footprints size={16} /></button>
            </>
          )}
          <span className="living-room-sep" aria-hidden="true" />
          <button type="button" className={view === "overhead" ? "active" : ""} onClick={() => setView("overhead")} title="Overhead view" aria-label="Overhead view"><MapIcon size={16} /></button>
          <button type="button" className={view === "eyes" ? "active" : ""} onClick={() => setView("eyes")} title="Through your eyes" aria-label="First-person view"><Eye size={16} /></button>
          {venueId === "boardhall" && <button type="button" className={view === "pawn" ? "active" : ""} onClick={() => setView("pawn")} title="Behind my pawn" aria-label="Pawn view"><Navigation size={16} /></button>}
          {venueId === "lounge" && <button type="button" className={room.settings.ambience ? "active" : ""} onClick={() => room.setSettings({ ambience: !room.settings.ambience })} title="Room sounds (only you hear them)" aria-label="Room sounds" aria-pressed={room.settings.ambience}><Flame size={16} /></button>}
          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((open) => !open)} title="Living Room settings" aria-label="Living Room settings" aria-expanded={settingsOpen}><Settings2 size={16} /></button>
          <button type="button" onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Full screen"} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button type="button" onClick={() => { setControlsHidden(true); setSettingsOpen(false); }} title="Hide controls (H)" aria-label="Hide controls"><EyeOff size={16} /></button>
        </div>
      </div>}
      {!controlsHidden && venueId === "meadow" && (canFish || fishing.phase !== "idle" || lastCatch) && (
        <FishingPanel
          phase={fishing} canFish={canFish} lastCatch={lastCatch} tackle={tackle}
          onCast={() => rodRef.current?.cast()} onReel={() => rodRef.current?.reel()}
          onTackle={() => setTackle((open) => (open ? null : readTackle()))}
        />
      )}
      {!controlsHidden && venueId === "boardhall" && (
        <BoardHallMenu
          game={boardGame} gameId={boardGameId} bridge={bridge.state} toasts={bridge.toasts} send={bridge.send}
          userId={myPerson?.id ?? null} onPlay={onPlayBoardGame} tile={pickedTile} onCloseTile={() => setPickedTile(null)}
        />
      )}
      {!controlsHidden && panel && (
        <div className="living-room-panels">
          {panel === "watch" && (
            <WatchPanel
              watch={room.shared.watch} hubNow={() => (serverNow ?? Date.now)()} info={watchInfo} volume={watchVolume} onVolume={setWatchVolume}
              setWatch={(value) => room.setShared("watch", value)} onStartSound={() => watchApi.current.start()}
              onYoutube={onCommand ? () => { onCommand("/watch"); setPanel(null); } : undefined} onClose={() => setPanel(null)}
            />
          )}
          {panel === "booth" && inBooth && (
            <BoothPanel
              watch={room.shared.watch} hubNow={() => (serverNow ?? Date.now)()} info={watchInfo} house={house}
              setWatch={(value) => room.setShared("watch", value)} setHouse={(value) => room.setShared("house", value)}
              onPick={() => { if (room.shared.watch) room.setShared("watch", null); setPanel("watch"); }} onClose={() => setPanel(null)}
            />
          )}
          {panel === "seats" && <SeatFinder participants={participants} poses={room.poses} myId={connectionId} onSitNear={sitNear} onClose={() => setPanel(null)} />}
          {panel === "initiative" && (
            <InitiativePanel
              initiative={room.shared.initiative} gm={room.shared.gm} myId={connectionId} myName={myName}
              setInitiative={(value) => room.setShared("initiative", value)} setGm={(value) => room.setShared("gm", value)}
              onRollMine={() => { pendingInitiative.current = true; onCommand?.("/roll 1d20"); }} onClose={() => setPanel(null)}
            />
          )}
          {panel === "gm" && (
            <GameMasterPanel
              gm={room.shared.gm} myId={connectionId} myName={myName} inGmChair={inGmChair}
              onTakeChair={() => { const refused = room.sit(GM_SEAT_ID); if (refused) setHint(refused); }}
              setGm={(value) => room.setShared("gm", value)}
              map={room.shared.tablemap} canEditMap={canEditMap} setMap={(value) => room.setShared("tablemap", value)}
              choice={screenChoice} setChoice={setScreenChoice} notes={gmNotes} setNotes={setGmNotes}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "character" && (
            <CharacterPanel
              mine={myPerson ? room.shared.characters[myPerson.id] ?? null : null} fallbackName={myName}
              setMine={(value) => room.setShared("character", value)} onClose={() => setPanel(null)}
            />
          )}
        </div>
      )}
      {hoverSeat && venueId === "cinema" && (() => {
        const seat = seatById(hoverSeat.id, venue);
        const holder = [...room.poses].find(([, pose]) => pose.seat === hoverSeat.id)?.[0];
        const who = holder ? participants.find((p) => p.connectionId === holder)?.displayName : null;
        return seat ? <div className="living-room-tip" style={{ left: hoverSeat.x + 14, top: hoverSeat.y + 14 }}>{seat.label}{who ? ` · ${who}` : " · free"}</div> : null;
      })()}
      {hint && !settingsOpen && !controlsHidden && (
        <div className="living-room-hint" onClick={() => setHint(null)}>{hint}</div>
      )}
      {settingsOpen && !controlsHidden && (
        <div className="living-room-settings" role="dialog" aria-label="Living Room settings">
          <label className="living-room-switch">
            <span><strong>Spatial voices</strong><small>{venueId === "cinema" ? "Hear people from where they sit. Off by default here, so everyone is one volume while you watch." : "Hear people from where they are in the room. Off: everyone sounds like a normal call."}</small></span>
            <input type="checkbox" checked={room.settings.spatial} onChange={(event) => room.setSettings({ spatial: event.target.checked })} />
          </label>
          <label className="living-room-slider">
            <span>Room echo: {Math.round((room.settings.echo ?? 0.5) * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={room.settings.echo ?? 0.5}
              disabled={!room.settings.spatial}
              aria-label="Room echo"
              onChange={(event) => room.setSettings({ echo: Number(event.target.value) })}
            />
          </label>
          <label className="living-room-switch">
            <span><strong>Music from the TV</strong><small>{venueId === "lounge" ? "The music bot plays from the TV over the fireplace." : "The music bot plays from the screen."}</small></span>
            <input type="checkbox" checked={room.settings.tvMusic} onChange={(event) => room.setSettings({ tvMusic: event.target.checked })} />
          </label>
          {venueId === "lounge" && <label className="living-room-switch">
            <span><strong>Room sounds</strong><small>Recorded fire, rain, wind or city, depending on the theme. Only you hear them.</small></span>
            <input type="checkbox" checked={room.settings.ambience} onChange={(event) => room.setSettings({ ambience: event.target.checked })} />
          </label>}
          {venueId === "lounge" && <label className="living-room-slider">
            <span>Room sound volume</span>
            <input type="range" min={0} max={1} step={0.01} value={room.settings.ambienceVolume} disabled={!room.settings.ambience}
              onChange={(event) => room.setSettings({ ambienceVolume: Number(event.target.value) })} />
          </label>}
          {venueId === "cinema" && (
            <>
              <label className="living-room-switch">
                <span><strong>Auto-dim lights</strong><small>Lights dim automatically when a video or screen share plays.</small></span>
                <input type="checkbox" checked={cinemaLightsRef.current?.autoDim ?? true} onChange={(event) => cinemaLightsRef.current?.setAutoDim(event.target.checked)} />
              </label>
              <label className="living-room-slider">
                <span>Light level: {Math.round((cinemaLightsRef.current?.level ?? 1) * 100)}%</span>
                <input type="range" min={0} max={1} step={0.01} value={cinemaLightsRef.current?.level ?? 1}
                  onChange={(event) => cinemaLightsRef.current?.setLevel(Number(event.target.value))} />
              </label>
            </>
          )}
        </div>
      )}
      {!controlsHidden && venueId === "tabletop" && (
        <div className="living-room-dice" role="group" aria-label="Dice tray">
          <div className="living-room-dice-row">
            {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
              <button key={sides} type="button" onClick={() => rollNow(`/roll 1d${sides}${sides === 20 ? rollMode : ""}`)} title={`Roll a d${sides}${sides === 20 && rollMode ? (rollMode === " adv" ? " with advantage" : " with disadvantage") : ""}`}>d{sides}</button>
            ))}
            <button type="button" className={rollMode === " adv" ? "active" : ""} aria-pressed={rollMode === " adv"} onClick={() => setRollMode(rollMode === " adv" ? "" : " adv")} title="Advantage: d20 rolls take the better of two">Adv</button>
            {isGm && <button type="button" className={hiddenMode ? "active" : ""} aria-pressed={hiddenMode} onClick={() => setHiddenMode(!hiddenMode)} title="Game master: roll behind your screen, so only you see the faces">Hidden</button>}
            <button type="button" className={rollMode === " dis" ? "active" : ""} aria-pressed={rollMode === " dis"} onClick={() => setRollMode(rollMode === " dis" ? "" : " dis")} title="Disadvantage: d20 rolls take the worse of two">Dis</button>
          </div>
          {rollNote && <small className="living-room-dice-note">{rollNote}</small>}
          <form className="living-room-dice-row" onSubmit={(event) => { event.preventDefault(); runTyped(); }}>
            <input value={rollText} onChange={(event) => setRollText(event.target.value)} placeholder="2d6+3  ·  /spell fireball  ·  /monster goblin (floats over the table)" aria-label="Roll dice or look something up" maxLength={120} />
            <button type="submit" disabled={!rollText.trim()}>Go</button>
          </form>
        </div>
      )}
      {!controlsHidden && <div className="living-room-emotes" role="toolbar" aria-label="Emotes">
        {LOUNGE_EMOTES.map((emoji) => (
          <button key={emoji} type="button" onClick={() => room.emote(emoji)} aria-label={`Emote ${emoji}`}>{emoji}</button>
        ))}
        {me && (me.seat && me.seat !== "floor" ? (
          <button type="button" className="living-room-stand" onClick={() => room.move({ ...stepTo(me, { x: me.x + Math.sin(me.facing) * 0.6, z: me.z - Math.cos(me.facing) * 0.6 }, venue, canProject), facing: me.facing })}>Stand up</button>
        ) : (
          <button type="button" className="living-room-stand" onClick={room.toggleFloor} title="Sit right here, on the floor (X)">{me.seat === "floor" ? "Stand up" : "Sit here"}</button>
        ))}
      </div>}
    </div>
  );
}

const RARITY_LABEL: Record<string, string> = { junk: "Junk", common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };
const RARITY_ORDER = ["legendary", "rare", "uncommon", "common", "junk"];

/** The meadow's fishing: cast, wait, reel in when it bites; the last catch and the tackle box. */
function FishingPanel({ phase, canFish, lastCatch, tackle, onCast, onReel, onTackle }: {
  phase: FishingPhase;
  canFish: boolean;
  lastCatch: { name: string; emoji: string; weight: number; rarity: string; record: boolean } | null;
  tackle: Record<string, TackleEntry> | null;
  onCast: () => void;
  onReel: () => void;
  onTackle: () => void;
}) {
  const entries = tackle ? Object.values(tackle).sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || b.best - a.best) : [];
  return (
    <div className="lr-fish" role="group" aria-label="Fishing">
      {phase.phase === "bite" ? (
        <button type="button" className="lr-fish-reel bite" onClick={onReel}>🎣 Reel in! <kbd>F</kbd></button>
      ) : phase.phase === "waiting" ? (
        <>
          <span className="lr-fish-note">Line's out. Wait for the float to dip…</span>
          <button type="button" className="lr-fish-reel" onClick={onReel}>Reel in <kbd>F</kbd></button>
        </>
      ) : (
        <>
          {lastCatch && phase.phase === "caught" && (
            <div className={`lr-fish-catch ${lastCatch.rarity}`}>
              <span className="lr-fish-emoji">{lastCatch.emoji}</span>
              <span>
                <strong>{lastCatch.name}</strong>
                <small>{lastCatch.rarity === "junk" ? "Not a fish." : `${lastCatch.weight.toFixed(2)} kg`} · {RARITY_LABEL[lastCatch.rarity]}{lastCatch.record ? " · new best!" : ""}</small>
              </span>
            </div>
          )}
          {phase.phase === "lost" && <span className="lr-fish-note">{phase.reason}</span>}
          {canFish
            ? <button type="button" className="lr-fish-reel" onClick={onCast}>🎣 Cast <kbd>F</kbd></button>
            : <span className="lr-fish-note">Fish from the jetty or the pond's edge.</span>}
        </>
      )}
      <button type="button" className="lr-fish-box" onClick={onTackle} aria-expanded={Boolean(tackle)}>{tackle ? "Close tackle box" : "Tackle box"}</button>
      {tackle && (
        <ul className="lr-fish-log">
          {entries.length === 0 && <li>Nothing yet. Go catch something!</li>}
          {entries.map((entry) => (
            <li key={entry.name} className={entry.rarity}>
              <span>{entry.emoji} {entry.name}</span>
              <small>×{entry.count}{entry.rarity !== "junk" ? ` · best ${entry.best.toFixed(2)} kg` : ""}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LIVING_ROOM_CSS = `
.voice-stage-bottom-bar { position: relative; z-index: 6; }
.living-room { --lr-accent: #ffd27a; --lr-ink: #fff4e3; --lr-panel: rgba(28, 18, 12, 0.72); --lr-edge: rgba(255, 210, 160, 0.2); position: absolute; inset: 0; z-index: 5; background: #1a110c; overflow: hidden; border-radius: inherit; }
.living-room-vampire { --lr-accent: #c2142f; --lr-ink: #f6e3e0; --lr-panel: rgba(20, 4, 8, 0.78); --lr-edge: rgba(176, 138, 62, 0.35); background: #0b0306; }
.living-room-vampire .living-room-title { font-family: Georgia, serif; letter-spacing: 0.04em; }
.living-room-matrix { --lr-accent: #00e060; --lr-ink: #b9ffcf; --lr-panel: rgba(0, 10, 3, 0.82); --lr-edge: rgba(0, 224, 96, 0.35); background: #000400; }
.living-room-matrix .living-room-title { font-family: ui-monospace, monospace; }
.living-room-academia { --lr-accent: #c9a45c; --lr-ink: #ebdfc4; --lr-panel: rgba(14, 19, 15, 0.82); --lr-edge: rgba(201, 164, 92, 0.3); background: #0e130f; }
.living-room-academia .living-room-title { font-family: 'EB Garamond', Garamond, Georgia, serif; letter-spacing: 0.03em; font-size: 15px; }
.living-room-cyberpunk { --lr-accent: #ff2fb4; --lr-ink: #e6f9ff; --lr-panel: rgba(10, 5, 30, 0.78); --lr-edge: rgba(0, 240, 255, 0.45); background: #06030f; }
.living-room-cyberpunk .living-room-title, .living-room-cyberpunk .living-room-tools, .living-room-cyberpunk .living-room-emotes { box-shadow: 0 0 14px rgba(255, 47, 180, 0.35), inset 0 0 8px rgba(0, 240, 255, 0.15); }
.living-room:fullscreen { border-radius: 0; }
.living-room-canvas { position: absolute; inset: 0; touch-action: none; }
.living-room-canvas canvas { width: 100% !important; height: 100% !important; display: block; cursor: pointer; }
.living-room-top { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.living-room-title, .living-room-tools { pointer-events: auto; display: flex; align-items: center; gap: 6px; background: var(--lr-panel); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 999px; padding: 6px 12px; font-size: 14px; font-weight: 600; }
.living-room-title small { font-weight: 400; opacity: 0.75; }
.living-room-tools { padding: 4px; }
.living-room-tools button { display: inline-flex; align-items: center; gap: 4px; min-width: 32px; height: 32px; justify-content: center; padding: 0 8px; border-radius: 999px; color: inherit; background: transparent; font-size: 12px; font-weight: 600; }
.living-room-tools button:hover { background: rgba(255, 220, 170, 0.12); }
.living-room-tools button.active { background: var(--lr-accent); color: #1b1530; }
.living-room-hint { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px); background: var(--lr-panel); color: var(--lr-ink); padding: 6px 14px; border-radius: 12px; font-size: 13px; cursor: pointer; text-align: center; }
.living-room-reveal { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 999px; background: var(--lr-panel); color: var(--lr-ink); border: 1px solid var(--lr-edge); opacity: 0.55; transition: opacity 0.15s; }
.living-room-reveal:hover { opacity: 1; }
.living-room-settings { position: absolute; top: 58px; right: 10px; width: min(320px, calc(100% - 20px)); display: grid; gap: 10px; padding: 12px 14px; background: var(--lr-panel); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 14px; font-size: 13px; z-index: 2; }
.living-room-switch { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; cursor: pointer; }
.living-room-switch span { display: grid; gap: 2px; }
.living-room-switch small { opacity: 0.7; line-height: 1.35; }
.living-room-switch input { margin-top: 2px; width: 18px; height: 18px; accent-color: var(--lr-accent); flex: none; }
.living-room-slider { display: grid; gap: 6px; }
.living-room-slider input { width: 100%; accent-color: var(--lr-accent); }
.living-room-slider input:disabled { opacity: 0.4; cursor: not-allowed; }
.living-room-emotes { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; gap: 4px; align-items: center; background: var(--lr-panel); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border: 1px solid var(--lr-edge); border-radius: 999px; padding: 4px 6px; max-width: calc(100% - 32px); overflow-x: auto; }
.living-room-emotes button { font-size: 20px; width: 36px; height: 36px; border-radius: 999px; transition: transform 0.12s; flex: none; }
.living-room-emotes button:hover { transform: scale(1.2); background: rgba(255, 220, 170, 0.12); }
.living-room-emotes .living-room-stand { font-size: 12px; width: auto; padding: 0 12px; color: var(--lr-ink); font-weight: 600; }
.living-room-emotes .living-room-stand:hover { transform: none; }
.living-room-sep { width: 1px; height: 18px; background: var(--lr-edge); margin: 0 2px; }
.living-room-dice { position: absolute; left: 10px; bottom: 84px; display: grid; gap: 6px; background: var(--lr-panel); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); border: 1px solid var(--lr-edge); border-radius: 16px; padding: 8px; max-width: calc(100% - 20px); color: var(--lr-ink); }
.living-room-dice-row { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.living-room-dice button { min-width: 38px; height: 32px; padding: 0 8px; border-radius: 10px; font-size: 13px; font-weight: 700; color: inherit; background: rgba(255, 220, 170, 0.1); }
.living-room-dice button:hover:not(:disabled) { background: rgba(255, 220, 170, 0.22); }
.living-room-panel button.active { background: var(--lr-accent) !important; color: #1b1530 !important; }
.lr-onair { margin-left: 6px; padding: 1px 7px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; color: #fff; background: #d62a2a; box-shadow: 0 0 10px rgba(255, 59, 59, 0.7); animation: lr-onair-pulse 1.6s ease-in-out infinite; }
@keyframes lr-onair-pulse { 50% { opacity: 0.55; } }
.living-room-dice button.active { background: var(--lr-accent); color: #1b1530; }
.living-room-dice button:disabled { opacity: 0.4; }
.living-room-dice-note { opacity: 0.8; max-width: 320px; line-height: 1.3; }
.living-room-tools .living-room-play { background: var(--lr-accent); color: #1b1530; padding: 0 12px; }
.living-room-tools .living-room-play:hover { background: var(--lr-accent); filter: brightness(1.08); }
.lr-fish { position: absolute; left: 10px; bottom: 84px; width: min(280px, calc(100% - 20px)); display: grid; gap: 8px; padding: 10px 12px; background: var(--lr-panel); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 16px; font-size: 13px; z-index: 3; }
.lr-fish-reel { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; border-radius: 12px; font-size: 14px; font-weight: 800; color: #1b1530; background: var(--lr-accent); }
.lr-fish-reel kbd { font: inherit; font-size: 11px; padding: 1px 6px; border-radius: 5px; background: rgba(0, 0, 0, 0.15); }
.lr-fish-reel.bite { height: 48px; font-size: 16px; animation: lr-bite 0.35s ease-in-out infinite alternate; }
@keyframes lr-bite { to { transform: scale(1.04); filter: brightness(1.15); } }
.lr-fish-note { opacity: 0.85; line-height: 1.35; }
.lr-fish-catch { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 12px; background: rgba(255, 255, 255, 0.06); animation: lr-catch 0.35s ease-out; }
@keyframes lr-catch { from { transform: scale(0.85); opacity: 0; } }
.lr-fish-catch span { display: grid; }
.lr-fish-catch small { opacity: 0.75; }
.lr-fish-catch.rare { box-shadow: inset 0 0 0 1px #4dabf7; }
.lr-fish-catch.legendary { box-shadow: inset 0 0 0 1px #ffd43b, 0 0 18px rgba(255, 212, 59, 0.35); }
.lr-fish-emoji { font-size: 28px; }
.lr-fish-box { height: 26px; border-radius: 8px; font-size: 11px; font-weight: 700; color: inherit; background: rgba(255, 255, 255, 0.06); }
.lr-fish-log { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 200px; overflow-y: auto; }
.lr-fish-log li { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; border-radius: 6px; }
.lr-fish-log li small { opacity: 0.7; white-space: nowrap; }
.lr-fish-log li.rare { color: #74c0fc; }
.lr-fish-log li.legendary { color: #ffd43b; }
.lr-fish-log li.junk { opacity: 0.6; }
.living-room-panels { position: absolute; top: 58px; left: 10px; width: min(340px, calc(100% - 20px)); max-height: calc(100% - 200px); overflow-y: auto; z-index: 3; }
.living-room-panel { display: grid; gap: 8px; padding: 10px 12px; background: var(--lr-panel); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 14px; font-size: 13px; }
.living-room-panel-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.living-room-panel-head strong { display: inline-flex; align-items: center; gap: 6px; }
.living-room-panel-head button { color: inherit; opacity: 0.7; }
.living-room-panel button:not(.living-room-panel-head button) { display: inline-flex; align-items: center; gap: 4px; min-height: 30px; padding: 0 10px; border-radius: 10px; font-size: 12px; font-weight: 700; color: inherit; background: rgba(255, 220, 170, 0.1); }
.living-room-panel button:hover:not(:disabled) { background: rgba(255, 220, 170, 0.22); }
.living-room-panel button.primary { background: var(--lr-accent); color: #1b1530; }
.living-room-panel button:disabled { opacity: 0.45; }
.living-room-panel input[type="text"], .living-room-panel input:not([type]) { flex: 1; min-width: 0; height: 30px; padding: 0 9px; border-radius: 9px; font-size: 13px; color: inherit; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--lr-edge); }
.living-room-panel input[type="range"] { flex: 1; accent-color: var(--lr-accent); min-width: 0; }
.lr-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.lr-line { display: grid; gap: 2px; }
.lr-title { font-weight: 700; }
.lr-note { margin: 0; opacity: 0.75; line-height: 1.4; font-size: 12px; }
.lr-wide { width: 100%; justify-content: center; background: var(--lr-accent) !important; color: #1b1530 !important; }
.lr-field { display: grid; gap: 3px; }
.lr-inline { grid-template-columns: 56px 1fr; align-items: center; }
.lr-heading { margin-top: 4px; font-weight: 700; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
.living-room-panel select, .living-room-panel textarea { min-width: 0; padding: 5px 8px; border-radius: 9px; font: inherit; font-size: 13px; color: inherit; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--lr-edge); }
.living-room-panel select option { color: #1b1530; }
.living-room-panel textarea { resize: vertical; min-height: 64px; }
.lr-narrow { flex: 0 0 56px !important; }
.lr-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.lr-list li { display: flex; gap: 8px; align-items: center; }
.lr-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lr-order { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.lr-order li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 9px; background: rgba(0, 0, 0, 0.18); }
.lr-order li.turn { background: var(--lr-accent); color: #1b1530; font-weight: 700; }
.lr-order li b { min-width: 26px; text-align: right; }
.lr-order li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lr-order li button { min-height: 22px !important; padding: 0 6px !important; background: transparent !important; }
.living-room-tip { position: absolute; pointer-events: none; z-index: 4; padding: 4px 9px; border-radius: 8px; font-size: 12px; font-weight: 700; background: var(--lr-panel); color: var(--lr-ink); border: 1px solid var(--lr-edge); white-space: nowrap; }
.living-room-dice input { flex: 1; min-width: 160px; height: 32px; padding: 0 10px; border-radius: 10px; font-size: 13px; color: inherit; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--lr-edge); }
`;
