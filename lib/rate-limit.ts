/**
 * Fixed-window rate limiting backed by D1.
 *
 * A per-isolate in-memory counter would reset on every deploy and would not be
 * shared if Hoffle ever runs more than one isolate, so the counter lives in the
 * database instead. Costs one upsert per limited request, which is cheap next
 * to the PBKDF2 verification these routes already do.
 *
 * The window is fixed rather than sliding: a caller can make `limit` requests
 * at the end of one window and `limit` more at the start of the next, so the
 * worst case is 2x `limit` in a short burst. That is an acceptable trade for
 * not keeping a request log, and it still stops the offline password-guessing
 * that this exists to blunt.
 */

export interface RateLimitRule {
  /** Bucket name, e.g. `login`. Kept in the key so buckets never share a budget. */
  action: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window, never negative. */
  remaining: number;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfter: number;
  /** Requests still allowed in this window including this one. */
  limit: number;
}

/** Thrown by `enforceRateLimit` so a route can turn it into one consistent reply. */
export class RateLimitError extends Error {
  readonly retryAfter: number;
  readonly status = 429;

  constructor(retryAfter: number) {
    super("Too many attempts. Please wait and try again.");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }

  /** Standard 429 response, including `Retry-After` so clients can back off. */
  response(): Response {
    return Response.json(
      { error: this.message, retryAfter: this.retryAfter },
      {
        status: this.status,
        headers: { "retry-after": String(this.retryAfter) },
      },
    );
  }
}

/**
 * Identifies the caller for limiting purposes.
 *
 * Prefers `CF-Connecting-IP` (set by Cloudflare and not spoofable from the
 * client), then the first hop of `x-forwarded-for` as nginx writes it. Falls
 * back to a constant so a misconfigured proxy degrades to a *global* limit
 * rather than to no limit at all — failing closed is the point here.
 */
export function clientIp(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  return "unknown";
}

/** Normalizes a username so `Alice` and `alice` share one bucket. */
export function attemptKey(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(":");
}

/** Rows older than this are pruned opportunistically. */
const RETENTION_SECONDS = 24 * 60 * 60;

export interface CheckRateLimitOptions extends RateLimitRule {
  db: D1Database;
  /** Bucket discriminator, usually the client IP or `ip:username`. */
  key: string;
  /** Injectable clock, in epoch milliseconds, for tests. */
  now?: number;
}

/**
 * Counts one attempt against `key` and reports whether it is allowed.
 *
 * The read-modify-write happens inside a single upsert with `RETURNING`, so two
 * simultaneous requests cannot both read the same count and each decide they are
 * under the limit.
 */
export async function checkRateLimit(
  options: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  const now = options.now ?? Date.now();
  const windowMs = options.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const bucket = `${options.action}:${options.key}`;

  const row = await options.db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE
             WHEN rate_limits.window_start = ?2 THEN rate_limits.count + 1
             ELSE 1
           END,
           window_start = ?2
       RETURNING count`,
    )
    .bind(bucket, windowStart)
    .first<{ count: number }>();

  const count = row?.count ?? 1;

  // A brand new window means this key just expired; a good moment to drop rows
  // nothing is counting against any more. Keeps the table from growing without
  // ever running a scan on the hot path.
  if (count === 1) {
    await pruneRateLimits(options.db, now).catch(() => {});
  }

  if (count > options.limit) {
    const resetAt = windowStart + windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      limit: options.limit,
    };
  }

  return {
    allowed: true,
    remaining: options.limit - count,
    retryAfter: 0,
    limit: options.limit,
  };
}

/** Deletes counters whose window closed longer than `RETENTION_SECONDS` ago. */
export async function pruneRateLimits(
  db: D1Database,
  now: number = Date.now(),
): Promise<void> {
  await db
    .prepare("DELETE FROM rate_limits WHERE window_start < ?")
    .bind(now - RETENTION_SECONDS * 1000)
    .run();
}


/** Per-user budgets for write routes that anyone signed in can hammer. */
export const WRITE_RATE_LIMITS = {
  upload: { action: "upload", limit: 30, windowSeconds: 60 },
  message: { action: "message", limit: 30, windowSeconds: 10 },
} satisfies Record<string, RateLimitRule>;

/**
 * Counts one request for a signed-in user and returns a ready 429 when they are
 * over budget, or null to carry on. Keyed by user rather than IP so people
 * sharing a network do not share a budget.
 */
export async function limitUser(
  db: D1Database | undefined,
  rule: RateLimitRule,
  userId: string,
): Promise<Response | null> {
  if (!db) return null;
  const result = await checkRateLimit({ db, key: userId, ...rule });
  return result.allowed ? null : new RateLimitError(result.retryAfter).response();
}
