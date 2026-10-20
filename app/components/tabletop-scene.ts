/**
 * The tabletop room: a round gaming table, a battle map set into it below a
 * wooden rail, ten chairs, a pendant lamp over it, bookcases, a cabinet of
 * painted miniatures and a wall screen. Dice are thrown onto the map (see
 * tabletop-dice.ts), so the map itself is kept clear: candles, tankards and
 * dice pouches stand on the rail, the minis live on the sideboard and in the
 * cabinet.
 */
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { TABLETOP, TABLE_CENTRE, TABLE_RADIUS } from "../lib/living-room";
import { addPropList, TABLETOP_PROPS } from "./living-room-props";
import { LOOKS, box, canvasTexture, candle, cushion, floorMaterial, glowTexture, mat, plant, plasterOver, seeded, tagSeat, wallTexture, woodMaterial, type BuiltRoom, type Look } from "./living-room-scene";
import { mergeStatics } from "./living-room-fx";
import { dress, fabric } from "./room-surfaces";
import { ThingKit } from "./room-things";
import { playDouse, playIgnite, playThunder, startRain } from "./living-room-sounds";
import type { TableMood } from "@/lib/lounge-shared";
import { miniFigure, type MiniKind } from "./tabletop-extras";

/** Height of the map the dice land on. */
export const TABLE_SURFACE_Y = 0.82;
/** The map's edge: inside it is play, outside it the rail. */
const MAP_RADIUS = TABLE_RADIUS - 0.17;
/** Top of the rail, where drinks and candles stand. */
const RAIL_TOP = TABLE_SURFACE_Y + 0.068;
const RAIL_MID = (MAP_RADIUS + TABLE_RADIUS) / 2;

/** A point at heading `angle` (0 north, clockwise) and `r` from the table's centre, as the seats are laid out. */
const around = (angle: number, r: number) => ({ x: TABLE_CENTRE.x + Math.sin(angle) * r, z: TABLE_CENTRE.z - Math.cos(angle) * r });
const SEAT_STEP = (Math.PI * 2) / TABLETOP.seats.length;
/** Chair 0, at the head of the table, is the game master's. */
const seatAngle = (i: number) => i * SEAT_STEP;

interface MapInk { paper: [string, string]; ink: string; wall: string; floor: string; water: [string, string]; wood: string; tree: [string, string]; grass: string; accent: string; label: string }

const MAP_INKS: Record<RoomTheme, MapInk> = {
  cozy: { paper: ["#ecdcb8", "#c8a87a"], ink: "#4a3322", wall: "#3a2a1e", floor: "#d9cdb4", water: ["#5f8fb0", "#9cc3d8"], wood: "#8b5a2b", tree: ["#4f7a3a", "#2f4d24"], grass: "rgba(110,150,80,0.22)", accent: "#9c2b22", label: "#3a2414" },
  academia: { paper: ["#e6d3ac", "#bb9a6a"], ink: "#3e2a1a", wall: "#2f2016", floor: "#d2c3a4", water: ["#56809a", "#93b6c9"], wood: "#7c4f28", tree: ["#4a6e38", "#2b4521"], grass: "rgba(100,140,70,0.22)", accent: "#7b1f1f", label: "#2e1c10" },
  vampire: { paper: ["#c9ab8c", "#7a5a45"], ink: "#2a1210", wall: "#1e0c0c", floor: "#b39a82", water: ["#4a2a3a", "#7a4a5a"], wood: "#5a2f1f", tree: ["#3d3a2a", "#221f16"], grass: "rgba(80,60,40,0.25)", accent: "#8a0f1f", label: "#3a0a12" },
  matrix: { paper: ["#04210f", "#010a05"], ink: "#00e060", wall: "#00ff66", floor: "#062a14", water: ["#00a050", "#40ffa0"], wood: "#0f8040", tree: ["#00c853", "#007a32"], grass: "rgba(0,200,80,0.10)", accent: "#b9ffcf", label: "#6dff9e" },
  minecraft: { paper: ["#e0cfa0", "#b89f6a"], ink: "#3a2a1a", wall: "#4a4a4a", floor: "#cbb88a", water: ["#3f76e4", "#7fa8ff"], wood: "#6b5130", tree: ["#5fa83a", "#3f7a28"], grass: "rgba(95,168,58,0.25)", accent: "#a83232", label: "#2a1a0a" },
  zombie: { paper: ["#c9c0a0", "#7d7458"], ink: "#2a2414", wall: "#1e1a10", floor: "#b3a888", water: ["#4a6a3a", "#7a9a5a"], wood: "#5a4026", tree: ["#4a5a2a", "#2a3418"], grass: "rgba(90,110,40,0.25)", accent: "#8e1b12", label: "#3a1a0a" },
  y2k: { paper: ["#eef2ff", "#c6d0f5"], ink: "#2a3aa8", wall: "#3a3f6a", floor: "#e3e8ff", water: ["#4fc3ff", "#a8e4ff"], wood: "#b0806a", tree: ["#5ab85a", "#2f7a3a"], grass: "rgba(120,200,90,0.2)", accent: "#ff4fa8", label: "#1a237e" },
  galaxy: { paper: ["#06142a", "#020812"], ink: "#7fd8ff", wall: "#7fd8ff", floor: "#0a2040", water: ["#2a6aaa", "#5aa8e8"], wood: "#3a7ab8", tree: ["#4ac8a0", "#1a6a5a"], grass: "rgba(127,216,255,0.08)", accent: "#ffe81f", label: "#ffe81f" },
  cyberpunk: { paper: ["#1b0f40", "#08041a"], ink: "#00f0ff", wall: "#00f0ff", floor: "#241a52", water: ["#9b5cff", "#ff7ad1"], wood: "#ff2fb4", tree: ["#2fbf8f", "#13705a"], grass: "rgba(0,240,255,0.08)", accent: "#ff2fb4", label: "#ffe94a" },
};

/**
 * The battle map: a keep half-sunk in a marsh, a river with a bridge, a wood
 * and a road, on a square grid. Drawn with strong ink so it stays readable
 * under the table lamp.
 */
