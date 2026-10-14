/**
 * Whispers: voice to a few seats in the room, and text to a few people (a game
 * master telling two players what only they notice).
 *
 * Voice stays private because of who the media server is told may subscribe to
 * the microphone track, not because listeners agree to ignore it; the mesh
 * fallback sends the microphone down one peer connection only. Text goes
 * straight from the hub to the two people and is never stored.
 */
import type { ParticipantTrackPermission } from "livekit-client";

/** At most this many people share one whisper. */
export const MAX_WHISPER_TARGETS = 8;

/**
 * Who may subscribe to what while we whisper: the targets get everything, and
 * everyone else everything except the microphone. Camera and screen share keep
 * flowing, so a whisper does not black out the room's video.
 */
export function whisperPermissions(
  participants: readonly string[],
  targetIdentities: readonly string[],
  ownTrackSids: readonly string[],
  micSid: string,
): ParticipantTrackPermission[] {
  const others = ownTrackSids.filter((sid) => sid && sid !== micSid);
  const targets = new Set(targetIdentities);
  return participants.map((participantIdentity) =>
    targets.has(participantIdentity)
      ? { participantIdentity, allowAll: true }
      : { participantIdentity, allowAll: false, allowedTrackSids: others },
  );
}

/** A person a text whisper could be addressed to. */
export interface WhisperCandidate {
  id: string;
  username: string;
  displayName: string;
}

export type WhisperTarget =
  | { ok: true; people: WhisperCandidate[]; text: string }
  | { ok: false; error: string };

const USAGE = "Use `/w name message`, or `/w sam,kit message` for a few people.";

/**
 * Reads `/w name message` (the part after the command) against the people
 * here. Several people go in as `sam,kit`, `sam, kit` or `@sam @kit`.
 */
export function parseWhisper(args: string, people: readonly WhisperCandidate[], selfId: string): WhisperTarget {
  const words = args.trim().split(/\s+/).filter(Boolean);
  const names: string[] = [];
  let at = 0;
  // The first word always names someone; more follow after a comma or as @mentions.
  while (at < words.length) {
    const word = words[at];
    if (at > 0 && !word.startsWith("@") && !words[at - 1].endsWith(",") && !word.startsWith(",")) break;
    names.push(...word.split(",").map((part) => part.replace(/^@/, "").toLowerCase()).filter(Boolean));
    at += 1;
  }
  const text = words.slice(at).join(" ");
  if (!names.length || !text) return { ok: false, error: USAGE };

  const others = people.filter((person) => person.id !== selfId);
  const key = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  const chosen: WhisperCandidate[] = [];
  for (const name of names) {
    const exact = others.filter((person) => person.username.toLowerCase() === name || key(person.displayName) === name);
    const pool = exact.length ? exact : others.filter((person) => person.username.toLowerCase().startsWith(name) || key(person.displayName).startsWith(name));
    if (pool.length > 1) return { ok: false, error: `More than one person matches "${name}". Use their username.` };
    if (!pool.length) return { ok: false, error: `Nobody called "${name}" here.` };
    if (!chosen.includes(pool[0])) chosen.push(pool[0]);
  }
  if (chosen.length > MAX_WHISPER_TARGETS) return { ok: false, error: `A whisper reaches at most ${MAX_WHISPER_TARGETS} people.` };
  return { ok: true, people: chosen, text };
}

