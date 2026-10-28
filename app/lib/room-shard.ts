/**
 * Events from a room shard socket that belong to the main hub, and are dropped.
 *
 * The shard (`room:<channelId>`) is a hub instance of its own that only knows
 * the shard sockets connected to it at that moment. Its roster, presence and
 * watch party are therefore partial, and letting them through overwrote the
 * main hub's: after a restart or a dropped shard socket the room looked (and,
 * since media is matched against the roster, sounded) empty until a refresh.
 * Its "ready" would also swap in its own resume ticket and reset the players.
 */
const MAIN_HUB_ONLY: ReadonlySet<string> = new Set(["ready", "voice", "presence", "room-watch", "pong"]);

/** Whether a raw shard message should reach the hub's handler. */
export function shardEventAllowed(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  try {
    const type = (JSON.parse(raw) as { t?: unknown }).t;
    return typeof type === "string" && !MAIN_HUB_ONLY.has(type);
  } catch {
    return false;
  }
}

/** How long to wait before reopening a shard socket that dropped. */
export function shardRetryMs(attempt: number): number {
  return Math.min(15_000, 1_000 * 2 ** attempt);
}
