/**
 * Big temporary uploads: files up to 2 GB from people an instance admin picked
 * (instance admins can always send them). They go up in parts as an R2
 * multipart upload into their own bucket, BIG_UPLOADS, which the backups skip,
 * and are deleted 12 hours after the upload started. The hub's alarm runs the
 * sweep (see `runEvents` in lib/hub.ts).
 *
 * On the home server the bucket's folder is a link to the big hard disk
 * (/mnt/harddisk/hoffle-big-uploads). The files alive at once share a budget,
 * BIG_UPLOAD_BUDGET_MB (20 GB unless set); an upload that would go over it is
 * refused up front.
 */
import { isInstanceAdmin, type User } from "./auth";
import { INSTANCE_AUDIT } from "./admin";
import { recordAudit } from "./audit";
import { ensureSchema } from "./schema";
import {
  BIG_UPLOAD_LIFETIME_MS,
  BIG_UPLOAD_MAX_BYTES,
  BIG_UPLOAD_PART_BYTES,
  bigUploadKey,
  isBigUploadKey,
} from "./big-upload-key";
import { bindings } from "./storage";
import { peekStream } from "./stream-peek";
import { sniffUpload } from "./upload-sniff";

/** An upload nobody finished in this long is aborted and its parts freed. */
const STALLED_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BUDGET_MB = 20 * 1024;

export interface BigUploadRow {
  key: string;
  upload_id: string;
  user_id: string;
  name: string;
  size: number;
  content_type: string | null;
  created_at: number;
  expires_at: number;
  completed_at: number | null;
}

type Failure = { error: string; status: number };

export function ensureBigUploadTables(db: D1Database): Promise<void> {
  return ensureSchema(db);
}

export function bigUploadBudget(): number {
  const mb = Number(bindings().BIG_UPLOAD_BUDGET_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_BUDGET_MB) * 1024 * 1024;
}

/** Bytes held by big uploads right now, finished or still going up. */
export async function bigUploadBytesUsed(db: D1Database): Promise<number> {
  await ensureBigUploadTables(db);
  const row = await db.prepare("SELECT COALESCE(SUM(size), 0) AS used FROM big_uploads").first<{ used: number }>();
  return row?.used ?? 0;
}

export async function canUploadBig(db: D1Database, user: User): Promise<boolean> {
  if (isInstanceAdmin(user)) return true;
  await ensureBigUploadTables(db);
  const row = await db.prepare("SELECT 1 AS ok FROM big_upload_grants WHERE user_id = ?").bind(user.id).first();
  return Boolean(row);
}

function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / BIG_UPLOAD_PART_BYTES));
}

function safeFileName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._ -]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(-100) || "file"
  );
}

async function ownRow(db: D1Database, user: User, key: string): Promise<BigUploadRow | Failure> {
  if (!isBigUploadKey(key)) return { error: "No such upload.", status: 404 };
  const row = await db.prepare("SELECT * FROM big_uploads WHERE key = ?").bind(key).first<BigUploadRow>();
  if (!row || row.user_id !== user.id) return { error: "No such upload.", status: 404 };
  if (row.expires_at <= Date.now()) return { error: "That upload has expired.", status: 410 };
  return row;
}

