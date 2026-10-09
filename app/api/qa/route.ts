import { channelAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { publishMessageEvent } from "@/lib/hub-client";
import { can, Permission } from "@/lib/permissions";
import {
  QA_TEXT_LIMIT,
  ensureQaTables,
  getQuestion,
  listQuestions,
} from "@/lib/qa";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { blockIfTimedOut } from "@/lib/timeouts";

export const dynamic = "force-dynamic";

const ASK_LIMIT = { action: "qa-ask", limit: 3, windowSeconds: 60 };
const VOTE_LIMIT = { action: "qa-vote", limit: 40, windowSeconds: 60 };

/** A room's questions, plus which ones you voted for. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ questions: [], voted: [] });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureQaTables(db);
  const channelId = new URL(request.url).searchParams.get("channelId") || "";
  const access = await channelAccess(db, channelId, user);
  if (!access.ok) return access.response;
  const questions = await listQuestions(db, channelId);
  const voted = await db
    .prepare(
      `SELECT v.question_id AS id FROM qa_votes v JOIN qa_questions q ON q.id = v.question_id
        WHERE v.user_id = ? AND q.channel_id = ?`,
    )
    .bind(user.id, channelId)
    .all<{ id: string }>();
  const canHost = access.channel.isDm
    ? false
    : await can(db, user.id, access.channel.serverId, Permission.MUTE_MEMBERS).catch(() => false);
  return Response.json({
    questions,
    voted: (voted.results || []).map((row) => row.id),
    canHost: Boolean(canHost || user.is_admin),
  });
}

/**
 * { action: "ask", channelId, text }
 * { action: "vote", id }               toggles your vote
 * { action: "pin" | "answer" | "hide", id }   hosts (Mute Members), or the
 *                                      asker hiding their own question
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  await ensureQaTables(db);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    channelId?: string;
    id?: string;
    text?: string;
  };

  if (body.action === "ask") {
    const limited = await limitUser(db, ASK_LIMIT, user.id);
    if (limited) return limited;
    const access = await channelAccess(db, String(body.channelId || ""), user);
    if (!access.ok) return access.response;
    const timedOut = await blockIfTimedOut(db, access.channel.id, user.id);
    if (timedOut) return timedOut;
    const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, QA_TEXT_LIMIT);
    if (!text) return Response.json({ error: "Write a question first." }, { status: 400 });
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO qa_questions (id, channel_id, user_id, author, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, access.channel.id, user.id, user.display_name, text, new Date().toISOString())
      .run();
    // Asking counts as wanting it answered.
    await db.prepare("INSERT OR IGNORE INTO qa_votes (question_id, user_id) VALUES (?, ?)").bind(id, user.id).run();
    return publish(db, id);
  }

  const question = await getQuestion(db, String(body.id || ""));
  if (!question) return Response.json({ error: "That question is gone." }, { status: 404 });
  const access = await channelAccess(db, question.channelId, user);
  if (!access.ok) return access.response;

  if (body.action === "vote") {
    const limited = await limitUser(db, VOTE_LIMIT, user.id);
    if (limited) return limited;
    const removed = await db
      .prepare("DELETE FROM qa_votes WHERE question_id = ? AND user_id = ?")
      .bind(question.id, user.id)
      .run();
    if (!removed.meta.changes) {
      await db
        .prepare("INSERT OR IGNORE INTO qa_votes (question_id, user_id) VALUES (?, ?)")
        .bind(question.id, user.id)
        .run();
    }
    return publish(db, question.id, { voted: !removed.meta.changes });
  }

  const host =
    Boolean(user.is_admin) ||
    (!access.channel.isDm &&
      (await can(db, user.id, access.channel.serverId, Permission.MUTE_MEMBERS).catch(() => false)));
  const now = new Date().toISOString();
  if (body.action === "hide" && (host || question.userId === user.id)) {
    await db.prepare("UPDATE qa_questions SET hidden_at = ? WHERE id = ?").bind(now, question.id).run();
    await publishMessageEvent(question.channelId, { t: "qa", question: null, removedId: question.id });
    return Response.json({ ok: true });
  }
  if (!host) return Response.json({ error: "Only hosts can do that." }, { status: 403 });
  if (body.action === "pin") {
    // One question on screen at a time; pinning the pinned one unpins it.
    const unpinning = question.pinned;
    const previous = await db
      .prepare("SELECT id FROM qa_questions WHERE channel_id = ? AND pinned_at IS NOT NULL AND id != ?")
      .bind(question.channelId, question.id)
      .all<{ id: string }>();
    await db.batch([
      db.prepare("UPDATE qa_questions SET pinned_at = NULL WHERE channel_id = ?").bind(question.channelId),
      ...(unpinning
        ? []
        : [db.prepare("UPDATE qa_questions SET pinned_at = ?, answered_at = NULL WHERE id = ?").bind(now, question.id)]),
    ]);
    for (const row of previous.results || []) await publish(db, row.id);
    return publish(db, question.id);
  }
  if (body.action === "answer") {
    await db
      .prepare("UPDATE qa_questions SET answered_at = CASE WHEN answered_at IS NULL THEN ? ELSE NULL END, pinned_at = NULL WHERE id = ?")
      .bind(now, question.id)
      .run();
    return publish(db, question.id);
  }
  return Response.json({ error: "Unknown action." }, { status: 400 });
}

/** Tells the room about one question's new state, and answers with it. */
async function publish(db: D1Database, id: string, extra: Record<string, unknown> = {}): Promise<Response> {
  const question = await getQuestion(db, id);
  if (!question) return Response.json({ ok: true });
  await publishMessageEvent(question.channelId, { t: "qa", question });
  return Response.json({ question, ...extra });
}
