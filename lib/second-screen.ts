/**
 * Shared types, defaults, and sanitization helpers for Hoffle's universal
 * 2nd Screen (/hangout/screen).
 *
 * Anyone signed in to Hoffle can project their active screenshare, live chat,
 * battlemap, D&D 2nd Display, or D&D Companion onto another monitor, tablet,
 * or TV—single pane or split layout—synced across their own tabs and paired
 * companion devices.
 */

export type SecondScreenPane =
  | "screenshare"
  | "chat"
  | "battlemap"
  | "dnd-display"
  | "dnd-companion";

export type SecondScreenLayout = "single" | "split-h" | "split-v";

export type DndCompanionRoute =
  | "sheet"
  | "map"
  | "world"
  | "compendium"
  | "bard";

export interface SecondScreenState {
  layout: SecondScreenLayout;
  primary: SecondScreenPane;
  secondary: SecondScreenPane;
  channelId: string | null;
  voiceChannelId: string | null;
  serverId: string | null;
  dndRoute: DndCompanionRoute;
  followActive: boolean;
  updatedAt: number;
}

export const SECOND_SCREEN_PAIR_TTL_MS = 24 * 60 * 60 * 1000;
export const SECOND_SCREEN_PREFIX = "screen_";

const VALID_PANES = new Set<SecondScreenPane>([
  "screenshare",
  "chat",
  "battlemap",
  "dnd-display",
  "dnd-companion",
]);

const VALID_LAYOUTS = new Set<SecondScreenLayout>([
  "single",
  "split-h",
  "split-v",
]);

const VALID_DND_ROUTES = new Set<DndCompanionRoute>([
  "sheet",
  "map",
  "world",
  "compendium",
  "bard",
]);

export const DEFAULT_SECOND_SCREEN_STATE: SecondScreenState = {
  layout: "single",
  primary: "screenshare",
  secondary: "chat",
  channelId: null,
  voiceChannelId: null,
  serverId: null,
  dndRoute: "sheet",
  followActive: true,
  updatedAt: 0,
};

function sanitizeId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 64);
  return /^[A-Za-z0-9_.:-]+$/.test(trimmed) ? trimmed : null;
}

export function sanitizeSecondScreenPatch(
  raw: unknown,
): Partial<SecondScreenState> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const patch: Partial<SecondScreenState> = {};

  if (typeof input.layout === "string" && VALID_LAYOUTS.has(input.layout as SecondScreenLayout)) {
    patch.layout = input.layout as SecondScreenLayout;
  }
  if (typeof input.primary === "string" && VALID_PANES.has(input.primary as SecondScreenPane)) {
    patch.primary = input.primary as SecondScreenPane;
  }
  if (typeof input.secondary === "string" && VALID_PANES.has(input.secondary as SecondScreenPane)) {
    patch.secondary = input.secondary as SecondScreenPane;
  }
  if ("channelId" in input) {
    patch.channelId = sanitizeId(input.channelId);
  }
  if ("voiceChannelId" in input) {
    patch.voiceChannelId = sanitizeId(input.voiceChannelId);
  }
  if ("serverId" in input) {
    patch.serverId = sanitizeId(input.serverId);
  }
  if (
    typeof input.dndRoute === "string" &&
    VALID_DND_ROUTES.has(input.dndRoute as DndCompanionRoute)
  ) {
    patch.dndRoute = input.dndRoute as DndCompanionRoute;
  }
  if (typeof input.followActive === "boolean") {
    patch.followActive = input.followActive;
  }

  return patch;
}

export function mergeSecondScreenState(
  prev: SecondScreenState | null | undefined,
  rawPatch: unknown,
  now = Date.now(),
): SecondScreenState {
  const base: SecondScreenState = {
    ...DEFAULT_SECOND_SCREEN_STATE,
    ...(prev || {}),
  };
  const patch = sanitizeSecondScreenPatch(rawPatch);
  return {
    ...base,
    ...patch,
    updatedAt: now,
  };
}

export function isSecondScreenConnectionId(
  connectionId: string | null | undefined,
): boolean {
  return Boolean(connectionId && connectionId.startsWith(SECOND_SCREEN_PREFIX));
}
