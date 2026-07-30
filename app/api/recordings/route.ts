import { currentUser, unauthorized } from "@/lib/auth";
import {
  hubState,
  publishMessageEvent,
  publishRecordingState,
} from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import {
  activeRecording,
  appendRecordingEvent,
  elapsedMs,
  findRecording,
  notifyRecorder,
  recordingState,
  safeScene,
  type RecordingRow,
} from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import type { RecordingScene, RecordingState } from "@/lib/protocol";

export const dynamic = "force-dynamic";

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function publish(db: D1Database, row: RecordingRow): Promise<RecordingState> {
  const state = await recordingState(db, row);
  await publishRecordingState(row.channel_id, state);
  return state;
}

async function controllerAllowed(
  db: D1Database,
  userId: string,
  row: RecordingRow,
): Promise<boolean> {
  return can(db, userId, row.server_id, Permission.RECORD_SESSIONS);
}

/** Active state for a room, or a completed-session summary by id. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return error("Recording metadata storage is not connected.", 503);
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId")?.slice(0, 64);
  const channelId = url.searchParams.get("channelId")?.slice(0, 64);
  const row = sessionId
    ? await findRecording(db, sessionId)
    : channelId
      ? await activeRecording(db, channelId)
      : null;
  if (!row) return Response.json({ recording: null });
  if (!(await isServerMember(db, row.server_id, user.id))) {
    return error("That recording does not belong to one of your servers.", 403);
  }

  const state = await recordingState(db, row);
  if (!sessionId) {
    return Response.json({
      recording: state,
      canControl: await controllerAllowed(db, user.id, row),
    });
  }
  const [events, outputs, diagnostics] = await Promise.all([
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
        `SELECT id, kind, filename, content_type AS contentType, bytes,
                checksum, completed_at AS completedAt
           FROM recording_outputs WHERE session_id = ? ORDER BY completed_at`,
      )
      .bind(row.id)
      .all(),
    db
      .prepare(
        `SELECT level, code, message, created_at AS createdAt
           FROM recorder_diagnostics WHERE session_id = ?
          ORDER BY created_at`,
      )
      .bind(row.id)
      .all(),
  ]);
  return Response.json({
    recording: state,
    events: (events.results || []).map((entry: Record<string, unknown>) => ({
      ...entry,
      automatic: Boolean(entry.automatic),
      payload: JSON.parse(String(entry.payload || "{}")),
    })),
    outputs: outputs.results || [],
    diagnostics: diagnostics.results || [],
    canControl: await controllerAllowed(db, user.id, row),
  });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return error("Recording metadata storage is not connected.", 503);
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    sessionId?: string;
    channelId?: string;
    title?: string;
    campaign?: string;
    episodeNumber?: number;
    resolution?: string;
    frameRate?: number;
    theme?: string;
    separateAudio?: boolean;
    retentionDays?: number;
    automaticDirection?: boolean;
    participantIds?: string[];
    decision?: string;
    scene?: RecordingScene;
    name?: string;
    kind?: "chapter" | "highlight";
    lockedSpeakerId?: string | null;
    eventId?: string;
    atMs?: number;
  };

  if (body.action === "setup") {
    const channelId = body.channelId?.slice(0, 64) || "";
    const channel = await findChannel(db, channelId);
    if (!channel || channel.kind !== "voice") return error("Choose a voice room.", 400);
    if (!(await can(db, user.id, channel.server_id, Permission.RECORD_SESSIONS))) {
      return error("You do not have permission to record sessions here.", 403);
    }
    if (await activeRecording(db, channelId)) {
      return error("This room already has an active recording session.", 409);
    }

    const live = await hubState();
    const people = (live?.voice[channelId] || []).filter(
      (participant) => !participant.bot && !participant.recorder,
    );
    const requested = new Set((body.participantIds || []).slice(0, 32));
    const selected = people.filter(
      (participant) => !requested.size || requested.has(participant.id),
    );
    if (!selected.length) {
      return error("Select at least one participant who is currently in the room.", 400);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const title = body.title?.trim().slice(0, 120);
    if (!title) return error("Give the session a title.", 400);
    const resolution = body.resolution === "1280x720" ? "1280x720" : "1920x1080";
    const frameRate = body.frameRate === 60 ? 60 : 30;
    const theme = ["parchment", "minimal", "arcane", "noir"].includes(
      body.theme || "",
    )
      ? body.theme!
      : "tavern";
    const episode = Number.isInteger(body.episodeNumber)
      ? Math.max(0, Math.min(9999, Number(body.episodeNumber)))
      : null;
    const campaignName = body.campaign?.trim().slice(0, 120) || null;
    const campaignStorageName = campaignName || `Session · ${title}`;
    const existingCampaign = await db
      .prepare(
        "SELECT id FROM dnd_campaigns WHERE server_id = ? AND lower(name) = lower(?) LIMIT 1",
      )
      .bind(channel.server_id, campaignStorageName)
      .first<{ id: string }>();
    const campaignId = existingCampaign?.id || crypto.randomUUID();
    if (!existingCampaign) {
      await db
        .prepare(
          `INSERT INTO dnd_campaigns
             (id, server_id, name, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          campaignId,
          channel.server_id,
          campaignStorageName,
          user.id,
          now,
          now,
        )
        .run();
    }

    await db.batch([
      db
        .prepare(
          `INSERT INTO recording_sessions
             (id, server_id, channel_id, controller_id, title, campaign_id, campaign_name,
              episode_number, resolution, frame_rate, theme, separate_audio, retention_days,
              automatic_direction, scene, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'party',
                   'awaiting-consent', ?, ?)`,
        )
        .bind(
          id,
          channel.server_id,
          channelId,
          user.id,
          title,
          campaignId,
          campaignName,
          episode,
          resolution,
          frameRate,
          theme,
          body.separateAudio ? 1 : 0,
          Math.max(1, Math.min(3650, Number(body.retentionDays) || 90)),
          body.automaticDirection === false ? 0 : 1,
          now,
          now,
        ),
      ...selected.map((participant) =>
        db
          .prepare(
            `INSERT INTO recording_participants
               (session_id, user_id, display_name, required, decision)
             VALUES (?, ?, ?, 1, 'pending')`,
          )
          .bind(id, participant.id, participant.displayName),
      ),
    ]);
    const row = (await findRecording(db, id))!;
    await appendRecordingEvent(db, row, "setup", user.id, {
      participantCount: selected.length,
      resolution,
      frameRate,
      theme,
    });
    return Response.json({ recording: await publish(db, row), canControl: true }, { status: 201 });
  }

  const sessionId = body.sessionId?.slice(0, 64) || "";
  let row = await findRecording(db, sessionId);
  if (!row) return error("That recording session no longer exists.", 404);

  if (body.action === "consent") {
    const decision =
      body.decision === "accepted" || body.decision === "declined"
        ? body.decision
        : body.decision === "withdrawn"
          ? "withdrawn"
          : null;
    if (!decision) return error("Choose accept, decline, or withdraw.", 400);
    const participant = await db
      .prepare(
        "SELECT user_id FROM recording_participants WHERE session_id = ? AND user_id = ?",
      )
      .bind(row.id, user.id)
      .first();
    if (!participant) return error("You are not selected for this recording.", 403);

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE recording_participants
            SET decision = ?, decided_at = ?
          WHERE session_id = ? AND user_id = ?`,
      )
      .bind(decision, now, row.id, user.id)
      .run();
    await appendRecordingEvent(db, row, `consent.${decision}`, user.id);

    // Withdrawal is fail-closed: stop writing immediately, but keep voice live.
    if (
      decision === "withdrawn" &&
      (row.status === "recording" || row.status === "countdown")
    ) {
      const accumulated = elapsedMs(row);
      await db
        .prepare(
          `UPDATE recording_sessions
              SET status = 'paused', paused_at = ?, active_since_at = NULL,
                  accumulated_ms = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(now, accumulated, now, row.id)
        .run();
      row = (await findRecording(db, row.id))!;
      const state = await recordingState(db, row);
      await notifyRecorder("pause", state);
    }
    return Response.json({ recording: await publish(db, row) });
  }

  if (!(await controllerAllowed(db, user.id, row))) {
    return error("You do not have permission to direct this recording.", 403);
  }
  const now = new Date().toISOString();

  if (body.action === "event-update" || body.action === "event-delete") {
    const eventId = body.eventId?.slice(0, 64) || "";
    const event = await db
      .prepare(
        `SELECT id, kind, payload_json, at_ms
           FROM recording_events WHERE id = ? AND session_id = ?`,
      )
      .bind(eventId, row.id)
      .first<{
        id: string;
        kind: string;
        payload_json: string;
        at_ms: number;
      }>();
    if (!event) return error("Timeline event not found.", 404);
    if (body.action === "event-delete") {
      await db
        .prepare(
          "DELETE FROM recording_events WHERE id = ? AND session_id = ?",
        )
        .bind(event.id, row.id)
        .run();
      await appendRecordingEvent(db, row, "timeline.delete", user.id, {
        eventId: event.id,
        kind: event.kind,
      });
      return Response.json({ ok: true });
    }
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(event.payload_json || "{}") as Record<string, unknown>;
    } catch {
      payload = {};
    }
    if (body.name?.trim()) payload.name = body.name.trim().slice(0, 100);
    const atMs = Number.isFinite(body.atMs)
      ? Math.max(0, Math.min(elapsedMs(row), Math.floor(Number(body.atMs))))
      : event.at_ms;
    await db
      .prepare(
        `UPDATE recording_events
            SET at_ms = ?, payload_json = ?
          WHERE id = ? AND session_id = ?`,
      )
      .bind(atMs, JSON.stringify(payload).slice(0, 8_000), event.id, row.id)
      .run();
    await appendRecordingEvent(db, row, "timeline.edit", user.id, {
      eventId: event.id,
      atMs,
    });
    return Response.json({ ok: true });
  }

  if (body.action === "delete") {
    if (!["completed", "failed", "cancelled"].includes(row.status)) {
      return error("Stop and finalize the recording before deleting its media.", 409);
    }
    const recorder = await notifyRecorder("delete", await recordingState(db, row));
    if (!recorder.ok) return error(recorder.error, 503);
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
    await appendRecordingEvent(db, row, "media.deleted", user.id);
    return Response.json({ ok: true });
  }

  if (body.action === "start" || body.action === "resume") {
    const expected = body.action === "start" ? "awaiting-consent" : "paused";
    if (row.status !== expected) {
      return error(`The session cannot ${body.action} from ${row.status}.`, 409);
    }
    const missing = await db
      .prepare(
        `SELECT COUNT(*) AS count FROM recording_participants
          WHERE session_id = ? AND required = 1 AND decision != 'accepted'`,
      )
      .bind(row.id)
      .first<{ count: number }>();
    if (missing?.count) {
      return error("Every required participant must consent before recording.", 409);
    }
    const before = await recordingState(db, row);
    const recorder = await notifyRecorder(body.action, before);
    if (!recorder.ok) return error(recorder.error, 503);
    await db
      .prepare(
        `UPDATE recording_sessions
            SET status = 'countdown', started_at = COALESCE(started_at, ?),
                active_since_at = ?, paused_at = NULL, error = NULL, updated_at = ?
          WHERE id = ?`,
      )
      .bind(now, now, now, row.id)
      .run();
    row = (await findRecording(db, row.id))!;
    await appendRecordingEvent(db, row, body.action, user.id);
    return Response.json({ recording: await publish(db, row) });
  }

  if (body.action === "pause") {
    if (row.status !== "recording" && row.status !== "countdown") {
      return error(`The session cannot pause from ${row.status}.`, 409);
    }
    const accumulated = elapsedMs(row);
    const current = await recordingState(db, row);
    const recorder = await notifyRecorder("pause", current);
    if (!recorder.ok) return error(recorder.error, 503);
    await db
      .prepare(
        `UPDATE recording_sessions
            SET status = 'paused', paused_at = ?, active_since_at = NULL,
                accumulated_ms = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(now, accumulated, now, row.id)
      .run();
    row = (await findRecording(db, row.id))!;
    await appendRecordingEvent(db, row, "pause", user.id);
    return Response.json({ recording: await publish(db, row) });
  }

  if (body.action === "stop") {
    if (!["awaiting-consent", "countdown", "recording", "paused"].includes(row.status)) {
      return error(`The session cannot stop from ${row.status}.`, 409);
    }
    const accumulated = elapsedMs(row);
    if (row.status !== "awaiting-consent") {
      const recorder = await notifyRecorder("stop", await recordingState(db, row));
      if (!recorder.ok) return error(recorder.error, 503);
    }
    const next = row.status === "awaiting-consent" ? "cancelled" : "finalizing";
    await db
      .prepare(
        `UPDATE recording_sessions
            SET status = ?, stopped_at = ?, active_since_at = NULL,
                accumulated_ms = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(next, now, accumulated, now, row.id)
      .run();
    row = (await findRecording(db, row.id))!;
    await appendRecordingEvent(db, row, next === "cancelled" ? "cancel" : "stop", user.id);
    const state = await publish(db, row);
    if (next === "cancelled") await publishRecordingState(row.channel_id, null);
    return Response.json({ recording: state });
  }

  if (body.action === "scene") {
    if (!["countdown", "recording", "paused"].includes(row.status)) {
      return error("Scenes can only change during an active session.", 409);
    }
    const scene = safeScene(body.scene);
    await db
      .prepare(
        "UPDATE recording_sessions SET scene = ?, updated_at = ? WHERE id = ?",
      )
      .bind(scene, now, row.id)
      .run();
    row = (await findRecording(db, row.id))!;
    await appendRecordingEvent(db, row, "scene", user.id, { scene });
    const state = await publish(db, row);
    await publishMessageEvent(row.channel_id, {
      t: "recording-scene",
      sessionId: row.id,
      scene,
      automatic: false,
    });
    void notifyRecorder("scene", state);
    return Response.json({ recording: state });
  }

  if (body.action === "marker") {
    if (!["recording", "paused"].includes(row.status)) {
      return error("Markers require a started session.", 409);
    }
    const kind = body.kind === "highlight" ? "highlight" : "chapter";
    const name = body.name?.trim().slice(0, 100) || (kind === "highlight" ? "Highlight" : "Chapter");
    const marker = {
      id: crypto.randomUUID(),
      kind,
      name,
      atMs: elapsedMs(row),
    };
    await appendRecordingEvent(db, row, "marker", user.id, marker);
    await publishMessageEvent(row.channel_id, {
      t: "recording-marker",
      sessionId: row.id,
      marker,
    });
    return Response.json({ recording: await publish(db, row), marker });
  }

  if (body.action === "direction") {
    const automatic =
      typeof body.automaticDirection === "boolean"
        ? body.automaticDirection
        : Boolean(row.automatic_direction);
    const lockedSpeakerId = body.lockedSpeakerId?.slice(0, 64) || null;
    await db
      .prepare(
        `UPDATE recording_sessions
            SET automatic_direction = ?, locked_speaker_id = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(automatic ? 1 : 0, lockedSpeakerId, now, row.id)
      .run();
    row = (await findRecording(db, row.id))!;
    await appendRecordingEvent(db, row, "direction", user.id, {
      automatic,
      lockedSpeakerId,
    });
    const state = await publish(db, row);
    void notifyRecorder("direction", state);
    return Response.json({ recording: state });
  }

  return error("Unknown recording action.", 400);
}
