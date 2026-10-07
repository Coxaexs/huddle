import { currentUser, unauthorized } from "@/lib/auth";
import {
  deleteRequest,
  isRequestHandler,
  type RequestStatus,
  updateRequest,
} from "@/lib/requests";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Database storage is not connected." },
      { status: 503 },
    );
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);

  if (!isRequestHandler(user)) {
    return Response.json(
      { error: "Only Kiwi, Flo, and admins can manage requests." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: RequestStatus;
    responseNote?: string | null;
  };

  try {
    const updated = await updateRequest(
      db,
      {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        displayName: user.display_name,
      },
      id,
      body,
    );

    if (!updated) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }

    return Response.json({ request: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update request.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Database storage is not connected." },
      { status: 503 },
    );
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);

  const { id } = await context.params;

  try {
    const ok = await deleteRequest(db, user, id);
    if (!ok) {
      return Response.json({ error: "Request not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete request.";
    return Response.json({ error: message }, { status: 403 });
  }
}
