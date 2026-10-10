/**
 * Builds the Living Room's furniture and atmosphere in three.js.
 *
 * The floor plan (seats, solids) comes from lib/living-room and is the same for
 * everyone; this file decides how it looks. Each Hoffle theme with a strong
 * mood gets its own room: a warm cabin by default, a candlelit gothic parlour
 * for Vampire, a green-lit hacker den for Matrix and a neon flat for Cyberpunk.
 * Everything is procedural (canvas textures, primitives) so nothing is fetched.
 */
import * as THREE from "three";
import type { RoomTheme } from "../hooks/use-living-room";
import { LOUNGE_SEATS, NOOK, ROOM_HALF_X, ROOM_HALF_Z, ROOM_HEIGHT, seatById } from "../lib/living-room";

interface Look {
  floor: [string, string]; // plank, grain
  wall: [string, string]; // base, pattern
  wallPattern: "stripes" | "damask" | "code" | "panels";
  wainscot: string;
  trim: string;
  ceiling: string;
  beam: string;
  rug: [string, string, string];
  sofa: string;
  sofaCushion: string;
  pillows: string[];
  blanket: [string, string];
  wood: string;
  woodDark: string;
  fire: [string, string];
  fireLight: string;
  lamp: string;
  hemi: [string, string, number];
  fog: string;
  background: string;
  fairy: string[];
  motes: string;
  exposure: number;
  sky: "time" | "moon" | "code" | "city" | "overcast";
  shark: string;
}

const LOOKS: Record<RoomTheme, Look> = {
  cozy: {
    floor: ["#8a5d3b", "#6b4429"], wall: ["#e8d5b9", "#dcc4a2"], wallPattern: "stripes",
    wainscot: "#7b5236", trim: "#f3e6d0", ceiling: "#d8c3a3", beam: "#5e3c26",
    rug: ["#9c3f3a", "#e6b86a", "#3e5a6b"], sofa: "#6c7f5a", sofaCushion: "#7d916a",
    pillows: ["#e3a857", "#c86b4c", "#f0dcb8", "#8a5a83"], blanket: ["#c4683f", "#efd9b4"],
    wood: "#7a4f31", woodDark: "#4f321f", fire: ["#ffd27a", "#ff6a1f"], fireLight: "#ff9a4a", lamp: "#ffcf8a",
    hemi: ["#ffe2bd", "#3a2416", 0.42], fog: "#24160f", background: "#1a110c",
    fairy: ["#ffd27a", "#ffb35c", "#fff0c2"], motes: "#ffd9a0", exposure: 1.05, sky: "time", shark: "#5a8fb8",
  },
  vampire: {
    floor: ["#2a1416", "#1a0b0d"], wall: ["#2b0d14", "#47121f"], wallPattern: "damask",
    wainscot: "#160709", trim: "#6b4a2a", ceiling: "#1a0a0d", beam: "#120506",
    rug: ["#5e0b16", "#b08a3e", "#14060a"], sofa: "#6d0f1d", sofaCushion: "#86182a",
    pillows: ["#b08a3e", "#2d0a10", "#9c1328", "#3b1f3d"], blanket: ["#3b1f3d", "#9c1328"],
    wood: "#2a1612", woodDark: "#150a08", fire: ["#ff5a4a", "#9c0f1f"], fireLight: "#ff3b3b", lamp: "#ff8a5a",
    hemi: ["#7a4a8a", "#200508", 0.32], fog: "#14050a", background: "#0b0306",
    fairy: ["#ff3b4f", "#b08a3e", "#ff7a6a"], motes: "#ff6a6a", exposure: 1.1, sky: "moon", shark: "#2d2d38",
  },
  matrix: {
    floor: ["#0e1410", "#071009"], wall: ["#020803", "#00ff66"], wallPattern: "code",
    wainscot: "#050a06", trim: "#0f2a16", ceiling: "#020503", beam: "#06120a",
    rug: ["#06160b", "#00c853", "#0a2a14"], sofa: "#141a16", sofaCushion: "#1d2620",
    pillows: ["#00c853", "#0a3d1c", "#1d2620", "#6dff9e"], blanket: ["#0a3d1c", "#00e676"],
    wood: "#18201a", woodDark: "#0b100c", fire: ["#b9ffcf", "#00e676"], fireLight: "#22ff77", lamp: "#7dffaa",
    hemi: ["#3dff8a", "#010402", 0.28], fog: "#010803", background: "#000400",
    fairy: ["#00ff66", "#6dff9e", "#00c853"], motes: "#4dff88", exposure: 1.15, sky: "code", shark: "#1f3a27",
  },
  academia: {
    floor: ["#3a2416", "#22140b"], wall: ["#1f3326", "#1b2c21"], wallPattern: "stripes",
    wainscot: "#3b2416", trim: "#c9a45c", ceiling: "#241a12", beam: "#24170e",
    rug: ["#5e1a1a", "#c9a45c", "#1a2b20"], sofa: "#1f4a33", sofaCushion: "#24563c",
    pillows: ["#6b1f1f", "#c9a45c", "#ebdfc4", "#3b2416"], blanket: ["#2b3a2e", "#9b3030"],
    wood: "#4a2c1a", woodDark: "#2a170c", fire: ["#ffcf80", "#ff7a2a"], fireLight: "#ff9a50", lamp: "#ffd59a",
    hemi: ["#c9b48a", "#1a120b", 0.45], fog: "#0e0b08", background: "#0b0906",
    fairy: ["#ffd59a", "#ffe6b8", "#f3c27a"], motes: "#ffe2b0", exposure: 1.2, sky: "overcast", shark: "#5a8fb8",
  },
  cyberpunk: {
    floor: ["#1a1430", "#100c22"], wall: ["#1b1235", "#2a1a50"], wallPattern: "panels",
    wainscot: "#120c26", trim: "#ff2fb4", ceiling: "#0e0a20", beam: "#1a1238",
    rug: ["#2a1a50", "#00f0ff", "#ff2fb4"], sofa: "#2b2250", sofaCushion: "#3a2e6a",
    pillows: ["#ff2fb4", "#00f0ff", "#ffe94a", "#9b5cff"], blanket: ["#9b5cff", "#00f0ff"],
    wood: "#2a2340", woodDark: "#17122a", fire: ["#9ff8ff", "#ff2fb4"], fireLight: "#ff4fd0", lamp: "#00f0ff",
    hemi: ["#7a5cff", "#0a0418", 0.38], fog: "#0b0620", background: "#06030f",
    fairy: ["#ff2fb4", "#00f0ff", "#ffe94a"], motes: "#9ff8ff", exposure: 1.1, sky: "city", shark: "#ff7ad1",
  },
};

/* ---------- procedural textures ---------- */

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

/** A seeded random so the room is the same every time it is built. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function floorTexture(look: Look) {
  const rand = seeded(7);
  return canvasTexture(512, 512, (ctx) => {
    const base = new THREE.Color(look.floor[0]);
    const rows = 8;
    const h = 512 / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 200;
      while (x < 512) {
        const w = 160 + rand() * 180;
        const shade = base.clone().offsetHSL(0, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.08);
        ctx.fillStyle = `#${shade.getHexString()}`;
        ctx.fillRect(x, r * h, w, h);
        ctx.strokeStyle = look.floor[1];
        ctx.globalAlpha = 0.35;
        for (let g = 0; g < 5; g++) {
          ctx.beginPath();
          const y = r * h + 4 + rand() * (h - 8);
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + w * 0.3, y + (rand() - 0.5) * 6, x + w * 0.6, y + (rand() - 0.5) * 6, x + w, y);
          ctx.lineWidth = 0.6 + rand();
          ctx.stroke();
        }
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = look.floor[1];
        ctx.fillRect(x, r * h, 2, h);
        ctx.globalAlpha = 1;
        x += w;
      }
      ctx.fillStyle = look.floor[1];
      ctx.fillRect(0, r * h, 512, 2);
    }
  }, [ROOM_HALF_X / 1.5, ROOM_HALF_Z / 1.5]);
}

function wallTexture(look: Look) {
  const [base, accent] = look.wall;
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    if (look.wallPattern === "stripes") {
      ctx.fillStyle = accent;
      for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 22, 256);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#ffffff";
      for (let x = 30; x < 256; x += 64) ctx.fillRect(x, 0, 3, 256);
    } else if (look.wallPattern === "damask") {
      ctx.strokeStyle = accent;
      ctx.fillStyle = accent;
      ctx.lineWidth = 3;
      for (const [cx, cy] of [[64, 64], [192, 192], [192, 64 - 128 + 128], [64, 192]] as const) {
        if ((cx === 192 && cy === 64) || (cx === 64 && cy === 192)) {
          ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(cx, cy - 46);
        ctx.bezierCurveTo(cx + 34, cy - 20, cx + 30, cy + 22, cx, cy + 46);
        ctx.bezierCurveTo(cx - 30, cy + 22, cx - 34, cy - 20, cx, cy - 46);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(cx + s * 24, cy - 6, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    } else if (look.wallPattern === "panels") {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      for (let x = 0; x < 256; x += 128) for (let y = 0; y < 256; y += 128) ctx.strokeRect(x + 6, y + 6, 116, 116);
      ctx.fillStyle = "rgba(0,240,255,0.08)";
      ctx.fillRect(0, 120, 256, 6);
    }
  }, look.wallPattern === "code" ? undefined : [ROOM_HALF_X / 1.2, 1]);
}

const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓ0123456789:=+<>";

/** The Matrix walls: falling green glyphs, redrawn a few times a second. */
function codeRain(width: number, height: number, columns: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const cell = width / columns;
  const drops = Array.from({ length: columns }, () => Math.random() * (height / cell));
  ctx.fillStyle = "#010603";
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const step = () => {
    ctx.fillStyle = "rgba(1, 6, 3, 0.18)";
    ctx.fillRect(0, 0, width, height);
    ctx.font = `${cell}px monospace`;
    for (let i = 0; i < columns; i++) {
      const y = drops[i] * cell;
      ctx.fillStyle = Math.random() < 0.1 ? "#d8ffe4" : "#00e060";
      ctx.fillText(GLYPHS[Math.floor(Math.random() * GLYPHS.length)], i * cell, y);
      drops[i] = y > height && Math.random() > 0.96 ? 0 : drops[i] + 1;
    }
    texture.needsUpdate = true;
  };
  return { texture, step };
}

