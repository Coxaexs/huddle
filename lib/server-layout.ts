/**
 * A server's shape, to be added to a server: categories, channels (with their
 * per-channel permissions) and roles. Starter templates, portable JSON and
 * Discord imports all come through applyServerLayout.
 *
 * Applying is additive and idempotent: a category, channel or role that already
 * exists by name (and, for channels, kind) is reused, not duplicated.
 */
import { OVERWRITE_MASK, type ChannelOverwrite } from "./channel-permissions";
import { ALL_PERMISSIONS, Permission } from "./permissions";

export type LayoutChannelKind = "text" | "voice" | "announcement" | "forum" | "stage";

export interface LayoutOverwrite {
  /** "everyone", or a role by its `ref` in this layout. */
  target: "everyone" | "role";
  roleRef?: string;
  allow: number;
  deny: number;
}

export interface LayoutChannel {
  name: string;
  kind?: LayoutChannelKind;
  topic?: string;
  /** Seconds between posts. */
  slowmode?: number;
  nsfw?: boolean;
  overwrites?: LayoutOverwrite[];
}

export interface LayoutCategory {
  name: string;
  channels: LayoutChannel[];
}

export interface LayoutRole {
  /** How channel overwrites in this layout point at the role. */
  ref?: string;
  name: string;
  color?: string;
  permissions?: number;
}

export interface ServerLayout {
  categories?: LayoutCategory[];
  /** Channels outside any category. */
  channels?: LayoutChannel[];
  roles?: LayoutRole[];
  /** What @everyone gets (only applied to a server made for this layout). */
  everyonePermissions?: number;
}

export interface LayoutResult {
  categories: number;
  channels: number;
  roles: number;
  /** Channels that came in hidden from @everyone. */
  privateChannels: string[];
}

/** Limits per import, generous for a friend group's server and bounded for a batch write. */
export const LAYOUT_LIMITS = { categories: 50, channelsPerCategory: 100, uncategorized: 100, channels: 500, roles: 100 };

/** What @everyone may be handed by an import: member-level things, never moderation or admin. */
export const EVERYONE_IMPORTABLE =
  Permission.CREATE_INVITES |
  Permission.CHANGE_NICKNAME |
  Permission.SEND_MESSAGES |
  Permission.SEND_MESSAGES_IN_THREADS |
  Permission.CREATE_PUBLIC_THREADS |
  Permission.EMBED_LINKS |
  Permission.ATTACH_FILES |
  Permission.ADD_REACTIONS |
  Permission.USE_EXTERNAL_EMOJIS |
  Permission.READ_MESSAGE_HISTORY |
  Permission.CONNECT |
  Permission.SPEAK |
  Permission.VIDEO;

function sanitizeKind(kind?: string): LayoutChannelKind {
  return kind === "voice" || kind === "announcement" || kind === "forum" || kind === "stage" ? kind : "text";
}

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/**
 * Adds a layout to a server. `grantable` caps the permissions given to new
 * roles (an importer cannot create roles stronger than themselves); pass
 * `setEveryone` only for a server that was just made for this layout.
 */
