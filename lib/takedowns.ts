/**
 * Taking content down under a legal order, automatically and reversibly.
 *
 * ATKM gives a host 1 hour for terrorist content and 12 for child abuse
 * material, from when the order arrives, so this acts first and lets a person
 * review after. A takedown hides the message and blocks its files by key, so
 * the file itself stops being served (a deleted message alone leaves it
 * reachable). Nothing is destroyed: a Restore puts it back, because the
 * content of an order has to be kept for review, and the mail that triggered
 * this could be wrong. "Delete for good" is a separate, deliberate step.
 *
 * The admin panel shows the text and file names, never the files.
 */
import { INSTANCE_AUDIT } from "./admin";
import { adminDeleteMessage } from "./admin-tools";
import { recordAudit, type AuditActor } from "./audit";
import { bindings } from "./storage";

/** Who a takedown from the mail worker is recorded as. */
export const TAKEDOWN_ACTOR: AuditActor = { id: "takedown", display_name: "Automatic takedown" };

const OUR_HOSTS = ["chat.hoffle.online", "hoffle.online", "www.hoffle.online", "deeppixel.online", "www.deeppixel.online"];

export interface TakedownTarget {
  messageId?: string;
  fileKey?: string;
}

export interface TakedownRow {
  id: string;
  link: string;
  message_id: string | null;
  message_hidden: number;
  file_keys: string;
  channel_id: string | null;
  server_id: string | null;
  author: string | null;
  source: string;
  source_detail: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PublicTakedown {
  id: string;
  link: string;
  text: string;
  files: string[];
  author: string;
  where: string;
  source: string;
  sourceDetail: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

/** The message or file a link points at, if it is a link to this Hoffle. */
export function parseTakedownLink(raw: string, publicUrl?: string): TakedownTarget | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const hosts = new Set(OUR_HOSTS);
  if (publicUrl) {
    try {
      hosts.add(new URL(publicUrl).host);
    } catch {
      // A bad PUBLIC_URL only means fewer links match.
    }
  }
  if (!hosts.has(url.host)) return null;

  const upload = url.pathname.match(/\/api\/uploads\/([^/]+)$/);
  if (upload) {
    try {
      const fileKey = decodeURIComponent(upload[1]);
      return fileKey.length <= 300 ? { fileKey } : null;
    } catch {
      return null;
    }
  }
  const messageId = url.searchParams.get("message")?.trim();
  return messageId && /^[\w-]{1,64}$/.test(messageId) ? { messageId } : null;
}

interface MessageFiles {
  attachment_key: string | null;
  attachments?: string | null;
  audio_url?: string | null;
}

/** Every stored file a message carries. */
export function messageFiles(row: MessageFiles): string[] {
  const keys = new Set<string>();
  if (row.attachment_key) keys.add(row.attachment_key);
  try {
    for (const key of JSON.parse(row.attachments || "[]") as unknown[]) {
      if (typeof key === "string" && key) keys.add(key);
    }
  } catch {
    // An unreadable list has nothing we can name.
  }
  const audio = row.audio_url?.match(/\/api\/uploads\/([^/?#]+)/);
  if (audio) {
    try {
      keys.add(decodeURIComponent(audio[1]));
    } catch {
      keys.add(audio[1]);
    }
  }
  return [...keys];
}

interface MessageRow extends MessageFiles {
  id: string;
  channel_id: string | null;
  author: string;
  deleted_at: string | null;
  server_id: string | null;
}

const MESSAGE = `SELECT m.id, m.channel_id, m.author, m.deleted_at, m.attachment_key, m.attachments, m.audio_url, c.server_id
  FROM messages m LEFT JOIN channels c ON c.id = m.channel_id`;

async function messagesWithFile(db: D1Database, key: string): Promise<MessageRow[]> {
  const like = `%${key.replace(/[\\%_]/g, "\\$&")}%`;
  const { results } = await db
    .prepare(
      `${MESSAGE} WHERE m.attachment_key = ? OR m.attachments LIKE ? ESCAPE '\\' OR m.audio_url LIKE ? ESCAPE '\\' LIMIT 20`,
    )
    .bind(key, like, like)
    .all<MessageRow>();
  return results || [];
}

async function record(
  db: D1Database,
  link: string,
  row: MessageRow | null,
  keys: string[],
  origin: { source: string; detail: string; actor: AuditActor },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const hide = Boolean(row && !row.deleted_at);
  await db
    .prepare(
      `INSERT INTO takedowns (id, link, message_id, message_hidden, file_keys, channel_id, server_id, author, source, source_detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      link.slice(0, 1000),
      row?.id ?? null,
      hide ? 1 : 0,
      JSON.stringify(keys),
      row?.channel_id ?? null,
      row?.server_id ?? null,
      row?.author ?? null,
      origin.source,
      origin.detail.slice(0, 300),
      now,
    )
    .run();
  for (const key of keys) {
    await db.prepare("INSERT OR IGNORE INTO blocked_uploads (key, takedown_id, created_at) VALUES (?, ?, ?)").bind(key, id, now).run();
  }
  if (hide) await adminDeleteMessage(db, row!.id, origin.actor);
  await recordAudit(db, {
    serverId: row?.server_id || INSTANCE_AUDIT,
    actor: origin.actor,
    action: "takedown.create",
    targetId: row?.id ?? keys[0] ?? id,
    targetName: row?.author ?? "file",
    detail: origin.source,
  });
  return id;
}

export type TakedownOutcome = "down" | "already" | "unmatched";

/** Takes down what a link points at. Unknown links change nothing. */
export async function takeDown(
  db: D1Database,
  link: string,
  origin: { source: string; detail: string; actor: AuditActor },
): Promise<TakedownOutcome> {
  const target = parseTakedownLink(link, bindings().PUBLIC_URL);
  if (!target) return "unmatched";

  let rows: MessageRow[];
  if (target.messageId) {
    const row = await db.prepare(`${MESSAGE} WHERE m.id = ?`).bind(target.messageId).first<MessageRow>();
    if (!row) return "unmatched";
    rows = [row];
  } else {
    rows = await messagesWithFile(db, target.fileKey!);
  }

  let fresh = 0;
  for (const row of rows) {
    const active = await db
      .prepare("SELECT id FROM takedowns WHERE message_id = ? AND status = 'down'")
      .bind(row.id)
      .first<{ id: string }>();
    if (active) continue;
    await record(db, link, row, messageFiles(row), origin);
    fresh += 1;
  }
  // A file no message carries any more, such as one its author deleted.
  if (!rows.length && target.fileKey) {
    if (await uploadBlocked(db, target.fileKey)) return "already";
    await record(db, link, null, [target.fileKey], origin);
    return "down";
  }
  return fresh ? "down" : "already";
}

export async function uploadBlocked(db: D1Database, key: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS hit FROM blocked_uploads WHERE key = ? LIMIT 1").bind(key).first<{ hit: number }>();
  return row?.hit === 1;
}

/**
 * True when a file was only ever carried by messages that are now deleted, so
 * deleting a message takes its file with it. This is checked where files are
 * served rather than in the many places that delete messages. A file no message
 * mentions (an avatar, a banner) is false.
 */
export async function fileOfDeletedMessage(db: D1Database, key: string): Promise<boolean> {
  const direct = await db
    .prepare(
      `SELECT COUNT(*) AS total, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) AS live
         FROM messages WHERE attachment_key = ?`,
    )
    .bind(key)
    .first<{ total: number; live: number }>();
  if (direct?.live) return false;
  const like = `%${key.replace(/[\\%_]/g, "\\$&")}%`;
  const extra = await db
    .prepare(
      `SELECT COUNT(*) AS total, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) AS live
         FROM messages
        WHERE (attachments IS NOT NULL OR audio_url IS NOT NULL)
          AND (attachments LIKE ? ESCAPE '\\' OR audio_url LIKE ? ESCAPE '\\')`,
    )
    .bind(like, like)
    .first<{ total: number; live: number }>();
  if (extra?.live) return false;
  return Boolean(direct?.total || extra?.total);
}

function fileName(key: string): string {
  return key.split("--").slice(1).join("--") || key;
}

export async function listTakedowns(db: D1Database): Promise<PublicTakedown[]> {
  const { results } = await db
    .prepare(
      `SELECT t.*, m.content AS text, c.name AS channel_name, s.name AS server_name
         FROM takedowns t
         LEFT JOIN messages m ON m.id = t.message_id
         LEFT JOIN channels c ON c.id = t.channel_id
         LEFT JOIN servers s ON s.id = t.server_id
        ORDER BY CASE WHEN t.status = 'down' THEN 0 ELSE 1 END, t.created_at DESC
        LIMIT 100`,
    )
    .all<TakedownRow & { text: string | null; channel_name: string | null; server_name: string | null }>();
  return (results || []).map((row) => ({
    id: row.id,
    link: row.link,
    text: row.status === "erased" ? "" : row.text || "",
    files: (JSON.parse(row.file_keys) as string[]).map(fileName),
    author: row.author || "Unknown",
    where: row.server_id === "dm" ? "Direct message" : [row.server_name, row.channel_name && `#${row.channel_name}`].filter(Boolean).join(" ") || "File only",
    source: row.source,
    sourceDetail: row.source_detail,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

async function activeTakedown(db: D1Database, id: string): Promise<TakedownRow | null> {
  return db.prepare("SELECT * FROM takedowns WHERE id = ? AND status = 'down'").bind(id).first<TakedownRow>();
}

/** Puts it back, unless another takedown still holds the same file. */
export async function restoreTakedown(db: D1Database, id: string, actor: AuditActor): Promise<boolean> {
  const row = await activeTakedown(db, id);
  if (!row) return false;
  const statements = [
    db.prepare("DELETE FROM blocked_uploads WHERE takedown_id = ?").bind(id),
    db
      .prepare("UPDATE takedowns SET status = 'restored', resolved_at = ?, resolved_by = ? WHERE id = ?")
      .bind(new Date().toISOString(), actor.id, id),
  ];
  // Only what the takedown hid: never bring back something its author deleted.
  if (row.message_id && row.message_hidden) {
    statements.push(db.prepare("UPDATE messages SET deleted_at = NULL WHERE id = ?").bind(row.message_id));
  }
  await db.batch(statements);
  await recordAudit(db, {
    serverId: row.server_id || INSTANCE_AUDIT,
    actor,
    action: "takedown.restore",
    targetId: row.message_id ?? id,
    targetName: row.author ?? "file",
    detail: row.source,
  });
  return true;
}

/** Destroys the content for good. There is no way back from this. */
export async function eraseTakedown(db: D1Database, id: string, actor: AuditActor): Promise<boolean> {
  const row = await activeTakedown(db, id);
  if (!row) return false;
  const env = bindings();
  for (const key of JSON.parse(row.file_keys) as string[]) {
    await env.UPLOADS?.delete(key);
    await env.BIG_UPLOADS?.delete(key);
  }
  const statements = [
    db
      .prepare("UPDATE takedowns SET status = 'erased', resolved_at = ?, resolved_by = ? WHERE id = ?")
      .bind(new Date().toISOString(), actor.id, id),
  ];
  if (row.message_id) {
    statements.push(
      db
        .prepare("UPDATE messages SET content = '', attachment_key = NULL, attachments = NULL, audio_url = NULL, payload = NULL, link = NULL WHERE id = ?")
        .bind(row.message_id),
    );
  }
  await db.batch(statements);
  await recordAudit(db, {
    serverId: row.server_id || INSTANCE_AUDIT,
    actor,
    action: "takedown.erase",
    targetId: row.message_id ?? id,
    targetName: row.author ?? "file",
    detail: row.source,
  });
  return true;
}
