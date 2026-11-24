import { currentUser, unauthorized } from "@/lib/auth";
import {
  clampPoint,
  maskMapForPlayer,
  normalizeHpVisibility,
  publicBattlemap,
  type Battlemap,
  type BattlemapRow,
  type BattlemapSceneSummary,
  type HpVisibility,
  type MapArea,
  type MapFog,
  type MapToken,
} from "@/lib/battlemap";
import { dndBotToken } from "@/lib/bot-auth";
import { getDndSettings, isServerDm, serverDmUserIds } from "@/lib/dnd-rules";
import { notifyDndTable, tableFromMap, type CompanionPawn } from "@/lib/dnd-table";
import { dndBaseUrl } from "@/lib/dnd-url";
import { dndTable, playerCommand, publishMessageEvent } from "@/lib/hub-client";
import type { PawnKind, TableFog } from "@/lib/lounge-shared";
import { resolveTracks } from "@/lib/music";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

function pawnFromMapToken(token: MapToken, map: Battlemap, maxY: number, fallbackOwner: string): CompanionPawn {
  const px = Math.max(0, Math.min(100, (token.x / Math.max(1, map.grid)) * 100));
  const py = Math.max(0, Math.min(100, (token.y / Math.max(1, maxY)) * 100));
  const aspect = map.grid / Math.max(1, maxY);
  const { x, z } = tableFromMap(px, py, aspect, 0, 1);
  const label = token.label || "Token";
  const hero = Boolean(token.ownerId);
  const size = token.size ? Math.max(1, Math.min(6, Math.round(token.size))) : 1;
  const kind: PawnKind = hero
    ? "fighter"
    : /dragon|wyrm|drake|wyvern/i.test(label)
      ? "dragon"
      : size >= 2
        ? "beast"
        : "fighter";
  return {
    id: `bm-${token.id.replace(/-/g, "").slice(0, 16)}`,
    kind,
    colour: /^#[0-9a-f]{6}$/i.test(token.color) ? token.color.toLowerCase() : "#b8a6ff",
    x,
    z,
    label: label.slice(0, 24),
    owner: token.ownerId || fallbackOwner,
    ownerName: label.slice(0, 40),
    ...(hero ? { hero: true } : {}),
    ...(!hero && token.maxHp ? { hp: token.hp ?? token.maxHp, maxHp: token.maxHp } : {}),
    ...(Array.isArray(token.conditions) && token.conditions.length ? { conditions: token.conditions.slice(0, 8) } : {}),
    ...(size > 1 ? { size } : {}),
    ...(token.avatarUrl && token.avatarUrl.startsWith("/") ? { portraitUrl: token.avatarUrl } : {}),
  };
}

function fogFromMap(map: Battlemap, maxY: number): TableFog | null {
  const coverRects = map.fog.filter((f) => f.mode !== "reveal");
  if (!coverRects.length) return null;
  const g = Math.max(1, map.grid);
  const h = Math.max(1, maxY);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    enabled: true,
    rects: coverRects.slice(0, 80).map((f) => ({
      id: `bmf-${f.id.replace(/-/g, "").slice(0, 16)}`,
      x: round2(Math.max(0, Math.min(100, (f.x / g) * 100))),
      y: round2(Math.max(0, Math.min(100, (f.y / h) * 100))),
      w: round2(Math.max(0.5, Math.min(100, (f.w / g) * 100))),
      h: round2(Math.max(0.5, Math.min(100, (f.h / h) * 100))),
    })),
  };
}

