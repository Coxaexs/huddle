/**
 * Small fixed-window rate limiter for the auth endpoints.
 *
 * Workers has no shared in-memory store across isolates, so the counter lives
 * in D1 (`auth_rate_limits`, created in schema.ts). Each row is one window:
 * `count` requests until `reset_at` (epoch ms), after which the next hit starts
 * a fresh window. That keeps it self-expiring — no cleanup job.
 *
 * It fails open: any storage error returns "allowed" rather than locking
 * everyone out, since the app is a single self-hosted node and a limiter that
 * can DoS its own login is worse than one that occasionally misses.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets; only meaningful when `!allowed`. */
  retryAfterSeconds: number;
}

/**
 * The real client address. Behind Cloudflare + nginx the socket peer is a proxy,
 * so prefer the forwarded headers, most-trusted first, before falling back.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    (forwarded ? forwarded.split(",")[0]!.trim() : "") ||
    "unknown"
  );
}

/**
 * Count this hit against `key` and report whether it is within `limit` per
 * `windowSeconds`. Every call (allowed or not) counts, so repeated blocked
 * attempts keep the window sliding forward — a caller cannot wait out the clock
 * while still hammering.
 */
export async function bumpRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  try {
    const row = await db
      .prepare("SELECT count, reset_at FROM auth_rate_limits WHERE key = ?")
      .bind(key)
      .first<{ count: number; reset_at: number }>();

    let count: number;
    let resetAt: number;
    if (!row || now >= row.reset_at) {
      count = 1;
      resetAt = now + windowMs;
    } else {
      count = row.count + 1;
      resetAt = row.reset_at;
    }

    await db
      .prepare(
        `INSERT INTO auth_rate_limits (key, count, reset_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`,
      )
      .bind(key, count, resetAt)
      .run();

    if (count > limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Clears a key after a genuine success so a good login resets its own budget. */
export async function clearRateLimit(db: D1Database, key: string): Promise<void> {
  try {
    await db.prepare("DELETE FROM auth_rate_limits WHERE key = ?").bind(key).run();
  } catch {
    // Best-effort; a stale counter just expires on its own.
  }
}

/** 429 body + Retry-After header, shared by the auth routes. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many attempts. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