function rugTexture(look: Look) {
  const [a, b, c] = look.rug;
  return canvasTexture(512, 512, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = b;
    ctx.lineWidth = 14;
    ctx.strokeRect(20, 20, 472, 472);
    ctx.lineWidth = 4;
    ctx.strokeRect(48, 48, 416, 416);
    ctx.fillStyle = c;
    for (let i = 0; i < 12; i++) {
      for (const [x, y] of [[60 + i * 36, 34], [60 + i * 36, 478], [34, 60 + i * 36], [478, 60 + i * 36]]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y);
        ctx.fill();
      }
    }
    // Central medallion.
    ctx.save();
    ctx.translate(256, 256);
    for (let r = 150; r > 20; r -= 26) {
      ctx.fillStyle = (r / 26) % 2 < 1 ? b : c;
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0);
      ctx.fill();
    }
    ctx.restore();
    // Wool: fine noise.
    const image = ctx.getImageData(0, 0, 512, 512);
    const rand = seeded(3);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (rand() - 0.5) * 22;
      image.data[i] += n; image.data[i + 1] += n; image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
  });
}

function knitTexture([a, b]: [string, string]) {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = b;
    ctx.lineWidth = 5;
    for (let y = 8; y < 128; y += 32) {
      ctx.beginPath();
      for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, y + ((x / 16) % 2 ? 10 : 0));
      ctx.stroke();
    }
  }, [2, 2]);
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

/** Warm by evening, blue at night, bright by day: the cosy window follows the viewer's own clock. */
export function skyColour(date = new Date()): THREE.Color {
  const h = date.getHours() + date.getMinutes() / 60;
  const stops: Array<[number, string]> = [
    [0, "#0b1030"], [5, "#1b1f4a"], [6.5, "#f3a37a"], [8, "#9fd3ff"], [17, "#8cc8ff"],
    [19, "#f08a5d"], [20.5, "#3a2a5e"], [22, "#0e1238"], [24, "#0b1030"],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [h1, c1] = stops[i];
    const [h0, c0] = stops[i - 1];
    if (h <= h1) return new THREE.Color(c0).lerp(new THREE.Color(c1), (h - h0) / (h1 - h0));
  }
  return new THREE.Color(stops[0][1]);
}
export const isNight = (date = new Date()) => date.getHours() >= 20 || date.getHours() < 6;

function skyTexture(look: Look) {
  const night = isNight();
  return canvasTexture(512, 400, (ctx) => {
    const rand = seeded(11);
    if (look.sky === "time") {
      const top = skyColour();
      const g = ctx.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, `#${top.clone().multiplyScalar(0.8).getHexString()}`);
      g.addColorStop(1, `#${top.clone().lerp(new THREE.Color("#ffd8a8"), night ? 0.05 : 0.35).getHexString()}`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 400);
      if (night) {
        ctx.fillStyle = "#fffbe0";
        for (let i = 0; i < 70; i++) ctx.fillRect(rand() * 512, rand() * 260, 1.5, 1.5);
        ctx.beginPath(); ctx.arc(380, 90, 26, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (let i = 0; i < 4; i++) {
          const x = rand() * 512; const y = 40 + rand() * 140;
          for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.arc(x + j * 18, y + (j % 2) * 6, 18, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      // Pine hills.
      ctx.fillStyle = night ? "#0a1410" : "#2f5a3a";
      for (let x = -20; x < 540; x += 26) {
        const h = 60 + rand() * 70;
        ctx.beginPath(); ctx.moveTo(x, 400); ctx.lineTo(x + 18, 400 - h); ctx.lineTo(x + 36, 400); ctx.fill();
      }
    } else if (look.sky === "moon") {
      const g = ctx.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, "#08020a"); g.addColorStop(1, "#3a0a1a");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 400);
      ctx.fillStyle = "#ffe9e0";
      for (let i = 0; i < 50; i++) ctx.fillRect(rand() * 512, rand() * 300, 1.2, 1.2);
      const moon = ctx.createRadialGradient(300, 130, 10, 300, 130, 110);
      moon.addColorStop(0, "rgba(255,230,220,1)"); moon.addColorStop(0.45, "rgba(255,200,190,0.95)"); moon.addColorStop(0.5, "rgba(200,40,60,0.25)"); moon.addColorStop(1, "rgba(120,0,20,0)");
      ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(300, 130, 110, 0, Math.PI * 2); ctx.fill();
      // A ruined castle on the hill.
      ctx.fillStyle = "#050103";
      ctx.beginPath(); ctx.moveTo(0, 400); ctx.quadraticCurveTo(256, 280, 512, 360); ctx.lineTo(512, 400); ctx.fill();
      for (const [x, w, h] of [[120, 30, 120], [160, 60, 80], [230, 22, 150], [260, 50, 70]]) {
        ctx.fillRect(x, 330 - h, w, h + 60);
        for (let k = 0; k < w; k += 10) ctx.fillRect(x + k, 322 - h, 6, 8);
      }
    } else if (look.sky === "overcast") {
      // A grey, rain-heavy afternoon (or a black wet night) over college spires.
      const g = ctx.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, night ? "#0d1115" : "#5d666b");
      g.addColorStop(1, night ? "#1c2228" : "#8d9590");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 400);
      ctx.fillStyle = night ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.12)";
      for (let i = 0; i < 6; i++) {
        const x = rand() * 512; const y = 30 + rand() * 120;
        for (let j = 0; j < 6; j++) { ctx.beginPath(); ctx.arc(x + j * 24, y + (j % 2) * 8, 26, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = night ? "#06080a" : "#2c3330";
      ctx.fillRect(0, 330, 512, 70);
      for (const [x, w, h] of [[30, 60, 120], [110, 30, 200], [150, 80, 110], [260, 26, 230], [300, 90, 130], [420, 50, 160]]) {
        ctx.fillRect(x, 400 - h, w, h);
        ctx.beginPath(); ctx.moveTo(x - 4, 400 - h); ctx.lineTo(x + w / 2, 400 - h - w * 0.9); ctx.lineTo(x + w + 4, 400 - h); ctx.fill();
        // Lit windows in the old halls.
        for (let wy = 400 - h + 14; wy < 390; wy += 22) for (let wx = x + 6; wx < x + w - 8; wx += 14) {
          if (rand() < (night ? 0.4 : 0.15)) { ctx.fillStyle = "#e8b860"; ctx.fillRect(wx, wy, 5, 9); ctx.fillStyle = night ? "#06080a" : "#2c3330"; }
        }
      }
    } else if (look.sky === "code") {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, 400);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, "#090322"); g.addColorStop(0.7, "#3a0f5a"); g.addColorStop(1, "#ff2fb4");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 400);
      // Skyline in three layers, lit windows and a couple of neon signs.
      for (const [layer, colour] of [[0, "#1c1040"], [1, "#120a2c"], [2, "#07031a"]] as const) {
        let x = -10;
        while (x < 520) {
          const w = 30 + rand() * 50; const h = 120 + rand() * 180 - layer * 40;
          ctx.fillStyle = colour; ctx.fillRect(x, 400 - h, w, h);
          for (let wy = 400 - h + 8; wy < 395; wy += 12) for (let wx = x + 4; wx < x + w - 4; wx += 8) {
            if (rand() < 0.35) { ctx.fillStyle = rand() < 0.5 ? "#ffd86a" : rand() < 0.5 ? "#00f0ff" : "#ff7ad1"; ctx.fillRect(wx, wy, 3, 5); }
          }
          x += w + 4;
        }
      }
      ctx.font = "bold 26px sans-serif"; ctx.shadowBlur = 14;
      ctx.shadowColor = ctx.fillStyle = "#ff2fb4"; ctx.fillText("ラーメン", 40, 200);
      ctx.shadowColor = ctx.fillStyle = "#00f0ff"; ctx.fillText("HOFFLE", 340, 170);
    }
  });
}

/* ---------- geometry helpers ---------- */

const mat = (colour: string, rough = 0.85, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color: colour, roughness: rough, ...extra });

