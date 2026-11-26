import { currentUser, unauthorized } from "@/lib/auth";
import {
  deleteTimer,
  listTimers,
  runTimerNow,
  saveTimer,
} from "@/lib/community-bot/timers";
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
    action?: "save" | "run-now";
    id?: string;
    channelId?: string;
    name?: string;
    message?: string;
    useEmbed?: boolean;
    embedColor?: string;
    intervalMin?: number;
    enabled?: boolean;
  };

  if (body.action === "run-now" && body.id) {
    const ok = await runTimerNow(db, serverId, body.id);
    if (!ok) return Response.json({ error: "Timer not found." }, { status: 404 });
    const timers = await listTimers(db, serverId);
    return Response.json({ ok: true, timers });
  }

  if (!body.channelId) {
    return Response.json({ error: "Choose a target text channel." }, { status: 400 });
  }

  const res = await saveTimer(db, serverId, {
    id: body.id,
    channelId: body.channelId,
    name: body.name || "Scheduled Announcement",
    message: body.message || "",
    useEmbed: body.useEmbed,
    embedColor: body.embedColor,
    intervalMin: body.intervalMin,
    enabled: body.enabled,
  });
  if ("error" in res) return Response.json({ error: res.error }, { status: 400 });

  const timers = await listTimers(db, serverId);
  return Response.json({ ok: true, timer: res, timers });
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

  const timerId = new URL(request.url).searchParams.get("timerId") || "";
  if (!timerId) return Response.json({ error: "Missing timerId." }, { status: 400 });

  await deleteTimer(db, serverId, timerId);
  const timers = await listTimers(db, serverId);
  return Response.json({ ok: true, timers });
}
