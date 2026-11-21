import { unauthorized, userColumns, type User } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import { publicBattlemap, type BattlemapRow } from "@/lib/battlemap";
import { dndBotToken } from "@/lib/bot-auth";
import { dndBaseUrl, dndPublicUrl } from "@/lib/dnd-url";
import { getSecondScreenState, manageSecondScreenPair } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

async function loadOwner(db: D1Database, userId: string): Promise<User | null> {
  return db
    .prepare(`SELECT ${userColumns()} FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first<User>();
}

/**
 * Strictly scoped read-only feed for paired (non-logged-in) 2nd Screen devices.
 *
 * A paired device can ONLY read the exact channel or battlemap currently cast
 * into its owner's 2nd-screen state—never arbitrary channel IDs.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pairToken = params.get("pair")?.trim() || "";
  const kind = params.get("kind")?.trim() || "";
  if (!pairToken) return unauthorized();

  const resolved = await manageSecondScreenPair({ action: "resolve", token: pairToken });
  if (!resolved?.userId) return unauthorized();

  const b = bindings();
  const db = b.DB;
  if (db) await ensureSchema(db);
  const owner = db ? await loadOwner(db, resolved.userId) : null;
  if (!owner || owner.suspended_at) return unauthorized();

  const state = await getSecondScreenState(owner.id);

  if (kind === "dnd-display") {
    const secret = b.BOT_TOKEN?.trim();
    const dndBase = dndBaseUrl("http://127.0.0.1:8000").toString().replace(/\/+$/, "");
    const dndPublic = (dndPublicUrl("https://dnd.deeppixel.online")?.toString() || "https://dnd.deeppixel.online").replace(/\/+$/, "");
    if (!secret) {
      return Response.json({ error: "D&D bridge not configured." }, { status: 503 });
    }
    try {
      const upstream = await fetch(`${dndBase}/api/auth/hoffle-sso`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await dndBotToken(secret)}`,
        },
        body: JSON.stringify({ mode: "display" }),
        signal: AbortSignal.timeout(5000),
      });
      if (!upstream.ok) {
        return Response.json({ error: "D&D display unavailable." }, { status: 502 });
      }
      const data = (await upstream.json()) as { path: string };
      return Response.json({ url: `${dndPublic}${data.path}` });
    } catch {
      return Response.json({ error: "D&D companion unreachable." }, { status: 502 });
    }
  }

  if (!db) return Response.json({ error: "Database unavailable." }, { status: 503 });

  if (kind === "messages") {
    const channelId = state.channelId;
    if (!channelId) return Response.json({ messages: [], channelName: null });
    const access = await channelAccess(db, channelId, owner);
    if (!access.ok) return Response.json({ messages: [], channelName: null });

    const res = await db
      .prepare(
        `SELECT id, channel_id, user_id, author, avatar, color, content, attachment_key,
                is_bot, created_at, edited_at
           FROM messages
          WHERE channel_id = ? AND deleted_at IS NULL AND thread_id IS NULL
          ORDER BY created_at DESC LIMIT 60`,
      )
      .bind(channelId)
      .all<{
        id: string;
        channel_id: string | null;
        user_id: string | null;
        author: string;
        avatar: string;
        color: string;
        content: string;
        attachment_key: string | null;
        is_bot: number;
        created_at: string;
        edited_at: string | null;
      }>();

    const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
    const rows = (res.results || []).reverse();
    const messages = rows.map((m) => {
      let image: string | undefined;
      if (m.attachment_key) {
        const ext = m.attachment_key.split(".").pop()?.toLowerCase() || "";
        if (imageExts.has(ext)) {
          image = `/hangout/api/uploads/${encodeURIComponent(m.attachment_key)}`;
        }
      }
      return {
        id: m.id,
        channelId: m.channel_id,
        userId: m.user_id,
        author: m.author,
        avatar: m.avatar,
        color: m.color,
        text: m.content,
        bot: Boolean(m.is_bot),
        time: new Intl.DateTimeFormat("en", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        }).format(new Date(m.created_at)),
        createdAt: m.created_at,
        editedAt: m.edited_at || undefined,
        image,
      };
    });

    return Response.json({ messages, channelName: access.channel.name });
  }

  if (kind === "battlemap") {
    const channelId = state.voiceChannelId || state.channelId;
    if (!channelId) return Response.json({ map: null });
    const access = await channelAccess(db, channelId, owner);
    if (!access.ok) return Response.json({ map: null });

    const row = await db
      .prepare(
        `SELECT id, channel_id, name, image_key, grid, rows, tokens, strokes, fog, encounter, active
           FROM battlemaps WHERE channel_id = ? AND active = 1
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(channelId)
      .first<BattlemapRow>();
    return Response.json({ map: row ? publicBattlemap(row) : null });
  }

  return Response.json({ error: "Unknown feed kind." }, { status: 400 });
}
