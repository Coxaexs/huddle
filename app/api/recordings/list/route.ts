import { currentUser, unauthorized } from "@/lib/auth";
import { recordingState } from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import type { RecordingState } from "@/lib/protocol";

export const dynamic = "force-dynamic";

/**
 * Lists the user's recordings across all servers they belong to, newest first.
 * Returns the full RecordingState for each so the portal can show status,
 * settings and controls without a second round-trip.
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const url = new URL(request.url);
  const serverId = url.searchParams.get("serverId")?.slice(0, 64);

  const statement = db.prepare(
    `SELECT rs.* FROM recording_sessions rs
       JOIN server_members sm ON sm.server_id = rs.server_id AND sm.user_id = ?
      WHERE rs.deleted_at IS NULL
        ${serverId ? "AND rs.server_id = ?" : ""}
      ORDER BY rs.created_at DESC
      LIMIT 100`,
  );
  const rows = serverId
    ? await statement.bind(user.id, serverId).all<Record<string, unknown>>()
    : await statement.bind(user.id).all<Record<string, unknown>>();

  const states: RecordingState[] = [];
  for (const row of rows.results || []) {
    const state = await recordingState(db, row as never);
    states.push(state);
  }

  return Response.json({ recordings: states });
}