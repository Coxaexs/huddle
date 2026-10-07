import {
  currentUser,
  normalizeEmail,
  unauthorized,
  verifyPassword,
} from "@/lib/auth";
import { emailCodeLimit, pendingEmail, startEmailVerification } from "@/lib/email-verify";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";


/** The address waiting for its code, if any. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  await ensureSchema(db);
  const user = await currentUser(request);
  if (!user) return unauthorized();
  return Response.json({ pending: await pendingEmail(db, user.id) });
}

/**
 * Starts adding or changing the account's email. The current password is
 * required, since whoever controls the email can reset the password, and the
 * address is only saved once the code mailed to it comes back (see ./verify).
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  }
  await ensureSchema(db);
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

  const limited = await emailCodeLimit(db, request, user.id, parsed.email);
  if (limited) return limited;

  await startEmailVerification(db, user, parsed.email);
  return Response.json({ pending: parsed.email });
}
