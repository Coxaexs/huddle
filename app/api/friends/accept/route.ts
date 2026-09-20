import { currentUser, unauthorized } from "@/lib/auth";
import { acceptFriendRequest } from "@/lib/friends";
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
    requesterId?: string;
  };

  if (!body.requesterId) {
    return Response.json({ error: "Missing requesterId." }, { status: 400 });
  }

  await ensureSchema(db);
  try {
    await acceptFriendRequest(db, user.id, body.requesterId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not accept friend request." },
      { status: 400 },
    );
  }
}
