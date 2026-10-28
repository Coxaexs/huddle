/**
 * The decisions behind a voice call, kept apart from the hook so they can be
 * tested without WebRTC: who meets whom over the mesh, who dials, when a pair
 * is rebuilt, when a seat falls back from LiveKit, and what a hub reconnect
 * means for the seat.
 */

import type { VoiceParticipant } from "@/lib/protocol";

/**
 * Whether this tab connects to `person` directly. A seat in the LiveKit room
 * meets other LiveKit seats there, and everyone else over the mesh.
 */
export function meshWith(person: VoiceParticipant, sfu: boolean): boolean {
  return !sfu || person.bot === true || person.sfu !== true;
}

/**
 * Most other people a seat that lost LiveKit may mesh with. Past this, falling
 * back would have it upload one copy of its voice — and of a screen share —
 * per person, which nobody's uplink survives in a big room, and every LiveKit
 * seat would open a direct connection to it too. It keeps retrying LiveKit
 * instead.
 */
export const MESH_FALLBACK_MAX_PEERS = 8;
/** How long a seat waits between attempts to get back into LiveKit. */
export const SFU_RETRY_MS = 5_000;

/**
 * Whether this room is too big for `self` to fall back to the mesh: more than
 * MESH_FALLBACK_MAX_PEERS other people, and the room is already on LiveKit (a
 * room with no LiveKit seats is a mesh anyway, so there is nothing to protect).
 */
export function meshFallbackBlocked(people: VoiceParticipant[], self: string | null): boolean {
  const others = people.filter((person) => person.connectionId !== self && !person.bot);
  return others.length > MESH_FALLBACK_MAX_PEERS && others.some((person) => person.sfu === true);
}

/**
 * Whether to show `person`'s camera or screen share. A stage audience seat has
 * no floor, so its video is dropped here, on every receiver: hiding the button
 * from the audience alone would not stop a modified client from publishing.
 */
export function videoAllowedFrom(person: VoiceParticipant | undefined): boolean {
  return person?.speakAllowed !== false;
}

/**
 * Whether this seat places the call to `person`. Comparing connection ids
 * keeps both sides from offering at once; the server-side music publisher
 * only answers offers, so listeners always call it.
 */
export function weCall(self: string, person: VoiceParticipant): boolean {
  return Boolean(person.bot) || self <= person.connectionId;
}

/**
 * Everyone in the room this seat meets over the mesh.
 *
 * A LiveKit seat in a room too big to mesh meets only bots directly. No honest
 * seat falls back there (see meshFallbackBlocked), so one claiming it has no
 * LiveKit is a modified client asking the whole room to upload to it.
 */
export function meshPeers(people: VoiceParticipant[], self: string, sfu: boolean): VoiceParticipant[] {
  const others = people.filter((person) => person.connectionId !== self);
  const tooBig = sfu && others.filter((person) => !person.bot).length > MESH_FALLBACK_MAX_PEERS;
  return others.filter((person) => meshWith(person, sfu) && (!tooBig || person.bot === true));
}

/**
 * The ICE transport policy for a direct connection to `person`: relay only, so
 * the other side learns our TURN server's address and never this machine's own
 * (a modified client could read it straight off the signalling, and Wireshark
 * shows it on the wire). The bots are our own server, which sees addresses
 * anyway, and an instance with no TURN server has no other way to connect.
 */
export function meshIcePolicy(person: VoiceParticipant | undefined, hasRelay: boolean): RTCIceTransportPolicy {
  return hasRelay && person?.bot !== true ? "relay" : "all";
}

/**
 * What the roster asks of the mesh: dial the people this seat calls and has no
 * connection to, wait for the ones who call it, and close connections to
 * people who left (or moved to LiveKit alongside this seat).
 */
export function meshPlan(
  people: VoiceParticipant[],
  self: string,
  sfu: boolean,
  open: Iterable<string>,
): { call: string[]; wait: string[]; close: string[] } {
  const others = meshPeers(people, self, sfu);
  const connected = new Set(open);
  const call: string[] = [];
  const wait: string[] = [];
  for (const person of others) {
    if (connected.has(person.connectionId)) continue;
    (weCall(self, person) ? call : wait).push(person.connectionId);
  }
  const present = new Set(others.map((person) => person.connectionId));
  return { call, wait, close: [...connected].filter((id) => !present.has(id)) };
}

/** How long the watchdog lets a pair try before stepping in. The caller goes first. */
export function watchdogGraceMs(callsFirst: boolean): number {
  return callsFirst ? 8000 : 14000;
}

/**
 * The watchdog's verdict for one mesh pair, every few seconds: dial a missing
 * connection once its grace is up, close one that failed or has tried for
 * too long (so the next pass dials it fresh), or leave it alone.
 */
export function watchdogVerdict(options: {
  callsFirst: boolean;
  /** The peer connection's state, or null when there is none. */
  state: RTCPeerConnectionState | null;
  /** When this pair's clock started (0 = never). */
  since: number;
  now: number;
}): "call" | "close" | "healthy" | "wait" {
  const grace = watchdogGraceMs(options.callsFirst);
  const waited = options.now - options.since;
  if (options.state === null) return waited > grace ? "call" : "wait";
  if (options.state === "connected") return "healthy";
  if (options.state === "failed" || options.state === "closed" || waited > grace * 2) return "close";
  return "wait";
}

/**
 * Whether this seat may publish to LiveKit: not server-muted and not in a
 * stage audience. null when it is not in the room's roster (yet).
 */
export function mayPublish(mine: VoiceParticipant | undefined): boolean | null {
  return mine ? !mine.serverMuted && mine.speakAllowed !== false : null;
}

/** Brought on stage or unmuted by a moderator: the LiveKit token must be renewed. */
export function gainedPublish(before: boolean | null, now: boolean | null): boolean {
  return before === false && now === true;
}

/** How long a signal from a seat the roster has not shown yet is kept. */
export const EARLY_SIGNAL_MS = 15_000;

/**
 * Signals that arrived before their sender was in the roster: the ones whose
 * sender has since appeared are ready to handle, the rest wait a while longer.
 */
export function splitEarlySignals<T extends { from: string; at: number }>(
  pending: T[],
  roster: Set<string>,
  now: number,
): { ready: T[]; keep: T[] } {
  const fresh = pending.filter((entry) => now - entry.at < EARLY_SIGNAL_MS);
  return {
    ready: fresh.filter((entry) => roster.has(entry.from)),
    keep: fresh.filter((entry) => !roster.has(entry.from)),
  };
}

/**
 * What to do when the hub connection or its session changes while in a room.
 * - "none": already announced under this connection and session.
 * - "first": the first announcement; the roster effect does the meshing.
 * - "resume": same connection id after a hub restart; only the hub forgot the
 *   seat, so re-announce and leave media alone.
 * - "reconnect": a new connection id (a wifi blip, a laptop lid); everyone else
 *   rebuilds against the new id, so tear down and re-mesh (and rejoin LiveKit).
 */
export function rejoinKind(
  announced: { connectionId: string | null; session: unknown },
  connectionId: string,
  session: unknown,
): "none" | "first" | "resume" | "reconnect" {
  const sameId = announced.connectionId === connectionId;
  if (sameId && announced.session === session) return "none";
  if (sameId) return "resume";
  return announced.connectionId === null ? "first" : "reconnect";
}