function mapTexture(theme: RoomTheme) {
  const k = MAP_INKS[theme];
  const neon = theme === "matrix" || theme === "cyberpunk" || theme === "galaxy";
  return canvasTexture(1024, 1024, (ctx) => {
    const size = 1024;
    const rand = seeded(42);
    const g = ctx.createRadialGradient(size / 2, size / 2, 120, size / 2, size / 2, size / 2);
    g.addColorStop(0, k.paper[0]); g.addColorStop(1, k.paper[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // Paper grain and a few old stains.
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = neon ? `rgba(255,255,255,${0.01 + rand() * 0.02})` : `rgba(60,35,15,${0.02 + rand() * 0.04})`;
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
    }
    if (!neon) for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(90,55,30,${0.08 + rand() * 0.08})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(200 + rand() * 600, 200 + rand() * 600, 34 + rand() * 30, 0, Math.PI * 2); ctx.stroke();
    }

    // Meadow patches in the open country to the south.
    for (let i = 0; i < 22; i++) {
      ctx.fillStyle = k.grass;
      ctx.beginPath(); ctx.ellipse(100 + rand() * 820, 560 + rand() * 420, 40 + rand() * 70, 26 + rand() * 40, rand() * 3, 0, Math.PI * 2); ctx.fill();
    }

    // The river, west to east, and its bridge.
    const river = (w: number, colour: string) => {
      ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-40, 610); ctx.bezierCurveTo(220, 520, 380, 760, 600, 640); ctx.bezierCurveTo(760, 560, 880, 650, 1070, 560); ctx.stroke();
    };
    river(54, k.ink);
    river(46, k.water[0]);
    river(14, k.water[1]);
    // The road: from the south edge, over the bridge, to the keep's gate.
    ctx.strokeStyle = neon ? `${k.wood}88` : "rgba(140,100,60,0.55)";
    ctx.lineWidth = 26; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(470, 1040); ctx.bezierCurveTo(480, 860, 520, 760, 512, 650); ctx.lineTo(512, 470); ctx.stroke();
    ctx.setLineDash([10, 14]); ctx.lineWidth = 2; ctx.strokeStyle = k.ink;
    ctx.beginPath(); ctx.moveTo(470, 1040); ctx.bezierCurveTo(480, 860, 520, 760, 512, 650); ctx.lineTo(512, 470); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = k.wood; ctx.strokeStyle = k.ink; ctx.lineWidth = 3;
    ctx.fillRect(484, 600, 56, 84); ctx.strokeRect(484, 600, 56, 84);
    for (let y = 606; y < 684; y += 10) { ctx.beginPath(); ctx.moveTo(484, y); ctx.lineTo(540, y); ctx.stroke(); }

    // The wood: round canopies, darker at the rim, south-west and east.
    const tree = (x: number, y: number, r: number) => {
      ctx.fillStyle = k.tree[1];
      ctx.beginPath(); ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = k.tree[0];
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = k.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.stroke();
    };
    for (let i = 0; i < 26; i++) tree(120 + rand() * 300, 720 + rand() * 230, 16 + rand() * 14);
    for (let i = 0; i < 14; i++) tree(760 + rand() * 200, 720 + rand() * 200, 14 + rand() * 12);
    for (let i = 0; i < 6; i++) tree(80 + rand() * 120, 250 + rand() * 260, 14 + rand() * 10);

    // The keep: flagged floors, thick walls, doors, pillars and a stair.
    const cell = 1024 / 20;
    const rooms: Array<[number, number, number, number]> = [[5, 3, 5, 4], [11, 2, 5, 5], [8, 7, 4, 2], [12, 7, 3, 3], [6, 7, 2, 2]];
    for (const [cx, cy, cw, ch] of rooms) {
      ctx.fillStyle = k.floor;
      ctx.fillRect(cx * cell, cy * cell, cw * cell, ch * cell);
      ctx.strokeStyle = neon ? `${k.ink}40` : "rgba(60,40,25,0.25)";
      ctx.lineWidth = 1;
      for (let x = 0; x < cw * 2; x++) for (let y = 0; y < ch * 2; y++) {
        ctx.strokeRect(cx * cell + x * cell / 2 + (y % 2 ? cell / 4 : 0), cy * cell + y * cell / 2, cell / 2, cell / 2);
      }
    }
    ctx.strokeStyle = k.wall; ctx.lineWidth = 12; ctx.lineJoin = "miter";
    for (const [cx, cy, cw, ch] of rooms) ctx.strokeRect(cx * cell, cy * cell, cw * cell, ch * cell);
    // Doorways: gaps in the walls with a door leaf.
    const door = (x: number, y: number, vertical: boolean) => {
      ctx.fillStyle = k.floor;
      if (vertical) ctx.fillRect(x - 8, y - 20, 16, 40); else ctx.fillRect(x - 20, y - 8, 40, 16);
      ctx.fillStyle = k.wood;
      if (vertical) ctx.fillRect(x - 3, y - 18, 6, 36); else ctx.fillRect(x - 18, y - 3, 36, 6);
    };
    door(10 * cell, 5 * cell, true); door(10 * cell, 8 * cell, false); door(12 * cell, 7 * cell, false);
    door(13.5 * cell, 10 * cell, false); door(7 * cell, 7 * cell, false); door(8 * cell, 8 * cell, true);
    // Pillars in the great hall.
    ctx.fillStyle = k.wall;
    for (const [x, y] of [[12.3, 3.3], [14.7, 3.3], [12.3, 5.7], [14.7, 5.7]]) { ctx.beginPath(); ctx.arc(x * cell, y * cell, 10, 0, Math.PI * 2); ctx.fill(); }
    // A spiral stair in the west tower.
    ctx.strokeStyle = k.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(7.5 * cell, 5 * cell, 34, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(7.5 * cell, 5 * cell); ctx.lineTo(7.5 * cell + Math.cos(a) * 34, 5 * cell + Math.sin(a) * 34); ctx.stroke();
    }
    // Rubble where the east wall has fallen.
    ctx.fillStyle = k.wall;
    for (let i = 0; i < 18; i++) ctx.fillRect(15 * cell + rand() * 50, 7.5 * cell + rand() * 70, 4 + rand() * 9, 4 + rand() * 9);

    // The grid over everything.
    ctx.strokeStyle = neon ? `${k.ink}55` : "rgba(60,40,25,0.22)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= 20; i++) {
      ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
    }

    // The treasure, and the labels.
    ctx.strokeStyle = k.accent; ctx.lineWidth = 9; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(13.2 * cell, 3.8 * cell); ctx.lineTo(13.8 * cell, 4.4 * cell); ctx.moveTo(13.8 * cell, 3.8 * cell); ctx.lineTo(13.2 * cell, 4.4 * cell); ctx.stroke();
    ctx.fillStyle = k.label; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "italic 700 34px Georgia, serif";
    ctx.fillText("The Sunken Keep", 10.5 * cell, 1.3 * cell);
    ctx.font = "italic 26px Georgia, serif";
    ctx.fillText("Mirewood", 5.4 * cell, 19 * cell);
    ctx.save(); ctx.translate(16.5 * cell, 12.1 * cell); ctx.rotate(-0.28); ctx.fillText("the Grey Run", 0, 0); ctx.restore();

    // Compass rose.
    ctx.save();
    ctx.translate(16.2 * cell, 16.4 * cell);
    ctx.fillStyle = k.ink; ctx.strokeStyle = k.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0 ? 62 : 34;
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, -long); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0); ctx.closePath();
      ctx.globalAlpha = i % 2 === 0 ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.fillStyle = k.ink; ctx.font = "700 30px Georgia, serif";
    ctx.fillText("N", 16.2 * cell, 16.4 * cell - 82);
  });
}

