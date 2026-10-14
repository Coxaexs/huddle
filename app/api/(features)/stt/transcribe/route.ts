import { messageAccess } from "@/lib/access";
import { currentUser, unauthorized } from "@/lib/auth";
import { limitUser } from "@/lib/rate-limit";
import { MAX_TRANSCRIBE_BYTES, transcribeWithDuyu } from "@/lib/speech";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const UPLOAD_PATH = /^\/hangout\/api\/uploads\/([^/?#]+)$/;
/** Duyu costs money per minute; a person can still caption a whole backlog. */
const TRANSCRIBE_LIMIT = { action: "transcribe", limit: 12, windowSeconds: 60 };

/**
 * The CC button on a voice message: `{ messageId }`. Anyone who can read the
 * message may ask; the audio is read from our own upload store (never a URL
 * from the request), sent to Duyu with the server's SPEECH_API_KEY, and the
 * text is kept on the message so it is only ever transcribed once.
 */
export async function POST(request: Request) {
  const env = bindings();
  const db = env.DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const key = env.SPEECH_API_KEY?.trim();
  if (!key) return Response.json({ error: "Transcription is not set up on this server." }, { status: 501 });

  const body = (await request.json().catch(() => ({}))) as { messageId?: unknown };
  const messageId = typeof body.messageId === "string" ? body.messageId.slice(0, 64) : "";
  if (!messageId) return Response.json({ error: "Which message?" }, { status: 400 });
  const access = await messageAccess(db, messageId, user);
  if (!access.ok) return access.response;

  const row = await db
    .prepare("SELECT audio_url, payload FROM messages WHERE id = ?")
    .bind(messageId)
    .first<{ audio_url: string | null; payload: string | null }>();
  const uploadKey = row?.audio_url?.match(UPLOAD_PATH)?.[1];
  if (!row || !uploadKey) return Response.json({ error: "That message has no voice clip." }, { status: 400 });

  let payload: Record<string, unknown> = {};
  try {
    const parsed = row.payload ? JSON.parse(row.payload) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
  } catch {
    // An unreadable payload is replaced by one with just the transcript.
  }
  const voice = (payload.voice && typeof payload.voice === "object" ? payload.voice : {}) as Record<string, unknown>;
  if (typeof voice.transcript === "string") return Response.json({ text: voice.transcript, cached: true });

  const limited = await limitUser(db, TRANSCRIBE_LIMIT, user.id);
  if (limited) return limited;

  const object = await env.UPLOADS?.get(decodeURIComponent(uploadKey));
  if (!object) return Response.json({ error: "The voice clip is gone." }, { status: 404 });
  if (object.size > MAX_TRANSCRIBE_BYTES) {
    return Response.json({ error: "That clip is too long to transcribe." }, { status: 413 });
  }

  let text: string;
  try {
    ({ text } = await transcribeWithDuyu(key, await object.arrayBuffer(), {
      contentType: object.httpMetadata?.contentType,
    }));
  } catch {
    return Response.json({ error: "The transcription service did not answer. Try again in a bit." }, { status: 502 });
  }

  // Kept even when empty, so a silent clip is not sent to Duyu again.
  payload.voice = { ...voice, transcript: text.slice(0, 8000) };
  await db.prepare("UPDATE messages SET payload = ? WHERE id = ?").bind(JSON.stringify(payload), messageId).run();
  return Response.json({ text });
}
