/** Shapes and constants shared by the browser and the worker. */

export interface SpotifyActivity {
  song: string;
  artist: string;
  albumArt?: string;
  isPlaying?: boolean;
  /** Link to the track, when the source knows it. */
  url?: string;
  /** ms epoch of the last time the sender confirmed this song is still on. */
  updatedAt?: number;
}

/** A song that nobody has re-confirmed for this long has stopped playing. */
export const SPOTIFY_STALE_MS = 9 * 60_000;
/** How often a live song/activity is re-confirmed; two beats can be missed. */
export const ACTIVITY_HEARTBEAT_MS = 4 * 60_000;

/** The song to show for a member, or null when it has gone stale. */
export function liveSpotify(
  activity: SpotifyActivity | null | undefined,
  now = Date.now(),
): SpotifyActivity | null {
  if (!activity || activity.isPlaying === false) return null;
  // Older rows carry no timestamp; they are shown until the owner next syncs.
  if (typeof activity.updatedAt === "number" && now - activity.updatedAt > SPOTIFY_STALE_MS) {
    return null;
  }
  return activity;
}

export type ProfileActivityKind = "playing" | "coding" | "streaming" | "app";

/** What someone is doing right now: a game, an editor, a stream. */
export interface ProfileActivity {
  kind: ProfileActivityKind;
  name: string;
  details?: string;
  /** ms epoch when this started, for the "for 2h" timer. */
  startedAt: number;
  /** ms epoch of the last confirmation; stale ones are hidden. */
  updatedAt: number;
  /** Typed in by the person instead of detected by the desktop app. */
  manual?: boolean;
}

/** Last.fm names are 2-15 letters, digits, "_" or "-", starting with a letter. */
export function normalizeLastfmUsername(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z][A-Za-z0-9_-]{1,14}$/.test(name) ? name : null;
}

export const ACTIVITY_STALE_MS = 9 * 60_000;
/** Manual statuses are not re-confirmed by a poller, so they last longer. */
export const MANUAL_ACTIVITY_STALE_MS = 12 * 60 * 60_000;

export function liveActivity(
  activity: ProfileActivity | null | undefined,
  now = Date.now(),
): ProfileActivity | null {
  if (!activity) return null;
  const limit = activity.manual ? MANUAL_ACTIVITY_STALE_MS : ACTIVITY_STALE_MS;
  return now - activity.updatedAt > limit ? null : activity;
}

const ACTIVITY_KINDS = new Set<string>(["playing", "coding", "streaming", "app"]);

/** Validates untrusted JSON (request body or stored column) into an activity. */
export function normalizeProfileActivity(value: unknown): ProfileActivity | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim().slice(0, 80) : "";
  if (!name) return null;
  const now = Date.now();
  const startedAt = Number(v.startedAt);
  const updatedAt = Number(v.updatedAt);
  const details = typeof v.details === "string" ? v.details.trim().slice(0, 120) : "";
  return {
    kind: ACTIVITY_KINDS.has(String(v.kind)) ? (v.kind as ProfileActivityKind) : "playing",
    name,
    ...(details ? { details } : {}),
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? Math.min(startedAt, now) : now,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.min(updatedAt, now) : now,
    ...(v.manual === true ? { manual: true } : {}),
  };
}

export const PRIDE_BADGES = [
  { id: "trans", label: "Transgender", shortLabel: "TRANS", colors: ["#5bcffa", "#f5abb9", "#ffffff"] },
  { id: "pride", label: "LGBTQ+ Pride", shortLabel: "PRIDE", colors: ["#e40303", "#ff8c00", "#ffed00", "#008026", "#24408e", "#732982"] },
  { id: "nonbinary", label: "Nonbinary", shortLabel: "ENBY", colors: ["#fff430", "#ffffff", "#9c59d1", "#2d2d2d"] },
  { id: "bisexual", label: "Bisexual", shortLabel: "BI", colors: ["#d60270", "#9b4f96", "#0038a8"] },
  { id: "lesbian", label: "Lesbian", shortLabel: "LESBIAN", colors: ["#d52d00", "#ff9a56", "#ffffff", "#d362a4", "#a30262"] },
  { id: "gay", label: "Gay", shortLabel: "GAY", colors: ["#078d70", "#98e8c1", "#ffffff", "#7bade2", "#3d1a78"] },
  { id: "pansexual", label: "Pansexual", shortLabel: "PAN", colors: ["#ff218c", "#ffd800", "#21b1ff"] },
  { id: "asexual", label: "Asexual", shortLabel: "ACE", colors: ["#2d2d2d", "#a3a3a3", "#ffffff", "#800080"] },
  { id: "intersex", label: "Intersex", shortLabel: "INTERSEX", colors: ["#ffd800", "#7902aa"] },
] as const;

