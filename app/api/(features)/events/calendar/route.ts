import { currentUser, unauthorized } from "@/lib/auth";
import { calendarToken } from "@/lib/calendar";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Your calendar subscription link's token (made on first ask). */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  return Response.json({ token: await calendarToken(db, user.id) });
}

/** { reset: true } → a new link; the old one stops working. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as { reset?: unknown };
  return Response.json({ token: await calendarToken(db, user.id, { reset: body.reset === true }) });
}
