/**
 * Huddle Theme System & Custom Styling Engine
 * Provides custom CSS management, theme creation, switching, serialization, and sharing.
 */

export interface ThemeColors {
  ink?: string;
  muted?: string;
  line?: string;
  paper?: string;
  panel?: string;
  chatBg?: string;
  lavender?: string; // Primary accent
  lavenderSoft?: string;
  lavenderMuted?: string;
  coral?: string;
  mint?: string;
}

export interface ThemeAuthor {
  id?: string;
  displayName: string;
  username: string;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  baseTheme: "cozy" | "legacy" | "light";
  colors: ThemeColors;
  corners?: number;
  backdrop?: "plain" | "aurora" | "dots" | "grid" | "stars";
  customCss?: string;
  author?: ThemeAuthor;
  isBuiltin?: boolean;
  isPublic?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: "cozy",
    name: "Cozy",
    description: "The default violet-tinted slate dark theme with cozy rounded cards.",
    baseTheme: "cozy",
    isBuiltin: true,
    corners: 16,
    backdrop: "plain",
    colors: {
      ink: "#e8e3f5",
      muted: "#9d95bc",
      line: "rgba(255, 255, 255, 0.07)",
      paper: "#16131f",
      panel: "#1a1628",
      chatBg: "#1e1a2e",
      lavender: "#a78bfa",
      lavenderSoft: "#2e2750",
      lavenderMuted: "#3d2f6b",
      coral: "#f59e6e",
      mint: "#4ade80",
    },
  },
  {
    id: "legacy",
    name: "Legacy",
    description: "Classic deep charcoal dark theme.",
    baseTheme: "legacy",
    isBuiltin: true,
    corners: 8,
    backdrop: "plain",
    colors: {
      ink: "#f2f3f5",
      muted: "#949ba4",
      line: "rgba(255, 255, 255, 0.08)",
      paper: "#1e1f22",
      panel: "#2b2d31",
      chatBg: "#313338",
      lavender: "#5865f2",
      lavenderSoft: "#3c4270",
      lavenderMuted: "#4752c4",
      coral: "#f23f43",
      mint: "#23a55a",
    },
  },
  {
    id: "light",
    name: "Light",
    description: "Clean, high-contrast light theme with crisp typography.",
    baseTheme: "light",
    isBuiltin: true,
    corners: 12,
    backdrop: "plain",
    colors: {
      ink: "#111217",
      muted: "#5c6370",
      line: "#e3e5e8",
      paper: "#ffffff",
      panel: "#f2f3f5",
      chatBg: "#ffffff",
      lavender: "#6b4feb",
      lavenderSoft: "#f0edff",
      lavenderMuted: "#d9d2fc",
      coral: "#ef4444",
      mint: "#22c55e",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    description: "High-octane neon nightscape featuring vivid cyan and hot magenta glows.",
    baseTheme: "cozy",
    isBuiltin: true,
    corners: 10,
    backdrop: "grid",
    colors: {
      ink: "#e0f7ff",
      muted: "#7aa4bf",
      line: "rgba(0, 242, 254, 0.2)",
      paper: "#090a14",
      panel: "#0f1224",
      chatBg: "#13172e",
      lavender: "#00f2fe",
      lavenderSoft: "rgba(0, 242, 254, 0.15)",
      lavenderMuted: "#ff007f",
      coral: "#ff3366",
      mint: "#00ffa3",
    },
    customCss: `/* Cyberpunk UI accents */
.rail { border-right: 1px solid rgba(0, 242, 254, 0.18); }
.active-space { box-shadow: 0 0 12px rgba(0, 242, 254, 0.6); }
.composer { border: 1px solid rgba(0, 242, 254, 0.25); box-shadow: 0 0 15px rgba(0, 242, 254, 0.08); }
.brand-mark { text-shadow: 0 0 8px #00f2fe; }`,
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Pure true pitch-black with deep sapphire and violet accents for OLED screens.",
    baseTheme: "legacy",
    isBuiltin: true,
    corners: 6,
    backdrop: "plain",
    colors: {
      ink: "#f1f5f9",
      muted: "#64748b",
      line: "rgba(255, 255, 255, 0.06)",
      paper: "#000000",
      panel: "#09090b",
      chatBg: "#0c0a09",
      lavender: "#3b82f6",
      lavenderSoft: "#1e293b",
      lavenderMuted: "#1d4ed8",
      coral: "#ef4444",
      mint: "#10b981",
    },
    customCss: `/* OLED contrast polish */
.chat-panel { background: #000000; }
.sidebar { background: #09090b; }
.rail { background: #040406; }`,
  },
  {
    id: "forest",
    name: "Forest",
    description: "Calm and grounded organic deep woodland greens with warm golden highlights.",
    baseTheme: "cozy",
    isBuiltin: true,
    corners: 18,
    backdrop: "plain",
    colors: {
      ink: "#e2f0d9",
      muted: "#8ca893",
      line: "rgba(74, 222, 128, 0.12)",
      paper: "#0d1811",
      panel: "#132319",
      chatBg: "#172b1f",
      lavender: "#4ade80",
      lavenderSoft: "#1d3826",
      lavenderMuted: "#2d5a3e",
      coral: "#f59e0b",
      mint: "#34d399",
    },
    customCss: `/* Forest accents */
.channel.selected, .voice-room.selected { background: rgba(74, 222, 128, 0.16); }`,
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm twilight aesthetic blending dusk indigo with radiant coral and gold.",
    baseTheme: "cozy",
    isBuiltin: true,
    corners: 20,
    backdrop: "aurora",
    colors: {
      ink: "#fff1f2",
      muted: "#b090a2",
      line: "rgba(244, 63, 94, 0.14)",
      paper: "#1a101b",
      panel: "#221424",
      chatBg: "#28172b",
      lavender: "#f43f5e",
      lavenderSoft: "#3e1c31",
      lavenderMuted: "#72264a",
      coral: "#fb923c",
      mint: "#34d399",
    },
    customCss: `/* Sunset warm touches */
.brand-mark { color: #f43f5e; }
.active-space { border-color: #f43f5e; }`,
  },
  {
    id: "catppuccin",
    name: "Mocha",
    description: "Soothing, harmonious pastel palette designed for all-day focus.",
    baseTheme: "cozy",
    isBuiltin: true,
    corners: 16,
    backdrop: "plain",
    colors: {
      ink: "#cdd6f4",
      muted: "#a6adc8",
      line: "rgba(203, 166, 247, 0.12)",
      paper: "#181825",
      panel: "#1e1e2e",
      chatBg: "#1e1e2e",
      lavender: "#cba6f7",
      lavenderSoft: "#313244",
      lavenderMuted: "#45475a",
      coral: "#f38ba8",
      mint: "#a6e3a1",
    },
    customCss: `/* Catppuccin soft rounded scrollbars */
::-webkit-scrollbar-thumb { background: #45475a; border-radius: 999px; }`,
  },
];

