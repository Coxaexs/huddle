/*
 * Profile style: how someone's display name, profile card and voice tile look
 * wherever they show up. It is stored as one JSON column (users.profile_style)
 * so new knobs don't each need a migration.
 *
 * Every value is an id from the catalogs below or a #rrggbb colour; nothing a
 * user types ever reaches CSS. The visuals live in app/profile-style.css and
 * the client helpers in app/lib/profile-look.ts.
 */

export interface StyleOption {
  id: string;
  name: string;
  desc?: string;
  group?: string;
}

/* ------------------------------------------------------------------ */
/* Display name                                                        */
/* ------------------------------------------------------------------ */

export interface NameFontSpec extends StyleOption {
  /** Google Fonts family; loaded on demand the first time someone wears it. */
  family?: string;
  weight?: number;
  /** Optical size correction, so every font reads at about the same size. */
  scale?: number;
  tracking?: string;
}

/** Every family here ships Latin Extended, so Turkish and Polish names render in the font. */
export const NAME_FONTS = [
  { id: "default", name: "Default", group: "Clean" },
  { id: "elegant", name: "Elegant", group: "Clean", family: "Playfair Display", weight: 700, scale: 1.04 },
  { id: "royal", name: "Royal", group: "Clean", family: "Cinzel", weight: 700, scale: 0.96, tracking: "0.02em" },
  { id: "slab", name: "Slab", group: "Clean", family: "Zilla Slab", weight: 700, scale: 1.1 },
  { id: "moderno", name: "Moderno", group: "Clean", family: "MuseoModerno", weight: 700, scale: 0.98 },
  { id: "wide", name: "Wide", group: "Clean", family: "Syncopate", weight: 700, scale: 0.8, tracking: "0.03em" },
  { id: "mono", name: "Mono", group: "Clean", family: "Space Mono", weight: 700, scale: 0.94 },
  { id: "poster", name: "Poster", group: "Clean", family: "Bebas Neue", weight: 400, scale: 1.24, tracking: "0.04em" },
  { id: "bubbly", name: "Bubbly", group: "Playful", family: "Fredoka", weight: 600, scale: 1.04 },
  { id: "cherry", name: "Cherry", group: "Playful", family: "Cherry Bomb One", weight: 400, scale: 1.1 },
  { id: "comic", name: "Comic", group: "Playful", family: "Bangers", weight: 400, scale: 1.16, tracking: "0.05em" },
  { id: "chunky", name: "Chunky", group: "Playful", family: "Bagel Fat One", weight: 400, scale: 1.02 },
  { id: "handwritten", name: "Handwritten", group: "Playful", family: "Caveat", weight: 700, scale: 1.32 },
  { id: "script", name: "Script", group: "Playful", family: "Pacifico", weight: 400, scale: 0.96 },
  { id: "cursive", name: "Cursive", group: "Playful", family: "Dancing Script", weight: 700, scale: 1.24 },
  { id: "gummy", name: "Gummy", group: "Playful", family: "Sour Gummy", weight: 600, scale: 1.02 },
  { id: "pixel", name: "Pixel", group: "Themed", family: "Pixelify Sans", weight: 600, scale: 1.08 },
  { id: "arcade", name: "Arcade", group: "Themed", family: "Press Start 2P", weight: 400, scale: 0.7 },
  { id: "scifi", name: "Sci-Fi", group: "Themed", family: "Audiowide", weight: 400, scale: 0.98 },
  { id: "neon", name: "Neon Sign", group: "Themed", family: "Tilt Neon", weight: 400, scale: 1.06 },
  { id: "glitch", name: "Glitch", group: "Themed", family: "Rubik Glitch", weight: 400, scale: 0.98 },
  { id: "gothic", name: "Gothic", group: "Themed", family: "Pirata One", weight: 400, scale: 1.2 },
  { id: "metal", name: "Metal", group: "Themed", family: "Metal Mania", weight: 400, scale: 1.12 },
  { id: "drip", name: "Drip", group: "Themed", family: "Rubik Wet Paint", weight: 400, scale: 0.98 },
  { id: "western", name: "Western", group: "Themed", family: "Rye", weight: 400, scale: 0.9 },
  { id: "typewriter", name: "Typewriter", group: "Themed", family: "Special Elite", weight: 400, scale: 1.02 },
  { id: "stencil", name: "Stencil", group: "Themed", family: "Black Ops One", weight: 400, scale: 0.98 },
  { id: "blocky", name: "Blocky", group: "Themed", family: "Silkscreen", weight: 400, scale: 0.92, tracking: "0.02em" },
  { id: "undead", name: "Undead", group: "Themed", family: "Eater", weight: 400, scale: 0.92 },
] as const satisfies readonly NameFontSpec[];

