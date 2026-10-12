import { channelAccess } from "@/lib/access";
import { AI_LIMITS, AiError, aiConfigured, askAi, checkAiQuota } from "@/lib/ai";
import { currentUser, unauthorized } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { stripTextStyle } from "@/lib/text-style";

export const dynamic = "force-dynamic";

/** How much of the channel the summary reads, newest first. */
const MAX_MESSAGES = 150;
const MAX_TRANSCRIPT_CHARS = 14_000;

/**
 * /summarize: a private catch-up on a channel. The summary goes back to the
 * person who asked only; nothing is posted, so nobody else is disturbed and
 * nothing the AI says ends up in the channel's history.
 */
export async function POST(request: Request): Promise<Response> {
  const env = bindings();
  const db = env.DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const keys = {
    anthropicKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL,
    geminiKey: env.GEMINI_API_KEY,
    geminiModels: env.GEMINI_MODEL,
  };
  if (!aiConfigured(keys)) {
    return Response.json(
      { error: "/summarize needs the server owner to set GEMINI_API_KEY or ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { channelId?: string; sinceRead?: boolean };
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId) return Response.json({ error: "Pick a channel first." }, { status: 400 });
  const access = await channelAccess(db, channelId, user);
  if (!access.ok) return access.response;

  // Only what arrived since you last read the channel, when you ask for that
  // and there is something; otherwise the recent conversation.
  let since: string | null = null;
  if (body.sinceRead) {
    const read = await db
      .prepare("SELECT read_at FROM channel_reads WHERE user_id = ? AND channel_id = ?")
      .bind(user.id, channelId)
      .first<{ read_at: string }>()
      .catch(() => null);
    since = read?.read_at || null;
  }
  const rows = await db
    .prepare(
      `SELECT author, content, created_at FROM messages
        WHERE channel_id = ? AND deleted_at IS NULL AND thread_id IS NULL
          ${since ? "AND created_at > ?" : ""}
        ORDER BY created_at DESC LIMIT ${MAX_MESSAGES}`,
    )
    .bind(...(since ? [channelId, since] : [channelId]))
    .all<{ author: string; content: string; created_at: string }>();
  const messages = (rows.results || []).reverse();
  if (messages.length < 3) {
    return Response.json({ summary: "There isn't enough here to summarize yet.", count: messages.length });
  }

  let transcript = "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const line = `${stripTextStyle(messages[i].author)}: ${stripTextStyle(messages[i].content).replace(/\s+/g, " ")}\n`;
    if (transcript.length + line.length > MAX_TRANSCRIPT_CHARS) break;
    transcript = line + transcript;
  }

  const dailyCap = Number(env.AI_DAILY_LIMIT) > 0 ? Number(env.AI_DAILY_LIMIT) : AI_LIMITS.perDayDefault;
  const quota = await checkAiQuota(db, user.id, {
    perMinute: AI_LIMITS.perMinute,
    perHour: AI_LIMITS.perHour,
    perDay: dailyCap,
  });
  if (!quota.allowed) {
    return Response.json({ error: quota.message, retryAfter: quota.retryAfter }, { status: 429 });
  }

  const prompt = [
    `Summarize this chat from the #${access.channel.isDm ? "conversation" : access.channel.name} channel for someone catching up.`,
    "Use at most 6 short bullet points. Name who said or decided what. Mention open questions",
    "or plans with times. Do not invent anything that is not in the chat. Plain text, no headings.",
    "",
    "Chat (oldest first):",
    transcript,
  ].join("\n");
  try {
    const answer = await askAi(keys, [], prompt);
    return Response.json({ summary: answer.text.trim(), count: messages.length });
  } catch (error) {
    // The quota counted this ask up front; a failed answer is refunded.
    await quota.refund?.().catch(() => undefined);
    const status = error instanceof AiError ? error.status : 502;
    return Response.json(
      { error: error instanceof Error ? error.message : "The AI did not answer." },
      { status },
    );
  }
}
