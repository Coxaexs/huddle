import { randomToken, sha256 } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import {
  attemptKey,
  checkRateLimit,
  clientIp,
  RateLimitError,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const FORGOT_RATE_LIMIT = { limit: 5, windowSeconds: 900 } as const;
const RESET_TTL_MINUTES = 60;

/**
 * Where the reset link should point. PUBLIC_URL wins; otherwise the proxy's
 * forwarded proto/host, since the worker itself only ever sees plain http.
 */
function publicBase(request: Request): string {
  const url = new URL(request.url);
  const base = url.pathname.startsWith("/hangout") ? "/hangout" : "";
  const configured = bindings().PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return `${configured}${base}`;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return `${proto || url.protocol.replace(":", "")}://${host || url.host}${base}`;
}

/**
 * Mails a one-time reset link to the account matching a username or email.
 * The reply is identical whether or not anything matched, so the form cannot
 * be used to find out who has an account or which address they use.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { identifier?: string };
  const identifier = (body.identifier || "").trim().toLowerCase();
  if (!identifier) {
    return Response.json({ error: "Enter your username or email." }, { status: 400 });
  }

  const [byIp, byTarget] = await Promise.all([
    checkRateLimit({ db, action: "forgot-ip", key: clientIp(request), ...FORGOT_RATE_LIMIT }),
    checkRateLimit({ db, action: "forgot-target", key: attemptKey(identifier), ...FORGOT_RATE_LIMIT }),
  ]);
  if (!byIp.allowed || !byTarget.allowed) {
    return new RateLimitError(Math.max(byIp.retryAfter, byTarget.retryAfter)).response();
  }

  const user = await db
    .prepare(
      "SELECT id, username, email FROM users WHERE (username_lower = ? OR email = ?) AND email IS NOT NULL",
    )
    .bind(identifier, identifier)
    .first<{ id: string; username: string; email: string }>();

  if (user) {
    const token = randomToken();
    const now = new Date();
    await db.batch([
      // Only the newest link works.
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id),
      db
        .prepare(
          "INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        )
        .bind(
          await sha256(token),
          user.id,
          now.toISOString(),
          new Date(now.getTime() + RESET_TTL_MINUTES * 60_000).toISOString(),
        ),
    ]);

    const link = `${publicBase(request)}/?reset=${token}`;
    await sendMail({
      to: user.email,
      subject: "Reset your Hoffle password",
      text:
        `Hi @${user.username},\n\n` +
        `Someone asked to reset the password for your Hoffle account. ` +
        `Open this link within ${RESET_TTL_MINUTES} minutes to choose a new one:\n\n${link}\n\n` +
        `If that wasn't you, ignore this mail; your password stays the same.`,
    });
  }

  return Response.json({ ok: true });
}
