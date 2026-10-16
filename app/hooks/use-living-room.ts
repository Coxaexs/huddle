"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientEvent, VoiceParticipant } from "@/lib/protocol";
import type { GameMaster, HiddenRoll, LoungeFx, LoungeSwitches, SpellFxEvent, HouseLights, Initiative, TableCard, TableCharacter, TableArea, TableGrid, TableMap, TablePawn, WatchQueue, WatchState } from "@/lib/lounge-shared";
import {
  FLOOR_SEAT, clampPose, defaultPoses, freeSeat, hearFrom, isLoungeEmote, isVenueId, seatById, tvPoseFor, venueById,
  type HeardFrom, type LoungePose, type Venue, type VenueId,
} from "../lib/living-room";

/** use-hub re-dispatches lounge traffic as this window event. */
export const LOUNGE_EVENT = "huddle-lounge";

export type RoomTheme = "cozy" | "vampire" | "matrix" | "cyberpunk" | "academia" | "minecraft" | "y2k";

export function roomThemeFor(customThemeId: string | undefined): RoomTheme {
  if (customThemeId === "vampire" || customThemeId === "matrix" || customThemeId === "cyberpunk" || customThemeId === "minecraft") return customThemeId;
  if (customThemeId === "dark-academia") return "academia";
  // The old-PC themes share a turn-of-the-millennium bedroom.
  if (customThemeId?.startsWith("msn") || customThemeId === "teamspeak" || customThemeId === "winamp") return "y2k";
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
  /**
   * Voices come from where people are. Off: everyone plays flat, like a normal
   * call. This is the answer for the room you are in: the cinema keeps its own,
   * and starts off, since a film wants everyone at one volume.
   */
  spatial: boolean;
  /** The music bot plays from the TV instead of everywhere. */
  tvMusic: boolean;
  /** The room's own sounds: fire, rain, wind, city. */
  ambience: boolean;
  /** 0..1 */
  ambienceVolume: number;
  /** Room echo / reverb send level: 0 (dry) to 1. */
  echo: number;
  /** How finished the picture is: auto steps down when frames come late, and back up when there is room. */
  graphics: LoungeGraphics;
}

export type LoungeGraphics = "auto" | "high" | "medium" | "low";
const GRAPHICS: LoungeGraphics[] = ["auto", "high", "medium", "low"];

const SETTINGS_KEY = "huddle-living-room-settings";
const DEFAULT_SETTINGS: LoungeSettings = { spatial: true, tvMusic: true, ambience: true, ambienceVolume: 0.5, echo: 0.5, graphics: "auto" };
/** What is stored: one spatial choice for the lounge and tabletop, and the cinema's own (off). */
interface StoredSettings extends LoungeSettings { spatialCinema: boolean }

function readStored(): StoredSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") as Partial<StoredSettings>;
    return {
      spatialCinema: typeof raw.spatialCinema === "boolean" ? raw.spatialCinema : false,
      spatial: typeof raw.spatial === "boolean" ? raw.spatial : DEFAULT_SETTINGS.spatial,
      tvMusic: typeof raw.tvMusic === "boolean" ? raw.tvMusic : DEFAULT_SETTINGS.tvMusic,
      ambience: typeof raw.ambience === "boolean" ? raw.ambience : DEFAULT_SETTINGS.ambience,
      ambienceVolume: typeof raw.ambienceVolume === "number" && Number.isFinite(raw.ambienceVolume)
        ? Math.max(0, Math.min(1, raw.ambienceVolume)) : DEFAULT_SETTINGS.ambienceVolume,
      echo: typeof raw.echo === "number" && Number.isFinite(raw.echo)
        ? Math.max(0, Math.min(1, raw.echo)) : DEFAULT_SETTINGS.echo,
      graphics: GRAPHICS.includes(raw.graphics as LoungeGraphics) ? (raw.graphics as LoungeGraphics) : DEFAULT_SETTINGS.graphics,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, spatialCinema: false };
  }
}

