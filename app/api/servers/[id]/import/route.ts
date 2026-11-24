import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fetchDiscordGuild, fetchDiscordTemplate } from "@/lib/discord-import";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission, roleAuthority } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { applyServerLayout, type ServerLayout } from "@/lib/server-layout";
import { findServerTemplate, wireTemplateExtras } from "@/lib/server-templates";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const { id: serverId } = await context.params;
  if (!(await can(db, user.id, serverId, Permission.MANAGE_SERVER))) {
    return Response.json({ error: "You need Manage Server permission to import data." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "discord" | "discord-template" | "json" | "template";
    botToken?: string;
    guildId?: string;
    link?: string;
    structure?: ServerLayout;
    templateId?: string;
  };

  let layout: ServerLayout | null = null;
  let sourceLabel = "template";
  let skipped = 0;
  let matchedTemplate: ReturnType<typeof findServerTemplate> = null;

  if (body.mode === "template") {
    matchedTemplate = findServerTemplate(body.templateId);
    if (!matchedTemplate) {
      return Response.json({ error: "Unknown server template." }, { status: 400 });
    }
    layout = matchedTemplate.layout;
    sourceLabel = `template:${matchedTemplate.id}`;
  } else if (body.mode === "json" && body.structure && typeof body.structure === "object") {
    layout = body.structure;
    sourceLabel = "json";
  } else if (body.mode === "discord-template" || body.mode === "discord") {
    const fetched =
      body.mode === "discord-template"
        ? await fetchDiscordTemplate(String(body.link || ""))
        : await fetchDiscordGuild(String(body.guildId || "").trim(), String(body.botToken || "").trim());
    if (!fetched.ok) return Response.json({ error: fetched.error }, { status: fetched.status });
    layout = fetched.layout;
    skipped = fetched.skipped;
    sourceLabel = body.mode === "discord-template" ? `discord:${fetched.name}` : `discord:${body.guildId}`;
  } else {
    return Response.json({ error: "Select a template, JSON structure, or Discord server to import." }, { status: 400 });
  }

  // Imported roles carry permissions now; nobody creates roles stronger than themselves.
  const authority = await roleAuthority(db, user.id, serverId);
  const imported = await applyServerLayout(db, serverId, layout, { grantable: authority.mask });

  if (matchedTemplate) {
    await wireTemplateExtras(db, serverId, matchedTemplate);
  }

  await recordAudit(db, {
    serverId,
    actor: user,
    action: "server.import",
    targetName: sourceLabel,
    detail: `${imported.categories} categories, ${imported.channels} channels, ${imported.roles} roles`,
  });
  await publishStructureChange(serverId);

  return Response.json({
    imported: { ...imported, skipped },
    servers: await listServers(db, user.id),
  });
}
