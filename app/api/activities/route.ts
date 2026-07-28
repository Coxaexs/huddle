import { currentUser, unauthorized } from "@/lib/auth";
import {
  DEFAULT_TIERS,
  isActivityKind,
  type ActivityStroke,
  type RoomActivity,
  type RoomActivityKind,
  type TierRow,
} from "@/lib/activities";
import { publishMessageEvent } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface ActivityRow {
  channel_id: string;
  kind: RoomActivityKind;
  state_json: string;
  secret: string | null;
  created_by: string;
  created_by_name: string;
  updated_at: string;
}

const DRAW_WORDS = [
  "butterfly",
  "castle",
  "coffee",
  "dragon",
  "fireworks",
  "headphones",
  "moonlight",
  "penguin",
  "pizza",
  "rainbow",
  "spaceship",
  "strawberry",
  "sunflower",
  "teapot",
  "unicorn",
];

function jsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function publicActivity(row: ActivityRow, userId?: string): RoomActivity {
  const state = jsonObject(row.state_json);
  if (
    row.kind === "drawguess" &&
    state.drawerId === userId &&
    row.secret
  ) {
    state.word = row.secret;
  } else if (row.kind === "drawguess") {
    delete state.word;
  }
  return {
    channelId: row.channel_id,
    kind: row.kind,
    state,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    updatedAt: row.updated_at,
  };
}

async function channelForMember(
  db: D1Database,
  channelId: string,
  userId: string,
) {
  const channel = await db
    .prepare("SELECT id, server_id, kind FROM channels WHERE id = ?")
    .bind(channelId)
    .first<{ id: string; server_id: string; kind: string }>();
  if (
    !channel ||
    channel.kind !== "voice" ||
    !(await isServerMember(db, channel.server_id, userId))
  ) {
    return null;
  }
  return channel;
}

async function rowFor(db: D1Database, channelId: string) {
  return db
    .prepare(
      `SELECT channel_id, kind, state_json, secret, created_by,
              created_by_name, updated_at
         FROM room_activities WHERE channel_id = ?`,
    )
    .bind(channelId)
    .first<ActivityRow>();
}

function cleanStroke(value: unknown, userId: string): ActivityStroke | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ActivityStroke>;
  const points = Array.isArray(input.points)
    ? input.points
        .slice(0, 800)
        .map(Number)
        .filter((point) => Number.isFinite(point))
        .map((point) => Math.max(0, Math.min(1000, point)))
    : [];
  if (points.length < 4 || points.length % 2) return null;
  return {
    id: String(input.id || crypto.randomUUID()).slice(0, 80),
    color: /^#[0-9a-f]{6}$/i.test(String(input.color))
      ? String(input.color)
      : "#8f7aea",
    width: Math.max(1, Math.min(20, Number(input.width) || 4)),
    points,
    by: userId,
  };
}

function cleanTiers(value: unknown): TierRow[] {
  if (!Array.isArray(value)) return DEFAULT_TIERS;
  return value.slice(0, 10).map((tier, index) => {
    const input = (tier || {}) as Partial<TierRow>;
    return {
      id: String(input.id || `tier-${index}`).slice(0, 50),
      label: String(input.label || "?").slice(0, 12),
      color: /^#[0-9a-f]{6}$/i.test(String(input.color))
        ? String(input.color)
        : "#8f7aea",
      items: Array.isArray(input.items)
        ? input.items.slice(0, 80).map((item) => String(item).slice(0, 80))
        : [],
    };
  });
}

function cleanState(
  kind: RoomActivityKind,
  value: unknown,
): Record<string, unknown> {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (kind === "watch") {
    const rawUrl = String(input.url || "");
    let url = "";
    try {
      const parsed = new URL(rawUrl);
      if (["http:", "https:"].includes(parsed.protocol)) url = parsed.toString();
    } catch {
      // Rejected below by the client as an empty room.
    }
    return {
      url: url.slice(0, 1200),
      title: String(input.title || "Watch Together").slice(0, 80),
    };
  }
  if (kind === "whiteboard") {
    const strokes = Array.isArray(input.strokes)
      ? input.strokes
          .map((stroke) => cleanStroke(stroke, ""))
          .filter(Boolean)
          .slice(-400)
      : [];
    return { strokes };
  }
  if (kind === "tierlist") {
    return {
      title: String(input.title || "Our tier list").slice(0, 80),
      tiers: cleanTiers(input.tiers),
      pool: Array.isArray(input.pool)
        ? input.pool.slice(0, 100).map((item) => String(item).slice(0, 80))
        : [],
    };
  }
  if (kind === "timer") {
    return {
      label: String(input.label || "Room timer").slice(0, 60),
      durationMs: Math.max(
        1_000,
        Math.min(24 * 60 * 60 * 1_000, Number(input.durationMs) || 5 * 60_000),
      ),
      remainingMs: Math.max(
        0,
        Math.min(24 * 60 * 60 * 1_000, Number(input.remainingMs) || 5 * 60_000),
      ),
      endsAt:
        input.endsAt && Number.isFinite(Number(input.endsAt))
          ? Number(input.endsAt)
          : null,
      running: Boolean(input.running),
    };
  }
  return {};
}

function pickWord() {
  return DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)];
}

function maskedWord(word: string) {
  return word
    .split("")
    .map((character) => (character === " " ? "  " : "_"))
    .join(" ");
}

