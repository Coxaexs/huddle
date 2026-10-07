/**
 * Resume tickets let a browser keep its hub connection id across a server
 * restart. The id names its voice seat and its LiveKit identity, so keeping it
 * means a deploy does not reset the call timer or rejoin the media server.
 *
 * A ticket is an HMAC over the user and connection id, so it is only good for
 * the user it was issued to and cannot be forged for someone else's seat.
 */

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function issueResumeTicket(
  secret: string,
  userId: string,
  connectionId: string,
): Promise<string> {
  const key = await importKey(secret);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(`${userId}|${connectionId}`)));
}

export async function verifyResumeTicket(
  secret: string,
  userId: string,
  connectionId: string,
  ticket: string,
): Promise<boolean> {
  if (!ticket || !connectionId) return false;
  const expected = await issueResumeTicket(secret, userId, connectionId);
  if (expected.length !== ticket.length) return false;
  // Constant time, so the comparison does not leak how much of a guess matched.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ ticket.charCodeAt(i);
  return diff === 0;
}

/**
 * The call clock a resumed seat may carry over: in the past, and no older than
 * a day, so a client cannot claim an absurd duration.
 */
export function resumedJoinedAt(since: unknown, now: number): number | null {
  if (typeof since !== "number" || !Number.isFinite(since)) return null;
  if (since > now || since < now - 24 * 60 * 60 * 1000) return null;
  return since;
}
