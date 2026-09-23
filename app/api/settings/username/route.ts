import {
  currentUser,
  publicUser,
  unauthorized,
  validateUsername,
  verifyPassword,
} from "@/lib/auth";
import { publishStructureChange } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Change your username. Needs your password, since the username is what you
 * sign in with. Mentions and DMs are stored by user id, so nothing else breaks.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username || "").trim();
  const invalid = validateUsername(username);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  if (username === user.username) {
    return Response.json({ error: "That is already your username." }, { status: 400 });
  }

  const row = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(body.password || "", row.password_hash))) {
    return Response.json(
      { error: "Your password is not right." },
      { status: 403 },
    );
  }

  const lower = username.toLowerCase();
  // A change of capitalisation only is always allowed; otherwise the name must be free.
  if (lower !== user.username.toLowerCase()) {
    const taken = await db
      .prepare("SELECT id FROM users WHERE username_lower = ?")
      .bind(lower)
      .first();
    if (taken) {
      return Response.json({ error: "That username is taken." }, { status: 409 });
    }
  }

  try {
    await db.batch([
      db
        .prepare("UPDATE users SET username = ?, username_lower = ? WHERE id = ?")
        .bind(username, lower, user.id),
      db
        .prepare("UPDATE custom_themes SET creator_username = ? WHERE created_by = ?")
        .bind(username, user.id),
    ]);
  } catch {
    // The UNIQUE index caught a signup or rename that landed in between.
    return Response.json({ error: "That username is taken." }, { status: 409 });
  }

  await publishStructureChange();
  return Response.json({ user: publicUser({ ...user, username }) });
}
