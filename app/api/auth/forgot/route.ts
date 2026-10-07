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

  // An address can sit on several accounts. They all get a link, sent as one
  // mail per address so its owner picks which account to reset.
  const { results: users } = await db
    .prepare(
      "SELECT id, username, email FROM users WHERE (username_lower = ? OR email = ?) AND email IS NOT NULL ORDER BY username_lower LIMIT 10",
    )
    .bind(identifier, identifier)
    .all<{ id: string; username: string; email: string }>();

  const linksByEmail = new Map<string, Array<{ username: string; link: string }>>();
  for (const user of users) {
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
    const links = linksByEmail.get(user.email) ?? [];
    links.push({ username: user.username, link: `${publicBase(request)}/?reset=${token}` });
    linksByEmail.set(user.email, links);
  }

  for (const [email, links] of linksByEmail) {
    const ignore = "If that wasn't you, ignore this mail; nothing changes.";
    const text =
      links.length === 1
        ? `Hi @${links[0].username},\n\n` +
          `Someone asked to reset the password for your Hoffle account. ` +
          `Open this link within ${RESET_TTL_MINUTES} minutes to choose a new one:\n\n${links[0].link}\n\n${ignore}`
        : `Hi,\n\n` +
          `Someone asked to reset a Hoffle password for this address, which is used by ` +
          `${links.length} accounts. Open the link for the account you want to reset ` +
          `within ${RESET_TTL_MINUTES} minutes:\n\n` +
          links.map(({ username, link }) => `@${username}\n${link}`).join("\n\n") +
          `\n\nThe other accounts keep their passwords. ${ignore}`;
    await sendMail({
      to: email,
      subject:
        links.length === 1
          ? `Reset your Hoffle password for @${links[0].username}`
          : "Reset a Hoffle password",
      text,
    });
  }

  return Response.json({ ok: true });
}
