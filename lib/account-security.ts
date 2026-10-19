/**
 * Account security beyond the password: the list of signed-in devices, a
 * second factor (TOTP authenticator apps, with one-time recovery codes) and
 * passkeys.
 *
 * Sign-in with two-factor turned on is two requests. The password (or a reset
 * link) earns a short-lived login ticket instead of a session; the ticket and
 * a code, a recovery code or a passkey earn the session. A passkey on its own
 * also signs in, since it already proves both "something you have" and, with
 * user verification, "something you know or are".
 */
import { sha256, SESSION_ID_LENGTH, verifyPassword, type User } from "./auth";
import { describeUserAgent, userAgentParts } from "./user-agent";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

let ready: Promise<void> | null = null;

export function ensureSecurityTables(db: D1Database): Promise<void> {
  ready ??= db
    .batch([
      // One authenticator per account. `enabled_at` stays NULL until the first
      // code is confirmed, so an abandoned setup never locks anyone out.
      // `last_step` is the newest 30-second step used, so a code works once.
      db.prepare(`CREATE TABLE IF NOT EXISTS user_totp (
          user_id TEXT PRIMARY KEY,
          secret TEXT NOT NULL,
          enabled_at TEXT,
          last_step INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS user_recovery_codes (
          user_id TEXT NOT NULL,
          code_hash TEXT NOT NULL,
          used_at TEXT,
          PRIMARY KEY (user_id, code_hash)
        )`),
      // `id` is the credential id (base64url); `public_key` the COSE key, also
      // base64url. `rp_id` is the host it was made on: a passkey made on one
      // domain only works there.
      db.prepare(`CREATE TABLE IF NOT EXISTS passkeys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          transports TEXT NOT NULL DEFAULT '[]',
          name TEXT NOT NULL,
          rp_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_used_at TEXT
        )`),
      db.prepare("CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys(user_id)"),
      // WebAuthn challenges, each good for one ceremony within five minutes.
      db.prepare(`CREATE TABLE IF NOT EXISTS auth_challenges (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          user_id TEXT,
          challenge TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        )`),
      // A password that was right, waiting for its second factor.
      db.prepare(`CREATE TABLE IF NOT EXISTS login_tickets (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0
        )`),
      // A desktop app asking the system browser to do its passkey sign-in.
      // `user_id` is filled in once the browser's passkey checks out.
      db.prepare(`CREATE TABLE IF NOT EXISTS passkey_handoffs (
          id TEXT PRIMARY KEY,
          secret_hash TEXT NOT NULL,
          code TEXT NOT NULL,
          user_id TEXT,
          expires_at INTEGER NOT NULL
        )`),
      // The same for adding a passkey: the app checked the password and made
      // the options; the browser makes the key; `done` tells the app.
      db.prepare(`CREATE TABLE IF NOT EXISTS passkey_setup_handoffs (
          id TEXT PRIMARY KEY,
          secret_hash TEXT NOT NULL,
          code TEXT NOT NULL,
          user_id TEXT NOT NULL,
          options TEXT NOT NULL,
          challenge_id TEXT NOT NULL,
          name TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          expires_at INTEGER NOT NULL
        )`),
    ])
    .then(() => undefined)
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

/** Re-checks the account password before a security change. */
export async function passwordMatches(db: D1Database, userId: string, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || !password) return false;
  const row = await db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .bind(userId)
    .first<{ password_hash: string }>();
  return Boolean(row && (await verifyPassword(password, row.password_hash)));
}

export const WRONG_PASSWORD = { error: "Your password is not right." } as const;

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30-second steps)
// ---------------------------------------------------------------------------

export const TOTP_STEP_SECONDS = 30;

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export async function totpCode(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counter = new Uint8Array(8);
  let rest = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = rest & 255;
    rest = Math.floor(rest / 256);
  }
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1] & 15;
  const number =
    ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(number % 1_000_000).padStart(6, "0");
}