const THEME_CODE_PREFIX = "huddle-theme:v1:";
const STORAGE_CUSTOM_THEMES = "huddle-custom-themes";
const STORAGE_ACTIVE_THEME = "huddle-active-theme-id";

/**
 * Encodes a theme into a shareable string code.
 */
export function exportThemeCode(theme: Theme): string {
  const exportData = {
    id: theme.id,
    name: theme.name,
    description: theme.description || "",
    baseTheme: theme.baseTheme,
    colors: theme.colors,
    corners: theme.corners ?? 16,
    backdrop: theme.backdrop ?? "plain",
    customCss: theme.customCss || "",
    author: theme.author,
  };
  try {
    const jsonStr = JSON.stringify(exportData);
    const base64 = typeof window !== "undefined"
      ? window.btoa(unescape(encodeURIComponent(jsonStr)))
      : Buffer.from(jsonStr).toString("base64");
    return `${THEME_CODE_PREFIX}${base64}`;
  } catch {
    return JSON.stringify(exportData, null, 2);
  }
}

/**
 * Decodes and validates a shared theme string (supports huddle-theme:v1:... or raw JSON).
 */
export function importThemeCode(raw: string): Theme | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();

  try {
    let jsonStr = "";
    if (trimmed.startsWith(THEME_CODE_PREFIX)) {
      const base64Part = trimmed.slice(THEME_CODE_PREFIX.length).trim();
      jsonStr = typeof window !== "undefined"
        ? decodeURIComponent(escape(window.atob(base64Part)))
        : Buffer.from(base64Part, "base64").toString("utf-8");
    } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      jsonStr = trimmed;
    } else {
      // Try raw base64
      try {
        jsonStr = typeof window !== "undefined"
          ? decodeURIComponent(escape(window.atob(trimmed)))
          : Buffer.from(trimmed, "base64").toString("utf-8");
      } catch {
        return null;
      }
    }

    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== "object" || !data.name) return null;

    const baseTheme = ["cozy", "legacy", "light"].includes(data.baseTheme)
      ? data.baseTheme
      : "cozy";

    const colors: ThemeColors = {};
    if (data.colors && typeof data.colors === "object") {
      const allowedKeys: (keyof ThemeColors)[] = [
        "ink", "muted", "line", "paper", "panel", "chatBg",
        "lavender", "lavenderSoft", "lavenderMuted", "coral", "mint",
      ];
      for (const k of allowedKeys) {
        if (typeof data.colors[k] === "string") {
          colors[k] = data.colors[k];
        }
      }
    }

    return {
      id: typeof data.id === "string" && data.id ? data.id : `theme_${Date.now()}`,
      name: String(data.name).slice(0, 60),
      description: data.description ? String(data.description).slice(0, 240) : "",
      baseTheme,
      colors,
      corners: typeof data.corners === "number" ? Math.min(28, Math.max(4, data.corners)) : 16,
      backdrop: ["plain", "aurora", "dots", "grid", "stars"].includes(data.backdrop) ? data.backdrop : "plain",
      customCss: typeof data.customCss === "string" ? data.customCss.slice(0, 30000) : "",
      author: data.author && typeof data.author === "object" ? {
        displayName: String(data.author.displayName || "User"),
        username: String(data.author.username || "user"),
      } : undefined,
    };
  } catch (err) {
    console.error("Failed to parse theme code:", err);
    return null;
  }
}