export interface NameEffectSpec extends StyleOption {
  /** How many colours the effect takes: [fewest, most]. [0, 0] brings its own. */
  colors: readonly [number, number];
  /** Starting colours when someone switches to this effect. */
  defaults: readonly string[];
  /** Animates letter by letter, so the name is split into spans. */
  letters?: boolean;
}

export const NAME_EFFECTS = [
  { id: "solid", name: "Solid", group: "Classic", colors: [1, 1], defaults: ["#ff7ab8"], desc: "One clean colour." },
  { id: "gradient", name: "Gradient", group: "Classic", colors: [2, 3], defaults: ["#ff7ab8", "#7c6cff"], desc: "Two or three colours, drifting when it moves." },
  { id: "outline", name: "Outline", group: "Classic", colors: [1, 1], defaults: ["#7dd3fc"], desc: "Hollow letters with a bright edge that fills in." },
  { id: "highlight", name: "Highlighter", group: "Classic", colors: [1, 1], defaults: ["#fde047"], desc: "A marker stroke swiped behind your name." },
  { id: "toon", name: "Toon", group: "Classic", colors: [2, 2], defaults: ["#ffd23f", "#ff4d6d"], desc: "Cartoon fill with a thick ink outline." },
  { id: "pop", name: "Pop", group: "Classic", colors: [2, 2], defaults: ["#ffffff", "#7c6cff"], desc: "Letters pushed out in 3D." },
  { id: "neon", name: "Neon", group: "Glow", colors: [1, 1], defaults: ["#ff3cac"], desc: "A buzzing glass tube, with the odd flicker." },
  { id: "aura", name: "Aura", group: "Glow", colors: [1, 1], defaults: ["#a78bfa"], desc: "A soft halo that breathes." },
  { id: "fire", name: "Fire", group: "Glow", colors: [0, 0], defaults: [], desc: "Flames licking up through the letters." },
  { id: "frost", name: "Frost", group: "Glow", colors: [0, 0], defaults: [], desc: "Icy letters with glints of light." },
  { id: "galaxy", name: "Galaxy", group: "Glow", colors: [2, 2], defaults: ["#b18cff", "#5ee7ff"], desc: "A nebula with stars twinkling inside." },
  { id: "shimmer", name: "Shimmer", group: "Shine", colors: [1, 2], defaults: ["#f5d0fe", "#a78bfa"], desc: "A band of light sweeping across." },
  { id: "chrome", name: "Chrome", group: "Shine", colors: [1, 1], defaults: ["#e2e8f0"], desc: "Polished metal. Tint it gold, rose or steel." },
  { id: "holo", name: "Holographic", group: "Shine", colors: [0, 0], defaults: [], desc: "Iridescent foil that shifts as it moves." },
  { id: "rainbow", name: "Rainbow", group: "Shine", colors: [0, 0], defaults: [], desc: "The whole spectrum, flowing." },
  { id: "sparkle", name: "Sparkle", group: "Shine", colors: [1, 2], defaults: ["#fff1a8", "#ffb3d9"], desc: "Little stars twinkling around your name." },
  { id: "candy", name: "Candy", group: "Wild", colors: [2, 2], defaults: ["#ff6fae", "#ffffff"], desc: "Candy-cane stripes rolling by." },
  { id: "retro", name: "Retro", group: "Wild", colors: [2, 2], defaults: ["#ffd23f", "#ff3cac"], desc: "80s chrome sunset with a hard drop shadow." },
  { id: "anaglyph", name: "3D Glasses", group: "Wild", colors: [2, 2], defaults: ["#00e5ff", "#ff2bd6"], desc: "Red-blue split, like an old 3D movie." },
  { id: "glitch", name: "Glitch", group: "Wild", colors: [1, 1], defaults: ["#e5e7eb"], desc: "RGB tearing and the occasional jolt." },
  { id: "liquid", name: "Liquid", group: "Wild", colors: [2, 2], defaults: ["#38bdf8", "#1e3a8a"], desc: "Filled with sloshing liquid." },
  { id: "wave", name: "Wave", group: "Wild", colors: [1, 2], defaults: ["#5eead4", "#818cf8"], letters: true, desc: "Letters riding a wave." },
  { id: "jelly", name: "Jelly", group: "Wild", colors: [1, 2], defaults: ["#86efac", "#22d3ee"], letters: true, desc: "Bouncy, squishy letters." },
  { id: "enchanted", name: "Enchanted", group: "Shine", colors: [1, 1], defaults: ["#5ce1e6"], desc: "Minecraft's purple enchantment glint rolling over your name." },
  { id: "infected", name: "Infected", group: "Wild", colors: [1, 1], defaults: ["#9be15d"], desc: "Sickly and rotting, with a pulse and the odd drip." },
] as const satisfies readonly NameEffectSpec[];

