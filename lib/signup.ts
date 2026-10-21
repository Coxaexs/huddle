/**
 * Open signup: when it is on, "Create account" works without an invite code.
 *
 * It is a switch an instance admin flips from /admin, stored in the meta table
 * (the same place the side-feature kill switches live). It is off until
 * someone turns it on, and turning it off puts invite-only signup straight
 * back. Invite codes keep working either way: a code someone brings is still
 * redeemed, credited to whoever made it, and counted.
 */

import { clientIp } from "./rate-limit";
import { bindings } from "./storage";

const OPEN_KEY = "open_signup";
const OPEN_SERVER_KEY = "open_signup_server";

export interface SignupSettings {
  open: boolean;
  /** Server every new account joins on arrival (open signup or invite), or null for none. */
  serverId: string | null;
}

async function metaValue(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function getSignupSettings(db: D1Database): Promise<SignupSettings> {
  const [open, serverId] = await Promise.all([
    metaValue(db, OPEN_KEY),
    metaValue(db, OPEN_SERVER_KEY),
  ]);
  return { open: open === "1", serverId: serverId || null };
}

export async function setSignupSettings(
  db: D1Database,
  settings: SignupSettings,
): Promise<void> {
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").bind(OPEN_KEY, settings.open ? "1" : "0"),
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").bind(OPEN_SERVER_KEY, settings.serverId ?? ""),
  ]);
}

/** Open-signup accounts one address may make per day, over and above the request rate limit. */
export const OPEN_SIGNUPS_PER_ADDRESS_PER_DAY = 5;

/**
 * Salted hash of where a request came from. IPv6 addresses are cut to their
 * /64, since one household gets a whole /64. Null when the address is unknown,
 * so a misconfigured proxy cannot lump every signup into one bucket.
 */
export async function signupAddressHash(request: Request): Promise<string | null> {
  const ip = clientIp(request);
  if (ip === "unknown") return null;
  const address = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  const env = bindings();
  const salt = env.IP_HASH_SALT?.trim() || env.BOT_TOKEN?.trim() || "hoffle";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${salt}|${address}`),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** The public Turnstile site key, only when the secret is set too. */
export function turnstileSiteKey(): string | null {
  const env = bindings();
  const site = env.TURNSTILE_SITE_KEY?.trim();
  return site && env.TURNSTILE_SECRET_KEY?.trim() ? site : null;
}

/** True when Turnstile is not configured, or the visitor's token checks out. */
export async function verifyTurnstile(
  token: unknown,
  request: Request,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const secret = bindings().TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !turnstileSiteKey()) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  const ip = clientIp(request);
  if (ip !== "unknown") form.set("remoteip", ip);
  try {
    const response = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    // Failing closed: if the check cannot run, nobody gets in this way.
    return false;
  }
}