/**
 * Retrieves saved custom themes from localStorage.
 */
export function getStoredThemes(): Theme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_CUSTOM_THEMES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves a theme to localStorage.
 */
export function saveCustomTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  const current = getStoredThemes().filter((t) => t.id !== theme.id);
  current.unshift({ ...theme, isBuiltin: false, updatedAt: new Date().toISOString() });
  window.localStorage.setItem(STORAGE_CUSTOM_THEMES, JSON.stringify(current));
}

/**
 * Deletes a custom theme from localStorage.
 */
export function deleteCustomTheme(themeId: string): void {
  if (typeof window === "undefined") return;
  const current = getStoredThemes().filter((t) => t.id !== themeId);
  window.localStorage.setItem(STORAGE_CUSTOM_THEMES, JSON.stringify(current));
}

/**
 * Gets the active theme ID from storage.
 */
export function getActiveThemeId(): string {
  if (typeof window === "undefined") return "cozy";
  return window.localStorage.getItem(STORAGE_ACTIVE_THEME) || window.localStorage.getItem("huddle-theme") || "cozy";
}

/**
 * Applies a theme to document.documentElement and injects its custom CSS.
 */
export function applyThemeToDocument(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Base dataset theme (controls fundamental structural stylesheets)
  root.dataset.theme = theme.baseTheme;
  root.dataset.customThemeId = theme.id;
  if (theme.backdrop) {
    root.dataset.backdrop = theme.backdrop;
  }

  // CSS variables
  const { colors, corners } = theme;
  if (colors.ink) root.style.setProperty("--ink", colors.ink);
  if (colors.muted) root.style.setProperty("--muted", colors.muted);
  if (colors.line) root.style.setProperty("--line", colors.line);
  if (colors.paper) root.style.setProperty("--paper", colors.paper);
  if (colors.panel) root.style.setProperty("--panel", colors.panel);
  if (colors.chatBg) root.style.setProperty("--chat-bg", colors.chatBg);
  if (colors.lavender) {
    root.style.setProperty("--lavender", colors.lavender);
    window.localStorage.setItem("huddle-accent", colors.lavender);
  }
  if (colors.lavenderSoft) root.style.setProperty("--lavender-soft", colors.lavenderSoft);
  if (colors.lavenderMuted) root.style.setProperty("--lavender-muted", colors.lavenderMuted);
  if (colors.coral) root.style.setProperty("--coral", colors.coral);
  if (colors.mint) root.style.setProperty("--mint", colors.mint);

  if (typeof corners === "number") {
    root.style.setProperty("--ui-corners", `${corners}px`);
    window.localStorage.setItem("huddle-corners", String(corners));
  }

  // Inject or update Theme Custom CSS
  let styleEl = document.getElementById("huddle-custom-theme-css") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "huddle-custom-theme-css";
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = theme.customCss || "";

  // Persist preferences
  window.localStorage.setItem("huddle-theme", theme.baseTheme);
  window.localStorage.setItem(STORAGE_ACTIVE_THEME, theme.id);
}

/**
 * Storage keys for personal/client-side UI CSS
 */
export const STORAGE_CLIENT_UI_CSS = "huddle_client_ui_css";
export const STORAGE_CLIENT_UI_CSS_ENABLED = "huddle_client_ui_css_enabled";

/**
 * Gets personal client-side custom UI CSS.
 */
export function getClientUiCss(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_CLIENT_UI_CSS) || "";
}

/**
 * Checks if personal client-side custom UI CSS is enabled.
 */
export function isClientUiCssEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_CLIENT_UI_CSS_ENABLED) !== "false";
}

/**
 * Saves and applies personal client-side custom UI CSS.
 */
export function setClientUiCss(css: string, enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_CLIENT_UI_CSS, css);
  window.localStorage.setItem(STORAGE_CLIENT_UI_CSS_ENABLED, enabled ? "true" : "false");
  applyClientUiCss();
}

/**
 * Injects client-side custom UI CSS into the page head.
 */
export function applyClientUiCss(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const css = getClientUiCss();
  const enabled = isClientUiCssEnabled();

  let styleEl = document.getElementById("huddle-custom-client-ui-css") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "huddle-custom-client-ui-css";
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = enabled && css ? css : "";
}

/**
 * Finds a theme by ID among built-ins and custom stored themes.
 */
export function findThemeById(themeId: string): Theme | undefined {
  const builtin = BUILTIN_THEMES.find((t) => t.id === themeId);
  if (builtin) return builtin;
  const custom = getStoredThemes().find((t) => t.id === themeId);
  return custom;
}
/** At-rules profile CSS may use; everything else (@import, @font-face, …) is refused. */
const PROFILE_CSS_AT_RULES = new Set([
  "media",
  "supports",
  "container",
  "keyframes",
  "-webkit-keyframes",
]);

/** Functions that can fetch a resource without going through url(). */
const PROFILE_CSS_BLOCKED_FUNCTIONS = new Set([
  "image-set",
  "-webkit-image-set",
  "src",
  "expression",
  "element",
  "-moz-element",
]);

