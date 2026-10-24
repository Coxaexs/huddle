/**
 * The club: a stage with the DJ's decks in front of an LED wall, an LED dance
 * floor, moving heads on a truss, lasers, a disco ball, booths and a bar.
 *
 * Every light plays the music (app/lib/club-lights.ts): the floor ripples out
 * on the kick, the beams sweep on the bar and open up on the drop, the lasers
 * ride the hats, the wall shows the stems, and a build fills the room until
 * it drops, with confetti and CO2. With nothing playing the room idles, slow
 * and dim, waiting for someone to start the night.
 *
 * Built to be cheap: the floor's tiles, the lasers and the confetti are each
 * one instanced draw; the beams are additive cones with a glow where they hit
 * the floor rather than real volumetrics; a handful of real lights wash the
 * floor and the crowd, none with shadows.
 */
import "../lib/canvas-polyfill";
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { CLUB, CLUB_BAR, CLUB_DANCE_FLOOR, CLUB_DECKS, CLUB_DJ_SEAT, CLUB_HALF_X, CLUB_HALF_Z, CLUB_STAGE } from "../lib/living-room";
import type { ClubShow } from "../lib/club-lights";
import { LOOKS, box, canvasTexture, cushion, glowTexture, mat, tagSeat, type BuiltRoom } from "./living-room-scene";
import { mergeStatics } from "./living-room-fx";
import { dress, fabric } from "./room-surfaces";

/** What the room's lights are told each frame, and who and what is on. */
export interface ClubRig {
  /** This frame's show (from ClubLights.sample). */
  show: (show: ClubShow) => void;
  /** Where people stand: the floor lights up under their feet. */
  people: (spots: Array<{ x: number; z: number }>) => void;
  /** Who has the decks (null: nobody, the resident DJ plays). */
  dj: (name: string | null) => void;
  /** What is playing, for the wall. */
  track: (title: string | null, artist: string | null) => void;
  /** Less motion: slower beams, no flashing at all. */
  calm: (on: boolean) => void;
}

/** Each theme's palette: the colours the lights cycle through, and the bar's sign. */
const PALETTES: Record<RoomTheme, { colours: string[]; walls: string; floor: string; sign: string; signColour: string }> = {
  cozy: { colours: ["#ff3b6b", "#ff9a3c", "#ffe14d", "#3cff8f", "#3cc8ff", "#7a5cff", "#ff4fd8"], walls: "#141019", floor: "#0b0a0e", sign: "hoffle", signColour: "#ffb35c" },
  vampire: { colours: ["#ff1e3c", "#b0003a", "#ff5a7a", "#7a0030", "#ff2a00"], walls: "#170609", floor: "#0b0405", sign: "nosferatu", signColour: "#ff1e3c" },
  matrix: { colours: ["#00ff66", "#39ff14", "#00cc55", "#b9ffcf"], walls: "#020a04", floor: "#010402", sign: "the construct", signColour: "#00ff66" },
  cyberpunk: { colours: ["#ff2fb4", "#00f0ff", "#7a5cff", "#ff2fb4", "#00ffa3"], walls: "#0c0619", floor: "#06030c", sign: "night city", signColour: "#ff2fb4" },
  academia: { colours: ["#c9a45c", "#ff9a3c", "#3c8f5a", "#9b2d3a", "#e8d39a"], walls: "#12150f", floor: "#0b0c09", sign: "the stacks", signColour: "#e8c27a" },
  minecraft: { colours: ["#55ff55", "#55ffff", "#ff55ff", "#ffff55", "#ff5555"], walls: "#18130c", floor: "#0e0b07", sign: "redstone", signColour: "#ff5555" },
  y2k: { colours: ["#ff7ad9", "#7ad9ff", "#b9ccff", "#fffd7a", "#7affb4"], walls: "#0d1638", floor: "#070b1d", sign: "y2k", signColour: "#7ad9ff" },
  zombie: { colours: ["#9ad53b", "#d5c53b", "#53d53b", "#c8ff00"], walls: "#0d110a", floor: "#070906", sign: "last call", signColour: "#9ad53b" },
  galaxy: { colours: ["#ffe81f", "#4fa3ff", "#ff3b3b", "#38ff7a", "#b15cff"], walls: "#070912", floor: "#030409", sign: "cantina", signColour: "#4fa3ff" },
};