export interface LoungeEmote { id: number; connectionId: string; emoji: string; at: number }

/** What the whole call shares in its living room, kept by the hub. */
export interface LoungeShared {
  watch: WatchState | null;
  /** The watch party's queue and skip votes; null: nothing queued. */
  queue: WatchQueue | null;
  initiative: Initiative | null;
  gm: GameMaster | null;
  card: TableCard | null;
  /** By user id. */
  characters: Record<string, TableCharacter>;
  /** The cinema's house lights, as set from the projection booth; null: automatic. */
  house: HouseLights | null;
  /** The tabletop's uploaded battle map; null: the drawn one. */
  tablemap: TableMap | null;
  /** The miniatures stood on the tabletop's map, by pawn id. */
  pawns: Record<string, TablePawn>;
  /** Spell areas standing on the map, by id. */
  areas: Record<string, TableArea>;
  /** The map's scale; null: DEFAULT_SQUARES. */
  grid: TableGrid | null;
  /** The living room's lamps, fire and curtains; null: all on, curtains open. */
  lounge: LoungeSwitches | null;
}
const NO_SHARED: LoungeShared = { watch: null, queue: null, initiative: null, gm: null, card: null, characters: {}, house: null, tablemap: null, pawns: {}, areas: {}, grid: null, lounge: null };

export type LoungeSharedKey = "watch" | "queue" | "initiative" | "gm" | "card" | "character" | "hiddenroll" | "house" | "tablemap" | "pawn" | "area" | "grid" | "spellfx" | "lounge" | "loungefx";