export async function applyServerLayout(
  db: D1Database,
  serverId: string,
  layout: ServerLayout,
  options: { grantable?: number; setEveryone?: boolean } = {},
): Promise<LayoutResult> {
  const grantable = options.grantable ?? ALL_PERMISSIONS;
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const result: LayoutResult = { categories: 0, channels: 0, roles: 0, privateChannels: [] };

  // What the server already has, so applying twice (or onto a server that has
  // some of it) only adds what is missing.
  const [haveCategories, haveChannels, haveRoles, top] = await Promise.all([
    db.prepare("SELECT id, name FROM categories WHERE server_id = ?").bind(serverId).all<{ id: string; name: string }>(),
    db.prepare("SELECT name, kind, position FROM channels WHERE server_id = ?").bind(serverId).all<{ name: string; kind: string; position: number }>(),
    db.prepare("SELECT id, name, position FROM roles WHERE server_id = ?").bind(serverId).all<{ id: string; name: string; position: number }>(),
    db.prepare("SELECT MAX(position) AS position FROM categories WHERE server_id = ?").bind(serverId).first<{ position: number | null }>(),
  ]);
  const categoryIds = new Map(haveCategories.results.map((c) => [c.name.toLowerCase(), c.id]));
  const channelKeys = new Set(haveChannels.results.map((c) => `${c.kind}:${c.name.toLowerCase()}`));
  const roleIds = new Map(haveRoles.results.map((r) => [r.name.toLowerCase(), r.id]));
  let categoryPosition = (top?.position ?? -1) + 1;
  let channelPosition = Math.max(-1, ...haveChannels.results.map((c) => c.position)) + 1;
  let rolePosition = Math.max(0, ...haveRoles.results.map((r) => r.position)) + 1;

  // Roles first, so channel overwrites can point at them.
  const roleByRef = new Map<string, string>();
  for (const role of (layout.roles || []).slice(0, LAYOUT_LIMITS.roles)) {
    const name = clean(role.name, 40);
    if (!name) continue;
    let id = roleIds.get(name.toLowerCase());
    if (!id) {
      id = crypto.randomUUID();
      roleIds.set(name.toLowerCase(), id);
      const color = typeof role.color === "string" && /^#[0-9a-fA-F]{6}$/.test(role.color) ? role.color : "#99aab5";
      const permissions = (Number(role.permissions) || 0) & grantable & ALL_PERMISSIONS & ~Permission.VIEW_CHANNEL;
      statements.push(
        db
          .prepare("INSERT INTO roles (id, server_id, name, color, permissions, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(id, serverId, name, color, permissions, rolePosition++, now),
      );
      result.roles++;
    }
    if (role.ref) roleByRef.set(role.ref, id);
  }

  const addChannel = (channel: LayoutChannel, categoryId: string | null) => {
    if (result.channels >= LAYOUT_LIMITS.channels) return;
    const name = clean(channel.name, 50);
    if (!name) return;
    const kind = sanitizeKind(channel.kind);
    const key = `${kind}:${name.toLowerCase()}`;
    if (channelKeys.has(key)) return;
    channelKeys.add(key);
    const id = crypto.randomUUID();
    const slowmode = Math.max(0, Math.min(21600, Math.trunc(Number(channel.slowmode) || 0)));
    statements.push(
      db
        .prepare(
          "INSERT INTO channels (id, server_id, name, kind, topic, position, category_id, created_at, slowmode, nsfw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, serverId, name, kind, clean(channel.topic, 200), channelPosition++, categoryId, now, slowmode, channel.nsfw ? 1 : 0),
    );
    result.channels++;
    const overwrites: ChannelOverwrite[] = [];
    for (const o of channel.overwrites || []) {
      const allow = (Number(o.allow) || 0) & OVERWRITE_MASK;
      const deny = (Number(o.deny) || 0) & OVERWRITE_MASK & ~allow;
      if (!allow && !deny) continue;
      if (o.target === "everyone") {
        overwrites.push({ targetType: "everyone", targetId: "", allow, deny });
      } else {
        const roleId = o.roleRef ? roleByRef.get(o.roleRef) : undefined;
        if (roleId && !overwrites.some((x) => x.targetType === "role" && x.targetId === roleId)) {
          overwrites.push({ targetType: "role", targetId: roleId, allow, deny });
        }
      }
    }
    for (const o of overwrites) {
      statements.push(
        db
          .prepare(
            "INSERT INTO channel_overwrites (channel_id, server_id, target_type, target_id, allow, deny) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(id, serverId, o.targetType, o.targetId, o.allow, o.deny),
      );
    }
    if (overwrites.some((o) => o.targetType === "everyone" && o.deny & Permission.VIEW_CHANNEL)) {
      result.privateChannels.push(name);
    }
  };

  for (const channel of (layout.channels || []).slice(0, LAYOUT_LIMITS.uncategorized)) addChannel(channel, null);
  for (const category of (layout.categories || []).slice(0, LAYOUT_LIMITS.categories)) {
    const name = clean(category.name, 50);
    if (!name) continue;
    let id = categoryIds.get(name.toLowerCase());
    if (!id) {
      id = crypto.randomUUID();
      categoryIds.set(name.toLowerCase(), id);
      statements.push(
        db
          .prepare("INSERT INTO categories (id, server_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(id, serverId, name, categoryPosition++, now),
      );
      result.categories++;
    }
    for (const channel of (category.channels || []).slice(0, LAYOUT_LIMITS.channelsPerCategory)) addChannel(channel, id);
  }

  if (options.setEveryone && layout.everyonePermissions !== undefined) {
    statements.push(
      db
        .prepare("UPDATE servers SET everyone_permissions = ? WHERE id = ?")
        .bind((Number(layout.everyonePermissions) || 0) & EVERYONE_IMPORTABLE, serverId),
    );
  }

  // D1 batches are one transaction; keep each well under its statement cap.
  for (let i = 0; i < statements.length; i += 200) {
    await db.batch(statements.slice(i, i + 200));
  }
  return result;
}
