import { currentUser, isInstanceAdmin, unauthorized, type User } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

/** The signed-in instance admin and the database, or the response to send instead. */
export async function requireInstanceAdmin(
  request: Request,
): Promise<{ user: User; db: D1Database } | { response: Response }> {
  const db = bindings().DB;
  if (!db) return { response: Response.json({ error: "Database not connected." }, { status: 503 }) };
  const user = await currentUser(request);
  if (!user) return { response: unauthorized() };
  if (!isInstanceAdmin(user)) {
    return { response: Response.json({ error: "Only instance admins can open this panel." }, { status: 403 }) };
  }
  await ensureSchema(db);
  return { user, db };
}
