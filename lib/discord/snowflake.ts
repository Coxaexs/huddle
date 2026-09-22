/**
 * Snowflake identity for the Discord-compatible surface.
 *
 * Hoffle's own ids are arbitrary text ("general", "hangout", a uuid). Discord
 * libraries assume every id is a 64-bit snowflake: discord.js derives
 * `createdTimestamp` from it, discord.py builds `Object(id=int(...))`, and JDA
 * refuses anything that is not numeric outright. So every object exposed over
 * /api/v10 gets a snowflake, allocated once and kept in `discord_ids`.
 *
 * The mapping is a table rather than a hash because it has to round-trip: a bot
 * POSTs to /channels/<snowflake>/messages and we must find the native channel
 * again. Allocation embeds the row's real creation time where we know it, so
 * snowflake ordering matches Hoffle's ordering and "sort by id" works.
 */
import { bindings } from "../storage";

/** Discord's epoch: 2015-01-01T00:00:00Z. */
export const DISCORD_EPOCH = 1420070400000;

export type SnowflakeKind =
  | "user"
  | "guild"
  | "channel"
  | "message"
  | "role"
  | "emoji"
  | "application"
  | "attachment"
  | "interaction"
  | "command"
  | "webhook";

/**
 * Per-isolate memo. D1 is the source of truth, but a READY payload resolves
 * every member and channel of a guild at once and would otherwise issue
 * hundreds of point lookups.
 */
const toSnowflake = new Map<string, string>();
const toNative = new Map<string, { kind: SnowflakeKind; nativeId: string }>();

const cacheKey = (kind: SnowflakeKind, nativeId: string) => `${kind}:${nativeId}`;

let sequence = 0;

/**
 * Builds a snowflake from a timestamp. The worker/process bits are fixed (this
 * is a single logical instance) and the 12-bit counter keeps ids inside one
 * millisecond distinct.
 */
export function buildSnowflake(timestampMs: number): string {
  const ms = Math.max(0, Math.floor(timestampMs) - DISCORD_EPOCH);
  sequence = (sequence + 1) & 0xfff;
  return (
    (BigInt(ms) << 22n) |
    (1n << 17n) |
    (0n << 12n) |
    BigInt(sequence)
  ).toString();
}

/** The millisecond a snowflake encodes, for `createdTimestamp` parity. */
export function snowflakeTimestamp(snowflake: string): number {
  try {
    return Number(BigInt(snowflake) >> 22n) + DISCORD_EPOCH;
  } catch {
    return DISCORD_EPOCH;
  }
}

export function isSnowflake(value: string): boolean {
  return /^\d{1,20}$/.test(value);
}

