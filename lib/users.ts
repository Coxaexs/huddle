/** Shapes and constants shared by the browser and the worker. */

export interface SpotifyActivity {
  song: string;
  artist: string;
  albumArt?: string;
  isPlaying?: boolean;
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

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string;
  pronouns?: string;
  prideBadges?: PrideBadgeId[];
  spotifyActivity?: SpotifyActivity | null;
  color: string;
  isAdmin: boolean;
}

export interface Member {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string;
  pronouns?: string;
  prideBadges?: PrideBadgeId[];
  spotifyActivity?: SpotifyActivity | null;
  color: string;
  lastSeenAt: string;
  createdAt?: string;
  isAdmin?: boolean;
  /** Presence the member chose: online | idle | dnd | invisible. */
  status?: PresenceStatus;
  customStatus?: string | null;
  /** Role ids this member holds, keyed by server id. */
  roleIds?: Record<string, string[]>;
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