export interface LivingRoom {
  open: boolean;
  shared: LoungeShared;
  /** Put up (or, with null, clear) a piece of the room's shared state for everyone. */
  setShared: (key: LoungeSharedKey, value: unknown) => void;
  /** The latest roll made behind the game master's screen: the dice, never the faces. */
  hiddenRoll: (HiddenRoll & { id: number }) | null;
  /** The latest spell someone else cast at the table, to animate. */
  spellFx: (SpellFxEvent & { id: number }) | null;
  /** The latest thing someone else touched in the living room (the cat, the guitar), to play. */
  loungeFx: (LoungeFx & { id: number }) | null;
  /** Which room this tab is hanging out in. */
  venue: VenueId;
  setVenue: (venue: VenueId) => void;
  setOpen: (open: boolean) => void;
  /** Everyone in the call, placed: explicit spots first, the rest seated automatically. */
  poses: Map<string, LoungePose>;
  self: LoungePose | null;
  emotes: LoungeEmote[];
  move: (pose: LoungePose) => void;
  /**
   * Sit down there. The game master's chair makes you the game master if
   * nobody in the call is; while someone else is, it answers why not.
   */
  sit: (seatId: string) => string | null;
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
  // Everyone's last pose with the room it was in; only those in our room count.
  const [everyone, setEveryone] = useState<Map<string, { pose: LoungePose; venue: VenueId }>>(new Map());
  // The room is the call's, chosen once for everyone: the hub keeps it and tells the room.
  const [venueId, setVenueState] = useState<VenueId>("lounge");
  const venue: Venue = venueById(venueId);
  const setVenue = useCallback((next: VenueId) => {
    setVenueState(next);
    sendRef.current({ t: "lounge-venue", venue: next });
  }, []);
  const explicit = useMemo(() => {
    const here = new Map<string, LoungePose>();
    for (const [id, entry] of everyone) if (entry.venue === venueId) here.set(id, entry.pose);
    return here;
  }, [everyone, venueId]);
  const theme = useRoomTheme();
  const [stored, setStored] = useState<StoredSettings>({ ...DEFAULT_SETTINGS, spatialCinema: false });
  useEffect(() => { setStored(readStored()); }, []);
  const settings = useMemo<LoungeSettings>(
    () => ({ ...stored, spatial: venueId === "cinema" ? stored.spatialCinema : stored.spatial }),
    [stored, venueId],
  );
  const setSettings = useCallback((patch: Partial<LoungeSettings>) => {
    setStored((current) => {
      const { spatial, ...rest } = patch;
      const next: StoredSettings = { ...current, ...rest };
      if (spatial !== undefined) {
        if (venueId === "cinema") next.spatialCinema = spatial; else next.spatial = spatial;
      }
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* Session only. */ }
      return next;
    });
  }, [venueId]);
  const [emotes, setEmotes] = useState<LoungeEmote[]>([]);
  const [shared, setSharedState] = useState<LoungeShared>(NO_SHARED);
  const [hiddenRoll, setHiddenRoll] = useState<(HiddenRoll & { id: number }) | null>(null);
  const [spellFx, setSpellFx] = useState<(SpellFxEvent & { id: number }) | null>(null);
  const [loungeFx, setLoungeFx] = useState<(LoungeFx & { id: number }) | null>(null);
  const setShared = useCallback((key: LoungeSharedKey, value: unknown) => {
    sendRef.current({ t: "lounge-set", key, value });
  }, []);
  const sendRef = useRef(send);
  sendRef.current = send;
  const venueRef = useRef<VenueId>("lounge");
  venueRef.current = venueId;
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
    setEveryone(new Map());
    setVenueState("lounge");
    setSharedState(NO_SHARED);
    setHiddenRoll(null);
    setSpellFx(null);
    setLoungeFx(null);
    setEmotes([]);
    if (roomId) sendRef.current({ t: "lounge-sync" });
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    const onEvent = (raw: Event) => {
      const detail = (raw as CustomEvent).detail as
        | { t: "lounge"; channelId: string; connectionId: string; pose: unknown; emote?: string }
        | { t: "lounge-state"; channelId: string; poses: Array<{ connectionId: string; pose: unknown }>; venue?: unknown }
        | { t: "lounge-venue"; channelId: string; venue: unknown }
        | { t: "lounge-shared"; channelId: string; key: string; value: unknown };
      if (!detail || detail.channelId !== roomId) return;
      if (detail.t === "lounge-venue") {
        // The call moved to another room: everyone's old spot belonged to the last one.
        if (isVenueId(detail.venue)) { setVenueState(detail.venue); setEveryone(new Map()); }
        return;
      }
      if (detail.t === "lounge-shared") {
        if (detail.key === "loungefx") {
          if (detail.value && typeof detail.value === "object") setLoungeFx({ ...(detail.value as LoungeFx), id: ++emoteId.current });
        } else if (detail.key === "spellfx") {
          if (detail.value && typeof detail.value === "object") setSpellFx({ ...(detail.value as SpellFxEvent), id: ++emoteId.current });
        } else if (detail.key === "hiddenroll") {
          if (detail.value && typeof detail.value === "object") setHiddenRoll({ ...(detail.value as HiddenRoll), id: ++emoteId.current });
        } else {
          setSharedState((current) => ({ ...current, [detail.key]: detail.value ?? (detail.key === "characters" || detail.key === "pawns" || detail.key === "areas" ? {} : null) }));
        }
        return;
      }
      if (detail.t === "lounge-state") {
        if (isVenueId(detail.venue)) setVenueState(detail.venue);
        setSharedState({ ...NO_SHARED, ...((detail as { shared?: Partial<LoungeShared> }).shared ?? {}) });
      }
      // A pose is read in the room it was sent from, whichever room this tab shows.
      const read = (raw: unknown): { pose: LoungePose; venue: VenueId } | null => {
        const sent = (raw as { venue?: unknown } | null)?.venue;
        const room = isVenueId(sent) ? sent : "lounge";
        const pose = clampPose(raw, venueById(room), true); // whoever is in the booth is shown there
        return pose ? { pose, venue: room } : null;
      };
      if (detail.t === "lounge-state") {
        const next = new Map<string, { pose: LoungePose; venue: VenueId }>();
        for (const entry of detail.poses) {
          const got = read(entry.pose);
          if (got && entry.connectionId !== connectionId) next.set(entry.connectionId, got);
        }
        // Keep our own spot: the hub may answer before our first pose landed.
        setEveryone((current) => {
          const mine = connectionId ? current.get(connectionId) : undefined;
          if (mine && connectionId) next.set(connectionId, mine);
          return next;
        });
        return;
      }
      if (detail.connectionId === connectionId) return;
      const got = read(detail.pose);
      setEveryone((current) => {
        const next = new Map(current);
        if (got) next.set(detail.connectionId, got); else next.delete(detail.connectionId);
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
    return defaultPoses(ids, present, venue);
  }, [explicit, ids, contested, venue]);

  const flush = useCallback(() => {
    timer.current = null;
    const pose = pending.current;
    if (!pose) return;
    pending.current = null;
    lastSent.current = Date.now();
    sendRef.current({ t: "lounge", x: pose.x, z: pose.z, facing: pose.facing, seat: pose.seat, venue: venueRef.current });
  }, []);

  const move = useCallback((pose: LoungePose) => {
    if (!connectionId) return;
    setEveryone((current) => new Map(current).set(connectionId, { pose, venue: venueRef.current }));
    pending.current = pose;
    const wait = SEND_EVERY_MS - (Date.now() - lastSent.current);
    if (wait <= 0) flush();
    else if (!timer.current) timer.current = setTimeout(flush, wait);
  }, [connectionId, flush]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const sit = useCallback((seatId: string): string | null => {
    const seat = seatById(seatId, venue);
    if (!seat || !connectionId) return null;
    const takenBy = [...poses].find(([id, pose]) => pose.seat === seatId && id !== connectionId);
    if (takenBy) return null;
    if (seat.reserved) {
      const gm = sharedRef.current.gm;
      const gmHere = gm ? participants.find((p) => p.connectionId === gm.connectionId) : undefined;
      if (gm && gmHere && gm.connectionId !== connectionId) return `${gm.name || gmHere.displayName} is the game master: that chair is theirs.`;
      if (!gm || gm.connectionId !== connectionId) {
        const me = participants.find((p) => p.connectionId === connectionId);
        sendRef.current({ t: "lounge-set", key: "gm", value: { connectionId, name: me?.displayName || "Game master" } });
      }
    }
    move({ x: seat.x, z: seat.z, facing: seat.facing, seat: seat.id });
    return null;
  }, [connectionId, poses, move, venue, participants]);

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
    sendRef.current({ t: "lounge", x: pose.x, z: pose.z, facing: pose.facing, seat: pose.seat, venue: venueRef.current, emote: emoji });
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
    const seat = freeSeat(others, venue);
    move(seat ? { x: seat.x, z: seat.z, facing: seat.facing, seat: seat.id } : self ?? { x: venue.spawn.x, z: venue.spawn.z, facing: 0, seat: null });
  }, [open, roomId, connectionId, claimed, explicit, move, self, venue]);

  const live = open && Boolean(roomId);
  const heard = useMemo(() => {
    if (!live || !settings.spatial || !self || !connectionId) return null;
    const map = new Map<string, HeardFrom>();
    for (const [id, pose] of poses) if (id !== connectionId) map.set(id, hearFrom(self, pose, undefined, venue, settings.echo));
    return map;
  }, [live, settings.spatial, settings.echo, self, poses, connectionId, venue]);
  const tv = useMemo(
    () => (live && settings.tvMusic && self ? hearFrom(self, tvPoseFor(venue), venue.tv.height, venue, settings.echo) : null),
    [live, settings.tvMusic, settings.echo, self, venue],
  );

  return {
    open: live, setOpen, shared, setShared, hiddenRoll, spellFx, loungeFx, venue: venueId, setVenue, poses, self, emotes, move, sit, toggleFloor, emote, heard, tv,
    spatialOff: live && !settings.spatial, theme, settings, setSettings,
  };
}