export type PrideBadgeId = (typeof PRIDE_BADGES)[number]["id"];

const PRIDE_BADGE_IDS = new Set<string>(PRIDE_BADGES.map((badge) => badge.id));

export function normalizePrideBadges(value: unknown): PrideBadgeId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter((badge): badge is PrideBadgeId => typeof badge === "string" && PRIDE_BADGE_IDS.has(badge))
    .slice(0, 4);
}

export interface SocialLink {
  platform: string;
  url: string;
  label?: string;
}

export type AvatarFrameId = "none" | "neon" | "rainbow" | "cyber" | "gold" | "sakura" | "diamond";

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string;
  pronouns?: string;
  tagline?: string;
  customStatus?: string | null;
  prideBadges?: PrideBadgeId[];
  spotifyActivity?: SpotifyActivity | null;
  activity?: ProfileActivity | null;
  socialLinks?: SocialLink[];
  avatarFrame?: string;
  color: string;
  isAdmin: boolean;
  canInvite: boolean;
  customCss?: string | null;
  customTheme?: string | null;
  quickReactions?: string[];
  hiddenEmojis?: string[];
  /** Only on the signed-in user's own account. */
  lastfmUsername?: string | null;
  email?: string | null;
  emailPromptSkipped?: boolean;
  isDev?: boolean;
}

export interface Member {
  id: string;
  username: string;
  /** The name to show here: the per-server nickname when set, else globalName. */
  displayName: string;
  /** The account-wide display name. */
  globalName?: string;
  /** Per-server nickname, if this member set one in the current server. */
  nickname?: string | null;
  /** While set (an ISO time in the future), this member is timed out here. */
  timeoutUntil?: string | null;
  avatar: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string;
  pronouns?: string;
  tagline?: string;
  prideBadges?: PrideBadgeId[];
  spotifyActivity?: SpotifyActivity | null;
  activity?: ProfileActivity | null;
  socialLinks?: SocialLink[];
  avatarFrame?: string;
  color: string;
  customCss?: string | null;
  customTheme?: string | null;
  lastSeenAt: string;
  createdAt?: string;
  isAdmin?: boolean;
  canInvite?: boolean;
  isDev?: boolean;
  /** Presence the member chose: online | idle | dnd | invisible. */
  status?: PresenceStatus;
  customStatus?: string | null;
  /** Role ids this member holds, keyed by server id. */
  roleIds?: Record<string, string[]>;
  /** Invite details through which this member joined the server, if any. */
  joinedVia?: {
    code: string;
    createdById?: string | null;
    creatorName?: string | null;
    creatorUsername?: string | null;
  } | null;
  joinedAt?: string | null;
}

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible";

/** Label + dot colour for each presence status. */
export const PRESENCE: Record<
  PresenceStatus,
  { label: string; color: string }
> = {
  online: { label: "Online", color: "#3ba55d" },
  idle: { label: "Idle", color: "#faa81a" },
  dnd: { label: "Do not disturb", color: "#ed4245" },
  invisible: { label: "Invisible", color: "#80848e" },
};

/** Colors new accounts cycle through, matching the existing palette. */
export const AVATAR_COLORS = [
  "#ffd67c",
  "#f4a7b9",
  "#8dd7d0",
  "#b8a6ff",
  "#9ad6a0",
  "#f2a37c",
  "#8fb8f0",
  "#e6a8e0",
];

