/**
 * Edit history: before a message's text changes, its current version is copied
 * into `message_edits`, so "(edited)" can show what it used to say.
 */

/**
 * A statement that snapshots message `id`'s current text, to run in the same
 * batch as (and before) the UPDATE. It writes nothing when the new text is null
 * (an embed-only bot edit) or identical, so no-op edits leave no history.
 */
export function snapshotBeforeEdit(
  db: D1Database,
  id: string,
  nextContent: string | null,
  replacedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO message_edits (id, message_id, content, written_at, replaced_at)
       SELECT ?1, id, content, COALESCE(edited_at, created_at), ?2
         FROM messages
        WHERE id = ?3 AND ?4 IS NOT NULL AND content IS NOT ?4`,
    )
    .bind(crypto.randomUUID(), replacedAt, id, nextContent);
}

export interface MessageVersion {
  content: string;
  /** When this version was written (the message's creation or an earlier edit). */
  at: string;
}

/** Every earlier version of a message, oldest first. */
export async function messageHistory(db: D1Database, id: string): Promise<MessageVersion[]> {
  const rows = await db
    .prepare(
      `SELECT content, written_at FROM message_edits
        WHERE message_id = ? ORDER BY replaced_at ASC`,
    )
    .bind(id)
    .all<{ content: string; written_at: string }>();
  return (rows.results || []).map((row) => ({ content: row.content, at: row.written_at }));
}
