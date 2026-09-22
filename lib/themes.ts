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

/**
 * Scopes user-written profile CSS so it only targets their specific profile card.
 * Strips dangerous content and prefixes selectors with `.user-profile-scoped-${userId}`.
 */
export function scopeProfileCss(rawCss: string, userId: string): string {
  if (!rawCss || typeof rawCss !== "string") return "";

  const scopeClass = `.user-profile-scoped-${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  // Clean CSS of dangerous HTML script closing tags
  const sanitized = rawCss
    .replace(/<\/style/gi, "")
    .replace(/<script/gi, "")
    .replace(/url\(\s*['"]?javascript:/gi, "url(");

  // Modern browser @scope rule provides native encapsulation
  return `
    @scope (${scopeClass}) {
      ${sanitized}
    }
    /* Fallback selector mapping for universal compatibility */
    ${scopeClass} {
      ${sanitized.replace(/([^{}]+)\{/g, (match, selector) => {
        // If it's a keyframe rule or media query, don't prefix
        if (selector.trim().startsWith("@")) return match;
        return selector
          .split(",")
          .map((s: string) => {
            const trimmed = s.trim();
            if (trimmed === ":root" || trimmed === "&" || trimmed === ".profile-card") {
              return scopeClass;
            }
            return `${scopeClass} ${trimmed}`;
          })
          .join(", ") + " {";
      })}
    }
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
