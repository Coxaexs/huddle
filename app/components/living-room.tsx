"use client";

import { apiUrl } from "../lib/client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Armchair, Eye, EyeOff, Flame, Map as MapIcon, Maximize2, Minimize2, Settings2 } from "lucide-react";
import { playbackPosition, type PlayerState, type VoiceParticipant } from "@/lib/protocol";
import type { LivingRoom, RoomTheme } from "../hooks/use-living-room";
import { LOUNGE_EMOTES, headingTo, seatById, stepTo, wrapHeading, type LoungePose } from "../lib/living-room";
import { buildRoom, roomAmbience } from "./living-room-scene";
import { RoomAmbience } from "./living-room-ambience";

type CameraView = "overhead" | "eyes";

interface Props {
  room: LivingRoom;
  participants: VoiceParticipant[];
  connectionId: string | null;
  speaking: Set<string>;
  /** Live screen shares; the first one plays on the TV above the fireplace. */
  screens: Array<{ stream: MediaStream; name: string }>;
  /** Deafened: the room's own sounds go quiet too. */
  deafened: boolean;
  /** The room's music player: when nothing is screen-shared, the TV shows what's playing. */
  nowPlaying?: PlayerState | null;
  /** The hub's clock, so the TV's time matches everyone else's. */
  serverNow?: () => number;
}

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
const EYE_STANDING = 1.6;
const EYE_FLOOR = 0.75;
/** First-person field of view in degrees; the wheel zooms between the limits. */
const EYE_FOV = 70;
const EYE_FOV_MIN = 20;
const EYE_FOV_MAX = 100;
const OVERHEAD_FOV = 52;
const WALK_SPEED = 1.6; // m/s

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
  shown: { x: number; z: number; facing: number; lift: number };
  key: string;
}

/** Token size in metres; big enough to read faces from across the room. */
const TOKEN = 0.52;

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
  return { group, token, ring, pointer, shadow, label, mute, shown: { x: 0, z: 0, facing: 0, lift: 0 }, key: `${person.displayName}|${person.avatarUrl}|${person.color}` };
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

