/**
 * Schema for the Huddle D1 database.
 *
 * Migrations run on demand (once per worker isolate) rather than through a
 * separate migration step, because the production database is a local
 * `wrangler dev --persist-to state` SQLite file that nobody deploys against.
 * Every statement here must therefore stay idempotent.
 */

export const DEFAULT_SERVER_ID = "hangout";

/**
 * DM conversations live in the channels table so messages, pins and deletes all
 * work the same way. `server_id` is NOT NULL from the first schema and SQLite
 * cannot drop that, so DM channels carry this sentinel instead of a real server
 * and every server listing filters it out.
 */
export const DM_SERVER_ID = "dm";

/** Channels the original hardcoded UI shipped with, recreated as real rows. */
const SEED_CHANNELS: Array<{
  id: string;
  name: string;
  kind: "text" | "voice";
  topic: string;
}> = [
  {
    id: "general",
    name: "general",
    kind: "text",
    topic: "Plans, chaos, and whatever else",
  },
  { id: "game-night", name: "game-night", kind: "text", topic: "" },
  { id: "memes", name: "memes", kind: "text", topic: "" },
  { id: "kitchen-table", name: "Kitchen Table", kind: "voice", topic: "" },
  { id: "afk-sofa", name: "AFK Sofa", kind: "voice", topic: "" },
];

let migrated: Promise<void> | null = null;

