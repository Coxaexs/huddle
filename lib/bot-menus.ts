/**
 * A bot's own right-click menu, the way the music bot and the D&D bot have one.
 *
 * A bot lists up to ten items; each one is a label and one of its own slash
 * commands. Right-clicking one of the bot's messages shows the list, and
 * picking an item sends that command to that bot as the person who picked it.
 * So a menu can do nothing a person could not already do by typing, and the
 * bot hears about it the usual way (INTERACTION_CREATE).
 *
 * Only the bot's own commands are shown, and a pick is delivered to that bot
 * alone (POST /api/commands with `botId`). An item naming someone else's
 * command is dropped when the menu is read, and a bot that names a command
 * after one of Hoffle's own still only ever receives its own: a friendly
 * label can never be a disguise for "/purge".
 */
export const MAX_MENU_ITEMS = 10;
const COMMAND = /^\/([a-z0-9_-]{1,32})(?: [^\n]{0,160})?$/;

export interface BotMenuItem {
  label: string;
  /** An emoji shown before the label. */
  icon: string;
  /** The slash command to run, as typed: "/quiz start". */
  command: string;
  /** Put the command in the message box for the person to finish, instead of running it. */
  fill: boolean;
}

export interface PublicBotMenu {
  applicationId: string;
  botName: string;
  description: string;
  items: BotMenuItem[];
}

/** The command's name: "/quiz start" -> "quiz". */
export function commandName(command: string): string {
  return COMMAND.exec(command)?.[1] ?? "";
}

/** What a bot sent, cleaned, or what is wrong with it. */
export function cleanMenu(body: Record<string, unknown>): { items: BotMenuItem[] } | { error: string } {
  if (!Array.isArray(body.items)) return { error: "A menu needs an items list." };
  if (body.items.length > MAX_MENU_ITEMS) return { error: `A menu holds ${MAX_MENU_ITEMS} items at most.` };
  const items: BotMenuItem[] = [];
  for (const raw of body.items) {
    const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const label = String(entry.label ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!label) return { error: "Every menu item needs a label." };
    const command = String(entry.command ?? "").trim();
    if (!COMMAND.test(command)) {
      return { error: `"${label}" needs a command: one of your slash commands, written as typed ("/quiz start").` };
    }
    items.push({ label, icon: String(entry.icon ?? "").trim().slice(0, 8), command, fill: entry.fill === true });
  }
  return { items };
}

function parseItems(json: string): BotMenuItem[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    const clean = cleanMenu({ items: parsed });
    return "items" in clean ? clean.items : [];
  } catch {
    return [];
  }
}

/** A bot's menu as it stored it. */
export async function menuOf(db: D1Database, applicationId: string): Promise<BotMenuItem[]> {
  const row = await db.prepare("SELECT items FROM bot_menus WHERE application_id = ?").bind(applicationId).first<{ items: string }>();
  return row ? parseItems(row.items) : [];
}

export async function saveMenu(db: D1Database, applicationId: string, items: BotMenuItem[]): Promise<void> {
  await db
    .prepare(
      `INSERT INTO bot_menus (application_id, items, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (application_id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at`,
    )
    .bind(applicationId, JSON.stringify(items), new Date().toISOString())
    .run();
}

export async function deleteMenu(db: D1Database, applicationId: string): Promise<void> {
  await db.prepare("DELETE FROM bot_menus WHERE application_id = ?").bind(applicationId).run();
}

/**
 * The menus of the bots in a server, each cut down to the commands that bot
 * really has there (its global ones and the ones it registered for this server).
 */
export async function menusInServer(db: D1Database, serverId: string): Promise<PublicBotMenu[]> {
  const { results } = await db
    .prepare(
      `SELECT m.application_id, m.items, app.name AS bot_name, app.description
         FROM bot_menus m
         JOIN server_bots b ON b.application_id = m.application_id AND b.enabled = 1
         JOIN applications app ON app.id = m.application_id AND app.disabled_at IS NULL
        WHERE b.server_id = ?`,
    )
    .bind(serverId)
    .all<{ application_id: string; items: string; bot_name: string; description: string }>();
  if (!results?.length) return [];
  // Every command these bots have here, in one read.
  const owned = await db
    .prepare(
      `SELECT c.bot_id, c.name FROM discord_commands c
        WHERE c.type = 1 AND (c.server_id IS NULL OR c.server_id = ?)
          AND c.bot_id IN (SELECT application_id FROM bot_menus)`,
    )
    .bind(serverId)
    .all<{ bot_id: string; name: string }>();
  const namesByBot = new Map<string, Set<string>>();
  for (const command of owned.results || []) {
    const names = namesByBot.get(command.bot_id) ?? new Set<string>();
    names.add(command.name);
    namesByBot.set(command.bot_id, names);
  }
  const menus: PublicBotMenu[] = [];
  for (const row of results) {
    const names = namesByBot.get(row.application_id);
    const items = names ? parseItems(row.items).filter((item) => names.has(commandName(item.command))) : [];
    if (items.length) {
      menus.push({ applicationId: row.application_id, botName: row.bot_name, description: row.description || "", items });
    }
  }
  return menus;
}
