import { currentUser, generateInviteCode, unauthorized } from "@/lib/auth";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface InviteRow {
  code: string;
  created_at: string;
  max_uses: number;
  uses: number;
  revoked: number;
  note: string | null;
}

function publicInvite(invite: InviteRow) {
  return {
    code: invite.code,
    createdAt: invite.created_at,
    maxUses: invite.max_uses,
    uses: invite.uses,
    revoked: Boolean(invite.revoked),
    note: invite.note || "",
    spent: invite.max_uses > 0 && invite.uses >= invite.max_uses,
  };
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ invites: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();

  const result = await db
    .prepare(
      "SELECT code, created_at, max_uses, uses, revoked, note FROM invites ORDER BY created_at DESC LIMIT 50",
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

  const body = (await request.json().catch(() => ({}))) as {
    maxUses?: number;
    note?: string;
  };
  const maxUses = Number.isFinite(body.maxUses)
    ? Math.max(0, Math.min(100, Math.trunc(body.maxUses as number)))
    : 1;

  const invite: InviteRow = {
    code: generateInviteCode(),
    created_at: new Date().toISOString(),
    max_uses: maxUses,
    uses: 0,
    revoked: 0,
    note: body.note?.trim().slice(0, 80) || null,
  };

  await db
    .prepare(
      "INSERT INTO invites (code, created_by, created_at, max_uses, uses, revoked, note) VALUES (?, ?, ?, ?, 0, 0, ?)",
    )
    .bind(invite.code, user.id, invite.created_at, invite.max_uses, invite.note)
    .run();

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
