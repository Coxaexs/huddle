import {
  createSession,
  publicUser,
  sessionCookie,
  touchUser,
  userColumns,
  verifyPassword,
  type User,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  attemptKey,
  checkRateLimit,
  clientIp,
  RateLimitError,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Guessing-friendly windows: the budget is per IP *and* per username, so one
 * attacker cannot lock a victim out by hammering their name from elsewhere, and
 * a botnet cannot evade the limit by spreading across IPs for one account.
 */
const LOGIN_RATE_LIMIT = { limit: 10, windowSeconds: 300 } as const;

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username || "").trim().toLowerCase();
  const password = body.password || "";
  if (!username || !password) {
    return Response.json(
      { error: "Enter your username and password." },
      { status: 400 },
    );
  }

  // Throttle before touching PBKDF2, so guessing is expensive for the attacker
  // and cheap for us. Both buckets are counted: the IP one stops a single host
  // spraying many accounts, the username one stops one account being ground
  // down from a rotating set of addresses.
  const [byIp, byUser] = await Promise.all([
    checkRateLimit({
      db,
      action: "login-ip",
      key: clientIp(request),
      ...LOGIN_RATE_LIMIT,
    }),
    checkRateLimit({
      db,
      action: "login-user",
      key: attemptKey(username),
      ...LOGIN_RATE_LIMIT,
    }),
  ]);
  if (!byIp.allowed || !byUser.allowed) {
    return new RateLimitError(Math.max(byIp.retryAfter, byUser.retryAfter)).response();
  }

  const row = await db
    .prepare(
      `SELECT ${userColumns()}, password_hash FROM users WHERE username_lower = ?`,
    )
    .bind(username)
    .first<User & { password_hash: string }>();

  // Same reply either way so the form cannot be used to enumerate usernames.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return Response.json(
      { error: "That username and password do not match." },
      { status: 401 },
    );
  }

  await touchUser(db, row.id);
  const token = await createSession(db, row.id);
  return Response.json(
    { user: publicUser(row) },
    { headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
