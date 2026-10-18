/**
 * Feature flags for Huddle.
 *
 * Flags live in the Worker environment (wrangler.jsonc `vars` or platform
 * secrets), so a feature can be switched off per host without deleting code.
 * Everything is enabled by default when the flag is missing.
 */

export interface FeatureFlags {
  /** The consent-gated D&D session recorder (director UI, /record, portal). */
  recordSessions: boolean;
  /** Side features switched off on this host (FEATURES_DISABLED). */
  disabled: SideFeature[];
}

export function featureFlags(env: {
  FEATURE_RECORD_SESSIONS?: string;
  FEATURES_DISABLED?: string;
}): FeatureFlags {
  return {
    disabled: disabledFeatures(env),
    recordSessions:
      env.FEATURE_RECORD_SESSIONS == null ||
      !["0", "false", "off", "no"].includes(
        env.FEATURE_RECORD_SESSIONS.trim().toLowerCase(),
      ),
  };
}

/**
 * Side features: everything under app/api/(features)/. Core chat (auth,
 * servers, channels, messages, DMs, voice, uploads, realtime) is not listed
 * and can never be switched off. Each id is the route folder it owns, so a new
 * folder in app/api/(features)/ needs an entry here (a test checks this).
 */
export const SIDE_FEATURES = {
  activities: "Watch-together activities",
  ai: "/ask AI answers",
  battlemap: "Battlemaps",
  digest: "Weekly digest",
  emoticons: "Custom emoticons",
  events: "Server events",
  "game-servers": "Game server status and RCON",
  games: "Chat games",
  gifs: "GIF search",
  guestbook: "Landing page guestbook",
  integrations: "Music bot, D&D and Spotify integrations",
  media: "Living Room covers",
  msn: "MSN mode",
  music: "Music commands",
  polls: "Polls",
  qa: "Q&A",
  recap: "Server recaps",
  recordings: "Session recordings",
  reminders: "Reminders",
  saved: "Saved messages",
  scheduled: "Scheduled messages",
  sounds: "Soundboard",
  stt: "Speech-to-text captions (Duyu)",
  themes: "Community themes",
  tts: "Text-to-speech",
  unfurl: "Link previews",
  watch: "Jellyfin watch-party streaming",
  webhooks: "Incoming webhooks",
  youtube: "YouTube",
} as const;

export type SideFeature = keyof typeof SIDE_FEATURES;

/**
 * FEATURES_DISABLED is a comma-separated list of side feature ids, e.g.
 * "games,battlemap". Unknown ids are ignored, so a typo can never switch off
 * core chat.
 */
export function disabledFeatures(env: { FEATURES_DISABLED?: string }): SideFeature[] {
  return (env.FEATURES_DISABLED || "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id): id is SideFeature => Object.hasOwn(SIDE_FEATURES, id));
}

/**
 * The switched-off side feature an API path belongs to, if any. `apiPath` is
 * the path after the base path, e.g. "/api/games" or "/api/integrations/dnd".
 */
export function disabledFeatureFor(
  apiPath: string,
  disabled: readonly SideFeature[],
): SideFeature | null {
  const match = /^\/api\/([^/?#]+)/.exec(apiPath);
  if (!match) return null;
  const id = match[1].toLowerCase();
  return disabled.find((feature) => feature === id) ?? null;
}

const RUNTIME_KEY = "features_disabled";
/** How long one worker trusts its copy of the runtime switches. */
const RUNTIME_TTL_MS = 15_000;
let runtimeCache: { at: number; ids: SideFeature[] } | null = null;

function parseRuntime(raw: string | null | undefined): SideFeature[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? disabledFeatures({ FEATURES_DISABLED: parsed.join(",") }) : [];
  } catch {
    return [];
  }
}

/** Side features switched off from /admin, stored in the meta table. */
export async function runtimeDisabledFeatures(db: D1Database | undefined): Promise<SideFeature[]> {
  if (!db) return [];
  if (runtimeCache && Date.now() - runtimeCache.at < RUNTIME_TTL_MS) return runtimeCache.ids;
  let ids: SideFeature[] = [];
  try {
    const row = await db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .bind(RUNTIME_KEY)
      .first<{ value: string }>();
    ids = parseRuntime(row?.value);
  } catch {
    // Before the schema exists (first boot) nothing is switched off.
  }
  runtimeCache = { at: Date.now(), ids };
  return ids;
}

export async function setRuntimeDisabledFeatures(db: D1Database, ids: string[]): Promise<SideFeature[]> {
  const clean = disabledFeatures({ FEATURES_DISABLED: ids.join(",") });
  await db
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
    .bind(RUNTIME_KEY, JSON.stringify(clean))
    .run();
  runtimeCache = { at: Date.now(), ids: clean };
  return clean;
}

/** Config (FEATURES_DISABLED) plus runtime switches, without duplicates. */
export async function allDisabledFeatures(env: {
  FEATURES_DISABLED?: string;
  DB?: D1Database;
}): Promise<SideFeature[]> {
  return [...new Set([...disabledFeatures(env), ...(await runtimeDisabledFeatures(env.DB))])];
}

/** Tests only: forget the cached runtime switches. */
export function resetFeatureCache() {
  runtimeCache = null;
}

/**
 * Optional feature modules that can be toggled on/off per server (by server
 * managers) or per user (in personal settings) for a "simple by default,
 * deep when you want it" experience.
 */
export const FEATURE_MODULES = {
  dnd: {
    label: "D&D & Tabletop",
    description: "Character sheets, battlemaps, initiative tracker, /srd & /lookup commands",
  },
  games: {
    label: "Mini-Games",
    description: "Chess, Checkers, Connect 4, Wordle, Poker, Uno & Trivia in chat",
  },
  music: {
    label: "Music & Jam Synth",
    description: "Shared music player, Jam synth keyboard, and /music commands",
  },
  living_room: {
    label: "3D Living Room & Cinema",
    description: "3D spatial lounge, meadow fishing, and cinema room in voice calls",
  },
  cosmetics: {
    label: "Profile Cosmetics & FX",
    description: "Animated profile effects, avatar decorations, frames, and nameplates",
  },
} as const;

export type FeatureModuleKey = keyof typeof FEATURE_MODULES;

export const FEATURE_MODULE_KEYS = Object.keys(FEATURE_MODULES) as FeatureModuleKey[];

export function normalizeDisabledModules(raw: unknown): FeatureModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is FeatureModuleKey =>
    typeof item === "string" && (FEATURE_MODULE_KEYS as readonly string[]).includes(item),
  );
}
