/**
 * Schema for the Huddle D1 database.
 *
 * Migrations run on demand (once per worker isolate) rather than through a
 * separate migration step, because the production database is a local
 * `wrangler dev --persist-to state` SQLite file that nobody deploys against.
 * Every statement here must therefore stay idempotent.
 */

import { migrateProfileImages } from "./profile-media";

export const DEFAULT_SERVER_ID = "hangout";

/**
 * Schema version, bumped whenever a structural change is made. Persisted in
 * the `meta` table under `schema_version` so the running database always
 * reports which version its schema matches. All statements in `migrate()` stay
 * idempotent, so applying an older version to a newer DB is a no-op.
 */
export const SCHEMA_VERSION = 23;

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
        can_invite INTEGER NOT NULL DEFAULT 0,
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
    // Fixed-window counters for login/signup throttling. One row per bucket per
    // window; `lib/rate-limit.ts` prunes expired rows opportunistically.
    db.prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_start)",
    ),
    // One row per /ask answer, so its limits can be a true rolling window
    // (fixed windows let 3/min become 6 in a few seconds across a boundary).
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_usage (
        user_id TEXT NOT NULL,
        at INTEGER NOT NULL
      )`),
    db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_user_idx ON ai_usage(user_id, at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS ai_usage_at_idx ON ai_usage(at)"),
    // Per-server automod rules. `config` is a JSON blob whose shape depends on
    // `kind`; lib/automod.ts is the only thing that reads it, and it validates
    // on the way out so a malformed row can never match anything.
    db.prepare(`CREATE TABLE IF NOT EXISTS automod_rules (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        action TEXT NOT NULL DEFAULT 'block',
        timeout_minutes INTEGER NOT NULL DEFAULT 0,
        config TEXT NOT NULL DEFAULT '{}',
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS automod_rules_server_idx ON automod_rules(server_id)",
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
        hidden_at TEXT,
        pinned_at TEXT,
        PRIMARY KEY (channel_id, user_id)
      )`),
    // Real server membership. Before this table everyone was implicitly in every
    // server; now a server only shows to people who actually belong to it.
    db.prepare(`CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        invite_code TEXT,
        PRIMARY KEY (server_id, user_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_members_user_idx ON server_members(user_id)",
    ),
    // Per-member server ordering for the rail. Each user can drag servers into
    // their own order; absent rows fall back to the global servers.position.
    db.prepare(`CREATE TABLE IF NOT EXISTS server_member_positions (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (server_id, user_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_member_positions_user_idx ON server_member_positions(user_id, position)",
    ),
    // Bytes one account has uploaded per UTC day (lib/upload-quota.ts).
    db.prepare(`CREATE TABLE IF NOT EXISTS upload_usage (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day)
      )`),
    // Tiny key/value store for one-off migration flags.
    db.prepare(`CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS dm_members_user_idx ON dm_members(user_id)",
    ),
    // Friends system (pending requests, accepted friends, blocked users)
    db.prepare(`CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, friend_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS friendships_user_idx ON friendships(user_id, status)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS friendships_friend_idx ON friendships(friend_id, status)",
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
    // Welcome screen: rules (and an optional intro form) shown to people who
    // join a server after the owner switched it on.
    db.prepare(`CREATE TABLE IF NOT EXISTS server_welcome (
        server_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        enabled_at TEXT,
        rules TEXT NOT NULL DEFAULT '',
        fields TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS server_welcome_answers (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        answers TEXT NOT NULL DEFAULT '{}',
        accepted_at TEXT NOT NULL,
        PRIMARY KEY (server_id, user_id)
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
    // Per-channel permissions (lib/channel-permissions.ts): what @everyone
    // (target_id ''), a role or one member may or may not do in a channel.
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_overwrites (
        channel_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL DEFAULT '',
        allow INTEGER NOT NULL DEFAULT 0,
        deny INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (channel_id, target_type, target_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS channel_overwrites_server_idx ON channel_overwrites(server_id)",
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
    // Earlier versions of edited messages: one row per replaced text.
    db.prepare(`CREATE TABLE IF NOT EXISTS message_edits (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        content TEXT NOT NULL,
        written_at TEXT NOT NULL,
        replaced_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS message_edits_message_idx ON message_edits(message_id, replaced_at)",
    ),
    // Scheduled events (game nights, sessions) and who is coming.
    db.prepare(`CREATE TABLE IF NOT EXISTS server_events (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        channel_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        starts_at TEXT NOT NULL,
        ends_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        reminded_at TEXT,
        started_at TEXT
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_events_server_idx ON server_events(server_id, starts_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_events_starts_idx ON server_events(starts_at)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS event_rsvps (
        event_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (event_id, user_id)
      )`),
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
    // Per-channel notification level: all | mentions | nothing, plus optional temporary mute.
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_prefs (
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'all',
        muted_until TEXT,
        PRIMARY KEY (user_id, channel_id)
      )`),
    // Cached link previews (title/description/image scraped from a page).
    // `data` is JSON, or empty when the page had nothing worth showing.
    db.prepare(`CREATE TABLE IF NOT EXISTS link_previews (
        url TEXT PRIMARY KEY,
        data TEXT,
        fetched_at TEXT NOT NULL
      )`),
    // A shared battlemap per voice channel. Tokens and paint strokes are JSON
    // blobs: moves fly over the socket and only land here when they settle.
    db.prepare(`CREATE TABLE IF NOT EXISTS battlemaps (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image_key TEXT,
        grid INTEGER NOT NULL DEFAULT 20,
        rows INTEGER,
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
    // Conversation games (lib/games.ts): the public state rides in the
    // message payload; what players mustn't see yet (mines, hidden throws)
    // stays here, keyed by the game's message.
    // MSN contact list extras, one JSON blob per user: custom groups, who is
    // in which, and whose sign-ins shouldn't pop a toast (lib/msn-contacts.ts).
    db.prepare(`CREATE TABLE IF NOT EXISTS msn_contacts (
        user_id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      )`),
    // Personal emoticons: a picture you type with your own shortcut, "(cat)".
    db.prepare(`CREATE TABLE IF NOT EXISTS user_emoticons (
        user_id TEXT NOT NULL,
        shortcut TEXT NOT NULL,
        upload_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, shortcut)
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS conversation_games (
        message_id TEXT PRIMARY KEY,
        secret TEXT NOT NULL DEFAULT '{}'
      )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS room_activities (
        channel_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        secret TEXT,
        created_by TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    // Web push subscriptions, one row per browser/device a user has enabled.
    // The endpoint/auth/p256dh are what the server needs to send the push.
    db.prepare(`CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id)",
    ),
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
    // Campaign presentation data is intentionally public-only. Private sheet
    // fields remain in the companion app and never enter recording payloads.
    db.prepare(`CREATE TABLE IF NOT EXISTS dnd_campaigns (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS dnd_campaigns_server_idx ON dnd_campaigns(server_id, name)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS campaign_characters (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        portrait_key TEXT,
        artwork_key TEXT,
        class_name TEXT,
        level INTEGER,
        accent_color TEXT NOT NULL DEFAULT '#ffd67c',
        show_player_name INTEGER NOT NULL DEFAULT 0,
        public_card_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (campaign_id, user_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS campaign_characters_campaign_idx ON campaign_characters(campaign_id)",
    ),
    // Workers coordinate and audit recordings; media paths and large files are
    // deliberately absent. The host recorder owns those on local storage.
    db.prepare(`CREATE TABLE IF NOT EXISTS recording_sessions (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        controller_id TEXT NOT NULL,
        title TEXT NOT NULL,
        campaign_id TEXT,
        campaign_name TEXT,
        episode_number INTEGER,
        resolution TEXT NOT NULL DEFAULT '1920x1080',
        frame_rate INTEGER NOT NULL DEFAULT 30,
        theme TEXT NOT NULL DEFAULT 'tavern',
        separate_audio INTEGER NOT NULL DEFAULT 0,
        retention_days INTEGER NOT NULL DEFAULT 90,
        automatic_direction INTEGER NOT NULL DEFAULT 1,
        locked_speaker_id TEXT,
        scene TEXT NOT NULL DEFAULT 'party',
        status TEXT NOT NULL DEFAULT 'awaiting-consent',
        started_at TEXT,
        active_since_at TEXT,
        paused_at TEXT,
        stopped_at TEXT,
        accumulated_ms INTEGER NOT NULL DEFAULT 0,
        estimated_bytes INTEGER NOT NULL DEFAULT 0,
        disk_free_bytes INTEGER,
        recorder_last_seen_at TEXT,
        error TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS recording_sessions_channel_idx ON recording_sessions(channel_id, created_at)",
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS recording_sessions_one_active_idx
         ON recording_sessions(channel_id)
       WHERE status IN ('awaiting-consent','countdown','recording','paused','finalizing')`,
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS recording_participants (
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 1,
        decision TEXT NOT NULL DEFAULT 'pending',
        decided_at TEXT,
        joined_at TEXT,
        left_at TEXT,
        PRIMARY KEY (session_id, user_id)
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS recording_participants_session_idx ON recording_participants(session_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS recording_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        actor_id TEXT,
        at_ms INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        automatic INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS recording_events_timeline_idx ON recording_events(session_id, at_ms, created_at)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS recording_dice_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        roller_id TEXT NOT NULL,
        expression TEXT NOT NULL,
        rolls_json TEXT NOT NULL,
        modifier INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        roll_type TEXT NOT NULL DEFAULT 'normal',
        animation_seed TEXT NOT NULL,
        at_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS recording_dice_timeline_idx ON recording_dice_events(session_id, at_ms, created_at)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS recording_outputs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        checksum TEXT,
        completed_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS recording_outputs_session_idx ON recording_outputs(session_id)",
    ),
    db.prepare(`CREATE TABLE IF NOT EXISTS recorder_diagnostics (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        level TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS recorder_diagnostics_session_idx ON recorder_diagnostics(session_id, created_at)",
    ),
    // Bots and integrations added to servers
    db.prepare(`CREATE TABLE IF NOT EXISTS server_bots (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT NOT NULL DEFAULT '🤖',
        token TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'custom',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by TEXT,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_bots_server_idx ON server_bots(server_id, enabled)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS server_bots_token_idx ON server_bots(token)",
    ),
    // Custom user and community themes
    db.prepare(`CREATE TABLE IF NOT EXISTS custom_themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        base_theme TEXT NOT NULL DEFAULT 'cozy',
        colors TEXT NOT NULL,
        corners INTEGER NOT NULL DEFAULT 16,
        backdrop TEXT NOT NULL DEFAULT 'plain',
        custom_css TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        creator_name TEXT NOT NULL DEFAULT '',
        creator_username TEXT NOT NULL DEFAULT '',
        is_public INTEGER NOT NULL DEFAULT 1,
        stars INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS custom_themes_public_idx ON custom_themes(is_public, created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS custom_themes_user_idx ON custom_themes(created_by)",
    ),
    // ---- Discord-compatible bot surface ----
    // Every object a bot can see needs a snowflake, because Discord libraries
    // parse ids as 64-bit integers. Allocated on first sight and kept here so
    // the id a bot was handed keeps resolving back to the same native row.
    db.prepare(`CREATE TABLE IF NOT EXISTS discord_ids (
        snowflake TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        native_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS discord_ids_native_idx ON discord_ids(kind, native_id)",
    ),
    // Application commands registered by bots over /applications/{id}/commands.
    // `options` is the raw Discord option array, replayed verbatim to clients.
    db.prepare(`CREATE TABLE IF NOT EXISTS discord_commands (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        server_id TEXT,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type INTEGER NOT NULL DEFAULT 1,
        options TEXT NOT NULL DEFAULT '[]',
        default_member_permissions TEXT,
        dm_permission INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS discord_commands_scope_idx ON discord_commands(bot_id, server_id, name)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS discord_commands_server_idx ON discord_commands(server_id)",
    ),
    // Live interactions. A bot has 3 seconds to acknowledge and 15 minutes to
    // edit, so the token outlives the request that created it and needs a home.
    db.prepare(`CREATE TABLE IF NOT EXISTS discord_interactions (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        bot_id TEXT NOT NULL,
        server_id TEXT,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        command_name TEXT NOT NULL DEFAULT '',
        type INTEGER NOT NULL DEFAULT 2,
        state TEXT NOT NULL DEFAULT 'pending',
        response_message_id TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS discord_interactions_expiry_idx ON discord_interactions(expires_at)",
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
    // Who actually sent a bot-styled post (a /roll card, a music answer). The
    // message shows the bot, but moderation and deletion need the person.
    ["sender_id", "ALTER TABLE messages ADD COLUMN sender_id TEXT"],
  ] as const) {
    if (!messageColumns.has(column)) messageMigrations.push(db.prepare(ddl));
  }
  if (messageMigrations.length) await db.batch(messageMigrations);
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS messages_channel_id_time_idx ON messages(channel_id, created_at)",
    )
    .run();
  // Every channel load counts replies per thread root; without this it scans
  // the whole messages table.
  await db
    .prepare("CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id, created_at)")
    .run();

  // Self-hosted push: "webpush" rows are browser/UnifiedPush subscriptions,
  // "ntfy" rows are plain HTTP topics (ntfy, or any UnifiedPush endpoint).
  const pushColumns = await columnNames(db, "push_subscriptions");
  if (!pushColumns.has("kind")) {
    await db
      .prepare(
        "ALTER TABLE push_subscriptions ADD COLUMN kind TEXT NOT NULL DEFAULT 'webpush'",
      )
      .run();
  }

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
    // When the custom status clears itself (ms since epoch); null keeps it.
    ["custom_status_expires_at", "ALTER TABLE users ADD COLUMN custom_status_expires_at INTEGER"],
    ["bio", "ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''"],
    ["banner_url", "ALTER TABLE users ADD COLUMN banner_url TEXT"],
    ["pronouns", "ALTER TABLE users ADD COLUMN pronouns TEXT NOT NULL DEFAULT ''"],
    ["pride_badges", "ALTER TABLE users ADD COLUMN pride_badges TEXT NOT NULL DEFAULT '[]'"],
    ["spotify_activity", "ALTER TABLE users ADD COLUMN spotify_activity TEXT"],
    ["activity", "ALTER TABLE users ADD COLUMN activity TEXT"],
    ["lastfm_username", "ALTER TABLE users ADD COLUMN lastfm_username TEXT"],
    ["can_invite", "ALTER TABLE users ADD COLUMN can_invite INTEGER NOT NULL DEFAULT 0"],
    ["custom_css", "ALTER TABLE users ADD COLUMN custom_css TEXT"],
    ["custom_theme", "ALTER TABLE users ADD COLUMN custom_theme TEXT"],
    ["tagline", "ALTER TABLE users ADD COLUMN tagline TEXT NOT NULL DEFAULT ''"],
    ["social_links", "ALTER TABLE users ADD COLUMN social_links TEXT NOT NULL DEFAULT '[]'"],
    ["avatar_frame", "ALTER TABLE users ADD COLUMN avatar_frame TEXT NOT NULL DEFAULT 'none'"],
    ["profile_effect", "ALTER TABLE users ADD COLUMN profile_effect TEXT NOT NULL DEFAULT 'none'"],
    ["nameplate", "ALTER TABLE users ADD COLUMN nameplate TEXT NOT NULL DEFAULT 'none'"],
    ["profile_frame", "ALTER TABLE users ADD COLUMN profile_frame TEXT NOT NULL DEFAULT 'none'"],
    ["profile_style", "ALTER TABLE users ADD COLUMN profile_style TEXT NOT NULL DEFAULT '{}'"],
    // Set by an instance admin in /admin: the account cannot sign in or act.
    ["suspended_at", "ALTER TABLE users ADD COLUMN suspended_at TEXT"],
    ["quick_reactions", "ALTER TABLE users ADD COLUMN quick_reactions TEXT NOT NULL DEFAULT '[]'"],
    ["hidden_emojis", "ALTER TABLE users ADD COLUMN hidden_emojis TEXT NOT NULL DEFAULT '[]'"],
    // Optional recovery address (lower-cased), used for password resets.
    ["email", "ALTER TABLE users ADD COLUMN email TEXT"],
    // Set once someone clicks "Skip for now" on the add-an-email prompt.
    ["email_prompt_skipped", "ALTER TABLE users ADD COLUMN email_prompt_skipped INTEGER NOT NULL DEFAULT 0"],
    // How the account came to exist: "first" (the owner), "invite" or "open"
    // (open signup). NULL on accounts that predate the column.
    ["signup_source", "ALTER TABLE users ADD COLUMN signup_source TEXT"],
    // Salted hash of the address it signed up from, so an admin can see which
    // accounts came from the same place. The address itself is never stored.
    ["signup_ip_hash", "ALTER TABLE users ADD COLUMN signup_ip_hash TEXT"],
    ["disabled_modules", "ALTER TABLE users ADD COLUMN disabled_modules TEXT NOT NULL DEFAULT '[]'"],
    // Earned achievements the member pinned to their profile (JSON id list).
    ["achievement_showcase", "ALTER TABLE users ADD COLUMN achievement_showcase TEXT NOT NULL DEFAULT '[]'"],
    // Who may start a new conversation with this person (lib/dm-policy.ts).
    ["dm_policy", "ALTER TABLE users ADD COLUMN dm_policy TEXT NOT NULL DEFAULT 'everyone'"],
    // Where the panels sit and which widgets are pinned (lib/layout-prefs.ts).
    // NULL is the default layout.
    ["layout_prefs", "ALTER TABLE users ADD COLUMN layout_prefs TEXT"],
  ] as const) {
    if (!userColumns.has(column)) userMigrations.push(db.prepare(ddl));
  }
  if (userMigrations.length) await db.batch(userMigrations);

  // What Settings → Security shows for each signed-in device: the browser it
  // signed in from, the address, and when it was last used (updated at most
  // every ten minutes, see `currentUser`).
  const sessionColumns = await columnNames(db, "sessions");
  const sessionMigrations: D1PreparedStatement[] = [];
  for (const [column, ddl] of [
    ["user_agent", "ALTER TABLE sessions ADD COLUMN user_agent TEXT"],
    ["ip", "ALTER TABLE sessions ADD COLUMN ip TEXT"],
    ["last_used_at", "ALTER TABLE sessions ADD COLUMN last_used_at TEXT"],
  ] as const) {
    if (!sessionColumns.has(column)) sessionMigrations.push(db.prepare(ddl));
  }
  if (sessionMigrations.length) await db.batch(sessionMigrations);

  await db.batch([
    // One person may run several accounts on the same address, so not UNIQUE.
    db.prepare("DROP INDEX IF EXISTS users_email_idx"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS users_signup_ip_idx ON users(signup_ip_hash) WHERE signup_ip_hash IS NOT NULL",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS users_email_lookup_idx ON users(email) WHERE email IS NOT NULL",
    ),
    // One-time password reset links; only the SHA-256 of the token is kept.
    db.prepare(`CREATE TABLE IF NOT EXISTS password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id)",
    ),
    // An address waiting for its owner to type back the mailed code.
    db.prepare(`CREATE TABLE IF NOT EXISTS email_verifications (
        user_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`),
  ]);

  await db
    .prepare(`CREATE TABLE IF NOT EXISTS custom_themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        base_theme TEXT NOT NULL DEFAULT 'cozy',
        colors TEXT NOT NULL,
        corners INTEGER NOT NULL DEFAULT 16,
        backdrop TEXT NOT NULL DEFAULT 'plain',
        custom_css TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        creator_name TEXT NOT NULL DEFAULT '',
        creator_username TEXT NOT NULL DEFAULT '',
        is_public INTEGER NOT NULL DEFAULT 1,
        stars INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
    .run();

  const channelColumns = await columnNames(db, "channels");
  if (!channelColumns.has("category_id")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN category_id TEXT").run();
  }
  if (!channelColumns.has("slowmode")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN slowmode INTEGER NOT NULL DEFAULT 0").run();
  }
  // Voice channels only; 0 means "the default" (see lib/voice-quality).
  if (!channelColumns.has("bitrate")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN bitrate INTEGER NOT NULL DEFAULT 0").run();
  }
  // Voice rooms: whether the soundboard plays here (moderators can switch it off).
  if (!channelColumns.has("soundboard")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN soundboard INTEGER NOT NULL DEFAULT 1").run();
  }
  // Voice rooms: preferred voice server region ("auto", "nl", "de").
  if (!channelColumns.has("rtc_region")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN rtc_region TEXT NOT NULL DEFAULT 'auto'").run();
  }
  // Age-restricted: members confirm they are 18+ before the channel opens.
  if (!channelColumns.has("nsfw")) {
    await db.prepare("ALTER TABLE channels ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 0").run();
  }

  // A role's icon beside member names: an emoji or an uploaded image path.
  const roleColumns = await columnNames(db, "roles");
  if (!roleColumns.has("icon")) {
    await db.prepare("ALTER TABLE roles ADD COLUMN icon TEXT").run();
  }

  const pollColumns = await columnNames(db, "polls");
  if (!pollColumns.has("is_private")) {
    await db.prepare("ALTER TABLE polls ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0").run();
  }

  const serverColumns = await columnNames(db, "servers");
  const serverMigrations: D1PreparedStatement[] = [];
  for (const [column, ddl] of [
    ["icon_url", "ALTER TABLE servers ADD COLUMN icon_url TEXT"],
    ["banner_url", "ALTER TABLE servers ADD COLUMN banner_url TEXT"],
    ["is_public", "ALTER TABLE servers ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0"],
    ["description", "ALTER TABLE servers ADD COLUMN description TEXT NOT NULL DEFAULT ''"],
    ["disabled_modules", "ALTER TABLE servers ADD COLUMN disabled_modules TEXT NOT NULL DEFAULT '[]'"],
    ["raid_mode", "ALTER TABLE servers ADD COLUMN raid_mode INTEGER NOT NULL DEFAULT 0"],
    // What an account needs before it may post here (lib/verification-level.ts).
    ["verification_level", "ALTER TABLE servers ADD COLUMN verification_level INTEGER NOT NULL DEFAULT 0"],
    // The server's custom invite code; an invites row with this code exists too.
    ["vanity_code", "ALTER TABLE servers ADD COLUMN vanity_code TEXT"],
    // What every member gets before any role: the @everyone permissions.
    ["everyone_permissions", "ALTER TABLE servers ADD COLUMN everyone_permissions INTEGER NOT NULL DEFAULT 0"],
    // Readable on the web at hoffle.online/s/... (lib/web-public.ts); off unless the owner turns it on.
    ["web_public", "ALTER TABLE servers ADD COLUMN web_public INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    if (!serverColumns.has(column)) serverMigrations.push(db.prepare(ddl));
  }
  if (serverMigrations.length) await db.batch(serverMigrations);
  if (!serverColumns.has("is_public")) {
    await db.prepare("UPDATE servers SET is_public = 1 WHERE id = ?").bind(DEFAULT_SERVER_ID).run();
  }

  // Invites can now target a specific server, so redeeming one joins you to it.
  const inviteColumns = await columnNames(db, "invites");
  if (!inviteColumns.has("server_id")) {
    await db.prepare("ALTER TABLE invites ADD COLUMN server_id TEXT").run();
  }
  // Account invites can pick the new member's starting theme and server.
  if (!inviteColumns.has("default_theme")) {
    await db.prepare("ALTER TABLE invites ADD COLUMN default_theme TEXT").run();
  }
  if (!inviteColumns.has("default_server_id")) {
    await db.prepare("ALTER TABLE invites ADD COLUMN default_server_id TEXT").run();
  }
  // A server invite can name the channel people land in when they join.
  if (!inviteColumns.has("channel_id")) {
    await db.prepare("ALTER TABLE invites ADD COLUMN channel_id TEXT").run();
  }

  const memberColumns = await columnNames(db, "server_members");
  if (!memberColumns.has("invite_code")) {
    await db
      .prepare("ALTER TABLE server_members ADD COLUMN invite_code TEXT")
      .run();
  }
  // Closing a DM hides it from your list (per person); messages stay.
  // Pinning keeps it pinned to the top of your DM list.
  const dmColumns = await columnNames(db, "dm_members");
  if (!dmColumns.has("hidden_at")) {
    await db.prepare("ALTER TABLE dm_members ADD COLUMN hidden_at TEXT").run();
  }
  if (!dmColumns.has("pinned_at")) {
    await db.prepare("ALTER TABLE dm_members ADD COLUMN pinned_at TEXT").run();
  }
  // Group DMs are DM channels with more than two seats; the flag keeps a group
  // that shrinks to two people from being mistaken for a 1:1 conversation.
  const channelFlags = await columnNames(db, "channels");
  if (!channelFlags.has("is_group")) {
    await db
      .prepare("ALTER TABLE channels ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0")
      .run();
  }
  const prefColumns = await columnNames(db, "channel_prefs");
  if (!prefColumns.has("muted_until")) {
    await db.prepare("ALTER TABLE channel_prefs ADD COLUMN muted_until TEXT").run();
  }
  // Private notes you keep about other people (only you ever see yours).
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS user_notes (
        owner_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        note TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_id, target_id)
      )`)
    .run();
  // Server folders on the rail, per person: a JSON list of
  // { id, name, color, serverIds } in rail order.
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS server_folders (
        user_id TEXT PRIMARY KEY,
        folders TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
    .run();
  // Per-server nicknames live on the membership row.
  if (!memberColumns.has("nickname")) {
    await db.prepare("ALTER TABLE server_members ADD COLUMN nickname TEXT").run();
  }
  // Timeouts: until this ISO time the member can read but not post, react or speak.
  if (!memberColumns.has("timeout_until")) {
    await db.prepare("ALTER TABLE server_members ADD COLUMN timeout_until TEXT").run();
  }
  // Per-server avatar, shown instead of the account picture in this server.
  if (!memberColumns.has("avatar_url")) {
    await db.prepare("ALTER TABLE server_members ADD COLUMN avatar_url TEXT").run();
  }

  // Feature and support requests submitted by users directly to Kiwi and Flo.
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS user_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'feature',
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        response_note TEXT,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS user_requests_user_idx ON user_requests(user_id)")
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS user_requests_created_idx ON user_requests(created_at DESC)")
    .run();

  const recordingColumns = await columnNames(db, "recording_sessions");
  const recordingMigrations: D1PreparedStatement[] = [];
  for (const [column, ddl] of [
    [
      "active_since_at",
      "ALTER TABLE recording_sessions ADD COLUMN active_since_at TEXT",
    ],
    [
      "retention_days",
      "ALTER TABLE recording_sessions ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 90",
    ],
    [
      "deleted_at",
      "ALTER TABLE recording_sessions ADD COLUMN deleted_at TEXT",
    ],
  ] as const) {
    if (!recordingColumns.has(column)) recordingMigrations.push(db.prepare(ddl));
  }
  if (recordingMigrations.length) await db.batch(recordingMigrations);

  // Fog-of-war rectangles, stored as a JSON blob alongside tokens/strokes.
  const battlemapColumns = await columnNames(db, "battlemaps");
  if (!battlemapColumns.has("fog")) {
    await db
      .prepare("ALTER TABLE battlemaps ADD COLUMN fog TEXT NOT NULL DEFAULT '[]'")
      .run();
  }
  if (!battlemapColumns.has("rows")) {
    await db
      .prepare("ALTER TABLE battlemaps ADD COLUMN rows INTEGER")
      .run();
  }
  // Combat or exploration, set by the GM (and what the call's music follows).
  if (!battlemapColumns.has("encounter")) {
    await db
      .prepare("ALTER TABLE battlemaps ADD COLUMN encounter TEXT NOT NULL DEFAULT 'exploration'")
      .run();
  }

  // Per-server D&D settings: rules edition for lookups, homebrew, and the
  // music a battlemap's combat and exploration switch to.
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS server_dnd_settings (
        server_id TEXT PRIMARY KEY,
        edition TEXT NOT NULL DEFAULT '2014',
        homebrew_json TEXT,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run();
  // A server's Minecraft server for the sidebar status and RCON (lib/game-server).
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS server_game_servers (
        server_id TEXT PRIMARY KEY,
        host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 25565,
        rcon_port INTEGER,
        rcon_password TEXT,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run();
  const dndColumns = await columnNames(db, "server_dnd_settings");
  for (const column of ["combat_music", "explore_music", "game_system"]) {
    if (!dndColumns.has(column)) {
      await db.prepare(`ALTER TABLE server_dnd_settings ADD COLUMN ${column} TEXT`).run();
    }
  }

  // Personal sound packs: a sound can be scoped to a server (shared) or to a
  // single user (their own pack). Existing rows are shared server sounds.
  const soundColumns = await columnNames(db, "sounds");
  if (!soundColumns.has("scope")) {
    await db
      .prepare("ALTER TABLE sounds ADD COLUMN scope TEXT NOT NULL DEFAULT 'server'")
      .run();
  }
  if (!soundColumns.has("owner_id")) {
    await db.prepare("ALTER TABLE sounds ADD COLUMN owner_id TEXT").run();
  }


  // Centralized tables (previously scattered across feature modules) + moderation reports
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS saved_messages (
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, message_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS server_recaps (
      server_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      next_at INTEGER NOT NULL,
      created_by TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS big_upload_grants (
      user_id TEXT PRIMARY KEY,
      granted_by TEXT,
      granted_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS big_uploads (
      key TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      content_type TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed_at INTEGER
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS big_uploads_expiry_idx ON big_uploads(expires_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS qa_questions (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      answered_at TEXT,
      pinned_at TEXT,
      hidden_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS qa_questions_channel_idx ON qa_questions(channel_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS qa_votes (
      question_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (question_id, user_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_id TEXT,
      text TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      message_id TEXT,
      error TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS scheduled_due_idx ON scheduled_messages(sent_at, due_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS digest_prefs (
      user_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS discord_threads (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      anchor_message_id TEXT,
      type INTEGER NOT NULL DEFAULT 11,
      auto_archive_duration INTEGER NOT NULL DEFAULT 1440,
      owner_bot_id TEXT,
      owner_user_id TEXT,
      locked INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      archive_timestamp TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS discord_threads_channel_idx ON discord_threads(channel_id, archived)"),
    db.prepare("CREATE INDEX IF NOT EXISTS discord_threads_server_idx ON discord_threads(server_id, archived)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      text TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders(sent_at, due_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS channel_webhooks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '🪝',
      token TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      uses INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS channel_webhooks_server_idx ON channel_webhooks(server_id)"),
    // Cards bots keep up to date for members to pin (lib/bot-widgets.ts).
    // channel_id is '' for a server-wide widget, else the room it belongs to.
    db.prepare(`CREATE TABLE IF NOT EXISTS bot_widgets (
      bot_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      sizes TEXT NOT NULL DEFAULT '["small","medium","large"]',
      webview_url TEXT,
      content TEXT NOT NULL DEFAULT '',
      embeds TEXT NOT NULL DEFAULT '[]',
      components TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (bot_id, server_id, name, channel_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS bot_widgets_server_idx ON bot_widgets(server_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS message_reports (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS message_reports_server_idx ON message_reports(server_id, status, created_at DESC)"),
    // Earned achievements (unlike pride_badges, these are unlocked by activity).
    db.prepare(`CREATE TABLE IF NOT EXISTS user_achievements (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    )`),
    // Cumulative lifetime voice time per user, in seconds.
    db.prepare(`CREATE TABLE IF NOT EXISTS user_voice_seconds (
      user_id TEXT PRIMARY KEY,
      seconds INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`),
    // Milestones only the client sees happen (a theme tried, a fish caught),
    // one row per distinct value, for the explorer achievements.
    db.prepare(`CREATE TABLE IF NOT EXISTS user_achievement_marks (
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, kind, value)
    )`),
    // Achievement stats read a member's own messages and reactions.
    db.prepare("CREATE INDEX IF NOT EXISTS messages_user_time_idx ON messages(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS reactions_user_idx ON reactions(user_id)"),
  ]);

  await seedDefaultServer(db);
  await backfillServerMembers(db);
  await migrateProfileImages(db);
  await ensureFts(db);

  // Record which schema version this database is now on, so anyone reading it
  // (or a future migration) can tell how far along it is.
  await db
    .prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
    )
    .bind(String(SCHEMA_VERSION))
    .run();
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
        `INSERT OR IGNORE INTO servers (id, name, icon, color, created_by, created_at, position, is_public)
         VALUES (?, ?, ?, ?, NULL, ?, 0, 1)`,
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

/**
 * Initializes SQLite FTS5 full-text search indexing for messages.
 * Automatically mirrors new/edited/deleted messages and backfills existing content.
 */
async function ensureFts(db: D1Database): Promise<void> {
  try {
    await db
      .prepare(
        `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
           id UNINDEXED,
           channel_id UNINDEXED,
           channel UNINDEXED,
           content,
           author,
           tokenize = 'porter unicode61'
         );`,
      )
      .run();

    await db
      .prepare(
        `CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
           INSERT INTO messages_fts(id, channel_id, channel, content, author)
           VALUES (new.id, new.channel_id, new.channel, new.content, new.author);
         END;`,
      )
      .run();

    await db
      .prepare(
        `CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
           DELETE FROM messages_fts WHERE id = old.id;
         END;`,
      )
      .run();

    await db
      .prepare(
        `CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF content ON messages BEGIN
           UPDATE messages_fts SET content = new.content, channel_id = new.channel_id, channel = new.channel, author = new.author
           WHERE id = new.id;
         END;`,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO messages_fts(id, channel_id, channel, content, author)
         SELECT id, channel_id, channel, content, author FROM messages
         WHERE id NOT IN (SELECT id FROM messages_fts);`,
      )
      .run();
  } catch (err) {
    // If running in an in-memory mock or environment without FTS5 module, ignore gracefully
    console.warn("FTS5 initialization notice:", err);
  }
}