async function save(
  db: D1Database,
  row: {
    channelId: string;
    kind: RoomActivityKind;
    state: Record<string, unknown>;
    secret?: string | null;
    createdBy: string;
    createdByName: string;
  },
) {
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO room_activities
         (channel_id, kind, state_json, secret, created_by, created_by_name, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id) DO UPDATE SET
         kind = excluded.kind,
         state_json = excluded.state_json,
         secret = excluded.secret,
         created_by = excluded.created_by,
         created_by_name = excluded.created_by_name,
         updated_at = excluded.updated_at`,
    )
    .bind(
      row.channelId,
      row.kind,
      JSON.stringify(row.state).slice(0, 240_000),
      row.secret ?? null,
      row.createdBy,
      row.createdByName,
      updatedAt,
    )
    .run();
  return rowFor(db, row.channelId);
}

async function broadcast(channelId: string, activity: RoomActivity | null) {
  await publishMessageEvent(channelId, {
    t: "activity",
    action: activity ? "update" : "close",
    activity,
  });
}

export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ activity: null });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  if (!(await channelForMember(db, channelId, user.id))) {
    return Response.json({ error: "Voice room not found." }, { status: 404 });
  }
  const row = await rowFor(db, channelId);
  return Response.json({
    activity: row ? publicActivity(row, user.id) : null,
  });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Storage is not connected." }, { status: 503 });
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    action?: string;
    kind?: unknown;
    state?: unknown;
    stroke?: unknown;
    guess?: string;
  };
  const channelId = String(body.channelId || "").slice(0, 64);
  if (!(await channelForMember(db, channelId, user.id))) {
    return Response.json({ error: "Voice room not found." }, { status: 404 });
  }

  if (body.action === "close") {
    await db
      .prepare("DELETE FROM room_activities WHERE channel_id = ?")
      .bind(channelId)
      .run();
    await broadcast(channelId, null);
    return Response.json({ activity: null });
  }

  if (body.action === "open") {
    if (!isActivityKind(body.kind)) {
      return Response.json({ error: "Unknown activity." }, { status: 400 });
    }
    let state = cleanState(body.kind, body.state);
    let secret: string | null = null;
    if (body.kind === "drawguess") {
      secret = pickWord();
      state = {
        round: 1,
        drawerId: user.id,
        drawerName: user.display_name,
        masked: maskedWord(secret),
        strokes: [],
        guesses: [],
        winner: null,
      };
    }
    const row = await save(db, {
      channelId,
      kind: body.kind,
      state,
      secret,
      createdBy: user.id,
      createdByName: user.display_name,
    });
    const activity = publicActivity(row!, user.id);
    await broadcast(channelId, publicActivity(row!));
    return Response.json({ activity }, { status: 201 });
  }

  const existing = await rowFor(db, channelId);
  if (!existing) {
    return Response.json({ error: "No activity is open here." }, { status: 404 });
  }
  let state = jsonObject(existing.state_json);
  let secret = existing.secret;

  if (existing.kind === "drawguess") {
    const strokes = Array.isArray(state.strokes) ? state.strokes : [];
    if (body.action === "stroke") {
      if (state.drawerId !== user.id) {
        return Response.json({ error: "Only the drawer can draw." }, { status: 403 });
      }
      const stroke = cleanStroke(body.stroke, user.id);
      if (!stroke) return Response.json({ error: "Empty stroke." }, { status: 400 });
      state.strokes = [...strokes, stroke].slice(-400);
    } else if (body.action === "clear") {
      if (state.drawerId !== user.id) {
        return Response.json({ error: "Only the drawer can clear." }, { status: 403 });
      }
      state.strokes = [];
    } else if (body.action === "guess") {
      if (state.drawerId === user.id) {
        return Response.json({ error: "The drawer already knows the word." }, { status: 400 });
      }
      const guess = String(body.guess || "").trim().slice(0, 60);
      if (!guess) return Response.json({ error: "Type a guess." }, { status: 400 });
      const correct =
        guess.toLocaleLowerCase() === String(secret || "").toLocaleLowerCase();
      const guesses = Array.isArray(state.guesses) ? state.guesses : [];
      state.guesses = [
        ...guesses,
        {
          id: crypto.randomUUID(),
          name: user.display_name,
          text: correct ? "guessed it!" : guess,
          correct,
        },
      ].slice(-30);
      if (correct) {
        state.winner = user.display_name;
        state.reveal = secret;
      }
    } else if (body.action === "next") {
      secret = pickWord();
      state = {
        round: Math.max(1, Number(state.round) || 1) + 1,
        drawerId: user.id,
        drawerName: user.display_name,
        masked: maskedWord(secret),
        strokes: [],
        guesses: [],
        winner: null,
      };
    } else {
      return Response.json({ error: "Unknown drawing action." }, { status: 400 });
    }
  } else if (body.action === "update") {
    state = cleanState(existing.kind, body.state);
  } else if (body.action === "stroke" && existing.kind === "whiteboard") {
    const stroke = cleanStroke(body.stroke, user.id);
    if (!stroke) return Response.json({ error: "Empty stroke." }, { status: 400 });
    const strokes = Array.isArray(state.strokes) ? state.strokes : [];
    state.strokes = [...strokes, stroke].slice(-400);
  } else if (body.action === "clear" && existing.kind === "whiteboard") {
    state.strokes = [];
  } else {
    return Response.json({ error: "Unknown activity action." }, { status: 400 });
  }

  const saved = await save(db, {
    channelId,
    kind: existing.kind,
    state,
    secret,
    createdBy: existing.created_by,
    createdByName: existing.created_by_name,
  });
  const activity = publicActivity(saved!, user.id);
  await broadcast(channelId, publicActivity(saved!));
  return Response.json({ activity });
}
