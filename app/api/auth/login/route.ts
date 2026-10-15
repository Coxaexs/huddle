import {
  createSession,
  hashPassword,
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
 * Three buckets, none of which lets a stranger lock someone else out:
 *  - IP + username: ten tries per five minutes for one person on one account.
 *    Keyed on both, so hammering a victim's name from elsewhere spends the
 *    attacker's own budget and never the victim's.
 *  - IP alone: a host spraying many accounts.
 *  - Username alone, but only as a very high backstop against a botnet that
 *    rotates addresses on one account; ordinary guessing never reaches it.
 */
const LOGIN_RATE_LIMIT = { limit: 10, windowSeconds: 300 } as const;
const LOGIN_IP_RATE_LIMIT = { limit: 40, windowSeconds: 300 } as const;
const LOGIN_ACCOUNT_BACKSTOP = { limit: 300, windowSeconds: 3600 } as const;

let dummyHash: Promise<string> | null = null;

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
  const ip = clientIp(request);
  const results = await Promise.all([
    checkRateLimit({ db, action: "login-ip", key: ip, ...LOGIN_IP_RATE_LIMIT }),
    checkRateLimit({
      db,
      action: "login-ip-user",
      key: attemptKey(ip, username),
      ...LOGIN_RATE_LIMIT,
    }),
    checkRateLimit({
      db,
      action: "login-user",
      key: attemptKey(username),
      ...LOGIN_ACCOUNT_BACKSTOP,
    }),
  ]);
  if (results.some((result) => !result.allowed)) {
    return new RateLimitError(
      Math.max(...results.map((result) => result.retryAfter)),
    ).response();
  }

  const row = await db
    .prepare(
      `SELECT ${userColumns()}, password_hash FROM users WHERE username_lower = ?`,
    )
    .bind(username)
    .first<User & { password_hash: string }>();

  // Same reply either way so the form cannot be used to enumerate usernames,
  // and an unknown name still pays for one hash so the timing matches too.
  if (!row) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(password, await dummyHash);
  }
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return Response.json(
      { error: "That username and password do not match." },
      { status: 401 },
    );
  }

  if (row.suspended_at) {
    return Response.json(
      { error: "This account has been suspended. Ask an admin if you think that's a mistake." },
      { status: 403 },
    );
  }

  await touchUser(db, row.id);
  const token = await createSession(db, row.id);
  return Response.json(
    { user: publicUser(row) },
    { headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
