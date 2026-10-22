import { currentUser, hashPassword, normalizeEmail, publicUser, unauthorized, validatePassword, validateUsername } from "@/lib/auth";
import { emailCodeLimit, startEmailVerification } from "@/lib/email-verify";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * A guest (app/api/auth/guest) saves their account: a username and password of
 * their own, and optionally an email. From then on it is an ordinary account,
 * restricted for its first day like any new open signup.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  const user = await currentUser(request);
  if (!user) return unauthorized();
  if (user.signup_source !== "guest") return Response.json({ error: "This account is already saved." }, { status: 400 });

  const limited = await checkRateLimit({ db, action: "guest-claim", key: user.id, limit: 10, windowSeconds: 600 });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string; email?: string };
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const usernameError = validateUsername(username);
  if (usernameError) return Response.json({ error: usernameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  let email: string | null = null;
  if (String(body.email || "").trim()) {
    const parsed = normalizeEmail(body.email);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });
    email = parsed.email;
  }

  const taken = await db
    .prepare("SELECT id FROM users WHERE username_lower = ? AND id != ?")
    .bind(username.toLowerCase(), user.id)
    .first();
  if (taken) return Response.json({ error: "That username is taken." }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const updated = await db
    .prepare(
      "UPDATE OR IGNORE users SET username = ?, username_lower = ?, password_hash = ?, signup_source = 'open' WHERE id = ? AND signup_source = 'guest'",
    )
    .bind(username, username.toLowerCase(), passwordHash, user.id)
    .run();
  if (!updated.meta.changes) return Response.json({ error: "That username is taken." }, { status: 409 });

  const saved = { ...user, username, signup_source: "open" };
  let pendingEmail: string | null = null;
  if (email && !(await emailCodeLimit(db, request, user.id, email))) {
    await startEmailVerification(db, saved, email);
    pendingEmail = email;
  }
  return Response.json({ user: publicUser(saved), pendingEmail });
}
