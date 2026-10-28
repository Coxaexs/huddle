import { canSeeServer, channelAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { listServerWidgets } from "@/lib/bot-widgets";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The bot widgets in one server, for the sidebar and Customize. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ widgets: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const serverId = new URL(request.url).searchParams.get("serverId") || "";
  if (!serverId || !(await canSeeServer(db, serverId, user))) {
    return Response.json({ widgets: [] });
  }
  const widgets = await listServerWidgets(db, serverId);
  // A room's widget is only for people who can see that room.
  const rooms = [...new Set(widgets.map((widget) => widget.channelId).filter(Boolean))] as string[];
  const visible = new Set<string>();
  await Promise.all(
    rooms.map(async (channelId) => {
      if ((await channelAccess(db, channelId, user)).ok) visible.add(channelId);
    }),
  );
  return Response.json({
    widgets: widgets.filter((widget) => !widget.channelId || visible.has(widget.channelId)),
  });
}
