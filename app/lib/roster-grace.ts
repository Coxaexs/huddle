import type { VoiceParticipant } from "@/lib/protocol";

/** How long after a reconnect the old roster covers people still on their way back. */
export const ROSTER_GRACE_MS = 20_000;

type Rosters = Record<string, VoiceParticipant[]>;

/**
 * After a server restart the hub starts empty and everyone reconnects at a
 * slightly different moment. Without help, the people not back yet drop out of
 * the roster for a few seconds, and with them their audio. While the grace
 * lasts, anyone from the previous roster who has not reappeared anywhere keeps
 * their seat.
 */
export function withRosterGrace(fresh: Rosters, previous: Rosters | null): Rosters {
  if (!previous) return fresh;
  // By connection and by person: someone who came back under a new id is
  // already seated, and must not appear twice.
  const present = new Set<string>();
  const seatedUsers = new Set<string>();
  for (const people of Object.values(fresh)) {
    for (const person of people) {
      present.add(person.connectionId);
      if (!person.bot) seatedUsers.add(person.id);
    }
  }
  const merged: Rosters = { ...fresh };
  for (const [channelId, people] of Object.entries(previous)) {
    const missing = people.filter(
      (person) =>
        !present.has(person.connectionId) && (person.bot || !seatedUsers.has(person.id)),
    );
    if (missing.length) merged[channelId] = [...(merged[channelId] || []), ...missing];
  }
  return merged;
}
