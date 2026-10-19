import { currentUser, unauthorized } from "@/lib/auth";
import {
  WRONG_PASSWORD,
  beginTotpSetup,
  checkSecondFactor,
  confirmTotpSetup,
  disableTwoFactor,
  passkeysFor,
  passwordMatches,
  recoveryCodesLeft,
  replaceRecoveryCodes,
  totpRow,
} from "@/lib/account-security";
import { checkRateLimit, RateLimitError } from "@/lib/rate-limit";
import { bindings } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Wrong codes and passwords here: twenty per quarter hour per account. */
const SECURITY_RATE_LIMIT = { limit: 20, windowSeconds: 900 } as const;

/**
 * Two-factor sign-in with an authenticator app:
 *   GET                                    is it on, recovery codes left, passkeys
 *   POST {action:"setup", password}        a new secret and its otpauth link
 *   POST {action:"enable", code}           confirm with a first code → recovery codes
 *   POST {action:"recovery", password}     ten new recovery codes (old ones stop working)
 *   POST {action:"disable", password, code} turn it off
 */
export async function GET(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const row = await totpRow(db, user.id);
  const passkeys = await passkeysFor(db, user.id);
  return Response.json({
    enabled: Boolean(row?.enabled_at),
    enabledAt: row?.enabled_at ?? null,
    recoveryCodesLeft: row?.enabled_at ? await recoveryCodesLeft(db, user.id) : 0,
    passkeys: passkeys.map((key) => ({
      id: key.id,
      name: key.name,
      createdAt: key.created_at,
      lastUsedAt: key.last_used_at,
    })),
  });
}

export async function POST(request: Request) {
  const db = bindings().DB;
  if (!db) return Response.json({ error: "Message storage is not connected." }, { status: 503 });
  const user = await currentUser(request);
  if (!user) return unauthorized();
  const limited = await checkRateLimit({ db, action: "security-settings", key: user.id, ...SECURITY_RATE_LIMIT });
  if (!limited.allowed) return new RateLimitError(limited.retryAfter).response();

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    password?: unknown;
    code?: unknown;
  };
  const code = typeof body.code === "string" ? body.code : "";

  if (body.action === "setup") {
    if (!(await passwordMatches(db, user.id, body.password))) {
      return Response.json(WRONG_PASSWORD, { status: 403 });
    }
    try {
      return Response.json(await beginTotpSetup(db, user));
    } catch {
      return Response.json({ error: "Two-factor is already on." }, { status: 409 });
    }
  }

  if (body.action === "enable") {
    const recoveryCodes = await confirmTotpSetup(db, user.id, code);
    if (!recoveryCodes) {
      return Response.json(
        { error: "That code is not right. Check that your phone's clock is set automatically." },
        { status: 400 },
      );
    }
    return Response.json({ enabled: true, recoveryCodes });
  }

  if (body.action === "recovery") {
    if (!(await passwordMatches(db, user.id, body.password))) {
      return Response.json(WRONG_PASSWORD, { status: 403 });
    }
    if (!(await totpRow(db, user.id))?.enabled_at) {
      return Response.json({ error: "Turn two-factor on first." }, { status: 400 });
    }
    return Response.json({ recoveryCodes: await replaceRecoveryCodes(db, user.id) });
  }

  if (body.action === "disable") {
    if (!(await passwordMatches(db, user.id, body.password))) {
      return Response.json(WRONG_PASSWORD, { status: 403 });
    }
    // A stolen session plus a guessed password is not enough to turn it off.
    if (!(await checkSecondFactor(db, user.id, code))) {
      return Response.json({ error: "Enter a code from your authenticator, or a recovery code." }, { status: 400 });
    }
    await disableTwoFactor(db, user.id);
    return Response.json({ enabled: false });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
