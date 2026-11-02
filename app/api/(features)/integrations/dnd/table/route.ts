import { authenticateBot } from "@/lib/bot-auth";
import { companionRoll, DND_TABLE_OPS, type DndTableOp } from "@/lib/dnd-table";
import { nativeFor } from "@/lib/discord/snowflake";
import { dndTable, publishMessageEvent } from "@/lib/hub-client";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** A battle map the companion puts on the table; larger images are refused. */
const MAP_MAX_BYTES = 15 * 1024 * 1024;

/**
 * The D&D companion's side of the shared tabletop (lib/dnd-table.ts). D&D bot
 * token only. Body: { op, user: <snowflake>, value?, roll? }
 *
 *   character  value: the hero's table card, or null      → their card at the table
 *   gm                                                    → they take the GM screen
 *   tablemap   value: { path: "/uploads/maps/…", turns?, zoom? } → copied here, put on the table
 *   spellfx    value: { spell, damageType?, heals?, count?, area? } → drawn from their pawn
 *   roll       roll: { expression, sides, values, modifier, total }  → thrown onto the table
 *   where                                                 → { rooms } they sit in
 *
 * Everything acts in the voice rooms the person is sitting in right now, with
 * the same checks as their own tab at the table.
 */
export async function POST(request: Request) {
  const bot = await authenticateBot(request).catch(() => null);
  if (!bot || (bot.kind !== "dnd" && bot.kind !== "system")) {
    return Response.json({ error: "D&D bot only." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const op = typeof body?.op === "string" ? body.op : "";
  if (!body || (op !== "roll" && !DND_TABLE_OPS.has(op))) {
    return Response.json({ error: "Unknown op." }, { status: 400 });
  }
  const userId = typeof body.user === "string" ? await nativeFor("user", body.user) : null;
  if (!userId) return Response.json({ error: "No such user here." }, { status: 404 });

  if (op === "roll") {
    const raw = (body.roll ?? {}) as Record<string, unknown>;
    const { rooms } = await dndTable({ op: "where", userId });
    if (!rooms.length) return Response.json({ ok: true, rooms });
    const roll = companionRoll(
      { id: userId, displayName: await displayName(userId) },
      {
        expression: String(raw.expression ?? ""),
        sides: Number(raw.sides),
        values: Array.isArray(raw.values) ? (raw.values as number[]) : [],
        modifier: Number(raw.modifier ?? 0),
        total: Number(raw.total ?? 0),
      },
    );
    if (!roll) return Response.json({ error: "Not a roll the table can show." }, { status: 400 });
    for (const room of rooms) await publishMessageEvent(room, { t: "dice-roll", roll });
    return Response.json({ ok: true, rooms });
  }

  if (op === "tablemap") {
    const value = (body.value ?? {}) as Record<string, unknown>;
    const url = await copyCompanionMap(String(value.path ?? ""));
    if (!url) return Response.json({ error: "That map could not be copied to the table." }, { status: 400 });
    const result = await dndTable({ op: "tablemap", userId, value: { url, turns: Number(value.turns ?? 0), zoom: Number(value.zoom ?? 1) } });
    return Response.json(result);
  }

  const value = body.value === null ? null : ((body.value ?? {}) as Record<string, unknown>);
  const result = await dndTable({ op, userId, value } as DndTableOp);
  return Response.json(result);
}

async function displayName(userId: string): Promise<string> {
  const db = bindings().DB;
  if (!db) return "Someone";
  const row = await db
    .prepare("SELECT username, display_name FROM users WHERE id = ?")
    .bind(userId)
    .first<{ username: string; display_name: string | null }>()
    .catch(() => null);
  return row?.display_name || row?.username || "Someone";
}

/**
 * The table only shows images uploaded to this server (anything else would
 * taint its WebGL texture), so a companion map is copied into uploads once,
 * under a name derived from its path. Only the companion's own map uploads.
 */
async function copyCompanionMap(path: string): Promise<string | null> {
  if (!/^\/uploads\/maps\/[\w.\-]{1,200}$/.test(path)) return null;
  const bucket = bindings().UPLOADS;
  const base = bindings().DND_BASE_URL?.trim();
  if (!bucket || !base) return null;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  const hash = Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  const extension = (path.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || "png").toLowerCase();
  const key = `dnd-map-${hash}--battle-map.${extension}`;
  const url = `/hangout/api/uploads/${encodeURIComponent(key)}`;
  if (await bucket.head(key)) return url;

  let response: Response;
  try {
    response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) });
  } catch {
    return null;
  }
  const type = response.headers.get("content-type") || "";
  const size = Number(response.headers.get("content-length") || 0);
  if (!response.ok || !/^image\/(png|jpeg|webp|gif)$/i.test(type) || size > MAP_MAX_BYTES) return null;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAP_MAX_BYTES) return null;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type }, customMetadata: { uploader: "dnd-bot" } });
  return url;
}