/** Runs the schema migration once per isolate. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (!migrated) {
    migrated = migrate(db).catch((error) => {
      // Let the next request retry instead of poisoning the isolate.
      migrated = null;
      throw error;
    });
  }
  return migrated;
}

async function columnNames(db: D1Database, table: string): Promise<Set<string>> {
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(
    ((columns.results || []) as Array<{ name: string }>).map((c) => c.name),
  );
}

async function migrate(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel TEXT NOT NULL,
        author TEXT NOT NULL,
        avatar TEXT NOT NULL,
        color TEXT NOT NULL,
        content TEXT NOT NULL,
        attachment_key TEXT,
        is_bot INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS messages_channel_time_idx ON messages(channel, created_at)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_lower TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT NOT NULL,
        color TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        created_by TEXT,
        created_at TEXT NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 1,
        uses INTEGER NOT NULL DEFAULT 0,
        revoked INTEGER NOT NULL DEFAULT 0,
        note TEXT
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'text',
        topic TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS channels_server_idx ON channels(server_id, kind, position)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS dm_members (
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (channel_id, user_id)
      )`),
    // Real server membership. Before this table everyone was implicitly in every
    // server; now a server only shows to people who actually belong to it.
    db.prepare(`CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (server_id, user_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_members_user_idx ON server_members(user_id)",
    ),
    // Tiny key/value store for one-off migration flags.
    db.prepare(`CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS dm_members_user_idx ON dm_members(user_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS voice_prefs (
        user_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        volume INTEGER NOT NULL DEFAULT 100,
        muted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, target_id)
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS server_mutes (
        target_id TEXT PRIMARY KEY,
        muted_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_reads (
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (user_id, channel_id)
      )`),
    // Discord-style roles: a permission bitmask (see lib/permissions.ts) plus a
    // colour that paints member names. `position` orders them; the highest one a
    // member holds wins their name colour.
    db.prepare(`CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#99aab5',
        permissions INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS roles_server_idx ON roles(server_id, position)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS member_roles (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        PRIMARY KEY (server_id, user_id, role_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS member_roles_user_idx ON member_roles(server_id, user_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS bans (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        banned_by TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (server_id, user_id)
      )`),
    // Collapsible groups above channels. Channels point at one via category_id.
    db.prepare(`CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS categories_server_idx ON categories(server_id, position)",
    ),
    // Custom (uploaded) stickers, one row per sticker, grouped by server. The
    // image itself lives in R2 under `key`.
    db.prepare(`CREATE TABLE IF NOT EXISTS stickers (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS stickers_server_idx ON stickers(server_id, created_at)",
    ),
    // Emoji reactions: one row per (message, user, emoji).
    db.prepare(`CREATE TABLE IF NOT EXISTS reactions (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id, emoji)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS reactions_message_idx ON reactions(message_id)",
    ),
    // @mentions, written when a message names someone. Drives unread badges.
    db.prepare(`CREATE TABLE IF NOT EXISTS mentions (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS mentions_user_idx ON mentions(user_id, channel_id, created_at)",
    ),
    // Soundboard clips, short audio in R2 keyed by `key`, grouped by server.
    db.prepare(`CREATE TABLE IF NOT EXISTS sounds (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL DEFAULT '🔊',
        key TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS sounds_server_idx ON sounds(server_id, created_at)",
    ),
    // Custom server emoji, written as :name: and rendered as the image.
    db.prepare(`CREATE TABLE IF NOT EXISTS emojis (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS emojis_server_idx ON emojis(server_id, name)",
    ),
    // Polls live beside the message that renders them.
    db.prepare(`CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        message_id TEXT,
        channel_id TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        multi INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS poll_votes (
        poll_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        choice INTEGER NOT NULL,
        PRIMARY KEY (poll_id, user_id, choice)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS poll_votes_poll_idx ON poll_votes(poll_id)",
    ),
    // Per-channel notification level: all | mentions | nothing.
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_prefs (
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'all',
        PRIMARY KEY (user_id, channel_id)
      )`),
    // A shared battlemap per voice channel. Tokens and paint strokes are JSON
    // blobs: moves fly over the socket and only land here when they settle.
    db.prepare(`CREATE TABLE IF NOT EXISTS battlemaps (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image_key TEXT,
        grid INTEGER NOT NULL DEFAULT 20,
        tokens TEXT NOT NULL DEFAULT '[]',
        strokes TEXT NOT NULL DEFAULT '[]',
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS battlemaps_channel_idx ON battlemaps(channel_id, active)",
    ),
    // One shared activity surface per voice room. Each activity owns a bounded
    // JSON state; the optional secret keeps Draw & Guess prompts off viewers.
    db.prepare(`CREATE TABLE IF NOT EXISTS room_activities (
        channel_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        secret TEXT,
        created_by TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    // A real moderation/audit trail, one row per notable server action.
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        target_name TEXT,
        detail TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS audit_log_server_idx ON audit_log(server_id, created_at)",
    ),
  ]);

  // Columns added after the first release.
  const messageColumns = await columnNames(db, "messages");
  const messageMigrations: D1PreparedStatement[] = [];
  for (const [column, ddl] of [
    ["link", "ALTER TABLE messages ADD COLUMN link TEXT"],
    ["action_label", "ALTER TABLE messages ADD COLUMN action_label TEXT"],
    ["audio_url", "ALTER TABLE messages ADD COLUMN audio_url TEXT"],
    ["channel_id", "ALTER TABLE messages ADD COLUMN channel_id TEXT"],
    ["user_id", "ALTER TABLE messages ADD COLUMN user_id TEXT"],
    ["kind", "ALTER TABLE messages ADD COLUMN kind TEXT"],
    ["payload", "ALTER TABLE messages ADD COLUMN payload TEXT"],
    ["pinned_at", "ALTER TABLE messages ADD COLUMN pinned_at TEXT"],
    ["pinned_by", "ALTER TABLE messages ADD COLUMN pinned_by TEXT"],
    // Soft delete: open tabs need to be told to remove it, and a hard delete
    // would leave them showing a message that no longer exists.
    ["deleted_at", "ALTER TABLE messages ADD COLUMN deleted_at TEXT"],
    // The message this one is a reply to, and when it was last edited.
    ["reply_to", "ALTER TABLE messages ADD COLUMN reply_to TEXT"],
    ["edited_at", "ALTER TABLE messages ADD COLUMN edited_at TEXT"],
    // Extra attachment keys (JSON array). `attachment_key` stays as the first
    // one so older clients and existing rows keep working.
    ["attachments", "ALTER TABLE messages ADD COLUMN attachments TEXT"],
    // Thread replies carry the id of the message that started the thread;
    // channel history hides them so threads stay out of the main flow.
    ["thread_id", "ALTER TABLE messages ADD COLUMN thread_id TEXT"],
    // A bot reply to a slash command records the command it answers and the
    // display name of whoever ran it, so the original slash text need not be
    // kept as its own message.
    ["command_text", "ALTER TABLE messages ADD COLUMN command_text TEXT"],
    ["command_by", "ALTER TABLE messages ADD COLUMN command_by TEXT"],
  ] as const) {
    if (!messageColumns.has(column)) messageMigrations.push(db.prepare(ddl));
  }
  if (messageMigrations.length) await db.batch(messageMigrations);
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS messages_channel_id_time_idx ON messages(channel_id, created_at)",
    )
    .run();

  const userColumns = await columnNames(db, "users");
  const userMigrations: D1PreparedStatement[] = [];
  for (const [column, ddl] of [
    ["avatar_url", "ALTER TABLE users ADD COLUMN avatar_url TEXT"],
    // Presence: online | idle | dnd | invisible, plus a free-text status.
    [
      "status",
      "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'online'",
    ],
    ["custom_status", "ALTER TABLE users ADD COLUMN custom_status TEXT"],
    ["bio", "ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''"],
    ["banner_url", "ALTER TABLE users ADD COLUMN banner_url TEXT"],
    ["pronouns", "ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT ''"],
    ["spotify_activity", "ALTER TABLE users ADD COLUMN spotify_activity TEXT"],
  ] as const) {
    if (!userColumns.has(column)) userMigrations.push(db.prepare(ddl));
  }
  if (userMigrations.length) await db.batch(userMigrations);

  const channelColumns = await columnNames(db, "channels");
  if (!channelColumns.has("category_id")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN category_id TEXT").run();
  }
  if (!channelColumns.has("slowmode")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN slowmode INTEGER NOT NULL DEFAULT 0").run();
  }

  const serverColumns = await columnNames(db, "servers");
  const serverMigrations: D1PreparedStatement[] = [];
  for (const [column, ddl] of [
    ["icon_url", "ALTER TABLE servers ADD COLUMN icon_url TEXT"],
    ["banner_url", "ALTER TABLE servers ADD COLUMN banner_url TEXT"],
  ] as const) {
    if (!serverColumns.has(column)) serverMigrations.push(db.prepare(ddl));
  }
  if (serverMigrations.length) await db.batch(serverMigrations);

  // Invites can now target a specific server, so redeeming one joins you to it.
  const inviteColumns = await columnNames(db, "invites");
  if (!inviteColumns.has("server_id")) {
    await db.prepare("ALTER TABLE invites ADD COLUMN server_id TEXT").run();
  }

  await seedDefaultServer(db);
  await backfillServerMembers(db);
}

/**
 * One-time backfill: the app used to treat every account as a member of every
 * server. To preserve that on upgrade, put every existing user into every
 * existing server exactly once. The `meta` flag stops it re-adding people who
 * later leave a server.
 */
