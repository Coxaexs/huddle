import { currentUser, unauthorized } from "@/lib/auth";
import { DIGEST_MODES, digestFor, digestMode, nextDigestAlarm, sendDigest, setDigestMode, type DigestMode } from "@/lib/digest";
import { publishMessage } from "@/lib/hub-client";
import { limitUser } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const PREVIEW_LIMIT = { action: "digest-preview", limit: 3, windowSeconds: 3600 };

/** Your weekly digest setting, whether you have an email for it, and when the next one goes out. */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  return Response.json({
    mode: await digestMode(db, user.id),
    hasEmail: Boolean(user.email),
    nextAt: new Date(await nextDigestAlarm(db)).toISOString(),
  });
}

/**
 * { mode } saves the setting. { preview: true } sends you this week's digest
 * now, the same way the weekly one arrives.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as { mode?: unknown; preview?: unknown };

  if (body.preview === true) {
    const limited = await limitUser(db, PREVIEW_LIMIT, user.id);
    if (limited) return limited;
    const now = Date.now();
    const digest = await digestFor(db, user.id, now);
    if (!digest) return Response.json({ sent: false, reason: "Nothing happened on your servers this week." });
    const mode = await digestMode(db, user.id);
    const note = await sendDigest(db, user, mode === "off" ? "notes" : mode, digest, now);
    await publishMessage(note.channelId, note.message, [user.id]);
    return Response.json({ sent: true });
  }

  if (!DIGEST_MODES.includes(body.mode as DigestMode)) {
    return Response.json({ error: "Pick off, notes or email." }, { status: 400 });
  }
  if (body.mode === "email" && !user.email) {
    return Response.json({ error: "Add an email address to your account first." }, { status: 400 });
  }
  await setDigestMode(db, user.id, body.mode as DigestMode);
  return Response.json({ mode: body.mode });
}
