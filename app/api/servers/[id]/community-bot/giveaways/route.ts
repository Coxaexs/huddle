import { currentUser, unauthorized } from "@/lib/auth";
import {
  createGiveaway,
  finishOrRerollGiveaway,
  listGiveaways,
} from "@/lib/community-bot/giveaways";
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
    action?: "create" | "end" | "reroll";
    giveawayId?: string;
    channelId?: string;
    prize?: string;
    description?: string;
    winnerCount?: number;
    durationMin?: number;
    requiredRoleId?: string | null;
  };

  if ((body.action === "end" || body.action === "reroll") && body.giveawayId) {
    const res = await finishOrRerollGiveaway(
      db,
      serverId,
      body.giveawayId,
      body.action === "reroll",
    );
    if ("error" in res) return Response.json({ error: res.error }, { status: 400 });
    const giveaways = await listGiveaways(db, serverId);
    return Response.json({ ok: true, winnerIds: res.winnerIds, giveaways });
  }

  if (!body.channelId) {
    return Response.json({ error: "Choose a channel for the giveaway." }, { status: 400 });
  }

  const res = await createGiveaway(db, serverId, {
    channelId: body.channelId,
    prize: body.prize || "",
    description: body.description,
    winnerCount: body.winnerCount,
    durationMin: body.durationMin,
    requiredRoleId: body.requiredRoleId,
    hostId: user.id,
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 400 });

  const giveaways = await listGiveaways(db, serverId);
  return Response.json({ ok: true, giveaway: res, giveaways });
}