/* ------------------------------------------------------------------ */
/* Profile card                                                        */
/* ------------------------------------------------------------------ */

export const CARD_FINISHES = [
  { id: "gradient", name: "Gradient", desc: "Primary at the top, accent at the bottom." },
  { id: "diagonal", name: "Diagonal", desc: "A lit sweep from corner to corner." },
  { id: "mesh", name: "Mesh", desc: "Soft pools of colour blended together." },
  { id: "aurora", name: "Aurora", desc: "Slowly drifting northern lights." },
  { id: "glass", name: "Frosted Glass", desc: "Smoky glass, lit from the edges." },
  { id: "holo", name: "Holo Foil", desc: "Trading-card foil that catches the light as it tilts." },
  { id: "spotlight", name: "Spotlight", desc: "Dark stage, one light from above." },
  { id: "split", name: "Split", desc: "Two colours cut on a bold diagonal." },
  { id: "pixel", name: "Pixel Bands", desc: "Hard-stepped bands of colour, like a blocky sky." },
  { id: "grime", name: "Grime", desc: "Stained and dark, with a sickly glow seeping up from below." },
] as const satisfies readonly StyleOption[];

export const CARD_PATTERNS = [
  { id: "none", name: "None" },
  { id: "dots", name: "Dots" },
  { id: "grid", name: "Grid" },
  { id: "stripes", name: "Stripes" },
  { id: "checker", name: "Checker" },
  { id: "stars", name: "Stars" },
  { id: "hearts", name: "Hearts" },
  { id: "waves", name: "Waves" },
  { id: "hex", name: "Hexagons" },
  { id: "plus", name: "Plus" },
  { id: "sparkles", name: "Sparkles" },
  { id: "topo", name: "Contours" },
  { id: "circuit", name: "Circuit" },
  { id: "petals", name: "Petals" },
  { id: "blocks", name: "Blocks" },
  { id: "creeper", name: "Creeper" },
  { id: "biohazard", name: "Biohazard" },
  { id: "splatter", name: "Splatter" },
] as const satisfies readonly StyleOption[];

export const CARD_EDGES = [
  { id: "soft", name: "Soft", desc: "A quiet hairline." },
  { id: "line", name: "Gradient", desc: "A crisp edge in your two colours." },
  { id: "glow", name: "Glow", desc: "The card glows in your colours." },
  { id: "flow", name: "Flowing", desc: "Light running around the edge." },
  { id: "none", name: "None", desc: "No border at all." },
] as const satisfies readonly StyleOption[];

export const CARD_MOTIONS = [
  { id: "tilt", name: "Tilt", desc: "Leans toward the pointer, with a glare." },
  { id: "float", name: "Float", desc: "Bobs gently in place." },
  { id: "still", name: "Still", desc: "Stays put." },
] as const satisfies readonly StyleOption[];

/** How your card arrives when someone opens it. */
export const CARD_ENTRANCES = [
  { id: "pop", name: "Pop" },
  { id: "rise", name: "Rise" },
  { id: "flip", name: "Flip" },
  { id: "unfold", name: "Unfold" },
  { id: "zoom", name: "Zoom" },
  { id: "swing", name: "Swing" },
  { id: "glitch", name: "Glitch" },
  { id: "drop", name: "Drop" },
] as const satisfies readonly StyleOption[];

