import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { normalizeDisabledModules } from "@/lib/features";
import { normalizeProfileImage } from "@/lib/profile-media";
import { ensureSchema, DEFAULT_SERVER_ID } from "@/lib/schema";
import { deleteServerData, listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import { clampVerificationLevel } from "@/lib/verification-level";
import { normalizeVanityCode, setVanityCode } from "@/lib/vanity";

export const dynamic = "force-dynamic";

function forbidden(): Response {
  return Response.json(
    { error: "You do not have permission to manage this server." },
    { status: 403 },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    icon?: string;
    color?: string;
    iconUrl?: string | null;
    bannerUrl?: string | null;
    isPublic?: boolean;
    description?: string;
    disabledModules?: unknown;
    raidMode?: boolean;
    verificationLevel?: number;
    vanityCode?: string | null;
    webPublic?: boolean;
  };

  const server = await db
    .prepare("SELECT * FROM servers WHERE id = ?")
    .bind(id)
    .first<{
      id: string;
      name: string;
      icon: string;
      color: string;
      icon_url?: string;
      banner_url?: string;
      is_public?: number;
      description?: string;
      disabled_modules?: string;
      raid_mode?: number;
      verification_level?: number;
      vanity_code?: string | null;
    }>();
  if (!server) {
    return Response.json({ error: "That server is gone." }, { status: 404 });
  }
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  // Every member's app (and the public invite page) loads these, so an outside
  // link goes through the image proxy rather than to whoever runs that host.
  let iconUrl = server.icon_url || null;
  let bannerUrl = server.banner_url || null;
  if (body.iconUrl !== undefined) {
    const icon = await normalizeProfileImage(db, body.iconUrl, "Server icon");
    if (!icon.ok) return Response.json({ error: icon.error }, { status: 400 });
    iconUrl = icon.url;
  }
  if (body.bannerUrl !== undefined) {
    const banner = await normalizeProfileImage(db, body.bannerUrl, "Server banner", true);
    if (!banner.ok) return Response.json({ error: banner.error }, { status: 400 });
    bannerUrl = banner.url;
  }

  const isPublic = body.isPublic !== undefined ? (body.isPublic ? 1 : 0) : (server.is_public ?? 0);
  const description = body.description !== undefined ? String(body.description || "").trim().slice(0, 240) : (server.description || "");
  const disabledModules = body.disabledModules !== undefined
    ? JSON.stringify(normalizeDisabledModules(body.disabledModules))
    : (server.disabled_modules || "[]");
  const raidMode = body.raidMode !== undefined ? (body.raidMode ? 1 : 0) : (server.raid_mode ?? 0);
  const verificationLevel = body.verificationLevel !== undefined
    ? clampVerificationLevel(body.verificationLevel)
    : (server.verification_level ?? 0);

  if (body.vanityCode !== undefined) {
    const vanity = normalizeVanityCode(body.vanityCode);
    if (!vanity.ok) return Response.json({ error: vanity.error }, { status: 400 });
    const previous = server.vanity_code || null;
    const refused = await setVanityCode(db, id, user.id, vanity.code, previous);
    if (refused) return Response.json({ error: refused }, { status: 409 });
    if (vanity.code !== previous) {
      await recordAudit(db, {
        serverId: id,
        actor: user,
        action: "server.vanity",
        targetName: server.name,
        detail: vanity.code ? `Vanity invite set to ${vanity.code}` : "Vanity invite removed",
      });
    }
  }

  await db
    .prepare(
      "UPDATE servers SET name = ?, icon = ?, color = ?, icon_url = ?, banner_url = ?, is_public = ?, description = ?, disabled_modules = ?, raid_mode = ?, verification_level = ? WHERE id = ?",
    )
    .bind(
      body.name?.trim().slice(0, 50) || server.name,
      body.icon?.trim().slice(0, 2).toUpperCase() || server.icon,
      body.color?.trim().slice(0, 24) || server.color,
      iconUrl,
      bannerUrl,
      isPublic,
      description,
      disabledModules,
      raidMode,
      verificationLevel,
      id,
    )
    .run();

  if (body.webPublic !== undefined) {
    await db.prepare("UPDATE servers SET web_public = ? WHERE id = ?").bind(body.webPublic ? 1 : 0, id).run();
    await recordAudit(db, {
      serverId: id,
      actor: user,
      action: "server.web_public",
      targetName: server.name,
      detail: body.webPublic ? "Readable on the web" : "No longer readable on the web",
    });
  }

  if (body.raidMode !== undefined && Boolean(server.raid_mode) !== Boolean(raidMode)) {
    await recordAudit(db, {
      serverId: id,
      actor: user,
      action: raidMode ? "moderation.raid_on" : "moderation.raid_off",
      targetName: server.name,
      detail: raidMode ? "Enabled raid lockdown" : "Disabled raid lockdown",
    });
  }

  if (verificationLevel !== (server.verification_level ?? 0)) {
    await recordAudit(db, {
      serverId: id,
      actor: user,
      action: "moderation.verification",
      targetName: server.name,
      detail: `Verification level ${server.verification_level ?? 0} → ${verificationLevel}`,
    });
  }

  await recordAudit(db, {
    serverId: id,
    actor: user,
    action: "server.update",
    targetName: body.name?.trim().slice(0, 50) || server.name,
  });
  await publishStructureChange(id);
  return Response.json({ servers: await listServers(db, user.id) });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id } = await context.params;
  if (id === DEFAULT_SERVER_ID) {
    return Response.json(
      { error: "The Hangout is the home server and cannot be deleted." },
      { status: 400 },
    );
  }
  if (!(await can(db, user.id, id, Permission.MANAGE_SERVER))) return forbidden();

  await deleteServerData(db, id);

  await publishStructureChange(id);
  return Response.json({ servers: await listServers(db, user.id) });
}
