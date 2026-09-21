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
    username?: string;
  };

  const target = body.targetId || body.username || "";
  if (!target.trim()) {
    return Response.json({ error: "Missing targetId or username." }, { status: 400 });
  }

  await ensureSchema(db);
  try {
    const blockedUser = await blockUser(db, user.id, target);
    return Response.json({ ok: true, user: blockedUser });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not block user." },
      { status: 400 },
    );
  }
}
