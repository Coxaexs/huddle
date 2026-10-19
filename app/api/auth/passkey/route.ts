import { signedInResponse, userColumns, type User } from "@/lib/auth";
import {
  approvePasskeyHandoff,
  passkeyHandoffCode,
  pollPasskeyHandoff,
  relyingParty,
  saveChallenge,
  startPasskeyHandoff,
  takeChallenge,
} from "@/lib/account-security";
import { passkeyRequestOptions, verifyPasskeyAssertion } from "@/lib/passkey-auth";
import { checkRateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Signing in with a passkey alone, no username or password:
 *   POST {action:"options"}                      a challenge for the browser
 *   POST {action:"verify", challengeId, response} the signed answer → session
 *
 * The desktop apps cannot use passkeys in their own web view, so they hand
 * the ceremony to the system browser (app/passkey-signin):
 *   POST {action:"handoff-start"}                 app: {handoffId, secret, code}
 *   POST {action:"handoff-info", handoffId}       browser: the code to match
 *   POST {action:"verify", …, handoffId}          browser: approves the app, no session here
 *   POST {action:"handoff-poll", handoffId, secret} app: session once approved
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    challengeId?: unknown;
    response?: unknown;
    handoffId?: unknown;
    secret?: unknown;
  };

  // The app asks every couple of seconds while the browser works; its secret
  // cannot be guessed, so the polling stays outside the rate limit.
  if (body.action === "handoff-poll") {
    if (typeof body.handoffId !== "string" || typeof body.secret !== "string") {
      return Response.json({ error: "Unknown sign-in." }, { status: 400 });
    }
    const result = await pollPasskeyHandoff(db, body.handoffId, body.secret);
    if (result === "pending") return Response.json({ pending: true });
    if (!result) return Response.json({ error: "That took too long. Try again." }, { status: 410 });
    return signInAs(db, request, result);
  }

  const limited = await checkRateLimit({ db, action: "passkey-login", key: clientIp(request), limit: 30, windowSeconds: 300 });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const rp = relyingParty(request);
  if (!rp) return Response.json({ error: "Open Hoffle from its own address to use a passkey." }, { status: 400 });

  if (body.action === "handoff-start") {
    const { id, secret, code } = await startPasskeyHandoff(db);
    return Response.json({ handoffId: id, secret, code });
  }

  if (body.action === "handoff-info") {
    const code = typeof body.handoffId === "string" ? await passkeyHandoffCode(db, body.handoffId) : null;
    if (!code) return Response.json({ error: "This sign-in link has expired. Start again from the app." }, { status: 410 });
    return Response.json({ code });
  }

  if (body.action === "options") {
    const options = await passkeyRequestOptions(db, rp.rpID, null);
    return Response.json({ options, challengeId: await saveChallenge(db, "login", null, options.challenge) });
  }

  if (body.action === "verify") {
    const saved = typeof body.challengeId === "string" ? await takeChallenge(db, body.challengeId, "login") : null;
    if (!saved) return Response.json({ error: "That took too long. Try again." }, { status: 400 });
    const userId = await verifyPasskeyAssertion(db, rp, body.response, saved.challenge, null);
    if (!userId) {
      return Response.json({ error: "That passkey is not on any account here." }, { status: 401 });
    }
    if (typeof body.handoffId === "string") {
      if (!(await approvePasskeyHandoff(db, body.handoffId, userId))) {
        return Response.json({ error: "This sign-in link has expired. Start again from the app." }, { status: 410 });
      }
      return Response.json({ handedOff: true });
    }
    return signInAs(db, request, userId);
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}

async function signInAs(db: D1Database, request: Request, userId: string): Promise<Response> {
  const user = await db
    .prepare(`SELECT ${userColumns()} FROM users WHERE id = ?`)
    .bind(userId)
    .first<User>();
  if (!user) return Response.json({ error: "That account no longer exists." }, { status: 404 });
  if (user.suspended_at) {
    return Response.json(
      { error: "This account has been suspended. Ask an admin if you think that's a mistake." },
      { status: 403 },
    );
  }
  return signedInResponse(db, request, user);
}
