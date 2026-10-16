/**
 * The 3D dice styles picked in Settings → 3D Dice. One table, read by the dice overlay
 * (colours, textures, table surface), the tabletop dice (body colours), the roll API
 * (which style words are allowed) and the settings menu.
 *
 * "default" (Solid Colour) is not in here: its colour is the player's own pick.
 */

export type DiceMaterialName = "plastic" | "metal" | "wood" | "glass";

export interface DiceStyle {
  id: string;
  label: string;
  /** Body colours. With several, each die takes one at random. */
  body: string[];
  /** Number colour: one for every die, or one per body colour. */
  ink: string | string[];
  outline?: string | string[];
  /**
   * Texture used while the player leaves texture on "Theme Default". A list matches
   * the body colours one to one. Names starting "huddle-" are painted in
   * app/lib/dice-textures.ts; the rest ship with dice-box-threejs.
   */
  texture?: string | string[];
  material?: DiceMaterialName;
  surface?: string;
}

/** A few textures per resin style, so dice in one handful don't all look stamped from one mould. */
const resin = (kind: string) => [0, 1, 2, 3].map((i) => `huddle-resin-${kind}-${i}`);

export const DICE_STYLES: DiceStyle[] = [
  {
    // A bag of ordinary dice: every die its own colour.
    id: "classic",
    label: "Dice Bag 🎲",
    body: ["#c81d25", "#1d4ed8", "#15803d", "#f5f5f4", "#18181b", "#facc15", "#7e22ce", "#ea580c", "#0d9488"],
    ink: ["#ffffff", "#ffffff", "#ffffff", "#18181b", "#ffffff", "#18181b", "#ffffff", "#ffffff", "#ffffff"],
    material: "plastic",
  },
  {
    id: "amber-resin",
    label: "Amber Resin 🍯",
    body: ["#b45309", "#c2410c", "#92400e", "#d97706"],
    ink: "#fde68a",
    outline: "#3b1702",
    texture: resin("amber"),
    material: "glass",
  },
  {
    id: "shadowflame",
    label: "Shadowflame 🔮",
    body: ["#2e1065", "#3b0764", "#1e1b4b", "#4c1d95"],
    ink: "#f5e8ff",
    outline: "#12021f",
    texture: resin("shadow"),
    material: "glass",
  },
  {
    id: "ocean-epoxy",
    label: "Ocean Epoxy 🌊",
    body: ["#0c4a6e", "#075985", "#0e7490", "#1e3a8a"],
    ink: "#fcd34d",
    outline: "#06182e",
    texture: resin("ocean"),
    material: "glass",
  },
  {
    id: "matrix",
    label: "Matrix 📟",
    body: ["#020b05", "#041a0b", "#083c18", "#0d6027", "#128537"],
    ink: "#00ff66",
    outline: "#00ff66",
    material: "glass",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk ⚡",
    body: ["#050814", "#1b0933", "#7a0c6d", "#fcee0a", "#ff003c"],
    ink: "#00f0ff",
    outline: "#ffe600",
    texture: "metal",
    material: "metal",
    surface: "stainless",
  },
  {
    id: "vampire",
    label: "Vampire 🧛",
    body: ["#140508", "#2c070d", "#5c0816", "#8a0e1e", "#c8102e"],
    ink: "#f3e7e7",
    outline: "#1a0206",
    texture: "skulls",
    material: "metal",
    surface: "stainless",
  },
  {
    id: "dark-academia",
    label: "Dark Academia 📜",
    body: ["#131a14", "#231810", "#3a2a1c", "#4d3826", "#c9a45c"],
    ink: "#f5ecd5",
    outline: "#0e130f",
    texture: "wood",
    material: "wood",
    surface: "mahogany",
  },
  {
    // MSN buddy green and Messenger blue, TeamSpeak navy: glossy like a 2005 window.
    id: "msn",
    label: "MSN · TeamSpeak 💬",
    body: ["#2f6fd6", "#4fae35", "#2580c3", "#1c3b6e", "#78c043"],
    ink: "#ffffff",
    outline: ["#123a7a", "#1f5c12", "#0f3f66", "#0a1a33", "#2f5c12"],
    texture: ["huddle-aero", "huddle-aero", "huddle-aero", "huddle-aero", "huddle-aero"],
    material: "glass",
  },
  {
    id: "zombie",
    label: "Zombie 🧟",
    body: ["#4d5e2a", "#5f6f33", "#3e4a22", "#6e7b45", "#55524a"],
    ink: "#ece6c8",
    outline: "#3a0b0b",
    texture: ["huddle-rot-0", "huddle-rot-1", "huddle-rot-2", "huddle-rot-0", "huddle-rot-1"],
    material: "plastic",
  },
  {
    // Every die a block: grass, dirt, stone, planks, diamond ore, gold ore, netherrack, obsidian.
    id: "minecraft",
    label: "Minecraft ⛏️",
    body: ["#5d9c3a", "#866043", "#7d7d7d", "#a5834f", "#7d7d7d", "#7d7d7d", "#6f2b2b", "#140f1f"],
    ink: "#ffffff",
    outline: "#2b2b2b",
    texture: [
      "huddle-block-grass",
      "huddle-block-dirt",
      "huddle-block-stone",
      "huddle-block-planks",
      "huddle-block-diamond",
      "huddle-block-gold",
      "huddle-block-netherrack",
      "huddle-block-obsidian",
    ],
    material: "wood",
  },
  {
    id: "pride",
    label: "Pride 🏳️‍🌈",
    body: ["#E40303", "#FF8C00", "#FFED00", "#008026", "#24408E", "#732982"],
    ink: "#ffffff",
  },
  {
    id: "trans",
    label: "Trans 🏳️‍⚧️",
    body: ["#5BCEFA", "#F5A9B8", "#FFFFFF", "#F5A9B8", "#5BCEFA"],
    ink: "#ffffff",
  },
  {
    id: "nonbinary",
    label: "Nonbinary 💛",
    body: ["#FFF433", "#FFFFFF", "#9B59D0", "#2C2C2C"],
    ink: "#ffffff",
  },
];