async function syncBattlemapToTable(
  channelId: string,
  userId: string,
  map: Battlemap,
  opts: { maxY?: number; syncMap?: boolean; syncTokens?: boolean; token?: MapToken; removeTokenId?: string; syncFog?: boolean } = {},
): Promise<void> {
  try {
    const maxY = opts.maxY || map.rows || Math.round(map.grid * 0.6) || map.grid;
    const value: Record<string, unknown> = {};
    if (opts.syncMap) {
      value.map = map.imageUrl && map.imageUrl.startsWith("/hangout/api/uploads/") ? { url: map.imageUrl, turns: 0, zoom: 1 } : null;
    }
    if (opts.token) {
      if (opts.token.hidden) {
        value.removePawnId = `bm-${opts.token.id.replace(/-/g, "").slice(0, 16)}`;
      } else {
        value.pawn = pawnFromMapToken(opts.token, map, maxY, userId);
      }
    } else if (opts.syncTokens) {
      value.pawns = map.tokens.filter((t) => !t.hidden).map((t) => pawnFromMapToken(t, map, maxY, userId));
    }
    if (opts.removeTokenId) {
      value.removePawnId = `bm-${opts.removeTokenId.replace(/-/g, "").slice(0, 16)}`;
    }
    const fogValue = opts.syncFog ? fogFromMap(map, maxY) : undefined;
    if (opts.syncFog) {
      value.fog = fogValue ?? null;
    }
    await dndTable({ op: "battlemap-sync", userId, channelId, value });
    if (opts.syncFog) {
      void notifyDndTable(userId, { type: "fog", room: channelId, people: [userId], value: fogValue ?? null });
    }
  } catch {
    // Best-effort live tabletop sync.
  }
}

async function channelServerId(db: D1Database, channelId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT server_id FROM channels WHERE id = ?")
    .bind(channelId)
    .first<{ server_id: string }>()
    .catch(() => null);
  return row?.server_id ?? null;
}

async function audienceSplit(db: D1Database, channelId: string): Promise<{ dmIds: string[]; playerIds: string[] } | null> {
  const serverId = await channelServerId(db, channelId);
  if (!serverId) return null;
  const [dmIds, memberRows] = await Promise.all([
    serverDmUserIds(db, serverId),
    db.prepare("SELECT user_id FROM server_members WHERE server_id = ?").bind(serverId).all<{ user_id: string }>().catch(() => null),
  ]);
  if (!dmIds.length) return null;
  const dmSet = new Set(dmIds);
  const playerIds = (memberRows?.results || []).map((r) => r.user_id).filter((id) => id && !dmSet.has(id));
  return { dmIds, playerIds };
}

async function broadcastMapOpen(db: D1Database, channelId: string, map: Battlemap): Promise<void> {
  const hasHidden = map.tokens.some((t) => t.hidden) || normalizeHpVisibility(map.hpVisibility) !== "exact";
  if (!hasHidden) {
    await publishMessageEvent(channelId, { t: "battlemap", action: "open", map });
    return;
  }
  const split = await audienceSplit(db, channelId);
  if (!split) {
    await publishMessageEvent(channelId, { t: "battlemap", action: "open", map: maskMapForPlayer(map, "") });
    return;
  }
  await publishMessageEvent(channelId, { t: "battlemap", action: "open", map }, split.dmIds);
  if (split.playerIds.length) {
    await publishMessageEvent(
      channelId,
      { t: "battlemap", action: "open", map: maskMapForPlayer(map, "") },
      split.playerIds,
    );
  }
}

async function broadcastMapTokens(db: D1Database, channelId: string, map: Battlemap): Promise<void> {
  const hasHidden = map.tokens.some((t) => t.hidden) || normalizeHpVisibility(map.hpVisibility) !== "exact";
  if (!hasHidden) {
    await publishMessageEvent(channelId, { t: "battlemap", action: "tokens", tokens: map.tokens });
    return;
  }
  const split = await audienceSplit(db, channelId);
  if (!split) {
    await publishMessageEvent(channelId, { t: "battlemap", action: "tokens", tokens: maskMapForPlayer(map, "").tokens });
    return;
  }
  await publishMessageEvent(channelId, { t: "battlemap", action: "tokens", tokens: map.tokens }, split.dmIds);
  if (split.playerIds.length) {
    await publishMessageEvent(
      channelId,
      { t: "battlemap", action: "tokens", tokens: maskMapForPlayer(map, "").tokens },
      split.playerIds,
    );
  }
}