/**
 * The step a code belongs to, or null. One step either side is allowed for a
 * clock that is a little off; a step at or before `lastStep` is refused, so a
 * code that was already used (or seen over a shoulder) does not work again.
 */
export async function matchTotp(
  secret: string,
  code: string,
  lastStep = 0,
  now = Date.now(),
): Promise<number | null> {
  const digits = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const current = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastStep) continue;
    if ((await totpCode(secret, step)) === digits) return step;
  }
  return null;
}

/** The link authenticator apps read from the QR code. */
export function otpauthUri(secret: string, account: string, issuer = "Hoffle"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params}`;
}

// ---------------------------------------------------------------------------
// Two-factor state
// ---------------------------------------------------------------------------

export interface TotpRow {
  user_id: string;
  secret: string;
  enabled_at: string | null;
  last_step: number;
}

export async function totpRow(db: D1Database, userId: string): Promise<TotpRow | null> {
  await ensureSecurityTables(db);
  return db
    .prepare("SELECT user_id, secret, enabled_at, last_step FROM user_totp WHERE user_id = ?")
    .bind(userId)
    .first<TotpRow>();
}

export async function twoFactorEnabled(db: D1Database, userId: string): Promise<boolean> {
  return Boolean((await totpRow(db, userId))?.enabled_at);
}

/** Starts (or restarts) setting up an authenticator; nothing changes until it is confirmed. */
export async function beginTotpSetup(db: D1Database, user: User): Promise<{ secret: string; uri: string }> {
  await ensureSecurityTables(db);
  const secret = newTotpSecret();
  await db
    .prepare(
      `INSERT INTO user_totp (user_id, secret, enabled_at, last_step, created_at) VALUES (?, ?, NULL, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, enabled_at = NULL, last_step = 0,
         created_at = excluded.created_at
       WHERE user_totp.enabled_at IS NULL`,
    )
    .bind(user.id, secret, new Date().toISOString())
    .run();
  const row = await totpRow(db, user.id);
  if (row?.enabled_at) throw new Error("Two-factor is already on.");
  return { secret, uri: otpauthUri(secret, user.username) };
}

/** Confirms setup with a first code; returns the recovery codes, shown once. */
export async function confirmTotpSetup(db: D1Database, userId: string, code: string): Promise<string[] | null> {
  const row = await totpRow(db, userId);
  if (!row || row.enabled_at) return null;
  const step = await matchTotp(row.secret, code, row.last_step);
  if (step === null) return null;
  await db
    .prepare("UPDATE user_totp SET enabled_at = ?, last_step = ? WHERE user_id = ?")
    .bind(new Date().toISOString(), step, userId)
    .run();
  return replaceRecoveryCodes(db, userId);
}

export async function disableTwoFactor(db: D1Database, userId: string): Promise<void> {
  await ensureSecurityTables(db);
  await db.batch([
    db.prepare("DELETE FROM user_totp WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_recovery_codes WHERE user_id = ?").bind(userId),
  ]);
}

const RECOVERY_CODE_COUNT = 10;

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z2-7]/g, "");
}

/** Ten fresh recovery codes ("abcd-efgh"); any earlier ones stop working. */
export async function replaceRecoveryCodes(db: D1Database, userId: string): Promise<string[]> {
  await ensureSecurityTables(db);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = base32Encode(crypto.getRandomValues(new Uint8Array(5))).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
  const hashes = await Promise.all(codes.map((code) => sha256(normalizeRecoveryCode(code))));
  await db.batch([
    db.prepare("DELETE FROM user_recovery_codes WHERE user_id = ?").bind(userId),
    ...hashes.map((hash) =>
      db.prepare("INSERT INTO user_recovery_codes (user_id, code_hash) VALUES (?, ?)").bind(userId, hash),
    ),
  ]);
  return codes;
}

export async function recoveryCodesLeft(db: D1Database, userId: string): Promise<number> {
  await ensureSecurityTables(db);
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id = ? AND used_at IS NULL")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Checks a second factor: a current authenticator code, or an unused recovery
 * code (which is then spent). True when it was good.
 */
export async function checkSecondFactor(db: D1Database, userId: string, code: string): Promise<boolean> {
  const row = await totpRow(db, userId);
  if (!row?.enabled_at) return false;
  const step = await matchTotp(row.secret, code, row.last_step);
  if (step !== null) {
    // Only the request that moves last_step forward wins, so two sign-ins
    // racing with the same code cannot both get in.
    const moved = await db
      .prepare("UPDATE user_totp SET last_step = ? WHERE user_id = ? AND last_step < ?")
      .bind(step, userId, step)
      .run();
    return (moved.meta.changes ?? 0) > 0;
  }
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 8) return false;
  const spent = await db
    .prepare(
      "UPDATE user_recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
    )
    .bind(new Date().toISOString(), userId, await sha256(normalized))
    .run();
  return (spent.meta.changes ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Login tickets: a right password waiting for its second factor
// ---------------------------------------------------------------------------

const TICKET_MS = 10 * 60_000;
const TICKET_ATTEMPTS = 5;

export async function createLoginTicket(db: D1Database, userId: string): Promise<string> {
  await ensureSecurityTables(db);
  const token = randomToken();
  await db.batch([
    db.prepare("DELETE FROM login_tickets WHERE expires_at < ?").bind(Date.now()),
    db
      .prepare("INSERT INTO login_tickets (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), userId, Date.now() + TICKET_MS),
  ]);
  return token;
}

/**
 * The user a ticket belongs to, counting one attempt against it. A ticket
 * with five wrong tries, or past ten minutes, is gone: the password again.
 */
export async function useLoginTicket(db: D1Database, ticket: string): Promise<string | null> {
  await ensureSecurityTables(db);
  const row = await db
    .prepare(
      `UPDATE login_tickets SET attempts = attempts + 1
        WHERE token_hash = ? AND expires_at > ? AND attempts < ?
        RETURNING user_id`,
    )
    .bind(await sha256(ticket), Date.now(), TICKET_ATTEMPTS)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function dropLoginTicket(db: D1Database, ticket: string): Promise<void> {
  await db.prepare("DELETE FROM login_tickets WHERE token_hash = ?").bind(await sha256(ticket)).run();
}

/** What the client needs to ask for the second factor. */
export async function secondFactorPrompt(db: D1Database, userId: string) {
  return {
    twoFactor: {
      ticket: await createLoginTicket(db, userId),
      passkey: (await passkeyCount(db, userId)) > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// WebAuthn challenges and passkeys
// ---------------------------------------------------------------------------

const CHALLENGE_MS = 5 * 60_000;

export type ChallengeKind = "register" | "login" | "second-factor";

export async function saveChallenge(
  db: D1Database,
  kind: ChallengeKind,
  userId: string | null,
  challenge: string,
): Promise<string> {
  await ensureSecurityTables(db);
  const id = randomToken(18);
  await db.batch([
    db.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(Date.now()),
    db
      .prepare("INSERT INTO auth_challenges (id, kind, user_id, challenge, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, kind, userId, challenge, Date.now() + CHALLENGE_MS),
  ]);
  return id;
}

/** Takes a challenge out (it works once); null when unknown, expired or of another kind. */
export async function takeChallenge(
  db: D1Database,
  id: string,
  kind: ChallengeKind,
): Promise<{ challenge: string; userId: string | null } | null> {
  await ensureSecurityTables(db);
  const row = await db
    .prepare("DELETE FROM auth_challenges WHERE id = ? RETURNING kind, user_id, challenge, expires_at")
    .bind(id)
    .first<{ kind: string; user_id: string | null; challenge: string; expires_at: number }>();
  if (!row || row.kind !== kind || row.expires_at < Date.now()) return null;
  return { challenge: row.challenge, userId: row.user_id };
}

// ---------------------------------------------------------------------------
// Passkey hand-off: the desktop apps' web views cannot reach the Mac's (or
// Linux's) passkeys, so the app opens the sign-in in the system browser and
// waits there for it to finish. The app holds a secret only it knows; the
// browser only ever sees the hand-off id and the short code shown in both.
// ---------------------------------------------------------------------------

const HANDOFF_MS = 5 * 60_000;
const HANDOFF_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function handoffCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => HANDOFF_CODE_LETTERS[byte % 32]).join("");
}

export async function startPasskeyHandoff(db: D1Database): Promise<{ id: string; secret: string; code: string }> {
  await ensureSecurityTables(db);
  const id = randomToken(18);
  const secret = randomToken(32);
  const code = handoffCode();
  await db.batch([
    db.prepare("DELETE FROM passkey_handoffs WHERE expires_at < ?").bind(Date.now()),
    db
      .prepare("INSERT INTO passkey_handoffs (id, secret_hash, code, user_id, expires_at) VALUES (?, ?, ?, NULL, ?)")
      .bind(id, await sha256(secret), code, Date.now() + HANDOFF_MS),
  ]);
  return { id, secret, code };
}

export interface PasskeySetupHandoff {
  code: string;
  userId: string;
  options: string;
  challengeId: string;
  name: string;
}

export async function startPasskeySetupHandoff(
  db: D1Database,
  setup: Omit<PasskeySetupHandoff, "code">,
): Promise<{ id: string; secret: string; code: string }> {
  await ensureSecurityTables(db);
  const id = randomToken(18);
  const secret = randomToken(32);
  const code = handoffCode();
  await db.batch([
    db.prepare("DELETE FROM passkey_setup_handoffs WHERE expires_at < ?").bind(Date.now()),
    db
      .prepare(
        `INSERT INTO passkey_setup_handoffs (id, secret_hash, code, user_id, options, challenge_id, name, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, await sha256(secret), code, setup.userId, setup.options, setup.challengeId, setup.name, Date.now() + HANDOFF_MS),
  ]);
  return { id, secret, code };
}

