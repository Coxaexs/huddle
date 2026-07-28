import { currentUser, unauthorized } from "@/lib/auth";
import {
  clampPoint,
  publicBattlemap,
  type BattlemapRow,
  type MapToken,
} from "@/lib/battlemap";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Anyone who can manage channels here runs the table. */
async function isGm(
  db: D1Database,
  userId: string,
  channelId: string,
): Promise<boolean> {
  const channel = await db
    .prepare("SELECT server_id FROM channels WHERE id = ?")
    .bind(channelId)
    .first<{ server_id: string }>();
  if (!channel) return false;
  return can(db, userId, channel.server_id, Permission.MANAGE_CHANNELS);
}

async function activeMap(
  db: D1Database,
  channelId: string,
): Promise<BattlemapRow | null> {
  return db
    .prepare(
      `SELECT id, channel_id, name, image_key, grid, tokens, strokes, active
         FROM battlemaps WHERE channel_id = ? AND active = 1
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(channelId)
    .first<BattlemapRow>();
}

/** The map currently open in a voice channel, if any. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ map: null });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  const row = await activeMap(db, channelId);
  return Response.json({
    map: row ? publicBattlemap(row) : null,
    gm: await isGm(db, user.id, channelId),
  });
}

/**
 * Table actions. `open` and `close` plus token and paint edits all land here so
 * one permission check covers them, and each broadcasts to the room.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) {
    return Response.json(
      { error: "Message storage is not connected." },
      { status: 503 },
    );
  }
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    channelId?: string;
    action?: string;
    name?: string;
    imageKey?: string | null;
    grid?: number;
    token?: Partial<MapToken>;
    tokenId?: string;
    x?: number;
    y?: number;
    stroke?: { color?: string; width?: number; points?: number[] };
    what?: string;
  };
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId) {
    return Response.json({ error: "Which channel?" }, { status: 400 });
  }
  // The GM check is three DB reads; only run it for actions that actually need
  // it. Painting and moving your own token — the rapid-fire ones during play —
  // then cost nothing extra. Cached so an action never checks twice.
  let gmCache: boolean | undefined;
  const gm = async (): Promise<boolean> =>
    (gmCache ??= await isGm(db, user.id, channelId));
  const forbidden = () =>
    Response.json({ error: "Only the GM can do that." }, { status: 403 });

  // ---- open a new map -----------------------------------------------------
  if (body.action === "open") {
    if (!(await gm())) return forbidden();
    const id = crypto.randomUUID();
    const grid = Math.max(5, Math.min(60, Number(body.grid) || 20));
    await db.batch([
      db
        .prepare("UPDATE battlemaps SET active = 0 WHERE channel_id = ?")
        .bind(channelId),
      db
        .prepare(
          `INSERT INTO battlemaps (id, channel_id, name, image_key, grid, tokens, strokes, active, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, '[]', '[]', 1, ?, ?)`,
        )
        .bind(
          id,
          channelId,
          body.name?.trim().slice(0, 60) || "Battlemap",
          body.imageKey?.slice(0, 240) || null,
          grid,
          user.id,
          new Date().toISOString(),
        ),
    ]);
    const row = await activeMap(db, channelId);
    const map = row ? publicBattlemap(row) : null;
    await publishMessageEvent(channelId, { t: "battlemap", action: "open", map });
    return Response.json({ map }, { status: 201 });
  }

  const row = await activeMap(db, channelId);
  if (!row) {
    return Response.json({ error: "No map is open here." }, { status: 404 });
  }
  const map = publicBattlemap(row);

  // ---- close --------------------------------------------------------------
  if (body.action === "close") {
    if (!(await gm())) return forbidden();
    await db
      .prepare("UPDATE battlemaps SET active = 0 WHERE id = ?")
      .bind(row.id)
      .run();
    await publishMessageEvent(channelId, { t: "battlemap", action: "close" });
    return Response.json({ ok: true });
  }

  // ---- add / remove tokens (GM) -------------------------------------------
  if (body.action === "add-token") {
    if (!(await gm())) return forbidden();
    const token: MapToken = {
      id: crypto.randomUUID(),
      label: (body.token?.label || "Token").slice(0, 40),
      color: /^#[0-9a-fA-F]{6}$/.test(body.token?.color || "")
        ? body.token!.color!
        : "#b8a6ff",
      avatarUrl: body.token?.avatarUrl?.slice(0, 300) || null,
      x: clampPoint(Number(body.token?.x) || 1, map.grid),
      y: clampPoint(Number(body.token?.y) || 1, map.grid),
      ownerId: body.token?.ownerId || null,
      hp: body.token?.hp ?? null,
      maxHp: body.token?.maxHp ?? null,
    };
    const tokens = [...map.tokens, token].slice(0, 60);
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(tokens), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "tokens",
      tokens,
    });
    return Response.json({ tokens });
  }

  if (body.action === "remove-token") {
    if (!(await gm())) return forbidden();
    const tokens = map.tokens.filter((token) => token.id !== body.tokenId);
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(tokens), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "tokens",
      tokens,
    });
    return Response.json({ tokens });
  }

  // ---- move a token: your own, or anything if you are the GM --------------
  if (body.action === "move-token") {
    const token = map.tokens.find((entry) => entry.id === body.tokenId);
    if (!token) {
      return Response.json({ error: "No such token." }, { status: 404 });
    }
    // Ownership is checked first so moving your own (or a free) token never
    // pays for the GM lookup — that is the rapid-fire case while dragging.
    if (token.ownerId && token.ownerId !== user.id && !(await gm())) {
      return Response.json(
        { error: "That is not your character." },
        { status: 403 },
      );
    }
    token.x = clampPoint(Number(body.x), map.grid);
    token.y = clampPoint(Number(body.y), map.grid);
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "token",
      token,
    });
    return Response.json({ token });
  }

  // ---- paint --------------------------------------------------------------
  if (body.action === "stroke") {
    const points = (body.stroke?.points || [])
      .slice(0, 400)
      .map((value) => clampPoint(Number(value), map.grid * 2));
    if (points.length < 2) {
      return Response.json({ error: "Empty stroke." }, { status: 400 });
    }
    const stroke = {
      id: crypto.randomUUID(),
      color: /^#[0-9a-fA-F]{6}$/.test(body.stroke?.color || "")
        ? body.stroke!.color!
        : "#ef6b58",
      width: Math.max(1, Math.min(12, Number(body.stroke?.width) || 3)),
      points,
      by: user.id,
    };
    // Keep the canvas bounded so a long session cannot balloon the row.
    const strokes = [...map.strokes, stroke].slice(-300);
    await db
      .prepare("UPDATE battlemaps SET strokes = ? WHERE id = ?")
      .bind(JSON.stringify(strokes), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "stroke",
      stroke,
    });
    return Response.json({ stroke });
  }

  if (body.action === "clear") {
    if (!(await gm())) return forbidden();
    const clearTokens = body.what === "tokens" || body.what === "all";
    const clearStrokes = body.what === "strokes" || body.what === "all";
    await db
      .prepare("UPDATE battlemaps SET tokens = ?, strokes = ? WHERE id = ?")
      .bind(
        clearTokens ? "[]" : JSON.stringify(map.tokens),
        clearStrokes ? "[]" : JSON.stringify(map.strokes),
        row.id,
      )
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "cleared",
      tokens: clearTokens ? [] : map.tokens,
      strokes: clearStrokes ? [] : map.strokes,
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
