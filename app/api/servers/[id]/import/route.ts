import { currentUser, unauthorized } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { publishStructureChange } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { listServers } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface TemplateCategory {
  name: string;
  channels: Array<{ name: string; kind?: "text" | "voice" | "announcement" | "forum" | "stage"; topic?: string }>;
}

interface TemplateRole {
  name: string;
  color?: string;
}

interface TemplateStructure {
  categories?: TemplateCategory[];
  channels?: Array<{ name: string; kind?: "text" | "voice" | "announcement" | "forum" | "stage"; topic?: string }>;
  roles?: TemplateRole[];
}

const STARTER_TEMPLATES: Record<string, TemplateStructure> = {
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

function sanitizeChannelKind(k?: string): "text" | "voice" | "announcement" | "forum" | "stage" {
  if (k === "voice" || k === "announcement" || k === "forum" || k === "stage") return k;
  return "text";
}

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
    mode?: "discord" | "json" | "template";
    botToken?: string;
    guildId?: string;
    structure?: TemplateStructure;
    templateId?: string;
  };

  let structure: TemplateStructure | null = null;
  let sourceLabel = "template";

  if (body.mode === "template" && body.templateId && STARTER_TEMPLATES[body.templateId]) {
    structure = STARTER_TEMPLATES[body.templateId];
    sourceLabel = `template:${body.templateId}`;
  } else if (body.mode === "json" && body.structure && typeof body.structure === "object") {
    structure = body.structure;
    sourceLabel = "json";
  } else if (body.mode === "discord") {
    const token = body.botToken?.trim();
    const guildId = body.guildId?.trim();
    if (!token || !guildId || !/^\d{15,22}$/.test(guildId)) {
      return Response.json(
        { error: "Provide a valid Discord Bot Token and numeric Discord Server (Guild) ID." },
        { status: 400 },
      );
    }
    const headers = { Authorization: `Bot ${token}` };
    const [chanRes, roleRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers }).catch(() => null),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers }).catch(() => null),
    ]);
    if (!chanRes || !chanRes.ok) {
      return Response.json(
        { error: `Could not fetch Discord server channels (HTTP ${chanRes?.status || "network error"}). Check that the bot is in the Discord server.` },
        { status: 400 },
      );
    }
    const discordChannels = (await chanRes.json().catch(() => [])) as Array<{
      id: string;
      name: string;
      type: number;
      topic?: string | null;
      parent_id?: string | null;
      position?: number;
    }>;
    const discordRoles = roleRes?.ok
      ? ((await roleRes.json().catch(() => [])) as Array<{
          name: string;
          color: number;
          managed?: boolean;
          position?: number;
        }>)
      : [];

    const catMap = new Map<string, TemplateCategory>();
    const uncategorized: Array<{ name: string; kind?: "text" | "voice" | "announcement" | "forum" | "stage"; topic?: string }> = [];

    const sortedChans = [...discordChannels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    for (const ch of sortedChans) {
      if (ch.type === 4) {
        catMap.set(ch.id, { name: ch.name.slice(0, 50), channels: [] });
      }
    }
    for (const ch of sortedChans) {
      if (ch.type === 4) continue;
      const kind: "text" | "voice" | "announcement" | "forum" | "stage" =
        ch.type === 2 ? "voice" : ch.type === 13 ? "stage" : ch.type === 5 ? "announcement" : ch.type === 15 ? "forum" : "text";
      const entry = {
        name: ch.name.slice(0, 50),
        kind,
        topic: (ch.topic || "").slice(0, 200),
      };
      if (ch.parent_id && catMap.has(ch.parent_id)) {
        catMap.get(ch.parent_id)!.channels.push(entry);
      } else {
        uncategorized.push(entry);
      }
    }

    structure = {
      categories: [...catMap.values()].filter((c) => c.channels.length > 0),
      channels: uncategorized,
      roles: discordRoles
        .filter((r) => r.name !== "@everyone" && !r.managed)
        .slice(0, 25)
        .map((r) => ({
          name: r.name.slice(0, 40),
          color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "#99aab5",
        })),
    };
    sourceLabel = `discord:${guildId}`;
  } else {
    return Response.json({ error: "Select a template, JSON structure, or Discord Guild to import." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let createdCategories = 0;
  let createdChannels = 0;
  let createdRoles = 0;

  let catPos = 100;
  let chanPos = 100;

  // What the server already has, so applying a template to a server that has
  // some of it (or applying it twice) only adds what's missing.
  const [haveCategories, haveChannels, haveRoles] = await Promise.all([
    db.prepare("SELECT id, name FROM categories WHERE server_id = ?").bind(serverId).all<{ id: string; name: string }>(),
    db.prepare("SELECT name, kind FROM channels WHERE server_id = ?").bind(serverId).all<{ name: string; kind: string }>(),
    db.prepare("SELECT name FROM roles WHERE server_id = ?").bind(serverId).all<{ name: string }>(),
  ]);
  const categoryIds = new Map(haveCategories.results.map((c) => [c.name.toLowerCase(), c.id]));
  const channelKeys = new Set(haveChannels.results.map((c) => `${c.kind}:${c.name.toLowerCase()}`));
  const roleNames = new Set(haveRoles.results.map((r) => r.name.toLowerCase()));
  /** True the first time a channel of this name and kind comes up. */
  const newChannel = (name: string, kind: string) => {
    const key = `${kind}:${name.toLowerCase()}`;
    if (channelKeys.has(key)) return false;
    channelKeys.add(key);
    return true;
  };

  for (const cat of (structure.categories || []).slice(0, 15)) {
    const catName = String(cat.name || "").trim().slice(0, 50);
    if (!catName) continue;
    let catId = categoryIds.get(catName.toLowerCase());
    if (!catId) {
      catId = crypto.randomUUID();
      categoryIds.set(catName.toLowerCase(), catId);
      statements.push(
        db
          .prepare("INSERT INTO categories (id, server_id, name, position) VALUES (?, ?, ?, ?)")
          .bind(catId, serverId, catName, catPos++),
      );
      createdCategories++;
    }
    for (const ch of (cat.channels || []).slice(0, 20)) {
      const chName = String(ch.name || "").trim().slice(0, 50);
      if (!chName) continue;
      const kind = sanitizeChannelKind(ch.kind);
      if (!newChannel(chName, kind)) continue;
      statements.push(
        db
          .prepare(
            "INSERT INTO channels (id, server_id, name, kind, topic, position, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(crypto.randomUUID(), serverId, chName, kind, String(ch.topic || "").slice(0, 200), chanPos++, catId, now),
      );
      createdChannels++;
    }
  }

  for (const ch of (structure.channels || []).slice(0, 25)) {
    const chName = String(ch.name || "").trim().slice(0, 50);
    if (!chName) continue;
    const kind = sanitizeChannelKind(ch.kind);
    if (!newChannel(chName, kind)) continue;
    statements.push(
      db
        .prepare(
          "INSERT INTO channels (id, server_id, name, kind, topic, position, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
        )
        .bind(crypto.randomUUID(), serverId, chName, kind, String(ch.topic || "").slice(0, 200), chanPos++, now),
    );
    createdChannels++;
  }

  let rolePos = 10;
  for (const role of (structure.roles || []).slice(0, 20)) {
    const roleName = String(role.name || "").trim().slice(0, 40);
    if (!roleName || roleNames.has(roleName.toLowerCase())) continue;
    roleNames.add(roleName.toLowerCase());
    const color = typeof role.color === "string" && /^#[0-9a-fA-F]{6}$/.test(role.color) ? role.color : "#9d8cf5";
    statements.push(
      db
        .prepare("INSERT INTO roles (id, server_id, name, color, permissions, position) VALUES (?, ?, ?, ?, 0, ?)")
        .bind(crypto.randomUUID(), serverId, roleName, color, rolePos++),
    );
    createdRoles++;
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  await recordAudit(db, {
    serverId,
    actor: user,
    action: "server.import",
    targetName: sourceLabel,
    detail: `${createdCategories} categories, ${createdChannels} channels, ${createdRoles} roles`,
  });
  await publishStructureChange(serverId);

  return Response.json({
    imported: { categories: createdCategories, channels: createdChannels, roles: createdRoles },
    servers: await listServers(db, user.id),
  });
}
