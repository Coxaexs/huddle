import { publishRecordingState } from "@/lib/hub-client";
import {
  appendRecordingEvent,
  findRecording,
  recordingState,
} from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const token = bindings().RECORDER_SERVICE_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

/** Full path-free session manifest used only during host finalization. */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized recorder." }, { status: 401 });
  }
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  await ensureSchema(db);
  const sessionId =
    new URL(request.url).searchParams.get("sessionId")?.slice(0, 64) || "";
  const row = await findRecording(db, sessionId);
  if (!row) {
    return Response.json({ error: "Unknown recording session." }, { status: 404 });
  }
  const [events, dice] = await Promise.all([
    db
      .prepare(
        `SELECT id, kind, actor_id AS actorId, at_ms AS atMs,
                payload_json AS payload, automatic, created_at AS createdAt
           FROM recording_events WHERE session_id = ?
          ORDER BY at_ms, created_at`,
      )
      .bind(row.id)
      .all(),
    db
      .prepare(
        `SELECT id, roller_id AS rollerId, expression, rolls_json AS rolls,
                modifier, total, roll_type AS rollType,
                animation_seed AS animationSeed, at_ms AS atMs,
                created_at AS createdAt
           FROM recording_dice_events WHERE session_id = ?
          ORDER BY at_ms, created_at`,
      )
      .bind(row.id)
      .all(),
  ]);
  return Response.json({
    recording: await recordingState(db, row),
    events: (events.results || []).map((entry: Record<string, unknown>) => ({
      ...entry,
      automatic: Boolean(entry.automatic),
      payload: JSON.parse(String(entry.payload || "{}")),
    })),
    dice: (dice.results || []).map((entry: Record<string, unknown>) => ({
      ...entry,
      rolls: JSON.parse(String(entry.rolls || "[]")),
    })),
  });
}

/** Host recorder heartbeat and terminal-state callback. */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized recorder." }, { status: 401 });
  }
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    status?: "recording" | "completed" | "failed";
    estimatedBytes?: number;
    diskFreeBytes?: number;
    error?: string;
    outputs?: Array<{
      kind?: string;
      filename?: string;
      contentType?: string;
      bytes?: number;
      checksum?: string;
    }>;
    diagnostic?: { level?: string; code?: string; message?: string };
    event?: {
      kind?: string;
      payload?: Record<string, unknown>;
    };
  };
  let row = await findRecording(db, body.sessionId?.slice(0, 64) || "");
  if (!row) {
    return Response.json({ error: "Unknown recording session." }, { status: 404 });
  }
  const now = new Date().toISOString();
  const previousStatus = row.status;
  if (body.event?.kind === "retention.deleted") {
    await db.batch([
      db
        .prepare(
          "UPDATE recording_sessions SET deleted_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(now, now, row.id),
      db
        .prepare("DELETE FROM recording_outputs WHERE session_id = ?")
        .bind(row.id),
    ]);
    await appendRecordingEvent(db, row, "media.retention-deleted", null, {}, true);
  } else if (body.event?.kind === "automatic.scene") {
    await appendRecordingEvent(
      db,
      row,
      "automatic.scene",
      null,
      {
        scene:
          typeof body.event.payload?.scene === "string"
            ? body.event.payload.scene.slice(0, 24)
            : "party",
        speakerId:
          typeof body.event.payload?.speakerId === "string"
            ? body.event.payload.speakerId.slice(0, 64)
            : null,
      },
      true,
    );
  }
  const status =
    body.status === "recording" &&
    (row.status === "countdown" || row.status === "recording")
      ? "recording"
      : body.status === "completed" &&
          ["recording", "paused", "finalizing"].includes(row.status)
        ? "completed"
        : body.status === "failed"
          ? "failed"
          : row.status;
  await db
    .prepare(
      `UPDATE recording_sessions
          SET status = ?, recorder_last_seen_at = ?, estimated_bytes = ?,
              disk_free_bytes = ?, error = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      status,
      now,
      Math.max(0, Math.floor(Number(body.estimatedBytes) || 0)),
      Number.isFinite(body.diskFreeBytes) ? Math.max(0, Math.floor(Number(body.diskFreeBytes))) : null,
      body.error?.slice(0, 500) || null,
      now,
      row.id,
    )
    .run();

  if (body.diagnostic?.message) {
    await db
      .prepare(
        `INSERT INTO recorder_diagnostics
           (id, session_id, level, code, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        row.id,
        body.diagnostic.level?.slice(0, 12) || "info",
        body.diagnostic.code?.slice(0, 40) || "recorder",
        body.diagnostic.message.slice(0, 1000),
        now,
      )
      .run();
  }

  if (status === "completed" && body.outputs?.length) {
    await db.batch(
      body.outputs.slice(0, 32).map((output) =>
        db
          .prepare(
            `INSERT INTO recording_outputs
               (id, session_id, kind, filename, content_type, bytes, checksum, completed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            row!.id,
            output.kind?.slice(0, 32) || "file",
            output.filename?.replace(/[^\w.-]+/g, "-").slice(0, 120) || "recording",
            output.contentType?.slice(0, 80) || "application/octet-stream",
            Math.max(0, Math.floor(Number(output.bytes) || 0)),
            output.checksum?.slice(0, 128) || null,
            now,
          ),
      ),
    );
  }
  row = (await findRecording(db, row.id))!;
  if (body.status && previousStatus !== status) {
    await appendRecordingEvent(db, row, `recorder.${body.status}`, null, {
      error: body.error?.slice(0, 500) || null,
    });
  }
  const state = await recordingState(db, row);
  await publishRecordingState(row.channel_id, state);
  if (status === "completed" || status === "failed") {
    // Keep the final state visible long enough for the summary response; a new
    // setup can replace it because only active rows are unique.
    await publishRecordingState(row.channel_id, state);
  }
  return Response.json({ ok: true, recording: state });
}