function parseTimestamp(createdAt?: string | null): number {
  if (!createdAt) return Date.now();
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Returns the snowflake for a native id, allocating one on first sight.
 *
 * `createdAt` only matters for that first allocation: it is what makes the
 * snowflake sort correctly against its siblings. Pass the row's real
 * `created_at` whenever the caller already has it.
 */
export async function snowflakeFor(
  kind: SnowflakeKind,
  nativeId: string,
  createdAt?: string | null,
): Promise<string> {
  const key = cacheKey(kind, nativeId);
  const cached = toSnowflake.get(key);
  if (cached) return cached;

  const db = bindings().DB;
  if (!db) {
    // No database (unit tests, a misconfigured worker): stay deterministic
    // within the isolate so a single request is at least self-consistent.
    const id = buildSnowflake(parseTimestamp(createdAt));
    remember(id, kind, nativeId);
    return id;
  }

  const existing = await db
    .prepare("SELECT snowflake FROM discord_ids WHERE kind = ? AND native_id = ? LIMIT 1")
    .bind(kind, nativeId)
    .first<{ snowflake: string }>();
  if (existing?.snowflake) {
    remember(existing.snowflake, kind, nativeId);
    return existing.snowflake;
  }

  const allocated = buildSnowflake(parseTimestamp(createdAt));
  try {
    await db
      .prepare(
        "INSERT INTO discord_ids (snowflake, kind, native_id, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(allocated, kind, nativeId, new Date().toISOString())
      .run();
    remember(allocated, kind, nativeId);
    return allocated;
  } catch {
    // Another request allocated it between our SELECT and INSERT; theirs won.
    const raced = await db
      .prepare("SELECT snowflake FROM discord_ids WHERE kind = ? AND native_id = ? LIMIT 1")
      .bind(kind, nativeId)
      .first<{ snowflake: string }>();
    const winner = raced?.snowflake || allocated;
    remember(winner, kind, nativeId);
    return winner;
  }
}

/** Resolves a snowflake a bot sent us back to the native id it stands for. */
export async function nativeFor(
  kind: SnowflakeKind,
  snowflake: string,
): Promise<string | null> {
  // Bots routinely echo ids that were never snowflakes (a bridge config naming
  // "general" directly), and accepting those keeps hand-written scripts working.
  if (!isSnowflake(snowflake)) return snowflake;

  const cached = toNative.get(snowflake);
  if (cached) return cached.kind === kind ? cached.nativeId : null;

  const db = bindings().DB;
  if (!db) return null;

  const row = await db
    .prepare("SELECT kind, native_id FROM discord_ids WHERE snowflake = ? LIMIT 1")
    .bind(snowflake)
    .first<{ kind: SnowflakeKind; native_id: string }>();
  if (!row) return null;
  remember(snowflake, row.kind, row.native_id);
  return row.kind === kind ? row.native_id : null;
}

/** Resolves without caring which kind it is, for polymorphic routes. */
export async function nativeForAny(
  snowflake: string,
): Promise<{ kind: SnowflakeKind; nativeId: string } | null> {
  if (!isSnowflake(snowflake)) return null;
  const cached = toNative.get(snowflake);
  if (cached) return cached;

  const db = bindings().DB;
  if (!db) return null;
  const row = await db
    .prepare("SELECT kind, native_id FROM discord_ids WHERE snowflake = ? LIMIT 1")
    .bind(snowflake)
    .first<{ kind: SnowflakeKind; native_id: string }>();
  if (!row) return null;
  remember(snowflake, row.kind, row.native_id);
  return { kind: row.kind, nativeId: row.native_id };
}

/**
 * Resolves many ids of one kind in a single query. READY and GUILD_CREATE both
 * serialize whole collections, where per-id lookups dominate the response time.
 */
export async function snowflakesFor(
  kind: SnowflakeKind,
  rows: Array<{ id: string; created_at?: string | null }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: Array<{ id: string; created_at?: string | null }> = [];

  for (const row of rows) {
    const cached = toSnowflake.get(cacheKey(kind, row.id));
    if (cached) result.set(row.id, cached);
    else missing.push(row);
  }
  if (!missing.length) return result;

  const db = bindings().DB;
  if (!db) {
    for (const row of missing) {
      const id = buildSnowflake(parseTimestamp(row.created_at));
      remember(id, kind, row.id);
      result.set(row.id, id);
    }
    return result;
  }

  // SQLite caps variables per statement; stay well inside it.
  for (let i = 0; i < missing.length; i += 80) {
    const slice = missing.slice(i, i + 80);
    const placeholders = slice.map(() => "?").join(",");
    const found = await db
      .prepare(
        `SELECT snowflake, native_id FROM discord_ids
         WHERE kind = ? AND native_id IN (${placeholders})`,
      )
      .bind(kind, ...slice.map((r) => r.id))
      .all<{ snowflake: string; native_id: string }>();
    for (const row of found.results || []) {
      remember(row.snowflake, kind, row.native_id);
      result.set(row.native_id, row.snowflake);
    }
  }

  // Whatever is still unseen gets allocated now, one INSERT per new id.
  for (const row of missing) {
    if (result.has(row.id)) continue;
    result.set(row.id, await snowflakeFor(kind, row.id, row.created_at));
  }
  return result;
}

function remember(snowflake: string, kind: SnowflakeKind, nativeId: string): void {
  toSnowflake.set(cacheKey(kind, nativeId), snowflake);
  toNative.set(snowflake, { kind, nativeId });
}

/** Test seam: the isolate memo outlives a swapped-in test database. */
export function resetSnowflakeCache(): void {
  toSnowflake.clear();
  toNative.clear();
}
