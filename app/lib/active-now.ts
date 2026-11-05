import type { FriendUser } from "@/lib/friends";
import type { VoiceParticipant } from "@/lib/protocol";
import type { PublicChannel, PublicServer } from "@/lib/servers";
import { liveActivity, liveSpotify, type ProfileActivity, type SpotifyActivity } from "@/lib/users";

/** What one friend is up to right now, for the Friends page's Active Now column. */
export interface ActiveNowEntry {
  friend: FriendUser;
  /** The voice room they are in, when it is in a server you are in too. */
  room?: { server: PublicServer; channel: PublicChannel; people: VoiceParticipant[] };
  /** The game or app they share, while it is still live. */
  activity?: ProfileActivity;
  /** The song they are listening to, while it is still playing. */
  song?: SpotifyActivity;
}

/**
 * Friends who are doing something: sitting in a voice room you can see, or
 * sharing a game or a song while online. Rooms come first because you can
 * join them, then games, then music; by name within each.
 */
export function activeNow(
  friends: FriendUser[],
  online: Set<string>,
  voice: Record<string, VoiceParticipant[]>,
  servers: PublicServer[],
  now = Date.now(),
): ActiveNowEntry[] {
  const places = new Map<string, { server: PublicServer; channel: PublicChannel }>();
  for (const server of servers) {
    for (const channel of server.channels) places.set(channel.id, { server, channel });
  }
  const roomOf = new Map<string, NonNullable<ActiveNowEntry["room"]>>();
  for (const [channelId, seats] of Object.entries(voice)) {
    const place = places.get(channelId);
    if (!place) continue;
    // Two tabs of one person are one person in the room.
    const people = [...new Map(seats.filter((seat) => !seat.bot).map((seat) => [seat.id, seat])).values()];
    for (const person of people) {
      if (!roomOf.has(person.id)) roomOf.set(person.id, { ...place, people });
    }
  }

  const entries: ActiveNowEntry[] = [];
  for (const friend of friends) {
    const room = roomOf.get(friend.id);
    const here = online.has(friend.id);
    const activity = here ? liveActivity(friend.activity, now) : null;
    const song = here ? liveSpotify(friend.spotifyActivity, now) : null;
    if (!room && !activity && !song) continue;
    entries.push({
      friend,
      ...(room ? { room } : {}),
      ...(activity ? { activity } : {}),
      ...(song ? { song } : {}),
    });
  }
  const rank = (entry: ActiveNowEntry) => (entry.room ? 0 : entry.activity ? 1 : 2);
  return entries.sort(
    (a, b) => rank(a) - rank(b) || a.friend.displayName.localeCompare(b.friend.displayName),
  );
}