/**
 * The status someone else may see. "invisible" is reported as the default
 * status, so an invisible member looks exactly like one whose socket is closed.
 */
export function statusSeenBy(
  status: string | null | undefined,
  isSelf: boolean,
): PresenceStatus {
  const known = status === "online" || status === "idle" || status === "dnd" || status === "invisible";
  if (!known) return "online";
  if (status === "invisible" && !isSelf) return "online";
  return status;
}

/** Social links keep only http(s) targets (a bare domain gets https:// added). */
export function normalizeSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  const links: SocialLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { platform, url, label } = item as Record<string, unknown>;
    if (typeof platform !== "string" || typeof url !== "string") continue;
    let href = url.trim().slice(0, 300);
    if (!/^https?:\/\//i.test(href)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
      href = `https://${href}`;
    }
    try {
      const parsed = new URL(href);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
    } catch {
      continue;
    }
    links.push({
      platform: platform.trim().slice(0, 30),
      url: href,
      ...(typeof label === "string" && label.trim() ? { label: label.trim().slice(0, 50) } : {}),
    });
    if (links.length === 10) break;
  }
  return links;
}

const UPLOAD_PATH = /^\/(hangout\/)?api\/uploads\/[A-Za-z0-9%._~-]+$/;
const PROXY_PATH = /^\/hangout\/api\/unfurl\/image\?url=[A-Za-z0-9%._~+-]+&sig=[0-9a-f]{32}$/;
const GRADIENT =
  /^(linear|radial)-gradient\(\s*(\d{1,3}deg\s*,\s*)?#[0-9a-fA-F]{3,8}(\s*,\s*#[0-9a-fA-F]{3,8}){1,5}\s*\)$/;

/**
 * Whether a stored avatar/banner/album-art value is safe to show other people:
 * a local upload, an image routed through Huddle's own proxy, or (banners
 * only) a plain colour gradient. Anything else could load from an outside
 * server and hand it every viewer's IP address.
 */
export function isSafeProfileImage(value: string | null | undefined, allowGradient = false): boolean {
  if (!value) return false;
  if (UPLOAD_PATH.test(value) || PROXY_PATH.test(value)) return true;
  return allowGradient && GRADIENT.test(value);
}

/** CSS `background` for a profile banner: an image, a preset gradient, or the fallback. */
export function bannerBackground(bannerUrl: string | null | undefined, fallback: string): string {
  if (!bannerUrl) return fallback;
  if (GRADIENT.test(bannerUrl)) return bannerUrl;
  return `url("${bannerUrl.replace(/["\\\n]/g, "")}") center/cover no-repeat`;
}

/** "Last seen 5m ago" style text for an offline member, or null when unknown. */
export function lastSeenLabel(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Last seen ${days}d ago`;
  return `Last seen ${new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

const ACTIVITY_VERB: Record<ProfileActivityKind, string> = {
  playing: "Playing",
  coding: "Coding in",
  streaming: "Streaming with",
  app: "Using",
};

/** "Playing Minecraft", "Coding in Visual Studio Code". */
export function activityLabel(activity: ProfileActivity): string {
  return `${ACTIVITY_VERB[activity.kind]} ${activity.name}`;
}

/** "for 2h 5m", or "" under a minute. */
export function activityElapsed(activity: ProfileActivity, now = Date.now()): string {
  const minutes = Math.floor((now - activity.startedAt) / 60_000);
  if (minutes < 1) return "";
  if (minutes < 60) return `for ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `for ${hours}h ${minutes % 60}m`;
}

/** One line for the member list: the game you are in, else the song you are on. */
export function memberActivityLine(member: Pick<Member, "activity" | "spotifyActivity">): string {
  const activity = liveActivity(member.activity);
  if (activity) return activityLabel(activity);
  const song = liveSpotify(member.spotifyActivity);
  return song ? `🎵 ${song.song} · ${song.artist}` : "";
}
