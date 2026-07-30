import type {
  RecordingConsent,
  RecordingScene,
  RecordingState,
  RecordingStatus,
} from "./protocol";
import { bindings } from "./storage";

export interface RecordingRow {
  id: string;
  server_id: string;
  channel_id: string;
  controller_id: string;
  title: string;
  campaign_id: string | null;
  campaign_name: string | null;
  episode_number: number | null;
  resolution: string;
  frame_rate: number;
  theme: string;
  separate_audio: number;
  retention_days: number;
  automatic_direction: number;
  locked_speaker_id: string | null;
  scene: string;
  status: RecordingStatus;
  started_at: string | null;
  active_since_at: string | null;
  paused_at: string | null;
  stopped_at: string | null;
  accumulated_ms: number;
  estimated_bytes: number;
  disk_free_bytes: number | null;
  recorder_last_seen_at: string | null;
  error: string | null;
  updated_at: string;
}

interface ConsentRow {
  user_id: string;
  display_name: string;
  required: number;
  decision: RecordingConsent["decision"];
  decided_at: string | null;
}

const ACTIVE = [
  "awaiting-consent",
  "countdown",
  "recording",
  "paused",
  "finalizing",
] as const;

export const RECORDING_SCENES = new Set<RecordingScene>([
  "party",
  "speaker",
  "battlemap",
  "split",
  "intermission",
]);

export function safeScene(value: unknown): RecordingScene {
  return RECORDING_SCENES.has(value as RecordingScene)
    ? (value as RecordingScene)
    : "party";
}

export function safeFilename(value: string): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "dnd-session";
}

export async function findRecording(
  db: D1Database,
  id: string,
): Promise<RecordingRow | null> {
  return db
    .prepare("SELECT * FROM recording_sessions WHERE id = ?")
    .bind(id)
    .first<RecordingRow>();
}

export async function activeRecording(
  db: D1Database,
  channelId: string,
): Promise<RecordingRow | null> {
  return db
    .prepare(
      `SELECT * FROM recording_sessions
        WHERE channel_id = ?
          AND status IN ('awaiting-consent','countdown','recording','paused','finalizing')
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(channelId)
    .first<RecordingRow>();
}

export function elapsedMs(row: RecordingRow, now = Date.now()): number {
  const base = Math.max(0, Number(row.accumulated_ms) || 0);
  if (
    (row.status === "recording" || row.status === "countdown") &&
    row.active_since_at
  ) {
    return base + Math.max(0, now - new Date(row.active_since_at).getTime());
  }
  return base;
}

export async function recordingState(
  db: D1Database,
  row: RecordingRow,
): Promise<RecordingState> {
  const result = await db
    .prepare(
      `SELECT user_id, display_name, required, decision, decided_at
         FROM recording_participants
        WHERE session_id = ? ORDER BY display_name`,
    )
    .bind(row.id)
    .all<ConsentRow>();
  const consents: RecordingConsent[] = (result.results || []).map((entry) => ({
    userId: entry.user_id,
    displayName: entry.display_name,
    required: Boolean(entry.required),
    decision: entry.decision,
    decidedAt: entry.decided_at,
  }));
  const seenAt = row.recorder_last_seen_at
    ? new Date(row.recorder_last_seen_at).getTime()
    : 0;
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    title: row.title,
    campaign: row.campaign_name,
    episodeNumber: row.episode_number,
    status: row.status,
    scene: safeScene(row.scene),
    resolution: row.resolution === "1280x720" ? "1280x720" : "1920x1080",
    frameRate: row.frame_rate === 60 ? 60 : 30,
    theme: ["parchment", "minimal", "arcane", "noir"].includes(row.theme)
      ? (row.theme as RecordingState["theme"])
      : "tavern",
    separateAudio: Boolean(row.separate_audio),
    retentionDays: Math.max(1, Number(row.retention_days) || 90),
    automaticDirection: Boolean(row.automatic_direction),
    lockedSpeakerId: row.locked_speaker_id,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    stoppedAt: row.stopped_at,
    elapsedMs: elapsedMs(row),
    recorderHealthy: seenAt > 0 && Date.now() - seenAt < 15_000,
    recorderLastSeenAt: row.recorder_last_seen_at,
    estimatedBytes: Number(row.estimated_bytes) || 0,
    diskFreeBytes:
      row.disk_free_bytes == null ? null : Number(row.disk_free_bytes),
    error: row.error,
    controllerId: row.controller_id,
    consents,
    updatedAt: row.updated_at,
  };
}

export async function appendRecordingEvent(
  db: D1Database,
  row: RecordingRow,
  kind: string,
  actorId: string | null,
  payload: Record<string, unknown> = {},
  automatic = false,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO recording_events
         (id, session_id, kind, actor_id, at_ms, payload_json, automatic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      row.id,
      kind.slice(0, 40),
      actorId,
      elapsedMs(row),
      JSON.stringify(payload).slice(0, 8_000),
      automatic ? 1 : 0,
      new Date().toISOString(),
    )
    .run();
}

/** Sends a small control message; media work remains entirely host-side. */
export async function notifyRecorder(
  action: string,
  state: RecordingState,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const env = bindings();
  if (!env.RECORDER_SERVICE_URL || !env.RECORDER_SERVICE_TOKEN) {
    return { ok: false, error: "Recorder service is not configured." };
  }
  try {
    const response = await fetch(
      `${env.RECORDER_SERVICE_URL.replace(/\/+$/, "")}/v1/sessions/${encodeURIComponent(state.id)}/${action}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RECORDER_SERVICE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state }),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        error: `Recorder service rejected ${action} (${response.status}).`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Recorder service is offline." };
  }
}

export function isActiveStatus(status: RecordingStatus): boolean {
  return (ACTIVE as readonly string[]).includes(status);
}
