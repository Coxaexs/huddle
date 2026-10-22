import { AVATAR_COLORS, createSession, hashPassword, publicUser, sessionCookie, type User } from "@/lib/auth";
import { checkRateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { markServerRead } from "@/lib/servers";
import { getSignupSettings, OPEN_SIGNUPS_PER_ADDRESS_PER_DAY, signupAddressHash, verifyTurnstile } from "@/lib/signup";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Joining a server from its invite link with just a name: no username, no
 * password. The account is real but marked as a guest (signup_source
 * "guest", restricted like a brand-new account) until its owner saves it
 * with /api/auth/claim. Same gates as an open signup: open signup on, a valid
 * server invite, the robot check, and the per-network daily cap.
 */
const GUEST_RATE_LIMIT = { limit: 20, windowSeconds: 600 } as const;

/** A name to show: trimmed, single-spaced, 1 to 32 characters. */
function cleanName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 32);
}

const denied = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return denied(503, "Message storage is not connected.");
  await ensureSchema(db);

  const limited = await checkRateLimit({ db, action: "signup-ip", key: clientIp(request), ...GUEST_RATE_LIMIT });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    invite?: string;
    agreed?: boolean;
    turnstileToken?: string;
  };
  const displayName = cleanName(body.displayName);
  if (!displayName) return denied(400, "Pick the name your friends will see.");
  if (body.agreed !== true) return denied(400, "Agree to the Terms of Use and Privacy Policy first.");

  const settings = await getSignupSettings(db);
  if (!settings.open) return denied(403, "Quick join isn't on here. Ask your friend for an account invite.");

  const code = String(body.invite || "").trim().toUpperCase();
  const invite = code
    ? await db
        .prepare("SELECT code, server_id, max_uses, uses, revoked FROM invites WHERE code = ?")
        .bind(code)
        .first<{ code: string; server_id: string | null; max_uses: number; uses: number; revoked: number }>()
    : null;
  if (!invite || invite.revoked || !invite.server_id || (invite.max_uses > 0 && invite.uses >= invite.max_uses)) {
    return denied(403, "That invite link isn't valid any more. Ask for a new one.");
  }
  if (!(await verifyTurnstile(body.turnstileToken, request))) {
    return denied(403, "Confirm you are not a robot and try again.");
  }
  const addressHash = await signupAddressHash(request);
  if (addressHash) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const recent = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM users WHERE signup_ip_hash = ? AND signup_source IN ('open', 'guest') AND created_at > ?",
      )
      .bind(addressHash, since)
      .first<{ count: number }>();
    if ((recent?.count ?? 0) >= OPEN_SIGNUPS_PER_ADDRESS_PER_DAY) {
      return denied(429, "Too many accounts were made from this network today. Try again tomorrow.");
    }
  }
  const server = await db
    .prepare("SELECT id, name FROM servers WHERE id = ?")
    .bind(invite.server_id)
    .first<{ id: string; name: string }>();
  if (!server) return denied(404, "That server is gone.");

  // Nobody knows this password: a guest gets back in with their session, or
  // saves the account with a password of their own.
  const passwordHash = await hashPassword(`${crypto.randomUUID()}${crypto.randomUUID()}`);

  const claimed = await db
    .prepare("UPDATE invites SET uses = uses + 1 WHERE code = ? AND revoked = 0 AND (max_uses <= 0 OR uses < max_uses)")
    .bind(code)
    .run();
  if (!claimed.meta.changes) return denied(403, "That invite link isn't valid any more. Ask for a new one.");

  const total = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  const now = new Date().toISOString();
  let user: User | null = null;
  for (let attempt = 0; attempt < 4 && !user; attempt++) {
    const username = `guest-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const candidate: User = {
      id: crypto.randomUUID(),
      username,
      display_name: displayName,
      avatar: displayName.slice(0, 1).toUpperCase() || "H",
      color: AVATAR_COLORS[(total?.count ?? 0) % AVATAR_COLORS.length],
      is_admin: 0,
      can_invite: 0,
      created_at: now,
      last_seen_at: now,
      email: null,
      signup_source: "guest",
    };
    const inserted = await db
      .prepare(
        `INSERT OR IGNORE INTO users
           (id, username, username_lower, display_name, password_hash, email, avatar, color, is_admin, can_invite, created_at, last_seen_at, signup_source, signup_ip_hash)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, 0, ?, ?, 'guest', ?)`,
      )
      .bind(candidate.id, username, username, displayName, passwordHash, candidate.avatar, candidate.color, now, now, addressHash)
      .run()
      .catch(() => null);
    if (inserted?.meta.changes) user = candidate;
  }
  if (!user) {
    await db.prepare("UPDATE invites SET uses = uses - 1 WHERE code = ? AND uses > 0").bind(code).run().catch(() => {});
    return denied(500, "Couldn't make your guest account. Try again.");
  }

  await db
    .prepare("INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)")
    .bind(server.id, user.id, now)
    .run();
  await markServerRead(db, server.id, user.id);

  const token = await createSession(db, user.id, request);
  return Response.json(
    { user: publicUser(user), server },
    { status: 201, headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