function box(w: number, h: number, d: number, material: THREE.Material, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** A soft box: the rounded edges are most of what makes upholstery read as cosy. */
function cushion(w: number, h: number, d: number, material: THREE.Material, radius = 0.06) {
  const shape = new THREE.Shape();
  const r = Math.min(radius, w / 2, d / 2);
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  const bevel = Math.min(radius, h / 2.2);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 6 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -h / 2 + bevel, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function tagSeat(object: THREE.Object3D, seat: string) {
  object.traverse((part) => { part.userData.seat = seat; });
  return object;
}

/** A sofa of `seats` places, centred on its own origin, facing -Z. */
function sofa(look: Look, seats: number, sofaMaterial: THREE.Material, cushionMaterial: THREE.Material) {
  const group = new THREE.Group();
  const width = seats * 0.8 + 0.4;
  const base = cushion(width, 0.32, 0.9, sofaMaterial, 0.08);
  base.position.set(0, 0.24, 0.05);
  const back = cushion(width, 0.62, 0.24, sofaMaterial, 0.1);
  back.position.set(0, 0.62, 0.42);
  back.rotation.x = -0.12;
  const armL = cushion(0.24, 0.5, 0.9, sofaMaterial, 0.1);
  armL.position.set(-width / 2 + 0.12, 0.45, 0.05);
  const armR = armL.clone();
  armR.position.x = width / 2 - 0.12;
  group.add(base, back, armL, armR);
  for (let i = 0; i < seats; i++) {
    const x = (i - (seats - 1) / 2) * 0.8;
    const seatCushion = cushion(0.76, 0.14, 0.7, cushionMaterial, 0.06);
    seatCushion.position.set(x, 0.46, -0.02);
    const backCushion = cushion(0.74, 0.42, 0.16, cushionMaterial, 0.07);
    backCushion.position.set(x, 0.74, 0.26);
    backCushion.rotation.x = -0.18;
    group.add(seatCushion, backCushion);
  }
  for (const [x, z] of [[-width / 2 + 0.12, -0.32], [width / 2 - 0.12, -0.32], [-width / 2 + 0.12, 0.42], [width / 2 - 0.12, 0.42]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.1, 8), mat(look.woodDark, 0.5));
    leg.position.set(x, 0.05, z);
    group.add(leg);
  }
  return group;
}

function pillow(colour: string) {
  const mesh = cushion(0.42, 0.14, 0.42, mat(colour, 1), 0.07);
  mesh.rotation.x = Math.PI / 2 - 0.35;
  return mesh;
}

function candle(height = 0.16, colour = "#fff4dc") {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, height, 12), mat(colour, 0.6));
  body.position.y = height / 2;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffcf70" }));
  flame.scale.y = 1.8;
  flame.position.y = height + 0.03;
  flame.userData.flicker = Math.random() * 10;
  group.add(body, flame);
  group.userData.flame = flame;
  return group;
}

function plant(look: Look, scale = 1, leafy = "#4f8f4f") {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.32, 18), mat(look.wallPattern === "panels" ? "#2a2340" : "#b8643f", 0.7));
  pot.position.y = 0.16;
  pot.castShadow = true;
  group.add(pot);
  const rand = seeded(Math.floor(scale * 100));
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(new THREE.Color(leafy).offsetHSL(0, 0, (rand() - 0.5) * 0.12).getStyle(), 0.9));
    leaf.scale.set(0.45, 1.5, 0.2);
    const a = (i / 9) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.13, 0.5 + rand() * 0.25, Math.sin(a) * 0.13);
    leaf.rotation.set(Math.sin(a) * 0.6, -a, Math.cos(a) * 0.6);
    leaf.castShadow = true;
    group.add(leaf);
  }
  group.scale.setScalar(scale);
  return group;
}

export interface BuiltRoom {
  root: THREE.Group;
  /** Things above head height, hidden in the overhead view so they never block it. */
  ceiling: THREE.Group;
  screenMaterial: THREE.MeshBasicMaterial;
  shark: THREE.Group;
  background: THREE.Color;
  fog: THREE.Fog;
  exposure: number;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

export function buildRoom(theme: RoomTheme): BuiltRoom {
  const look = LOOKS[theme];
  const root = new THREE.Group();
  const ceiling = new THREE.Group();
  root.add(ceiling);
  const W = ROOM_HALF_X * 2;
  const D = ROOM_HALF_Z * 2;
  const H = ROOM_HEIGHT;
  const flickers: Array<{ mesh: THREE.Object3D; phase: number; base: number }> = [];
  const lights: Array<{ light: THREE.PointLight; base: number; phase: number; amount: number }> = [];
  const animated: Array<(t: number, dt: number) => void> = [];
  const glow = glowTexture();
  const addGlow = (colour: string, size: number, at: THREE.Vector3, opacity = 0.55, parent: THREE.Object3D = root) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(size);
    sprite.position.copy(at);
    parent.add(sprite);
    return sprite;
  };
  const addLight = (colour: string, intensity: number, distance: number, at: THREE.Vector3, shadow = false, flicker = 0) => {
    const light = new THREE.PointLight(colour, intensity, distance, 1.8);
    light.position.copy(at);
    if (shadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.002;
      light.shadow.radius = 4;
    }
    root.add(light);
    if (flicker) lights.push({ light, base: intensity, phase: Math.random() * 10, amount: flicker });
    return light;
  };

