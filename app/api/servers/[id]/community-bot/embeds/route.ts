import { currentUser, unauthorized } from "@/lib/auth";
import {
  deleteSavedEmbed,
  listSavedEmbeds,
  saveAndOptionallyPublishEmbed,
} from "@/lib/community-bot/embeds";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
    id?: string;
    channelId?: string;
    name?: string;
    content?: string;
    embed?: unknown;
    publish?: boolean;
  };
  if (!body.channelId) {
    return Response.json({ error: "Choose a target text channel." }, { status: 400 });
  }

  const res = await saveAndOptionallyPublishEmbed(db, serverId, {
    id: body.id,
    channelId: body.channelId,
    name: body.name || "Untitled Embed",
    content: body.content,
    embed: body.embed ?? {},
    publish: Boolean(body.publish),
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 400 });

  const savedEmbeds = await listSavedEmbeds(db, serverId);
  return Response.json({ ok: true, saved: res.saved, savedEmbeds });
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

  const embedId = new URL(request.url).searchParams.get("embedId") || "";
  if (!embedId) return Response.json({ error: "Missing embedId." }, { status: 400 });

  await deleteSavedEmbed(db, serverId, embedId);
  const savedEmbeds = await listSavedEmbeds(db, serverId);
  return Response.json({ ok: true, savedEmbeds });
}
