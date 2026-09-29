/**
 * Text decorations beyond Discord markdown: colours, highlights, fonts, sizes
 * and effects, written as Messenger Plus!-style tags so `[c=red]hi[/c]` and
 * `[c=4]hi[/c]` both work. Shared by the renderer (message-body.tsx), the
 * composer menus and anything that needs the plain text back (previews,
 * push notifications).
 *
 * Every value is looked up in a whitelist or validated as a hex colour; no
 * user text ever reaches CSS unchecked.
 */

/** Named colours offered in the pickers, readable on light and dark themes. */
export const TEXT_COLORS: Record<string, string> = {
  red: "#e5484d",
  orange: "#f76b15",
  yellow: "#e2b203",
  lime: "#7bc043",
  green: "#30a46c",
  teal: "#12a594",
  cyan: "#05a2c2",
  blue: "#3e7bfa",
  navy: "#1c3f95",
  purple: "#8e4ec6",
  pink: "#e93d82",
  brown: "#a0632d",
  gray: "#8b8d98",
  black: "#111111",
  white: "#ffffff",
};

/**
 * Messenger Plus!'s numbered palette, so `[c=4]` pastes from 2005 still work.
 * (Plus! used the mIRC colour numbers.)
 */
const PLUS_PALETTE = [
  "#ffffff", "#000000", "#00007f", "#009300", "#ff0000", "#7f0000", "#9c009c", "#fc7f00",
  "#ffff00", "#00fc00", "#009393", "#00ffff", "#0000fc", "#ff00ff", "#7f7f7f", "#d2d2d2",
];

/** Highlighter colours: soft enough that text on top stays readable. */
export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "#fff3a3",
  green: "#c8f7c5",
  blue: "#cfe4ff",
  pink: "#ffd1e8",
  orange: "#ffe0b8",
  purple: "#e6d6ff",
};

export interface TextFont {
  id: string;
  name: string;
  stack: string;
}