export function LivingRoomView({ room, participants, connectionId, speaking, screens, deafened, nowPlaying = null, serverNow }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<CameraView>("overhead");
  const theme = room.theme;
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
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void shellRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const [hint, setHint] = useState<string | null>("Click or tap the floor to walk, any couch, chair or cushion to sit, or Sit here for the floor. WASD walks, Q/E turns, X sits. Scroll or pinch to zoom.");

  // Everything the render loop reads lives in one ref, refreshed every React render.
  const live = useRef({ room, participants, connectionId, speaking, screens, view, nowPlaying, serverNow });
  live.current = { room, participants, connectionId, speaking, screens, view, nowPlaying, serverNow };

  // The room's recorded sounds, placed in 3D and heard from where you are.
  const ambience = useRef<RoomAmbience | null>(null);
  const ambienceOn = room.settings.ambience;
  useEffect(() => {
    if (!ambienceOn) return;
    const engine = new RoomAmbience(theme);
    ambience.current = engine;
    return () => { engine.dispose(); if (ambience.current === engine) ambience.current = null; };
  }, [ambienceOn, theme]);
  useEffect(() => { ambience.current?.setVolume(room.settings.ambienceVolume); }, [room.settings.ambienceVolume, ambienceOn, theme]);
  useEffect(() => { ambience.current?.setMuted(deafened); }, [deafened, ambienceOn, theme]);

  useEffect(() => {
    const t = setTimeout(() => setHint(null), 9000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const house = new THREE.Group();
    scene.add(house);
    const parts = buildRoom(theme);
    house.add(parts.root);
    for (const light of roomAmbience(theme)) house.add(light);
    const background = parts.background;
    scene.background = background;
    scene.fog = parts.fog;
    renderer.toneMappingExposure = parts.exposure;
    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 60);
    scene.add(camera);

    const bodies = new Map<string, Body>();
    const bubbles = new Map<number, THREE.Sprite>();
    let video: HTMLVideoElement | null = null;
    let videoTexture: THREE.VideoTexture | null = null;
    let videoStream: MediaStream | null = null;

    // Overhead orbit.
    const orbit = { yaw: 0.0, pitch: 0.82, distance: 6.2 };
    // First-person look offset, added to body heading.
    const look = { yaw: 0, pitch: -0.08 };
    let eyeFov = EYE_FOV;

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
      if (live.current.view === "overhead") orbit.distance = Math.max(2.2, Math.min(15, orbit.distance * factor));
      else eyeFov = Math.max(EYE_FOV_MIN, Math.min(EYE_FOV_MAX, eyeFov * factor));
    };
    let walkTarget: { x: number; z: number } | null = null;
    const keys = new Set<string>();

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

    const pick = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(house.children, true);
      for (const hit of hits) {
        let object: THREE.Object3D | null = hit.object;
        while (object && !object.userData.seat && !object.userData.blahaj && !object.userData.floor) object = object.parent;
        if (!object) continue;
        if (object.userData.blahaj) {
          squeak();
          parts.shark.userData.hop = performance.now();
          return;
        }
        if (object.userData.seat) {
          local = null;
          live.current.room.sit(object.userData.seat);
          walkTarget = null;
          return;
        }
        if (object.userData.floor) {
          walkTarget = { x: hit.point.x / house.scale.x, z: hit.point.z / house.scale.z };
          return;
        }
      }
    };

    const spread = () => {
      const [a, b] = [...touches.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
    };
    const onDown = (event: PointerEvent) => {
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
      if (live.current.view === "overhead") {
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
      event.preventDefault();
      // Overhead the wheel moves the camera in and out; through your eyes it zooms (field of view).
      zoom(Math.exp(event.deltaY * 0.0012));
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (key === "x" && event.type === "keydown" && !event.repeat) { local = null; live.current.room.toggleFloor(); return; }
      if (!["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) return;
      if (event.type === "keydown") { keys.add(key); walkTarget = null; } else keys.delete(key);
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
      for (const person of people) {
        if (person.bot || person.recorder) continue;
        const pose = r.poses.get(person.connectionId);
        if (!pose) continue;
        seen.add(person.connectionId);
        let body = bodies.get(person.connectionId);
        const key = `${person.displayName}|${person.avatarUrl}|${person.color}`;
        if (body && body.key !== key) {
          house.remove(body.group);
          disposeTree(body.group);
          body = undefined;
        }
        if (!body) {
          body = makeBody(person);
          body.shown = { x: pose.x, z: pose.z, facing: pose.facing, lift: 0 };
          bodies.set(person.connectionId, body);
          house.add(body.group);
        }
        const isSelf = person.connectionId === live.current.connectionId;
        const talking = talk.has(isSelf ? "self" : person.connectionId);
        const ringMaterial = body.ring.material;
        ringMaterial.opacity += ((talking ? 0.95 : 0) - ringMaterial.opacity) * 0.3;
        body.mute.visible = person.muted || Boolean(person.serverMuted) || person.deafened;
        // Your own token hides in first person so it never blocks your eyes.
        const firstPerson = isSelf && live.current.view === "eyes";
        body.group.visible = !firstPerson;
        // The token floats where a head would be: low on a cushion or the floor, higher standing.
        const height = pose.seat === "floor" ? 0.42 : pose.seat ? (seatById(pose.seat)?.height ?? 0.45) + 0.62 : 1.2;
        const s = body.shown;
        s.x += (pose.x - s.x) * 0.18;
        s.z += (pose.z - s.z) * 0.18;
        s.facing += wrapHeading(pose.facing - s.facing) * 0.2;
        s.lift += (height - s.lift) * 0.2;
        body.group.position.set(s.x, 0, s.z);
        body.pointer.rotation.z = -s.facing;
        // A walking token bobs; a talking one pulses.
        const moving = Math.hypot(pose.x - s.x, pose.z - s.z) > 0.02;
        const bob = moving ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.06 : Math.sin(clock.elapsedTime * 1.3 + s.x) * 0.012;
        const pulse = talking ? 1 + Math.sin(clock.elapsedTime * 12) * 0.035 : 1;
        body.token.position.y = s.lift + bob;
        body.token.scale.setScalar(TOKEN * pulse);
        body.ring.position.y = s.lift + bob;
        body.ring.scale.setScalar(TOKEN * (1.45 + (talking ? Math.sin(clock.elapsedTime * 8) * 0.08 : 0)));
        body.label.position.y = s.lift + TOKEN * 0.5 + 0.13;
        body.mute.position.set(0, s.lift - TOKEN * 0.38, 0);
        body.mute.position.y = s.lift - TOKEN * 0.36;
        (body.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34 - Math.min(0.2, s.lift * 0.12);
        body.group.userData.top = s.lift + TOKEN * 0.5;
      }
      for (const [id, body] of bodies) {
        if (seen.has(id)) continue;
        house.remove(body.group);
        disposeTree(body.group);
        bodies.delete(id);
      }
      // Emote bubbles rise from their sender and fade.
      const now = Date.now();
      const active = new Set<number>();
      for (const emote of r.emotes) {
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
        sprite.position.set(base.x + Math.sin(emote.id) * 0.15, top + 0.25 + age * 0.9, base.z);
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
    const syncMusicTv = () => {
      const state = live.current.nowPlaying;
      const showing = Boolean(state?.track) && !videoStream;
      if (!showing) {
        if (parts.screenMaterial.map === tvTexture) {
          parts.screenMaterial.map = null;
          parts.screenMaterial.color.set("#0f0c16");
          parts.screenMaterial.needsUpdate = true;
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
      if (stream === videoStream) return;
      videoStream = stream;
      if (video) { video.pause(); video.srcObject = null; }
      videoTexture?.dispose();
      videoTexture = null;
      if (!stream) {
        parts.screenMaterial.map = null;
        parts.screenMaterial.color.set("#0f0c16");
        parts.screenMaterial.needsUpdate = true;
        return;
      }
      video = document.createElement("video");
      video.muted = true; // Sound comes through the call, spatialised; this is picture only.
      video.playsInline = true;
      video.srcObject = new MediaStream(stream.getVideoTracks());
      void video.play().catch(() => undefined);
      videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      parts.screenMaterial.map = videoTexture;
      parts.screenMaterial.color.set("#ffffff");
      parts.screenMaterial.needsUpdate = true;
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
      const basis = live.current.view === "overhead" ? -orbit.yaw : facing;
      let next: LoungePose | null = null;
      if (forward || strafe) {
        const step = WALK_SPEED * dt;
        const fx = Math.sin(basis) * forward + Math.cos(basis) * strafe;
        const fz = -Math.cos(basis) * forward + Math.sin(basis) * strafe;
        const to = { x: pose.x + fx * step, z: pose.z + fz * step };
        next = { ...stepTo(pose, to), facing: live.current.view === "overhead" ? headingTo(pose, to) : facing };
      } else if (walkTarget) {
        const dx = walkTarget.x - pose.x;
        const dz = walkTarget.z - pose.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.05) walkTarget = null;
        else {
          const step = Math.min(distance, WALK_SPEED * dt);
          const to = { x: pose.x + (dx / distance) * step, z: pose.z + (dz / distance) * step };
          const moved = stepTo(pose, to);
          if (moved.x === pose.x && moved.z === pose.z) walkTarget = null;
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
      if (live.current.view === "eyes" && pose) {
        const eye = pose.seat === "floor" ? EYE_FLOOR : pose.seat ? EYE_SEATED : EYE_STANDING;
        const yaw = pose.facing;
        const pitch = look.pitch;
        camera.position.set(pose.x, eye, pose.z);
        target.set(pose.x + Math.sin(yaw) * Math.cos(pitch), eye + Math.sin(pitch), pose.z - Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(target);
        setFov(eyeFov);
        return;
      }
      // Overhead follows you around the room, so it feels like your corner of it.
      const centre = pose ? new THREE.Vector3(pose.x * 0.7, 0.5, pose.z * 0.7 - 0.6) : new THREE.Vector3(0, 0.5, -0.8);
      const yaw = orbit.yaw;
      camera.position.set(
        centre.x + Math.sin(yaw) * Math.cos(orbit.pitch) * orbit.distance,
        centre.y + Math.sin(orbit.pitch) * orbit.distance,
        centre.z + Math.cos(yaw) * Math.cos(orbit.pitch) * orbit.distance,
      );
      camera.lookAt(centre);
      setFov(OVERHEAD_FOV);
    };

    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = clock.elapsedTime;
      walk(dt);
      syncBodies();
      syncTv();
      syncMusicTv();
      parts.update(t, dt);
      const hop = parts.shark.userData.hop as number | undefined;
      const since = hop ? (performance.now() - hop) / 1000 : 1;
      parts.shark.position.y = 0.68 + (since < 0.5 ? Math.sin(since * Math.PI * 2) * 0.12 : 0);
      parts.shark.rotation.z = Math.sin(t * 0.8) * 0.03;
      // Beams and pendant only show from inside; overhead they would hide the room.
      parts.ceiling.visible = live.current.view === "eyes";
      placeCamera();
      const me = myPose();
      if (me) ambience.current?.setListener(me, me.seat === "floor" ? EYE_FLOOR : me.seat ? EYE_SEATED : EYE_STANDING);
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
      parts.dispose();
      renderer.dispose();
      // Browsers cap live WebGL contexts; give this one back now, not at GC.
      renderer.forceContextLoss();
      mount.removeChild(canvas);
    };
  }, [theme]);

  const me = connectionId ? room.poses.get(connectionId) : null;
  const seatName = me?.seat ? seatById(me.seat)?.label : null;
  const tvShowing = screens[0]?.name ?? (nowPlaying?.track ? `♫ ${nowPlaying.track.title}` : null);

  return (
    <div ref={shellRef} className={`living-room living-room-${theme}`} role="region" aria-label="Living room">
      <style>{LIVING_ROOM_CSS}</style>
      <div ref={mountRef} className="living-room-canvas" />
      {controlsHidden && (
        <button type="button" className="living-room-reveal" onClick={() => setControlsHidden(false)} title="Show controls (H)" aria-label="Show controls"><Eye size={16} /></button>
      )}
      {!controlsHidden && <div className="living-room-top">
        <div className="living-room-title">
          <Armchair size={16} />
          <span>Living Room</span>
          {seatName ? <small>· on the {seatName.toLowerCase()}</small> : me?.seat === "floor" ? <small>· on the floor</small> : null}
          {tvShowing && <small>· TV: {tvShowing}</small>}
        </div>
        <div className="living-room-tools">
          <button type="button" className={view === "overhead" ? "active" : ""} onClick={() => setView("overhead")} title="Overhead view" aria-label="Overhead view"><MapIcon size={16} /></button>
          <button type="button" className={view === "eyes" ? "active" : ""} onClick={() => setView("eyes")} title="Through your eyes" aria-label="First-person view"><Eye size={16} /></button>
          <button type="button" className={room.settings.ambience ? "active" : ""} onClick={() => room.setSettings({ ambience: !room.settings.ambience })} title="Room sounds (only you hear them)" aria-label="Room sounds" aria-pressed={room.settings.ambience}><Flame size={16} /></button>
          <button type="button" className={settingsOpen ? "active" : ""} onClick={() => setSettingsOpen((open) => !open)} title="Living Room settings" aria-label="Living Room settings" aria-expanded={settingsOpen}><Settings2 size={16} /></button>
          <button type="button" onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Full screen"} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
          <button type="button" onClick={() => { setControlsHidden(true); setSettingsOpen(false); }} title="Hide controls (H)" aria-label="Hide controls"><EyeOff size={16} /></button>
        </div>
      </div>}
      {hint && !settingsOpen && !controlsHidden && (
        <div className="living-room-hint" onClick={() => setHint(null)}>{hint}</div>
      )}
      {settingsOpen && !controlsHidden && (
        <div className="living-room-settings" role="dialog" aria-label="Living Room settings">
          <label className="living-room-switch">
            <span><strong>Spatial voices</strong><small>Hear people from where they are in the room. Off: everyone sounds like a normal call.</small></span>
            <input type="checkbox" checked={room.settings.spatial} onChange={(event) => room.setSettings({ spatial: event.target.checked })} />
          </label>
          <label className="living-room-switch">
            <span><strong>Music from the TV</strong><small>The music bot plays from the TV over the fireplace.</small></span>
            <input type="checkbox" checked={room.settings.tvMusic} onChange={(event) => room.setSettings({ tvMusic: event.target.checked })} />
          </label>
          <label className="living-room-switch">
            <span><strong>Room sounds</strong><small>Recorded fire, rain, wind or city, depending on the theme. Only you hear them.</small></span>
            <input type="checkbox" checked={room.settings.ambience} onChange={(event) => room.setSettings({ ambience: event.target.checked })} />
          </label>
          <label className="living-room-slider">
            <span>Room sound volume</span>
            <input type="range" min={0} max={1} step={0.01} value={room.settings.ambienceVolume} disabled={!room.settings.ambience}
              onChange={(event) => room.setSettings({ ambienceVolume: Number(event.target.value) })} />
          </label>
        </div>
      )}
      {!controlsHidden && <div className="living-room-emotes" role="toolbar" aria-label="Emotes">
        {LOUNGE_EMOTES.map((emoji) => (
          <button key={emoji} type="button" onClick={() => room.emote(emoji)} aria-label={`Emote ${emoji}`}>{emoji}</button>
        ))}
        {me && (me.seat && me.seat !== "floor" ? (
          <button type="button" className="living-room-stand" onClick={() => room.move({ ...stepTo(me, { x: me.x + Math.sin(me.facing) * 0.6, z: me.z - Math.cos(me.facing) * 0.6 }), facing: me.facing })}>Stand up</button>
        ) : (
          <button type="button" className="living-room-stand" onClick={room.toggleFloor} title="Sit right here, on the floor (X)">{me.seat === "floor" ? "Stand up" : "Sit here"}</button>
        ))}
      </div>}
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
.living-room-title, .living-room-tools { pointer-events: auto; display: flex; align-items: center; gap: 6px; background: var(--lr-panel); backdrop-filter: blur(8px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 999px; padding: 6px 12px; font-size: 14px; font-weight: 600; }
.living-room-title small { font-weight: 400; opacity: 0.75; }
.living-room-tools { padding: 4px; }
.living-room-tools button { display: inline-flex; align-items: center; gap: 4px; min-width: 32px; height: 32px; justify-content: center; padding: 0 8px; border-radius: 999px; color: inherit; background: transparent; font-size: 12px; font-weight: 600; }
.living-room-tools button:hover { background: rgba(255, 220, 170, 0.12); }
.living-room-tools button.active { background: var(--lr-accent); color: #1b1530; }
.living-room-hint { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 32px); background: var(--lr-panel); color: var(--lr-ink); padding: 6px 14px; border-radius: 12px; font-size: 13px; cursor: pointer; text-align: center; }
.living-room-reveal { position: absolute; top: 10px; right: 10px; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 999px; background: var(--lr-panel); color: var(--lr-ink); border: 1px solid var(--lr-edge); opacity: 0.55; transition: opacity 0.15s; }
.living-room-reveal:hover { opacity: 1; }
.living-room-settings { position: absolute; top: 58px; right: 10px; width: min(320px, calc(100% - 20px)); display: grid; gap: 10px; padding: 12px 14px; background: var(--lr-panel); backdrop-filter: blur(10px); color: var(--lr-ink); border: 1px solid var(--lr-edge); border-radius: 14px; font-size: 13px; z-index: 2; }
.living-room-switch { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; cursor: pointer; }
.living-room-switch span { display: grid; gap: 2px; }
.living-room-switch small { opacity: 0.7; line-height: 1.35; }
.living-room-switch input { margin-top: 2px; width: 18px; height: 18px; accent-color: var(--lr-accent); flex: none; }
.living-room-slider { display: grid; gap: 6px; }
.living-room-slider input { width: 100%; accent-color: var(--lr-accent); }
.living-room-emotes { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); display: flex; gap: 4px; align-items: center; background: var(--lr-panel); backdrop-filter: blur(8px); border: 1px solid var(--lr-edge); border-radius: 999px; padding: 4px 6px; max-width: calc(100% - 32px); overflow-x: auto; }
.living-room-emotes button { font-size: 20px; width: 36px; height: 36px; border-radius: 999px; transition: transform 0.12s; flex: none; }
.living-room-emotes button:hover { transform: scale(1.2); background: rgba(255, 220, 170, 0.12); }
.living-room-emotes .living-room-stand { font-size: 12px; width: auto; padding: 0 12px; color: var(--lr-ink); font-weight: 600; }
.living-room-emotes .living-room-stand:hover { transform: none; }
`;
