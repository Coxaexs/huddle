/**
 * Dice textures dice-box-threejs doesn't ship, painted once on a canvas: resin swirls
 * with gold foil, a glossy Aero sheen, rot for zombies and Minecraft blocks. Their
 * names start "huddle-" (see lib/dice-styles.ts); installHuddleDiceTextures teaches
 * a DiceBox to find them.
 *
 * Each is drawn "source-over" on the die's body colour, so a texture is mostly
 * see-through and the body colour shows between the swirls.
 */

const SIZE = 256;

type Painter = (c: CanvasRenderingContext2D, random: () => number) => void;

function seeded(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const pick = <T,>(list: T[], random: () => number) => list[Math.floor(random() * list.length)];

/** A soft white sheen from the top left: wet resin and glossy plastic both catch it. */
function gloss(c: CanvasRenderingContext2D, strength: number) {
  const g = c.createRadialGradient(SIZE * 0.3, SIZE * 0.22, 4, SIZE * 0.3, SIZE * 0.22, SIZE * 0.55);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, SIZE, SIZE);
}

// ── Resin ──────────────────────────────────────────────────────────────────

const RESIN: Record<string, { swirl: string[]; deep: string }> = {
  amber: { swirl: ["255,214,102", "255,236,170", "120,40,0"], deep: "40,12,0" },
  shadow: { swirl: ["168,85,247", "236,72,153", "8,2,20"], deep: "5,0,15" },
  ocean: { swirl: ["94,234,212", "224,242,254", "2,6,40"], deep: "1,8,30" },
};

