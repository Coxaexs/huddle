import { canSeeServer } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { getDndSettings, mergeHomebrew, saveDndSettings, type DndSettings } from "@/lib/dnd-rules";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** A server's D&D settings, for its members: GET ?serverId= */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const serverId = new URL(request.url).searchParams.get("serverId")?.slice(0, 64) || "";
  if (!serverId || !(await canSeeServer(db, serverId, user))) {
    return Response.json({ error: "You are not a member of this server." }, { status: 403 });
  }
  return Response.json(await getDndSettings(db, serverId));
}

/**
 * Manage Server only. Any of:
 *   { serverId, edition: "2014" | "2024" }
 *   { serverId, combatMusic, exploreMusic }   a playlist link or a search; "" clears
 *   { serverId, homebrew: [...] }             adds entries (same kind and name replaces)
 *   { serverId, clearHomebrew: true }
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    serverId?: string;
    edition?: unknown;
    combatMusic?: unknown;
    exploreMusic?: unknown;
    homebrew?: unknown;
    clearHomebrew?: boolean;
  };
  const serverId = String(body.serverId || "").slice(0, 64);
  const allowed =
    Boolean(serverId) &&
    (Boolean(user.is_admin) || (await can(db, user.id, serverId, Permission.MANAGE_SERVER).catch(() => false)));
  if (!allowed) {
    return Response.json({ error: "Changing D&D settings takes Manage Server." }, { status: 403 });
  }

  const settings: DndSettings = await getDndSettings(db, serverId);
  if (body.edition === "2014" || body.edition === "2024") settings.edition = body.edition;
  if (typeof body.combatMusic === "string") settings.combatMusic = body.combatMusic.trim().slice(0, 300);
  if (typeof body.exploreMusic === "string") settings.exploreMusic = body.exploreMusic.trim().slice(0, 300);
  if (body.clearHomebrew) settings.homebrew = [];
  let imported: { added: number; skipped: number } | undefined;
  if (body.homebrew !== undefined) {
    const incoming = Array.isArray(body.homebrew) ? body.homebrew : [body.homebrew];
    const merged = mergeHomebrew(settings.homebrew, incoming);
    if ("error" in merged) return Response.json({ error: merged.error }, { status: 400 });
    if (!merged.added) {
      return Response.json(
        { error: 'Nothing to import: each entry needs a "name" and a "kind" (spell, monster, condition, item, feat, race or class).' },
        { status: 400 },
      );
    }
    settings.homebrew = merged.homebrew;
    imported = { added: merged.added, skipped: merged.skipped };
  }
  await saveDndSettings(db, serverId, settings);
  return Response.json({ ...settings, imported });
}
