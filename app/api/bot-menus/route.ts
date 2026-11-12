import { currentUser, unauthorized } from "@/lib/auth";
import { menusInServer } from "@/lib/bot-menus";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** GET ?serverId: the right-click menus of the bots in a server you are in. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ menus: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const serverId = (new URL(request.url).searchParams.get("serverId") || "").slice(0, 64);
  if (!serverId || !(await isServerMember(db, serverId, user.id))) {
    return Response.json({ error: "You are not in that server." }, { status: 403 });
  }
  return Response.json({ menus: await menusInServer(db, serverId) });
}
