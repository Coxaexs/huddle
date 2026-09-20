import { currentUser, unauthorized } from "@/lib/auth";
import { blockUser } from "@/lib/friends";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

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

  const body = (await request.json().catch(() => ({}))) as {
    targetId?: string;
  };

  if (!body.targetId) {
    return Response.json({ error: "Missing targetId." }, { status: 400 });
  }

  await ensureSchema(db);
  try {
    await blockUser(db, user.id, body.targetId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not block user." },
      { status: 400 },
    );
  }
}
