import { signedInResponse, userColumns, type User } from "@/lib/auth";
import {
  checkSecondFactor,
  dropLoginTicket,
  relyingParty,
  saveChallenge,
  takeChallenge,
  useLoginTicket,
} from "@/lib/account-security";
import { passkeyRequestOptions, verifyPasskeyAssertion } from "@/lib/passkey-auth";
import { checkRateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";
import { ensureSchema } from "@/lib/schema";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The second step of signing in, after /api/auth/login (or a reset link)
 * answered with `twoFactor.ticket`:
 *   POST {ticket, code}                              authenticator or recovery code
 *   POST {ticket, action:"passkey-options"}          a challenge for one of your passkeys
 *   POST {ticket, action:"passkey", challengeId, response}
 * Each request counts against the ticket's five tries.
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  await ensureSchema(db);
  const body = (await request.json().catch(() => ({}))) as {
    ticket?: unknown;
    code?: unknown;
    action?: string;
    challengeId?: unknown;
    response?: unknown;
  };
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  const userId = ticket ? await useLoginTicket(db, ticket) : null;
  if (!userId) {
    return Response.json(
      { error: "That sign-in has expired. Enter your password again.", expired: true },
      { status: 401 },
    );
  }
  // On top of the ticket's five tries: per account and per address, so new
  // tickets (each needing the password) cannot grind through codes either.
  const limits = await Promise.all([
    checkRateLimit({ db, action: "2fa-user", key: userId, limit: 20, windowSeconds: 900 }),
    checkRateLimit({ db, action: "2fa-ip", key: clientIp(request), limit: 40, windowSeconds: 900 }),
  ]);
  if (limits.some((result) => !result.allowed)) {
    return new RateLimitError(Math.max(...limits.map((result) => result.retryAfter))).response();
  }

  const finish = async () => {
    await dropLoginTicket(db, ticket);
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
  };

  if (body.action === "passkey-options" || body.action === "passkey") {
    const rp = relyingParty(request);
    if (!rp) return Response.json({ error: "Open Hoffle from its own address to use a passkey." }, { status: 400 });
    if (body.action === "passkey-options") {
      const options = await passkeyRequestOptions(db, rp.rpID, userId);
      if (!options.allowCredentials?.length) {
        return Response.json({ error: "You have no passkey for this address. Use a code instead." }, { status: 400 });
      }
      return Response.json({ options, challengeId: await saveChallenge(db, "second-factor", userId, options.challenge) });
    }
    const saved =
      typeof body.challengeId === "string" ? await takeChallenge(db, body.challengeId, "second-factor") : null;
    if (!saved || saved.userId !== userId) {
      return Response.json({ error: "That took too long. Try again." }, { status: 400 });
    }
    if (!(await verifyPasskeyAssertion(db, rp, body.response, saved.challenge, userId))) {
      return Response.json({ error: "That passkey could not be checked." }, { status: 401 });
    }
    return finish();
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!(await checkSecondFactor(db, userId, code))) {
    return Response.json({ error: "That code is not right." }, { status: 401 });
  }
  return finish();
}
