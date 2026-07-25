import { env } from "cloudflare:workers";

export interface HuddleBindings {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  BOT_TOKEN?: string;
  MUSICWATCH_BASE_URL?: string;
  MUSICWATCH_PUBLIC_URL?: string;
  MUSICWATCH_PASSWORD?: string;
  MUSIC_HELPER_BASE_URL?: string;
  DND_BASE_URL?: string;
  DND_PUBLIC_URL?: string;
}

export function bindings(): HuddleBindings {
  return env as unknown as HuddleBindings;
}

export interface StoredMessage {
  id: string;
  channel?: string;
  author: string;
  avatar: string;
  color: string;
  content: string;
  attachment_key: string | null;
  is_bot: number;
  created_at: string;
  link?: string | null;
  action_label?: string | null;
  audio_url?: string | null;
}

/**
 * The message table is created and migrated on demand so a fresh D1 database
 * (or the local `--persist-to state` one) never needs a manual migration step.
 */
export async function ensureMessagesTable(db: D1Database): Promise<void> {
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
  ]);

  const columns = await db.prepare("PRAGMA table_info(messages)").all();
  const names = new Set(
    ((columns.results || []) as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  const migrations: D1PreparedStatement[] = [];
  if (!names.has("link")) {
    migrations.push(db.prepare("ALTER TABLE messages ADD COLUMN link TEXT"));
  }
  if (!names.has("action_label")) {
    migrations.push(
      db.prepare("ALTER TABLE messages ADD COLUMN action_label TEXT"),
    );
  }
  if (!names.has("audio_url")) {
    migrations.push(db.prepare("ALTER TABLE messages ADD COLUMN audio_url TEXT"));
  }
  if (migrations.length) await db.batch(migrations);
}