  // Floor, rug.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat("#ffffff", 0.75, { map: floorTexture(look) }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  root.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), mat("#ffffff", 1, { map: rugTexture(look) }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.006, -1.3);
  rug.receiveShadow = true;
  rug.userData.floor = true;
  root.add(rug);
  // A round rug in the reading corner.
  const roundRug = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), mat(look.rug[2], 1));
  roundRug.rotation.x = -Math.PI / 2;
  roundRug.position.set(-4.6, 0.006, 3.0);
  roundRug.receiveShadow = true;
  roundRug.userData.floor = true;
  root.add(roundRug);

  // Walls: four inward planes, so whichever is between the overhead camera and the room is culled.
  const code = look.wallPattern === "code" ? codeRain(512, 256, 40) : null;
  const wallMaterial = mat("#ffffff", 0.95, { map: code ? code.texture : wallTexture(look), ...(code ? { emissive: "#ffffff", emissiveMap: code.texture, emissiveIntensity: 0.55 } : {}) });
  const wainscotMaterial = mat(look.wainscot, 0.7);
  const trimMaterial = mat(look.trim, 0.5, theme === "cyberpunk" ? { emissive: look.trim, emissiveIntensity: 1.6 } : {});
  const walls: Array<[number, number, number, number]> = [
    [W, 0, -ROOM_HALF_Z, 0], [W, 0, ROOM_HALF_Z, Math.PI], [D, -ROOM_HALF_X, 0, Math.PI / 2], [D, ROOM_HALF_X, 0, -Math.PI / 2],
  ];
  for (const [width, x, z, ry] of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), wallMaterial);
    wall.position.set(x, H / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    root.add(wall);
    const inward = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.95), wainscotMaterial);
    lower.position.set(x + inward.x * 0.012, 0.475, z + inward.z * 0.012);
    lower.rotation.y = ry;
    lower.receiveShadow = true;
    root.add(lower);
    for (const [y, h] of [[0.96, 0.05], [0.06, 0.12]] as const) {
      const rail = box(width, h, 0.04, trimMaterial, false);
      rail.position.set(x + inward.x * 0.03, y, z + inward.z * 0.03);
      rail.rotation.y = ry;
      root.add(rail);
    }
    const crown = box(width, 0.1, 0.06, trimMaterial, false);
    crown.position.set(x + inward.x * 0.03, H - 0.05, z + inward.z * 0.03);
    crown.rotation.y = ry;
    ceiling.add(crown);
  }
  const ceilingPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat(look.ceiling, 1));
  ceilingPlane.rotation.x = Math.PI / 2;
  ceilingPlane.position.y = H;
  ceiling.add(ceilingPlane);
  for (let x = -ROOM_HALF_X + 1.2; x < ROOM_HALF_X; x += 2.4) {
    const beam = box(0.22, 0.24, D, mat(look.beam, 0.8), false);
    beam.position.set(x, H - 0.12, 0);
    ceiling.add(beam);
  }

  // Hearth: stone (or gothic marble, or a server rack, or a holo-fireplace) on the north wall.
  const hearthZ = -ROOM_HALF_Z;
  const stoneColour = theme === "cozy" ? "#9c8f80" : theme === "vampire" ? "#2a2226" : theme === "matrix" ? "#0b120d" : "#1d1838";
  const stone = mat(stoneColour, 0.95, theme === "cyberpunk" ? { metalness: 0.6, roughness: 0.3 } : {});
  const surround = box(2.6, 1.3, 0.6, stone);
  surround.position.set(0, 0.65, hearthZ + 0.3);
  const chimney = box(1.9, H - 1.3, 0.4, stone);
  chimney.position.set(0, 1.3 + (H - 1.3) / 2, hearthZ + 0.2);
  const mantel = box(2.9, 0.1, 0.72, mat(look.wood, 0.6));
  mantel.position.set(0, 1.34, hearthZ + 0.36);
  const firebox = box(1.2, 0.8, 0.36, mat("#0d0806", 1), false);
  firebox.position.set(0, 0.42, hearthZ + 0.45);
  const hearthStep = box(2.9, 0.08, 0.5, stone);
  hearthStep.position.set(0, 0.04, hearthZ + 0.82);
  root.add(surround, chimney, mantel, firebox, hearthStep);
  if (theme === "cozy") {
    // Stone courses on the surround.
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      const block = box(0.4, 0.2, 0.02, mat(new THREE.Color(stoneColour).offsetHSL(0, 0, ((row * 7 + col * 3) % 5 - 2) * 0.03).getStyle(), 1), false);
      block.position.set(-1.07 + col * 0.43 + (row % 2) * 0.2, 0.12 + row * 0.215, hearthZ + 0.61);
      if (Math.abs(block.position.x) < 0.65 && block.position.y < 0.85) continue;
      if (Math.abs(block.position.x) > 1.25) continue;
      root.add(block);
    }
  }
  const fireGroup = new THREE.Group();
  fireGroup.position.set(0, 0, hearthZ + 0.62);
  root.add(fireGroup);
  if (theme !== "cyberpunk") {
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 10), mat(theme === "matrix" ? "#0e1a12" : "#4a2e1c", 1));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i - 1) * 0.4;
      log.position.set(0, 0.1 + (i === 1 ? 0.09 : 0), 0);
      fireGroup.add(log);
    }
  }
  const flameMaterial = (colour: string, opacity: number) => new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: theme === "cyberpunk" });
  for (let i = 0; i < 9; i++) {
    const outer = i % 3 !== 0;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(outer ? 0.1 : 0.06, outer ? 0.45 : 0.3, 10, 1, true), flameMaterial(outer ? look.fire[1] : look.fire[0], outer ? 0.55 : 0.9));
    flame.position.set(-0.36 + (i % 7) * 0.12, outer ? 0.36 : 0.3, (i % 2) * 0.06 - 0.03);
    flickers.push({ mesh: flame, phase: i * 1.7, base: 1 });
    fireGroup.add(flame);
  }
  addGlow(look.fire[1], 2.2, new THREE.Vector3(0, 0.45, 0.1), 0.6, fireGroup);
  addGlow(look.fire[0], 0.9, new THREE.Vector3(0, 0.3, 0.12), 0.7, fireGroup);
  addLight(look.fireLight, 6, 11, new THREE.Vector3(0, 0.6, hearthZ + 1.1), true, 0.18);
  // Embers drifting up out of the fire.
  const emberCount = 40;
  const embers = new THREE.BufferGeometry();
  const emberPos = new Float32Array(emberCount * 3);
  const emberLife = new Float32Array(emberCount).map(() => Math.random());
  embers.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const emberPoints = new THREE.Points(embers, new THREE.PointsMaterial({ color: look.fire[0], size: 0.035, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  fireGroup.add(emberPoints);
  animated.push((_, dt) => {
    for (let i = 0; i < emberCount; i++) {
      emberLife[i] += dt * (0.25 + (i % 5) * 0.05);
      if (emberLife[i] > 1) emberLife[i] = 0;
      const l = emberLife[i];
      emberPos[i * 3] = Math.sin(i * 12.9 + l * 6) * 0.3 * (1 - l * 0.5);
      emberPos[i * 3 + 1] = 0.2 + l * 0.85;
      emberPos[i * 3 + 2] = Math.cos(i * 4.1) * 0.08;
    }
    embers.attributes.position.needsUpdate = true;
  });

  // TV / screen over the mantel. In Matrix it is a big CRT-green monitor wall.
  const tvFrame = box(2.0, 1.16, 0.07, mat("#0b0b0e", 0.4, { metalness: 0.4 }));
  tvFrame.position.set(0, 2.15, hearthZ + 0.44);
  const screenMaterial = new THREE.MeshBasicMaterial({ color: "#0f0c16", toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.07), screenMaterial);
  screen.position.set(0, 2.15, hearthZ + 0.48);
  root.add(tvFrame, screen);

  // Mantel things.
  const mantelTop = 1.39;
  const mantelZ = hearthZ + 0.4;
  const candleSpots = theme === "vampire" ? [-1.25, -1.15, -1.05, 1.05, 1.15, 1.25] : [-1.2, -1.08, 1.15];
  for (const [i, x] of candleSpots.entries()) {
    const c = candle(0.12 + (i % 3) * 0.06, theme === "vampire" ? "#efe4d0" : theme === "matrix" ? "#cfe" : "#fff4dc");
    c.position.set(x, mantelTop, mantelZ);
    root.add(c);
    flickers.push({ mesh: c.userData.flame, phase: i * 2.3, base: 1 });
    addGlow(theme === "matrix" ? "#7dffaa" : "#ffb35c", 0.35, new THREE.Vector3(x, mantelTop + c.userData.flame.position.y, mantelZ), 0.6);
  }
  const mantelPlant = plant(look, 0.55, theme === "vampire" ? "#2a3a26" : "#4f8f4f");
  mantelPlant.position.set(0.8, mantelTop, mantelZ);
  root.add(mantelPlant);
  // Photo frames on the mantel.
  for (const [x, colour] of [[-0.75, "#c9a27a"], [-0.55, "#7aa6c9"]] as const) {
    const frame = box(0.16, 0.2, 0.02, mat(look.trim, 0.5));
    frame.position.set(x, mantelTop + 0.1, mantelZ - 0.1);
    frame.rotation.x = -0.12;
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.15), mat(colour, 1));
    photo.position.set(x, mantelTop + 0.1, mantelZ - 0.088);
    photo.rotation.x = -0.12;
    root.add(frame, photo);
  }

  // Seating.
  const sofaMaterial = mat(look.sofa, theme === "vampire" ? 0.55 : theme === "academia" ? 0.42 : 1);
  const cushionMaterial = mat(look.sofaCushion, 1);
  const couch = sofa(look, 3, sofaMaterial, cushionMaterial);
  couch.position.set(0, 0, 0.75);
  root.add(couch);
  for (const seat of LOUNGE_SEATS.filter((s) => s.id.startsWith("couch"))) {
    const hit = box(0.78, 0.5, 0.9, new THREE.MeshBasicMaterial({ visible: false }), false);
    hit.position.set(seat.x, 0.4, seat.z + 0.15);
    tagSeat(hit, seat.id);
    root.add(hit);
  }
  for (const [i, colour] of look.pillows.slice(0, 3).entries()) {
    const p = pillow(colour);
    p.position.set(-1.05 + i * 1.05 + (i === 1 ? 0.1 : 0), 0.66, 0.92);
    p.rotation.z = (i - 1) * 0.25;
    root.add(p);
  }
  const blanket = cushion(0.55, 0.05, 1.0, mat("#ffffff", 1, { map: knitTexture(look.blanket) }), 0.02);
  blanket.position.set(1.32, 0.72, 0.78);
  blanket.rotation.z = -0.25;
  root.add(blanket);

  const loveseat = sofa(look, 2, sofaMaterial, cushionMaterial);
  loveseat.rotation.y = -Math.PI / 2;
  loveseat.position.set(-2.95, 0, -1.47);
  root.add(loveseat);
  for (const id of ["love-1", "love-2"]) {
    const seat = seatById(id)!;
    const hit = box(0.9, 0.5, 0.8, new THREE.MeshBasicMaterial({ visible: false }), false);
    hit.position.set(seat.x - 0.15, 0.4, seat.z);
    tagSeat(hit, id);
    root.add(hit);
  }
  const lovePillow = pillow(look.pillows[3]);
  lovePillow.rotation.y = -Math.PI / 2;
  lovePillow.position.set(-3.08, 0.66, -2.1);
  root.add(lovePillow);

  const armchair = (seatId: string, rotation: number) => {
    const seat = seatById(seatId)!;
    const chair = new THREE.Group();
    const material = mat(theme === "cozy" ? "#8e5a3c" : look.sofa, 0.9);
    const base = cushion(0.86, 0.36, 0.86, material, 0.08);
    base.position.y = 0.26;
    const back = cushion(0.86, 0.72, 0.2, material, 0.1);
    back.position.set(0, 0.7, 0.36);
    back.rotation.x = -0.15;
    const wingL = cushion(0.18, 0.55, 0.8, material, 0.08);
    wingL.position.set(-0.38, 0.55, 0.02);
    const wingR = wingL.clone();
    wingR.position.x = 0.38;
    const seatCushion = cushion(0.56, 0.12, 0.6, mat(look.sofaCushion, 1), 0.05);
    seatCushion.position.set(0, 0.48, -0.04);
    chair.add(base, back, wingL, wingR, seatCushion);
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = rotation;
    tagSeat(chair, seatId);
    root.add(chair);
    return chair;
  };
  armchair("arm-e", -seatById("arm-e")!.facing);
  armchair("read-1", -seatById("read-1")!.facing);
  // A side table and lamp by the reading chair, a stack of books on the floor.
  const sideTable = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 24), mat(look.wood, 0.5));
  sideTable.position.set(-5.4, 0.55, 2.3);
  const sideLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.55, 10), mat(look.woodDark, 0.5));
  sideLeg.position.set(-5.4, 0.275, 2.3);
  root.add(sideTable, sideLeg);
  const mug = (x: number, y: number, z: number, colour: string) => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), mat(colour, 0.4));
    cup.position.set(x, y + 0.05, z);
    root.add(cup);
    // Steam: a few soft sprites drifting up and fading.
    for (let i = 0; i < 3; i++) {
      const puff = addGlow("#ffffff", 0.08, new THREE.Vector3(x, y + 0.12, z), 0);
      puff.material.blending = THREE.NormalBlending;
      animated.push((t) => {
        const l = (t * 0.35 + i / 3) % 1;
        puff.position.set(x + Math.sin(t * 2 + i) * 0.02, y + 0.12 + l * 0.3, z);
        puff.scale.setScalar(0.06 + l * 0.12);
        puff.material.opacity = 0.22 * Math.sin(l * Math.PI);
      });
    }
  };
  mug(-5.32, 0.57, 2.25, theme === "vampire" ? "#5e0b16" : "#f5efe4");
  for (let i = 0; i < 4; i++) {
    const book = box(0.3 - i * 0.02, 0.05, 0.22, mat(["#9c3f3a", "#3e5a6b", "#e6b86a", "#5a7d4f"][i], 0.8));
    book.position.set(-5.35, 0.025 + i * 0.05, 3.85);
    book.rotation.y = i * 0.3;
    root.add(book);
  }

  // Fireside floor cushions and beanbags.
  for (const id of ["cushion-1", "cushion-2"]) {
    const seat = seatById(id)!;
    const pouf = cushion(0.65, 0.16, 0.65, mat(id === "cushion-1" ? look.pillows[0] : look.pillows[1], 1), 0.08);
    pouf.position.set(seat.x, 0.09, seat.z);
    pouf.rotation.y = 0.3;
    tagSeat(pouf, id);
    root.add(pouf);
  }
  for (const id of ["bean-1", "bean-2"]) {
    const seat = seatById(id)!;
    const bean = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 18), mat(id === "bean-1" ? look.pillows[3] : look.pillows[2], 1));
    bean.scale.set(1, 0.55, 1);
    bean.position.set(seat.x, 0.22, seat.z);
    bean.castShadow = true;
    tagSeat(bean, id);
    root.add(bean);
  }

  // Coffee table with snacks, a board game and candles.
  const tableTop = cushion(1.3, 0.07, 0.62, mat(look.wood, 0.45), 0.03);
  tableTop.position.set(0, 0.42, -1.2);
  root.add(tableTop);
  for (const [x, z] of [[-0.58, -1.45], [0.58, -1.45], [-0.58, -0.95], [0.58, -0.95]]) {
    const leg = box(0.05, 0.4, 0.05, mat(look.woodDark, 0.6));
    leg.position.set(x, 0.2, z);
    root.add(leg);
  }
  const popcorn = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.16, 18), mat("#d9443a", 0.7));
  popcorn.position.set(-0.35, 0.54, -1.25);
  const kernels = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#fff3c4", 1));
  kernels.position.set(-0.35, 0.61, -1.25);
  const board = box(0.4, 0.02, 0.4, mat(theme === "matrix" ? "#0a3d1c" : "#e8d5a8", 0.8));
  board.position.set(0.25, 0.47, -1.2);
  board.rotation.y = 0.4;
  root.add(popcorn, kernels, board);
  mug(0.0, 0.46, -1.0, theme === "cyberpunk" ? "#00f0ff" : "#c9e0f0");
  const tableCandle = candle(0.1, theme === "vampire" ? "#2a0a10" : "#f5e6c8");
  tableCandle.position.set(0.5, 0.46, -1.38);
  root.add(tableCandle);
  flickers.push({ mesh: tableCandle.userData.flame, phase: 4.2, base: 1 });
  addGlow("#ffb35c", 0.4, new THREE.Vector3(0.5, 0.6, -1.38), 0.5);
  addLight("#ffb35c", 0.6, 2.5, new THREE.Vector3(0.5, 0.75, -1.38), false, 0.25);

  // Bookshelves along the west wall (and, in the library, along more walls).
  const rand = seeded(5);
  const bookshelf = (zCentre: number) => {
    const shelf = new THREE.Group();
    const frame = mat(look.woodDark, 0.7);
    const back = box(0.05, 2.2, 1.5, frame);
    back.position.set(-ROOM_HALF_X + 0.03, 1.1, zCentre);
    shelf.add(back);
    for (let row = 0; row <= 5; row++) {
      const board = box(0.38, 0.04, 1.5, frame);
      board.position.set(-ROOM_HALF_X + 0.2, row * 0.43 + 0.02, zCentre);
      shelf.add(board);
    }
    for (const side of [-1, 1]) {
      const end = box(0.38, 2.2, 0.04, frame);
      end.position.set(-ROOM_HALF_X + 0.2, 1.1, zCentre + side * 0.75);
      shelf.add(end);
    }
    const bookColours = theme === "academia" ? ["#5e1a1a", "#1f3326", "#3b2416", "#2a2a3a", "#6b4a2a", "#7a1f1f", "#2b3a2e"]
      : theme === "vampire" ? ["#5e0b16", "#2d0a10", "#b08a3e", "#3b1f3d", "#14060a"]
      : theme === "matrix" ? ["#0a3d1c", "#14261a", "#00c853", "#1d2620"]
      : theme === "cyberpunk" ? ["#ff2fb4", "#00f0ff", "#9b5cff", "#ffe94a", "#2b2250"]
      : ["#9c3f3a", "#3e5a6b", "#e6b86a", "#5a7d4f", "#8a5a83", "#d98a4a", "#2f4858"];
    for (let row = 0; row < 5; row++) {
      let z = zCentre - 0.7;
      while (z < zCentre + 0.68) {
        if (rand() < 0.08) { z += 0.12; continue; }
        const w = 0.035 + rand() * 0.05;
        const h = 0.24 + rand() * 0.13;
        const book = box(0.26, h, w, mat(bookColours[Math.floor(rand() * bookColours.length)], 0.8, theme === "cyberpunk" ? { emissive: bookColours[0], emissiveIntensity: 0.05 } : {}), false);
        const lean = rand() < 0.06 ? 0.25 : 0;
        book.position.set(-ROOM_HALF_X + 0.22, row * 0.43 + 0.04 + h / 2, z + w / 2);
        book.rotation.x = lean;
        shelf.add(book);
        z += w + 0.004;
      }
    }
    return shelf;
  };
  for (const zCentre of [-3.2, 0.6]) root.add(bookshelf(zCentre));
  /** A shelf against any wall: `rotation` turns it from facing east (the west wall's) to face the room. */
  const shelfAt = (x: number, z: number, rotation: number) => {
    const holder = new THREE.Group();
    const shelf = bookshelf(0);
    shelf.position.x = ROOM_HALF_X;
    holder.add(shelf);
    holder.position.set(x, 0, z);
    holder.rotation.y = rotation;
    root.add(holder);
  };

  // Window with the outside world, curtains and a cushioned bench in the nook.
  const windowZ = 2.6;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.7), new THREE.MeshBasicMaterial({ map: skyTexture(look), toneMapped: false }));
  sky.position.set(ROOM_HALF_X - 0.01, 1.75, windowZ);
  sky.rotation.y = -Math.PI / 2;
  root.add(sky);
  let windowCode: ReturnType<typeof codeRain> | null = null;
  if (look.sky === "code") {
    windowCode = codeRain(256, 200, 22);
    (sky.material as THREE.MeshBasicMaterial).map = windowCode.texture;
  }
  const frameMaterial = mat(look.trim, 0.5, theme === "cyberpunk" ? { emissive: look.trim, emissiveIntensity: 1.4 } : {});
  for (const [h, w, y, z] of [[0.08, 2.4, 2.64, windowZ], [0.1, 2.5, 0.88, windowZ], [1.8, 0.08, 1.75, windowZ - 1.15], [1.8, 0.08, 1.75, windowZ + 1.15], [1.7, 0.04, 1.75, windowZ], [0.04, 2.2, 1.75, windowZ]] as const) {
    const bar = box(0.08, h, w, frameMaterial, false);
    bar.position.set(ROOM_HALF_X - 0.04, y, z);
    root.add(bar);
  }
  const sill = box(0.3, 0.05, 2.5, frameMaterial);
  sill.position.set(ROOM_HALF_X - 0.15, 0.86, windowZ);
  root.add(sill);
  // Curtains: wavy planes either side, tied back.
  const curtainColour = theme === "vampire" ? "#4a0a14" : theme === "matrix" ? "#0b1a10" : theme === "cyberpunk" ? "#3a1a6a" : "#b9583f";
  for (const side of [-1, 1]) {
    const geometry = new THREE.PlaneGeometry(0.6, 2.5, 12, 1);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 22) * 0.04);
    geometry.computeVertexNormals();
    const curtain = new THREE.Mesh(geometry, mat(curtainColour, 1, { side: THREE.DoubleSide }));
    curtain.position.set(ROOM_HALF_X - 0.12, 1.55, windowZ + side * 1.45);
    curtain.rotation.y = -Math.PI / 2;
    curtain.castShadow = true;
    root.add(curtain);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.6, 8), mat("#c9a25a", 0.3, { metalness: 0.8 }));
  rod.rotation.x = Math.PI / 2;
  rod.position.set(ROOM_HALF_X - 0.12, 2.82, windowZ);
  root.add(rod);
  // Rain on the glass at night (always, in the city).
  if ((look.sky === "time" && isNight()) || look.sky === "city" || look.sky === "overcast") {
    const drops = 60;
    const rain = new THREE.BufferGeometry();
    const rainPos = new Float32Array(drops * 6);
    rain.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const lines = new THREE.LineSegments(rain, new THREE.LineBasicMaterial({ color: look.sky === "city" ? "#9ff8ff" : "#a8c4ff", transparent: true, opacity: 0.35 }));
    root.add(lines);
    const seeds = Array.from({ length: drops }, () => [Math.random(), Math.random(), 0.6 + Math.random() * 0.6]);
    animated.push((t) => {
      for (let i = 0; i < drops; i++) {
        const [sz, sy, speed] = seeds[i];
        const y = 2.6 - ((sy + t * speed) % 1) * 1.7;
        const z = windowZ - 1.05 + sz * 2.1;
        rainPos.set([ROOM_HALF_X - 0.02, y, z, ROOM_HALF_X - 0.02, y - 0.08, z - 0.01], i * 6);
      }
      rain.attributes.position.needsUpdate = true;
    });
  }
  // Bats crossing the moon.
  if (look.sky === "moon") {
    for (let i = 0; i < 3; i++) {
      const bat = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0.03), new THREE.Vector2(0.1, -0.01), new THREE.Vector2(0.03, 0.005),
        new THREE.Vector2(0, -0.02), new THREE.Vector2(-0.03, 0.005), new THREE.Vector2(-0.1, -0.01), new THREE.Vector2(-0.06, 0.03),
      ])), new THREE.MeshBasicMaterial({ color: "#050103", side: THREE.DoubleSide }));
      bat.rotation.y = -Math.PI / 2;
      root.add(bat);
      animated.push((t) => {
        const l = ((t * 0.07 + i * 0.33) % 1);
        bat.position.set(ROOM_HALF_X - 0.015, 2.2 + Math.sin(t * 2 + i) * 0.15, windowZ - 1.05 + l * 2.1);
        bat.scale.y = 0.6 + Math.abs(Math.sin(t * 14 + i)) * 0.6;
      });
    }
  }
  const bench = cushion(0.75, 0.42, 2.4, mat(look.wood, 0.7), 0.04);
  bench.position.set(ROOM_HALF_X - 0.38, 0.23, windowZ);
  const benchCushion = cushion(0.7, 0.12, 2.3, mat(theme === "cozy" ? "#93b7a0" : look.sofaCushion, 1), 0.05);
  benchCushion.position.set(ROOM_HALF_X - 0.38, 0.5, windowZ);
  tagSeat(bench, "nook-1");
  tagSeat(benchCushion, "nook-1");
  root.add(bench, benchCushion);
  for (const [i, colour] of [look.pillows[0], look.pillows[3]].entries()) {
    const p = pillow(colour);
    p.rotation.set(0, -Math.PI / 2, 0);
    p.rotateX(Math.PI / 2 - 0.35);
    p.position.set(ROOM_HALF_X - 0.15, 0.72, windowZ - 0.9 + i * 0.25);
    root.add(p);
  }
  const nookSeat = seatById("nook-2")!;
  const pouf = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.4, 24), mat(theme === "cozy" ? "#d1a35c" : look.pillows[1], 1));
  pouf.position.set(nookSeat.x, 0.2, nookSeat.z);
  pouf.castShadow = true;
  tagSeat(pouf, "nook-2");
  root.add(pouf);
  const nookMark = new THREE.Mesh(new THREE.RingGeometry(NOOK.radius - 0.03, NOOK.radius, 64), new THREE.MeshBasicMaterial({ color: look.fairy[0], transparent: true, opacity: 0.18 }));
  nookMark.rotation.x = -Math.PI / 2;
  nookMark.position.set(NOOK.x, 0.008, NOOK.z);
  root.add(nookMark);

  // Lamps: a floor lamp by the couch, a reading lamp, a pendant over the table.
  const floorLamp = (x: number, z: number) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.55, 8), mat("#2b2b2b", 0.4, { metalness: 0.6 }));
    pole.position.set(x, 0.78, z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 20), mat("#2b2b2b", 0.4, { metalness: 0.6 }));
    foot.position.set(x, 0.015, z);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.32, 24, 1, true), mat(theme === "vampire" ? "#3a0a12" : "#fbe7c2", 1, { emissive: look.lamp, emissiveIntensity: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    shade.position.set(x, 1.6, z);
    root.add(pole, foot, shade);
    addGlow(look.lamp, 1.6, new THREE.Vector3(x, 1.55, z), 0.35);
    addLight(look.lamp, 3.2, 7, new THREE.Vector3(x, 1.45, z));
  };
  floorLamp(-1.75, 1.45);
  floorLamp(-5.55, 3.95);
  const pendantCord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.9, 6), mat("#111"));
  pendantCord.position.set(0, H - 0.45, -1.2);
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.trim, 0.5, { side: THREE.DoubleSide, emissive: look.lamp, emissiveIntensity: 0.3 }));
  pendant.position.set(0, H - 0.9, -1.2);
  ceiling.add(pendantCord, pendant);
  addGlow(look.lamp, 0.9, new THREE.Vector3(0, H - 0.98, -1.2), 0.45, ceiling);
  addLight(look.lamp, 1.6, 5, new THREE.Vector3(0, H - 1.05, -1.2));

  // String lights in scallops along the top of three walls.
  const bulbs: THREE.Mesh[] = [];
  const string = (from: THREE.Vector3, to: THREE.Vector3, count: number) => {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const p = from.clone().lerp(to, t);
      p.y -= Math.sin(t * Math.PI * 5) ** 2 * 0.16;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: look.fairy[i % look.fairy.length], toneMapped: false }));
      bulb.position.copy(p);
      bulb.userData.phase = i * 0.7;
      bulbs.push(bulb);
      root.add(bulb);
      if (i % 2 === 0) addGlow(look.fairy[i % look.fairy.length], 0.32, p, 0.5);
    }
  };
  string(new THREE.Vector3(-ROOM_HALF_X + 0.3, H - 0.25, -ROOM_HALF_Z + 0.05), new THREE.Vector3(ROOM_HALF_X - 0.3, H - 0.25, -ROOM_HALF_Z + 0.05), 46);
  string(new THREE.Vector3(-ROOM_HALF_X + 0.05, H - 0.25, -ROOM_HALF_Z + 0.4), new THREE.Vector3(-ROOM_HALF_X + 0.05, H - 0.25, ROOM_HALF_Z - 0.4), 34);
  string(new THREE.Vector3(ROOM_HALF_X - 0.05, H - 0.25, -ROOM_HALF_Z + 0.4), new THREE.Vector3(ROOM_HALF_X - 0.05, H - 0.25, ROOM_HALF_Z - 0.4), 34);

  // Plants.
  for (const [x, z, s] of [[ROOM_HALF_X - 0.5, -ROOM_HALF_Z + 0.5, 1.6], [-ROOM_HALF_X + 0.5, ROOM_HALF_Z - 0.5, 1.3], [1.75, -ROOM_HALF_Z + 0.4, 1.0], [ROOM_HALF_X - 0.45, ROOM_HALF_Z - 0.45, 1.2], [3.6, -0.2, 0.9]] as const) {
    const p = plant(look, s, theme === "vampire" ? "#2f3d2a" : theme === "matrix" ? "#1d6b35" : theme === "cyberpunk" ? "#2fbf8f" : "#4f8f4f");
    p.position.set(x, 0, z);
    root.add(p);
  }
  // Pictures on the walls.
  const picture = (x: number, y: number, z: number, ry: number, w: number, h: number, colours: string[]) => {
    const gilt = theme === "vampire" || theme === "academia";
    const frame = box(w + 0.08, h + 0.08, 0.04, mat(gilt ? (theme === "academia" ? "#c9a45c" : "#b08a3e") : look.woodDark, 0.4, gilt ? { metalness: 0.7 } : {}), false);
    frame.position.set(x, y, z);
    frame.rotation.y = ry;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTexture(128, Math.round(128 * h / w), (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 128 * h / w);
      colours.forEach((c, i) => g.addColorStop(i / (colours.length - 1), c));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128 * h / w);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath(); ctx.moveTo(0, 128 * h / w); ctx.lineTo(50, 60); ctx.lineTo(80, 85); ctx.lineTo(128, 40); ctx.lineTo(128, 128 * h / w); ctx.fill();
    }) }));
    const out = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)).multiplyScalar(0.025);
    art.position.set(x + out.x, y, z + out.z);
    art.rotation.y = ry;
    root.add(frame, art);
  };
  const paint = theme === "academia" ? ["#1d2a1e", "#6b1f1f", "#c9a45c"] : theme === "vampire" ? ["#1a0508", "#5e0b16", "#b08a3e"] : theme === "matrix" ? ["#000", "#0a3d1c", "#00e676"] : theme === "cyberpunk" ? ["#090322", "#ff2fb4", "#00f0ff"] : ["#f3a37a", "#e6b86a", "#3e5a6b"];
  picture(-3.0, 1.85, ROOM_HALF_Z - 0.03, Math.PI, 1.0, 0.7, paint);
  picture(-1.6, 1.75, ROOM_HALF_Z - 0.03, Math.PI, 0.5, 0.6, [...paint].reverse());
  picture(2.5, 1.85, -ROOM_HALF_Z + 0.03, 0, 0.8, 0.6, paint);
  picture(-2.6, 1.85, -ROOM_HALF_Z + 0.03, 0, 0.6, 0.8, [...paint].reverse());

  // Themed extras.
  if (theme === "vampire") {
    // Candelabras on the floor, a coffin bookcase vibe, roses on the table.
    for (const [x, z] of [[-1.7, -3.9], [1.7, -3.9], [4.2, 4.0]]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.12, 1.2, 10), mat("#b08a3e", 0.3, { metalness: 0.85 }));
      stand.position.set(x, 0.6, z);
      root.add(stand);
      for (const dx of [-0.18, 0, 0.18]) {
        const c = candle(0.18, "#efe4d0");
        c.position.set(x + dx, 1.2 + (dx === 0 ? 0.08 : 0), z);
        root.add(c);
        flickers.push({ mesh: c.userData.flame, phase: x + dx * 10, base: 1 });
        addGlow("#ff7a4a", 0.4, c.position.clone().setY(c.position.y + 0.21), 0.6);
      }
      addLight("#ff5a3a", 1.3, 4, new THREE.Vector3(x, 1.5, z), false, 0.25);
    }
    for (let i = 0; i < 5; i++) {
      const rose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat("#9c1328", 0.6));
      rose.position.set(0.42 + (i % 3) * 0.04, 0.68 + (i % 2) * 0.04, -1.05 + Math.floor(i / 3) * 0.05);
      root.add(rose);
    }
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 14), mat("#14060a", 0.2, { metalness: 0.4 }));
    vase.position.set(0.46, 0.55, -1.03);
    root.add(vase);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), mat("#efe4d0", 0.6));
    skull.scale.set(1, 0.95, 1.15);
    skull.position.set(-0.3, mantelTop + 0.08, mantelZ);
    root.add(skull);
  } else if (theme === "academia") {
    // More shelves: the south wall and the east wall beside the fireplace.
    shelfAt(-0.2, ROOM_HALF_Z, Math.PI / 2);
    shelfAt(1.4, ROOM_HALF_Z, Math.PI / 2);
    shelfAt(ROOM_HALF_X, -2.4, Math.PI);
    const gilt = mat("#c9a45c", 0.3, { metalness: 0.85 });
    // Chesterfield tufting on the couch back.
    for (let row = 0; row < 2; row++) for (let i = 0; i < 9; i++) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat("#163826", 0.5));
      button.position.set(-1.2 + i * 0.3 + (row % 2) * 0.15, 0.78 + row * 0.14, 1.16 - row * 0.03);
      root.add(button);
    }
    // A writing desk by the hearth: green banker's lamp, an open book, ink and a quill.
    const desk = cushion(1.5, 0.06, 0.72, mat(look.wood, 0.4), 0.02);
    desk.position.set(3.6, 0.76, -4.0);
    root.add(desk);
    for (const [x, z] of [[2.92, -4.3], [4.28, -4.3], [2.92, -3.7], [4.28, -3.7]]) {
      const leg = box(0.06, 0.74, 0.06, mat(look.woodDark, 0.5));
      leg.position.set(x, 0.37, z);
      root.add(leg);
    }
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 20), gilt);
    lampBase.position.set(3.15, 0.805, -4.15);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), gilt);
    lampStem.position.set(3.15, 0.95, -4.15);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 20, 1, false, 0, Math.PI), mat("#1f6b3a", 0.2, { emissive: "#2f8a4a", emissiveIntensity: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    shade.rotation.z = Math.PI / 2;
    shade.rotation.y = Math.PI / 2;
    shade.position.set(3.15, 1.1, -4.12);
    root.add(lampBase, lampStem, shade);
    addGlow("#ffd59a", 0.9, new THREE.Vector3(3.15, 1.0, -4.05), 0.45);
    addLight("#ffd59a", 1.6, 4, new THREE.Vector3(3.15, 1.0, -3.95));
    const book = cushion(0.42, 0.04, 0.3, mat("#ebdfc4", 0.9), 0.01);
    book.position.set(3.7, 0.81, -3.92);
    book.rotation.y = 0.15;
    const spine = box(0.02, 0.05, 0.3, mat("#5e1a1a", 0.7));
    spine.position.set(3.7, 0.81, -3.92);
    spine.rotation.y = 0.15;
    const ink = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 12), mat("#0a0a12", 0.1, { metalness: 0.3 }));
    ink.position.set(4.1, 0.82, -4.15);
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.32, 6), mat("#efe6d4", 0.9));
    quill.position.set(4.12, 0.95, -4.12);
    quill.rotation.z = -0.35;
    root.add(book, spine, ink, quill);
    const chair = new THREE.Group();
    const seat = cushion(0.48, 0.08, 0.48, mat("#5e1a1a", 0.6), 0.03);
    seat.position.y = 0.48;
    const back = box(0.48, 0.5, 0.05, mat(look.wood, 0.5));
    back.position.set(0, 0.75, 0.23);
    chair.add(seat, back);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const leg = box(0.04, 0.46, 0.04, mat(look.woodDark, 0.5));
      leg.position.set(x, 0.23, z);
      chair.add(leg);
    }
    chair.position.set(3.6, 0, -3.35);
    chair.rotation.y = Math.PI;
    root.add(chair);
    // A globe on a stand.
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 20), mat("#ffffff", 0.6, { map: canvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = "#8a7a52"; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = "#c9b27a";
      const rr = seeded(9);
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.ellipse(rr() * 256, 20 + rr() * 88, 10 + rr() * 26, 6 + rr() * 16, rr() * 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = "rgba(60,40,20,0.35)"; for (let x = 0; x < 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 128); ctx.stroke(); }
    }) }));
    globe.position.set(4.9, 1.0, -2.9);
    globe.rotation.z = 0.41;
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.01, 6, 32), gilt);
    meridian.position.copy(globe.position);
    meridian.rotation.y = Math.PI / 2;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.18, 0.75, 12), mat(look.woodDark, 0.5));
    stand.position.set(4.9, 0.38, -2.9);
    root.add(globe, meridian, stand);
    animated.push((_, dt) => { globe.rotation.y += dt * 0.08; });
    // The grandfather clock between the west shelves, its pendulum swinging.
    const clock = new THREE.Group();
    const caseBody = box(0.55, 2.1, 0.38, mat(look.woodDark, 0.45));
    caseBody.position.y = 1.05;
    const hood = box(0.65, 0.12, 0.44, mat(look.wood, 0.45));
    hood.position.y = 2.16;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), mat("#efe2c0", 0.6));
    face.position.set(0.195, 1.8, 0);
    face.rotation.y = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.015, 8, 32), gilt);
    ring.position.copy(face.position);
    ring.rotation.y = Math.PI / 2;
    const now = new Date();
    const hand = (length: number, angle: number) => {
      const handMesh = box(0.004, length, 0.012, mat("#1a1a1a", 0.5), false);
      handMesh.geometry.translate(0, length / 2, 0);
      handMesh.position.set(0.2, 1.8, 0);
      handMesh.rotation.x = -angle;
      return handMesh;
    };
    const minuteHand = hand(0.16, (now.getMinutes() / 60) * Math.PI * 2);
    const hourHand = hand(0.11, ((now.getHours() % 12 + now.getMinutes() / 60) / 12) * Math.PI * 2);
    const glassPane = box(0.02, 0.9, 0.24, mat("#0c0806", 0.2, { transparent: true, opacity: 0.6 }), false);
    glassPane.position.set(0.19, 0.95, 0);
    const pendulum = new THREE.Group();
    const rod = box(0.008, 0.6, 0.008, gilt, false);
    rod.position.y = -0.3;
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 24), gilt);
    bob.rotation.z = Math.PI / 2;
    bob.position.y = -0.62;
    pendulum.add(rod, bob);
    pendulum.position.set(0.15, 1.35, 0);
    clock.add(caseBody, hood, face, ring, minuteHand, hourHand, glassPane, pendulum);
    clock.position.set(-ROOM_HALF_X + 0.22, 0, -1.4);
    root.add(clock);
    animated.push((t) => {
      pendulum.rotation.x = Math.sin(t * Math.PI) * 0.18;
      const date = new Date();
      minuteHand.rotation.x = -(date.getMinutes() / 60) * Math.PI * 2;
      hourHand.rotation.x = -((date.getHours() % 12 + date.getMinutes() / 60) / 12) * Math.PI * 2;
    });
    // Book stacks and candle stubs around the room.
    const stack = (x: number, z: number, count: number, y = 0) => {
      for (let i = 0; i < count; i++) {
        const b = box(0.3 - (i % 3) * 0.03, 0.06, 0.22, mat(["#5e1a1a", "#1f3326", "#3b2416", "#6b4a2a"][i % 4], 0.8));
        b.position.set(x, y + 0.03 + i * 0.06, z);
        b.rotation.y = (i * 0.37) % 0.8 - 0.4;
        root.add(b);
      }
    };
    stack(-0.45, -1.05, 3, 0.45);
    stack(1.9, 1.3, 5);
    stack(-3.6, 3.9, 4);
    stack(5.4, -1.0, 6);
    for (const [x, z] of [[-0.1, -1.4], [5.45, -0.6], [-3.4, 3.95]] as const) {
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 14), gilt);
      const baseY = x === -0.1 ? 0.46 : 0;
      holder.position.set(x, baseY + 0.01, z);
      const c = candle(0.07, "#efe2c0");
      c.position.set(x, baseY + 0.02, z);
      root.add(holder, c);
      flickers.push({ mesh: c.userData.flame, phase: x * 3 + z, base: 1 });
      addGlow("#ffcf80", 0.35, new THREE.Vector3(x, baseY + 0.13, z), 0.55);
    }
  } else if (theme === "matrix") {
    // A desk of glowing CRTs against the east wall.
    const desk = box(0.7, 0.05, 2.0, mat("#141a16", 0.5));
    desk.position.set(ROOM_HALF_X - 0.4, 0.75, -2.6);
    root.add(desk);
    for (let i = 0; i < 3; i++) {
      const crt = box(0.42, 0.38, 0.45, mat("#1a1f1b", 0.6));
      crt.position.set(ROOM_HALF_X - 0.45, 0.97, -3.25 + i * 0.65);
      const rain = codeRain(128, 96, 12);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.28), new THREE.MeshBasicMaterial({ map: rain.texture, toneMapped: false }));
      face.position.set(ROOM_HALF_X - 0.67, 0.98, -3.25 + i * 0.65);
      face.rotation.y = -Math.PI / 2;
      root.add(crt, face);
      let next = 0;
      animated.push((t) => { if (t > next) { next = t + 0.09; rain.step(); } });
      addGlow("#22ff77", 0.7, face.position.clone().setX(ROOM_HALF_X - 0.75), 0.35);
    }
    addLight("#22ff77", 2.2, 5, new THREE.Vector3(ROOM_HALF_X - 1.1, 1.1, -2.6));
    // A red and a blue pill on the coffee table.
    for (const [x, colour] of [[-0.1, "#ff2a2a"], [0.05, "#2a6bff"]] as const) {
      const pill = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.03, 4, 8), mat(colour, 0.2, { emissive: colour, emissiveIntensity: 0.6 }));
      pill.rotation.z = Math.PI / 2;
      pill.position.set(x, 0.47, -1.45);
      root.add(pill);
    }
  } else if (theme === "cyberpunk") {
    // Neon tubes along the floor and the ceiling edges, a neon sign and an arcade cabinet.
    const neon = (colour: string, from: THREE.Vector3, to: THREE.Vector3, parent: THREE.Object3D = root) => {
      const length = from.distanceTo(to);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, length, 8), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
      tube.position.copy(from).lerp(to, 0.5);
      tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      parent.add(tube);
      for (let t = 0.1; t < 1; t += 0.2) addGlow(colour, 0.6, from.clone().lerp(to, t), 0.35, parent);
    };
    neon("#ff2fb4", new THREE.Vector3(-ROOM_HALF_X + 0.05, 0.14, -ROOM_HALF_Z + 0.05), new THREE.Vector3(ROOM_HALF_X - 0.05, 0.14, -ROOM_HALF_Z + 0.05));
    neon("#00f0ff", new THREE.Vector3(-ROOM_HALF_X + 0.05, 0.14, -ROOM_HALF_Z + 0.05), new THREE.Vector3(-ROOM_HALF_X + 0.05, 0.14, ROOM_HALF_Z - 0.05));
    neon("#00f0ff", new THREE.Vector3(ROOM_HALF_X - 0.05, 0.14, -ROOM_HALF_Z + 0.05), new THREE.Vector3(ROOM_HALF_X - 0.05, 0.14, ROOM_HALF_Z - 0.05));
    neon("#9b5cff", new THREE.Vector3(-ROOM_HALF_X + 0.1, H - 0.05, -ROOM_HALF_Z + 0.1), new THREE.Vector3(ROOM_HALF_X - 0.1, H - 0.05, -ROOM_HALF_Z + 0.1), ceiling);
    addLight("#ff2fb4", 2.4, 7, new THREE.Vector3(-3, 0.5, -ROOM_HALF_Z + 0.4));
    addLight("#00f0ff", 2.4, 7, new THREE.Vector3(-ROOM_HALF_X + 0.4, 0.5, 1.5));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTexture(512, 160, (ctx) => {
      ctx.font = "italic bold 92px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowBlur = 24; ctx.shadowColor = "#ff2fb4"; ctx.strokeStyle = "#ffd1f0"; ctx.lineWidth = 6;
      ctx.strokeText("chill", 256, 84); ctx.shadowBlur = 40; ctx.strokeText("chill", 256, 84);
    }) }));
    sign.position.set(-2.4, 2.1, ROOM_HALF_Z - 0.04);
    sign.rotation.y = Math.PI;
    root.add(sign);
    animated.push((t) => { sign.material.opacity = Math.random() < 0.01 ? 0.3 : 0.9 + Math.sin(t * 3) * 0.1; });
    const cabinet = new THREE.Group();
    const body = box(0.7, 1.8, 0.7, mat("#1a1238", 0.4, { metalness: 0.3 }));
    body.position.y = 0.9;
    const arcadeScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTexture(128, 100, (ctx) => {
      ctx.fillStyle = "#05010f"; ctx.fillRect(0, 0, 128, 100);
      ctx.fillStyle = "#ffe94a"; ctx.beginPath(); ctx.arc(40, 50, 14, 0.6, Math.PI * 2 - 0.6); ctx.lineTo(40, 50); ctx.fill();
      ctx.fillStyle = "#fff"; for (let x = 66; x < 120; x += 14) ctx.fillRect(x, 48, 4, 4);
      ctx.fillStyle = "#ff2fb4"; ctx.fillRect(100, 34, 16, 18);
    }) }));
    arcadeScreen.position.set(0, 1.35, -0.36);
    cabinet.add(body, arcadeScreen);
    cabinet.position.set(4.6, 0, -3.9);
    cabinet.rotation.y = -0.3;
    root.add(cabinet);
    addGlow("#ffe94a", 0.9, new THREE.Vector3(4.5, 1.35, -4.25), 0.3);
  } else {
    // A cat curled up on the rug by the fire, breathing.
    const cat = new THREE.Group();
    const fur = mat("#e08a3e", 1);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), fur);
    body.scale.set(1.25, 0.5, 1);
    body.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), fur);
    head.position.set(0.2, 0.1, 0.12);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 6), fur);
    earL.position.set(0.22, 0.19, 0.08);
    const earR = earL.clone();
    earR.position.set(0.17, 0.18, 0.17);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 20, Math.PI), fur);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.04, 0);
    cat.add(body, head, earL, earR, tail);
    cat.position.set(0.3, 0, -2.6);
    cat.rotation.y = 0.6;
    cat.traverse((part) => { part.castShadow = true; part.userData.cat = true; });
    root.add(cat);
    animated.push((t) => { body.scale.y = 0.5 + Math.sin(t * 1.6) * 0.025; });
    // A basket of firewood and a guitar against the wall.
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.35, 18, 1, true), mat("#a8794a", 1, { side: THREE.DoubleSide }));
    basket.position.set(-1.8, 0.175, -4.0);
    root.add(basket);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), mat("#5a3a22", 1));
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * 0.5;
      log.position.set(-1.8, 0.3 + (i % 2) * 0.06, -4.0);
      root.add(log);
    }
    const guitar = new THREE.Group();
    const guitarBody = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), mat("#b5713a", 0.4));
    guitarBody.scale.set(1, 1.25, 0.3);
    const neck = box(0.06, 0.65, 0.03, mat("#3a2414", 0.5));
    neck.position.y = 0.5;
    guitar.add(guitarBody, neck);
    guitar.position.set(ROOM_HALF_X - 0.22, 0.32, -0.9);
    guitar.rotation.set(0, -Math.PI / 2, 0.12);
    root.add(guitar);
  }

  // Blåhaj on the couch. Clicking it squeaks.
  const shark = new THREE.Group();
  const sharkSkin = mat(look.shark, 1);
  const sharkBody = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), sharkSkin);
  sharkBody.scale.set(2.2, 0.9, 0.9);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat("#f3f1ec", 1));
  belly.scale.set(2.0, 0.6, 0.8);
  belly.position.y = -0.05;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 8), sharkSkin);
  fin.position.set(0, 0.17, 0);
  const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), sharkSkin);
  tailFin.rotation.z = Math.PI / 2;
  tailFin.position.set(0.38, 0.02, 0);
  shark.add(sharkBody, belly, fin, tailFin);
  shark.position.set(1.05, 0.68, 0.85);
  shark.rotation.y = 0.4;
  shark.traverse((part) => { part.userData.blahaj = true; part.castShadow = true; });
  root.add(shark);

  // Dust motes drifting in the warm light.
  const moteCount = 160;
  const motes = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = Array.from({ length: moteCount }, () => [Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1, Math.random() * 10]);
  motes.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const motePoints = new THREE.Points(motes, new THREE.PointsMaterial({ color: look.motes, size: 0.02, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  root.add(motePoints);
  animated.push((t) => {
    for (let i = 0; i < moteCount; i++) {
      const [x, y, z, p] = moteSeed[i];
      motePos[i * 3] = x * (ROOM_HALF_X - 0.5) + Math.sin(t * 0.13 + p) * 0.3;
      motePos[i * 3 + 1] = 0.3 + ((y + t * 0.012) % 1) * (H - 0.6);
      motePos[i * 3 + 2] = z * (ROOM_HALF_Z - 0.5) + Math.cos(t * 0.11 + p) * 0.3;
    }
    motes.attributes.position.needsUpdate = true;
  });

  let codeNext = 0;
  const update = (t: number, dt: number) => {
    for (const { mesh, phase } of flickers) {
      mesh.scale.y = 0.85 + Math.sin(t * 9 + phase) * 0.14 + Math.sin(t * 23 + phase * 2) * 0.07;
      mesh.scale.x = 0.92 + Math.sin(t * 7 + phase) * 0.08;
    }
    for (const entry of lights) {
      entry.light.intensity = entry.base * (1 + (Math.sin(t * 11 + entry.phase) * 0.6 + Math.sin(t * 27 + entry.phase) * 0.4) * entry.amount);
    }
    for (const bulb of bulbs) {
      const twinkle = 0.75 + Math.sin(t * 1.4 + (bulb.userData.phase as number)) * 0.25;
      bulb.scale.setScalar(twinkle);
    }
    if (t > codeNext) {
      codeNext = t + 0.08;
      code?.step();
      windowCode?.step();
    }
    for (const step of animated) step(t, dt);
  };

  const background = new THREE.Color(look.background);
  return {
    root,
    ceiling,
    screenMaterial,
    shark,
    background,
    fog: new THREE.Fog(look.fog, 12, 26),
    exposure: look.exposure,
    update,
    dispose: () => glow.dispose(),
  };
}

/** Ambient light for the room: low, so lamps and fire do the work. */
export function roomAmbience(theme: RoomTheme): THREE.Object3D[] {
  const look = LOOKS[theme];
  const hemi = new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2]);
  // Soft moon/daylight through the window.
  const night = theme !== "cozy" || isNight();
  const daylight = new THREE.DirectionalLight(night ? (theme === "cyberpunk" ? "#ff7ad1" : theme === "matrix" ? "#3dff8a" : "#8fa0ff") : "#fff1d6", night ? 0.35 : 1.1);
  daylight.position.set(ROOM_HALF_X + 4, 3.5, 2.6);
  daylight.target.position.set(0, 0, 1);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(1024, 1024);
  Object.assign(daylight.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, far: 20 });
  return [hemi, daylight, daylight.target];
}