async function broadcastSingleToken(
  db: D1Database,
  channelId: string,
  map: Battlemap,
  token: MapToken,
  wasHidden = false,
): Promise<void> {
  const vis = normalizeHpVisibility(map.hpVisibility);
  const needsSplit = Boolean(token.hidden || wasHidden || (!token.ownerId && vis !== "exact"));
  if (!needsSplit) {
    await publishMessageEvent(channelId, { t: "battlemap", action: "token", token });
    return;
  }
  const split = await audienceSplit(db, channelId);
  if (!split) {
    if (token.hidden) {
      await publishMessageEvent(channelId, { t: "battlemap", action: "token-removed", tokenId: token.id });
    } else {
      const masked = maskMapForPlayer(map, "").tokens.find((t) => t.id === token.id) ?? token;
      await publishMessageEvent(channelId, { t: "battlemap", action: "token", token: masked });
    }
    return;
  }
  await publishMessageEvent(channelId, { t: "battlemap", action: "token", token }, split.dmIds);
  if (split.playerIds.length) {
    if (token.hidden) {
      await publishMessageEvent(
        channelId,
        { t: "battlemap", action: "token-removed", tokenId: token.id },
        split.playerIds,
      );
    } else {
      const masked = maskMapForPlayer(map, "").tokens.find((t) => t.id === token.id) ?? token;
      await publishMessageEvent(channelId, { t: "battlemap", action: "token", token: masked }, split.playerIds);
    }
  }
}

async function listScenes(db: D1Database, channelId: string): Promise<BattlemapSceneSummary[]> {
  const res = await db
    .prepare(
      `SELECT id, name, image_key, tokens, active, created_at
         FROM battlemaps
        WHERE channel_id = ?
        ORDER BY created_at DESC
        LIMIT 30`,
    )
    .bind(channelId)
    .all<{ id: string; name: string; image_key: string | null; tokens: string; active: number; created_at: string }>()
    .catch(() => null);
  return (res?.results || []).map((row) => {
    let tokenCount = 0;
    try {
      const parsed = JSON.parse(row.tokens || "[]");
      if (Array.isArray(parsed)) tokenCount = parsed.length;
    } catch {
      tokenCount = 0;
    }
    return {
      id: row.id,
      name: row.name,
      imageUrl: row.image_key ? `/hangout/api/uploads/${encodeURIComponent(row.image_key)}` : null,
      active: Boolean(row.active),
      tokenCount,
      createdAt: row.created_at,
    };
  });
}

/** Game Masters (configured GM role, or anyone who can manage channels) run the table. */
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
  return isServerDm(db, userId, channel.server_id);
}