/** A setup hand-off the browser has yet to finish; null once done or expired. */
export async function passkeySetupHandoff(db: D1Database, id: string): Promise<PasskeySetupHandoff | null> {
  await ensureSecurityTables(db);
  const row = await db
    .prepare(
      `SELECT code, user_id, options, challenge_id, name FROM passkey_setup_handoffs
       WHERE id = ? AND done = 0 AND expires_at >= ?`,
    )
    .bind(id, Date.now())
    .first<{ code: string; user_id: string; options: string; challenge_id: string; name: string }>();
  return row
    ? { code: row.code, userId: row.user_id, options: row.options, challengeId: row.challenge_id, name: row.name }
    : null;
}

export async function finishPasskeySetupHandoff(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE passkey_setup_handoffs SET done = 1 WHERE id = ?").bind(id).run();
}

/** The app asking whether the browser added its passkey: "done" once (it is gone after), "pending", or null. */
export async function pollPasskeySetupHandoff(
  db: D1Database,
  id: string,
  secret: string,
  userId: string,
): Promise<"done" | "pending" | null> {
  await ensureSecurityTables(db);
  const secretHash = await sha256(secret);
  const row = await db
    .prepare("SELECT done, expires_at FROM passkey_setup_handoffs WHERE id = ? AND secret_hash = ? AND user_id = ?")
    .bind(id, secretHash, userId)
    .first<{ done: number; expires_at: number }>();
  if (!row || (!row.done && row.expires_at < Date.now())) return null;
  if (!row.done) return "pending";
  await db.prepare("DELETE FROM passkey_setup_handoffs WHERE id = ?").bind(id).run();
  return "done";
}

