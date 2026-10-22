/**
 * Accounts and sessions for Huddle.
 *
 * Passwords are hashed with PBKDF2-SHA256 through WebCrypto (Workers has no
 * bcrypt/argon2). Session cookies carry a random token; only its SHA-256 hash
 * is stored, so a leaked database cannot be replayed as a login.
 */

import { normalizeShowcase } from "./achievement-defs";
import { clientIp } from "./rate-limit";
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
  type ProfileActivity,
  type SpotifyActivity,
  normalizeProfileActivity,
  normalizeProfileStyle,
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
  achievement_showcase?: string | null;
  spotify_activity?: string | null;
  activity?: string | null;
  lastfm_username?: string | null;
  social_links?: string | null;
  avatar_frame?: string | null;
  profile_effect?: string | null;
  nameplate?: string | null;
  profile_frame?: string | null;
  profile_style?: string | null;
  disabled_modules?: string | null;
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
  email?: string | null;
  email_prompt_skipped?: number;
  /** When an instance admin suspended the account; null while it is in good standing. */
  suspended_at?: string | null;
  /** "first", "invite" or "open"; null on accounts older than the column. */
  signup_source?: string | null;
}

const USER_COLUMN_NAMES = [
  "id", "username", "display_name", "avatar", "avatar_url", "banner_url", "bio",
  "pronouns", "tagline", "custom_status", "pride_badges", "achievement_showcase", "spotify_activity", "activity", "lastfm_username",
  "social_links", "avatar_frame", "profile_effect", "nameplate", "profile_frame", "profile_style", "color", "is_admin", "can_invite", "status",
  "custom_css", "custom_theme", "quick_reactions", "hidden_emojis", "email",
  "email_prompt_skipped", "created_at", "last_seen_at", "suspended_at", "signup_source",
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
    ...(typeof parsed.url === "string" && /^https:\/\//i.test(parsed.url) ? { url: parsed.url } : {}),
    ...(typeof parsed.updatedAt === "number" ? { updatedAt: parsed.updatedAt } : {}),
  };
}

function profileActivity(value: string | null | undefined): ProfileActivity | null {
  return normalizeProfileActivity(parseJson(value));
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
    achievementShowcase: normalizeShowcase(parseJson(user.achievement_showcase)),
    spotifyActivity: spotifyActivity(user.spotify_activity),
    activity: profileActivity(user.activity),
    socialLinks: normalizeSocialLinks(parseJson(user.social_links)),
    avatarFrame: user.avatar_frame || "none",
    profileEffect: user.profile_effect || "none",
    nameplate: user.nameplate || "none",
    profileFrame: user.profile_frame || "none",
    profileStyle: normalizeProfileStyle(parseJson(user.profile_style)),
    color: user.color,
    customCss: user.custom_css || null,
    // Instance admins' profile CSS is used as written (see scopeProfileCss).
    customTheme: user.custom_theme || null,
  };
}

/** Checks whether a username belongs to a developer configured in .dev.vars / DEV_USERS. */
export function isDevUsername(username: string): boolean {
  try {
    const raw = bindings().DEV_USERS || "kiwi,flo";
    const devs = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return devs.includes(username.toLowerCase());
  } catch {
    return ["kiwi", "flo"].includes(username.toLowerCase());
  }
}

/**
 * Instance admins run /admin and /admin/media: site admins plus the account
 * ids listed in ADMIN_IDS. Ids rather than usernames, because a username can
 * be changed and then claimed by someone else.
 */
export function isInstanceAdmin(user: Pick<User, "id" | "is_admin">): boolean {
  if (user.is_admin) return true;
  let raw = "";
  try {
    const env = bindings();
    // MEDIA_ADMIN_IDS was the first name for this list.
    raw = env.ADMIN_IDS || env.MEDIA_ADMIN_IDS || "";
  } catch {
    return false;
  }
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(user.id);
}

/** Media moderation is part of instance admin. */
export const canManageMedia = isInstanceAdmin;

/** The signed-in user's own account, including their private preferences. */
export function publicUser(user: User): PublicUser {
  return {
    ...profileFields(user),
    isAdmin: Boolean(user.is_admin),
    canInvite: Boolean(user.is_admin || user.can_invite),
    isDev: isDevUsername(user.username),
    canManageMedia: canManageMedia(user),
    isInstanceAdmin: isInstanceAdmin(user),
    quickReactions: stringList(user.quick_reactions),
    hiddenEmojis: stringList(user.hidden_emojis),
    ...(user.disabled_modules !== undefined ? { disabledModules: stringList(user.disabled_modules) } : {}),
    lastfmUsername: user.lastfm_username || null,
    email: user.email || null,
    emailPromptSkipped: Boolean(user.email_prompt_skipped),
    createdAt: user.created_at,
    ...(user.signup_source === "guest" ? { isGuest: true } : {}),
  };
}