async function activeMap(
  db: D1Database,
  channelId: string,
): Promise<BattlemapRow | null> {
  return db
    .prepare(
      `SELECT id, channel_id, name, image_key, grid, rows, tokens, strokes, fog, areas, encounter, hp_visibility, active, created_at
         FROM battlemaps WHERE channel_id = ? AND active = 1
        ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(channelId)
    .first<BattlemapRow>();
}

/** The map currently open in a voice channel, if any. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ map: null, scenes: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  const [row, gm] = await Promise.all([activeMap(db, channelId), isGm(db, user.id, channelId)]);
  const rawMap = row ? publicBattlemap(row) : null;
  const map = rawMap && !gm ? maskMapForPlayer(rawMap, user.id) : rawMap;
  const scenes = gm ? await listScenes(db, channelId) : [];
  return Response.json({
    map,
    gm,
    scenes,
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
    mapId?: string;
    activate?: boolean;
    hpVisibility?: HpVisibility;
    name?: string;
    imageKey?: string | null;
    grid?: number;
    rows?: number | null;
    token?: Partial<MapToken>;
    tokenId?: string;
    delta?: number;
    label?: string;
    x?: number;
    y?: number;
    size?: number;
    stroke?: { color?: string; width?: number; points?: number[] };
    fog?: Partial<MapFog>;
    fogId?: string;
    area?: Partial<MapArea>;
    areaId?: string;
    color?: string;
    pullView?: boolean;
    what?: string;
    state?: string;
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

  // ---- open / prep a new map ----------------------------------------------
  if (body.action === "open") {
    if (!(await gm())) return forbidden();
    const id = crypto.randomUUID();
    const grid = Math.max(5, Math.min(60, Number(body.grid) || 20));
    const rows = body.rows ? Math.max(1, Math.min(200, Math.round(Number(body.rows)))) : null;
    const activate = body.activate !== false;
    const hpVis = normalizeHpVisibility(body.hpVisibility);
    const statements: D1PreparedStatement[] = [];
    if (activate) {
      statements.push(db.prepare("UPDATE battlemaps SET active = 0 WHERE channel_id = ?").bind(channelId));
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO battlemaps (id, channel_id, name, image_key, grid, rows, tokens, strokes, areas, hp_visibility, active, saved, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '[]', ?, ?, 1, ?, ?)`,
        )
        .bind(
          id,
          channelId,
          body.name?.trim().slice(0, 60) || "Battlemap",
          body.imageKey?.slice(0, 240) || null,
          grid,
          rows,
          hpVis,
          activate ? 1 : 0,
          user.id,
          new Date().toISOString(),
        ),
    );
    await db.batch(statements);
    const scenes = await listScenes(db, channelId);
    if (!activate) {
      return Response.json({ scenes }, { status: 201 });
    }
    const row = await activeMap(db, channelId);
    const map = row ? publicBattlemap(row) : null;
    if (map) {
      await broadcastMapOpen(db, channelId, map);
      await syncBattlemapToTable(channelId, user.id, map, { maxY: map.rows || Math.round(grid * 0.6) || grid, syncMap: true, syncTokens: true, syncFog: true });
    }
    return Response.json({ map, scenes }, { status: 201 });
  }

  // ---- switch saved scene (GM) --------------------------------------------
  if (body.action === "switch-scene") {
    if (!(await gm())) return forbidden();
    const mapId = body.mapId?.slice(0, 64) || "";
    const target = await db
      .prepare("SELECT id FROM battlemaps WHERE id = ? AND channel_id = ?")
      .bind(mapId, channelId)
      .first<{ id: string }>();
    if (!target) return Response.json({ error: "Scene not found." }, { status: 404 });
    await db.batch([
      db.prepare("UPDATE battlemaps SET active = 0 WHERE channel_id = ?").bind(channelId),
      db.prepare("UPDATE battlemaps SET active = 1 WHERE id = ? AND channel_id = ?").bind(mapId, channelId),
    ]);
    const row = await activeMap(db, channelId);
    const map = row ? publicBattlemap(row) : null;
    const scenes = await listScenes(db, channelId);
    if (map) {
      await broadcastMapOpen(db, channelId, map);
      await syncBattlemapToTable(channelId, user.id, map, { maxY: map.rows || Math.round(map.grid * 0.6) || map.grid, syncMap: true, syncTokens: true, syncFog: true });
    }
    return Response.json({ map, scenes });
  }

  // ---- delete saved scene (GM) --------------------------------------------
  if (body.action === "delete-scene") {
    if (!(await gm())) return forbidden();
    const mapId = body.mapId?.slice(0, 64) || "";
    const target = await db
      .prepare("SELECT id, active FROM battlemaps WHERE id = ? AND channel_id = ?")
      .bind(mapId, channelId)
      .first<{ id: string; active: number }>();
    if (!target) return Response.json({ error: "Scene not found." }, { status: 404 });
    await db.prepare("DELETE FROM battlemaps WHERE id = ? AND channel_id = ?").bind(mapId, channelId).run();
    if (target.active) {
      await publishMessageEvent(channelId, { t: "battlemap", action: "close" });
    }
    const scenes = await listScenes(db, channelId);
    return Response.json({ ok: true, scenes });
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

  // ---- combat / exploration (GM) ------------------------------------------
  // The room sees the change; if the server has music set for it, the call's
  // player switches to that (a playlist link or a search), shuffled.
  if (body.action === "encounter") {
    if (!(await gm())) return forbidden();
    const encounter = body.state === "combat" ? "combat" : "exploration";
    await db.prepare("UPDATE battlemaps SET encounter = ? WHERE id = ?").bind(encounter, row.id).run();
    await publishMessageEvent(channelId, { t: "battlemap", action: "encounter", encounter });
    const server = await db
      .prepare("SELECT server_id FROM channels WHERE id = ?")
      .bind(channelId)
      .first<{ server_id: string }>();
    const settings = server ? await getDndSettings(db, server.server_id) : null;
    const query = encounter === "combat" ? settings?.combatMusic : settings?.exploreMusic;
    let tracks = 0;
    if (query) {
      const found = await resolveTracks(query, user.display_name).catch(() => []);
      if (found.length) {
        await playerCommand(channelId, { name: "enqueueMany", tracks: found, startNow: true });
        if (found.length > 1) await playerCommand(channelId, { name: "shuffle" });
        tracks = found.length;
      }
    }
    void (async () => {
      try {
        const base = dndBaseUrl();
        const secret = bindings().BOT_TOKEN;
        if (!secret) return;
        await fetch(new URL("/api/hoffle/bard/action", base), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${await dndBotToken(secret)}` },
          body: JSON.stringify({ action: "command", cmd: "mood.set", payload: { mood: encounter === "combat" ? "combat" : "explore" } }),
          signal: AbortSignal.timeout(2500),
        });
      } catch {
        // Optional Bard integration.
      }
    })();
    return Response.json({ encounter, tracks });
  }

  // ---- add / remove tokens (GM) -------------------------------------------
  const maxY = map.rows || Math.max(60, map.grid * 3);
  const sanitizeConditionDurations = (raw: unknown): Record<string, number> | undefined => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const entries: [string, number][] = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const key = String(k).trim().slice(0, 32);
      const rounds = Math.round(Number(v));
      if (key && Number.isFinite(rounds) && rounds > 0) {
        entries.push([key, Math.min(999, rounds)]);
        if (entries.length >= 10) break;
      }
    }
    return entries.length ? Object.fromEntries(entries) : undefined;
  };

  if (body.action === "add-token") {
    if (!(await gm())) return forbidden();
    const durations = sanitizeConditionDurations(body.token?.conditionDurations);
    const token: MapToken = {
      id: crypto.randomUUID(),
      label: (body.token?.label || "Token").slice(0, 40),
      color: /^#[0-9a-fA-F]{6}$/.test(body.token?.color || "")
        ? body.token!.color!
        : "#b8a6ff",
      avatarUrl: body.token?.avatarUrl?.slice(0, 300) || null,
      x: clampPoint(Number(body.token?.x) || 1, map.grid),
      y: clampPoint(Number(body.token?.y) || 1, maxY),
      size: Math.max(0.5, Math.min(4, Number(body.token?.size) || 1)),
      ownerId: body.token?.ownerId || null,
      hp: body.token?.hp ?? null,
      maxHp: body.token?.maxHp ?? null,
      conditions: Array.isArray(body.token?.conditions)
        ? body.token.conditions.map(String).slice(0, 10)
        : [],
      ...(durations ? { conditionDurations: durations } : {}),
      initiative:
        typeof body.token?.initiative === "number"
          ? body.token.initiative
          : null,
      ...(body.token?.hidden ? { hidden: true } : {}),
    };
    const tokens = [...map.tokens, token].slice(0, 60);
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(tokens), row.id)
      .run();
    await broadcastMapTokens(db, channelId, { ...map, tokens });
    await syncBattlemapToTable(channelId, user.id, { ...map, tokens }, { maxY, token });
    return Response.json({ tokens });
  }

  // ---- update token conditions, initiative, hidden layer, or hp -----------
  if (body.action === "update-token") {
    const token = map.tokens.find((entry) => entry.id === body.tokenId);
    if (!token) {
      return Response.json({ error: "No such token." }, { status: 404 });
    }
    if (token.ownerId && token.ownerId !== user.id && !(await gm())) {
      return Response.json(
        { error: "That is not your character." },
        { status: 403 },
      );
    }
    const wasHidden = Boolean(token.hidden);
    if (body.token?.hidden !== undefined) {
      if (!(await gm())) return forbidden();
      if (body.token.hidden) token.hidden = true;
      else delete token.hidden;
    }
    if (Array.isArray(body.token?.conditions)) {
      token.conditions = body.token.conditions.map(String).slice(0, 10);
      if (token.conditionDurations) {
        const activeSet = new Set(token.conditions);
        const pruned = Object.fromEntries(
          Object.entries(token.conditionDurations).filter(([k]) => activeSet.has(k)),
        );
        if (Object.keys(pruned).length) token.conditionDurations = pruned;
        else delete token.conditionDurations;
      }
    }
    if (body.token?.conditionDurations !== undefined) {
      const durations = sanitizeConditionDurations(body.token.conditionDurations);
      if (durations) token.conditionDurations = durations;
      else delete token.conditionDurations;
    }
    if (body.token?.initiative !== undefined) {
      token.initiative =
        body.token.initiative === null
          ? null
          : Math.round(Number(body.token.initiative));
    }
    if (body.token?.hp !== undefined) {
      token.hp =
        body.token.hp === null ? null : Math.round(Number(body.token.hp));
    }
    if (body.token?.maxHp !== undefined) {
      token.maxHp =
        body.token.maxHp === null ? null : Math.round(Number(body.token.maxHp));
    }
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await broadcastSingleToken(db, channelId, map, token, wasHidden);
    await syncBattlemapToTable(channelId, user.id, map, { maxY, token });
    return Response.json({ token });
  }

  // ---- apply damage or healing (+ concentration check prompt) -------------
  if (body.action === "apply-damage") {
    const token = map.tokens.find((entry) => entry.id === body.tokenId);
    if (!token) {
      return Response.json({ error: "No such token." }, { status: 404 });
    }
    if (token.ownerId !== user.id && !(await gm())) {
      return Response.json(
        { error: "Only the GM or token owner can apply damage." },
        { status: 403 },
      );
    }
    const delta = Math.round(Number(body.delta) || 0);
    if (delta === 0) {
      return Response.json({ token, concentrationCheck: null });
    }
    const baseHp = token.hp ?? token.maxHp ?? 0;
    const rawNext = Math.max(0, baseHp + delta);
    const nextHp =
      delta > 0 && token.maxHp != null ? Math.min(Math.max(baseHp, token.maxHp), rawNext) : rawNext;
    token.hp = nextHp;
    const damageTaken = delta < 0 ? Math.abs(delta) : 0;
    const isConcentrating = damageTaken > 0 && (token.conditions || []).includes("concentrating");
    const concentrationCheck = isConcentrating
      ? {
          tokenId: token.id,
          label: token.label,
          damage: damageTaken,
          dc: Math.max(10, Math.floor(damageTaken / 2)),
        }
      : null;
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await broadcastSingleToken(db, channelId, map, token);
    await syncBattlemapToTable(channelId, user.id, map, { maxY, token });
    return Response.json({ token, concentrationCheck });
  }

  // ---- monster HP visibility mode (GM) ------------------------------------
  if (body.action === "set-hp-visibility") {
    if (!(await gm())) return forbidden();
    const hpVisibility = normalizeHpVisibility(body.hpVisibility);
    await db
      .prepare("UPDATE battlemaps SET hp_visibility = ? WHERE id = ?")
      .bind(hpVisibility, row.id)
      .run();
    const nextMap = { ...map, hpVisibility };
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "hp-visibility",
      hpVisibility,
    });
    await broadcastMapTokens(db, channelId, nextMap);
    return Response.json({ hpVisibility });
  }

  // ---- clear initiatives across tokens (GM) ------------------------------
  if (body.action === "reset-initiative") {
    if (!(await gm())) return forbidden();
    for (const entry of map.tokens) {
      entry.initiative = null;
    }
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await broadcastMapTokens(db, channelId, map);
    return Response.json({ tokens: map.tokens });
  }

  if (body.action === "remove-token") {
    if (!(await gm())) return forbidden();
    const tokens = map.tokens.filter((token) => token.id !== body.tokenId);
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(tokens), row.id)
      .run();
    await broadcastMapTokens(db, channelId, { ...map, tokens });
    if (body.tokenId) {
      await syncBattlemapToTable(channelId, user.id, { ...map, tokens }, { maxY, removeTokenId: body.tokenId });
    }
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
    token.y = clampPoint(Number(body.y), maxY);
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await broadcastSingleToken(db, channelId, map, token);
    await syncBattlemapToTable(channelId, user.id, map, { maxY, token });
    return Response.json({ token });
  }

  // ---- rename a token (GM, or the token's owner) --------------------------
  if (body.action === "rename-token") {
    const token = map.tokens.find((entry) => entry.id === body.tokenId);
    if (!token) {
      return Response.json({ error: "No such token." }, { status: 404 });
    }
    if (token.ownerId && token.ownerId !== user.id && !(await gm())) {
      return Response.json(
        { error: "That is not your character." },
        { status: 403 },
      );
    }
    const label = (body.label || "").trim().slice(0, 40);
    if (!label) {
      return Response.json({ error: "Name cannot be empty." }, { status: 400 });
    }
    token.label = label;
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await broadcastSingleToken(db, channelId, map, token);
    await syncBattlemapToTable(channelId, user.id, map, { maxY, token });
    return Response.json({ token });
  }

  // ---- resize a token (GM, or the token's owner) --------------------------
  if (body.action === "resize-token") {
    const token = map.tokens.find((entry) => entry.id === body.tokenId);
    if (!token) {
      return Response.json({ error: "No such token." }, { status: 404 });
    }
    if (token.ownerId && token.ownerId !== user.id && !(await gm())) {
      return Response.json(
        { error: "That is not your character." },
        { status: 403 },
      );
    }
    token.size = Math.max(0.5, Math.min(4, Number(body.size) || 1));
    await db
      .prepare("UPDATE battlemaps SET tokens = ? WHERE id = ?")
      .bind(JSON.stringify(map.tokens), row.id)
      .run();
    await broadcastSingleToken(db, channelId, map, token);
    await syncBattlemapToTable(channelId, user.id, map, { maxY, token });
    return Response.json({ token });
  }

  // ---- fog: GMs add/remove/cutout rectangles over the map ----------------
  if (body.action === "add-fog") {
    if (!(await gm())) return forbidden();
    const fog: MapFog = {
      id: crypto.randomUUID(),
      x: clampPoint(Number(body.fog?.x) || 0, map.grid),
      y: clampPoint(Number(body.fog?.y) || 0, maxY),
      w: Math.max(0.5, Number(body.fog?.w) || 1),
      h: Math.max(0.5, Number(body.fog?.h) || 1),
      mode: body.fog?.mode === "reveal" ? "reveal" : "cover",
    };
    const fogList = [...map.fog, fog].slice(-200);
    await db
      .prepare("UPDATE battlemaps SET fog = ? WHERE id = ?")
      .bind(JSON.stringify(fogList), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "fog",
      fog: fogList,
    });
    await syncBattlemapToTable(channelId, user.id, { ...map, fog: fogList }, { maxY, syncFog: true });
    return Response.json({ fog: fogList });
  }

  if (body.action === "cover-all-fog") {
    if (!(await gm())) return forbidden();
    const fogList: MapFog[] = [
      { id: crypto.randomUUID(), x: 0, y: 0, w: map.grid, h: maxY, mode: "cover" },
    ];
    await db
      .prepare("UPDATE battlemaps SET fog = ? WHERE id = ?")
      .bind(JSON.stringify(fogList), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "fog",
      fog: fogList,
    });
    await syncBattlemapToTable(channelId, user.id, { ...map, fog: fogList }, { maxY, syncFog: true });
    return Response.json({ fog: fogList });
  }

  if (body.action === "remove-fog") {
    if (!(await gm())) return forbidden();
    const fogList = map.fog.filter((entry) => entry.id !== body.fogId);
    await db
      .prepare("UPDATE battlemaps SET fog = ? WHERE id = ?")
      .bind(JSON.stringify(fogList), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "fog",
      fog: fogList,
    });
    await syncBattlemapToTable(channelId, user.id, { ...map, fog: fogList }, { maxY, syncFog: true });
    return Response.json({ fog: fogList });
  }

  if (body.action === "clear-fog") {
    if (!(await gm())) return forbidden();
    await db
      .prepare("UPDATE battlemaps SET fog = '[]' WHERE id = ?")
      .bind(row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "fog",
      fog: [],
    });
    await syncBattlemapToTable(channelId, user.id, { ...map, fog: [] }, { maxY, syncFog: true });
    return Response.json({ fog: [] });
  }

  // ---- persistent AoE spell templates -------------------------------------
  if (body.action === "add-area") {
    const rawShape = body.area?.shape;
    const shape: MapArea["shape"] =
      rawShape === "cone" || rawShape === "cube" || rawShape === "line" ? rawShape : "sphere";
    const area: MapArea = {
      id: crypto.randomUUID(),
      shape,
      x: clampPoint(Number(body.area?.x) || 0, map.grid),
      y: clampPoint(Number(body.area?.y) || 0, maxY),
      tx: clampPoint(Number(body.area?.tx ?? body.area?.x) || 0, map.grid),
      ty: clampPoint(Number(body.area?.ty ?? body.area?.y) || 0, maxY),
      sizeFt: Math.max(5, Math.min(300, Math.round(Number(body.area?.sizeFt) || 20))),
      color: /^#[0-9a-fA-F]{6}$/.test(body.area?.color || "")
        ? body.area!.color!
        : "#f97316",
      ...(body.area?.label?.trim() ? { label: body.area.label.trim().slice(0, 40) } : {}),
      ownerId: user.id,
    };
    const areas = [...(map.areas || []), area].slice(-30);
    await db
      .prepare("UPDATE battlemaps SET areas = ? WHERE id = ?")
      .bind(JSON.stringify(areas), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "areas",
      areas,
    });
    return Response.json({ areas });
  }

  if (body.action === "remove-area") {
    const existing = map.areas || [];
    const target = existing.find((entry) => entry.id === body.areaId);
    if (!target) {
      return Response.json({ areas: existing });
    }
    if (target.ownerId && target.ownerId !== user.id && !(await gm())) {
      return forbidden();
    }
    const areas = existing.filter((entry) => entry.id !== body.areaId);
    await db
      .prepare("UPDATE battlemaps SET areas = ? WHERE id = ?")
      .bind(JSON.stringify(areas), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "areas",
      areas,
    });
    return Response.json({ areas });
  }

  if (body.action === "clear-areas") {
    const canClearAll = await gm();
    const areas = canClearAll ? [] : (map.areas || []).filter((entry) => entry.ownerId !== user.id);
    await db
      .prepare("UPDATE battlemaps SET areas = ? WHERE id = ?")
      .bind(JSON.stringify(areas), row.id)
      .run();
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "areas",
      areas,
    });
    return Response.json({ areas });
  }

  // ---- ephemeral map ping (+ optional GM viewport pull) -------------------
  if (body.action === "ping") {
    const pullView = Boolean(body.pullView) && (await gm());
    const ping = {
      id: crypto.randomUUID(),
      x: clampPoint(Number(body.x) || 0, map.grid),
      y: clampPoint(Number(body.y) || 0, maxY),
      color: /^#[0-9a-fA-F]{6}$/.test(body.color || "")
        ? body.color!
        : "#38bdf8",
      byName: user.display_name,
      ...(pullView ? { pullView: true } : {}),
      at: Date.now(),
    };
    await publishMessageEvent(channelId, {
      t: "battlemap",
      action: "ping",
      ping,
    });
    return Response.json({ ping });
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
    if (clearTokens) {
      await syncBattlemapToTable(channelId, user.id, { ...map, tokens: [] }, { maxY, syncTokens: true });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
