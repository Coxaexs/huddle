import { currentUser, unauthorized } from "@/lib/auth";
import { canManageMedia, deleteMedia, listMedia } from "@/lib/media-admin";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json({ error: "Only media admins can open this panel." }, { status: 403 });
}

/** Every uploaded file with its size, uploader and where it is used. */
export async function GET(request: Request) {
  const { DB: db, UPLOADS: bucket } = bindings();
  if (!db || !bucket) {
    return Response.json({ error: "File storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  if (!canManageMedia(user)) return forbidden();
  await ensureSchema(db);
  return Response.json({ items: await listMedia(db, bucket) });
}

/** Deletes `{ keys: string[] }` and detaches them from everything that shows them. */
export async function DELETE(request: Request) {
  const { DB: db, UPLOADS: bucket } = bindings();
  if (!db || !bucket) {
    return Response.json({ error: "File storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  if (!canManageMedia(user)) return forbidden();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as { keys?: unknown };
  const keys = Array.isArray(body.keys)
    ? [...new Set(body.keys.filter((key): key is string => typeof key === "string" && key.length > 0))]
    : [];
  if (keys.length === 0) {
    return Response.json({ error: "Pick at least one file." }, { status: 400 });
  }
  // R2 deletes at most 1000 keys per call.
  if (keys.length > 1000) {
    return Response.json({ error: "Delete at most 1000 files at once." }, { status: 400 });
  }
  return Response.json(await deleteMedia(db, bucket, keys, user));
}
