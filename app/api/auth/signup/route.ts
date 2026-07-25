import {
  AVATAR_COLORS,
  createSession,
  hashPassword,
  publicUser,
  sessionCookie,
  validatePassword,
  validateUsername,
  type User,
} from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface SignupBody {
  username?: string;
  password?: string;
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
  const username = (body.username || "").trim();
  const password = body.password || "";
  const displayName = (body.displayName || "").trim().slice(0, 40) || username;

  const usernameError = validateUsername(username);
  if (usernameError) return Response.json({ error: usernameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

  const total = await db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first<{ count: number }>();
  const isFirstUser = (total?.count ?? 0) === 0;

  // Every account after the first needs an invite code.
  const inviteCode = (body.invite || "").trim().toUpperCase();
  if (!isFirstUser) {
    if (!inviteCode) {
      return Response.json(
        { error: "An invite code is required to join this Huddle." },
        { status: 403 },
      );
    }
    const invite = await db
      .prepare(
        "SELECT code, max_uses, uses, revoked FROM invites WHERE code = ?",
      )
      .bind(inviteCode)
      .first<{ code: string; max_uses: number; uses: number; revoked: number }>();
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
    created_at: now,
    last_seen_at: now,
  };

  await db
    .prepare(
      `INSERT INTO users
         (id, username, username_lower, display_name, password_hash, avatar, color, is_admin, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.username,
      user.username.toLowerCase(),
      user.display_name,
      await hashPassword(password),
      user.avatar,
      user.color,
      user.is_admin,
      now,
      now,
    )
    .run();

  if (!isFirstUser && inviteCode) {
    await db
      .prepare("UPDATE invites SET uses = uses + 1 WHERE code = ?")
      .bind(inviteCode)
      .run();
  }

  const token = await createSession(db, user.id);
  return Response.json(
    { user: publicUser(user) },
    { status: 201, headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
}
