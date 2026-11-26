import { currentUser, unauthorized } from "@/lib/auth";
import { deleteShopItem, listShopItems, saveShopItem } from "@/lib/community-bot/economy";
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
    name?: string;
    description?: string;
    emoji?: string;
    price?: number;
    roleId?: string | null;
  };

  const res = await saveShopItem(db, serverId, {
    id: body.id,
    name: body.name || "",
    description: body.description,
    emoji: body.emoji,
    price: Number(body.price) || 100,
    roleId: body.roleId,
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 400 });

  const shopItems = await listShopItems(db, serverId);
  return Response.json({ ok: true, item: res, shopItems });
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

  const itemId = new URL(request.url).searchParams.get("itemId") || "";
  if (!itemId) return Response.json({ error: "Missing itemId." }, { status: 400 });

  await deleteShopItem(db, serverId, itemId);
  const shopItems = await listShopItems(db, serverId);
  return Response.json({ ok: true, shopItems });
}
