"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientEvent, VoiceParticipant } from "@/lib/protocol";
import {
  FLOOR_SEAT, TV_POSE, TV_SPOT, clampPose, defaultPoses, freeSeat, hearFrom, isLoungeEmote, seatById,
  type HeardFrom, type LoungePose,
} from "../lib/living-room";

/** use-hub re-dispatches lounge traffic as this window event. */
export const LOUNGE_EVENT = "huddle-lounge";

export type RoomTheme = "cozy" | "vampire" | "matrix" | "cyberpunk";

export function roomThemeFor(customThemeId: string | undefined): RoomTheme {
  if (customThemeId === "vampire" || customThemeId === "matrix" || customThemeId === "cyberpunk") return customThemeId;
  return "cozy";
}

/** The room dresses (and sounds) for the app's current theme, and follows it when it changes. */
export function useRoomTheme(): RoomTheme {
  const [theme, setTheme] = useState<RoomTheme>("cozy");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(roomThemeFor(root.dataset.customThemeId));
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-custom-theme-id"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/** Per-browser Living Room preferences. */
export interface LoungeSettings {
  /** Voices come from where people are. Off: everyone plays flat, like a normal call. */
  spatial: boolean;
  /** The music bot plays from the TV instead of everywhere. */
  tvMusic: boolean;
  /** The room's own sounds: fire, rain, wind, city. */
  ambience: boolean;
  /** 0..1 */
  ambienceVolume: number;
}

const SETTINGS_KEY = "huddle-living-room-settings";
const DEFAULT_SETTINGS: LoungeSettings = { spatial: true, tvMusic: true, ambience: true, ambienceVolume: 0.5 };

function readSettings(): LoungeSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Partial<LoungeSettings>;
    return {
      spatial: typeof raw.spatial === "boolean" ? raw.spatial : DEFAULT_SETTINGS.spatial,
      tvMusic: typeof raw.tvMusic === "boolean" ? raw.tvMusic : DEFAULT_SETTINGS.tvMusic,
      ambience: typeof raw.ambience === "boolean" ? raw.ambience : DEFAULT_SETTINGS.ambience,
      ambienceVolume: typeof raw.ambienceVolume === "number" && Number.isFinite(raw.ambienceVolume)
        ? Math.max(0, Math.min(1, raw.ambienceVolume)) : DEFAULT_SETTINGS.ambienceVolume,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface LoungeEmote { id: number; connectionId: string; emoji: string; at: number }

export interface LivingRoom {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Everyone in the call, placed: explicit spots first, the rest seated automatically. */
  poses: Map<string, LoungePose>;
  self: LoungePose | null;
  emotes: LoungeEmote[];
  move: (pose: LoungePose) => void;
  sit: (seatId: string) => void;
  /** Sit (or stand back up) right where you are. */
  toggleFloor: () => void;
  emote: (emoji: string) => void;
  /** How the listener hears a connection, or null when the room is closed or spatial voices are off. */
  heard: Map<string, HeardFrom> | null;
  /** Where the music bot is heard from (the TV), or null. */
  tv: HeardFrom | null;
  /** The room is open but its spatial voices are switched off: play the call flat. */
  spatialOff: boolean;
  theme: RoomTheme;
  settings: LoungeSettings;
  setSettings: (patch: Partial<LoungeSettings>) => void;
}

const OPEN_KEY = "huddle-living-room";
/** Walking streams poses; the wire gets at most this many a second. */
const SEND_EVERY_MS = 90;

export function useLivingRoom({ roomId, connectionId, participants, send }: {
  roomId: string | null;
  connectionId: string | null;
  participants: VoiceParticipant[];
  send: (event: ClientEvent) => boolean;
}): LivingRoom {
  const [open, setOpenState] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
  });
  const [explicit, setExplicit] = useState<Map<string, LoungePose>>(new Map());
  const theme = useRoomTheme();
  const [settings, setSettingsState] = useState<LoungeSettings>(DEFAULT_SETTINGS);
  useEffect(() => { setSettingsState(readSettings()); }, []);
  const setSettings = useCallback((patch: Partial<LoungeSettings>) => {
    setSettingsState((current) => {
      const next = { ...current, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* Session only. */ }
      return next;
    });
  }, []);
  const [emotes, setEmotes] = useState<LoungeEmote[]>([]);
  const sendRef = useRef(send);
  sendRef.current = send;
  const pending = useRef<LoungePose | null>(null);
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emoteId = useRef(0);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* Session only. */ }
  }, []);

  // A new room starts empty; the hub answers lounge-sync with who is where.
  useEffect(() => {
    setExplicit(new Map());
    setEmotes([]);
    if (roomId) sendRef.current({ t: "lounge-sync" });
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const onEvent = (raw: Event) => {
      const detail = (raw as CustomEvent).detail as
        | { t: "lounge"; channelId: string; connectionId: string; pose: unknown; emote?: string }
        | { t: "lounge-state"; channelId: string; poses: Array<{ connectionId: string; pose: unknown }> };
      if (!detail || detail.channelId !== roomId) return;
      if (detail.t === "lounge-state") {
        const next = new Map<string, LoungePose>();
        for (const entry of detail.poses) {
          const pose = clampPose(entry.pose);
          if (pose && entry.connectionId !== connectionId) next.set(entry.connectionId, pose);
        }
        // Keep our own spot: the hub may answer before our first pose landed.
        setExplicit((current) => {
          const mine = connectionId ? current.get(connectionId) : undefined;
          if (mine && connectionId) next.set(connectionId, mine);
          return next;
        });
        return;
      }
      if (detail.connectionId === connectionId) return;
      const pose = clampPose(detail.pose);
      setExplicit((current) => {
        const next = new Map(current);
        if (pose) next.set(detail.connectionId, pose); else next.delete(detail.connectionId);
        return next;
      });
      if (isLoungeEmote(detail.emote)) {
        const id = ++emoteId.current;
        setEmotes((list) => [...list.slice(-20), { id, connectionId: detail.connectionId, emoji: detail.emote!, at: Date.now() }]);
      }
    };
    window.addEventListener(LOUNGE_EVENT, onEvent);
    return () => window.removeEventListener(LOUNGE_EVENT, onEvent);
  }, [roomId, connectionId]);

  // Emotes float away after a few seconds.
  useEffect(() => {
    if (!emotes.length) return;
    const handle = setTimeout(() => setEmotes((list) => list.filter((e) => Date.now() - e.at < 3200)), 800);
    return () => clearTimeout(handle);
  }, [emotes]);

  const ids = useMemo(
    () => [...participants].filter((p) => !p.bot && !p.recorder)
      .sort((a, b) => a.joinedAt - b.joinedAt || a.connectionId.localeCompare(b.connectionId))
      .map((p) => p.connectionId),
    [participants],
  );

  // Two people can claim one seat in the same moment; the earlier joiner keeps it
  // and everyone else's view seats the later one elsewhere, the same way everywhere.
  const contested = useMemo(() => {
    const holder = new Map<string, string>();
    const bumped = new Set<string>();
    for (const id of ids) {
      const seat = explicit.get(id)?.seat;
      if (!seat || seat === FLOOR_SEAT) continue;
      if (holder.has(seat)) bumped.add(id); else holder.set(seat, id);
    }
    return bumped;
  }, [explicit, ids]);

  const poses = useMemo(() => {
    const present = new Map([...explicit].filter(([id]) => ids.includes(id) && !contested.has(id)));
    return defaultPoses(ids, present);
  }, [explicit, ids, contested]);

  const flush = useCallback(() => {
    timer.current = null;
    const pose = pending.current;
    if (!pose) return;
    pending.current = null;
    lastSent.current = Date.now();
    sendRef.current({ t: "lounge", x: pose.x, z: pose.z, facing: pose.facing, seat: pose.seat });
  }, []);

  const move = useCallback((pose: LoungePose) => {
    if (!connectionId) return;
    setExplicit((current) => new Map(current).set(connectionId, pose));
    pending.current = pose;
    const wait = SEND_EVERY_MS - (Date.now() - lastSent.current);
    if (wait <= 0) flush();
    else if (!timer.current) timer.current = setTimeout(flush, wait);
  }, [connectionId, flush]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sit = useCallback((seatId: string) => {
    const seat = seatById(seatId);
    if (!seat || !connectionId) return;
    const takenBy = [...poses].find(([id, pose]) => pose.seat === seatId && id !== connectionId);
    if (takenBy) return;
    move({ x: seat.x, z: seat.z, facing: seat.facing, seat: seat.id });
  }, [connectionId, poses, move]);

  const toggleFloor = useCallback(() => {
    const pose = connectionId ? poses.get(connectionId) : null;
    if (!pose) return;
    if (pose.seat === FLOOR_SEAT) move({ ...pose, seat: null });
    else if (!pose.seat) move({ ...pose, seat: FLOOR_SEAT });
  }, [connectionId, poses, move]);

  const emote = useCallback((emoji: string) => {
    if (!connectionId || !isLoungeEmote(emoji)) return;
    const pose = poses.get(connectionId);
    if (!pose) return;
    const id = ++emoteId.current;
    setEmotes((list) => [...list.slice(-20), { id, connectionId, emoji, at: Date.now() }]);
    sendRef.current({ t: "lounge", x: pose.x, z: pose.z, facing: pose.facing, seat: pose.seat, emote: emoji });
  }, [connectionId, poses]);

  // Lost a seat race: take the spot everyone now shows us in.
  useEffect(() => {
    if (!connectionId || !contested.has(connectionId)) return;
    const placed = poses.get(connectionId);
    if (placed) move(placed);
  }, [connectionId, contested, poses, move]);

  // Walking in: claim a spot so everyone agrees where you are.
  const self = connectionId ? poses.get(connectionId) ?? null : null;
  const claimed = connectionId ? explicit.has(connectionId) : false;
  useEffect(() => {
    if (!open || !roomId || !connectionId || claimed) return;
    const others = [...explicit].filter(([id]) => id !== connectionId).map(([, pose]) => pose);
    const seat = freeSeat(others);
    move(seat ? { x: seat.x, z: seat.z, facing: seat.facing, seat: seat.id } : self ?? { x: 0, z: 1.8, facing: 0, seat: null });
  }, [open, roomId, connectionId, claimed, explicit, move, self]);

  const live = open && Boolean(roomId);
  const heard = useMemo(() => {
    if (!live || !settings.spatial || !self || !connectionId) return null;
    const map = new Map<string, HeardFrom>();
    for (const [id, pose] of poses) if (id !== connectionId) map.set(id, hearFrom(self, pose));
    return map;
  }, [live, settings.spatial, self, poses, connectionId]);
  const tv = useMemo(
    () => (live && settings.tvMusic && self ? hearFrom(self, TV_POSE, TV_SPOT.height) : null),
    [live, settings.tvMusic, self],
  );

  return {
    open: live, setOpen, poses, self, emotes, move, sit, toggleFloor, emote, heard, tv,
    spatialOff: live && !settings.spatial, theme, settings, setSettings,
  };
}