/** Settings menu order: three rows of five, Solid Colour first. */
export const DICE_STYLE_MENU: Array<[id: string, label: string]> = [
  ["default", "Solid Colour"],
  ...DICE_STYLES.map((style) => [style.id, style.label] as [string, string]),
];

export const DICE_STYLE_IDS = DICE_STYLE_MENU.map(([id]) => id);

/** Other words the roll command takes for a style. */
const DICE_STYLE_ALIASES: Record<string, string> = {
  darkacademia: "dark-academia",
  teamspeak: "msn",
  dicebag: "classic",
  ocean: "ocean-epoxy",
  epoxy: "ocean-epoxy",
};

export const DICE_STYLE_WORDS = [...DICE_STYLE_IDS, ...Object.keys(DICE_STYLE_ALIASES)];

/** A style id from a style word, or null when it isn't one. */
export function resolveDiceStyle(word: string | null | undefined): string | null {
  if (!word) return null;
  const lower = word.toLowerCase();
  const id = DICE_STYLE_ALIASES[lower] ?? lower;
  return DICE_STYLE_IDS.includes(id) ? id : null;
}

export function getDiceStyle(id: string | null | undefined): DiceStyle | null {
  const resolved = resolveDiceStyle(id);
  return DICE_STYLES.find((style) => style.id === resolved) ?? null;
}

/** App themes that bring their own dice when the player left dice on Solid Colour. */
const THEME_DICE: Record<string, string> = {
  vampire: "vampire",
  "dark-academia": "dark-academia",
  matrix: "matrix",
  cyberpunk: "cyberpunk",
  msn: "msn",
  "msn-dark": "msn",
  teamspeak: "msn",
  minecraft: "minecraft",
  zombie: "zombie",
};

/** The dice style a roll uses: the player's pick, or their app theme's dice while on Solid Colour. */
export function inheritDiceStyle(diceStyle: string | null | undefined, appThemeId: string | null | undefined): string {
  const picked = resolveDiceStyle(diceStyle) ?? "default";
  if (picked !== "default") return picked;
  return (appThemeId && THEME_DICE[appThemeId]) || "default";
}
