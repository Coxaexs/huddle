import { currentUser, unauthorized } from "@/lib/auth";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import {
  appendRecordingEvent,
  findRecording,
  type RecordingRow,
} from "@/lib/recording";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import type {
  CharacterPresentation,
  CharacterReveal,
} from "@/lib/protocol";

export const dynamic = "force-dynamic";

interface CharacterRow {
  user_id: string;
  display_name: string;
  character_name: string | null;
  portrait_key: string | null;
  artwork_key: string | null;
  class_name: string | null;
  level: number | null;
  accent_color: string | null;
  show_player_name: number | null;
  public_card_json: string | null;
}

function uploadUrl(key: string | null): string | null {
  return key
    ? `/hangout/api/uploads/${encodeURIComponent(key)}`
    : null;
}

function safeFields(value: unknown, maximum = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maximum)
    .map((entry) => {
      const item = entry as { label?: unknown; value?: unknown };
      return {
        label: String(item.label || "").trim().slice(0, 40),
        value: String(item.value || "").trim().slice(0, 240),
      };
    })
    .filter((entry) => entry.label && entry.value);
}

function presentation(row: CharacterRow): CharacterPresentation {
  let publicCard: Array<{ label: string; value: string }> = [];
  try {
    publicCard = safeFields(JSON.parse(row.public_card_json || "[]"));
  } catch {
    publicCard = [];
  }
  return {
    userId: row.user_id,
    playerName: row.show_player_name ? row.display_name : null,
    characterName: row.character_name || row.display_name,
    portraitUrl: uploadUrl(row.portrait_key),
    artworkUrl: uploadUrl(row.artwork_key),
    className: row.class_name,
    level: row.level == null ? null : Number(row.level),
    accentColor: row.accent_color || "#ffd67c",
    publicCard,
  };
}

async function selected(
  db: D1Database,
  recording: RecordingRow,
): Promise<CharacterPresentation[]> {
  const rows = await db
    .prepare(
      `SELECT rp.user_id, u.display_name, cc.character_name, cc.portrait_key,
              cc.artwork_key, cc.class_name, cc.level, cc.accent_color,
              cc.show_player_name, cc.public_card_json
         FROM recording_participants rp
         JOIN users u ON u.id = rp.user_id
         LEFT JOIN campaign_characters cc
           ON cc.campaign_id = ? AND cc.user_id = rp.user_id
        WHERE rp.session_id = ? AND rp.decision = 'accepted'
        ORDER BY rp.display_name`,
    )
    .bind(recording.campaign_id || "", recording.id)
    .all<CharacterRow>();
  return (rows.results || []).map(presentation);
}