/** Fonts are whitelisted stacks: real fonts where installed, a sensible cousin elsewhere. */
export const TEXT_FONTS: TextFont[] = [
  { id: "comic", name: "Comic Sans MS", stack: '"Comic Sans MS", "Comic Neue", "Chalkboard SE", "Comic Relief", cursive' },
  { id: "times", name: "Times New Roman", stack: '"Times New Roman", Times, "Liberation Serif", serif' },
  { id: "georgia", name: "Georgia", stack: 'Georgia, "DejaVu Serif", serif' },
  { id: "courier", name: "Courier New", stack: '"Courier New", Courier, "Liberation Mono", monospace' },
  { id: "impact", name: "Impact", stack: 'Impact, Haettenschweiler, "Arial Narrow Bold", "DejaVu Sans Condensed", sans-serif' },
  { id: "arial", name: "Arial", stack: 'Arial, Helvetica, "Liberation Sans", sans-serif' },
  { id: "verdana", name: "Verdana", stack: 'Verdana, "DejaVu Sans", sans-serif' },
  { id: "tahoma", name: "Tahoma", stack: 'Tahoma, "Segoe UI", "DejaVu Sans", sans-serif' },
  { id: "trebuchet", name: "Trebuchet MS", stack: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { id: "script", name: "Script", stack: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", "Apple Chancery", cursive' },
  { id: "papyrus", name: "Papyrus", stack: 'Papyrus, "Herculanum", fantasy' },
  { id: "gothic", name: "Old English", stack: '"Old English Text MT", "UnifrakturMaguntia", "Blackletter", fantasy' },
  { id: "typewriter", name: "Typewriter", stack: '"American Typewriter", "Courier Prime", "Courier New", monospace' },
  { id: "lucida", name: "Lucida Console", stack: '"Lucida Console", Monaco, "DejaVu Sans Mono", monospace' },
];

export const TEXT_SIZES: Record<string, string> = {
  tiny: "0.7em",
  small: "0.85em",
  big: "1.3em",
  huge: "1.75em",
};

/** Effects that need no argument; each maps to a `.fx-<name>` class in globals.css. */
export const TEXT_EFFECTS = [
  { id: "rainbow", name: "Rainbow" },
  { id: "glow", name: "Glow" },
  { id: "shadow", name: "Shadow" },
  { id: "outline", name: "Outline" },
  { id: "wave", name: "Wave" },
  { id: "shake", name: "Shake" },
  { id: "bounce", name: "Bounce" },
  { id: "blink", name: "Blink" },
  { id: "sparkle", name: "Sparkle" },
  { id: "flip", name: "Upside down" },
  { id: "mirror", name: "Mirror" },
  { id: "wide", name: "Wide" },
  { id: "caps", name: "Small caps" },
  { id: "sup", name: "Superscript" },
  { id: "sub", name: "Subscript" },
] as const;

export type TextEffect = (typeof TEXT_EFFECTS)[number]["id"];

/** Effects drawn letter by letter (each character gets its own delay). */
export const PER_LETTER_EFFECTS = new Set<string>(["wave", "bounce", "shake"]);

const EFFECT_IDS = new Set<string>(TEXT_EFFECTS.map((e) => e.id));

/** Tag aliases → canonical tag. */
const TAG_ALIASES: Record<string, string> = {
  b: "b",
  i: "i",
  u: "u",
  s: "s",
  c: "c",
  color: "c",
  colour: "c",
  a: "a",
  bg: "a",
  hl: "a",
  highlight: "a",
  f: "f",
  font: "f",
  size: "size",
  ...Object.fromEntries(TEXT_EFFECTS.map((e) => [e.id, e.id])),
};

const TAG_NAMES = Object.keys(TAG_ALIASES)
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * Matches one `[tag]…[/tag]` or `[tag=value]…[/tag]` pair (lazy, so the first
 * closing tag of the same name ends it). Messenger Plus! gradients close with
 * a value too: `[c=red]text[/c=blue]`. Upper-case tags are accepted, as Plus!
 * users often typed `[B]` (the patterns using it carry the `i` flag). Named
 * groups keep it embeddable in a bigger alternation: tag, arg, body, end.
 */
export const TAG_SOURCE = `\\[(?<tag>${TAG_NAMES})(?:=(?<arg>[#\\w]{1,24}))?\\](?<body>[\\s\\S]*?)\\[\\/\\k<tag>(?:=(?<end>[#\\w]{1,24}))?\\]`;

/** A standalone copy of the tag pattern (case-insensitive). */
export const TAG_PATTERN = new RegExp(TAG_SOURCE, "gi");

/** Resolves a colour argument: a name, a Plus! palette number, or #rgb / #rrggbb. */
export function resolveColor(value: string | undefined, palette: Record<string, string> = TEXT_COLORS): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (palette[v]) return palette[v];
  if (TEXT_COLORS[v]) return TEXT_COLORS[v];
  if (/^\d{1,2}$/.test(v)) return PLUS_PALETTE[Number(v)] ?? null;
  if (/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return null;
}

export function resolveFont(value: string | undefined): TextFont | null {
  if (!value) return null;
  const v = value.toLowerCase().replace(/[^a-z]/g, "");
  return (
    TEXT_FONTS.find((f) => f.id === v || f.name.toLowerCase().replace(/[^a-z]/g, "") === v) ?? null
  );
}

export interface StyledTag {
  /** Canonical tag: b i u s c a f size, or an effect id. */
  tag: string;
  /** Inline style to apply (already validated). */
  style: Record<string, string>;
  /** Extra classes (effects). */
  className: string;
}

/**
 * Turns a matched tag into validated styling, or null when the argument is
 * junk (the caller then leaves the text exactly as typed).
 */
export function describeTag(rawTag: string, arg?: string, endArg?: string): StyledTag | null {
  const tag = TAG_ALIASES[rawTag.toLowerCase()];
  if (!tag) return null;
  switch (tag) {
    case "b":
    case "i":
    case "u":
    case "s":
      return { tag, style: {}, className: "" };
    case "c": {
      const from = resolveColor(arg);
      if (!from) return null;
      const to = resolveColor(endArg);
      if (to) {
        return {
          tag,
          style: { backgroundImage: `linear-gradient(90deg, ${from}, ${to})` },
          className: "fx-gradient",
        };
      }
      return { tag, style: { color: from }, className: "fx-color" };
    }
    case "a": {
      const color = resolveColor(arg ?? "yellow", HIGHLIGHT_COLORS);
      if (!color) return null;
      return { tag, style: { backgroundColor: color }, className: "fx-highlight" };
    }
    case "f": {
      const font = resolveFont(arg);
      if (!font) return null;
      return { tag, style: { fontFamily: font.stack }, className: "fx-font" };
    }
    case "size": {
      const size = arg ? TEXT_SIZES[arg.toLowerCase()] : undefined;
      if (!size) return null;
      return { tag, style: { fontSize: size }, className: "fx-size" };
    }
    default:
      if (EFFECT_IDS.has(tag)) return { tag, style: {}, className: `fx fx-${tag}` };
      return null;
  }
}

/** The message with every valid tag removed, for previews and notifications. */
export function stripTextStyle(text: string): string {
  let out = text;
  // Tags nest, so peel until nothing changes (bounded, in case of weird input).
  for (let pass = 0; pass < 8; pass += 1) {
    const next = out.replace(TAG_PATTERN, (whole, tag: string, arg?: string, body?: string, end?: string) =>
      describeTag(tag, arg, end) ? (body ?? "") : whole,
    );
    if (next === out) break;
    out = next;
  }
  // "-# small print" lines keep their words; personal emoticons their shortcut.
  return out.replace(/^-#\s+/gm, "").replace(/\[emo:[A-Za-z0-9._-]{1,160}\|([^\]\s|]{1,12})\]/g, "$1");
}

/** A whole-message style (the MSN "Font" dialog), applied to everything you send. */
export interface MessageFont {
  font?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  size?: string;
}

export function isDefaultFont(font: MessageFont | null | undefined): boolean {
  return (
    !font ||
    (!font.font && !font.color && !font.bold && !font.italic && !font.underline && !font.strike && !font.size)
  );
}

/** Wraps text in the tags for a message font; unknown values are dropped. */
export function applyMessageFont(text: string, font: MessageFont | null | undefined): string {
  if (!font || isDefaultFont(font) || !text.trim()) return text;
  let open = "";
  let close = "";
  const wrap = (tag: string, arg?: string) => {
    open += arg ? `[${tag}=${arg}]` : `[${tag}]`;
    close = `[/${tag}]` + close;
  };
  if (font.font && resolveFont(font.font)) wrap("f", font.font);
  if (font.color && resolveColor(font.color)) wrap("c", font.color);
  if (font.size && TEXT_SIZES[font.size]) wrap("size", font.size);
  if (font.bold) wrap("b");
  if (font.italic) wrap("i");
  if (font.underline) wrap("u");
  if (font.strike) wrap("s");
  // Code blocks can't carry inline tags; keep the fences outside the wrapping.
  if (text.includes("```")) return text;
  return `${open}${text}${close}`;
}

const FONT_KEY = "huddle-message-font";

export function readMessageFont(): MessageFont | null {
  try {
    const raw = window.localStorage.getItem(FONT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MessageFont;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMessageFont(font: MessageFont | null): void {
  try {
    if (!font || isDefaultFont(font)) window.localStorage.removeItem(FONT_KEY);
    else window.localStorage.setItem(FONT_KEY, JSON.stringify(font));
  } catch {
    // Storage blocked: the font still applies until reload.
  }
}
