/**
 * Proving an address before it lands on an account. Whoever owns an account's
 * email can reset its password, so an address is only saved once its owner
 * types back the code we mailed to it. Only a hash of the code is kept.
 */

import { sha256 } from "./auth";
import { sendMail } from "./mail";
import { checkRateLimit, clientIp, RateLimitError } from "./rate-limit";

export const EMAIL_CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;

/**
 * Each code is a Resend mail, so cap how many one IP or account can trigger,
 * and how many one inbox can receive however many IPs are asking.
 */
const SEND_RATE_LIMIT = { limit: 5, windowSeconds: 3600 } as const;
const RECIPIENT_DAILY_LIMIT = { limit: 10, windowSeconds: 86_400 } as const;

/** Counts one code mail; returns a 429 response when the IP, account or inbox is over. */
export async function emailCodeLimit(
  db: D1Database,
  request: Request,
  userId: string,
  email: string,
): Promise<Response | null> {
  const results = await Promise.all([
    checkRateLimit({ db, action: "email-code-ip", key: clientIp(request), ...SEND_RATE_LIMIT }),
    checkRateLimit({ db, action: "email-code-user", key: userId, ...SEND_RATE_LIMIT }),
    checkRateLimit({ db, action: "email-code-to", key: email, ...SEND_RATE_LIMIT }),
    checkRateLimit({ db, action: "email-code-to-day", key: email, ...RECIPIENT_DAILY_LIMIT }),
  ]);
  if (results.every((result) => result.allowed)) return null;
  return new RateLimitError(Math.max(...results.map((result) => result.retryAfter))).response();
}

function codeHash(userId: string, email: string, code: string): Promise<string> {
  return sha256(`${userId}:${email}:${code}`);
}

/** Mails a fresh 6-digit code to `email`, replacing any earlier pending one. */
export async function startEmailVerification(
  db: D1Database,
  user: { id: string; username: string },
  email: string,
): Promise<void> {
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  const code = digits.toString().padStart(6, "0");
  const now = new Date();
  await db
    .prepare(
      `INSERT OR REPLACE INTO email_verifications (user_id, email, code_hash, attempts, created_at, expires_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      user.id,
      email,
      await codeHash(user.id, email, code),
      now.toISOString(),
      new Date(now.getTime() + EMAIL_CODE_TTL_MINUTES * 60_000).toISOString(),
    )
    .run();
  await sendMail({
    to: email,
    subject: `${code} is your Hoffle verification code`,
    text:
      `Hi @${user.username},\n\n` +
      `Enter this code in Hoffle to add this address to your account:\n\n    ${code}\n\n` +
      `It works for ${EMAIL_CODE_TTL_MINUTES} minutes. If you didn't ask for this, ignore this mail; ` +
      `nothing changes unless the code is entered.`,
  });
}

export async function pendingEmail(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT email FROM email_verifications WHERE user_id = ? AND expires_at > ?")
    .bind(userId, new Date().toISOString())
    .first<{ email: string }>();
  return row?.email ?? null;
}

/** Checks a code; on success returns the verified address and clears the pending row. */
export async function checkEmailCode(
  db: D1Database,
  userId: string,
  rawCode: unknown,
): Promise<{ email: string } | { error: string; status: number }> {
  const code = (typeof rawCode === "string" ? rawCode : "").replace(/\s+/g, "");
  const row = await db
    .prepare(
      "SELECT email, code_hash, attempts, expires_at FROM email_verifications WHERE user_id = ?",
    )
    .bind(userId)
    .first<{ email: string; code_hash: string; attempts: number; expires_at: string }>();
  if (!row || row.expires_at <= new Date().toISOString() || row.attempts >= MAX_ATTEMPTS) {
    return { error: "That code has expired. Ask for a new one.", status: 410 };
  }
  if (!/^\d{6}$/.test(code) || (await codeHash(userId, row.email, code)) !== row.code_hash) {
    await db
      .prepare("UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?")
      .bind(userId)
      .run();
    return { error: "That code is not right.", status: 400 };
  }
  await db.prepare("DELETE FROM email_verifications WHERE user_id = ?").bind(userId).run();
  return { email: row.email };
}
