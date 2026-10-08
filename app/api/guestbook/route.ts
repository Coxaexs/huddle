import { resolveRoll } from "@/app/api/integrations/dnd/roll/route";
import { publicMessage } from "@/app/api/messages/route";
import {
  checkGuestName,
  checkGuestText,
  GUESTBOOK_CHANNEL_ID,
  GUESTBOOK_CHANNEL_NAME,
  GUESTBOOK_DICE_THEMES,
  GUESTBOOK_MODERATORS,
  GUESTBOOK_RATE_LIMITS,
  GUESTBOOK_SERVER_ID,
  guestColour,
} from "@/lib/guestbook";
import { publishMessage } from "@/lib/hub-client";
import type { DiceRollEvent } from "@/lib/protocol";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";
import { isSafeProfileImage } from "@/lib/users";

export const dynamic = "force-dynamic";

/**
 * /api/guestbook — the live, public #say-hi channel on hoffle.online.
 *
 * GET lists the newest messages for everyone on the page, with what the app's
 * own components need to draw them. POST needs no account, so: plain text or
 * `/roll` only (see lib/guestbook.ts for what is refused), a per-IP budget,
 * and JSON bodies only, which makes a cross-site form post impossible without
 * a CORS preflight this route never answers.
 *
 * Messages land in #say-hi of a server whose only members are the guestbook
 * moderators. They see it in the app, and whatever they delete there drops
 * off the page; whatever they post there shows on the page too.
 */

/** How many messages the page shows. */
const PUBLIC_LIMIT = 60;

/** Every open landing page polls; one query per isolate every few seconds is plenty. */
const CACHE_MS = 3000;
let cached: { at: number; body: string } | null = null;

/** One message as the landing page draws it; the field names follow the app's `Message`. */
export interface GuestbookMessage {
  id: string;
  author: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  text: string;
  createdAt: string;
  bot: boolean;
  kind?: string;
  payload?: Record<string, unknown>;
  commandText?: string;
  commandBy?: string;
}

interface Row {
  id: string;
  author: string;
  avatar: string;
  color: string;
  content: string;
  created_at: string;
  is_bot: number;
  kind: string | null;
  payload: string | null;
  command_text: string | null;
  command_by: string | null;
  user_display_name: string | null;
  user_avatar: string | null;
  user_avatar_url: string | null;
  user_color: string | null;
}

/** Only dice cards carry a payload out; the visitor fingerprint stays in. */
function cardPayload(kind: string | null, raw: string | null): Record<string, unknown> | undefined {
  if (kind !== "dnd" || !raw) return undefined;
  try {
    const { guest: _guest, sender: _sender, ...payload } = JSON.parse(raw) as Record<string, unknown>;
    return payload;
  } catch {
    return undefined;
  }
}

function toPublic(row: Row): GuestbookMessage {
  // Team members show as they do in the app: current name, colour and picture.
  const member = row.user_display_name !== null;
  return {
    id: row.id,
    author: member ? row.user_display_name! : row.author,
    avatar: member ? row.user_avatar || row.avatar : row.avatar,
    avatarUrl: member && isSafeProfileImage(row.user_avatar_url) ? row.user_avatar_url : null,
    color: member ? row.user_color || row.color : row.color,
    text: row.content,
    createdAt: row.created_at,
    bot: Boolean(row.is_bot),
    kind: row.kind ?? undefined,
    payload: cardPayload(row.kind, row.payload),
    commandText: row.command_text ?? undefined,
    commandBy: row.command_by ?? undefined,
  };
}

export async function GET() {
  const db = bindings().DB;
  if (!db) return Response.json({ messages: [] });
  const now = Date.now();
  if (!cached || now - cached.at > CACHE_MS) {
    await ensureSchema(db);
    const rows = await db
      .prepare(
        `SELECT m.id, m.author, m.avatar, m.color, m.content, m.created_at, m.is_bot, m.kind, m.payload,
                m.command_text, m.command_by,
                u.display_name AS user_display_name, u.avatar AS user_avatar,
                u.avatar_url AS user_avatar_url, u.color AS user_color
           FROM messages m
           LEFT JOIN users u ON u.id = m.user_id
          WHERE m.channel_id = ? AND m.deleted_at IS NULL AND m.thread_id IS NULL
          ORDER BY m.created_at DESC LIMIT ${PUBLIC_LIMIT}`,
      )
      .bind(GUESTBOOK_CHANNEL_ID)
      .all<Row>();
    const messages = (rows.results || []).reverse().map(toPublic);
    cached = { at: now, body: JSON.stringify({ messages }) };
  }
  return new Response(cached.body, {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Creates the server, channel and memberships once per isolate. */
let ready: Promise<string[] | null> | null = null;

async function ensureGuestbook(db: D1Database): Promise<string[] | null> {
  const placeholders = GUESTBOOK_MODERATORS.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT id, username_lower FROM users WHERE username_lower IN (${placeholders})`)
    .bind(...GUESTBOOK_MODERATORS)
    .all<{ id: string; username_lower: string }>();
  const moderatorIds = GUESTBOOK_MODERATORS.map(
    (name) => (rows.results || []).find((row) => row.username_lower === name)?.id,
  ).filter((id): id is string => Boolean(id));
  // A self-hosted copy has no flo or kiwi; the guestbook is then simply off.
  if (!moderatorIds.length) return null;

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO servers (id, name, icon, color, created_by, created_at, position)
         VALUES (?, 'hoffle.online visitors', 'HV', '#6a4ddb', ?, ?, 999)`,
      )
      .bind(GUESTBOOK_SERVER_ID, moderatorIds[0], now),
    db
      .prepare(
        `INSERT OR IGNORE INTO channels (id, server_id, name, kind, topic, position, created_at)
         VALUES (?, ?, ?, 'text', ?, 0, ?)`,
      )
      .bind(
        GUESTBOOK_CHANNEL_ID,
        GUESTBOOK_SERVER_ID,
        GUESTBOOK_CHANNEL_NAME,
        "Public messages from the hoffle.online landing page. Delete anything that shouldn't be there.",
        now,
      ),
    ...moderatorIds.map((id) =>
      db
        .prepare("INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)")
        .bind(GUESTBOOK_SERVER_ID, id, now),
    ),
  ]);
  return moderatorIds;
}