function recorderAuthorized(request: Request): boolean {
  const token = bindings().RECORDER_SERVICE_TOKEN;
  return Boolean(
    token && request.headers.get("authorization") === `Bearer ${token}`,
  );
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const recorder = recorderAuthorized(request);
  const user = recorder ? null : await currentUser(request);
  if (!recorder && !user) return unauthorized();
  await ensureSchema(db);
  const sessionId =
    new URL(request.url).searchParams.get("sessionId")?.slice(0, 64) || "";
  const recording = await findRecording(db, sessionId);
  if (!recording) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }
  if (
    user &&
    !(await isServerMember(db, recording.server_id, user.id))
  ) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }
  return Response.json({ presentations: await selected(db, recording) });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage unavailable." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    action?: "save" | "reveal" | "clear";
    sessionId?: string;
    userId?: string;
    characterName?: string;
    portraitKey?: string | null;
    artworkKey?: string | null;
    className?: string;
    level?: number;
    accentColor?: string;
    showPlayerName?: boolean;
    publicCard?: unknown;
    mode?: CharacterReveal["mode"];
    title?: string;
    imageUrl?: string | null;
    fields?: unknown;
    durationMs?: number;
  };
  const recording = await findRecording(
    db,
    body.sessionId?.slice(0, 64) || "",
  );
  if (!recording) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }
  const participant = await db
    .prepare(
      "SELECT decision FROM recording_participants WHERE session_id = ? AND user_id = ?",
    )
    .bind(recording.id, user.id)
    .first<{ decision: string }>();
  const controls = await can(
    db,
    user.id,
    recording.server_id,
    Permission.RECORD_SESSIONS,
  );

  if (body.action === "save") {
    if (!participant || !recording.campaign_id) {
      return Response.json(
        { error: "Join this campaign recording before configuring a character." },
        { status: 403 },
      );
    }
    const now = new Date().toISOString();
    const color = /^#[0-9a-f]{6}$/i.test(body.accentColor || "")
      ? body.accentColor
      : "#ffd67c";
    const safeKey = (value: string | null | undefined) =>
      value && /^[\w./-]{1,240}$/.test(value) ? value : null;
    await db
      .prepare(
        `INSERT INTO campaign_characters
           (id, campaign_id, user_id, character_name, portrait_key, artwork_key,
            class_name, level, accent_color, show_player_name, public_card_json,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET
           character_name = excluded.character_name,
           portrait_key = COALESCE(excluded.portrait_key, campaign_characters.portrait_key),
           artwork_key = COALESCE(excluded.artwork_key, campaign_characters.artwork_key),
           class_name = excluded.class_name,
           level = excluded.level,
           accent_color = excluded.accent_color,
           show_player_name = excluded.show_player_name,
           public_card_json = excluded.public_card_json,
           updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        recording.campaign_id,
        user.id,
        body.characterName?.trim().slice(0, 80) || user.display_name,
        safeKey(body.portraitKey),
        safeKey(body.artworkKey),
        body.className?.trim().slice(0, 80) || null,
        Number.isInteger(body.level)
          ? Math.max(1, Math.min(30, Number(body.level)))
          : null,
        color,
        body.showPlayerName ? 1 : 0,
        JSON.stringify(safeFields(body.publicCard)),
        now,
        now,
      )
      .run();
    const mine = (await selected(db, recording)).find(
      (entry) => entry.userId === user.id,
    );
    if (mine) {
      await publishMessageEvent(recording.channel_id, {
        t: "character-presentation",
        sessionId: recording.id,
        action: "updated",
        presentation: mine,
      });
    }
    return Response.json({ presentation: mine || null });
  }

  if (body.action === "clear") {
    if (!controls) {
      return Response.json({ error: "Only the director can clear a reveal." }, { status: 403 });
    }
    await publishMessageEvent(recording.channel_id, {
      t: "character-presentation",
      sessionId: recording.id,
      action: "clear",
    });
    await appendRecordingEvent(db, recording, "reveal.clear", user.id);
    return Response.json({ ok: true });
  }

  if (body.action === "reveal") {
    const targetUserId = body.userId?.slice(0, 64) || user.id;
    if (targetUserId !== user.id && !controls) {
      return Response.json({ error: "You can reveal only your own character." }, { status: 403 });
    }
    const available = (await selected(db, recording)).find(
      (entry) => entry.userId === targetUserId,
    );
    if (!available) {
      return Response.json({ error: "That character is not approved for recording." }, { status: 404 });
    }
    const mode: CharacterReveal["mode"] = [
      "portrait",
      "compact",
      "sheet",
      "spell",
      "ability",
      "item",
    ].includes(body.mode || "")
      ? body.mode!
      : "compact";
    // Arbitrary one-off fields are accepted only from the player whose data it
    // is. A GM can reveal only the already-approved public card.
    const fields =
      targetUserId === user.id && ["spell", "ability", "item"].includes(mode)
        ? safeFields(body.fields, 8)
        : mode === "portrait"
          ? []
          : available.publicCard.slice(0, mode === "compact" ? 4 : 12);
    const reveal: CharacterReveal = {
      id: crypto.randomUUID(),
      sessionId: recording.id,
      userId: targetUserId,
      mode,
      title:
        body.title?.trim().slice(0, 100) || available.characterName,
      imageUrl: available.artworkUrl || available.portraitUrl,
      fields,
      durationMs: Math.max(2_000, Math.min(30_000, Number(body.durationMs) || 8_000)),
    };
    await appendRecordingEvent(db, recording, "reveal", user.id, { ...reveal });
    await publishMessageEvent(recording.channel_id, {
      t: "character-presentation",
      sessionId: recording.id,
      action: "reveal",
      reveal,
    });
    return Response.json({ reveal });
  }

  return Response.json({ error: "Unknown presentation action." }, { status: 400 });
}
