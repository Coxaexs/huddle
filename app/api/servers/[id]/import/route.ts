import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fetchDiscordGuild, fetchDiscordTemplate } from "@/lib/discord-import";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission, roleAuthority } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { applyServerLayout, type ServerLayout } from "@/lib/server-layout";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const STARTER_TEMPLATES: Record<string, ServerLayout> = {
  gaming: {
    categories: [
      {
        name: "Information",
        channels: [
          { name: "welcome-and-rules", kind: "announcement", topic: "Server rules and announcements" },
          { name: "clips-and-highlights", kind: "text", topic: "Share your best gaming clips and screenshots" },
        ],
      },
      {
        name: "Hangout",
        channels: [
          { name: "lounge", kind: "text", topic: "General chat and squad finder" },
          { name: "memes", kind: "text", topic: "Memes and off-topic" },
        ],
      },
      {
        name: "Voice Rooms",
        channels: [
          { name: "Lobby", kind: "voice" },
          { name: "Squad 1", kind: "voice" },
          { name: "Squad 2", kind: "voice" },
        ],
      },
    ],
    roles: [
      { name: "Moderator", color: "#5865f2" },
      { name: "Regulars", color: "#2ecc71" },
    ],
  },
  dnd: {
    categories: [
      {
        name: "Campaign Lore",
        channels: [
          { name: "announcements", kind: "announcement", topic: "Session schedules and world updates" },
          { name: "world-lore-and-npcs", kind: "forum", topic: "Locations, factions, and NPC dossiers" },
          { name: "session-recaps", kind: "text", topic: "Session logs and adventure recaps" },
        ],
      },
      {
        name: "Tabletop",
        channels: [
          { name: "tavern-chat", kind: "text", topic: "In-character and out-of-character banter" },
          { name: "dice-and-sheets", kind: "text", topic: "Roll dice with /roll and look up spells with /spell" },
          { name: "The Table", kind: "voice" },
          { name: "GM Whisper Room", kind: "voice" },
        ],
      },
    ],
    roles: [
      { name: "Game Master", color: "#e67e22" },
      { name: "Adventurer", color: "#9b59b6" },
    ],
  },
  // An open server for strangers: a place to land, rules up front, a way to
  // report bugs and find people to play with.
  community: {
    categories: [
      {
        name: "Start here",
        channels: [
          { name: "welcome-and-rules", kind: "announcement", topic: "Read this first: what this place is and the few rules" },
          { name: "say-hi", kind: "text", topic: "New here? Tell us who you are and what you play" },
        ],
      },
      {
        name: "Hang out",
        channels: [
          { name: "general", kind: "text", topic: "Anything goes (within the rules)" },
          { name: "looking-for-group", kind: "text", topic: "Find people for a game, a D&D table or a movie night" },
          { name: "show-your-setup", kind: "text", topic: "Themes, profiles, battlemaps: show it off" },
          { name: "Lounge", kind: "voice" },
          { name: "Game night", kind: "voice" },
        ],
      },
      {
        name: "Help",
        channels: [
          { name: "questions", kind: "text", topic: "Stuck on something? Ask here" },
          { name: "feedback-and-bugs", kind: "forum", topic: "One post per bug or idea, with steps or a screenshot" },
        ],
      },
    ],
    roles: [
      { name: "Moderator", color: "#e74c3c" },
      { name: "Helper", color: "#2ecc71" },
    ],
  },
  study: {
    categories: [
      {
        name: "Co-Working",
        channels: [
          { name: "daily-goals", kind: "text", topic: "What are you working on today?" },
          { name: "resources-and-notes", kind: "forum", topic: "Helpful links, study guides, and Q&A" },
          { name: "Quiet Focus Room", kind: "voice" },
          { name: "Break Room", kind: "voice" },
        ],
      },
    ],
    roles: [
      { name: "Study Buddy", color: "#3498db" },
    ],
  },
};

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

  if (body.mode === "template" && body.templateId && STARTER_TEMPLATES[body.templateId]) {
    layout = STARTER_TEMPLATES[body.templateId];
    sourceLabel = `template:${body.templateId}`;
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
