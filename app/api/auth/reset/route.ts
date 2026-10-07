import {
  createSession,
  hashPassword,
  publicUser,
  sessionCookie,
  sha256,
  userColumns,
  validatePassword,
  type User,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { checkRateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Spends a reset link: sets the new password, signs out everywhere, signs in here. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  await ensureSchema(db);

  const limited = await checkRateLimit({
    db,
    action: "reset-ip",
    key: clientIp(request),
    limit: 10,
    windowSeconds: 900,
  });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const password = body.password || "";
  const invalid = validatePassword(password);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  // Claim the link in one DELETE so it can only ever be used once.
  const claimed = await db
    .prepare("DELETE FROM password_resets WHERE token_hash = ? RETURNING user_id, expires_at")
    .bind(await sha256(body.token || ""))
    .first<{ user_id: string; expires_at: string }>();
  if (!claimed || new Date(claimed.expires_at).getTime() < Date.now()) {
    return Response.json(
      { error: "This reset link has expired or was already used. Ask for a new one." },
      { status: 400 },
    );
  }

  await db.batch([
    db
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(await hashPassword(password), claimed.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(claimed.user_id),
  ]);

  const user = await db
    .prepare(`SELECT ${userColumns()} FROM users WHERE id = ?`)
    .bind(claimed.user_id)
    .first<User>();
  if (!user) return Response.json({ error: "That account no longer exists." }, { status: 404 });

  const token = await createSession(db, user.id);
  return Response.json(
    { user: publicUser(user) },
    { headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
