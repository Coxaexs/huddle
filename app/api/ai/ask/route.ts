import {
  AI_AUTHOR,
  AI_AVATAR,
  AI_COLOR,
  AI_KIND,
  AI_LIMITS,
  AiError,
  askGemini,
  checkAiQuota,
  buildUserTurn,
  cleanQuestion,
  modelList,
  stripWebPrefix,
  trimHistory,
  wantsWeb,
  webSearch,
  type AiPayload,
  type AiTurn,
} from "@/lib/ai";
import { currentUser, unauthorized } from "@/lib/auth";
import { enforceAutomod } from "@/lib/automod";
import { channelKindInfo, textChannelKindsSql } from "@/lib/channel-kinds";
import { channelAudience, isDmMember } from "@/lib/dms";
import { publishMessage } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import { ensureSchema } from "@/lib/schema";
import { bindings, type StoredMessage } from "@/lib/storage";
import { blockIfTimedOut } from "@/lib/timeouts";
import { publicMessage } from "../../messages/route";

export const dynamic = "force-dynamic";

interface AskBody {
  channelId?: string;
  question?: string;
  /** An earlier AI answer to continue: the question goes into its thread. */
  threadId?: string;
}

function tooMany(message: string, retryAfter: number): Response {
  return Response.json(
    { error: message, retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

async function insertMessage(db: D1Database, stored: StoredMessage): Promise<void> {
  await db
    .prepare(
      `INSERT INTO messages
       (id, channel, channel_id, user_id, author, avatar, color, content, attachment_key,
        is_bot, created_at, kind, payload, thread_id, command_text, command_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      stored.id,
      stored.channel,
      stored.channel_id,
      stored.user_id,
      stored.author,
      stored.avatar,
      stored.color,
      stored.content,
      stored.is_bot,
      stored.created_at,
      stored.kind ?? null,
      stored.payload ?? null,
      stored.thread_id ?? null,
      stored.command_text ?? null,
      stored.command_by ?? null,
    )
    .run();
}

/** Tells the composer whether /ask is set up, and the limits it runs under. */
export async function GET(): Promise<Response> {
  return Response.json({
    enabled: Boolean(bindings().GEMINI_API_KEY?.trim()),
    perMinute: AI_LIMITS.perMinute,
    perHour: AI_LIMITS.perHour,
  });
}

export async function POST(request: Request): Promise<Response> {
  const env = bindings();
  const db = env.DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "/ask is not set up: the server owner needs to set GEMINI_API_KEY." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as AskBody;
  const rawQuestion = cleanQuestion(body.question);
  const question = stripWebPrefix(rawQuestion);
  if (!question) return Response.json({ error: "Ask a question after /ask." }, { status: 400 });
  const channelId = body.channelId?.slice(0, 64);
  if (!channelId) return Response.json({ error: "Pick a channel first." }, { status: 400 });

  // ---- The same access rules as posting a message ----
  const channel = await db
    .prepare(
      `SELECT name, kind, server_id FROM channels WHERE id = ? AND kind IN (${textChannelKindsSql()})`,
    )
    .bind(channelId)
    .first<{ name: string; kind: string; server_id: string }>();
  if (!channel) return Response.json({ error: "That channel is gone." }, { status: 404 });
  let audience: string[] | null = null;
  if (channel.kind === "dm") {
    if (!(await isDmMember(db, channelId, user.id))) return unauthorized();
    audience = await channelAudience(db, channelId);
  } else {
    const banned = await db
      .prepare("SELECT user_id FROM bans WHERE server_id = ? AND user_id = ?")
      .bind(channel.server_id, user.id)
      .first();
    if (banned) return Response.json({ error: "You are banned from this server." }, { status: 403 });
    const timedOut = await blockIfTimedOut(db, channelId, user.id);
    if (timedOut) return timedOut;
    if (
      channelKindInfo(channel.kind).moderatorOnlyPosting &&
      !body.threadId &&
      !(await can(db, user.id, channel.server_id, Permission.MANAGE_MESSAGES))
    ) {
      return Response.json({ error: "Only moderators can post announcements here." }, { status: 403 });
    }
    // The question is posted into the channel too, so the server's rules apply.
    const refused = await enforceAutomod(db, {
      serverId: channel.server_id,
      channelId,
      userId: user.id,
      text: rawQuestion,
      checkRepeat: false,
      mayModerate: () => can(db, user.id, channel.server_id, Permission.MODERATE),
    });
    if (refused) return refused;
  }

  let root: { id: string; content: string; payload: string | null } | null = null;
  const threadId = body.threadId?.slice(0, 64) || null;
  if (threadId) {
    root = await db
      .prepare(
        "SELECT id, content, payload FROM messages WHERE id = ? AND channel_id = ? AND kind = ? AND deleted_at IS NULL",
      )
      .bind(threadId, channelId, AI_KIND)
      .first<{ id: string; content: string; payload: string | null }>();
    if (!root) return Response.json({ error: "That AI answer is gone." }, { status: 404 });
  }

  // ---- Rate limits: rolling windows per user, plus a daily server budget ----
  const dailyCap = Number(env.AI_DAILY_LIMIT) > 0 ? Number(env.AI_DAILY_LIMIT) : AI_LIMITS.perDayDefault;
  const quota = await checkAiQuota(db, user.id, {
    perMinute: AI_LIMITS.perMinute,
    perHour: AI_LIMITS.perHour,
    perDay: dailyCap,
  });
  if (!quota.allowed) return tooMany(quota.message!, quota.retryAfter!);

  // ---- Context: the AI thread so far (never the whole channel) ----
  let history: AiTurn[] = [];
  let rootQuestion = "";
  let rootUsedWeb = false;
  if (root) {
    try {
      const rootPayload = JSON.parse(root.payload || "{}") as AiPayload;
      rootQuestion = rootPayload.question || "";
      rootUsedWeb = Boolean(rootPayload.sources?.length);
    } catch {
      // Payload is optional context; the answer alone still helps.
    }
    const rows = await db
      .prepare(
        `SELECT is_bot, kind, content FROM messages
          WHERE thread_id = ? AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 8`,
      )
      .bind(root.id)
      .all<{ is_bot: number; kind: string | null; content: string }>();
    history = trimHistory([
      { role: "user", text: rootQuestion },
      { role: "model", text: root.content },
      ...(rows.results || []).reverse().map(
        (row): AiTurn => ({ role: row.kind === AI_KIND ? "model" : "user", text: row.content }),
      ),
    ]);
  }

  const now = new Date().toISOString();

  // A follow-up is a normal message in the answer's thread, so everyone sees it.
  let userMessage = null;
  if (root) {
    const stored: StoredMessage = {
      id: crypto.randomUUID(),
      channel: channel.name,
      channel_id: channelId,
      user_id: user.id,
      author: user.display_name,
      avatar: user.avatar,
      color: user.color,
      content: rawQuestion,
      attachment_key: null,
      is_bot: 0,
      created_at: now,
      thread_id: root.id,
    };
    await insertMessage(db, stored);
    userMessage = publicMessage(stored);
    await publishMessage(channelId, userMessage, audience);
  }

  // A follow-up to a web-backed answer ("and who came second?") needs fresh
  // results too, searched together with the question it continues.
  const noWeb = /^\s*(no-?web|offline)\s*:/i.test(rawQuestion);
  const results =
    wantsWeb(rawQuestion) || (rootUsedWeb && !noWeb)
      ? await webSearch(rootUsedWeb ? `${rootQuestion} ${question}` : question)
      : [];

  let answer: { text: string; model: string };
  try {
    answer = await askGemini({
      apiKey,
      models: modelList(env.GEMINI_MODEL),
      history,
      question: buildUserTurn(question, results),
    });
  } catch (error) {
    // A question that got no answer doesn't count against anyone.
    await quota.refund?.().catch(() => undefined);
    const status = error instanceof AiError ? error.status : 502;
    const message = error instanceof Error ? error.message : "The AI did not answer.";
    return Response.json({ error: message, userMessage }, { status });
  }

  const payload: AiPayload = {
    question,
    model: answer.model,
    ...(results.length
      ? { sources: results.map((result) => ({ title: result.title, url: result.url })) }
      : {}),
  };
  const stored: StoredMessage = {
    id: crypto.randomUUID(),
    channel: channel.name,
    channel_id: channelId,
    user_id: null,
    author: AI_AUTHOR,
    avatar: AI_AVATAR,
    color: AI_COLOR,
    content: answer.text.slice(0, 6000),
    attachment_key: null,
    is_bot: 1,
    created_at: new Date().toISOString(),
    kind: AI_KIND,
    payload: JSON.stringify(payload),
    thread_id: root?.id ?? null,
    command_text: root ? null : `/ask ${rawQuestion}`.slice(0, 200),
    command_by: root ? null : user.display_name.slice(0, 80),
  };
  await insertMessage(db, stored);
  const message = publicMessage(stored);
  await publishMessage(channelId, message, audience);

  return Response.json(
    { message, userMessage, remaining: quota.remaining },
    { status: 201 },
  );
}