/* ------------------------------------------------------------------ */
/* Voice                                                               */
/* ------------------------------------------------------------------ */

/** What shows around your avatar while you talk. */
export const VOICE_RINGS = [
  { id: "classic", name: "Classic", group: "Rings", desc: "A clean ring that pulses with your voice." },
  { id: "ripple", name: "Ripple", group: "Rings", desc: "Rings spreading out like a pond." },
  { id: "rainbow", name: "Rainbow", group: "Rings", desc: "A spinning spectrum ring." },
  { id: "orbit", name: "Orbit", group: "Rings", desc: "Moons circling while you speak." },
  { id: "electric", name: "Electric", group: "Rings", desc: "Crackling current around you." },
  { id: "glitch", name: "Glitch", group: "Rings", desc: "A ring that tears into RGB." },
  { id: "aura", name: "Aura", group: "Glows", desc: "A big soft glow that breathes." },
  { id: "flame", name: "Flame", group: "Glows", desc: "Your avatar wreathed in fire." },
  { id: "soundwave", name: "Soundwave", group: "Glows", desc: "Equalizer bars dancing around you." },
  { id: "sparkle", name: "Sparkle", group: "Particles", desc: "Stars twinkling around your avatar." },
  { id: "hearts", name: "Hearts", group: "Particles", desc: "Hearts floating up as you talk." },
  { id: "bubbles", name: "Bubbles", group: "Particles", desc: "Bubbles drifting up." },
  { id: "notes", name: "Music Notes", group: "Particles", desc: "Notes floating off your words." },
  { id: "petals", name: "Petals", group: "Particles", desc: "Blossom petals swirling past." },
] as const satisfies readonly StyleOption[];

/** Played on your tile when you join a call someone is watching. */
export const JOIN_FLOURISHES = [
  { id: "pop", name: "Pop", desc: "A springy pop-in." },
  { id: "sparkle", name: "Sparkle Burst", desc: "A burst of stars." },
  { id: "shockwave", name: "Shockwave", desc: "A ring of force." },
  { id: "portal", name: "Portal", desc: "Stepping out of a swirling portal." },
  { id: "confetti", name: "Confetti", desc: "A party popper." },
  { id: "lightning", name: "Lightning", desc: "Arrive with a thunderclap." },
  { id: "glitch", name: "Glitch", desc: "Teleported in, slightly corrupted." },
  { id: "drop", name: "Drop In", desc: "Falls in and bounces." },
  { id: "smoke", name: "Smoke", desc: "Appear from a puff of smoke." },
  { id: "hearts", name: "Hearts", desc: "A shower of hearts." },
  { id: "petals", name: "Petals", desc: "Blossoms swirl and settle." },
  { id: "bats", name: "Bats", desc: "A flutter of bats." },
  { id: "pixels", name: "Pixels", desc: "Assembled out of pixels." },
  { id: "creeper", name: "Creeper", desc: "Hiss, flash... boom." },
  { id: "grave", name: "Grave", desc: "Claw your way up out of the dirt." },
] as const satisfies readonly StyleOption[];

export const VOICE_TILES = [
  { id: "theme", name: "Card theme", desc: "Your tile wears your card colours." },
  { id: "plain", name: "Plain", desc: "The app's own tile." },
] as const satisfies readonly StyleOption[];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Ids<T extends readonly { id: string }[]> = T[number]["id"];
export type NameFontId = Ids<typeof NAME_FONTS>;
export type NameEffectId = Ids<typeof NAME_EFFECTS>;
export type CardFinishId = Ids<typeof CARD_FINISHES>;
export type CardPatternId = Ids<typeof CARD_PATTERNS>;
export type CardEdgeId = Ids<typeof CARD_EDGES>;
export type CardMotionId = Ids<typeof CARD_MOTIONS>;
export type CardEntranceId = Ids<typeof CARD_ENTRANCES>;
export type VoiceRingId = Ids<typeof VOICE_RINGS>;
export type JoinFlourishId = Ids<typeof JOIN_FLOURISHES>;
export type VoiceTileId = Ids<typeof VOICE_TILES>;

