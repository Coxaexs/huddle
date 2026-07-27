/** Shapes and constants shared by the browser and the worker. */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  /** Uploaded profile picture; the letter tile is the fallback. */
  avatarUrl?: string | null;
  color: string;
  isAdmin: boolean;
}

export interface Member {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  avatarUrl?: string | null;
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