/** The code a waiting hand-off shows, for the browser page; null once used up or expired. */
export async function passkeyHandoffCode(db: D1Database, id: string): Promise<string | null> {
  await ensureSecurityTables(db);
  const row = await db
    .prepare("SELECT code FROM passkey_handoffs WHERE id = ? AND user_id IS NULL AND expires_at >= ?")
    .bind(id, Date.now())
    .first<{ code: string }>();
  return row?.code ?? null;
}

/** The browser's passkey checked out: the waiting app may now sign in as this user. */
export async function approvePasskeyHandoff(db: D1Database, id: string, userId: string): Promise<boolean> {
  await ensureSecurityTables(db);
  const result = await db
    .prepare("UPDATE passkey_handoffs SET user_id = ? WHERE id = ? AND user_id IS NULL AND expires_at >= ?")
    .bind(userId, id, Date.now())
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * The app asking whether its hand-off is done: the user id once (the hand-off
 * is gone after), "pending" while it waits, null when unknown or expired.
 */
export async function pollPasskeyHandoff(db: D1Database, id: string, secret: string): Promise<string | "pending" | null> {
  await ensureSecurityTables(db);
  const secretHash = await sha256(secret);
  const row = await db
    .prepare("SELECT user_id, expires_at FROM passkey_handoffs WHERE id = ? AND secret_hash = ?")
    .bind(id, secretHash)
    .first<{ user_id: string | null; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  if (!row.user_id) return "pending";
  const taken = await db
    .prepare("DELETE FROM passkey_handoffs WHERE id = ? AND secret_hash = ? RETURNING user_id")
    .bind(id, secretHash)
    .first<{ user_id: string | null }>();
  return taken?.user_id ?? null;
}

/**
 * The relying party a WebAuthn ceremony runs for: the host the browser is on.
 * The browser's Origin must be that same host, so a passkey made on
 * chat.example.com is checked against chat.example.com and nothing else.
 */
export function relyingParty(request: Request): { rpID: string; origin: string } | null {
  const host = (request.headers.get("host") || new URL(request.url).host).split(":")[0].toLowerCase();
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).hostname.toLowerCase() !== host) return null;
  } catch {
    return null;
  }
  return { rpID: host, origin };
}