/**
 * url() targets profile CSS may load: same-origin paths and inline images.
 * Anything else would let a profile ping an outside server with each viewer's IP.
 */
function isSafeProfileCssUrl(target: string): boolean {
  const url = target.trim();
  if (/^data:image\/(png|gif|jpeg|webp|avif|svg\+xml)[;,]/i.test(url)) return true;
  return url.startsWith("/") && !url.startsWith("//") && !/[\s\\]/.test(url);
}

/** Decodes CSS escapes inside a quoted string so url("h\74tp:…") cannot slip past. */
function decodeCssString(value: string): string {
  return value.replace(/\\([0-9a-fA-F]{1,6}\s?|[\s\S])/g, (_match, escape: string) => {
    const hex = escape.trim();
    if (/^[0-9a-fA-F]+$/.test(hex)) {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    }
    return escape === "\n" ? "" : escape;
  });
}

function isIdentChar(char: string | undefined): boolean {
  return char !== undefined && /[a-zA-Z0-9_-]/.test(char);
}

export type ProfileCssCheck =
  | { ok: true; css: string }
  | { ok: false; error: string };

/**
 * Validates user profile CSS. It must be self-contained: balanced braces, no
 * escapes outside strings, no `</` (which would end the <style> element), only
 * a few at-rules, and no loading of outside resources. Comments are dropped.
 *
 * The scoper wraps this CSS in a block, so an unbalanced `}` would otherwise
 * escape the profile card and restyle the whole app for whoever opens it.
 */
export function checkProfileCss(raw: string): ProfileCssCheck {
  if (typeof raw !== "string") return { ok: false, error: "Profile CSS must be text." };

  let out = "";
  let depth = 0;
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === "/" && next === "*") {
      const end = raw.indexOf("*/", i + 2);
      if (end === -1) return { ok: false, error: "A comment is never closed." };
      i = end + 2;
      out += " ";
      continue;
    }

    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < raw.length && raw[j] !== char) {
        if (raw[j] === "\\") j += 1;
        else if (raw[j] === "\n") return { ok: false, error: "A quoted string runs past the end of its line." };
        j += 1;
      }
      if (j >= raw.length) return { ok: false, error: "A quoted string is never closed." };
      const literal = raw.slice(i, j + 1);
      if (/<\//.test(literal) || /<\//.test(decodeCssString(literal))) {
        return { ok: false, error: "Profile CSS cannot contain \"</\"." };
      }
      out += literal;
      i = j + 1;
      continue;
    }

    if (char === "\\") {
      return { ok: false, error: "Backslash escapes are only allowed inside quoted strings." };
    }
    if (char === "<" && (next === "/" || next === "!")) {
      return { ok: false, error: "Profile CSS cannot contain HTML tags." };
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth < 0) return { ok: false, error: "There is a \"}\" without a matching \"{\"." };
    }

    if (char === "@") {
      let j = i + 1;
      while (isIdentChar(raw[j])) j += 1;
      const name = raw.slice(i + 1, j).toLowerCase();
      if (!PROFILE_CSS_AT_RULES.has(name)) {
        return { ok: false, error: `@${name || "…"} is not allowed in profile CSS.` };
      }
      out += raw.slice(i, j);
      i = j;
      continue;
    }

    if (isIdentChar(char) && !isIdentChar(raw[i - 1])) {
      let j = i;
      while (isIdentChar(raw[j])) j += 1;
      const name = raw.slice(i, j).toLowerCase();
      if (raw[j] === "(") {
        if (PROFILE_CSS_BLOCKED_FUNCTIONS.has(name)) {
          return { ok: false, error: `${name}() is not allowed in profile CSS.` };
        }
        if (name === "url") {
          const close = findUrlEnd(raw, j + 1);
          if (close === -1) return { ok: false, error: "A url( is never closed." };
          let target = raw.slice(j + 1, close).trim();
          if (target.startsWith('"') || target.startsWith("'")) {
            target = decodeCssString(target.slice(1, -1));
          } else if (/[{}<"']/.test(target)) {
            // Braces here would desync the block splitter from the browser's parser.
            return { ok: false, error: "Put quotes around url() values that contain special characters." };
          }
          if (!isSafeProfileCssUrl(target)) {
            return {
              ok: false,
              error: "url() can only point at files uploaded here or inline data: images.",
            };
          }
          out += raw.slice(i, close + 1);
          i = close + 1;
          continue;
        }
      }
      out += raw.slice(i, j);
      i = j;
      continue;
    }

    out += char;
    i += 1;
  }

  if (depth !== 0) return { ok: false, error: "There is a \"{\" without a matching \"}\"." };
  return { ok: true, css: out.trim() };
}

/** Index of the ")" closing a url( whose argument starts at `start`, skipping quotes. */
function findUrlEnd(css: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < css.length; i++) {
    const char = css[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ")") {
      return i;
    }
  }
  return -1;
}

interface CssBlock {
  prelude: string;
  body: string;
}