export interface ProfileStyle {
  font?: NameFontId;
  effect?: NameEffectId;
  /** Colours for the effect, as many as it takes (see NAME_EFFECTS). */
  nameColors?: string[];
  /** Card primary (top) and accent (bottom), like a Discord profile theme. */
  theme?: [string, string];
  finish?: CardFinishId;
  pattern?: CardPatternId;
  edge?: CardEdgeId;
  motion?: CardMotionId;
  entrance?: CardEntranceId;
  ring?: VoiceRingId;
  ringColor?: string;
  join?: JoinFlourishId;
  tile?: VoiceTileId;
}

export function nameFont(id: string | undefined): NameFontSpec | undefined {
  return id ? NAME_FONTS.find((font) => font.id === id) : undefined;
}

export function nameEffect(id: string | undefined): NameEffectSpec | undefined {
  return id ? NAME_EFFECTS.find((effect) => effect.id === id) : undefined;
}

/* ------------------------------------------------------------------ */
/* Looks: whole outfits in one click                                   */
/* ------------------------------------------------------------------ */

export interface StyleLook {
  id: string;
  name: string;
  style: ProfileStyle;
}

export const STYLE_LOOKS: StyleLook[] = [
  {
    id: "sakura",
    name: "Sakura",
    style: { font: "cherry", effect: "gradient", nameColors: ["#ffd1e3", "#ff6fae"], theme: ["#ffb3d1", "#7a2852"], finish: "aurora", pattern: "petals", edge: "glow", motion: "float", entrance: "unfold", ring: "petals", ringColor: "#ff8fc0", join: "petals", tile: "theme" },
  },
  {
    id: "synthwave",
    name: "Synthwave",
    style: { font: "scifi", effect: "retro", nameColors: ["#ffd23f", "#ff3cac"], theme: ["#3a0f6b", "#ff3cac"], finish: "spotlight", pattern: "grid", edge: "flow", motion: "tilt", entrance: "glitch", ring: "rainbow", ringColor: "#ff3cac", join: "portal", tile: "theme" },
  },
  {
    id: "abyss",
    name: "Abyss",
    style: { font: "elegant", effect: "aura", nameColors: ["#5eead4"], theme: ["#04293a", "#020b12"], finish: "mesh", pattern: "waves", edge: "glow", motion: "float", entrance: "rise", ring: "ripple", ringColor: "#2dd4bf", join: "shockwave", tile: "theme" },
  },
  {
    id: "toxic",
    name: "Toxic",
    style: { font: "drip", effect: "neon", nameColors: ["#a3ff12"], theme: ["#1a2e05", "#050a02"], finish: "spotlight", pattern: "hex", edge: "glow", motion: "tilt", entrance: "glitch", ring: "electric", ringColor: "#a3ff12", join: "glitch", tile: "theme" },
  },
  {
    id: "royal",
    name: "Royal",
    style: { font: "royal", effect: "chrome", nameColors: ["#f5d27a"], theme: ["#3b1670", "#140726"], finish: "holo", pattern: "stars", edge: "line", motion: "tilt", entrance: "flip", ring: "sparkle", ringColor: "#f5d27a", join: "sparkle", tile: "theme" },
  },
  {
    id: "arcade",
    name: "Arcade",
    style: { font: "arcade", effect: "pop", nameColors: ["#ffd23f", "#ff4d6d"], theme: ["#241b5c", "#0e0a26"], finish: "split", pattern: "checker", edge: "line", motion: "tilt", entrance: "drop", ring: "soundwave", ringColor: "#ffd23f", join: "pixels", tile: "theme" },
  },
  {
    id: "frostbite",
    name: "Frostbite",
    style: { font: "wide", effect: "frost", theme: ["#bfe6ff", "#1d4e89"], finish: "glass", pattern: "sparkles", edge: "glow", motion: "float", entrance: "zoom", ring: "sparkle", ringColor: "#a5e1ff", join: "shockwave", tile: "theme" },
  },
  {
    id: "inferno",
    name: "Inferno",
    style: { font: "metal", effect: "fire", theme: ["#5a1300", "#140300"], finish: "spotlight", edge: "glow", motion: "tilt", entrance: "drop", ring: "flame", ringColor: "#ff7a1a", join: "lightning", tile: "theme" },
  },
  {
    id: "cotton-candy",
    name: "Cotton Candy",
    style: { font: "bubbly", effect: "candy", nameColors: ["#ff4fa3", "#6cc0ff"], theme: ["#ffd6ec", "#b9e2ff"], finish: "gradient", pattern: "hearts", edge: "line", motion: "float", entrance: "pop", ring: "bubbles", ringColor: "#ff9ccf", join: "hearts", tile: "theme" },
  },
  {
    id: "noir",
    name: "Noir",
    style: { font: "typewriter", effect: "solid", nameColors: ["#f1f1f1"], theme: ["#2b2b2e", "#0a0a0b"], finish: "glass", edge: "soft", motion: "still", entrance: "rise", ring: "classic", ringColor: "#e5e5e5", join: "smoke", tile: "theme" },
  },
  {
    id: "haunted",
    name: "Haunted",
    style: { font: "gothic", effect: "glitch", nameColors: ["#e9d5ff"], theme: ["#2a0b3d", "#07020b"], finish: "mesh", pattern: "topo", edge: "flow", motion: "float", entrance: "swing", ring: "aura", ringColor: "#b26bff", join: "bats", tile: "theme" },
  },
  {
    id: "galaxy",
    name: "Galaxy",
    style: { font: "moderno", effect: "galaxy", nameColors: ["#c4b5fd", "#5ee7ff"], theme: ["#1e1b4b", "#04030f"], finish: "aurora", pattern: "stars", edge: "glow", motion: "tilt", entrance: "zoom", ring: "orbit", ringColor: "#a78bfa", join: "portal", tile: "theme" },
  },
  {
    id: "matcha",
    name: "Matcha",
    style: { font: "handwritten", effect: "highlight", nameColors: ["#bef264"], theme: ["#d9f99d", "#3f6212"], finish: "diagonal", pattern: "dots", edge: "soft", motion: "float", entrance: "rise", ring: "classic", ringColor: "#84cc16", join: "pop", tile: "theme" },
  },
  {
    id: "mainframe",
    name: "Mainframe",
    style: { font: "mono", effect: "anaglyph", nameColors: ["#00e5ff", "#ff2bd6"], theme: ["#06202b", "#020608"], finish: "glass", pattern: "circuit", edge: "flow", motion: "tilt", entrance: "glitch", ring: "glitch", ringColor: "#00e5ff", join: "pixels", tile: "theme" },
  },
  {
    id: "lagoon",
    name: "Lagoon",
    style: { font: "bubbly", effect: "liquid", nameColors: ["#67e8f9", "#1d4ed8"], theme: ["#0ea5e9", "#082f49"], finish: "gradient", pattern: "waves", edge: "glow", motion: "float", entrance: "drop", ring: "bubbles", ringColor: "#67e8f9", join: "pop", tile: "theme" },
  },
  {
    id: "comic",
    name: "Comic Book",
    style: { font: "comic", effect: "toon", nameColors: ["#ffffff", "#e11d48"], theme: ["#fde047", "#dc2626"], finish: "split", pattern: "dots", edge: "line", motion: "tilt", entrance: "swing", ring: "electric", ringColor: "#facc15", join: "confetti", tile: "theme" },
  },
  {
    id: "creeper",
    name: "Creeper",
    style: { font: "blocky", effect: "pop", nameColors: ["#8be35f", "#1f4d14"], theme: ["#5fa83f", "#1c3315"], finish: "pixel", pattern: "creeper", edge: "line", motion: "tilt", entrance: "drop", ring: "soundwave", ringColor: "#7ddc5a", join: "creeper", tile: "theme" },
  },
  {
    id: "diamond",
    name: "Diamond",
    style: { font: "blocky", effect: "enchanted", nameColors: ["#7ff3f0"], theme: ["#3fb8c4", "#131c33"], finish: "pixel", pattern: "blocks", edge: "glow", motion: "float", entrance: "zoom", ring: "sparkle", ringColor: "#7ff3f0", join: "pixels", tile: "theme" },
  },
  {
    id: "nether",
    name: "Nether",
    style: { font: "blocky", effect: "fire", theme: ["#8a1c1c", "#1a0505"], finish: "spotlight", pattern: "blocks", edge: "glow", motion: "tilt", entrance: "drop", ring: "flame", ringColor: "#ff6a1a", join: "portal", tile: "theme" },
  },
  {
    id: "outbreak",
    name: "Outbreak",
    style: { font: "undead", effect: "infected", nameColors: ["#a3e635"], theme: ["#4d6b22", "#0b0f06"], finish: "grime", pattern: "biohazard", edge: "glow", motion: "float", entrance: "glitch", ring: "aura", ringColor: "#a3e635", join: "grave", tile: "theme" },
  },
  {
    id: "bitten",
    name: "Bitten",
    style: { font: "drip", effect: "infected", nameColors: ["#e23b3b"], theme: ["#5a0e0e", "#0a0303"], finish: "grime", pattern: "splatter", edge: "glow", motion: "float", entrance: "drop", ring: "aura", ringColor: "#e23b3b", join: "grave", tile: "theme" },
  },
  {
    id: "quarantine",
    name: "Quarantine",
    style: { font: "stencil", effect: "solid", nameColors: ["#f5c400"], theme: ["#3a3410", "#0c0b06"], finish: "grime", pattern: "stripes", edge: "line", motion: "still", entrance: "swing", ring: "electric", ringColor: "#f5c400", join: "smoke", tile: "theme" },
  },
];

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const HEX = /^#[0-9a-f]{6}$/i;

