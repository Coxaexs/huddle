/** Shapes and constants shared by the browser and the worker. */

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  color: string;
  isAdmin: boolean;
}

export interface Member {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  color: string;
  lastSeenAt: string;
}

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