/** What the wall screen shows until someone shares: the night's adventure, and how to put a map up. */
function idleTexture(theme: RoomTheme, look: Look) {
  const neon = theme === "matrix" || theme === "cyberpunk" || theme === "galaxy";
  const gold = neon ? look.trim : theme === "vampire" ? "#b08a3e" : "#d9b45c";
  return canvasTexture(1024, 576, (ctx) => {
    const g = ctx.createRadialGradient(512, 260, 40, 512, 288, 620);
    g.addColorStop(0, neon ? "#141030" : theme === "vampire" ? "#2a0a10" : "#3a2616");
    g.addColorStop(1, neon ? "#05030c" : "#0c0705");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 576);
    ctx.strokeStyle = gold; ctx.globalAlpha = 0.55; ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, 968, 520);
    ctx.strokeRect(38, 38, 948, 500);
    ctx.globalAlpha = 1;
    // A d20, drawn flat: hexagon, inner triangle, spokes.
    ctx.save();
    ctx.translate(512, 200);
    ctx.strokeStyle = gold; ctx.lineWidth = 4; ctx.lineJoin = "round";
    const hex = Array.from({ length: 6 }, (_, i) => [Math.sin((i / 6) * Math.PI * 2) * 92, -Math.cos((i / 6) * Math.PI * 2) * 92]);
    const tri = [[0, -52], [46, 28], [-46, 28]];
    ctx.fillStyle = neon ? "rgba(0,240,255,0.08)" : "rgba(217,180,92,0.1)";
    ctx.beginPath(); hex.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); tri.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    for (const [a, b] of [[0, 0], [0, 1], [1, 1], [1, 2], [2, 3], [2, 4], [0, 5], [2, 5], [1, 3]] as const) {
      ctx.beginPath(); ctx.moveTo(tri[a][0], tri[a][1]); ctx.lineTo(hex[b][0], hex[b][1]); ctx.stroke();
    }
    ctx.fillStyle = gold; ctx.font = "700 34px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("20", 0, 4);
    ctx.restore();
    ctx.textAlign = "center";
    ctx.fillStyle = neon ? "#e8f7ff" : "#f3e3c0";
    ctx.font = "700 58px Georgia, serif";
    ctx.fillText("Roll for initiative", 512, 372);
    ctx.fillStyle = gold;
    ctx.font = "italic 28px Georgia, serif";
    ctx.fillText("Share your screen to put a map up here", 512, 430);
  });
}

/** A pouch of dice: round at the bottom, gathered at the neck, the cord tied round it. */
function dicePouch(colour: string) {
  const group = new THREE.Group();
  const profile = [[0, 0], [0.035, 0.004], [0.058, 0.03], [0.062, 0.058], [0.048, 0.088], [0.022, 0.104], [0.018, 0.112], [0.03, 0.128], [0.026, 0.136]].map(([x, y]) => new THREE.Vector2(x, y));
  const bag = new THREE.Mesh(new THREE.LatheGeometry(profile, 14), mat(colour, 0.95));
  bag.castShadow = true;
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0045, 6, 14), mat("#d9b45c", 0.5, { metalness: 0.4 }));
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.108;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4), mat("#d9b45c", 0.6));
  tail.position.set(0.026, 0.09, 0);
  tail.rotation.z = 0.5;
  group.add(bag, tie, tail);
  return group;
}

/** A pewter or wooden tankard: banded body, handle, and a head of foam. */
function tankard(metal: boolean) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.047, 0.11, 16), metal ? mat("#9aa0a8", 0.35, { metalness: 0.7 }) : mat("#8a5a34", 0.7));
  body.position.y = 0.055;
  body.castShadow = true;
  const band = metal ? null : new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 4, 16), mat("#3a2a1e", 0.6, { metalness: 0.5 }));
  if (band) { band.rotation.x = Math.PI / 2; band.position.y = 0.03; group.add(band); }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12, Math.PI), body.material);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.05, 0.06, 0);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.012, 16), mat("#f3ead2", 0.9));
  foam.position.y = 0.106;
  group.add(body, handle, foam);
  return group;
}

/** A bookcase against a wall, `w` wide and `h` tall, facing +Z on its own origin. */
function bookcase(w: number, h: number, depth: number, wood: THREE.Material, spines: THREE.Texture) {
  const group = new THREE.Group();
  const back = box(w, h, 0.02, wood, false);
  back.position.set(0, h / 2, -depth / 2 + 0.01);
  group.add(back);
  for (const s of [-1, 1]) {
    const side = box(0.05, h, depth, wood);
    side.position.set(s * (w / 2 - 0.025), h / 2, 0);
    group.add(side);
  }
  const rows = 5;
  const inner = h - 0.12;
  for (let i = 0; i <= rows; i++) {
    const board = box(w - 0.06, 0.035, depth - 0.02, wood, false);
    board.position.set(0, 0.06 + (i / rows) * inner, 0.005);
    group.add(board);
  }
  const top = box(w + 0.06, 0.05, depth + 0.04, wood);
  top.position.set(0, h, 0.01);
  group.add(top);
  // The books: one painted plane per shelf, set back so the boards cast over them.
  const books = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, inner), new THREE.MeshStandardMaterial({ map: spines, roughness: 0.9 }));
  books.position.set(0, 0.06 + inner / 2, -depth / 2 + 0.07);
  group.add(books);
  return group;
}

/** A tavern chair: cushioned seat, two back posts with spindles, the front facing -Z. */
function chair(wood: THREE.Material, pad: THREE.Material) {
  const group = new THREE.Group();
  const seatBoard = box(0.48, 0.04, 0.46, wood);
  seatBoard.position.y = 0.42;
  const seatPad = cushion(0.44, 0.07, 0.42, pad, 0.03);
  seatPad.position.y = 0.475;
  group.add(seatBoard, seatPad);
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.017, 0.42, 8), wood);
    leg.position.set(x, 0.21, z);
    leg.rotation.set(z * 0.25, 0, -x * 0.25);
    leg.castShadow = true;
    group.add(leg);
  }
  const back = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = box(0.045, 0.58, 0.045, wood);
    post.position.set(s * 0.205, 0.29, 0);
    back.add(post);
  }
  const rail = cushion(0.5, 0.09, 0.05, wood, 0.02);
  rail.position.y = 0.55;
  back.add(rail);
  for (const x of [-0.11, 0, 0.11]) {
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), wood);
    spindle.position.set(x, 0.3, 0);
    back.add(spindle);
  }
  back.position.set(0, 0.44, 0.205);
  back.rotation.x = 0.1;
  group.add(back);
  return group;
}

/**
 * The game master's chair: the tavern chair under a tall carved back with a
 * gold crest, arms, a deep red cushion and a round rug, so the head of the
 * table reads as theirs from across the room. Front faces -Z like `chair`.
 */
function gmThrone(wood: THREE.Material, accent: string) {
  const group = chair(wood, mat(accent, 0.85));
  const gold = mat("#c9a45c", 0.35, { metalness: 0.75 });
  const panel = box(0.52, 0.86, 0.05, wood);
  panel.position.set(0, 0.98, 0.24);
  panel.rotation.x = 0.1;
  const crest = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), gold);
  crest.position.set(0, 1.22, 0.208);
  crest.rotation.set(0.1, Math.PI, 0);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), gold);
  top.position.set(0, 1.47, 0.27);
  group.add(panel, crest, top);
  for (const s of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), gold);
    finial.position.set(s * 0.26, 1.42, 0.27);
    const arm = box(0.06, 0.05, 0.44, wood);
    arm.position.set(s * 0.27, 0.66, 0.0);
    const post = box(0.05, 0.22, 0.05, wood);
    post.position.set(s * 0.27, 0.54, -0.19);
    group.add(finial, arm, post);
  }
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.72, 40), mat(accent, 0.95));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, -0.05);
  rug.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 40), gold);
  trim.rotation.x = -Math.PI / 2;
  trim.position.set(0, 0.006, -0.05);
  group.add(rug, trim);
  return group;
}

