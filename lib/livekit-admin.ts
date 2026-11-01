/**
 * The LiveKit server API, for the hub's sweep (see livekit-sweep.ts): which
 * rooms exist on each region and who is in them, and removing or silencing a
 * participant. Every call is best effort — a region that does not answer is
 * skipped, and the next sweep tries again.
 */

import { RoomServiceClient } from "livekit-server-sdk";
import type { LiveKitRoomView } from "./livekit-sweep";

type LiveKitEnv = {
  LIVEKIT_URL?: string;
  LIVEKIT_URL_DE?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
};

/** A LiveKit room on one region, with the client that reaches it. */
export interface RegionRoom extends LiveKitRoomView {
  client: RoomServiceClient;
}

/** One client per configured region, keyed by its API address; none without keys. */
export function liveKitClients(env: LiveKitEnv): RoomServiceClient[] {
  const key = env.LIVEKIT_API_KEY?.trim();
  const secret = env.LIVEKIT_API_SECRET?.trim();
  if (!key || !secret) return [];
  // Same default as the token route, which hands this region out.
  const urls = [env.LIVEKIT_URL?.trim(), env.LIVEKIT_URL_DE?.trim() || "wss://livekit-de.hoffle.online"];
  const hosts = new Set(
    urls.filter((url): url is string => Boolean(url)).map((url) => url.replace(/^ws(s?):\/\//i, "http$1://")),
  );
  return [...hosts].map((host) => new RoomServiceClient(host, key, secret));
}

const STANDARD_PARTICIPANT = 0;

/** Every occupied room on every region, with its ordinary participants. */
export async function liveKitRooms(clients: RoomServiceClient[], only?: Set<string>): Promise<RegionRoom[]> {
  const perRegion = await Promise.all(
    clients.map(async (client) => {
      const rooms = await client.listRooms(only ? [...only] : undefined).catch(() => []);
      return Promise.all(
        rooms
          .filter((room) => room.numParticipants > 0)
          .map(async (room) => {
            const people = await client.listParticipants(room.name).catch(() => []);
            return {
              client,
              name: room.name,
              participants: people
                .filter((person) => person.kind === STANDARD_PARTICIPANT)
                .map((person) => ({
                  identity: person.identity,
                  joinedAt: Number(person.joinedAtMs) || Number(person.joinedAt) * 1000,
                  canPublish: person.permission?.canPublish === true,
                })),
            };
          }),
      );
    }),
  );
  return perRegion.flat();
}

export async function removeFromLiveKit(client: RoomServiceClient, room: string, identity: string): Promise<void> {
  await client.removeParticipant(room, identity).catch(() => undefined);
}

/** Keeps them listening; a seat later allowed to speak fetches a new token and reconnects. */
export async function silenceInLiveKit(client: RoomServiceClient, room: string, identity: string): Promise<void> {
  await client
    .updateParticipant(room, identity, { permission: { canPublish: false, canSubscribe: true, canPublishData: true } })
    .catch(() => undefined);
}