export interface PasskeyRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string;
  name: string;
  rp_id: string;
  created_at: string;
  last_used_at: string | null;
}

export async function passkeysFor(db: D1Database, userId: string): Promise<PasskeyRow[]> {
  await ensureSecurityTables(db);
  const rows = await db
    .prepare("SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at")
    .bind(userId)
    .all<PasskeyRow>();
  return rows.results ?? [];
}

export async function passkeyCount(db: D1Database, userId: string): Promise<number> {
  await ensureSecurityTables(db);
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?")
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export function parseTransports(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Signed-in devices
// ---------------------------------------------------------------------------

export interface SessionInfo {
  id: string;
  device: string;
  /** The same, in parts for the interface to phrase: see userAgentParts. */
  browser: string;
  os: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  current: boolean;
}

export async function listSessions(
  db: D1Database,
  userId: string,
  currentId: string | null,
): Promise<SessionInfo[]> {
  const rows = await db
    .prepare(
      `SELECT substr(token_hash, 1, ${SESSION_ID_LENGTH}) AS id, user_agent, ip, created_at, last_used_at
         FROM sessions WHERE user_id = ? AND expires_at > ?
        ORDER BY COALESCE(last_used_at, created_at) DESC`,
    )
    .bind(userId, new Date().toISOString())
    .all<{ id: string; user_agent: string | null; ip: string | null; created_at: string; last_used_at: string | null }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    device: describeUserAgent(row.user_agent),
    ...userAgentParts(row.user_agent),
    ip: row.ip,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    current: row.id === currentId,
  }));
}

/** Signs one session out; true when there was one. */
export async function revokeSession(db: D1Database, userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f]{16}$/.test(id)) return false;
  const result = await db
    .prepare(`DELETE FROM sessions WHERE user_id = ? AND substr(token_hash, 1, ${SESSION_ID_LENGTH}) = ?`)
    .bind(userId, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
