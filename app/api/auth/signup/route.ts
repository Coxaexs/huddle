import { markServerRead } from "@/lib/servers";
import {
  AVATAR_COLORS,
  createSession,
  hashPassword,
  normalizeEmail,
  publicUser,
  sessionCookie,
  validatePassword,
  validateUsername,
  type User,
} from "@/lib/auth";
import { emailCodeLimit, startEmailVerification } from "@/lib/email-verify";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { checkRateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Signup is the one endpoint where an unauthenticated caller makes us spend CPU
 * on a password hash *and* consumes a scarce resource (an invite use), so it is
 * throttled harder than login. Still loose enough for a group signing up from
 * one place (a house, a school, a venue's Wi-Fi) with a shared event code:
 * every attempt needs a valid invite anyway.
 */
const SIGNUP_RATE_LIMIT = { limit: 20, windowSeconds: 600 } as const;

interface SignupBody {
  username?: string;
  password?: string;
  email?: string;
  displayName?: string;
  invite?: string;
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as SignupBody;

  // Count the attempt before doing any work: this route hashes a password even
  // when the invite code turns out to be invalid.
  const limited = await checkRateLimit({
    db,
    action: "signup-ip",
    key: clientIp(request),
    ...SIGNUP_RATE_LIMIT,
  });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const username = (body.username || "").trim();
  const password = body.password || "";
  const displayName = (body.displayName || "").trim().slice(0, 40) || username;

  const usernameError = validateUsername(username);
  if (usernameError) return Response.json({ error: usernameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  // Email is optional. When given it is only mailed a code; it lands on the
  // account once that code is typed back, so nobody can claim someone else's.
  let email: string | null = null;
  if ((body.email || "").trim()) {
    const parsedEmail = normalizeEmail(body.email);
    if ("error" in parsedEmail) return Response.json({ error: parsedEmail.error }, { status: 400 });
    email = parsedEmail.email;
  }

  const total = await db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first<{ count: number }>();
  const isFirstUser = (total?.count ?? 0) === 0;

  const inviteCode = (body.invite || "").trim().toUpperCase();
  let defaultTheme: string | null = null;
  let defaultServerId: string | null = null;

  // Huddle is on the public internet, so the very first signup can be gated
  // too: set BOOTSTRAP_CODE and nobody can claim the place before you do.
  const bootstrapCode = bindings().BOOTSTRAP_CODE?.trim().toUpperCase();
  if (isFirstUser && bootstrapCode && inviteCode !== bootstrapCode) {
    return Response.json(
      { error: "This Huddle is waiting for its owner's setup code." },
      { status: 403 },
    );
  }

  // Every account after the first needs an invite code.
  if (!isFirstUser) {
    if (!inviteCode) {
      return Response.json(
        { error: "An invite code is required to join this Huddle." },
        { status: 403 },
      );
    }
    const invite = await db
      .prepare(
        "SELECT code, server_id, max_uses, uses, revoked, default_theme, default_server_id FROM invites WHERE code = ?",
      )
      .bind(inviteCode)
      .first<{
        code: string;
        server_id: string | null;
        max_uses: number;
        uses: number;
        revoked: number;
        default_theme: string | null;
        default_server_id: string | null;
      }>();
    if (
      !invite ||
      invite.revoked ||
      (invite.max_uses > 0 && invite.uses >= invite.max_uses)
    ) {
      return Response.json(
        { error: "That invite code is not valid any more." },
        { status: 403 },
      );
    }
    if (invite.server_id != null && invite.server_id !== "") {
      return Response.json(
        {
          error:
            "Server invite codes cannot be used to create an account. You need an account invite code.",
        },
        { status: 403 },
      );
    }
    defaultTheme = invite.default_theme || null;
    defaultServerId = invite.default_server_id || null;
  }

  const taken = await db
    .prepare("SELECT id FROM users WHERE username_lower = ?")
    .bind(username.toLowerCase())
    .first();
  if (taken) {
    return Response.json({ error: "That username is taken." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const user: User = {
    id: crypto.randomUUID(),
    username,
    display_name: displayName,
    avatar: displayName.slice(0, 1).toUpperCase() || "H",
    color: AVATAR_COLORS[(total?.count ?? 0) % AVATAR_COLORS.length],
    is_admin: isFirstUser ? 1 : 0,
    can_invite: isFirstUser ? 1 : 0,
    created_at: now,
    last_seen_at: now,
    email: null,
  };

  // Claim the invite in one conditional UPDATE, so simultaneous signups can't
  // all read "1 use left" and each spend it.
  if (!isFirstUser) {
    const claimed = await db
      .prepare(
        `UPDATE invites SET uses = uses + 1
          WHERE code = ? AND revoked = 0 AND (max_uses <= 0 OR uses < max_uses)`,
      )
      .bind(inviteCode)
      .run();
    if (!claimed.meta.changes) {
      return Response.json(
        { error: "That invite code is not valid any more." },
        { status: 403 },
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO users
         (id, username, username_lower, display_name, password_hash, email, avatar, color, is_admin, can_invite, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.username,
      user.username.toLowerCase(),
      user.display_name,
      passwordHash,
      null,
      user.avatar,
      user.color,
      user.is_admin,
      user.can_invite,
      now,
      now,
    )
    .run();
  if (!inserted.meta.changes) {
    // Someone took the username (or email) between the check above and this insert.
    if (!isFirstUser) {
      await db.prepare("UPDATE invites SET uses = uses - 1 WHERE code = ?").bind(inviteCode).run();
    }
    return Response.json({ error: "That username is taken." }, { status: 409 });
  }

  // New accounts start with no servers unless the invite picked one.
  if (defaultServerId) {
    const server = await db
      .prepare("SELECT id FROM servers WHERE id = ?")
      .bind(defaultServerId)
      .first();
    if (server) {
      await db
        .prepare(
          "INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)",
        )
        .bind(defaultServerId, user.id, new Date().toISOString())
        .run();
      await markServerRead(db, defaultServerId, user.id);
    }
  }

  // Over the mail limit the account still exists; the address can be added
  // later from the email prompt.
  let pendingEmail: string | null = null;
  if (email && !(await emailCodeLimit(db, request, user.id, email))) {
    await startEmailVerification(db, user, email);
    pendingEmail = email;
  }

  const token = await createSession(db, user.id);
  return Response.json(
    { user: publicUser(user), defaultTheme, pendingEmail },
    { status: 201, headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
