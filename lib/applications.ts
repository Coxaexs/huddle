/**
 * Applications: bots anyone can make in the Developer Portal and add to a
 * server with an invite link, the way Discord does it.
 *
 * An application has one token and works in every server that added it. Each
 * of those is a `server_bots` row with `application_id` set, holding the
 * permissions granted when it was added. A bot gets exactly those and nothing
 * else: see lib/discord/app-permissions.ts.
 */
import type { BotIdentity } from "./bot-auth";
import { GatewayIntent } from "./discord/protocol";
import { ALL_PERMISSIONS, Permission } from "./permissions";
import { MUSIC_BOT_PERMISSIONS } from "./schema";

export const APP_TOKEN_PREFIX = "hfl_app_";
export const MAX_APPLICATIONS_PER_USER = 25;
export const MAX_BOTS_PER_SERVER = 50;

/** The intents a bot must switch on in the portal before it may ask for them. */
export const PRIVILEGED_INTENTS =
  GatewayIntent.GuildMembers | GatewayIntent.GuildPresences | GatewayIntent.MessageContent;

export interface ApplicationRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  avatar: string;
  token_hash: string;
  public: number;
  intents: number;
  kind: string;
  /** May play audio in voice rooms through the room player. */
  player: number;
  disabled_at: string | null;
  created_at: string;
}

export interface PublicApplication {
  id: string;
  name: string;
  description: string;
  avatar: string;
  public: boolean;
  intents: number;
  player: boolean;
  servers: number;
  createdAt: string;
  /** Ticked in the permission calculator to start with. */
  defaultPermissions: number;
  /** Bots servers rely on can't be deleted. */
  deletable: boolean;
}

const STARTING_PERMISSIONS =
  Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.READ_MESSAGE_HISTORY;

export async function hashAppToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function mintAppToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return APP_TOKEN_PREFIX + Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function applicationByToken(db: D1Database, token: string): Promise<ApplicationRow | null> {
  return db
    .prepare("SELECT * FROM applications WHERE token_hash = ? AND disabled_at IS NULL")
    .bind(await hashAppToken(token))
    .first<ApplicationRow>();
}

export async function applicationById(db: D1Database, id: string): Promise<ApplicationRow | null> {
  return db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first<ApplicationRow>();
}

/** Server id -> the permissions it granted, for the servers this bot is on in. */
export async function applicationGrants(db: D1Database, applicationId: string): Promise<Record<string, number>> {
  const { results } = await db
    .prepare("SELECT server_id, permissions FROM server_bots WHERE application_id = ? AND enabled = 1")
    .bind(applicationId)
    .all<{ server_id: string; permissions: number }>();
  const grants: Record<string, number> = {};
  for (const row of results || []) grants[row.server_id] = Number(row.permissions) || 0;
  return grants;
}

export async function applicationIdentity(db: D1Database, app: ApplicationRow): Promise<BotIdentity> {
  return {
    id: app.id,
    name: app.name,
    avatar: app.avatar || "🤖",
    serverId: null,
    isMaster: false,
    kind: app.kind,
    applicationId: app.id,
    grants: await applicationGrants(db, app.id),
    privilegedIntents: Number(app.intents) & PRIVILEGED_INTENTS,
    player: Boolean(app.player) || app.kind === "music",
  };
}

export async function publicApplication(db: D1Database, app: ApplicationRow): Promise<PublicApplication> {
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM server_bots WHERE application_id = ?")
    .bind(app.id)
    .first<{ n: number }>();
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    avatar: app.avatar,
    public: Boolean(app.public),
    intents: Number(app.intents) & PRIVILEGED_INTENTS,
    player: Boolean(app.player) || app.kind === "music",
    servers: count?.n ?? 0,
    createdAt: app.created_at,
    defaultPermissions: app.kind === "music" ? MUSIC_BOT_PERMISSIONS : STARTING_PERMISSIONS,
    deletable: app.kind === "custom",
  };
}

/** Names that would pass a stranger's bot off as Hoffle itself. */
const RESERVED_NAME = /hoffle|huddle|discord|system|admin|moderator/i;

export function cleanApplicationName(raw: unknown, mayUseReserved: boolean): string | { error: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 32) return { error: "Give your bot a name of 2 to 32 characters." };
  if (!mayUseReserved && RESERVED_NAME.test(name)) return { error: "That name is reserved. Pick another one." };
  return name;
}

/** Reads a permissions number from a link or form; unknown bits are dropped. */
export function cleanPermissions(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return value & ALL_PERMISSIONS;
}

/** Adds the bot to a server, or updates what it was granted if it is there. */
export async function installApplication(
  db: D1Database,
  app: ApplicationRow,
  serverId: string,
  permissions: number,
  addedBy: string,
  placeholderToken: string,
): Promise<void> {
  const existing = await db
    .prepare("SELECT id FROM server_bots WHERE server_id = ? AND application_id = ?")
    .bind(serverId, app.id)
    .first<{ id: string }>();
  if (existing) {
    await db
      .prepare("UPDATE server_bots SET permissions = ?, enabled = 1 WHERE id = ?")
      .bind(permissions, existing.id)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO server_bots (id, server_id, name, avatar, token, description, kind, enabled, created_by, created_at, application_id, permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      serverId,
      app.name,
      app.avatar,
      placeholderToken,
      app.description,
      app.kind,
      addedBy,
      new Date().toISOString(),
      app.id,
      permissions,
    )
    .run();
}
