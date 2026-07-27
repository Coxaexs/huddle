/**
 * Accounts and sessions for Huddle.
 *
 * Passwords are hashed with PBKDF2-SHA256 through WebCrypto (Workers has no
 * bcrypt/argon2). Session cookies carry a random token; only its SHA-256 hash
 * is stored, so a leaked database cannot be replayed as a login.
 */

import { bindings } from "./storage";
import { ensureSchema } from "./schema";
import type { PublicUser } from "./users";

export { AVATAR_COLORS } from "./users";
export type { PublicUser } from "./users";

export const SESSION_COOKIE = "huddle_session";
export const SESSION_TTL_DAYS = 90;
const PBKDF2_ITERATIONS = 150_000;

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  avatar_url?: string | null;
  color: string;
  is_admin: number;
  created_at: string;
  last_seen_at: string;
  status?: string | null;
  custom_status?: string | null;
}

export function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatar: user.avatar,
    avatarUrl: user.avatar_url || null,
    color: user.color,
    isAdmin: Boolean(user.is_admin),
  };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;
  const candidate = await pbkdf2(
    password,
    fromHex(salt),
    Number(iterations) || PBKDF2_ITERATIONS,
  );
  return timingSafeEqual(candidate, hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Huddle is mounted at /hangout behind nginx, so the cookie is scoped there and
 * marked Secure whenever the original request came in over HTTPS.
 */
export function sessionCookie(request: Request, token: string): string {
  const secure = isSecure(request) ? "; Secure" : "";
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/hangout; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = isSecure(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/hangout; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function isSecure(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}

export async function createSession(
  db: D1Database,
  userId: string,
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await sha256(token), userId, now.toISOString(), expires.toISOString())
    .run();
  return token;
}

export async function destroySession(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

/** Resolves the signed-in user for a request, or null when signed out. */
export async function currentUser(request: Request): Promise<User | null> {
  const db = bindings().DB;
  if (!db) return null;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar, u.avatar_url, u.color,
              u.is_admin, u.created_at, u.last_seen_at, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .bind(await sha256(token))
    .first<User & { expires_at: string }>();
  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(db, token);
    return null;
  }
  return row;
}

export async function touchUser(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("UPDATE users SET last_seen_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), userId)
    .run();
}

export function unauthorized(): Response {
  return Response.json({ error: "Sign in to continue." }, { status: 401 });
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{2,24}$/;

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return "Usernames are 2–24 characters and can use letters, numbers, dots, dashes and underscores.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Passwords need at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

/** Invite codes are short, unambiguous and case-insensitive. */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}