/** A server_members row joined onto its user, as the member list reads it. */
export interface MemberRow extends User {
  nickname?: string | null;
  /** server_members.avatar_url: this server's picture, when the member set one. */
  server_avatar_url?: string | null;
  timeout_until?: string | null;
  joined_at?: string | null;
  invite_code?: string | null;
  invite_creator_id?: string | null;
  invite_creator_name?: string | null;
  invite_creator_username?: string | null;
}

/**
 * Someone as another member sees them in a server. A per-server nickname
 * replaces displayName (the account-wide name moves to globalName), a
 * per-server avatar replaces avatarUrl the same way, and an invisible status
 * is masked unless the viewer is that person.
 */
export function memberFromRow(
  row: MemberRow,
  viewerId: string,
  roleIds: Record<string, string[]> = {},
): Member {
  const profile = profileFields(row);
  const nickname = row.nickname?.trim() || null;
  const serverAvatarUrl = row.server_avatar_url || null;
  return {
    ...profile,
    displayName: nickname || profile.displayName,
    globalName: profile.displayName,
    nickname,
    avatarUrl: serverAvatarUrl || profile.avatarUrl,
    globalAvatarUrl: profile.avatarUrl ?? null,
    serverAvatarUrl,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    isAdmin: Boolean(row.is_admin),
    canInvite: Boolean(row.is_admin || row.can_invite),
    isDev: isDevUsername(row.username),
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

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256(value: string): Promise<string> {
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
  /** The sign-in request, so Settings → Security can say which device this is. */
  request?: Request,
): Promise<string> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, ip, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      await sha256(token),
      userId,
      now.toISOString(),
      expires.toISOString(),
      request?.headers.get("user-agent")?.slice(0, 300) ?? null,
      request ? clientIp(request) : null,
      now.toISOString(),
    )
    .run();
  return token;
}

/** How often a session's "last used" time is written: at most this often. */
const SESSION_TOUCH_MS = 10 * 60_000;

/**
 * A session's public id: the first 16 hex digits of its token hash. Enough to
 * tell sessions apart and sign one out, and useless as a cookie.
 */
export const SESSION_ID_LENGTH = 16;

/** The public id of the session a request is signed in with, if any. */
export async function currentSessionId(request: Request): Promise<string | null> {
  const token = readCookie(request, SESSION_COOKIE) || readCookie(request, LEGACY_SESSION_COOKIE);
  return token ? (await sha256(token)).slice(0, SESSION_ID_LENGTH) : null;
}

/**
 * Signs a user in: a new session and the cookie for it. Every way of signing
 * in (password, a second factor, a passkey, a reset link, signing up) ends here.
 */
export async function signedInResponse(
  db: D1Database,
  request: Request,
  user: User,
  extra: Record<string, unknown> = {},
): Promise<Response> {
  await touchUser(db, user.id);
  const token = await createSession(db, user.id, request);
  return Response.json(
    { user: publicUser(user), ...extra },
    { headers: { "Set-Cookie": sessionCookie(request, token) } },
  );
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
  const tokenHash = await sha256(token);
  const row = await db
    .prepare(
      `SELECT ${userColumns("u")}, s.expires_at, s.last_used_at AS session_used_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<User & { expires_at: string; session_used_at: string | null }>();
  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(db, token);
    return null;
  }
  // A suspended account is treated as signed out everywhere, sockets included.
  if (row.suspended_at) return null;
  // Throttled so a busy tab does not write on every request.
  const usedAt = row.session_used_at ? new Date(row.session_used_at).getTime() : 0;
  if (Date.now() - usedAt > SESSION_TOUCH_MS) {
    await db
      .prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?")
      .bind(new Date().toISOString(), tokenHash)
      .run();
  }
  const { expires_at: _expires, session_used_at: _used, ...user } = row;
  return user;
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lower-cases and validates an email; returns it, or an error message. */
export function normalizeEmail(raw: unknown): { email: string } | { error: string } {
  const email = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { error: "That does not look like an email address." };
  }
  return { email };
}

/** Random URL-safe token (hex), e.g. for password reset links. */
export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

/** Signs a user out everywhere except the session `keepToken` belongs to. */
export async function destroyOtherSessions(
  db: D1Database,
  userId: string,
  keepToken: string | null,
): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?")
    .bind(userId, keepToken ? await sha256(keepToken) : "")
    .run();
}

/** Invite codes are short, unambiguous and case-insensitive. */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}
