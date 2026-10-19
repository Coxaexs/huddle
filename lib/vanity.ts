/**
 * Vanity invites: a server picks its own invite code ("HOFFLE-FANS" instead
 * of "7KQ2M9XWPA"). It is stored as an ordinary invites row, so every place
 * that redeems a code (the invite page, joining) handles it without knowing
 * it is special; `servers.vanity_code` just remembers which row is the
 * server's. Unlike other new codes it has no use limit (max_uses 0): a
 * server manager chose it on purpose, and Raid Lockdown still pauses it.
 */

/** Matches the shortest code chat links recognise (app/lib/chat/invites.ts). */
export const VANITY_MIN = 4;
export const VANITY_MAX = 24;

export type VanityResult = { ok: true; code: string | null } | { ok: false; error: string };

/** Uppercased like every other code (lookups uppercase what people type). */
export function normalizeVanityCode(value: unknown): VanityResult {
  if (value === null || value === undefined) return { ok: true, code: null };
  if (typeof value !== "string") return { ok: false, error: "The vanity code must be text." };
  const code = value.trim().toUpperCase();
  if (!code) return { ok: true, code: null };
  if (code.length < VANITY_MIN || code.length > VANITY_MAX) {
    return { ok: false, error: `A vanity code is ${VANITY_MIN} to ${VANITY_MAX} characters.` };
  }
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) {
    return { ok: false, error: "Use letters, numbers and single dashes only." };
  }
  return { ok: true, code };
}

/**
 * Points `serverId` at `code` (or clears it). The old vanity row is revoked,
 * not deleted, so the member list can still say who joined through it.
 * Returns an error message when the code is taken.
 */
export async function setVanityCode(
  db: D1Database,
  serverId: string,
  userId: string,
  code: string | null,
  previous: string | null,
): Promise<string | null> {
  if (code === previous) return null;
  if (code) {
    const taken = await db
      .prepare("SELECT server_id, revoked FROM invites WHERE code = ?")
      .bind(code)
      .first<{ server_id: string | null; revoked: number }>();
    // Reclaiming this server's own retired vanity code is fine; anything else is taken.
    if (taken && !(taken.server_id === serverId && taken.revoked)) {
      return "That invite code is already taken.";
    }
  }
  const statements: D1PreparedStatement[] = [];
  if (previous) {
    statements.push(db.prepare("UPDATE invites SET revoked = 1 WHERE code = ? AND server_id = ?").bind(previous, serverId));
  }
  if (code) {
    statements.push(
      db
        .prepare(
          `INSERT INTO invites (code, created_by, created_at, max_uses, uses, revoked, note, server_id)
           VALUES (?1, ?2, ?3, 0, 0, 0, 'Vanity URL', ?4)
           ON CONFLICT(code) DO UPDATE SET revoked = 0, max_uses = 0, created_by = ?2`,
        )
        .bind(code, userId, new Date().toISOString(), serverId),
    );
  }
  statements.push(db.prepare("UPDATE servers SET vanity_code = ? WHERE id = ?").bind(code, serverId));
  await db.batch(statements);
  return null;
}
