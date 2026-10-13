import { currentUser, unauthorized } from "@/lib/auth";
import { channelAccess } from "@/lib/access";
import { publishMessageEvent } from "@/lib/hub-client";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";
import { blockIfTimedOut } from "@/lib/timeouts";

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
    .prepare("SELECT id, channel_id, options, multi, is_private FROM polls WHERE id = ?")
    .bind(pollId)
    .first<{
      id: string;
      channel_id: string;
      options: string;
      multi: number;
      is_private?: number;
    }>();
  if (!poll) return Response.json({ error: "No such poll." }, { status: 404 });
  const access = await channelAccess(db, poll.channel_id, user);
  if (!access.ok) return access.response;
  const timedOut = await blockIfTimedOut(db, poll.channel_id, user.id);
  if (timedOut) return timedOut;

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
    .prepare(
      `SELECT v.user_id, v.choice, u.display_name, u.username
         FROM poll_votes v LEFT JOIN users u ON u.id = v.user_id
        WHERE v.poll_id = ?`,
    )
    .bind(pollId)
    .all();
  const counts = new Array(options.length).fill(0) as number[];
  const mine: number[] = [];
  const voters = new Set<string>();
  const isPrivate = Boolean(poll.is_private);
  // Who voted for what travels with the event (public polls only), so every
  // open card updates from it instead of each re-fetching the poll.
  const byChoice: Array<Array<{ id: string; name: string }>> = options.map(() => []);
  for (const row of (rows.results || []) as Array<{
    user_id: string;
    choice: number;
    display_name?: string;
    username?: string;
  }>) {
    if (row.choice >= 0 && row.choice < options.length) {
      counts[row.choice] += 1;
      if (!isPrivate) {
        byChoice[row.choice].push({
          id: row.user_id,
          name: row.display_name || row.username || "Anonymous",
        });
      }
    }
    voters.add(row.user_id);
    if (row.user_id === user.id) mine.push(row.choice);
  }

  await publishMessageEvent(poll.channel_id, {
    t: "poll",
    pollId,
    counts,
    voters: voters.size,
    ...(isPrivate ? {} : { voterLists: byChoice }),
  });
  return Response.json({ ok: true, counts, mine, voters: isPrivate ? undefined : byChoice });
}
