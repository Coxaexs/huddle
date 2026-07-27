import { currentUser, unauthorized } from "@/lib/auth";
import { publishMessageEvent } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Cast (or change) a vote. Single-choice polls replace the previous pick. */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ ok: false });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);

  const body = (await request.json().catch(() => ({}))) as {
    pollId?: string;
    choice?: number;
  };
  const pollId = body.pollId?.slice(0, 64) || "";
  const choice = Number(body.choice);

  const poll = await db
    .prepare("SELECT id, channel_id, options, multi FROM polls WHERE id = ?")
    .bind(pollId)
    .first<{
      id: string;
      channel_id: string;
      options: string;
      multi: number;
    }>();
  if (!poll) return Response.json({ error: "No such poll." }, { status: 404 });

  const options = JSON.parse(poll.options) as string[];
  if (!Number.isInteger(choice) || choice < 0 || choice >= options.length) {
    return Response.json({ error: "No such option." }, { status: 400 });
  }

  const existing = await db
    .prepare(
      "SELECT choice FROM poll_votes WHERE poll_id = ? AND user_id = ? AND choice = ?",
    )
    .bind(pollId, user.id, choice)
    .first();

  if (existing) {
    // Clicking your own choice again takes the vote back.
    await db
      .prepare(
        "DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ? AND choice = ?",
      )
      .bind(pollId, user.id, choice)
      .run();
  } else {
    if (!poll.multi) {
      await db
        .prepare("DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?")
        .bind(pollId, user.id)
        .run();
    }
    await db
      .prepare(
        "INSERT OR IGNORE INTO poll_votes (poll_id, user_id, choice) VALUES (?, ?, ?)",
      )
      .bind(pollId, user.id, choice)
      .run();
  }

  const rows = await db
    .prepare("SELECT user_id, choice FROM poll_votes WHERE poll_id = ?")
    .bind(pollId)
    .all();
  const counts = new Array(options.length).fill(0) as number[];
  const mine: number[] = [];
  const voters = new Set<string>();
  for (const row of (rows.results || []) as Array<{
    user_id: string;
    choice: number;
  }>) {
    if (row.choice >= 0 && row.choice < options.length) counts[row.choice] += 1;
    voters.add(row.user_id);
    if (row.user_id === user.id) mine.push(row.choice);
  }

  await publishMessageEvent(poll.channel_id, {
    t: "poll",
    pollId,
    counts,
    voters: voters.size,
  });
  return Response.json({ ok: true, counts, mine });
}
