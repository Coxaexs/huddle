import { currentUser, unauthorized } from "@/lib/auth";
import {
  clearUserWarnings,
  deleteWarning,
  issueWarning,
  listWarnings,
} from "@/lib/community-bot/moderation";
import { canAny, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await canAny(db, user.id, serverId, Permission.MODERATE, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Moderation permission is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") || undefined;
  const warnings = await listWarnings(db, serverId, userId);
  return Response.json({ warnings });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await canAny(db, user.id, serverId, Permission.MODERATE, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Moderation permission is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    reason?: string;
  };
  if (!body.userId) {
    return Response.json({ error: "Select a member to warn." }, { status: 400 });
  }
  if (body.userId === user.id) {
    return Response.json({ error: "You cannot warn yourself." }, { status: 400 });
  }

  const result = await issueWarning(db, {
    serverId,
    userId: body.userId,
    moderatorId: user.id,
    reason: body.reason || "No reason provided",
  });
  const warnings = await listWarnings(db, serverId);
  return Response.json({ ok: true, result, warnings });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await canAny(db, user.id, serverId, Permission.MODERATE, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Moderation permission is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const warningId = url.searchParams.get("warningId");
  const userId = url.searchParams.get("userId");

  if (warningId) {
    await deleteWarning(db, serverId, warningId);
  } else if (userId) {
    await clearUserWarnings(db, serverId, userId);
  } else {
    return Response.json({ error: "Provide warningId or userId." }, { status: 400 });
  }

  const warnings = await listWarnings(db, serverId);
  return Response.json({ ok: true, warnings });
}
