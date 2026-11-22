/**
 * The desktop app's game overlay (desktop/src/overlay.js), as the web side
 * sees it. The main window describes the call and the channel list through
 * `window.huddle.overlay`; the overlay page (/overlay) gets them through
 * `window.hoffleOverlay` and sends its button presses back the same way.
 */

export interface OverlayPerson {
  connectionId: string;
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  muted: boolean;
  deafened: boolean;
}

export interface OverlayVoice {
  channelId: string;
  channelName: string;
  /** The server the room is in, or null for a DM call. */
  serverName: string | null;
  muted: boolean;
  deafened: boolean;
  people: OverlayPerson[];
  /** Connection ids talking right now (your own seat included). */
  speaking: string[];
  selfConnectionId: string | null;
}

export interface OverlayChannel {
  id: string;
  name: string;
  kind: "text" | "voice";
  category: string | null;
  unread: boolean;
  mentions: number;
}

export interface OverlayServer {
  id: string;
  name: string;
  icon: string;
  iconUrl: string | null;
  color: string;
  channels: OverlayChannel[];
  unread: boolean;
  mentions: number;
}

export interface OverlayDm {
  channelId: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  unread: boolean;
  mentions: number;
}

export interface OverlayShell {
  servers: OverlayServer[];
  dms: OverlayDm[];
  /** Who sits in each voice room, by channel id. */
  rooms: Record<string, OverlayPerson[]>;
  /** What the main window has open, so the overlay starts there. */
  activeServerId: string | null;
  activeChannelId: string | null;
}

export interface OverlayState {
  open: boolean;
  game: string | null;
  /** The shortcut as this keyboard shows it ("Alt + `", "⌥`"), or "" when none works. */
  shortcut: string;
  platform: string;
  /** Where the call list sits; missing from desktop apps before 2.3.1. */
  corner?: OverlayCorner;
}

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface OverlayToast {
  kind: "message" | "hint";
  title: string;
  body: string;
  at: number;
}

/** A hub message event, passed on unchanged. */
export interface OverlayMessageEvent {
  t: "message" | "message-edited" | "message-deleted";
  channelId: string;
  message?: unknown;
  id?: string;
  content?: string;
  editedAt?: string;
}

export type OverlayAction =
  | { type: "close" | "mute" | "deafen" | "leave" | "settings" }
  | { type: "join"; channelId: string }
  /** Brings the main window forward, on this channel when there is one. */
  | { type: "open-main"; channelId?: string };

export interface OverlaySettings {
  enabled: boolean;
  /** Settings' combo format ("Alt+Backquote"), see app/lib/hotkeys.ts. */
  combo: string;
  defaultCombo: string;
  shortcut: string;
  /** False when another app already holds the shortcut. */
  hotkeyOk: boolean;
  game: string | null;
  /** Both missing from desktop apps before 2.3.1, which cannot change them. */
  showWhilePlaying?: boolean;
  corner?: OverlayCorner;
}

export type OverlaySettingsPatch = {
  enabled?: boolean;
  combo?: string;
  accelerator?: string;
  showWhilePlaying?: boolean;
  corner?: OverlayCorner;
};

/** `window.huddle.overlay`, in the main window of the desktop app. */
export interface MainOverlayBridge {
  settings: () => Promise<OverlaySettings | null>;
  setSettings: (patch: OverlaySettingsPatch) => Promise<OverlaySettings | null>;
  want: () => Promise<{ voice: boolean; shell: boolean } | null>;
  onWant: (callback: (want: { voice: boolean; shell: boolean }) => void) => () => void;
  publishVoice: (voice: OverlayVoice | null) => void;
  publishShell: (shell: OverlayShell) => void;
  publishMessage: (event: OverlayMessageEvent) => void;
  onAction: (callback: (action: OverlayAction) => void) => () => void;
}

/** `window.hoffleOverlay`, in the overlay window. */
export interface OverlayPageBridge {
  hello: () => Promise<{ state: OverlayState; voice: OverlayVoice | null; shell: OverlayShell | null } | null>;
  onState: (callback: (state: OverlayState) => void) => () => void;
  onVoice: (callback: (voice: OverlayVoice | null) => void) => () => void;
  onShell: (callback: (shell: OverlayShell | null) => void) => () => void;
  onToast: (callback: (toast: OverlayToast) => void) => () => void;
  onMessage: (callback: (event: OverlayMessageEvent) => void) => () => void;
  action: (action: OverlayAction) => void;
}

/** The main window's overlay bridge, or null outside the desktop app (or an older one). */
export function mainOverlayBridge(): MainOverlayBridge | null {
  if (typeof window === "undefined") return null;
  const shell = (window as unknown as { huddle?: { overlay?: MainOverlayBridge } }).huddle;
  return shell?.overlay ?? null;
}

export function overlayPageBridge(): OverlayPageBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { hoffleOverlay?: OverlayPageBridge }).hoffleOverlay ?? null;
}

type Relay = (event: OverlayMessageEvent) => void;
let relay: Relay | null = null;

/** The main window's bridge sets this while the overlay is open (see use-hub.ts). */
export function setOverlayRelay(next: Relay | null) {
  relay = next;
}

/** Passes a message event from the hub on to the open overlay, if there is one. */
export function relayToOverlay(event: OverlayMessageEvent) {
  relay?.(event);
}
