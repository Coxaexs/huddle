import { currentUser, generateInviteCode, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface InviteRow {
  code: string;
  created_at: string;
  max_uses: number;
  uses: number;
  revoked: number;
  note: string | null;
  server_id: string | null;
}

function publicInvite(invite: InviteRow) {
  return {
    code: invite.code,
    createdAt: invite.created_at,
    maxUses: invite.max_uses,
    uses: invite.uses,
    revoked: Boolean(invite.revoked),
    note: invite.note || "",
    serverId: invite.server_id || null,
    spent: invite.max_uses > 0 && invite.uses >= invite.max_uses,
  };
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ invites: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();

  await ensureSchema(db);
  // A server invite list is scoped to that server; without a serverId this is
  // the account-level invite list (codes that let someone join the Huddle).
  const serverId = new URL(request.url).searchParams.get("serverId") || null;
  const result = serverId
    ? await db
        .prepare(
          "SELECT code, created_at, max_uses, uses, revoked, note, server_id FROM invites WHERE server_id = ? ORDER BY created_at DESC LIMIT 50",
        )
        .bind(serverId)
        .all()
    : await db
        .prepare(
          "SELECT code, created_at, max_uses, uses, revoked, note, server_id FROM invites WHERE server_id IS NULL ORDER BY created_at DESC LIMIT 50",
        )
        .all();
  return Response.json({
    invites: ((result.results || []) as unknown as InviteRow[]).map(
      publicInvite,
    ),
  });
}

/** Anyone signed in can invite a friend — this Huddle has no roles yet. */
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
    maxUses?: number;
    note?: string;
    /** When set, redeeming the code joins the invitee to this server. */
    serverId?: string;
  };
  const maxUses = Number.isFinite(body.maxUses)
    ? Math.max(0, Math.min(100, Math.trunc(body.maxUses as number)))
    : 1;

  // A server invite may only be made by someone who is in that server.
  const serverId = body.serverId?.slice(0, 64) || null;
  if (serverId && !(await isServerMember(db, serverId, user.id))) {
    return Response.json(
      { error: "You are not a member of that server." },
      { status: 403 },
    );
  }

  const invite: InviteRow = {
    code: generateInviteCode(),
    created_at: new Date().toISOString(),
    max_uses: maxUses,
    uses: 0,
    revoked: 0,
    note: body.note?.trim().slice(0, 80) || null,
    server_id: serverId,
  };

  await db
    .prepare(
      "INSERT INTO invites (code, created_by, created_at, max_uses, uses, revoked, note, server_id) VALUES (?, ?, ?, ?, 0, 0, ?, ?)",
    )
    .bind(
      invite.code,
      user.id,
      invite.created_at,
      invite.max_uses,
      invite.note,
      invite.server_id,
    )
    .run();

  if (serverId) {
    await recordAudit(db, {
      serverId,
      actor: user,
      action: "invite.create",
      detail: invite.note || `code ${invite.code}`,
    });
  }

  return Response.json({ invite: publicInvite(invite) }, { status: 201 });
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

  const code = new URL(request.url).searchParams.get("code")?.toUpperCase();
  if (!code) return Response.json({ error: "Which code?" }, { status: 400 });

  await db
    .prepare("UPDATE invites SET revoked = 1 WHERE code = ?")
    .bind(code)
    .run();
  return Response.json({ ok: true });
}