/** Opens a multipart upload after checking the grant, the size and the budget. */
export async function startBigUpload(
  db: D1Database,
  bucket: R2Bucket,
  user: User,
  input: { name?: unknown; size?: unknown },
): Promise<{ key: string; uploadId: string; partBytes: number; parts: number; expiresAt: number } | Failure> {
  if (!(await canUploadBig(db, user))) {
    return { error: "Files over 40 MB need an admin's OK first.", status: 403 };
  }
  const size = Number(input.size);
  if (!Number.isInteger(size) || size <= 0) return { error: "Choose a valid file.", status: 400 };
  if (size > BIG_UPLOAD_MAX_BYTES) return { error: "Files must be smaller than 2 GB.", status: 413 };
  await sweepBigUploads(db, bucket);
  const budget = bigUploadBudget();
  const used = await bigUploadBytesUsed(db);
  if (used + size > budget) {
    const freeMb = Math.max(0, Math.floor((budget - used) / 1024 / 1024));
    return {
      error: `Big-file storage is full right now (${freeMb} MB free). Older files are deleted after 12 hours.`,
      status: 507,
    };
  }
  const name = safeFileName(typeof input.name === "string" ? input.name : "");
  const now = Date.now();
  const expiresAt = now + BIG_UPLOAD_LIFETIME_MS;
  const key = bigUploadKey(expiresAt, crypto.randomUUID(), name);
  const multipart = await bucket.createMultipartUpload(key, {
    customMetadata: { uploader: user.id },
  });
  await db
    .prepare(
      `INSERT INTO big_uploads (key, upload_id, user_id, name, size, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(key, multipart.uploadId, user.id, name, size, now, Math.floor(expiresAt / 1000) * 1000)
    .run();
  return { key, uploadId: multipart.uploadId, partBytes: BIG_UPLOAD_PART_BYTES, parts: partCount(size), expiresAt };
}

/** Stores one part. Every part is BIG_UPLOAD_PART_BYTES except the last. */
export async function putBigUploadPart(
  db: D1Database,
  bucket: R2Bucket,
  user: User,
  key: string,
  partNumber: number,
  /** The part's body, passed on to R2 as it arrives. */
  body: ReadableStream<Uint8Array> | null,
  /** Its Content-Length. R2 needs the length of a streamed part up front. */
  length: number,
): Promise<{ partNumber: number; etag: string } | Failure> {
  await ensureBigUploadTables(db);
  const row = await ownRow(db, user, key);
  if ("error" in row) return row;
  if (row.completed_at) return { error: "That upload is already finished.", status: 409 };
  const parts = partCount(row.size);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > parts) {
    return { error: "Bad part number.", status: 400 };
  }
  const expected = partNumber < parts ? BIG_UPLOAD_PART_BYTES : row.size - BIG_UPLOAD_PART_BYTES * (parts - 1);
  if (!body || length !== expected) {
    return { error: `Part ${partNumber} should be ${expected} bytes, got ${body ? length : 0}.`, status: 400 };
  }
  let stream = body;
  if (partNumber === 1) {
    // Served back as what the bytes are when that is something we know;
    // anything else downloads as application/octet-stream.
    const peeked = await peekStream(body, 512);
    stream = peeked.stream;
    const sniffed = sniffUpload(peeked.head, row.name);
    await db
      .prepare("UPDATE big_uploads SET content_type = ? WHERE key = ?")
      .bind(sniffed?.contentType || "application/octet-stream", key)
      .run();
  }
  // A part is 32 MB, so it is streamed rather than read into memory first.
  // The fixed length makes a body that is shorter or longer than it said fail.
  const sized = new FixedLengthStream(expected);
  const piped = stream.pipeTo(sized.writable);
  let uploaded: R2UploadedPart;
  try {
    uploaded = await bucket.resumeMultipartUpload(key, row.upload_id).uploadPart(partNumber, sized.readable);
    await piped;
  } catch {
    piped.catch(() => {});
    return { error: `Part ${partNumber} did not arrive in full.`, status: 400 };
  }
  return { partNumber: uploaded.partNumber, etag: uploaded.etag };
}

export async function completeBigUpload(
  db: D1Database,
  bucket: R2Bucket,
  user: User,
  key: string,
  parts: unknown,
): Promise<{ key: string; url: string; name: string; expiresAt: number } | Failure> {
  await ensureBigUploadTables(db);
  const row = await ownRow(db, user, key);
  if ("error" in row) return row;
  const list = Array.isArray(parts)
    ? parts
        .map((part) => ({
          partNumber: Number((part as { partNumber?: unknown })?.partNumber),
          etag: String((part as { etag?: unknown })?.etag ?? ""),
        }))
        .filter((part) => Number.isInteger(part.partNumber) && part.etag)
        .sort((a, b) => a.partNumber - b.partNumber)
    : [];
  const expected = partCount(row.size);
  if (list.length !== expected || list.some((part, index) => part.partNumber !== index + 1)) {
    return { error: "Some parts of the file are missing.", status: 400 };
  }
  if (!row.completed_at) {
    await bucket.resumeMultipartUpload(key, row.upload_id).complete(list);
    await db.prepare("UPDATE big_uploads SET completed_at = ? WHERE key = ?").bind(Date.now(), key).run();
  }
  return { key, url: `/hangout/api/uploads/${encodeURIComponent(key)}`, name: row.name, expiresAt: row.expires_at };
}

/** Removes one big upload, finished or not, and frees its share of the budget. */
async function removeBigUpload(db: D1Database, bucket: R2Bucket, row: BigUploadRow): Promise<void> {
  if (row.completed_at) {
    await bucket.delete(row.key).catch(() => undefined);
  } else {
    await bucket
      .resumeMultipartUpload(row.key, row.upload_id)
      .abort()
      .catch(() => undefined);
  }
  await db.prepare("DELETE FROM big_uploads WHERE key = ?").bind(row.key).run();
}

export async function abortBigUpload(db: D1Database, bucket: R2Bucket, user: User, key: string): Promise<{ ok: true } | Failure> {
  await ensureBigUploadTables(db);
  const row = await ownRow(db, user, key);
  if ("error" in row) return row;
  if (row.completed_at) return { error: "That upload is already finished.", status: 409 };
  await removeBigUpload(db, bucket, row);
  return { ok: true };
}

/** Deletes everything past its 12 hours, and uploads nobody finished. */
export async function sweepBigUploads(db: D1Database, bucket: R2Bucket, now = Date.now()): Promise<number> {
  await ensureBigUploadTables(db);
  const { results } = await db
    .prepare("SELECT * FROM big_uploads WHERE expires_at <= ? OR (completed_at IS NULL AND created_at <= ?)")
    .bind(now, now - STALLED_MS)
    .all<BigUploadRow>();
  for (const row of results) await removeBigUpload(db, bucket, row);
  return results.length;
}

/** When the sweep next has something to do, or null. */
export async function nextBigUploadAlarm(db: D1Database): Promise<number | null> {
  await ensureBigUploadTables(db);
  const row = await db
    .prepare(
      `SELECT MIN(CASE WHEN completed_at IS NULL THEN MIN(expires_at, created_at + ?) ELSE expires_at END) AS due
       FROM big_uploads`,
    )
    .bind(STALLED_MS)
    .first<{ due: number | null }>();
  return row?.due ?? null;
}

/** What GET /api/uploads/<key> needs to serve a big upload. */
export async function servableBigUpload(db: D1Database, key: string): Promise<BigUploadRow | null> {
  await ensureBigUploadTables(db);
  const row = await db
    .prepare("SELECT * FROM big_uploads WHERE key = ? AND completed_at IS NOT NULL")
    .bind(key)
    .first<BigUploadRow>();
  return row && row.expires_at > Date.now() ? row : null;
}

// ---- Admin -----------------------------------------------------------------

export interface AdminBigUpload {
  key: string;
  name: string;
  size: number;
  userId: string;
  uploader: string;
  createdAt: number;
  expiresAt: number;
  done: boolean;
}

export async function adminBigUploads(db: D1Database): Promise<{
  allowed: string[];
  admins: string[];
  files: AdminBigUpload[];
  used: number;
  budget: number;
  maxBytes: number;
}> {
  await ensureBigUploadTables(db);
  const grants = await db.prepare("SELECT user_id FROM big_upload_grants").all<{ user_id: string }>();
  const accounts = await db.prepare("SELECT id, is_admin FROM users").all<{ id: string; is_admin: number }>();
  const files = await db
    .prepare(
      `SELECT b.*, COALESCE(u.display_name, u.username, 'deleted account') AS uploader
       FROM big_uploads b LEFT JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC`,
    )
    .all<BigUploadRow & { uploader: string }>();
  return {
    allowed: grants.results.map((row) => row.user_id),
    admins: accounts.results.filter((row) => isInstanceAdmin(row)).map((row) => row.id),
    files: files.results.map((row) => ({
      key: row.key,
      name: row.name,
      size: row.size,
      userId: row.user_id,
      uploader: row.uploader,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      done: Boolean(row.completed_at),
    })),
    used: files.results.reduce((sum, row) => sum + row.size, 0),
    budget: bigUploadBudget(),
    maxBytes: BIG_UPLOAD_MAX_BYTES,
  };
}

export async function setBigUploadGrant(
  db: D1Database,
  userId: string,
  allowed: boolean,
  actor: User,
): Promise<{ ok: true } | Failure> {
  await ensureBigUploadTables(db);
  const target = await db
    .prepare("SELECT id, display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; display_name: string }>();
  if (!target) return { error: "No such account.", status: 404 };
  await db
    .prepare(
      allowed
        ? "INSERT OR IGNORE INTO big_upload_grants (user_id, granted_by, granted_at) VALUES (?, ?, ?)"
        : "DELETE FROM big_upload_grants WHERE user_id = ?",
    )
    .bind(...(allowed ? [userId, actor.id, Date.now()] : [userId]))
    .run();
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: allowed ? "member.big_uploads_on" : "member.big_uploads_off",
    targetId: target.id,
    targetName: target.display_name,
  });
  return { ok: true };
}

export async function adminDeleteBigUpload(
  db: D1Database,
  bucket: R2Bucket,
  key: string,
  actor: User,
): Promise<{ ok: true } | Failure> {
  await ensureBigUploadTables(db);
  const row = await db.prepare("SELECT * FROM big_uploads WHERE key = ?").bind(key).first<BigUploadRow>();
  if (!row) return { error: "That file is already gone.", status: 404 };
  await removeBigUpload(db, bucket, row);
  await recordAudit(db, {
    serverId: INSTANCE_AUDIT,
    actor,
    action: "upload.big_delete",
    targetId: row.user_id,
    targetName: row.name,
  });
  return { ok: true };
}
