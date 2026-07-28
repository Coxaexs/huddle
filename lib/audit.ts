/**
 * The server audit log: a durable trail of notable moderation and structure
 * changes. `recordAudit` is best-effort — logging must never break the action
 * it is recording — so callers do not await its failure path.
 */

import type { User } from "./auth";

export interface AuditActor {
  id: string;
  display_name: string;
}

export interface AuditEntryInput {
  serverId: string;
  /** Who did it. A bot or system action may pass null with a name. */
  actor: Pick<User, "id" | "display_name"> | AuditActor | null;
  actorName?: string;
  /** Dotted verb, e.g. "member.kick", "channel.create", "role.update". */
  action: string;
  targetId?: string | null;
  targetName?: string | null;
  /** Short human-readable extra context. */
  detail?: string | null;
}

export interface PublicAuditEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetId: string | null;
  targetName: string | null;
  detail: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_id: string | null;
  target_name: string | null;
  detail: string | null;
  created_at: string;
}

/** Writes one audit entry. Swallows errors so it can never break the action. */
export async function recordAudit(
  db: D1Database,
  entry: AuditEntryInput,
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO audit_log
           (id, server_id, actor_id, actor_name, action, target_id, target_name, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        entry.serverId,
        entry.actor?.id ?? null,
        entry.actorName || entry.actor?.display_name || "System",
        entry.action.slice(0, 60),
        entry.targetId ?? null,
        entry.targetName?.slice(0, 120) ?? null,
        entry.detail?.slice(0, 300) ?? null,
        new Date().toISOString(),
      )
      .run();
  } catch {
    // An audit write is never worth failing the request over.
  }
}

/** The most recent entries for a server, newest first. */
export async function listAudit(
  db: D1Database,
  serverId: string,
  limit = 100,
): Promise<PublicAuditEntry[]> {
  const rows = await db
    .prepare(
      `SELECT id, actor_id, actor_name, action, target_id, target_name, detail, created_at
         FROM audit_log WHERE server_id = ?
        ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(serverId, Math.max(1, Math.min(200, limit)))
    .all();
  return ((rows.results || []) as unknown as AuditRow[]).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetId: row.target_id,
    targetName: row.target_name,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