/** A hanging dome lamp: shade, bright inside, on a cord from the ceiling. */
function pendant(look: Look, scale: number, drop: number) {
  const group = new THREE.Group();
  const profile = [[0.05, 0], [0.09, -0.02], [0.24, -0.1], [0.42, -0.25], [0.52, -0.36], [0.53, -0.38]].map(([x, y]) => new THREE.Vector2(x, y));
  // The profile runs top to bottom, so the lathe's front faces are the inside of the dome.
  const outer = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), new THREE.MeshStandardMaterial({ color: look.woodDark, roughness: 0.45, metalness: 0.3, side: THREE.BackSide }));
  const inner = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), new THREE.MeshBasicMaterial({ color: look.lamp, side: THREE.FrontSide, toneMapped: false }));
  inner.scale.setScalar(0.985);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.012, 6, 40), mat("#c9a45c", 0.35, { metalness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.38;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 16), mat("#c9a45c", 0.35, { metalness: 0.8 }));
  cap.position.y = 0.02;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: "#fff4d8", toneMapped: false }));
  bulb.position.y = -0.2;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, drop, 6), mat("#1e1a16", 0.8));
  cord.position.y = drop / 2 + 0.04;
  group.add(outer, inner, rim, cap, bulb, cord);
  group.scale.setScalar(scale);
  return group;
}