function paintResin(kind: string): Painter {
  const palette = RESIN[kind] ?? RESIN.amber;
  return (c, random) => {
    // Depth: the middle of a resin die looks deeper than its skin.
    const depth = c.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.1, SIZE / 2, SIZE / 2, SIZE * 0.75);
    depth.addColorStop(0, "rgba(0,0,0,0)");
    depth.addColorStop(1, `rgba(${palette.deep},0.55)`);
    c.fillStyle = depth;
    c.fillRect(0, 0, SIZE, SIZE);

    // Swirls of pigment, each a few wide faint strokes laid on top of each other so the edges go soft.
    c.lineCap = "round";
    for (let s = 0; s < 7; s++) {
      const colour = pick(palette.swirl, random);
      const x0 = random() * SIZE, y0 = random() * SIZE;
      const x3 = random() * SIZE, y3 = random() * SIZE;
      const cx1 = random() * SIZE * 1.4 - SIZE * 0.2, cy1 = random() * SIZE * 1.4 - SIZE * 0.2;
      const cx2 = random() * SIZE * 1.4 - SIZE * 0.2, cy2 = random() * SIZE * 1.4 - SIZE * 0.2;
      const width = 10 + random() * 34;
      for (let pass = 0; pass < 4; pass++) {
        c.strokeStyle = `rgba(${colour},${0.07 + pass * 0.04})`;
        c.lineWidth = width * (1 - pass * 0.22);
        c.beginPath();
        c.moveTo(x0, y0);
        c.bezierCurveTo(cx1, cy1, cx2, cy2, x3, y3);
        c.stroke();
      }
    }

    // Gold foil: crumpled flakes in a ring around the number. A face only shows the
    // middle of the texture, so the ring sits well inside the edges.
    const flakes = 14 + Math.floor(random() * 7);
    for (let f = 0; f < flakes; f++) {
      const a = random() * Math.PI * 2;
      const d = SIZE * (0.16 + random() * 0.2);
      const x = SIZE / 2 + Math.cos(a) * d, y = SIZE / 2 + Math.sin(a) * d;
      const r = 5 + random() * (random() < 0.3 ? 16 : 8);
      const points = 5 + Math.floor(random() * 4);
      const foil = c.createLinearGradient(x - r, y - r, x + r, y + r);
      foil.addColorStop(0, "#fff6c2");
      foil.addColorStop(0.45, "#e2b33c");
      foil.addColorStop(1, "#8a6512");
      c.fillStyle = foil;
      c.globalAlpha = 0.75 + random() * 0.25;
      c.beginPath();
      for (let p = 0; p < points; p++) {
        const a = (p / points) * Math.PI * 2 + random() * 0.6;
        const d = r * (0.45 + random() * 0.7);
        if (p === 0) c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        else c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      c.closePath();
      c.fill();
      // A crease across bigger flakes.
      if (r > 10) {
        c.strokeStyle = "rgba(255,250,220,0.8)";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x - r * 0.5, y + r * (random() - 0.5));
        c.lineTo(x + r * 0.5, y + r * (random() - 0.5));
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    // Glitter caught in the pour.
    for (let g = 0; g < 60; g++) {
      c.fillStyle = `rgba(255,${230 + Math.floor(random() * 25)},${180 + Math.floor(random() * 75)},${0.35 + random() * 0.5})`;
      const s = random() < 0.15 ? 2 : 1;
      c.fillRect(random() * SIZE, random() * SIZE, s, s);
    }

    gloss(c, 0.22);
  };
}

// ── Aero (MSN · TeamSpeak) ─────────────────────────────────────────────────

const paintAero: Painter = (c) => {
  // The hard-edged top shine of every 2005 button, and a faint glow coming back up from below.
  const top = c.createLinearGradient(0, 0, 0, SIZE * 0.5);
  top.addColorStop(0, "rgba(255,255,255,0.55)");
  top.addColorStop(1, "rgba(255,255,255,0.12)");
  c.fillStyle = top;
  c.fillRect(0, 0, SIZE, SIZE * 0.48);
  const bottom = c.createLinearGradient(0, SIZE * 0.5, 0, SIZE);
  bottom.addColorStop(0, "rgba(0,0,0,0.12)");
  bottom.addColorStop(1, "rgba(160,230,255,0.35)");
  c.fillStyle = bottom;
  c.fillRect(0, SIZE * 0.48, SIZE, SIZE * 0.52);
};

// ── Zombie ─────────────────────────────────────────────────────────────────

function paintRot(variant: number): Painter {
  return (c, random) => {
    // Mottled, bruised skin.
    for (let b = 0; b < 46; b++) {
      const x = random() * SIZE, y = random() * SIZE, r = 8 + random() * 34;
      const tone = random() < 0.2 ? "70,30,70" : random() < 0.5 ? "30,40,10" : "120,130,60";
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${tone},${0.18 + random() * 0.2})`);
      g.addColorStop(1, `rgba(${tone},0)`);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Dried blood: a splat with droplets flung off it.
    for (let s = 0; s < 2 + variant; s++) {
      const x = random() * SIZE, y = random() * SIZE, r = 5 + random() * 12;
      c.fillStyle = `rgba(${90 + Math.floor(random() * 50)},8,8,0.85)`;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      for (let d = 0; d < 7; d++) {
        const a = random() * Math.PI * 2, dist = r + random() * r * 2.2;
        c.beginPath();
        c.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, 1 + random() * 3, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Stitches across one, a crack across another.
    c.strokeStyle = "rgba(25,15,10,0.85)";
    c.lineWidth = 3;
    if (variant === 1) {
      const y = SIZE * (0.2 + random() * 0.15);
      c.beginPath();
      c.moveTo(SIZE * 0.1, y);
      c.lineTo(SIZE * 0.9, y + 10);
      c.stroke();
      for (let x = SIZE * 0.14; x < SIZE * 0.88; x += 18) {
        const yy = y + ((x - SIZE * 0.1) / (SIZE * 0.8)) * 10;
        c.beginPath();
        c.moveTo(x - 4, yy - 8);
        c.lineTo(x + 4, yy + 8);
        c.stroke();
      }
    } else if (variant === 2) {
      let x = SIZE * 0.15, y = SIZE * 0.8;
      c.beginPath();
      c.moveTo(x, y);
      for (let i = 0; i < 7; i++) {
        x += 20 + random() * 14;
        y -= random() * 26 - 4;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  };
}

// ── Minecraft blocks ───────────────────────────────────────────────────────

/** 16×16 pixels, each painted as a 16px square so they stay crisp. */
function paintPixels(colour: (x: number, y: number, random: () => number) => string): Painter {
  return (c, random) => {
    const px = SIZE / 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        c.fillStyle = colour(x, y, random);
        c.fillRect(x * px, y * px, px, px);
      }
    }
  };
}

const GRASS = ["#5d9c3a", "#6aaa40", "#4f8a30", "#7cbd4f", "#558f35", "#629f3c"];
const DIRT = ["#866043", "#79553a", "#966c4a", "#6b4a32", "#5e4029", "#8b6545"];
const STONE = ["#7d7d7d", "#8a8a8a", "#6f6f6f", "#747474", "#959595", "#828282"];
const PLANKS = ["#a5834f", "#b08d57", "#9c7a48", "#ac8a54"];
const NETHERRACK = ["#6f2b2b", "#7d3434", "#5c2121", "#8a3c3c", "#4f1a1a", "#733030"];
const OBSIDIAN = ["#140f1f", "#1a1328", "#0d0a14", "#120d1c", "#1f1530"];

/** Stone with a few clumps of ore in it. */
function ore(colours: string[]) {
  const veins: Array<[number, number]> = [];
  return paintPixels((x, y, random) => {
    if (x === 0 && y === 0) {
      veins.length = 0;
      for (let v = 0; v < 4; v++) veins.push([2 + Math.floor(random() * 12), 2 + Math.floor(random() * 12)]);
    }
    const inVein = veins.some(([vx, vy]) => Math.abs(vx - x) + Math.abs(vy - y) <= 1 && random() < 0.8);
    return inVein ? pick(colours, random) : pick(STONE, random);
  });
}

const BLOCKS: Record<string, Painter> = {
  grass: paintPixels((_x, _y, random) => pick(GRASS, random)),
  dirt: paintPixels((_x, _y, random) => (random() < 0.08 ? "#a0a0a0" : pick(DIRT, random))),
  stone: paintPixels((_x, _y, random) => (random() < 0.06 ? "#5e5e5e" : pick(STONE, random))),
  planks: paintPixels((x, y, random) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 3) return "#6b5232";
    if (x === (row % 2 ? 4 : 11) && random() < 0.9) return "#7d6038";
    return pick(PLANKS, random);
  }),
  diamond: ore(["#5decf5", "#1aa5b0", "#c9fbff", "#2bd2dc"]),
  gold: ore(["#fcee4b", "#d8af32", "#fffbb0", "#e9c43c"]),
  netherrack: paintPixels((_x, _y, random) => pick(NETHERRACK, random)),
  obsidian: paintPixels((_x, _y, random) => (random() < 0.07 ? "#3b2a5c" : pick(OBSIDIAN, random))),
};

// ── Registry ───────────────────────────────────────────────────────────────

function painterFor(name: string): Painter | null {
  const resin = name.match(/^huddle-resin-(\w+)-(\d+)$/);
  if (resin) return paintResin(resin[1]);
  if (name === "huddle-aero") return paintAero;
  const rot = name.match(/^huddle-rot-(\d+)$/);
  if (rot) return paintRot(Number(rot[1]));
  const block = name.match(/^huddle-block-(\w+)$/);
  if (block) return BLOCKS[block[1]] ?? null;
  return null;
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The texture record dice-box-threejs expects, already loaded, or null when the name isn't ours. */
export function huddleDiceTexture(name: string) {
  if (!name.startsWith("huddle-") || typeof document === "undefined") return null;
  let canvas = canvases.get(name);
  if (!canvas) {
    const painter = painterFor(name);
    if (!painter) return null;
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    painter(canvas.getContext("2d")!, seeded(name));
    canvases.set(name, canvas);
  }
  // A fresh record each time: dice-box writes the roll's material onto it.
  return { name, composite: "source-over", source: "", source_bump: "", material: "", texture: canvas };
}

/** Lets a DiceBox resolve "huddle-…" texture names (call before box.initialize()). */
export function installHuddleDiceTextures(box: { DiceColors?: { getTexture: (name: unknown) => unknown } }) {
  const colours = box.DiceColors;
  if (!colours) return;
  const builtIn = colours.getTexture.bind(colours);
  colours.getTexture = (name: unknown) => (typeof name === "string" && huddleDiceTexture(name)) || builtIn(name);
}
