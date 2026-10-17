import { currentUser, unauthorized } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import { channelAudience } from "@/lib/dms";
import { publishMessageEvent } from "@/lib/hub-client";
import { limitUser, WRITE_RATE_LIMITS } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { findChannel, isServerMember } from "@/lib/servers";
import { bindings } from "@/lib/storage";
import { blockIfTimedOut } from "@/lib/timeouts";
import { cleanWillpowerPicks, V5_WILLPOWER_DICE } from "@/lib/v5-dice";
import { rerollV5, type V5Card } from "@/lib/v5-roll";

export const dynamic = "force-dynamic";

/**
 * Spends Willpower on a posted V5 roll: rerolls up to three of its non-Hunger
 * dice, once, and rewrites the card in place. Only the roller may, and only on
 * a card the roll route wrote (verified); the server rolls the new faces.
 */
export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as {
    messageId?: string;
    picks?: unknown;
    /** The voice room the roller is in, so the table sees the dice too. */
    channelId?: string;
  };
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Rolls need the database." }, { status: 503 });
  await ensureSchema(db);

  const messageId = String(body.messageId || "").slice(0, 64);
  const row = await db
    .prepare("SELECT id, channel_id, kind, payload, sender_id, deleted_at FROM messages WHERE id = ?")
    .bind(messageId)
    .first<{ id: string; channel_id: string | null; kind: string | null; payload: string | null; sender_id: string | null; deleted_at: string | null }>();
  let card: V5Card | null = null;
  try {
    card = row?.payload ? (JSON.parse(row.payload) as V5Card) : null;
  } catch {
    card = null;
  }
  if (!row || row.deleted_at || !row.channel_id || row.kind !== "dnd" || card?.type !== "v5" || !card.verified) {
    return Response.json({ error: "That isn't a V5 roll." }, { status: 404 });
  }
  if (card.rollerId !== user.id || row.sender_id !== user.id) {
    return Response.json({ error: "Only the one who rolled can spend Willpower on it." }, { status: 403 });
  }
  if (card.willpower) {
    return Response.json({ error: "Willpower was already spent on this roll." }, { status: 409 });
  }
  const picks = cleanWillpowerPicks(body.picks, card.normal.length);
  if (!picks) {
    return Response.json(
      { error: `Pick 1 to ${V5_WILLPOWER_DICE} of the normal dice; Hunger dice can't be rerolled.` },
      { status: 400 },
    );
  }

  const access = await channelAccess(db, row.channel_id, user);
  if (!access.ok) return access.response;
  if (!access.channel.isDm) {
    const timedOut = await blockIfTimedOut(db, row.channel_id, user.id);
    if (timedOut) return timedOut;
  }
  const limited = await limitUser(db, WRITE_RATE_LIMITS.message, user.id);
  if (limited) return limited;

  const { roll, card: next, text } = rerollV5(card, picks, { id: user.id, display_name: user.display_name });
  const payload = JSON.stringify(next);
  // Only if the card is still the one we read: two quick clicks spend Willpower once.
  const updated = await db
    .prepare("UPDATE messages SET payload = ?, content = ? WHERE id = ? AND payload = ?")
    .bind(payload, text, row.id, row.payload)
    .run();
  if (!updated.meta?.changes) {
    return Response.json({ error: "Willpower was already spent on this roll." }, { status: 409 });
  }

  await publishMessageEvent(
    row.channel_id,
    { t: "message-edited", id: row.id, content: text, payload: next },
    access.channel.isDm ? await channelAudience(db, row.channel_id) : null,
  );
  // The dice tumble for whoever is reading the channel (a DM's card update is enough).
  if (!access.channel.isDm) await publishMessageEvent(row.channel_id, { t: "dice-roll", roll });
  const voiceChannelId = body.channelId?.slice(0, 64);
  if (voiceChannelId && voiceChannelId !== row.channel_id) {
    const voice = await findChannel(db, voiceChannelId);
    if (voice?.kind === "voice" && (await isServerMember(db, voice.server_id, user.id))) {
      await publishMessageEvent(voiceChannelId, { t: "dice-roll", roll });
    }
  }
  return Response.json({ ok: true, roll, payload: next, text });
}
