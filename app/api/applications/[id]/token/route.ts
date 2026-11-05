import { applicationById, hashAppToken, mintAppToken } from "@/lib/applications";
import { currentUser, isInstanceAdmin, unauthorized } from "@/lib/auth";
import { refreshBotSessions } from "@/lib/discord/dispatch";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const RESET_LIMIT = { action: "application-token", limit: 10, windowSeconds: 3600 };

/** POST: a new token, shown once. The old one stops working straight away. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const limited = await limitUser(db, RESET_LIMIT, user.id);
  if (limited) return limited;

  const app = await applicationById(db, (await context.params).id);
  if (!app || (app.owner_id !== user.id && !isInstanceAdmin(user))) {
    return Response.json({ error: "Bot not found." }, { status: 404 });
  }
  const token = mintAppToken();
  await db
    .prepare("UPDATE applications SET token_hash = ? WHERE id = ?")
    .bind(await hashAppToken(token), app.id)
    .run();
  await refreshBotSessions(app.id);
  return Response.json({ token });
}
