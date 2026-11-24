import { currentUser, unauthorized } from "@/lib/auth";
import { isServerDm } from "@/lib/dnd-rules";
import { publishMessage } from "@/lib/hub-client";
import { publicMessage } from "@/app/api/messages/route";
import { ensureSchema } from "@/lib/schema";
import { findChannel } from "@/lib/servers";
import { bindings, type StoredMessage } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface BlindRollRow {
  seed: string;
  server_id: string;
  channel_id: string;
  roller_id: string;
  card_json: string;
  created_at: number;
}

/** GMs only: inspect a blind roll card by its animationSeed. */
export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
  await ensureSchema(db);

  const seed = new URL(request.url).searchParams.get("seed")?.slice(0, 128) || "";
  if (!seed) {
    return Response.json({ error: "Missing roll seed." }, { status: 400 });
  }
  const row = await db
    .prepare("SELECT seed, server_id, channel_id, roller_id, card_json, created_at FROM blind_rolls WHERE seed = ?")
    .bind(seed)
    .first<BlindRollRow>();
  if (!row) {
    return Response.json({ error: "Blind roll not found." }, { status: 404 });
  }
  const allowed = await isServerDm(db, user.id, row.server_id);
  if (!allowed) {
    return Response.json({ error: "Only the GM can inspect a blind roll." }, { status: 403 });
  }
  try {
    return Response.json({ card: JSON.parse(row.card_json) });
  } catch {
    return Response.json({ error: "Corrupt roll data." }, { status: 500 });
  }
}

/** GMs only: reveal a blind roll into the channel for the whole table. */
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const db = bindings().DB;
  if (!db) {
    return Response.json({ error: "Database unavailable." }, { status: 503 });
  }
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    seed?: string;
  };
  if (body.action !== "reveal" || !body.seed) {
    return Response.json({ error: "Invalid reveal request." }, { status: 400 });
  }
  const row = await db
    .prepare("SELECT seed, server_id, channel_id, roller_id, card_json, created_at FROM blind_rolls WHERE seed = ?")
    .bind(body.seed.slice(0, 128))
    .first<BlindRollRow>();
  if (!row) {
    return Response.json({ error: "Blind roll not found." }, { status: 404 });
  }
  const allowed = await isServerDm(db, user.id, row.server_id);
  if (!allowed) {
    return Response.json({ error: "Only the GM can reveal a blind roll." }, { status: 403 });
  }

  let rawCard: Record<string, unknown>;
  try {
    rawCard = JSON.parse(row.card_json) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Corrupt roll data." }, { status: 500 });
  }

  const revealedCard: Record<string, unknown> = {
    ...rawCard,
    secret: false,
    blind: false,
    verified: true,
    revealedBy: user.display_name,
  };
  const channel = await findChannel(db, row.channel_id);
  const label = typeof rawCard.label === "string" && rawCard.label ? `${rawCard.label} ` : "";
  const roller = typeof rawCard.roller === "string" && rawCard.roller ? rawCard.roller : "Player";
  const totalText = typeof rawCard.total === "number" ? ` Total: ${rawCard.total}` : "";
  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel?.name || "table",
    channel_id: row.channel_id,
    user_id: null,
    author: "D&D Bot",
    avatar: "⚔",
    color: "#b8a6ff",
    content: `${user.display_name} revealed ${roller}'s blind ${label}roll.${totalText}`,
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    kind: "dnd",
    payload: JSON.stringify(revealedCard),
    command_text: "/blindroll reveal",
    command_by: user.display_name,
    sender_id: user.id,
  };

  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, kind, payload, command_text, command_by, sender_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.created_at,
      stored.kind,
      stored.payload,
      stored.command_text,
      stored.command_by,
      stored.sender_id,
    )
    .run();

  const message = publicMessage(stored);
  await publishMessage(row.channel_id, message, null);
  return Response.json({ ok: true, card: revealedCard, message });
}
