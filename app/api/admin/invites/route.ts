import { adminCreateInvite, adminInvites, deleteInvites } from "@/lib/admin-tools";
import { requireInstanceAdmin } from "../guard";

export const dynamic = "force-dynamic";

/** Every invite code on the instance, sign-up and server invites alike. */
export async function GET(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  return Response.json({ invites: await adminInvites(gate.db) });
}

/** `{ serverId?: string | null, maxUses?: number, note?: string }` */
export async function POST(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { serverId?: unknown; maxUses?: unknown; note?: unknown };
  const result = await adminCreateInvite(
    gate.db,
    {
      serverId: typeof body.serverId === "string" && body.serverId ? body.serverId : null,
      maxUses: typeof body.maxUses === "number" && Number.isFinite(body.maxUses) ? body.maxUses : 1,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 80) : null,
    },
    gate.user,
  );
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json(result, { status: 201 });
}

/** `{ codes: string[] }` */
export async function DELETE(request: Request) {
  const gate = await requireInstanceAdmin(request);
  if ("response" in gate) return gate.response;
  const body = (await request.json().catch(() => ({}))) as { codes?: unknown };
  const codes = Array.isArray(body.codes) ? body.codes.filter((code): code is string => typeof code === "string").slice(0, 500) : [];
  if (!codes.length) return Response.json({ error: "Pick at least one invite." }, { status: 400 });
  return Response.json({ deleted: await deleteInvites(gate.db, codes, gate.user) });
}
