import {
  currentUser,
  normalizeEmail,
  publicUser,
  unauthorized,
  verifyPassword,
} from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Adds or changes the account's email. The current password is required, since
 * whoever controls the email can reset the password.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const parsed = normalizeEmail(body.email);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const row = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(user.id)
    .first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(body.password || "", row.password_hash))) {
    return Response.json({ error: "Your password is not right." }, { status: 403 });
  }

  const taken = await db
    .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
    .bind(parsed.email, user.id)
    .first();
  if (taken) {
    return Response.json({ error: "Another account already uses that email." }, { status: 409 });
  }

  await db
    .prepare("UPDATE users SET email = ? WHERE id = ?")
    .bind(parsed.email, user.id)
    .run();
  // Any reset link already mailed went to the old address.
  await db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();

  return Response.json({ user: publicUser({ ...user, email: parsed.email }) });
}