const STAGE_Y = CLUB_STAGE.height;
const TRUSS_Y = 5.35;
const BALL = new THREE.Vector3(0, 4.9, -0.9);
const WALL = { x0: -6, x1: 6, y0: 1.1, y1: 5.5, z: -CLUB_HALF_Z + 0.1 };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The LED wall: five stems, rings, a tunnel and the vocal's line, on an LED grid. */
const WALL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const WALL_FRAGMENT = /* glsl */ `
uniform float uTime, uKick, uSnare, uBass, uVocals, uMelody, uLevel, uPhase, uBar, uBuild, uFlash, uLive, uDrop;
uniform vec4 uWeights;
uniform vec3 uColA, uColB, uColC;
uniform sampler2D uText;
varying vec2 vUv;
const vec2 GRID = vec2(192.0, 70.0);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 cell = floor(vUv * GRID);
  vec2 local = fract(vUv * GRID) - 0.5;
  // From afar the dots are smaller than a pixel: blend them to their average instead of shimmering.
  float across = fwidth(vUv.x * GRID.x) + fwidth(vUv.y * GRID.y);
  float led = mix(smoothstep(0.52, 0.3, length(local)), 0.42, smoothstep(0.3, 1.0, across));
  vec2 p = (cell + 0.5) / GRID;
  vec2 c = (p - 0.5) * vec2(GRID.x / GRID.y, 1.0);
  float r = length(c);
  float a = atan(c.y, c.x);
  // Bars: the kick in the middle, then the bass, the vocal, the melody and the hats out to the edges.
  float x = abs(p.x - 0.5) * 2.0;
  float band = floor(x * 10.0);
  float k = band < 2.0 ? uKick : band < 4.0 ? uBass : band < 6.0 ? uVocals : band < 8.0 ? uMelody : uSnare;
  float h = abs(p.y - 0.5) * 2.0;
  float bars = step(h, k * 0.95 + 0.02) * step(0.14, fract(x * 10.0));
  vec3 colBars = mix(uColA, uColB, h) * bars;
  // Rings: one goes out from the middle on every kick; the vocal fills the centre.
  float ring = smoothstep(0.09, 0.0, abs(r - (1.0 - uKick) * 1.5)) * (0.3 + uKick);
  float core = smoothstep(0.55 * uVocals + 0.05, 0.0, r) * uVocals;
  vec3 colRings = uColA * ring * 1.5 + uColC * core * 1.2;
  // Tunnel: spokes turning with the bar.
  float spokes = smoothstep(0.55, 1.0, sin(a * 8.0 + uBar * 6.2832 + 2.0 / (r + 0.15)));
  vec3 colTunnel = mix(uColB, uColA, uPhase) * spokes * (0.25 + uLevel) * smoothstep(0.0, 0.3, r);
  // Wave: the vocal and the melody as two lines.
  float w1 = smoothstep(0.04, 0.0, abs(c.y - sin(c.x * 3.0 + uTime * 2.0) * 0.34 * (0.15 + uVocals)));
  float w2 = smoothstep(0.03, 0.0, abs(c.y - sin(c.x * 5.0 - uTime * 3.0) * 0.26 * (0.1 + uMelody)));
  vec3 colWave = uColC * w1 * 1.4 + uColB * w2;
  vec3 col = colBars * uWeights.x + colRings * uWeights.y + colTunnel * uWeights.z + colWave * uWeights.w;
  // A build fills the wall from the bottom, blinking faster towards the drop.
  col += uColA * step(p.y, uBuild) * (0.4 + 0.6 * step(0.5, fract(uTime * (2.0 + uBuild * 14.0)))) * uBuild;
  // Nothing on: a slow plasma.
  vec3 idle = 0.16 * (0.5 + 0.5 * sin(vec3(0.0, 2.1, 4.2) + c.x * 2.0 + uTime * 0.4 + sin(c.y * 3.0 + uTime * 0.3)));
  col = mix(idle, col, uLive);
  // Glitter on the hats after a drop.
  col += uColC * step(0.985 - 0.06 * uSnare, hash(cell + floor(uTime * 12.0))) * uDrop * 1.5;
  col += vec3(uFlash * 1.6);
  vec4 text = texture2D(uText, p);
  col = mix(col, text.rgb * 1.7, text.a);
  gl_FragColor = vec4(col * led * 1.9 + col * 0.05, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** A soft vertical gradient for the beams: bright at the lens, nothing at the far end. */
function beamTexture() {
  const texture = canvasTexture(32, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 256);
  });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A laser's cross-section: a hot core with a little bloom either side. */
function laserTexture() {
  const texture = canvasTexture(64, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.42, "rgba(255,255,255,0.35)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(0.58, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 4);
  });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Soft smoke, for the haze and the CO2. */
function smokeTexture(seed = 3) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const x = 60 + rand() * 136;
      const y = 60 + rand() * 136;
      const r = 30 + rand() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.08 + rand() * 0.1})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
  });
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function buildClub(theme: RoomTheme): BuiltRoom & { club: ClubRig } {
  const look = LOOKS[theme];
  const palette = PALETTES[theme];
  const colours = palette.colours.map((c) => new THREE.Color(c));
  /** The palette at h (0..1, wrapping), blended between its colours. */
  const paint = (h: number, out = new THREE.Color()) => {
    const n = colours.length;
    const at = (((h % 1) + 1) % 1) * n;
    const i = Math.floor(at);
    return out.copy(colours[i % n]).lerp(colours[(i + 1) % n], at - i);
  };
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const W = CLUB_HALF_X * 2;
  const D = CLUB_HALF_Z * 2;
  const H = CLUB.height;
  const glow = glowTexture();
  const disposables: Array<{ dispose: () => void }> = [glow];
  const track = <T extends { dispose: () => void }>(thing: T) => { disposables.push(thing); return thing; };
  const noPick = (object: THREE.Object3D) => { object.raycast = () => undefined; return object; };

  // ---- the room ----
  const concrete = dress(mat(palette.floor, 0.38, { metalness: 0.25 }), "stone", { repeat: [W / 3, D / 3], bump: 0.4 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), concrete);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);
  const wallMaterial = dress(mat(palette.walls, 0.9), "plaster", { repeat: [6, 2], bump: 0.5, detail: false });
  for (const [width, x, z, ry] of [[W, 0, -CLUB_HALF_Z, 0], [W, 0, CLUB_HALF_Z, Math.PI], [D, -CLUB_HALF_X, 0, Math.PI / 2], [D, CLUB_HALF_X, 0, -Math.PI / 2]] as const) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    root.add(wall);
  }
  // Acoustic foam on the side walls: dark wedges that catch the beams' spill.
  const foam = fabric(new THREE.Color(palette.walls).multiplyScalar(1.6).getStyle(), { repeat: [1, 1], sheen: 0.2 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      for (let row = 0; row < 2; row++) {
        const panel = box(0.08, 1.1, 1.1, foam, false);
        panel.position.set(side * (CLUB_HALF_X - 0.05), 3.2 + row * 1.3, -4.4 + i * 1.75);
        root.add(panel);
      }
    }
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat("#050407", 1));
  roof.rotation.x = Math.PI / 2;
  roof.position.y = H;
  ceiling.add(roof);

  // ---- the stage, the decks, the LED wall ----
  const stageMaterial = mat("#121117", 0.55, { metalness: 0.4 });
  const stage = box(CLUB_STAGE.x1 - CLUB_STAGE.x0, STAGE_Y, CLUB_STAGE.z1 - CLUB_STAGE.z0, stageMaterial, false);
  stage.position.set(0, STAGE_Y / 2, (CLUB_STAGE.z0 + CLUB_STAGE.z1) / 2);
  root.add(stage);
  const stageEdge = new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(CLUB_STAGE.x1 - CLUB_STAGE.x0, 0.05, 0.03), stageEdge);
  edge.position.set(0, STAGE_Y - 0.06, CLUB_STAGE.z1 + 0.02);
  root.add(edge);
  for (const side of [-1, 1]) {
    const step = box(1.1, 0.4, 0.5, stageMaterial, false);
    step.position.set(side * (CLUB_STAGE.x1 - 0.7), 0.2, CLUB_STAGE.z1 + 0.25);
    root.add(step);
  }

  // The LED wall (and, over it, the screen a share or a film plays on: VJ mode).
  const textCanvas = document.createElement("canvas");
  textCanvas.width = 1024;
  textCanvas.height = 376;
  const textTexture = track(new THREE.CanvasTexture(textCanvas));
  textTexture.colorSpace = THREE.SRGBColorSpace;
  const wallUniforms = {
    uTime: { value: 0 }, uKick: { value: 0 }, uSnare: { value: 0 }, uBass: { value: 0 }, uVocals: { value: 0 }, uMelody: { value: 0 }, uLevel: { value: 0 },
    uPhase: { value: 0 }, uBar: { value: 0 }, uBuild: { value: 0 }, uFlash: { value: 0 }, uLive: { value: 0 }, uDrop: { value: 0 },
    uWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
    uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() },
    uText: { value: textTexture },
  };
  const ledWallMaterial = track(new THREE.ShaderMaterial({ uniforms: wallUniforms, vertexShader: WALL_VERTEX, fragmentShader: WALL_FRAGMENT, toneMapped: false }));
  const ledWall = new THREE.Mesh(new THREE.PlaneGeometry(WALL.x1 - WALL.x0, WALL.y1 - WALL.y0), ledWallMaterial);
  ledWall.position.set(0, (WALL.y0 + WALL.y1) / 2, WALL.z);
  ledWall.userData.animated = true;
  root.add(ledWall);
  const frame = box(WALL.x1 - WALL.x0 + 0.3, WALL.y1 - WALL.y0 + 0.3, 0.08, mat("#0a0a0d", 0.5, { metalness: 0.6 }), false);
  frame.position.set(0, (WALL.y0 + WALL.y1) / 2, -CLUB_HALF_Z + 0.01);   // its face 5 cm behind the LEDs
  root.add(frame);
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), screenMaterial);
  screen.position.set(0, 3.35, WALL.z + 0.04);
  screen.visible = false;
  screen.userData.animated = true;
  root.add(screen);

  // The decks: a booth with two turntables and a mixer; taking them makes you the DJ.
  const booth = new THREE.Group();
  booth.position.set(CLUB_DECKS.x, STAGE_Y, CLUB_DECKS.z);
  const boothBody = box(CLUB_DECKS.width, 1.0, CLUB_DECKS.depth, mat("#16151c", 0.5, { metalness: 0.5 }));
  boothBody.position.y = 0.5;
  booth.add(boothBody);
  const panelCanvas = document.createElement("canvas");
  panelCanvas.width = 512;
  panelCanvas.height = 128;
  const panelTexture = track(new THREE.CanvasTexture(panelCanvas));
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  const panelMaterial = new THREE.MeshBasicMaterial({ map: panelTexture, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(CLUB_DECKS.width - 0.1, 0.62), panelMaterial);
  panel.position.set(0, 0.52, CLUB_DECKS.depth / 2 + 0.005);
  panel.userData.animated = true;
  booth.add(panel);
  const top = box(CLUB_DECKS.width + 0.06, 0.04, CLUB_DECKS.depth + 0.06, mat("#0d0d10", 0.35, { metalness: 0.7 }));
  top.position.y = 1.02;
  booth.add(top);
  const platters: THREE.Mesh[] = [];
  const jogRings: THREE.MeshBasicMaterial[] = [];
  for (const side of [-1, 1]) {
    const deck = box(0.82, 0.08, 0.6, mat("#2a2a30", 0.4, { metalness: 0.6 }));
    deck.position.set(side * 0.78, 1.08, 0);
    booth.add(deck);
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 40), mat("#111", 0.3, { metalness: 0.3 }));
    platter.position.set(side * 0.78, 1.135, 0);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.027, 24), mat(palette.colours[side < 0 ? 0 : 1], 0.5));
    label.position.y = 0.001;
    const groove = box(0.2, 0.028, 0.012, mat("#3a3a40", 0.6), false);
    groove.position.set(0.12, 0.001, 0);
    platter.add(label, groove);
    platter.userData.animated = true;
    booth.add(platter);
    platters.push(platter);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.008, 6, 48), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(side * 0.78, 1.13, 0);
    ring.userData.animated = true;
    booth.add(ring);
    jogRings.push(ringMaterial);
  }
  const mixer = box(0.5, 0.1, 0.55, mat("#202026", 0.4, { metalness: 0.6 }));
  mixer.position.set(0, 1.09, 0);
  booth.add(mixer);
  const knobs: THREE.MeshBasicMaterial[] = [];
  for (let row = 0; row < 3; row++) {
    for (const col of [-1, 1]) {
      const knobMaterial = new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false });
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), knobMaterial);
      knob.position.set(col * 0.11, 1.15, -0.16 + row * 0.12);
      knob.userData.animated = true;
      booth.add(knob);
      knobs.push(knobMaterial);
    }
  }
  // A big invisible box over the booth: clicking anywhere on the decks takes them.
  const takeDecks = new THREE.Mesh(new THREE.BoxGeometry(CLUB_DECKS.width + 0.4, 1.6, CLUB_DECKS.depth + 1.2), new THREE.MeshBasicMaterial({ visible: false }));
  takeDecks.position.set(0, 0.8, -0.35);
  booth.add(takeDecks);
  tagSeat(booth, CLUB_DJ_SEAT);
  root.add(booth);

  // Speaker stacks either side of the stage: two tops over a sub, cones that pump.
  const cones: Array<{ mesh: THREE.Object3D; sub: boolean }> = [];
  for (const side of [-1, 1]) {
    const stack = new THREE.Group();
    stack.position.set(side * 8.0, 0, -6.8);
    const cabinet = mat("#0e0e11", 0.7);
    const sub = box(1.5, 1.2, 1.0, cabinet);
    sub.position.y = 0.6;
    const top1 = box(1.3, 0.9, 0.9, cabinet);
    top1.position.y = 1.65;
    const top2 = box(1.3, 0.9, 0.9, cabinet);
    top2.position.y = 2.6;
    stack.add(sub, top1, top2);
    const coneMaterial = mat("#1c1c22", 0.6);
    for (const [y, r, isSub] of [[0.6, 0.42, true], [1.65, 0.28, false], [2.6, 0.28, false]] as const) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 0.12, 28, 1, true), coneMaterial);
      cone.rotation.x = -Math.PI / 2;     // the point into the cabinet
      cone.position.set(0, y, isSub ? 0.5 : 0.45);
      cone.userData.animated = true;
      stack.add(cone);
      cones.push({ mesh: cone, sub: isSub });
    }
    root.add(stack);
  }

  // ---- the dance floor ----
  const f = CLUB_DANCE_FLOOR;
  const cols = Math.round((f.x1 - f.x0) / f.tile);
  const rows = Math.round((f.z1 - f.z0) / f.tile);
  const tileAt = (i: number) => ({ x: f.x0 + f.tile * ((i % cols) + 0.5), z: f.z0 + f.tile * (Math.floor(i / cols) + 0.5) });
  const base = box(cols * f.tile + 0.1, 0.03, rows * f.tile + 0.1, mat("#1b1b20", 0.35, { metalness: 0.7 }), false);
  base.position.set((f.x0 + f.x1) / 2, 0.015, (f.z0 + f.z1) / 2);
  base.userData.floor = true;
  root.add(base);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(f.tile - 0.05, 0.03, f.tile - 0.05), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), cols * rows);
  const place = new THREE.Matrix4();
  for (let i = 0; i < cols * rows; i++) {
    const { x, z } = tileAt(i);
    place.makeTranslation(x, 0.03, z);
    tiles.setMatrixAt(i, place);
    tiles.setColorAt(i, new THREE.Color(0, 0, 0));
  }
  tiles.userData.floor = true;
  tiles.computeBoundingSphere();
  root.add(tiles);

  // ---- the truss and its moving heads ----
  // The rig stays in view from overhead too (only the roof hides): the beams need somewhere to come from.
  const metal = mat("#9a9ca6", 0.35, { metalness: 0.6 });
  const trussZ = [-4.9, 2.4];
  const truss = box(13.4, 0.18, 0.18, metal, false);
  truss.position.set(0, TRUSS_Y + 0.12, trussZ[0]);
  root.add(truss);
  for (const x of [-6.6, 6.6]) {
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, H - TRUSS_Y - 0.2, 6), metal);
    hanger.position.set(x, (H + TRUSS_Y + 0.2) / 2, trussZ[0]);
    root.add(hanger);
  }
  const beamMap = track(beamTexture());
  const beamGeometry = track(new THREE.ConeGeometry(0.5, 1, 24, 1, true));
  beamGeometry.translate(0, -0.5, 0);   // apex at the lens, opening downwards
  interface Head { at: THREE.Vector3; home: number; front: boolean; side: number; head: THREE.Object3D; beam: THREE.Mesh; beamMaterial: THREE.MeshBasicMaterial; lens: THREE.MeshBasicMaterial; spot: THREE.Mesh; spotMaterial: THREE.MeshBasicMaterial; dir: THREE.Vector3 }
  const heads: Head[] = [];
  const fixtures = [
    ...[-5, -3, -1, 1, 3, 5].map((x) => ({ x, z: trussZ[0], home: 0, front: true })),
    ...[-4.5, -1.5, 1.5, 4.5].map((x) => ({ x, z: trussZ[1], home: Math.PI, front: false })),
  ];
  const down = new THREE.Vector3(0, -1, 0);
  for (const fixture of fixtures) {
    const at = new THREE.Vector3(fixture.x, TRUSS_Y - 0.35, fixture.z);
    // The back row hangs over the floor from the roof on rods: from overhead it would hang in front of
    // everything, so it hides with the roof (its beams stay).
    const mount = fixture.front ? root : ceiling;
    const yoke = box(0.22, 0.3, 0.12, mat("#18181c", 0.5, { metalness: 0.5 }), false);
    yoke.position.set(at.x, TRUSS_Y - 0.08, at.z);
    mount.add(yoke);
    if (!fixture.front) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, H - TRUSS_Y + 0.05, 6), metal);
      rod.position.set(at.x, (H + TRUSS_Y) / 2, at.z);
      mount.add(rod);
    }
    const head = new THREE.Group();
    head.position.copy(at);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.32, 16), mat("#1d1d22", 0.45, { metalness: 0.5 }));
    body.position.y = 0.06;
    const lens = new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false });
    const lensMesh = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), lens);
    lensMesh.rotation.x = Math.PI / 2;
    lensMesh.position.y = -0.105;
    head.add(body, lensMesh);
    head.userData.animated = true;
    mount.add(head);
    const beamMaterial = new THREE.MeshBasicMaterial({ map: beamMap, color: "#000000", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.copy(at);
    beam.renderOrder = 3;
    beam.userData.animated = true;
    noPick(beam);
    root.add(beam);
    const spotMaterial = new THREE.MeshBasicMaterial({ map: glow, color: "#000000", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), spotMaterial);
    spot.rotation.x = -Math.PI / 2;
    spot.renderOrder = 2;
    spot.userData.animated = true;
    noPick(spot);
    root.add(spot);
    heads.push({ at, home: fixture.home, front: fixture.front, side: Math.sign(fixture.x), head, beam, beamMaterial, lens, spot, spotMaterial, dir: new THREE.Vector3(0, -1, 0) });
  }

  // ---- lasers: two fans from the stage's front corners, over the crowd's heads ----
  const LASER_BEAMS = 9;
  const laserOrigins = [new THREE.Vector3(-4.6, STAGE_Y + 0.25, CLUB_STAGE.z1 - 0.15), new THREE.Vector3(4.6, STAGE_Y + 0.25, CLUB_STAGE.z1 - 0.15)];
  const laserGeometry = track(new THREE.PlaneGeometry(0.05, 1));
  laserGeometry.translate(0, 0.5, 0);
  const laserMaterial = new THREE.MeshBasicMaterial({ map: track(laserTexture()), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const lasers = new THREE.InstancedMesh(laserGeometry, laserMaterial, laserOrigins.length * LASER_BEAMS * 2);
  lasers.frustumCulled = false;
  lasers.renderOrder = 4;
  lasers.userData.animated = true;
  noPick(lasers);
  for (let i = 0; i < lasers.count; i++) lasers.setColorAt(i, new THREE.Color(0, 0, 0));
  root.add(lasers);
  for (const origin of laserOrigins) {
    const emitter = box(0.3, 0.16, 0.24, mat("#141418", 0.5, { metalness: 0.5 }), false);
    emitter.position.copy(origin).add(new THREE.Vector3(0, -0.1, -0.1));
    root.add(emitter);
  }

  // ---- the disco ball, and its specks on the walls ----
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), mat("#e4e4ec", 0.1, { metalness: 0.9, flatShading: true, emissive: "#1a1a22" }));
  ball.position.copy(BALL);
  ball.userData.animated = true;
  root.add(ball);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H - BALL.y - 0.42, 4), metal);
  wire.position.set(BALL.x, (H + BALL.y + 0.42) / 2, BALL.z);
  root.add(wire);
  // Its pin spot: one narrow white light that makes every mirror on it flash.
  const pin = new THREE.SpotLight("#ffffff", 40, 9, 0.1, 0.3, 1.2);
  pin.position.set(2.6, H - 0.2, 2.2);
  pin.target.position.copy(BALL);
  root.add(pin, pin.target);
  const SPECKS = 280;
  const speckDirs: THREE.Vector3[] = [];
  for (let i = 0; i < SPECKS; i++) {
    // A spiral over the sphere, every direction once.
    const y = 1 - (2 * (i + 0.5)) / SPECKS;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.399963;
    speckDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const speckPositions = new Float32Array(SPECKS * 3);
  const speckGeometry = track(new THREE.BufferGeometry());
  speckGeometry.setAttribute("position", new THREE.BufferAttribute(speckPositions, 3));
  const speckMaterial = new THREE.PointsMaterial({ map: glow, size: 0.16, color: "#000000", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const specks = new THREE.Points(speckGeometry, speckMaterial);
  specks.frustumCulled = false;
  specks.userData.animated = true;
  noPick(specks);
  root.add(specks);

  // ---- confetti and CO2, for the drops ----
  const CONFETTI = 240;
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.035, 0.055), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, toneMapped: false }), CONFETTI);
  confetti.frustumCulled = false;
  confetti.userData.animated = true;
  noPick(confetti);
  const bits = Array.from({ length: CONFETTI }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), r: new THREE.Euler(), life: 0 }));
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CONFETTI; i++) { confetti.setMatrixAt(i, hidden); confetti.setColorAt(i, new THREE.Color(1, 1, 1)); }
  root.add(confetti);
  const PUFFS = 80;
  const puffPositions = new Float32Array(PUFFS * 3);
  const puffColours = new Float32Array(PUFFS * 3);
  const puffGeometry = track(new THREE.BufferGeometry());
  puffGeometry.setAttribute("position", new THREE.BufferAttribute(puffPositions, 3));
  puffGeometry.setAttribute("color", new THREE.BufferAttribute(puffColours, 3));
  const smoke = track(smokeTexture());
  const puffs = new THREE.Points(puffGeometry, new THREE.PointsMaterial({ map: smoke, size: 1.4, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  puffs.frustumCulled = false;
  puffs.userData.animated = true;
  noPick(puffs);
  const puffState = Array.from({ length: PUFFS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
  root.add(puffs);
  const nozzles = [-2.6, 2.6].map((x) => new THREE.Vector3(x, STAGE_Y + 0.1, CLUB_STAGE.z1 - 0.2));
  for (const nozzle of nozzles) {
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.25, 10), metal);
    jet.position.copy(nozzle).add(new THREE.Vector3(0, -0.05, 0));
    root.add(jet);
  }

  // ---- haze: a few big soft clouds catching the light ----
  const hazeMaterial = new THREE.SpriteMaterial({ map: smoke, color: "#000000", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const haze: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Sprite(hazeMaterial);
    cloud.scale.set(9, 5, 1);
    cloud.position.set(-6 + (i % 3) * 6, 2.2 + Math.floor(i / 3) * 1.6, -3 + (i % 2) * 4);
    cloud.userData.drift = i * 1.7;
    cloud.userData.animated = true;
    noPick(cloud);
    root.add(cloud);
    haze.push(cloud);
  }

  // ---- neon on the walls ----
  const tubes: Array<{ material: THREE.MeshBasicMaterial; side: number; index: number }> = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const material = new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false });
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8), material);
      tube.position.set(side * (CLUB_HALF_X - 0.12), 3.75, -5.2 + i * 1.75 - 0.88);
      tube.userData.animated = true;
      root.add(tube);
      tubes.push({ material, side, index: i });
    }
  }

  // ---- the booths: sofas along the side walls, low tables, a candle each ----
  const leather = dress(mat("#1d1a22", 0.45), "leather", { repeat: [2, 1] });
  for (const seat of CLUB.seats) {
    if (!seat.id.startsWith("club-booth-") || !seat.id.endsWith("-1")) continue;
    const side = Math.sign(seat.x);
    const sofaGroup = new THREE.Group();
    sofaGroup.position.set(side * (CLUB_HALF_X - 0.55), 0, seat.z);
    const seatPart = cushion(0.8, 0.42, 2.4, leather, 0.08);
    seatPart.position.y = 0.21;
    const back = cushion(0.22, 0.65, 2.4, leather, 0.08);
    back.position.set(side * 0.35, 0.68, 0);
    sofaGroup.add(seatPart, back);
    const boothId = seat.id.replace(/-1$/, "");
    for (let i = 0; i < 3; i++) {
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.78), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, 0.45, (i - 1) * 0.75);
      tagSeat(hit, `${boothId}-${i}`);
      sofaGroup.add(hit);
    }
    root.add(sofaGroup);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), mat("#101014", 0.3, { metalness: 0.6 }));
    table.position.set(side * (CLUB_HALF_X - 1.75), 0.48, seat.z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.46, 12), metal);
    leg.position.set(side * (CLUB_HALF_X - 1.75), 0.23, seat.z);
    root.add(table, leg);
    const candle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffb35c", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    candle.scale.setScalar(0.5);
    candle.position.set(side * (CLUB_HALF_X - 1.75), 0.6, seat.z);
    noPick(candle);
    root.add(candle);
  }

  // ---- the bar ----
  const barTop = mat("#1a1416", 0.25, { metalness: 0.3 });
  const counter = box(CLUB_BAR.x1 - CLUB_BAR.x0, 1.1, CLUB_BAR.z1 - CLUB_BAR.z0, mat("#120f12", 0.6));
  counter.position.set(0, 0.55, (CLUB_BAR.z0 + CLUB_BAR.z1) / 2);
  const counterTop = box(CLUB_BAR.x1 - CLUB_BAR.x0 + 0.1, 0.05, CLUB_BAR.z1 - CLUB_BAR.z0 + 0.15, barTop);
  counterTop.position.set(0, 1.12, (CLUB_BAR.z0 + CLUB_BAR.z1) / 2 - 0.05);
  root.add(counter, counterTop);
  const underGlow = new THREE.MeshBasicMaterial({ color: "#000000", toneMapped: false });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(CLUB_BAR.x1 - CLUB_BAR.x0, 0.03, 0.03), underGlow);
  strip.position.set(0, 0.06, CLUB_BAR.z0 - 0.02);
  strip.userData.animated = true;
  root.add(strip);
  const shelf = box(8, 0.04, 0.3, mat("#2b2326", 0.5), false);
  for (const y of [1.5, 2.1]) {
    const s = shelf.clone();
    s.position.set(0, y, CLUB_HALF_Z - 0.2);
    root.add(s);
  }
  for (let i = 0; i < 26; i++) {
    const y = i % 2 ? 2.1 : 1.5;
    const colour = new THREE.Color(palette.colours[i % palette.colours.length]).multiplyScalar(0.5);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 10), new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.8, roughness: 0.15, transparent: true, opacity: 0.85 }));
    bottle.position.set(-3.8 + (i >> 1) * 0.63, y + 0.17, CLUB_HALF_Z - 0.2);
    root.add(bottle);
  }
  for (const seat of CLUB.seats) {
    if (!seat.id.startsWith("club-bar-")) continue;
    const stool = new THREE.Group();
    stool.position.set(seat.x, 0, seat.z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20), leather);
    cap.position.y = 0.76;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8), metal);
    post.position.y = 0.37;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 20), metal);
    foot.position.y = 0.015;
    stool.add(cap, post, foot);
    tagSeat(stool, seat.id);
    root.add(stool);
  }
  // The sign over the bar, in the theme's neon.
  const signTexture = track(canvasTexture(1024, 256, (ctx) => {
    ctx.clearRect(0, 0, 1024, 256);
    ctx.font = "italic 700 150px 'Pacifico', 'Brush Script MT', cursive, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = palette.signColour;
    ctx.shadowBlur = 30;
    ctx.fillStyle = palette.signColour;
    ctx.fillText(palette.sign, 512, 132, 980);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.65;
    ctx.fillText(palette.sign, 512, 132, 980);
  }));
  signTexture.colorSpace = THREE.SRGBColorSpace;
  const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), signMaterial);
  sign.position.set(0, 3.2, CLUB_HALF_Z - 0.08);
  sign.rotation.y = Math.PI;
  sign.userData.animated = true;
  root.add(sign);

  // ---- real light: little of it, all of it moving ----
  const hemi = new THREE.HemisphereLight(look.hemi[0], "#06050a", 0.18);
  root.add(hemi);
  const washes = [[-3.5, -2.5], [3.5, -2.5], [-3.5, 1.5], [3.5, 1.5]].map(([x, z], i) => {
    const light = new THREE.SpotLight("#ffffff", 0, 16, 0.55, 0.65, 1.4);
    light.position.set(x * 1.2, TRUSS_Y, i < 2 ? trussZ[0] : trussZ[1]);
    light.target.position.set(x, 0, z);
    root.add(light, light.target);
    return light;
  });
  const key = new THREE.SpotLight("#ffe9d0", 26, 12, 0.32, 0.6, 1.4);
  key.position.set(0, TRUSS_Y - 0.2, trussZ[0] + 0.3);
  key.target.position.set(0, STAGE_Y + 1.2, CLUB_DECKS.z - 0.6);
  root.add(key, key.target);
  const wallSpill = new THREE.PointLight("#ffffff", 0, 9, 1.6);
  wallSpill.position.set(0, 3.2, -6.4);
  const barLight = new THREE.PointLight("#ffb36b", 7, 7, 1.6);
  barLight.position.set(0, 2.6, CLUB_BAR.z0 - 0.4);
  const strobe = new THREE.PointLight("#ffffff", 0, 30, 1.2);
  strobe.position.set(BALL.x, TRUSS_Y, BALL.z);
  root.add(wallSpill, barLight, strobe);

  mergeStatics(root, [ceiling]);
  // The club sets every light's brightness itself, frame by frame: the finishing's emitter boost and
  // glow halving (room-post.ts) stay out of it.
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const one of Array.isArray(material) ? material : material ? [material] : []) one.userData.noGlow = true;
  });

  // ---- playing it ----
  let show: ClubShow | null = null;
  let crowd: Array<{ x: number; z: number }> = [];
  let calm = false;
  let djName: string | null = null;
  let title: string | null = null;
  let artist: string | null = null;
  let textKey = "";
  let panelKey = "";
  const weights = new THREE.Vector4(1, 0, 0, 0);
  const wantWeights = new THREE.Vector4(1, 0, 0, 0);
  let lastDrop = Infinity;
  let ballAngle = 0;
  let idleClock = 0;
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3();
  /** The second plane of each laser beam, turned a quarter round it, so it shows from every side. */
  const twists = [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(up, Math.PI / 2)];

  const drawText = (live: boolean, bpm: number | null) => {
    const keyNow = `${live}|${djName}|${title}|${artist}|${bpm ? Math.round(bpm) : ""}`;
    if (keyNow === textKey) return;
    textKey = keyNow;
    const ctx = textCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 8;
    if (!live) {
      ctx.textAlign = "center";
      ctx.font = "800 96px system-ui, sans-serif";
      ctx.fillText("HOFFLE CLUB", 512, 190);
      ctx.font = "600 40px system-ui, sans-serif";
      ctx.fillText("start the night from the decks", 512, 260);
      textTexture.needsUpdate = true;
      return;
    }
    ctx.textAlign = "left";
    ctx.font = "800 46px system-ui, sans-serif";
    if (title) ctx.fillText(title.toUpperCase(), 30, 320, 760);
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.globalAlpha = 0.85;
    if (artist) ctx.fillText(artist, 30, 360, 760);
    ctx.globalAlpha = 1;
    ctx.textAlign = "right";
    ctx.font = "800 40px system-ui, sans-serif";
    ctx.fillText(djName ? `DJ ${djName.toUpperCase()}` : "DJ HOFFY", 994, 56, 600);
    if (bpm) {
      ctx.font = "700 32px ui-monospace, monospace";
      ctx.fillText(`${Math.round(bpm)} BPM`, 994, 360);
    }
    textTexture.needsUpdate = true;
  };
  drawText(false, null);

  const drawPanel = (hue: number, level: number) => {
    const keyNow = `${djName}|${Math.round(hue * 24)}|${Math.round(level * 10)}`;
    if (keyNow === panelKey) return;
    panelKey = keyNow;
    const ctx = panelCanvas.getContext("2d")!;
    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, 512, 128);
    const colour = `#${paint(hue, tmp2).getHexString()}`;
    ctx.fillStyle = colour;
    ctx.font = "800 54px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(djName ? djName.toUpperCase() : "HOFFLE", 256, 56, 470);
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = i / 24 < level ? 1 : 0.15;
      ctx.fillRect(16 + i * 20, 104, 14, 12);
    }
    ctx.globalAlpha = 1;
    panelTexture.needsUpdate = true;
  };

  /** Where a ray from `from` along `dir` meets the room's walls, floor or ceiling. */
  const hitRoom = (from: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) => {
    let t = Infinity;
    const planes: Array<[number, number, number]> = [[dir.x, -CLUB_HALF_X - from.x, 1], [dir.x, CLUB_HALF_X - from.x, 1], [dir.y, -from.y, 1], [dir.y, H - from.y, 1], [dir.z, -CLUB_HALF_Z - from.z, 1], [dir.z, CLUB_HALF_Z - from.z, 1]];
    for (const [d, gap] of planes) {
      if (Math.abs(d) < 1e-6) continue;
      const k = gap / d;
      if (k > 0.01 && k < t) t = k;
    }
    return out.copy(from).addScaledVector(dir, Math.min(t, 40) * 0.985);
  };

  const fireConfetti = () => {
    for (const bit of bits) {
      bit.p.set(f.x0 + Math.random() * (f.x1 - f.x0), H - 0.4 - Math.random() * 0.4, f.z0 + Math.random() * (f.z1 - f.z0));
      bit.v.set((Math.random() - 0.5) * 1.2, -0.3 - Math.random() * 0.5, (Math.random() - 0.5) * 1.2);
      bit.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      bit.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      bit.life = 4 + Math.random() * 3;
    }
    for (let i = 0; i < CONFETTI; i++) confetti.setColorAt(i, paint(Math.random()).multiplyScalar(1.6));
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  };
  const fireCo2 = () => {
    puffState.forEach((puff, i) => {
      const nozzle = nozzles[i % nozzles.length];
      puff.p.copy(nozzle);
      puff.v.set((Math.random() - 0.5) * 0.8, 6 + Math.random() * 3, (Math.random() - 0.5) * 0.8 + 0.3);
      puff.life = 0.9 + Math.random() * 0.5 + (i / PUFFS) * 0.4;
    });
  };

  const update = (t: number, dt = 1 / 60) => {
    const s = show;
    const live = Boolean(s?.live);
    idleClock += dt;
    const hue = s ? s.hue : (idleClock * 0.02) % 1;
    const beat = s?.beat ?? (live ? null : idleClock * 1.2);
    const beatClock = beat ?? idleClock * 2;
    const energy = live ? s!.energy : 0.15;
    const section = s?.section ?? "idle";
    const flash = calm ? 0 : s?.flash ?? 0;
    const kickHit = live ? s!.kickHit : 0;
    const sinceDrop = s?.sinceDrop ?? Infinity;
    if (live && sinceDrop < lastDrop && sinceDrop < 0.5) { fireConfetti(); fireCo2(); }
    lastDrop = sinceDrop;
    const motion = calm ? 0.45 : 1;

    // The wall.
    const u = wallUniforms;
    u.uTime.value = t;
    u.uKick.value = live ? Math.max(s!.kick, kickHit) : 0;
    u.uSnare.value = live ? s!.snare : 0;
    u.uBass.value = live ? s!.bass : 0;
    u.uVocals.value = live ? s!.vocals : 0;
    u.uMelody.value = live ? s!.melody : 0;
    u.uLevel.value = live ? s!.level : 0;
    u.uPhase.value = s?.beatPhase ?? 0;
    u.uBar.value = (beatClock / 4) % 1;
    u.uBuild.value = s?.build ?? 0;
    u.uFlash.value = flash;
    u.uLive.value += ((live ? 1 : 0) - u.uLive.value) * Math.min(1, dt * 2);
    u.uDrop.value = section === "drop" ? 1 : 0;
    const phrase = Math.floor(beatClock / 32);
    if (section === "drop") wantWeights.set(1, 0.8, 0, 0);
    else if (section === "breakdown") wantWeights.set(0, 0.3, 0, 1);
    else if (section === "build") wantWeights.set(0.3, 1, 0, 0);
    else wantWeights.set(phrase % 3 === 0 ? 1 : 0, phrase % 3 === 1 ? 1 : 0, phrase % 3 === 2 ? 1 : 0, s?.stems && (s.vocals > 0.3) ? 0.5 : 0);
    weights.lerp(wantWeights, Math.min(1, dt * 1.5));
    u.uWeights.value.copy(weights);
    paint(hue, u.uColA.value);
    paint(hue + 0.33, u.uColB.value);
    paint(hue + 0.66, u.uColC.value);
    drawText(live, s?.bpm ?? null);
    drawPanel(hue, live ? s!.level : 0);
    // A share (or a film) on the screen covers the middle of the wall.
    screen.visible = Boolean(screenMaterial.map);

    // The floor: ripples out from the middle on the kick, a checker on the beat, light under people's feet.
    const phase = s?.beatPhase ?? 0;
    const beatIndex = Math.floor(beatClock);
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const ringAt = live ? (1 - kickHit) * 7 : (idleClock * 0.8) % 7;
    for (let i = 0; i < cols * rows; i++) {
      const { x, z } = tileAt(i);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const r = Math.hypot(x - cx, z - cz);
      let level = 0;
      let h = hue;
      if (!live) {
        level = 0.08 + 0.06 * Math.sin(idleClock * 0.8 + r * 0.9);
        h = hue + r * 0.05;
      } else if (section === "build") {
        const reach = (1 - s!.build) * 6;
        level = r > reach ? 0.9 : 0.06;
        if (s!.build > 0.75 && !calm) level *= phase < 0.5 ? 1 : 0.2;
      } else if (section === "breakdown") {
        level = 0.1 + 0.4 * s!.vocals * (0.5 + 0.5 * Math.sin(r * 1.2 - t * 1.5));
        h = hue + 0.5;
      } else {
        const checker = (col + row + beatIndex) % 2 === 0 ? 1 : 0.15;
        const ring = Math.max(0, 1 - Math.abs(r - ringAt) * 1.4) * (0.4 + kickHit);
        level = (section === "drop" ? 0.35 : 0.18) * checker * (0.4 + s!.bass) + ring * (section === "drop" ? 1.2 : 0.8) + (section === "drop" ? s!.snareHit * (Math.random() < 0.08 ? 1 : 0) : 0);
        h = hue + (checker > 0.5 ? 0 : 0.33) + r * 0.02;
      }
      for (const spot of crowd) {
        const d = Math.hypot(spot.x - x, spot.z - z);
        if (d < 0.7) level = Math.max(level, (0.7 - d) * (live ? 0.9 : 0.5));
      }
      level += flash * 0.8;
      tiles.setColorAt(i, paint(h, tmp).multiplyScalar(level * 1.6));
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;

    // The beams.
    const rate = section === "drop" ? 0.5 : section === "build" ? 0.25 + (s?.build ?? 0) * 0.75 : section === "breakdown" ? 0.08 : live ? 0.18 : 0.05;
    heads.forEach((head, i) => {
      const lane = i % 2 ? 1 : -1;
      const swing = Math.sin(beatClock * Math.PI * rate * motion + i * 0.7);
      let pan = head.home + (section === "drop" ? head.side * 0.35 + swing * 0.6 : swing * 0.7 * lane);
      let tilt = 0.45 + 0.25 * Math.cos(beatClock * Math.PI * rate * 0.5 * motion + i);
      if (section === "build") tilt = 0.35 + (s!.build) * 0.9;            // rising towards the crowd
      if (section === "breakdown") { tilt = 0.3; pan = head.home + Math.sin(t * 0.2 + i) * 0.4; }
      if (!live) { tilt = 0.4 + 0.1 * Math.sin(idleClock * 0.3 + i); pan = head.home + Math.sin(idleClock * 0.15 + i) * 0.5; }
      head.dir.set(Math.sin(tilt) * Math.sin(pan), -Math.cos(tilt), Math.sin(tilt) * Math.cos(pan)).normalize();
      q.setFromUnitVectors(down, head.dir);
      head.head.quaternion.copy(q);
      head.beam.quaternion.copy(q);
      const toFloor = head.dir.y < -0.05 ? head.at.y / -head.dir.y : 12;
      const length = Math.min(toFloor, 14);
      head.beam.scale.set(0.35 + length * 0.07, length, 0.35 + length * 0.07);
      let intensity = !live ? 0.12 : section === "breakdown" ? 0.15 + s!.vocals * 0.35 : section === "drop" ? 0.55 + 0.45 * kickHit : 0.25 + 0.55 * s!.melody;
      if (section === "build") intensity = 0.3 + s!.build * 0.7;
      if (section === "drop" && !calm && i % 2 === beatIndex % 2) intensity *= 0.35 + 0.65 * (1 - phase);
      paint(hue + (i % 3) * 0.33 + (section === "breakdown" ? 0.5 : 0), tmp);
      head.beamMaterial.color.copy(tmp).multiplyScalar(intensity * 0.5);
      head.lens.color.copy(tmp).multiplyScalar(0.5 + intensity * 2.5);
      if (toFloor < 14) {
        head.spot.visible = true;
        head.spot.position.copy(head.at).addScaledVector(head.dir, toFloor * 0.995);
        head.spot.position.y = 0.06;
        head.spot.scale.setScalar((0.35 + length * 0.07) * 0.9);
        head.spotMaterial.color.copy(tmp).multiplyScalar(intensity * 0.9);
      } else head.spot.visible = false;
    });
    // The washes on the floor and the crowd follow the kick and the colour.
    washes.forEach((light, i) => {
      light.color.copy(paint(hue + i * 0.25, tmp));
      light.intensity = !live ? 4 : 10 + 50 * (section === "drop" ? kickHit : s!.bass * 0.6 + kickHit * 0.4);
    });
    key.intensity = djName || live ? 24 : 10;
    wallSpill.color.copy(u.uColA.value);
    wallSpill.intensity = live ? 6 + 20 * s!.level : 3;
    strobe.intensity = flash * 700;
    hemi.intensity = 0.18 + flash * 2;
    stageEdge.color.copy(paint(hue, tmp)).multiplyScalar(live ? 0.3 + kickHit * 2.2 : 0.4);
    underGlow.color.copy(paint(hue + 0.5, tmp)).multiplyScalar(1.4);
    signMaterial.color.setScalar(1.8 + (live ? s!.kick * 0.6 : 0.2 * Math.sin(t * 3)));
    for (const tube of tubes) {
      const chase = live ? Math.max(0, 1 - Math.abs(((beatClock * 2) % 7) - (tube.side > 0 ? tube.index : 6 - tube.index))) : 0;
      tube.material.color.copy(paint(hue + tube.index * 0.08, tmp)).multiplyScalar(live ? 0.3 + s!.melody * 1.2 + chase * 1.5 : 0.35);
    }
    jogRings.forEach((ring, i) => ring.color.copy(paint(hue + i * 0.5, tmp)).multiplyScalar(live ? 1 + kickHit * 2 : 0.4));
    knobs.forEach((knob, i) => knob.color.copy(paint(hue + i * 0.1, tmp)).multiplyScalar(live ? 0.6 + (i % 2 ? s!.snare : s!.bass) * 2 : 0.2));
    for (const platter of platters) platter.rotation.y -= (live && s!.info?.paused !== true ? 3.49 : 0) * dt;   // 33⅓ rpm
    for (const { mesh, sub } of cones) {
      const pump = live ? (sub ? s!.kick * 0.5 + kickHit * 0.5 : s!.bass) : 0;
      mesh.scale.set(1, 1, 1 + pump * 0.8);
    }

    // Lasers: on the drop, and in a big groove with the hats; never in a breakdown.
    const laserLevel = !live || calm ? 0 : section === "drop" ? 0.6 + 0.4 * s!.snare : section === "build" ? s!.build * 0.5 : section === "groove" && energy > 0.5 ? s!.snare * 0.6 : 0;
    let n = 0;
    laserOrigins.forEach((origin, o) => {
      const facing = o === 0 ? 0.45 : -0.45;
      const sweep = Math.sin(beatClock * Math.PI * (section === "drop" ? 0.5 : 0.25)) * 0.35;
      for (let b = 0; b < LASER_BEAMS; b++) {
        const yaw = facing + (b / (LASER_BEAMS - 1) - 0.5) * (section === "drop" ? 1.4 : 0.9) + sweep * (o === 0 ? 1 : -1);
        const pitch = 0.12 + (section === "build" ? (s!.build) * 0.25 : 0) + Math.sin(beatClock * 0.5 + b) * 0.03;
        v3.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const length = hitRoom(origin, v3, hit).distanceTo(origin);
        q.setFromUnitVectors(up, v3);
        paint(hue + 0.5 + o * 0.15, tmp).multiplyScalar(laserLevel * 3.2);
        for (const twist of twists) {
          m4.compose(origin, q2.copy(q).multiply(twist), scale.set(1, laserLevel > 0.01 ? length : 0, 1));
          lasers.setMatrixAt(n, m4);
          lasers.setColorAt(n, tmp);
          n++;
        }
      }
    });
    lasers.instanceMatrix.needsUpdate = true;
    if (lasers.instanceColor) lasers.instanceColor.needsUpdate = true;

    // The disco ball turns; its specks show most when the music lets them (breakdowns, intros, nothing on).
    ballAngle += dt * (section === "drop" ? 0.9 : 0.35) * motion;
    ball.rotation.y = ballAngle;
    const speckLevel = !live ? 0.35 : section === "breakdown" || section === "intro" ? 0.9 : section === "drop" ? 0.25 : 0.3;
    pin.intensity = 20 + 60 * speckLevel;
    speckMaterial.color.copy(paint(hue + 0.15, tmp)).lerp(tmp2.set("#ffffff"), 0.6).multiplyScalar(speckLevel * 1.4);
    const cos = Math.cos(ballAngle);
    const sin = Math.sin(ballAngle);
    for (let i = 0; i < SPECKS; i++) {
      const d = speckDirs[i];
      v3.set(d.x * cos - d.z * sin, d.y, d.x * sin + d.z * cos);
      const at = hitRoom(BALL, v3, hit);
      speckPositions[i * 3] = at.x;
      speckPositions[i * 3 + 1] = at.y;
      speckPositions[i * 3 + 2] = at.z;
    }
    speckGeometry.attributes.position.needsUpdate = true;

    // Confetti falls and flutters; CO2 shoots up and spreads.
    let anyBit = false;
    bits.forEach((bit, i) => {
      if (bit.life <= 0) return;
      anyBit = true;
      bit.life -= dt;
      bit.v.y = Math.max(-0.9, bit.v.y - 1.2 * dt);
      bit.v.x += Math.sin(t * 3 + i) * 0.4 * dt;
      bit.p.addScaledVector(bit.v, dt);
      if (bit.p.y < 0.05) { bit.p.y = 0.05; bit.v.set(0, 0, 0); }
      bit.r.x += bit.spin.x * dt; bit.r.y += bit.spin.y * dt;
      m4.compose(bit.p, q.setFromEuler(bit.r), scale.setScalar(bit.life > 0 ? 1 : 0));
      confetti.setMatrixAt(i, bit.life > 0 ? m4 : hidden);
    });
    if (anyBit) confetti.instanceMatrix.needsUpdate = true;
    puffState.forEach((puff, i) => {
      if (puff.life <= 0) {
        puffColours[i * 3] = puffColours[i * 3 + 1] = puffColours[i * 3 + 2] = 0;
        return;
      }
      puff.life -= dt;
      puff.v.multiplyScalar(Math.exp(-dt * 2.2));
      puff.v.x += (Math.random() - 0.5) * dt * 2;
      puff.p.addScaledVector(puff.v, dt);
      const a = clamp01(puff.life) * 0.5;
      puffColours[i * 3] = puffColours[i * 3 + 1] = puffColours[i * 3 + 2] = a;
      puffPositions[i * 3] = puff.p.x;
      puffPositions[i * 3 + 1] = puff.p.y;
      puffPositions[i * 3 + 2] = puff.p.z;
    });
    puffGeometry.attributes.position.needsUpdate = true;
    puffGeometry.attributes.color.needsUpdate = true;

    // The haze drifts and takes the room's colour.
    hazeMaterial.color.copy(paint(hue, tmp)).multiplyScalar(live ? 0.04 + 0.06 * energy + flash * 0.2 : 0.03);
    for (const cloud of haze) {
      const drift = cloud.userData.drift as number;
      cloud.position.x += Math.sin(t * 0.05 + drift) * dt * 0.08;
      cloud.material.rotation = Math.sin(t * 0.03 + drift) * 0.3;
    }
  };

  return {
    root,
    ceiling,
    screenMaterial,
    idleScreen: null,
    background: new THREE.Color("#040308"),
    fog: new THREE.Fog("#040308", 16, 40),
    exposure: 1.0,
    update,
    dispose: () => { for (const thing of disposables) thing.dispose(); },
    club: {
      show: (next) => { show = next; },
      people: (spots) => { crowd = spots; },
      dj: (name) => { djName = name; },
      track: (nextTitle, nextArtist) => { title = nextTitle; artist = nextArtist; },
      calm: (on) => { calm = on; },
    },
  };
}