/** Splits already-validated CSS into its top-level `prelude { body }` blocks. */
function splitCssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let quote: string | null = null;
  let preludeStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ";" && depth === 0) preludeStart = i + 1;
    else if (char === "{") {
      if (depth === 0) bodyStart = i + 1;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push({
          prelude: css.slice(preludeStart, bodyStart - 1).trim(),
          body: css.slice(bodyStart, i),
        });
        preludeStart = i + 1;
      }
    }
  }
  return blocks;
}

/** Splits a selector list on commas that are not inside (), [] or quotes. */
function splitSelectorList(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const char = prelude[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function prefixSelector(selector: string, scope: string): string {
  const root = /^(:root|:scope|&|\.profile-card)(?![a-zA-Z0-9_-])/.exec(selector);
  if (root) return `${scope}${selector.slice(root[0].length)}`;
  return `${scope} ${selector}`;
}

/** Rewrites every selector to live under `scope`; used where @scope is unsupported. */
function prefixCssBlocks(css: string, scope: string): string {
  return splitCssBlocks(css)
    .map(({ prelude, body }) => {
      if (prelude.startsWith("@")) {
        const name = /^@([a-zA-Z-]+)/.exec(prelude)?.[1].toLowerCase() || "";
        if (name.endsWith("keyframes")) return `${prelude}{${body}}`;
        return `${prelude}{${prefixCssBlocks(body, scope)}}`;
      }
      const selectors = splitSelectorList(prelude);
      if (selectors.length === 0) return "";
      return `${selectors.map((selector) => prefixSelector(selector, scope)).join(", ")}{${body}}`;
    })
    .join("\n");
}

/**
 * Scopes user-written profile CSS so it only targets their specific profile card.
 * CSS that fails {@link checkProfileCss} renders nothing at all.
 */
export function scopeProfileCss(rawCss: string, userId: string): string {
  if (!rawCss || typeof rawCss !== "string") return "";
  const checked = checkProfileCss(rawCss);
  if (!checked.ok || !checked.css) return "";

  const scopeClass = `.user-profile-scoped-${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const prefixed = prefixCssBlocks(checked.css, scopeClass);
  // @scope gives exact encapsulation; the prefixed copy covers webviews without it.
  return `@scope (${scopeClass}) {
${checked.css}
}
${prefixed}
`;
}

/**
 * Quick preset CSS snippets for Profile Customization (Discord & Tumblr-Grade).
 */
export const PROFILE_CSS_PRESETS = [
  {
    name: "Rainbow Ring",
    desc: "Spinning animated rainbow conic ring around avatar with holographic banner",
    css: `@keyframes spin-rainbow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.profile-card {
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(88, 101, 242, 0.3);
}
.profile-card-avatar-wrap {
  position: relative;
}
.profile-card-avatar-wrap::before {
  content: "";
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: conic-gradient(#ff0055, #ff9900, #ffee00, #00ff66, #00eeff, #7700ff, #ff0055);
  animation: spin-rainbow 4s linear infinite;
  z-index: 0;
  box-shadow: 0 0 14px rgba(255, 0, 128, 0.6);
}
.profile-card-avatar-wrap .avatar,
.profile-card-avatar-wrap .profile-card-avatar {
  position: relative;
  z-index: 1;
  border: 3px solid #111217 !important;
}
.profile-banner {
  background: linear-gradient(135deg, #090919 0%, #301766 50%, #00d2ff 100%) !important;
}
.profile-display-name {
  background: linear-gradient(90deg, #ff71ce, #01cdfe, #05ffa1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 800 !important;
  text-shadow: 0 0 20px rgba(1, 205, 254, 0.4);
}`,
  },
  {
    name: "Glitter Stars",
    desc: "Starfield background, cursive title, glowing drop-shadows and quote vibe",
    css: `@keyframes star-pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.02); }
}
.profile-card {
  background: #0d0b18 radial-gradient(circle at 50% 20%, #2a1b4e 0%, #0d0b18 70%) !important;
  border: 1.5px dashed #c084fc;
  box-shadow: 0 0 30px rgba(192, 132, 252, 0.35);
  animation: star-pulse 6s ease-in-out infinite;
}
.profile-banner {
  background: repeating-linear-gradient(45deg, #2e1065, #2e1065 10px, #3b0764 10px, #3b0764 20px) !important;
  border-bottom: 2px solid #e879f9;
}
.profile-display-name {
  font-family: "Brush Script MT", cursive, Georgia, serif;
  font-size: 26px !important;
  color: #fbcfe8 !important;
  text-shadow: 0 0 10px #f472b6, 0 0 20px #c084fc;
}
.profile-status-bubble {
  background: #231238 !important;
  border: 1px solid #d946ef !important;
  box-shadow: 0 0 12px rgba(217, 70, 239, 0.4);
}
.profile-bio {
  font-style: italic;
  color: #e9d5ff !important;
  border-left: 3px solid #c084fc;
  padding-left: 12px;
}`,
  },
  {
    name: "Cozy Cloud",
    desc: "Warm pastel gradients, bubbly clouds, floating status speech bubble",
    css: `.profile-card {
  background: linear-gradient(180deg, #242220 0%, #1a1817 100%) !important;
  border: 1px solid #d4a373;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(212, 163, 115, 0.25);
  border-radius: 24px !important;
}
.profile-banner {
  background: linear-gradient(120deg, #ccd5ae 0%, #e9edc9 40%, #faedcd 70%, #d4a373 100%) !important;
}
.profile-display-name {
  color: #faedcd !important;
  font-weight: 800 !important;
}
.profile-status-bubble {
  background: #2b2826 !important;
  border: 1px solid #d4a373 !important;
  color: #fefae0 !important;
  border-radius: 16px !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.profile-bio {
  background: rgba(254, 250, 224, 0.05);
  border-radius: 12px;
  padding: 10px;
  color: #e9edc9 !important;
}`,
  },
  {
    name: "Cyberpunk",
    desc: "Electric cyan & neon magenta HUD scanlines with glowing borders",
    css: `.profile-card {
  background: rgba(7, 10, 19, 0.95) !important;
  border: 1.5px solid #00f2fe;
  box-shadow: 0 0 25px rgba(0, 242, 254, 0.35), inset 0 0 15px rgba(255, 0, 128, 0.2);
  font-family: ui-monospace, monospace;
}
.profile-banner {
  background: linear-gradient(135deg, #050510 0%, #ff007f 60%, #00f2fe 100%) !important;
}
.profile-display-name {
  color: #00f2fe !important;
  text-shadow: 0 0 8px #00f2fe, 0 0 18px #ff007f;
}
.profile-role-badge {
  border-color: #00f2fe !important;
  box-shadow: 0 0 8px rgba(0, 242, 254, 0.4);
}`,
  },
  {
    name: "Midnight Velvet",
    desc: "Deep obsidian velvet, blood-rose accents and regal framing",
    css: `.profile-card {
  background: #0a0a0c !important;
  border: 1.5px solid #881337;
  box-shadow: 0 0 30px rgba(136, 19, 55, 0.45), inset 0 0 20px #000;
}
.profile-banner {
  background: radial-gradient(circle, #4c0519 0%, #0a0a0c 80%) !important;
  border-bottom: 1px solid #be123c;
}
.profile-display-name {
  color: #fecdd3 !important;
  font-family: Georgia, serif;
  text-shadow: 0 0 12px #e11d48;
}
.profile-status-bubble {
  background: #14050a !important;
  border: 1px solid #e11d48 !important;
  color: #fda4af !important;
}`,
  },
  {
    name: "Sakura",
    desc: "Gentle pastel pink rose gradient with soft rounded contours",
    css: `.profile-card {
  border: 1px solid #f472b6;
  box-shadow: 0 0 20px rgba(244, 114, 182, 0.35);
  background: #1f121b !important;
}
.profile-banner {
  background: linear-gradient(135deg, #fb7185, #f472b6, #fbcfe8) !important;
}
.profile-display-name {
  color: #fbcfe8 !important;
  text-shadow: 0 0 10px rgba(244, 114, 182, 0.5);
}`,
  },
  {
    name: "Matrix HUD",
    desc: "Matrix green terminal with CRT scanlines, digital stream banner, targeting reticle, and cyber telemetry",
    css: `@keyframes matrixDigitalRain {
  0% { background-position: 0 0, 0 0; }
  100% { background-position: 0 400px, 0 200px; }
}
@keyframes matrixGlowPulse {
  0%, 100% { box-shadow: 0 0 25px rgba(0, 255, 102, 0.4), inset 0 0 15px rgba(0, 255, 102, 0.15); }
  50% { box-shadow: 0 0 40px rgba(0, 255, 102, 0.65), inset 0 0 25px rgba(0, 255, 102, 0.25); }
}
@keyframes cyberGlitchText {
  0%, 100% { text-shadow: 0 0 8px #00ff66, 0 0 16px rgba(0,255,102,0.6); transform: none; }
  92% { text-shadow: -2px 0 #00ffff, 2px 0 #ff0055; transform: skewX(-2deg); }
  96% { text-shadow: 2px 0 #00ff66, -2px 0 #00ffff; transform: skewX(2deg); }
}
@keyframes targetingSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes radarPing {
  0% { transform: scale(1); opacity: 0.9; }
  100% { transform: scale(2.8); opacity: 0; }
}

.profile-card {
  position: relative !important;
  background: #020b04 radial-gradient(circle at 50% 10%, #001f0a 0%, #010803 80%) !important;
  border: 1.5px solid #00ff66 !important;
  border-radius: 6px !important;
  font-family: 'Courier New', Courier, ui-monospace, monospace !important;
  color: #00ff66 !important;
  animation: matrixGlowPulse 4s ease-in-out infinite !important;
  overflow: hidden !important;
}

.profile-card::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  background: repeating-linear-gradient(0deg, rgba(0, 20, 5, 0.25) 0px, rgba(0, 20, 5, 0.25) 1px, transparent 1px, transparent 3px) !important;
  pointer-events: none !important;
  z-index: 20 !important;
}

.profile-card::after {
  content: "" !important;
  position: absolute !important;
  inset: 3px !important;
  border: 1px dashed rgba(0, 255, 102, 0.25) !important;
  border-radius: 4px !important;
  pointer-events: none !important;
  z-index: 20 !important;
}

.profile-banner,
.profile-card-banner {
  position: relative !important;
  height: 120px !important;
  background: linear-gradient(180deg, rgba(0, 25, 8, 0.9) 0%, #020d05 100%),
              repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(0, 255, 102, 0.15) 20px) !important;
  background-size: 100% 100%, 100% 200px !important;
  animation: matrixDigitalRain 12s linear infinite !important;
  border-bottom: 2px solid #00ff66 !important;
  box-shadow: 0 4px 15px rgba(0, 255, 102, 0.3) !important;
}

.profile-banner::before,
.profile-card-banner::before {
  content: "[SYS_TERMINAL // NODE_0x7F]" !important;
  position: absolute !important;
  top: 6px !important;
  left: 10px !important;
  font-size: 9px !important;
  letter-spacing: 1.5px !important;
  color: #00ff66 !important;
  background: rgba(0, 0, 0, 0.7) !important;
  padding: 2px 6px !important;
  border: 1px solid rgba(0, 255, 102, 0.4) !important;
  border-radius: 3px !important;
  z-index: 5 !important;
}

.profile-card-avatar-wrap {
  position: relative !important;
  width: 86px !important;
  height: 86px !important;
}

.profile-card-avatar-wrap::before {
  content: "" !important;
  position: absolute !important;
  inset: -6px !important;
  border: 2px dashed #00ff66 !important;
  border-radius: 50% !important;
  animation: targetingSpin 10s linear infinite !important;
  z-index: 1 !important;
  box-shadow: 0 0 12px rgba(0, 255, 102, 0.5) !important;
}

.profile-card-avatar-wrap .avatar,
.profile-card-avatar-wrap .profile-card-avatar {
  border: 2px solid #00ff66 !important;
  box-shadow: 0 0 18px rgba(0, 255, 102, 0.6) !important;
}

.profile-presence-dot {
  background: #00ff66 !important;
  box-shadow: 0 0 10px #00ff66, 0 0 20px #00ff66 !important;
  border: 2px solid #020b04 !important;
}

.profile-status-bubble {
  background: rgba(0, 20, 6, 0.95) !important;
  border: 1.5px solid #00ff66 !important;
  border-radius: 4px !important;
  color: #00ff66 !important;
  box-shadow: 0 0 15px rgba(0, 255, 102, 0.35) !important;
  font-family: 'Courier New', Courier, monospace !important;
  font-size: 11px !important;
}

.profile-status-bubble::before {
  content: "[COMMS] > " !important;
  color: #34d399 !important;
  font-weight: bold !important;
}

.profile-status-bubble-tail {
  border-right-color: #00ff66 !important;
  border-top-color: #00ff66 !important;
}

.profile-display-name {
  color: #00ff66 !important;
  font-size: 20px !important;
  font-weight: 800 !important;
  letter-spacing: 0.8px !important;
  text-shadow: 0 0 10px #00ff66, 0 0 20px rgba(0, 255, 102, 0.6) !important;
  animation: cyberGlitchText 5s infinite !important;
}

.profile-username {
  color: #10b981 !important;
  font-size: 12px !important;
}

.profile-username::before {
  content: "usr@" !important;
  color: #059669 !important;
}

.profile-tagline {
  color: #34d399 !important;
  font-family: 'Courier New', Courier, monospace !important;
  font-size: 11px !important;
  border-left: 2px solid #00ff66 !important;
  padding-left: 6px !important;
  margin-top: 4px !important;
}

.profile-tagline::before {
  content: "// ROLE: " !important;
  color: #059669 !important;
  font-weight: bold !important;
}

.profile-pronouns-tag {
  color: #6ee7b7 !important;
  font-size: 11px !important;
  background: rgba(0, 255, 102, 0.1) !important;
  border: 1px solid rgba(0, 255, 102, 0.3) !important;
  padding: 1px 6px !important;
  border-radius: 3px !important;
}

.profile-badges-shelf {
  background: rgba(0, 20, 6, 0.7) !important;
  border: 1px solid rgba(0, 255, 102, 0.25) !important;
  border-radius: 4px !important;
  padding: 6px !important;
}

.profile-badge-item,
.badge-owner {
  background: rgba(0, 255, 102, 0.12) !important;
  border: 1px solid #00ff66 !important;
  color: #00ff66 !important;
  border-radius: 3px !important;
  font-size: 10px !important;
  text-transform: uppercase !important;
  letter-spacing: 1px !important;
  box-shadow: 0 0 8px rgba(0, 255, 102, 0.3) !important;
}

.profile-social-links {
  gap: 6px !important;
}

.profile-social-link-pill {
  background: rgba(0, 20, 6, 0.8) !important;
  border: 1px solid #00ff66 !important;
  color: #00ff66 !important;
  border-radius: 3px !important;
  font-size: 10px !important;
  letter-spacing: 0.5px !important;
  text-transform: uppercase !important;
  transition: all 0.2s ease !important;
}

.profile-social-link-pill:hover {
  background: #00ff66 !important;
  color: #020b04 !important;
  box-shadow: 0 0 14px #00ff66 !important;
  transform: translateY(-2px) !important;
}

.profile-social-link-pill svg {
  color: inherit !important;
}

.profile-bio {
  background: rgba(0, 20, 6, 0.85) !important;
  border: 1px solid rgba(0, 255, 102, 0.35) !important;
  border-radius: 4px !important;
  padding: 10px !important;
  color: #a7f3d0 !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
}

.profile-bio::before {
  content: "> LOG // " !important;
  color: #00ff66 !important;
  font-weight: bold !important;
}

.profile-card [class*="bg-green-950"] {
  background: rgba(0, 25, 8, 0.9) !important;
  border: 1.5px solid #00ff66 !important;
  box-shadow: 0 0 16px rgba(0, 255, 102, 0.3) !important;
  border-radius: 4px !important;
}

.profile-card-actions button,
.profile-action-tile {
  background: rgba(0, 20, 6, 0.85) !important;
  border: 1px solid #00ff66 !important;
  color: #00ff66 !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

.profile-card-actions button:hover,
.profile-action-tile:hover {
  background: rgba(0, 255, 102, 0.2) !important;
  box-shadow: 0 0 12px rgba(0, 255, 102, 0.5) !important;
}

.profile-card-divider {
  background: linear-gradient(90deg, transparent, #00ff66, transparent) !important;
  height: 1px !important;
}`,
  },
];

/**
 * Quick preset CSS snippets for Client-Side UI Customization (BetterDiscord / Tumblr style).
 */
export const CLIENT_UI_CSS_PRESETS = [
  {
    name: "Frosted Glass",
    desc: "Transforms panels, sidebar, and composer into modern frosted glassmorphism",
    css: `/* Frosted Glassmorphism UI */
.chat-shell, .chat-panel, .sidebar, .member-panel {
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  background-color: rgba(22, 19, 31, 0.78) !important;
}
.chat-messages {
  background-color: transparent !important;
}
.message:hover {
  background-color: rgba(255, 255, 255, 0.05) !important;
  border-radius: 8px;
}
.composer {
  backdrop-filter: blur(20px);
  background: rgba(30, 26, 46, 0.75) !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}`,
  },
  {
    name: "Retro Dashboard",
    desc: "Classic dashboard with rounded cards, vintage indigo tones and bubbly elements",
    css: `/* Retro Dashboard */
:root {
  --ui-corners: 20px !important;
}
body {
  background: #36465d !important;
}
.sidebar {
  background: #2c3848 !important;
  border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
}
.message {
  margin: 6px 16px !important;
  padding: 14px 18px !important;
  background: #242e3b !important;
  border-radius: 16px !important;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25) !important;
}
.message-author {
  font-weight: 800 !important;
  color: #a5c3eb !important;
}`,
  },
  {
    name: "Neon Matrix",
    desc: "Pure dark background with vibrant neon cyan & green borders and glowing inputs",
    css: `/* Neon Matrix */
:root {
  --lavender: #00ffcc !important;
}
.chat-shell, .chat-panel, .sidebar, .member-panel {
  background: #020408 !important;
  border-color: rgba(0, 255, 204, 0.2) !important;
}
.composer:focus-within {
  border-color: #00ffcc !important;
  box-shadow: 0 0 16px rgba(0, 255, 204, 0.35) !important;
}
.active-space {
  box-shadow: 0 0 14px #00ffcc !important;
}
.message:hover {
  background: rgba(0, 255, 204, 0.04) !important;
}`,
  },
  {
    name: "Classic Dark",
    desc: "High-contrast dark surfaces with sleek violet accents",
    css: `/* Classic Dark */
:root {
  --lavender: #5865f2 !important;
}
.sidebar {
  background: #1e1f22 !important;
}
.chat-panel {
  background: #313338 !important;
}
.member-panel {
  background: #2b2d31 !important;
}
.composer {
  background: #383a40 !important;
  border-radius: 8px !important;
}`,
  },
  {
    name: "Pitch Black",
    desc: "True #000000 black background for maximum contrast and battery saving",
    css: `/* Pitch Black */
body, .chat-shell, .chat-panel, .sidebar, .member-panel, .space-rail {
  background: #000000 !important;
}
.message:hover {
  background: #0a0a0a !important;
}
.composer {
  background: #0d0d0d !important;
  border: 1px solid #222222 !important;
}`,
  },
  {
    name: "Pastel Dream",
    desc: "Soft blush pinks, pastel lavender accents and rounded pill badges",
    css: `/* Pastel Dream */
:root {
  --lavender: #f472b6 !important;
  --coral: #fb7185 !important;
  --ui-corners: 22px !important;
}
.sidebar {
  background: #1a121e !important;
}
.chat-panel {
  background: #160e19 !important;
}
.message:hover {
  background: rgba(244, 114, 182, 0.06) !important;
  border-radius: 16px !important;
}`,
  },
];

/**
 * Backwards compatibility alias for theme CSS presets
 */
export const THEME_CSS_PRESETS = CLIENT_UI_CSS_PRESETS;
