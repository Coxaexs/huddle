/**
 * /applications/{id}/menu: how a Developer Portal bot sets the right-click
 * menu shown on its messages (lib/bot-menus.ts).
 */
import { cleanMenu, deleteMenu, menuOf, saveMenu } from "../bot-menus";
import { ErrorCode, discordError, type RestContext } from "./rest";

export function isMenuRoute(segments: string[]): boolean {
  return segments[1] === "menu" && segments.length === 2;
}

export async function handleMenuRoutes(context: RestContext): Promise<Response> {
  const { db, bot, request } = context;
  if (!bot.applicationId) {
    return discordError(403, ErrorCode.MissingAccess, "Menus are for bots from the Developer Portal");
  }
  const appId = bot.applicationId;

  if (request.method === "GET") return Response.json({ items: await menuOf(db, appId) });
  if (request.method === "DELETE") {
    await deleteMenu(db, appId);
    return new Response(null, { status: 204 });
  }
  if (request.method !== "PUT") return discordError(404, ErrorCode.GeneralError, "404: Not Found");

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clean = cleanMenu(body);
  if ("error" in clean) return discordError(400, ErrorCode.InvalidFormBody, clean.error);
  await saveMenu(db, appId, clean.items);
  return Response.json({ items: clean.items });
}
