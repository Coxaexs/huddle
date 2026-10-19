import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { currentUser, unauthorized } from "@/lib/auth";
import {
  WRONG_PASSWORD,
  ensureSecurityTables,
  finishPasskeySetupHandoff,
  parseTransports,
  passkeySetupHandoff,
  passkeysFor,
  passwordMatches,
  pollPasskeySetupHandoff,
  relyingParty,
  saveChallenge,
  startPasskeySetupHandoff,
  takeChallenge,
  toBase64Url,
} from "@/lib/account-security";
import { checkRateLimit, clientIp, RateLimitError } from "@/lib/rate-limit";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_PASSKEYS = 10;

/**
 * Passkeys on your account:
 *   POST {action:"options", password}                     start adding one
 *   POST {action:"register", challengeId, response, name} finish adding it
 *   DELETE {id, password}                                  remove one
 * The list comes with GET /api/settings/two-factor.
 *
 * The desktop apps cannot make passkeys in their web view, so they hand it to
 * the system browser (app/passkey-signin), which is not signed in:
 *   POST {action:"handoff-start", password, name}  app: {handoffId, secret, code}
 *   POST {action:"setup-info", handoffId}           browser: code + options
 *   POST {action:"setup-finish", handoffId, response} browser: adds the key
 *   POST {action:"handoff-poll", handoffId, secret} app: {done} once added
 */
export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  await ensureSecurityTables(db);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    password?: unknown;
    challengeId?: unknown;
    response?: unknown;
    name?: unknown;
    handoffId?: unknown;
    secret?: unknown;
  };

  // The browser half: the hand-off id stands in for the sign-in it lacks.
  if (body.action === "setup-info" || body.action === "setup-finish") {
    const limited = await checkRateLimit({ db, action: "passkey-setup", key: clientIp(request), limit: 30, windowSeconds: 300 });
    if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();
    const rp = relyingParty(request);
    if (!rp) return Response.json({ error: "Open Hoffle from its own address to add a passkey." }, { status: 400 });
    const setup = typeof body.handoffId === "string" ? await passkeySetupHandoff(db, body.handoffId) : null;
    if (!setup) return Response.json({ error: "This link has expired. Start again from the app." }, { status: 410 });
    if (body.action === "setup-info") {
      return Response.json({ code: setup.code, options: JSON.parse(setup.options) });
    }
    const saved = await takeChallenge(db, setup.challengeId, "register");
    if (!saved || saved.userId !== setup.userId) {
      return Response.json({ error: "That took too long. Try adding the passkey again." }, { status: 400 });
    }
    const added = await registerPasskey(db, rp, setup.userId, saved.challenge, body.response, setup.name);
    if (added.ok) await finishPasskeySetupHandoff(db, body.handoffId as string);
    return added;
  }

  const user = await currentUser(request);
  if (!user) return unauthorized();

  // The app waits on the browser every couple of seconds, outside the limit.
  if (body.action === "handoff-poll") {
    if (typeof body.handoffId !== "string" || typeof body.secret !== "string") {
      return Response.json({ error: "Unknown passkey setup." }, { status: 400 });
    }
    const result = await pollPasskeySetupHandoff(db, body.handoffId, body.secret, user.id);
    if (!result) return Response.json({ error: "That took too long. Try adding the passkey again." }, { status: 410 });
    return Response.json(result === "done" ? { done: true } : { pending: true });
  }

  const limited = await checkRateLimit({ db, action: "security-settings", key: user.id, limit: 20, windowSeconds: 900 });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const rp = relyingParty(request);
  if (!rp) return Response.json({ error: "Open Hoffle from its own address to add a passkey." }, { status: 400 });

  if (body.action === "options" || body.action === "handoff-start") {
    if (!(await passwordMatches(db, user.id, body.password))) {
      return Response.json(WRONG_PASSWORD, { status: 403 });
    }
    const existing = await passkeysFor(db, user.id);
    if (existing.length >= MAX_PASSKEYS) {
      return Response.json({ error: `You can have up to ${MAX_PASSKEYS} passkeys. Remove one first.` }, { status: 400 });
    }
    const options = await generateRegistrationOptions({
      rpName: "Hoffle",
      rpID: rp.rpID,
      userName: user.username,
      userDisplayName: user.display_name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing
        .filter((key) => key.rp_id === rp.rpID)
        .map((key) => ({ id: key.id, transports: parseTransports(key.transports) })),
      // Discoverable, so it can sign in without typing a username.
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    const challengeId = await saveChallenge(db, "register", user.id, options.challenge);
    if (body.action === "handoff-start") {
      const name = (typeof body.name === "string" ? body.name.trim().slice(0, 60) : "") || "Passkey";
      const { id, secret, code } = await startPasskeySetupHandoff(db, {
        userId: user.id,
        options: JSON.stringify(options),
        challengeId,
        name,
      });
      return Response.json({ handoffId: id, secret, code });
    }
    return Response.json({ options, challengeId });
  }

  if (body.action === "register") {
    const saved = typeof body.challengeId === "string" ? await takeChallenge(db, body.challengeId, "register") : null;
    if (!saved || saved.userId !== user.id) {
      return Response.json({ error: "That took too long. Try adding the passkey again." }, { status: 400 });
    }
    return registerPasskey(db, rp, user.id, saved.challenge, body.response, body.name);
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}

/** Checks a new passkey against its challenge and stores it on the account. */
async function registerPasskey(
  db: D1Database,
  rp: { rpID: string; origin: string },
  userId: string,
  challenge: string,
  response: unknown,
  rawName: unknown,
): Promise<Response> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: false,
    });
  } catch {
    verification = null;
  }
  if (!verification?.verified) {
    return Response.json({ error: "That passkey could not be checked." }, { status: 400 });
  }
  const { credential } = verification.registrationInfo;
  const name =
    (typeof rawName === "string" ? rawName.trim().slice(0, 60) : "") || "Passkey";
  const now = new Date().toISOString();
  const stored = await db
    .prepare(
      `INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, rp_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      credential.id,
      userId,
      toBase64Url(credential.publicKey),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      name,
      rp.rpID,
      now,
    )
    .run();
  if (!(stored.meta.changes ?? 0)) {
    return Response.json({ error: "That passkey is already on an account." }, { status: 409 });
  }
  return Response.json({ id: credential.id, name, createdAt: now }, { status: 201 });
}

export async function DELETE(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  await ensureSecurityTables(db);
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; password?: unknown };
  if (!(await passwordMatches(db, user.id, body.password))) {
    return Response.json(WRONG_PASSWORD, { status: 403 });
  }
  const removed = await db
    .prepare("DELETE FROM passkeys WHERE id = ? AND user_id = ?")
    .bind(typeof body.id === "string" ? body.id : "", user.id)
    .run();
  if (!(removed.meta.changes ?? 0)) {
    return Response.json({ error: "That passkey is already gone." }, { status: 404 });
  }
  return Response.json({ removed: true });
}
