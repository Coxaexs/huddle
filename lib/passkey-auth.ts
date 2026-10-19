/**
 * Checking a passkey sign-in (a WebAuthn assertion), shared by passwordless
 * sign-in (/api/auth/passkey) and the second step after a password
 * (/api/auth/two-factor).
 */
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import {
  ensureSecurityTables,
  fromBase64Url,
  parseTransports,
  passkeysFor,
  type PasskeyRow,
} from "./account-security";

/**
 * Options for the browser's passkey prompt. With a user, only their passkeys
 * on this host are offered; without one the browser lists every passkey it
 * has for this site.
 */
export async function passkeyRequestOptions(
  db: D1Database,
  rpID: string,
  userId: string | null,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const allow = userId
    ? (await passkeysFor(db, userId))
        .filter((key) => key.rp_id === rpID)
        .map((key) => ({ id: key.id, transports: parseTransports(key.transports) }))
    : undefined;
  return generateAuthenticationOptions({ rpID, allowCredentials: allow, userVerification: "preferred" });
}

/**
 * The user a passkey assertion signs in, or null. `expectedUserId` pins it to
 * one account (the second step after a password). Passwordless sign-in asks
 * for user verification (PIN, fingerprint, face), since the passkey is then
 * the only factor.
 */
export async function verifyPasskeyAssertion(
  db: D1Database,
  rp: { rpID: string; origin: string },
  response: unknown,
  expectedChallenge: string,
  expectedUserId: string | null,
): Promise<string | null> {
  await ensureSecurityTables(db);
  const assertion = response as AuthenticationResponseJSON;
  if (!assertion || typeof assertion.id !== "string") return null;
  const key = await db
    .prepare("SELECT * FROM passkeys WHERE id = ? AND rp_id = ?")
    .bind(assertion.id, rp.rpID)
    .first<PasskeyRow>();
  if (!key || (expectedUserId && key.user_id !== expectedUserId)) return null;

  let verified;
  try {
    verified = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: !expectedUserId,
      credential: {
        id: key.id,
        publicKey: fromBase64Url(key.public_key),
        counter: key.counter,
        transports: parseTransports(key.transports),
      },
    });
  } catch {
    return null;
  }
  if (!verified.verified) return null;
  await db
    .prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?")
    .bind(verified.authenticationInfo.newCounter, new Date().toISOString(), key.id)
    .run();
  return key.user_id;
}