/** A short, salted fingerprint of the sender's IP, so moderators can spot one person posting a lot. */
async function senderTag(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hoffle-guestbook:${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

function refuse(error: string, field: "name" | "text") {
  return Response.json({ error, field }, { status: 400 });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "The chat isn't connected right now." }, { status: 503 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Send JSON." }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as { name?: unknown; text?: unknown; diceTheme?: unknown } | null;
  // Checked before the rate limit so a typo doesn't use up someone's budget.
  const name = checkGuestName(body?.name);
  if (!name.ok) return refuse(name.error, "name");
  const text = checkGuestText(body?.text);
  if (!text.ok) return refuse(text.error, "text");

  // `/roll` is the one command here, resolved by the same code as the app's /roll.
  let roll: Exclude<ReturnType<typeof resolveRoll>, { error: string }> | null = null;
  if (text.value.startsWith("/")) {
    const command = /^\/roll(?:\s+([\s\S]*))?$/i.exec(text.value);
    if (!command) return refuse("Only /roll works here. Try /roll d20 or /roll 2d6+3.", "text");
    if (!command[1]?.trim()) return refuse("Add some dice, like /roll d20+3 stealth or /roll 2d6+2 damage.", "text");
    const diceTheme =
      typeof body?.diceTheme === "string" && (GUESTBOOK_DICE_THEMES as readonly string[]).includes(body.diceTheme)
        ? body.diceTheme
        : "default";
    const resolved = resolveRoll(command[1].trim(), { id: "guest", display_name: name.value }, undefined, diceTheme);
    if ("error" in resolved) return refuse(resolved.error.replace(/`/g, ""), "text");
    roll = resolved;
  }

  await ensureSchema(db);
  const ip = clientIp(request);
  for (const rule of GUESTBOOK_RATE_LIMITS) {
    const result = await checkRateLimit({ db, key: ip, ...rule });
    if (!result.allowed) {
      return Response.json(
        { error: "You've sent a lot of messages. Give it a little while and try again.", retryAfter: result.retryAfter },
        { status: 429, headers: { "retry-after": String(result.retryAfter) } },
      );
    }
  }

  ready ??= ensureGuestbook(db).catch((error) => {
    ready = null;
    throw error;
  });
  const moderatorIds = await ready;
  if (!moderatorIds) return Response.json({ error: "This server has no guestbook." }, { status: 404 });

  const sender = await senderTag(ip);
  const base = {
    id: crypto.randomUUID(),
    channel: GUESTBOOK_CHANNEL_NAME,
    channel_id: GUESTBOOK_CHANNEL_ID,
    user_id: null,
    attachment_key: null,
    created_at: new Date().toISOString(),
  };
  // A roll is stored exactly like the app's own /roll answer: a D&D Bot card,
  // credited to the roller.
  const stored: StoredMessage = roll
    ? {
        ...base,
        author: "D&D Bot",
        avatar: "⚔",
        color: "#b8a6ff",
        content: `${roll.label ? `${roll.label}: ` : ""}rolled ${roll.expression}${roll.mode}: ${roll.details.join(" · ")}. Total: ${roll.total}`,
        is_bot: 1,
        kind: "dnd",
        payload: JSON.stringify({
          type: "roll",
          name: "Dice result",
          expression: roll.expression,
          mode: roll.mode.trim(),
          label: roll.label || undefined,
          roller: name.value,
          total: roll.total,
          modifier: roll.modifier,
          details: roll.details,
          dice: roll.roll.dice,
          guest: true,
          sender,
        }),
        command_text: text.value.slice(0, 200),
        command_by: name.value,
      }
    : {
        ...base,
        author: `${name.value} (visitor)`,
        avatar: name.value.slice(0, 1).toUpperCase(),
        color: guestColour(name.value),
        content: text.value,
        is_bot: 0,
        kind: null,
        payload: JSON.stringify({ guest: true, sender }),
        command_text: null,
        command_by: null,
      };

  await db
    .prepare(
      `INSERT INTO messages (id, channel, channel_id, user_id, author, avatar, color, content, is_bot, created_at,
                             kind, payload, command_text, command_by)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.is_bot,
      stored.created_at,
      stored.kind ?? null,
      stored.payload ?? null,
      stored.command_text ?? null,
      stored.command_by ?? null,
    )
    .run();

  // Only the moderators' tabs hear about it; the page picks it up on its next poll.
  await publishMessage(GUESTBOOK_CHANNEL_ID, publicMessage(stored), moderatorIds);
  cached = null;

  const message = toPublic({
    id: stored.id,
    author: stored.author,
    avatar: stored.avatar,
    color: stored.color,
    content: stored.content,
    created_at: stored.created_at,
    is_bot: stored.is_bot,
    kind: stored.kind ?? null,
    payload: stored.payload ?? null,
    command_text: stored.command_text ?? null,
    command_by: stored.command_by ?? null,
    user_display_name: null,
    user_avatar: null,
    user_avatar_url: null,
    user_color: null,
  });
  const dice: DiceRollEvent | undefined = roll?.roll;
  return Response.json({ message, roll: dice }, { status: 201 });
}
