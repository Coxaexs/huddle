import type { PlayerAction, PlayerState, VoiceParticipant } from "./protocol";
import { bindings } from "./storage";

/**
 * There is a single hub instance for this Huddle. The friend group is small
 * enough that one object keeps presence, voice and playback consistent without
 * any cross-object coordination.
 */
export function hub(): DurableObjectStub | null {
  const namespace = (bindings() as { HUB?: DurableObjectNamespace }).HUB;
  if (!namespace) return null;
  return namespace.get(namespace.idFromName("huddle"));
}

/** Base URL is arbitrary — Durable Object fetches never leave the worker. */
const INTERNAL = "https://huddle.hub";

/**
 * @param audience user ids allowed to receive it; omit for channels everyone
 *   can read. Direct messages pass their two participants.
 */
export async function publishMessage(
  channelId: string,
  message: unknown,
  audience?: string[] | null,
): Promise<void> {
  const stub = hub();
  if (!stub) return;
  await stub
    .fetch(`${INTERNAL}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, message, audience }),
    })
    .catch(() => undefined);
}

/** Pushes a non-message channel event (a delete, a pin) to open tabs. */
export async function publishMessageEvent(
  channelId: string,
  event: Record<string, unknown>,
  audience?: string[] | null,
): Promise<void> {
  const stub = hub();
  if (!stub) return;
  await stub
    .fetch(`${INTERNAL}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, event, audience }),
    })
    .catch(() => undefined);
}

/** Mutes someone for the whole Huddle, at their own microphone. */
export async function forceMute(
  userId: string,
  muted: boolean,
): Promise<void> {
  const stub = hub();
  if (!stub) return;
  await stub
    .fetch(`${INTERNAL}/force-mute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, muted }),
    })
    .catch(() => undefined);
}

/** Tells every open tab that servers or channels changed and to reload them. */
export async function publishStructureChange(): Promise<void> {
  const stub = hub();
  if (!stub) return;
  await stub.fetch(`${INTERNAL}/structure`, { method: "POST" }).catch(() => undefined);
}

export async function hubState(): Promise<{
  online: string[];
  voice: Record<string, VoiceParticipant[]>;
  players: Record<string, PlayerState>;
  serverNow: number;
} | null> {
  const stub = hub();
  if (!stub) return null;
  try {
    const response = await stub.fetch(`${INTERNAL}/state`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function playerCommand(
  channelId: string,
  action: PlayerAction,
): Promise<PlayerState | null> {
  const stub = hub();
  if (!stub) return null;
  try {
    const response = await stub.fetch(`${INTERNAL}/player`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, action }),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { state: PlayerState }).state;
  } catch {
    return null;
  }
}

export async function playerState(
  channelId: string,
): Promise<PlayerState | null> {
  const stub = hub();
  if (!stub) return null;
  try {
    const response = await stub.fetch(
      `${INTERNAL}/player?channelId=${encodeURIComponent(channelId)}`,
    );
    if (!response.ok) return null;
    return ((await response.json()) as { state: PlayerState }).state;
  } catch {
    return null;
  }
}
