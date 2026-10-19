import type { VoiceParticipant } from "@/lib/protocol";

/** How loud everyone else stays while a Priority Speaker talks. */
export const PRIORITY_DUCK = 0.3;

/** Connection ids of Priority Speakers who are talking right now, joined; "" when none. */
export function talkingPriorityKey(participants: VoiceParticipant[], speaking: Set<string>): string {
  return participants
    .filter((p) => p.prioritySpeaker && !p.muted && !p.serverMuted && speaking.has(p.connectionId))
    .map((p) => p.connectionId)
    .sort()
    .join(",");
}
