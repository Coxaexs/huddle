/**
 * Stage rooms: the one channel kind with an audience.
 *
 * A stage differs from a voice room in a single idea — not everyone is a
 * speaker. Two rules follow from it, and both live here so they can be tested
 * without a browser or a live call:
 *
 * 1. Who counts as on stage. That is "whose microphone is live", not "who meant
 *    to speak". Hoffle has no stage-speaker role to read, and treating intent as
 *    authoritative would put a muted person on stage and a server-muted person
 *    in front of an audience they cannot address.
 * 2. Whether joining starts you muted. Yes, unless SPEAK says otherwise. This
 *    is the only place SPEAK is enforced anywhere in the app, and without it
 *    every joiner would arrive with a live microphone, which would make the
 *    audience split meaningless.
 */
import { channelKindInfo } from "./channel-kinds";

/** The least a participant needs to have for these decisions. */
export interface StageSeat {
  muted: boolean;
  serverMuted?: boolean;
  /** Set by the hub in stage rooms: the host has given this seat the floor. */
  speakAllowed?: boolean;
}

/**
 * Whether a seat belongs on stage. The hub's `speakAllowed` decides when it is
 * known: a host bringing someone up must move them at once, even before they
 * unmute, and a speaker who mutes for a moment has not left the stage. Seats
 * without the flag fall back to "is their mic live".
 */
export function isOnStage(seat: StageSeat): boolean {
  if (seat.serverMuted) return false;
  if (typeof seat.speakAllowed === "boolean") return seat.speakAllowed;
  return !seat.muted;
}

export interface StageRoster<T extends StageSeat> {
  /** Audible: unmuted and not silenced by a moderator. */
  onStage: T[];
  /** Everyone else, including anyone a moderator has server-muted. */
  audience: T[];
}

/**
 * Splits a room into speakers and listeners, preserving the input order so the
 * two lists do not reshuffle as people mute and unmute.
 */
export function splitStageRoster<T extends StageSeat>(participants: T[]): StageRoster<T> {
  const onStage: T[] = [];
  const audience: T[] = [];
  for (const person of participants) {
    if (isOnStage(person)) onStage.push(person);
    else audience.push(person);
  }
  return { onStage, audience };
}

/**
 * Whether joining this channel should start the microphone closed.
 *
 * Only stages do this, and only for people without SPEAK. A voice room is a
 * conversation between equals, so muting on entry there would be hostile.
 */
export function shouldStartMuted(
  kind: string | null | undefined,
  canSpeak: boolean,
): boolean {
  return channelKindInfo(kind).kind === "stage" && !canSpeak;
}

/**
 * Whether a seat is allowed to be heard.
 *
 * Decided on join from the member's SPEAK permission, and afterwards changed
 * only by a moderator putting them on stage.
 */
export function initialSpeakAllowed(
  kind: string | null | undefined,
  canSpeak: boolean,
): boolean {
  return !shouldStartMuted(kind, canSpeak);
}

/**
 * The mute state a seat should actually end up with.
 *
 * The hub owns this decision rather than trusting the client. Otherwise the
 * auto-mute on join is cosmetic: a client that simply never muted itself, or
 * that skipped straight to `voice-state { muted: false }`, would be heard by
 * the whole room. In a stage, a seat without the floor stays muted no matter
 * what it asks for.
 *
 * Outside a stage the request is honoured unchanged — a voice room has no
 * audience to protect.
 */
export function resolveSeatMute(options: {
  kind: string | null | undefined;
  speakAllowed: boolean;
  requestedMuted: boolean;
}): boolean {
  if (channelKindInfo(options.kind).kind !== "stage") return options.requestedMuted;
  // A seat on stage is free to mute and unmute itself like anyone else.
  if (options.speakAllowed) return options.requestedMuted;
  return true;
}


/** True when this participant is asking for the floor. */
export function hasHandRaised(seat: StageSeat & { handRaised?: boolean }): boolean {
  return seat.handRaised === true;
}

/**
 * Queue position for raised hands, in the order they should be considered.
 *
 * Speakers are excluded even if a stale flag says otherwise: someone already
 * being heard has nothing left to ask for.
 */
export function handRaiseQueue<T extends StageSeat & { handRaised?: boolean }>(
  participants: T[],
): T[] {
  return participants.filter(
    (person) => !person.serverMuted && !isOnStage(person) && hasHandRaised(person),
  );
}