function pick<T extends readonly { id: string }[]>(list: T, value: unknown): T[number]["id"] | undefined {
  return typeof value === "string" && list.some((item) => item.id === value) ? (value as T[number]["id"]) : undefined;
}

function hex(value: unknown): string | undefined {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : undefined;
}

/** Keeps only known ids and #rrggbb colours; anything else is dropped. */
export function normalizeProfileStyle(value: unknown): ProfileStyle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const style: ProfileStyle = {};

  const font = pick(NAME_FONTS, raw.font);
  if (font && font !== "default") style.font = font;
  const effect = pick(NAME_EFFECTS, raw.effect);
  if (effect) {
    style.effect = effect;
    const spec = nameEffect(effect)!;
    const colors = Array.isArray(raw.nameColors) ? raw.nameColors.map(hex).filter((c): c is string => Boolean(c)) : [];
    const [min, max] = spec.colors;
    if (max > 0) {
      const kept = colors.slice(0, max);
      // Top up from the effect's own defaults rather than reject the save.
      for (let i = kept.length; i < min; i++) kept.push(spec.defaults[i] ?? kept[0] ?? "#ffffff");
      style.nameColors = kept;
    }
  }

  if (Array.isArray(raw.theme) && raw.theme.length === 2) {
    const a = hex(raw.theme[0]);
    const b = hex(raw.theme[1]);
    if (a && b) style.theme = [a, b];
  }
  const finish = pick(CARD_FINISHES, raw.finish);
  if (finish) style.finish = finish;
  const pattern = pick(CARD_PATTERNS, raw.pattern);
  if (pattern && pattern !== "none") style.pattern = pattern;
  const edge = pick(CARD_EDGES, raw.edge);
  if (edge) style.edge = edge;
  const motion = pick(CARD_MOTIONS, raw.motion);
  if (motion) style.motion = motion;
  const entrance = pick(CARD_ENTRANCES, raw.entrance);
  if (entrance) style.entrance = entrance;

  const ring = pick(VOICE_RINGS, raw.ring);
  if (ring) style.ring = ring;
  const ringColor = hex(raw.ringColor);
  if (ringColor) style.ringColor = ringColor;
  const join = pick(JOIN_FLOURISHES, raw.join);
  if (join) style.join = join;
  const tile = pick(VOICE_TILES, raw.tile);
  if (tile) style.tile = tile;
  return style;
}

/* ------------------------------------------------------------------ */
/* Colour helpers (shared by the cards and the editor)                 */
/* ------------------------------------------------------------------ */

export function hexToRgb(value: string): [number, number, number] {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(value: string): number {
  const [r, g, b] = hexToRgb(value).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Light cards get dark text, the way Discord flips a profile theme. */
export function themeIsLight(theme: readonly [string, string]): boolean {
  // The top of the card carries the name, so it counts for more.
  return luminance(theme[0]) * 0.6 + luminance(theme[1]) * 0.4 > 0.42;
}
