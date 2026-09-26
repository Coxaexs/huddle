/**
 * Thread state for the Discord-compatible surface.
 *
 * Hoffle threads have no rows of their own: a reply records the thread it
 * belongs to in `messages.thread_id`, and the web UI keys the whole thread
 * panel off that single id. That is enough to list a thread's replies, but not
 * enough to answer what a Discord client asks about a thread — its name, its
 * archive deadline, who started it, whether it is archived. None of those fit
 * on a reply row, so the Discord surface keeps a small side table for them.
 *
 * A thread started from a message deliberately takes that message's native id
 * as its own, because the web UI opens `?threadId=<anchor message id>`: a
 * thread under any other id would be a second, invisible thread running beside
 * the one people are actually reading. Discord does the same thing, so bots
 * that correlate a thread with the message it came from see the ids agree. (The
 * snowflake itself is still per-kind — `discord_ids` keeps one snowflake per
 * kind and native id — so `thread.id` and the message's snowflake differ.)
 *
 * Rows are only written for threads the API made or changed. A thread nobody
 * has touched through this surface is still reachable: it is recognised from
 * its anchor message, which is what makes a bot's thread object and the web
 * UI's thread panel the same thread rather than two parallel ones.
 *
 * The DDL lives here rather than in lib/schema.ts because the table belongs
 * entirely to this surface. It is idempotent and runs once per request that
 * touches threads, which is how the worker already treats ensureSchema.
 */
import type { HoffleThreadRow, ThreadStats } from "./serialize";

/** Discord offers exactly these archive windows, in minutes. */
export const THREAD_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080];

/** What Discord itself defaults a new thread to: 24 hours. */
export const DEFAULT_AUTO_ARCHIVE_DURATION = 1440;

export const THREAD_COLUMNS = `id, channel_id, server_id, name, anchor_message_id, type,
  auto_archive_duration, owner_bot_id, owner_user_id, locked, archived,
  archive_timestamp, created_at`;

export async function ensureThreadTable(db: D1Database): Promise<void> {
  await db.batch([
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
    db.prepare(
      "CREATE INDEX IF NOT EXISTS discord_threads_channel_idx ON discord_threads(channel_id, archived)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS discord_threads_server_idx ON discord_threads(server_id, archived)",
    ),
  ]);
}

export async function loadThread(
  db: D1Database,
  nativeId: string,
): Promise<HoffleThreadRow | null> {
  return db
    .prepare(`SELECT ${THREAD_COLUMNS} FROM discord_threads WHERE id = ?`)
    .bind(nativeId)
    .first<HoffleThreadRow>();
}

/**
 * The thread started from a message, if there is one. Discord allows a message
 * to have a single thread, and this is the check that keeps a bot from opening
 * a second one.
 */
export async function loadThreadByAnchor(
  db: D1Database,
  anchorMessageId: string,
): Promise<HoffleThreadRow | null> {
  return db
    .prepare(
      `SELECT ${THREAD_COLUMNS} FROM discord_threads WHERE anchor_message_id = ? LIMIT 1`,
    )
    .bind(anchorMessageId)
    .first<HoffleThreadRow>();
}

