/**
 * Keeping LiveKit rooms to the people the hub has seated.
 *
 * A token from /api/voice/token lets its holder into a LiveKit room on its own:
 * the hub's roster is what everyone sees, but LiveKit only ever checks the
 * token. So a modified client could take a token and listen without a seat,
 * and someone kicked, banned or timed out could stay connected, or reconnect
 * with the token they already have. The hub sweeps the rooms and removes
 * whoever has no seat behind them.
 *
 * The decisions live here, apart from the hub and the network, so they can be
 * tested on their own.
 */

import type { VoiceParticipant } from "./protocol";

/** How long a token from /api/voice/token lasts. LiveKit refreshes it for connected seats. */
export const LIVEKIT_TOKEN_TTL_MS = 10 * 60_000;
/**
 * A participant may sit in LiveKit this long before its seat lands. The client
 * connects and announces its seat at about the same time, and a hub restart
 * empties the roster until the tabs resume, so a missing seat is only believed
 * once it has stayed missing for a while.
 */
export const LIVEKIT_JOIN_GRACE_MS = 30_000;
/** ...and has to be missing on sweeps at least this far apart. */
export const LIVEKIT_MISSING_GRACE_MS = 15_000;
/** Time between sweeps while there is something to watch. */
export const LIVEKIT_SWEEP_EVERY_MS = 15_000;

/** What the hub keeps between sweeps, in storage: it can sleep in between. */
export interface LiveKitSweepState {
  /** When the next sweep is due; 0 for none. */
  dueAt: number;
  /** Keep sweeping until then: a token minted for some room may still be unused. */
  watchUntil: number;
  /** `room\nidentity` -> when a sweep first found it without a seat. */
  missing: Record<string, number>;
  /** Identity -> until: removed once, so it gets no grace if it comes back. */
  removed: Record<string, number>;
  /** `room\nuserId` -> until: a moderator took them out of that room; no grace for any of their identities. */
  blocked: Record<string, number>;
}

export function emptySweepState(): LiveKitSweepState {
  return { dueAt: 0, watchUntil: 0, missing: {}, removed: {}, blocked: {} };
}

export interface LiveKitParticipantView {
  identity: string;
  /** Milliseconds since the epoch; 0 when LiveKit did not say. */
  joinedAt: number;
  canPublish: boolean;
}

export interface LiveKitRoomView {
  name: string;
  participants: LiveKitParticipantView[];
}

export interface SweepPlan {
  remove: { room: string; identity: string }[];
  /** Seated, but not allowed to be heard: LiveKit takes their publish right away too. */
  silence: { room: string; identity: string }[];
  state: LiveKitSweepState;
  /** Whether another sweep should follow soon. */
  again: boolean;
}

/** `<userId>|<connectionId>` as the token route writes it; a bare user id when it had no connection. */
export function splitIdentity(identity: string): { userId: string; connectionId: string | null } {
  const bar = identity.lastIndexOf("|");
  if (bar <= 0) return { userId: identity, connectionId: null };
  return { userId: identity.slice(0, bar), connectionId: identity.slice(bar + 1) || null };
}

/** The session recorder joins with a service token and no user behind it. */
function isService(userId: string): boolean {
  return userId === "recorder";
}

function seatFor(seats: VoiceParticipant[] | undefined, identity: string): VoiceParticipant | undefined {
  const { userId, connectionId } = splitIdentity(identity);
  return (seats || []).find(
    (seat) => !seat.bot && seat.id === userId && (connectionId === null || seat.connectionId === connectionId),
  );
}

function live(record: Record<string, number>, now: number): Record<string, number> {
  return Object.fromEntries(Object.entries(record).filter(([, until]) => until > now));
}

export function planSweep(
  rooms: LiveKitRoomView[],
  seats: Record<string, VoiceParticipant[]>,
  previous: LiveKitSweepState,
  now: number,
): SweepPlan {
  const removed = live(previous.removed, now);
  const blocked = live(previous.blocked, now);
  const missing: Record<string, number> = {};
  const remove: SweepPlan["remove"] = [];
  const silence: SweepPlan["silence"] = [];
  let waiting = false;

  for (const room of rooms) {
    for (const participant of room.participants) {
      const { userId } = splitIdentity(participant.identity);
      if (isService(userId)) continue;
      const seat = seatFor(seats[room.name], participant.identity);
      if (seat) {
        if (participant.canPublish && (seat.speakAllowed === false || seat.serverMuted === true)) {
          silence.push({ room: room.name, identity: participant.identity });
        }
        continue;
      }
      const key = `${room.name}\n${participant.identity}`;
      const since = previous.missing[key];
      const settled =
        since !== undefined &&
        now - since >= LIVEKIT_MISSING_GRACE_MS &&
        (!participant.joinedAt || now - participant.joinedAt >= LIVEKIT_JOIN_GRACE_MS);
      if (blocked[`${room.name}\n${userId}`] || removed[participant.identity] || settled) {
        remove.push({ room: room.name, identity: participant.identity });
        removed[participant.identity] = now + LIVEKIT_TOKEN_TTL_MS + 60_000;
      } else {
        missing[key] = since ?? now;
        waiting = true;
      }
    }
  }

  const state: LiveKitSweepState = {
    dueAt: 0,
    watchUntil: previous.watchUntil > now ? previous.watchUntil : 0,
    missing,
    removed,
    blocked,
  };
  const watching =
    waiting || remove.length > 0 || state.watchUntil > now ||
    Object.keys(removed).length > 0 || Object.keys(blocked).length > 0;
  return { remove, silence, state, again: watching };
}