export function buildTabletop(theme: RoomTheme): BuiltRoom {
  const look = LOOKS[theme];
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const W = TABLETOP.halfX * 2;
  const D = TABLETOP.halfZ * 2;
  const H = TABLETOP.height;
  const glow = glowTexture();
  const addGlow = (colour: string, size: number, at: THREE.Vector3, opacity = 0.5, parent: THREE.Object3D = root) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    parent.add(sprite);
    return sprite;
  };
  const flickers: Array<{ mesh: THREE.Object3D; phase: number }> = [];
  // The candles on the rail are everyone's to snuff; the game master's lantern sets the room's mood.
  const kit = new ThingKit(root);
  const candles: THREE.Object3D[] = [];
  const candleGlows: THREE.Sprite[] = [];
  const rand = seeded(11);
  const dark = theme === "vampire" || theme === "matrix" || theme === "cyberpunk" || theme === "zombie" || theme === "galaxy";

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMaterial(look, W, D));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);

  // Round rug under the table, with a border.
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.1, 64), dress(mat(look.rug[2], 1), "carpet", { repeat: [5, 5] }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(TABLE_CENTRE.x, 0.006, TABLE_CENTRE.z);
  rug.receiveShadow = true;
  rug.userData.floor = true;
  const rugRing = new THREE.Mesh(new THREE.RingGeometry(2.78, 2.9, 64), mat(look.rug[1], 1));
  rugRing.rotation.x = -Math.PI / 2;
  rugRing.position.set(TABLE_CENTRE.x, 0.008, TABLE_CENTRE.z);
  rugRing.userData.floor = true;
  root.add(rug, rugRing);

  // Small rugs in the corners.
  for (const [x, z] of [[-4.5, -3.5], [4.5, -3.5], [-4.5, 3.5], [4.5, 3.5]] as const) {
    const cr = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), dress(mat(look.rug[0], 0.9), "carpet", { repeat: [1.6, 1.6] }));
    cr.rotation.x = -Math.PI / 2;
    cr.position.set(x, 0.007, z);
    cr.receiveShadow = true;
    cr.userData.floor = true;
    root.add(cr);
  }

  // Walls
  const wallMaterial = plasterOver(mat("#ffffff", 0.95, { map: wallTexture(look) }));
  const wainscot = woodMaterial(look.wainscot, 0.6, [6, 0.5]);
  const trim = mat(look.trim, 0.5);
  for (const [width, x, z, ry] of [[W, 0, -TABLETOP.halfZ, 0], [W, 0, TABLETOP.halfZ, Math.PI], [D, -TABLETOP.halfX, 0, Math.PI / 2], [D, TABLETOP.halfX, 0, -Math.PI / 2]] as const) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    root.add(wall);
    const inward = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.95), wainscot);
    lower.position.set(x + inward.x * 0.012, 0.475, z + inward.z * 0.012);
    lower.rotation.y = ry;
    root.add(lower);
    const rail = box(width, 0.05, 0.04, trim, false);
    rail.position.set(x + inward.x * 0.03, 0.96, z + inward.z * 0.03);
    rail.rotation.y = ry;
    root.add(rail);
    const skirting = box(width, 0.12, 0.03, trim, false);
    skirting.position.set(x + inward.x * 0.02, 0.06, z + inward.z * 0.02);
    skirting.rotation.y = ry;
    root.add(skirting);
    const crown = box(width, 0.1, 0.06, trim, false);
    crown.position.set(x + inward.x * 0.03, H - 0.05, z + inward.z * 0.03);
    crown.rotation.y = ry;
    ceiling.add(crown);
  }
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), dress(mat(look.ceiling, 1), "plaster", { repeat: [6, 5], bump: 0.4, rough: false, detail: false }));
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = H;
  ceiling.add(ceilingPlane);

  // Ceiling beams
  for (let x = -TABLETOP.halfX + 1.0; x < TABLETOP.halfX; x += 2.0) {
    const beam = box(0.18, 0.2, D, woodMaterial(look.beam, 0.75, [0.4, 4]), false);
    beam.position.set(x, H - 0.1, 0);
    ceiling.add(beam);
  }

  // The table: a pedestal, an apron, the map sunk into the top and a rail round it.
  const woodMat = woodMaterial(look.wood, 0.45, [2, 2]);
  const woodDark = woodMaterial(look.woodDark, 0.55, [2, 2]);
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_RADIUS - 0.02, TABLE_RADIUS - 0.06, 0.14, 64), woodDark);
  apron.position.set(TABLE_CENTRE.x, TABLE_SURFACE_Y - 0.08, TABLE_CENTRE.z);
  apron.castShadow = true;
  apron.receiveShadow = true;
  const railProfile = [
    [MAP_RADIUS, TABLE_SURFACE_Y - 0.01], [MAP_RADIUS, RAIL_TOP - 0.022], [MAP_RADIUS + 0.008, RAIL_TOP - 0.008], [MAP_RADIUS + 0.025, RAIL_TOP],
    [TABLE_RADIUS - 0.025, RAIL_TOP], [TABLE_RADIUS - 0.006, RAIL_TOP - 0.01], [TABLE_RADIUS, RAIL_TOP - 0.03], [TABLE_RADIUS, TABLE_SURFACE_Y - 0.01],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const rail = new THREE.Mesh(new THREE.LatheGeometry(railProfile, 96), dress(new THREE.MeshStandardMaterial({ color: look.wood, roughness: 0.4, side: THREE.DoubleSide }), "wood", { repeat: [12, 0.3], bump: 0.6 }));
  rail.position.set(TABLE_CENTRE.x, 0, TABLE_CENTRE.z);
  rail.castShadow = true;
  rail.receiveShadow = true;
  const inlay = new THREE.Mesh(new THREE.RingGeometry(RAIL_MID - 0.004, RAIL_MID + 0.004, 96), mat("#c9a45c", 0.35, { metalness: 0.7 }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(TABLE_CENTRE.x, RAIL_TOP + 0.001, TABLE_CENTRE.z);
  const mapMaterial = mat("#ffffff", 0.9, { map: mapTexture(theme) });
  const drawnMap = mapMaterial.map;
  const surface = new THREE.Mesh(new THREE.CircleGeometry(MAP_RADIUS, 96), mapMaterial);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(TABLE_CENTRE.x, TABLE_SURFACE_Y - 0.008, TABLE_CENTRE.z);
  surface.receiveShadow = true;
  // Clicked with a pawn in hand, it says where the pawn goes.
  surface.userData.tableMap = true;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, TABLE_SURFACE_Y - 0.15, 24), woodDark);
  column.position.set(TABLE_CENTRE.x, (TABLE_SURFACE_Y - 0.15) / 2, TABLE_CENTRE.z);
  column.castShadow = true;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 8, 24), woodMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(TABLE_CENTRE.x, 0.3, TABLE_CENTRE.z);
  root.add(apron, rail, inlay, surface, column, collar);

  // Carved feet with claws
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Group();
    const leg = box(0.12, 0.1, 0.8, woodDark);
    leg.position.set(0, 0.05, 0);
    foot.add(leg);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), mat(look.woodDark, 0.8));
    claw.rotation.x = Math.PI / 2;
    claw.position.set(0, 0.02, 0.38);
    foot.add(claw);
    foot.position.set(TABLE_CENTRE.x + Math.sin(a) * 0.45, 0, TABLE_CENTRE.z + Math.cos(a) * 0.45);
    foot.rotation.y = a;
    root.add(foot);
  }

  // On the rail: a candle between every other pair of chairs, drinks and dice pouches by the seats.
  const candleColour = theme === "vampire" ? "#2a0a10" : theme === "matrix" ? "#cfe8d6" : "#f5e6c8";
  for (let k = 0; k < TABLETOP.seats.length; k += 2) {
    const at = around(k * SEAT_STEP + SEAT_STEP / 2, RAIL_MID);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.012, 16), mat("#b08a3e", 0.35, { metalness: 0.75 }));
    dish.position.set(at.x, RAIL_TOP + 0.006, at.z);
    const c = candle(0.11, candleColour);
    c.position.set(at.x, RAIL_TOP + 0.012, at.z);
    root.add(dish, kit.tag(c, "candles"));
    flickers.push({ mesh: c.userData.flame, phase: k * 1.7 });
    candles.push(c.userData.flame);
    candleGlows.push(addGlow(look.lamp, 0.42, new THREE.Vector3(at.x, RAIL_TOP + 0.16, at.z), 0.45));
  }
  for (const [i, metal] of [[0, true], [2, false], [3, true], [5, false], [7, true], [8, false]] as const) {
    const at = around(seatAngle(i) + 0.17, RAIL_MID);
    const mug = tankard(metal);
    mug.position.set(at.x, RAIL_TOP, at.z);
    mug.rotation.y = rand() * Math.PI * 2;
    root.add(mug);
  }
  for (const i of [1, 4, 6, 9]) {
    const at = around(seatAngle(i) - 0.18, RAIL_MID);
    const pouch = dicePouch(look.pillows[i % look.pillows.length]);
    pouch.position.set(at.x, RAIL_TOP, at.z);
    pouch.rotation.y = rand() * Math.PI * 2;
    root.add(pouch);
  }

  // Ten chairs, each clickable to sit in; the game master's at the head.
  const chairWood = woodMaterial(look.woodDark, 0.5);
  const chairPad = fabric(look.sofaCushion, { repeat: [1.5, 1.5] });
  const throneRed = theme === "matrix" ? "#0b5d2a" : theme === "cyberpunk" ? "#6a1b9a" : "#7a1622";
  for (const seat of TABLETOP.seats) {
    const c = seat.reserved ? gmThrone(chairWood, throneRed) : chair(chairWood, chairPad);
    c.position.set(seat.x, 0, seat.z);
    c.rotation.y = -seat.facing;
    tagSeat(c, seat.id);
    root.add(c);
  }

  // The lamp over the table, and three smaller ones over the room.
  const lamp = pendant(look, 1, H - 2.1);
  lamp.position.set(TABLE_CENTRE.x, 2.06, TABLE_CENTRE.z);
  ceiling.add(lamp);
  addGlow(look.lamp, 0.9, new THREE.Vector3(TABLE_CENTRE.x, 1.86, TABLE_CENTRE.z), 0.3, ceiling);
  for (const [x, z] of [[-3, -2], [3, -2], [0, 3.2]] as const) {
    const small = pendant(look, 0.45, 1.3);
    small.position.set(x, H - 0.62, z);
    ceiling.add(small);
    addGlow(look.lamp, 0.55, new THREE.Vector3(x, H - 0.75, z), 0.25, ceiling);
  }

  // The table light: a spot on the map, soft at the edge so the rail falls into warm shadow.
  const tableLight = new THREE.SpotLight(look.lamp, dark ? 22 : 15, 7, Math.PI / 3.6, 0.6, 1.2);
  tableLight.position.set(TABLE_CENTRE.x, 1.95, TABLE_CENTRE.z);
  tableLight.target.position.set(TABLE_CENTRE.x, TABLE_SURFACE_Y, TABLE_CENTRE.z);
  tableLight.castShadow = true;
  tableLight.shadow.mapSize.set(1024, 1024);
  tableLight.shadow.camera.near = 0.3;
  tableLight.shadow.camera.far = 4;
  tableLight.shadow.bias = -0.0004;
  tableLight.shadow.normalBias = 0.02;
  tableLight.shadow.radius = 2;
  root.add(tableLight, tableLight.target);

  // Candle warmth round the table.
  const fillLight = new THREE.PointLight(look.fireLight, 2.4, 6, 1.8);
  fillLight.position.set(TABLE_CENTRE.x, TABLE_SURFACE_Y + 0.5, TABLE_CENTRE.z);
  root.add(fillLight);
  root.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2] * (dark ? 1 : 0.75)));

  // Wall sconces: pools of light on the walls, so the room has edges.
  for (const [x, z, ry] of [[-TABLETOP.halfX, 1.7, Math.PI / 2], [TABLETOP.halfX, 2.0, -Math.PI / 2], [-1.85, -TABLETOP.halfZ, 0], [1.85, -TABLETOP.halfZ, 0]] as const) {
    const sconce = new THREE.Group();
    const plate = box(0.12, 0.2, 0.025, mat("#b08a3e", 0.35, { metalness: 0.75 }), false);
    plate.position.z = 0.012;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), plate.material);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, 0, 0.09);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.13, 16, 1, true), new THREE.MeshStandardMaterial({ color: look.lamp, emissive: look.lamp, emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.6 }));
    shade.position.set(0, 0.07, 0.17);
    sconce.add(plate, arm, shade);
    sconce.position.set(x, 2.0, z);
    sconce.rotation.y = ry;
    root.add(sconce);
    const out = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const at = new THREE.Vector3(x, 2.07, z).addScaledVector(out, 0.17);
    addGlow(look.lamp, 0.9, at, 0.35);
    const light = new THREE.PointLight(look.lamp, dark ? 3.2 : 2.2, 4.5, 1.7);
    light.position.copy(at).addScaledVector(out, 0.1);
    root.add(light);
  }

  // Wall screen, its frame, and what it shows until someone shares.
  const idleScreen = idleTexture(theme, look);
  const screenMaterial = new THREE.MeshBasicMaterial({ map: idleScreen, toneMapped: false });
  const SW = 2.6;
  const SHt = 1.46;
  const frame = box(SW + 0.16, SHt + 0.16, 0.06, mat(look.woodDark, 0.5), false);
  frame.position.set(TABLETOP.tv.x, TABLETOP.tv.height, -TABLETOP.halfZ + 0.05);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SHt), screenMaterial);
  screen.position.set(TABLETOP.tv.x, TABLETOP.tv.height, -TABLETOP.halfZ + 0.09);
  root.add(frame, screen);

  // The sideboard under it: doors, a top, and on it the rulebooks, a dice tower and a tier of minis.
  const sideZ = -TABLETOP.halfZ + 0.26;
  const sideboard = box(2.8, 0.66, 0.44, woodMat);
  sideboard.position.set(0, 0.33, sideZ);
  const sideTop = box(2.9, 0.04, 0.5, woodDark);
  sideTop.position.set(0, 0.68, sideZ + 0.01);
  root.add(sideboard, sideTop);
  for (const x of [-0.93, 0, 0.93]) {
    const door = box(0.82, 0.5, 0.02, woodDark, false);
    door.position.set(x, 0.34, sideZ + 0.225);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat("#c9a45c", 0.35, { metalness: 0.8 }));
    knob.position.set(x + 0.3, 0.36, sideZ + 0.245);
    root.add(door, knob);
  }
  // A brass picture light under the screen, so what stands on the sideboard can be seen.
  const barY = TABLETOP.tv.height - SHt / 2 - 0.12;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 12), mat("#b08a3e", 0.35, { metalness: 0.75 }));
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, barY, -TABLETOP.halfZ + 0.12);
  const barGlow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.012, 0.03), new THREE.MeshBasicMaterial({ color: look.lamp, toneMapped: false }));
  barGlow.position.set(0, barY - 0.035, -TABLETOP.halfZ + 0.12);
  const sideLight = new THREE.PointLight(look.lamp, dark ? 2.2 : 1.6, 2.4, 1.6);
  sideLight.position.set(0, barY - 0.15, -TABLETOP.halfZ + 0.45);
  root.add(bar, barGlow, sideLight);
  const topY = 0.7;
  const bookColours = [look.rug[0], look.pillows[1], "#2a3a5e", look.rug[2]];
  for (let i = 0; i < 4; i++) {
    const book = box(0.3 - i * 0.02, 0.045, 0.22 - i * 0.01, mat(bookColours[i], 0.8));
    book.position.set(-1.1 + (rand() - 0.5) * 0.03, topY + 0.0225 + i * 0.045, sideZ + 0.02);
    book.rotation.y = (rand() - 0.5) * 0.3;
    root.add(book);
  }
  const tower = new THREE.Group();
  const towerBody = box(0.14, 0.32, 0.14, woodDark);
  towerBody.position.y = 0.16;
  const crenels = [-0.045, 0.045].flatMap((x) => [-0.045, 0.045].map((z) => {
    const merlon = box(0.04, 0.05, 0.04, woodDark);
    merlon.position.set(x, 0.345, z);
    return merlon;
  }));
  const mouth = box(0.1, 0.08, 0.02, mat("#120c08", 1), false);
  mouth.position.set(0, 0.05, 0.07);
  const tray = box(0.16, 0.025, 0.14, woodMat);
  tray.position.set(0, 0.0125, 0.14);
  tower.add(towerBody, ...crenels, mouth, tray);
  tower.position.set(-0.62, topY, sideZ - 0.04);
  root.add(tower);
  const tiers = [box(0.9, 0.05, 0.2, woodDark), box(0.9, 0.05, 0.12, woodDark)];
  tiers[0].position.set(0.75, topY + 0.025, sideZ + 0.03);
  tiers[1].position.set(0.75, topY + 0.075, sideZ - 0.03);
  root.add(...tiers);
  const display: Array<[MiniKind, string, number, number, number]> = [
    ["fighter", look.pillows[0], 0.42, 0.05, 0.085],
    ["wizard", "#3b4fa8", 0.6, 0.05, 0.085],
    ["rogue", "#2f3a2c", 0.78, 0.05, 0.085],
    ["cleric", "#e8e0d0", 0.96, 0.05, 0.085],
    ["dragon", theme === "cyberpunk" ? "#9b5cff" : "#8a1c1c", 0.72, 0.1, 0.13],
  ];
  for (const [kind, colour, x, y, size] of display) {
    const mini = miniFigure(kind, colour, size);
    mini.position.set(x, topY + y, sideZ + (y > 0.06 ? -0.03 : 0.07));
    mini.rotation.y = (rand() - 0.5) * 0.4;
    root.add(mini);
  }

  // Bookcases on the west and east walls.
  const spines = canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#140b06";
    ctx.fillRect(0, 0, 512, 512);
    const colours = [...look.pillows, look.rug[0], look.rug[1], look.rug[2], "#d9cba0", "#5e1a1a", "#2a3a2e"];
    for (let row = 0; row < 5; row++) {
      let x = 6;
      while (x < 500) {
        if (rand() < 0.05) { x += 18; continue; }
        const w = 12 + Math.floor(rand() * 16);
        const h = 66 + Math.floor(rand() * 28);
        const lean = rand() < 0.08;
        ctx.save();
        if (lean) { ctx.translate(x, row * 102.4 + 100); ctx.rotate(0.18); ctx.translate(-x, -(row * 102.4 + 100)); }
        ctx.fillStyle = colours[Math.floor(rand() * colours.length)];
        ctx.fillRect(x, row * 102.4 + 100 - h, w, h);
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x + w - 3, row * 102.4 + 100 - h, 3, h);
        if (rand() < 0.45) {
          ctx.fillStyle = "#c9a45c";
          ctx.fillRect(x + 2, row * 102.4 + 100 - h + 6, w - 4, 2);
          ctx.fillRect(x + 2, row * 102.4 + 100 - 10, w - 4, 2);
        }
        ctx.restore();
        x += w + 1;
      }
    }
  });
  for (const side of [-1, 1]) {
    const shelves = bookcase(3.0, 2.2, 0.34, woodDark, spines);
    shelves.position.set(side * (TABLETOP.halfX - 0.17), 0, -1.2);
    shelves.rotation.y = -side * Math.PI / 2;
    root.add(shelves);
  }

  // The miniatures cabinet on the west wall: glass front, lit shelves, a painted army.
  const cabinet = new THREE.Group();
  const cabW = 1.1, cabH = 1.8, cabD = 0.36;
  const cabBack = box(cabW, cabH, 0.02, woodDark, false);
  cabBack.position.set(0, cabH / 2, -cabD / 2 + 0.01);
  cabinet.add(cabBack);
  for (const s of [-1, 1]) {
    const side = box(0.05, cabH, cabD, woodDark);
    side.position.set(s * (cabW / 2 - 0.025), cabH / 2, 0);
    cabinet.add(side);
  }
  const cabTop = box(cabW + 0.06, 0.06, cabD + 0.04, woodDark);
  cabTop.position.set(0, cabH, 0);
  const cabFoot = box(cabW, 0.12, cabD, woodDark);
  cabFoot.position.set(0, 0.06, 0);
  cabinet.add(cabTop, cabFoot);
  const kinds: MiniKind[] = ["fighter", "wizard", "rogue", "cleric"];
  const paints = [...look.pillows, "#3b4fa8", "#8a1c1c", "#2f6b3a", "#c9a45c"];
  for (let level = 0; level < 4; level++) {
    const y = 0.14 + level * 0.42;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.1, 0.012, cabD - 0.04), new THREE.MeshStandardMaterial({ color: "#d8ecf0", roughness: 0.1, transparent: true, opacity: 0.35 }));
    glass.position.set(0, y, 0);
    cabinet.add(glass);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.12, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: look.lamp, toneMapped: false }));
    strip.position.set(0, y + 0.4, cabD / 2 - 0.04);
    cabinet.add(strip);
    if (level === 3) {
      const wyrm = miniFigure("dragon", theme === "cyberpunk" ? "#00f0ff" : theme === "matrix" ? "#00c853" : "#2f5e8a", 0.2);
      wyrm.position.set(0, y + 0.006, 0);
      wyrm.rotation.y = 0.4;
      cabinet.add(wyrm);
      continue;
    }
    for (let i = 0; i < 5; i++) {
      const kind = level === 0 && i === 2 ? "beast" : kinds[(i + level) % kinds.length];
      const mini = miniFigure(kind, paints[(i * 3 + level) % paints.length], kind === "beast" ? 0.13 : 0.11);
      mini.position.set(-0.4 + i * 0.2, y + 0.006, (i % 2 ? -0.05 : 0.05));
      mini.rotation.y = (rand() - 0.5) * 0.6;
      cabinet.add(mini);
    }
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(cabW - 0.1, cabH - 0.14), new THREE.MeshStandardMaterial({ color: "#cfe6ee", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12, depthWrite: false }));
  pane.position.set(0, cabH / 2 + 0.04, cabD / 2);
  cabinet.add(pane);
  cabinet.position.set(-TABLETOP.halfX + cabD / 2, 0, 1.9);
  cabinet.rotation.y = Math.PI / 2;
  // Clicked, it opens: take a miniature to the table.
  cabinet.userData.cabinet = true;
  root.add(cabinet);
  addGlow(look.lamp, 1.6, new THREE.Vector3(-TABLETOP.halfX + 0.3, 1.0, 1.9), 0.18);

  // Plants in the south corners
  for (const [x, z, s] of [[TABLETOP.halfX - 0.5, TABLETOP.halfZ - 0.5, 1.4], [-TABLETOP.halfX + 0.5, TABLETOP.halfZ - 0.5, 1.2]] as const) {
    const p = plant(look, s, theme === "vampire" ? "#2f3d2a" : theme === "matrix" ? "#1d6b35" : theme === "cyberpunk" ? "#2fbf8f" : "#4f8f4f");
    p.position.set(x, 0, z);
    root.add(p);
  }

  // String lights along the north wall
  const bulbs: THREE.Mesh[] = [];
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    const p = new THREE.Vector3(-TABLETOP.halfX + 0.4 + t * (W - 0.8), H - 0.25 - Math.sin(t * Math.PI * 4) ** 2 * 0.15, -TABLETOP.halfZ + 0.05);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: look.fairy[i % look.fairy.length], toneMapped: false }));
    b.position.copy(p);
    b.userData.phase = i * 0.7;
    bulbs.push(b);
    root.add(b);
    if (i % 3 === 0) addGlow(look.fairy[i % look.fairy.length], 0.3, p, 0.45);
  }

  // Props from the shared list
  const stopProps = addPropList(root, TABLETOP_PROPS[theme], addGlow);

  kit.onSwitch("candles", (k) => {
    for (const flame of candles) flame.visible = k > 0.02;
    for (const glowSprite of candleGlows) { glowSprite.material.opacity = 0.45 * k; glowSprite.visible = k > 0.02; }
  }, 3);

  // The mood lantern, on the rail at the game master's chair: warm, dungeon (cold and low) or storm.
  const gmSeat = TABLETOP.seats.findIndex((seat) => seat.reserved);
  const lanternAt = around(seatAngle(Math.max(0, gmSeat)) + 0.2, RAIL_MID);
  const lantern = new THREE.Group();
  const brass = mat("#b08a3e", 0.35, { metalness: 0.8 });
  for (const [y, h] of [[0.005, 0.01], [0.13, 0.012]] as const) {
    const plate = box(0.08, h, 0.08, brass, false);
    plate.position.y = y;
    lantern.add(plate);
  }
  for (const [x, z] of [[-0.035, -0.035], [0.035, -0.035], [-0.035, 0.035], [0.035, 0.035]] as const) {
    const bar = box(0.008, 0.12, 0.008, brass, false);
    bar.position.set(x, 0.07, z);
    lantern.add(bar);
  }
  const lanternFlame = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: look.lamp, toneMapped: false }));
  lanternFlame.scale.y = 1.6;
  lanternFlame.position.y = 0.065;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 12), brass);
  ring.position.y = 0.15;
  lantern.add(lanternFlame, ring);
  lantern.position.set(lanternAt.x, RAIL_TOP, lanternAt.z);
  root.add(kit.tag(lantern, "mood"));
  const lanternGlow = addGlow(look.lamp, 0.35, new THREE.Vector3(lanternAt.x, RAIL_TOP + 0.07, lanternAt.z), 0.5);

  // Every light in the room, as built: the moods scale and tint them from here.
  const roomLights: Array<{ light: THREE.Light; base: number; colour: THREE.Color }> = [];
  root.traverse((object) => {
    const light = object as THREE.Light;
    if (light.isLight && light !== fillLight) roomLights.push({ light, base: light.intensity, colour: light.color.clone() });
  });
  const hemi = roomLights.find((entry) => (entry.light as THREE.HemisphereLight).isHemisphereLight);
  const fog = new THREE.Fog(look.fog, 12, 26);
  const fogBase = fog.color.clone();
  const MOODS: Record<TableMood, { light: number; table: number; tint: number; lantern: string }> = {
    warm: { light: 1, table: 1, tint: 0, lantern: look.lamp },
    dungeon: { light: 0.4, table: 0.75, tint: 0.5, lantern: "#7f9cff" },
    storm: { light: 0.3, table: 0.6, tint: 0.6, lantern: "#c7d6ff" },
  };
  const cold = new THREE.Color("#6f86ff");
  const moodNow = { light: 1, table: 1, tint: 0 };
  let moodWant = MOODS.warm;
  let stopRain: (() => void) | null = null;
  let nextBolt = 0;
  let bolt = -10;
  kit.onMood((mood, instant) => {
    moodWant = MOODS[mood];
    if (instant) Object.assign(moodNow, { light: moodWant.light, table: moodWant.table, tint: moodWant.tint });
    lanternFlame.material.color.set(moodWant.lantern);
    lanternGlow.material.color.set(moodWant.lantern);
    if (mood === "storm" && !stopRain) { stopRain = startRain(); nextBolt = 0; }
    if (mood !== "storm" && stopRain) { stopRain(); stopRain = null; }
  });
  const applyMood = (t: number, dt: number) => {
    const k = Math.min(1, dt * 1.2);
    moodNow.light += (moodWant.light - moodNow.light) * k;
    moodNow.table += (moodWant.table - moodNow.table) * k;
    moodNow.tint += (moodWant.tint - moodNow.tint) * k;
    // Storm: lightning now and then, a double flash, and the thunder after it.
    let flash = 0;
    if (stopRain) {
      if (!nextBolt) nextBolt = t + 3 + Math.random() * 6;
      if (t > nextBolt) { bolt = t; nextBolt = t + 7 + Math.random() * 12; const far = Math.random(); setTimeout(() => playThunder(far), 300 + far * 2200); }
      const since = t - bolt;
      flash = since < 0.09 ? 1 : since > 0.16 && since < 0.24 ? 0.7 : 0;
    }
    for (const entry of roomLights) {
      const scale = entry.light === tableLight ? moodNow.table : moodNow.light;
      entry.light.intensity = entry.base * scale;
      entry.light.color.copy(entry.colour).lerp(cold, moodNow.tint);
    }
    if (hemi) {
      hemi.light.intensity = hemi.base * moodNow.light + flash * 6;
      if (flash) hemi.light.color.set("#e6eeff");
    }
    fog.color.copy(fogBase).lerp(cold, moodNow.tint * 0.25).multiplyScalar(0.5 + moodNow.light * 0.5);
  };

  // What never moves, baked into a few meshes (the room drew some 640 objects one at a time).
  kit.settle();
  mergeStatics(root, [ceiling]);

  let lastT = 0;
  const update = (t: number, dt = t - lastT) => {
    lastT = t;
    kit.update(t, dt);
    applyMood(t, Math.max(0, Math.min(0.1, dt)));
    for (const { mesh, phase } of flickers) {
      mesh.scale.y = 0.85 + Math.sin(t * 9 + phase) * 0.14 + Math.sin(t * 23 + phase * 2) * 0.07;
    }
    for (const b of bulbs) b.scale.setScalar(0.75 + Math.sin(t * 1.4 + (b.userData.phase as number)) * 0.25);
    fillLight.intensity = 2.4 * kit.level("candles") * (0.4 + 0.6 * moodNow.light) * (1 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.03);
  };

  /**
   * Puts an uploaded battle map on the table (null: the drawn one back). The
   * image is cropped to fill the round map, turned in quarter turns and zoomed.
   */
  let uploaded: THREE.Texture | null = null;
  const setTableMap = (image: HTMLImageElement | null, turns = 0, zoom = 1) => {
    uploaded?.dispose();
    uploaded = null;
    pixels = null;
    if (!image) {
      mapMaterial.map = drawnMap;
      mapMaterial.needsUpdate = true;
      return;
    }
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
    // Fill the circle's square: crop the long side, then zoom in about the middle.
    const sx = (aspect > 1 ? 1 / aspect : 1) / zoom;
    const sy = (aspect > 1 ? 1 : aspect) / zoom;
    // Scaling and turning are about the centre, so the crop stays in the middle with no offset.
    texture.repeat.set(sx, sy);
    texture.center.set(0.5, 0.5);
    texture.rotation = -turns * (Math.PI / 2);
    texture.needsUpdate = true;
    uploaded = texture;
    mapMaterial.map = texture;
    mapMaterial.needsUpdate = true;
  };

  /**
   * The map's colour under a point on the table (sRGB 0-255), read from a
   * small copy of whichever map is showing; null off the map or when the
   * image cannot be read.
   */
  let pixels: { data: Uint8ClampedArray; w: number; h: number } | null | false = null;
  const uv = new THREE.Vector2();
  const mapColourAt = (x: number, z: number): [number, number, number] | null => {
    const dx = x - TABLE_CENTRE.x;
    const dz = z - TABLE_CENTRE.z;
    if (Math.hypot(dx, dz) > MAP_RADIUS) return null;
    const texture = mapMaterial.map;
    const source = texture?.image as (HTMLImageElement | HTMLCanvasElement) | undefined;
    if (!texture || !source) return null;
    if (pixels === null) {
      try {
        const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        const scale = Math.min(1, 256 / Math.max(sw, sh, 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        pixels = { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
      } catch {
        // A picture the browser will not let us read: no colours, never an error.
        pixels = false;
      }
    }
    if (!pixels) return null;
    // The circle's own UVs (its +Y is the room's -Z), then the map's crop, turn and zoom.
    texture.updateMatrix();
    uv.set(0.5 + dx / (2 * MAP_RADIUS), 0.5 - dz / (2 * MAP_RADIUS)).applyMatrix3(texture.matrix);
    const u = Math.min(1, Math.max(0, uv.x));
    const v = Math.min(1, Math.max(0, uv.y));
    const px = Math.min(pixels.w - 1, Math.floor(u * pixels.w));
    const py = Math.min(pixels.h - 1, Math.floor((texture.flipY ? 1 - v : v) * pixels.h));
    // A few pixels round it, so a grid line under the base does not decide.
    const sum = [0, 0, 0];
    let n = 0;
    for (let oy = -2; oy <= 2; oy += 2) {
      for (let ox = -2; ox <= 2; ox += 2) {
        const qx = Math.min(pixels.w - 1, Math.max(0, px + ox));
        const qy = Math.min(pixels.h - 1, Math.max(0, py + oy));
        const i = (qy * pixels.w + qx) * 4;
        sum[0] += pixels.data[i]; sum[1] += pixels.data[i + 1]; sum[2] += pixels.data[i + 2];
        n++;
      }
    }
    return [sum[0] / n, sum[1] / n, sum[2] / n];
  };

  return {
    root,
    ceiling,
    screenMaterial,
    idleScreen,
    setTableMap,
    mapColourAt,
    background: new THREE.Color(look.background),
    fog,
    exposure: look.exposure,
    update,
    things: kit.api({
      label: (id) => id === "candles" ? (kit.wanted("candles") ? "Snuff the candles" : "Light the candles")
        : id === "mood" ? `Mood: ${kit.currentMood} (game master: click for ${({ warm: "dungeon", dungeon: "storm", storm: "warm" } as const)[kit.currentMood]})` : null,
      switched: (id, on) => { if (on) playIgnite(); else playDouse(); },
    }),
    dispose: () => { stopProps(); glow.dispose(); uploaded?.dispose(); stopRain?.(); kit.dispose(); },
  };
}