export async function insertThread(
  db: D1Database,
  row: Omit<HoffleThreadRow, "created_at"> & { created_at?: string },
): Promise<HoffleThreadRow> {
  const created: HoffleThreadRow = {
    ...row,
    created_at: row.created_at || new Date().toISOString(),
  };
  await db
    .prepare(
      `INSERT INTO discord_threads
         (id, channel_id, server_id, name, anchor_message_id, type,
          auto_archive_duration, owner_bot_id, owner_user_id, locked, archived,
          archive_timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    )
    .bind(
      created.id,
      created.channel_id,
      created.server_id,
      created.name,
      created.anchor_message_id ?? null,
      created.type ?? 11,
      created.auto_archive_duration ?? DEFAULT_AUTO_ARCHIVE_DURATION,
      created.owner_bot_id ?? null,
      created.owner_user_id ?? null,
      created.created_at,
      created.created_at,
    )
    .run();
  return created;
}

/**
 * Gives a thread a row of its own.
 *
 * A thread started in the web UI exists only as the id its replies carry: the
 * anchor message is an ordinary channel message, and nothing has ever asked for
 * the thread behind it. The first change anyone makes to it — archiving,
 * renaming — is what turns it into a thread the API keeps state for.
 */
export async function persistThread(
  db: D1Database,
  thread: HoffleThreadRow,
): Promise<HoffleThreadRow> {
  const existing = await loadThread(db, thread.id);
  if (existing) return existing;
  try {
    await insertThread(db, thread);
  } catch {
    // Another request stored it first. Both rows were built from the same
    // anchor message, so theirs says the same thing.
  }
  return (await loadThread(db, thread.id)) ?? thread;
}

/**
 * The thread behind a message, for threads the web UI started.
 *
 * Those never came through this module, so there is no row to look up: such a
 * thread is recognisable only by its id, which is the id of the message it
 * hangs off. Discord names a thread after the message it was started from, and
 * so does this — the name a client shows is then the words the thread is about,
 * which is what the web UI's thread panel shows too.
 *
 * `server_id` is left blank for the caller, which already has the parent
 * channel: filling it here would be the same query twice.
 */
export async function nativeThread(
  db: D1Database,
  threadId: string,
): Promise<HoffleThreadRow | null> {
  const anchor = await db
    .prepare(
      `SELECT id, channel_id, user_id, content, created_at FROM messages
        WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(threadId)
    .first<{
      id: string;
      channel_id: string | null;
      user_id: string | null;
      content: string | null;
      created_at: string;
    }>();
  if (!anchor || !anchor.channel_id) return null;

  return {
    id: anchor.id,
    channel_id: anchor.channel_id,
    server_id: "",
    name: (anchor.content || "").trim().slice(0, 100) || "Thread",
    anchor_message_id: anchor.id,
    type: 11,
    auto_archive_duration: DEFAULT_AUTO_ARCHIVE_DURATION,
    owner_user_id: anchor.user_id,
    archived: 0,
    locked: 0,
    archive_timestamp: anchor.created_at,
    created_at: anchor.created_at,
  };
}

export interface ThreadPatch {
  name?: string;
  auto_archive_duration?: number;
  archived?: boolean;
  locked?: boolean;
}

/**
 * Applies a partial update and returns the row as it now stands, or null when
 * the thread is gone. Archiving moves `archive_timestamp`, which Discord
 * defines as the moment the archive flag changed rather than the moment the
 * thread fell silent.
 */
export async function updateThread(
  db: D1Database,
  nativeId: string,
  patch: ThreadPatch,
): Promise<HoffleThreadRow | null> {
  const existing = await loadThread(db, nativeId);
  if (!existing) return null;

  const archived = patch.archived ?? Boolean(existing.archived);
  const archiveChanged =
    patch.archived !== undefined && archived !== Boolean(existing.archived);
  const updated: HoffleThreadRow = {
    ...existing,
    name: patch.name ?? existing.name,
    auto_archive_duration:
      patch.auto_archive_duration ?? existing.auto_archive_duration,
    archived: archived ? 1 : 0,
    locked: (patch.locked ?? Boolean(existing.locked)) ? 1 : 0,
    archive_timestamp: archiveChanged
      ? new Date().toISOString()
      : existing.archive_timestamp,
  };

  await db
    .prepare(
      `UPDATE discord_threads
          SET name = ?, auto_archive_duration = ?, archived = ?, locked = ?, archive_timestamp = ?
        WHERE id = ?`,
    )
    .bind(
      updated.name,
      updated.auto_archive_duration ?? DEFAULT_AUTO_ARCHIVE_DURATION,
      updated.archived,
      updated.locked,
      updated.archive_timestamp ?? updated.created_at ?? null,
      nativeId,
    )
    .run();
  return updated;
}

/**
 * Threads of one channel or one guild. Archived lists page by archive time,
 * which is how Discord orders them; every other list pages by creation.
 */
export async function listThreads(
  db: D1Database,
  query: {
    channelId?: string;
    serverId?: string;
    archived: boolean;
    /** ISO timestamp: only threads archived strictly before it, for paging. */
    before?: string | null;
    limit: number;
  },
): Promise<HoffleThreadRow[]> {
  const clauses = ["archived = ?"];
  const binds: unknown[] = [query.archived ? 1 : 0];
  if (query.channelId) {
    clauses.push("channel_id = ?");
    binds.push(query.channelId);
  }
  if (query.serverId) {
    clauses.push("server_id = ?");
    binds.push(query.serverId);
  }
  if (query.before) {
    clauses.push("archive_timestamp < ?");
    binds.push(query.before);
  }
  binds.push(query.limit);

  const rows = await db
    .prepare(
      `SELECT ${THREAD_COLUMNS} FROM discord_threads
        WHERE ${clauses.join(" AND ")}
        ORDER BY ${query.archived ? "archive_timestamp DESC" : "created_at DESC"}
        LIMIT ?`,
    )
    .bind(...binds)
    .all<HoffleThreadRow>();
  return rows.results || [];
}

/**
 * Reply tallies for a set of threads in one query.
 *
 * Discord's `message_count` excludes the starter message, which is exactly what
 * matching on `thread_id` yields: the starter is an ordinary channel message
 * that does not point at itself. Distinct authors stand in for Discord's
 * participant count, since Hoffle has no per-thread membership to count — and a
 * posting bot has no account id at all, so its display name is what keeps two
 * different bots from collapsing into one participant.
 */
export async function threadStats(
  db: D1Database,
  threadIds: string[],
): Promise<Map<string, ThreadStats>> {
  const stats = new Map<string, ThreadStats>();
  if (!threadIds.length) return stats;

  // SQLite caps variables per statement; a thread page is far smaller than
  // this, but chunking keeps a runaway list from failing the whole call.
  for (let i = 0; i < threadIds.length; i += 80) {
    const slice = threadIds.slice(i, i + 80);
    const placeholders = slice.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT m.thread_id AS thread_id,
                COUNT(*) AS message_count,
                COUNT(DISTINCT COALESCE(m.user_id, m.author)) AS member_count,
                (SELECT m2.id FROM messages m2
                  WHERE m2.thread_id = m.thread_id AND m2.deleted_at IS NULL
                  ORDER BY m2.created_at DESC LIMIT 1) AS last_message_id
           FROM messages m
          WHERE m.deleted_at IS NULL AND m.thread_id IN (${placeholders})
          GROUP BY m.thread_id`,
      )
      .bind(...slice)
      .all<{
        thread_id: string;
        message_count: number;
        member_count: number;
        last_message_id: string | null;
      }>();
    for (const row of rows.results || []) {
      stats.set(row.thread_id, {
        messageCount: row.message_count,
        memberCount: row.member_count,
        lastMessageId: row.last_message_id,
      });
    }
  }
  return stats;
}

