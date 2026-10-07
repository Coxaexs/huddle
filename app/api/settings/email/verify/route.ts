import { currentUser, publicUser, unauthorized } from "@/lib/auth";
import { checkEmailCode } from "@/lib/email-verify";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Saves the pending address once the code mailed to it is typed back. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  await ensureSchema(db);
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const checked = await checkEmailCode(db, user.id, body.code);
  if ("error" in checked) {
    return Response.json({ error: checked.error }, { status: checked.status });
  }

  await db
    .prepare("UPDATE users SET email = ? WHERE id = ?")
    .bind(checked.email, user.id)
    .run();
  // Any reset link already mailed went to the old address.
  await db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();

  return Response.json({ user: publicUser({ ...user, email: checked.email }) });
}
