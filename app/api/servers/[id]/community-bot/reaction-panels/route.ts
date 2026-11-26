import { currentUser, unauthorized } from "@/lib/auth";
import {
  deleteReactionPanel,
  listReactionPanels,
  publishReactionPanel,
  saveReactionPanel,
} from "@/lib/community-bot/reaction-roles";
import { can, Permission } from "@/lib/permissions";
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
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const panels = await listReactionPanels(db, serverId);
  return Response.json({ panels });
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
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "save" | "publish";
    id?: string;
    channelId?: string;
    title?: string;
    description?: string;
    color?: string;
    mode?: string;
    style?: string;
    items?: unknown;
  };

  if (body.action === "publish" && body.id && !body.channelId) {
    const res = await publishReactionPanel(db, serverId, body.id);
    if ("error" in res) return Response.json({ error: res.error }, { status: 400 });
    const panels = await listReactionPanels(db, serverId);
    return Response.json({ ok: true, messageId: res.messageId, panels });
  }

  if (!body.channelId) {
    return Response.json({ error: "Choose a target text channel." }, { status: 400 });
  }

  const panel = await saveReactionPanel(db, serverId, {
    id: body.id,
    channelId: body.channelId,
    title: body.title || "Choose your roles",
    description: body.description || "",
    color: body.color,
    mode: body.mode,
    style: body.style,
    items: body.items ?? [],
  });

  let messageId = panel.messageId;
  if (body.action === "publish") {
    const res = await publishReactionPanel(db, serverId, panel.id);
    if ("error" in res) return Response.json({ error: res.error, panel }, { status: 400 });
    messageId = res.messageId;
  }

  const panels = await listReactionPanels(db, serverId);
  return Response.json({ ok: true, panel: { ...panel, messageId }, panels });
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
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "Manage Server permission is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const panelId = url.searchParams.get("panelId") || "";
  if (!panelId) return Response.json({ error: "Missing panelId." }, { status: 400 });

  await deleteReactionPanel(db, serverId, panelId);
  const panels = await listReactionPanels(db, serverId);
  return Response.json({ ok: true, panels });
}
