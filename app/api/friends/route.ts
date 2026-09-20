import { currentUser, unauthorized } from "@/lib/auth";
import {
  listFriends,
  removeFriend,
  sendFriendRequest,
} from "@/lib/friends";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ friends: [], incoming: [], outgoing: [], blocked: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);
  const summary = await listFriends(db, user.id);
  return Response.json(summary);
}

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
    userId?: string;
  };

  const target = body.username || body.userId || "";
  if (!target) {
    return Response.json(
      { error: "Please enter a username to add." },
      { status: 400 },
    );
  }

  try {
    const result = await sendFriendRequest(db, user.id, target);
    return Response.json(result, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not send friend request." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const friendId = url.searchParams.get("id");
  if (!friendId) {
    return Response.json({ error: "Missing friend id." }, { status: 400 });
  }

  await ensureSchema(db);
  await removeFriend(db, user.id, friendId);
  return Response.json({ ok: true });
}
