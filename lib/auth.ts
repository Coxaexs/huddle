/**
 * Accounts and sessions for Huddle.
 *
 * Passwords are hashed with PBKDF2-SHA256 through WebCrypto (Workers has no
 * bcrypt/argon2). Session cookies carry a random token; only its SHA-256 hash
 * is stored, so a leaked database cannot be replayed as a login.
 */

import { bindings } from "./storage";
import { activeUntil } from "./timeouts";
import { ensureSchema } from "./schema";
import {
  isSafeProfileImage,
  normalizePrideBadges,
  normalizeSocialLinks,
  statusSeenBy,
  type Member,
  type PublicUser,
  type SpotifyActivity,
} from "./users";

export { AVATAR_COLORS } from "./users";
export type { PublicUser } from "./users";

export const SESSION_COOKIE = "hoffle_session";
export const LEGACY_SESSION_COOKIE = "huddle_session";
export const SESSION_TTL_DAYS = 90;
const PBKDF2_ITERATIONS = 150_000;

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string;
  pronouns?: string;
  tagline?: string | null;
  pride_badges?: string | null;
  spotify_activity?: string | null;
  social_links?: string | null;
  avatar_frame?: string | null;
  color: string;
  is_admin: number;
  can_invite?: number;
  created_at: string;
  last_seen_at: string;
  status?: string | null;
  custom_status?: string | null;
  custom_css?: string | null;
  custom_theme?: string | null;
  quick_reactions?: string | null;
  hidden_emojis?: string | null;
}

const USER_COLUMN_NAMES = [
  "id", "username", "display_name", "avatar", "avatar_url", "banner_url", "bio",
  "pronouns", "tagline", "custom_status", "pride_badges", "spotify_activity",
  "social_links", "avatar_frame", "color", "is_admin", "can_invite", "status",
  "custom_css", "custom_theme", "quick_reactions", "hidden_emojis", "created_at",
  "last_seen_at",
] as const;

/** Every column the user serializers read, for `SELECT ${userColumns("u")} …`. */
export function userColumns(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return USER_COLUMN_NAMES.map((column) => `${prefix}${column}`).join(", ");
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringList(value: string | null | undefined): string[] | undefined {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : undefined;
}

function spotifyActivity(value: string | null | undefined): SpotifyActivity | null {
  const parsed = parseJson(value) as Partial<SpotifyActivity> | null;
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.song !== "string" || typeof parsed.artist !== "string") return null;
  return {
    song: parsed.song,
    artist: parsed.artist,
    ...(isSafeProfileImage(parsed.albumArt) ? { albumArt: parsed.albumArt } : {}),
    ...(typeof parsed.isPlaying === "boolean" ? { isPlaying: parsed.isPlaying } : {}),
  };
}

/** The profile everyone can see, shared by publicUser and memberFromRow. */
function profileFields(user: User) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatar: user.avatar,
    avatarUrl: isSafeProfileImage(user.avatar_url) ? user.avatar_url! : null,
    bannerUrl: isSafeProfileImage(user.banner_url, true) ? user.banner_url! : null,
    bio: user.bio || "",
    pronouns: user.pronouns || "",
    tagline: user.tagline || "",
    customStatus: user.custom_status || null,
    prideBadges: normalizePrideBadges(parseJson(user.pride_badges)),
    spotifyActivity: spotifyActivity(user.spotify_activity),
    socialLinks: normalizeSocialLinks(parseJson(user.social_links)),
    avatarFrame: user.avatar_frame || "none",
    color: user.color,
    customCss: user.custom_css || null,
    customTheme: user.custom_theme || null,
  };
}

/** The signed-in user's own account, including their private preferences. */
export function publicUser(user: User): PublicUser {
  return {
    ...profileFields(user),
    isAdmin: Boolean(user.is_admin),
    canInvite: Boolean(user.is_admin || user.can_invite),
    quickReactions: stringList(user.quick_reactions),
    hiddenEmojis: stringList(user.hidden_emojis),
  };
}

/** A server_members row joined onto its user, as the member list reads it. */
export interface MemberRow extends User {
  nickname?: string | null;
  timeout_until?: string | null;
  joined_at?: string | null;
  invite_code?: string | null;
  invite_creator_id?: string | null;
  invite_creator_name?: string | null;
  invite_creator_username?: string | null;
}

/**
 * Someone as another member sees them in a server. A per-server nickname
 * replaces displayName (the account-wide name moves to globalName), and an
 * invisible status is masked unless the viewer is that person.
 */
export function memberFromRow(
  row: MemberRow,
  viewerId: string,
  roleIds: Record<string, string[]> = {},
): Member {
  const profile = profileFields(row);
  const nickname = row.nickname?.trim() || null;
  return {
    ...profile,
    displayName: nickname || profile.displayName,
    globalName: profile.displayName,
    nickname,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    isAdmin: Boolean(row.is_admin),
    canInvite: Boolean(row.is_admin || row.can_invite),
    status: statusSeenBy(row.status, row.id === viewerId),
    timeoutUntil: activeUntil(row.timeout_until),
    roleIds,
    joinedAt: row.joined_at || null,
    joinedVia: row.invite_code
      ? {
          code: row.invite_code,
          createdById: row.invite_creator_id || null,
          creatorName: row.invite_creator_name || null,
          creatorUsername: row.invite_creator_username || null,
        }
      : null,
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
  * Hoffle can be mounted at /hangout behind nginx or at root /, so the cookie is scoped
  * accordingly and marked Secure whenever the original request came in over HTTPS.
  */
export function sessionCookie(request: Request, token: string): string {
  const secure = isSecure(request) ? "; Secure" : "";
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  const url = new URL(request.url);
  const path = url.pathname.startsWith("/hangout") ? "/hangout" : "/";
  return `${SESSION_COOKIE}=${token}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = isSecure(request) ? "; Secure" : "";
  const url = new URL(request.url);
  const path = url.pathname.startsWith("/hangout") ? "/hangout" : "/";
  return `${SESSION_COOKIE}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
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
  const token = readCookie(request, SESSION_COOKIE) || readCookie(request, LEGACY_SESSION_COOKIE);
  if (!token) return null;

  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT ${userColumns("u")}, s.expires_at
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

/**
 * Checks whether a user has permission to create invite codes.
 * Only the first created user (owner/admin) and users selected by that person can create invites.
 */
export async function canUserCreateInvites(
  db: D1Database,
  user: User,
): Promise<boolean> {
  if (Boolean(user.is_admin) || Boolean(user.can_invite)) return true;
  const firstUser = await db
    .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    .first<{ id: string }>();
  return Boolean(firstUser && firstUser.id === user.id);
}

/**
 * Checks whether a user is the first created user (the instance owner).
 * Only this user has the authority to grant or revoke invite creation permissions for others.
 */
export async function isFirstUserOrOwner(
  db: D1Database,
  user: User,
): Promise<boolean> {
  if (Boolean(user.is_admin)) return true;
  const firstUser = await db
    .prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    .first<{ id: string }>();
  return Boolean(firstUser && firstUser.id === user.id);
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
