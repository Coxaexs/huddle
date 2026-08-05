import {
  createSession,
  publicUser,
  sessionCookie,
  touchUser,
  verifyPassword,
  type User,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  bumpRateLimit,
  clearRateLimit,
  clientIp,
  tooManyRequests,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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

  // Throttle before doing the expensive PBKDF2 verify. A per-account key stops
  // guessing one login; a coarser per-IP key stops spraying across many.
  const ip = clientIp(request);
  const accountLimit = await bumpRateLimit(db, `login:${ip}:${username}`, 10, 900);
  if (!accountLimit.allowed) return tooManyRequests(accountLimit.retryAfterSeconds);
  const ipLimit = await bumpRateLimit(db, `login-ip:${ip}`, 50, 900);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

  const row = await db
    .prepare(
      `SELECT id, username, display_name, avatar, avatar_url, color, is_admin,
              created_at, last_seen_at, password_hash
         FROM users WHERE username_lower = ?`,
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

  // A genuine login clears its own budget so a fat-fingered password earlier in
  // the day never counts against a legitimate user.
  await clearRateLimit(db, `login:${ip}:${username}`);

  await touchUser(db, row.id);
  const token = await createSession(db, row.id);
  return Response.json(
    { user: publicUser(row) },
    { headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