async function backfillServerMembers(db: D1Database): Promise<void> {
  const done = await db
    .prepare("SELECT value FROM meta WHERE key = 'members_backfilled'")
    .first<{ value: string }>();
  if (done) return;

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at)
         SELECT s.id, u.id, ?1
           FROM servers s CROSS JOIN users u
          WHERE s.id != ?2`,
    )
    .bind(now, DM_SERVER_ID)
    .run();
  await db
    .prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('members_backfilled', ?)",
    )
    .bind(now)
    .run();
}

/**
 * Recreates the original hardcoded space as real rows and adopts the messages
 * that were written before channels existed (they only carried a channel name).
 */
async function seedDefaultServer(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db
    .prepare("SELECT COUNT(*) AS count FROM servers")
    .first<{ count: number }>();
  if (!existing?.count) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO servers (id, name, icon, color, created_by, created_at, position)
         VALUES (?, ?, ?, ?, NULL, ?, 0)`,
      )
      .bind(DEFAULT_SERVER_ID, "The Hangout", "HG", "#7b63e6", now)
      .run();

    await db.batch(
      SEED_CHANNELS.map((channel, index) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO channels (id, server_id, name, kind, topic, position, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            channel.id,
            DEFAULT_SERVER_ID,
            channel.name,
            channel.kind,
            channel.topic,
            index,
            now,
          ),
      ),
    );
  }

  // Legacy rows stored the channel *name*; point them at the matching channel.
  await db
    .prepare(
      `UPDATE messages
         SET channel_id = (
           SELECT c.id FROM channels c
            WHERE c.server_id = ?1 AND c.kind = 'text' AND c.name = messages.channel
         )
       WHERE channel_id IS NULL
         AND EXISTS (
           SELECT 1 FROM channels c
            WHERE c.server_id = ?1 AND c.kind = 'text' AND c.name = messages.channel
         )`,
    )
    .bind(DEFAULT_SERVER_ID)
    .run();
}
