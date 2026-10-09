/**
 * Live Q&A for stage (and voice) rooms: the audience asks and upvotes,
 * hosts pin the question being answered, mark it done or hide it.
 */

export interface QaQuestion {
  id: string;
  channelId: string;
  userId: string;
  author: string;
  text: string;
  votes: number;
  createdAt: string;
  answered: boolean;
  pinned: boolean;
}

export const QA_TEXT_LIMIT = 300;

export async function ensureQaTables(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS qa_questions (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        answered_at TEXT,
        pinned_at TEXT,
        hidden_at TEXT
      )`),
    db.prepare("CREATE INDEX IF NOT EXISTS qa_questions_channel_idx ON qa_questions(channel_id, created_at)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS qa_votes (
        question_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (question_id, user_id)
      )`),
  ]);
}

interface QaRow {
  id: string;
  channel_id: string;
  user_id: string;
  author: string;
  text: string;
  created_at: string;
  answered_at: string | null;
  pinned_at: string | null;
  votes: number;
}

const SELECT_QUESTION = `SELECT q.id, q.channel_id, q.user_id, q.author, q.text, q.created_at,
        q.answered_at, q.pinned_at,
        (SELECT COUNT(*) FROM qa_votes v WHERE v.question_id = q.id) AS votes
   FROM qa_questions q`;

function toQuestion(row: QaRow): QaQuestion {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    author: row.author,
    text: row.text,
    votes: Number(row.votes) || 0,
    createdAt: row.created_at,
    answered: Boolean(row.answered_at),
    pinned: Boolean(row.pinned_at),
  };
}

/** The room's visible questions from the last day: newest 200. */
export async function listQuestions(db: D1Database, channelId: string): Promise<QaQuestion[]> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const rows = await db
    .prepare(
      `${SELECT_QUESTION} WHERE q.channel_id = ? AND q.hidden_at IS NULL AND q.created_at > ?
       ORDER BY q.created_at DESC LIMIT 200`,
    )
    .bind(channelId, since)
    .all<QaRow>();
  return (rows.results || []).map(toQuestion);
}

export async function getQuestion(db: D1Database, id: string): Promise<QaQuestion | null> {
  const row = await db.prepare(`${SELECT_QUESTION} WHERE q.id = ? AND q.hidden_at IS NULL`).bind(id).first<QaRow>();
  return row ? toQuestion(row) : null;
}

/** Open questions first, most votes first, then oldest first. */
export function sortQuestions(questions: QaQuestion[]): QaQuestion[] {
  return [...questions].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(a.answered) - Number(b.answered) ||
      b.votes - a.votes ||
      a.createdAt.localeCompare(b.createdAt),
  );
}
